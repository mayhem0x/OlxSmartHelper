/*
 * OLX Smart Helper — content script entry point.
 *
 * Pipeline: extractor → estimator → ui, re-evaluated whenever the page
 * changes. Change signals:
 *   - SPA route changes: `olxsh:locationchange` from the MAIN-world hook
 *     (pushState/replaceState), `popstate`, the Navigation API when present,
 *     bfcache `pageshow`, and a slow URL poll as a safety net
 *   - DOM changes: one MutationObserver, filtered so our own insertions never
 *     re-trigger it, debounced with a maxWait so infinite scroll still updates
 *
 * Every pass is idempotent: cards are fingerprinted (ad id + price) and
 * verdicts are diffed, so a pass over an unchanged page touches nothing.
 */
(function () {
  "use strict";

  const OLXHelper = window.OLXHelper;
  if (!OLXHelper || OLXHelper.__booted) return;
  OLXHelper.__booted = true;

  const { utils: U, extractor: X, estimator: E, store, presets: P, ui, debug, i18n: I18N } = OLXHelper;
  const t = (key, params) => I18N.t(key, params);

  const RUN_DEBOUNCE = 250;
  const RUN_MAX_WAIT = 1200;
  const URL_POLL_MS = 1500;
  // After an ad→ad SPA transition React may still show the previous ad briefly.
  const STALE_DOM_WINDOW = 4000;

  const state = {
    route: routeKey(),
    epoch: 0, // bumps on every route change; async work from older epochs is dropped
    routeAt: Date.now(),
    prevAd: { key: null, title: null },
    cardsSig: "",
    pool: [], // priced listings from the cards on screen (comparables for the ad page)
    ad: emptyAdState(),
    alive: true,
  };

  function emptyAdState() {
    return { key: null, title: null, widget: null, verdictSig: "", pendingKey: null, handlers: null, data: null };
  }

  // Hash changes (gallery #photo-3) are not navigations.
  function routeKey() {
    return location.origin + location.pathname + location.search;
  }

  /* ---------- lifecycle / extension reload safety ---------- */

  // After the extension is reloaded/updated, this orphaned script keeps running
  // but every chrome.* call throws "Extension context invalidated". Shut down.
  function contextAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function shutdown() {
    if (!state.alive) return;
    state.alive = false;
    observer.disconnect();
    clearInterval(pollTimer);
    scheduleRun.cancel();
    ui.removeWidget();
    document.querySelectorAll('[data-olxsh="pill"]').forEach((n) => n.remove());
  }

  function ensureAlive() {
    if (state.alive && !contextAlive()) shutdown();
    return state.alive;
  }

  /* ---------- debug flag ---------- */

  store.isDebug().then((v) => debug.set(v));
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.olxsh_flags) {
        debug.set(!!(changes.olxsh_flags.newValue && changes.olxsh_flags.newValue.debug));
      }
    });
  } catch (e) {
    /* ignore if unavailable */
  }

  /* ---------- main pass ---------- */

  function run() {
    if (!ensureAlive()) return;
    try {
      const type = X.pageType();
      processCards();
      if (type === "ad") {
        processAd().catch((e) => debug.warn("ad pass failed", e));
      } else if (state.ad.widget) {
        teardownAd();
      }
    } catch (e) {
      // Never break the host page.
      debug.warn("pass failed", e);
    }
  }

  // Debounced, then deferred to idle time so we never compete with React commits.
  const scheduleRun = U.debounce(
    () => {
      if ("requestIdleCallback" in window) requestIdleCallback(run, { timeout: 600 });
      else run();
    },
    RUN_DEBOUNCE,
    { maxWait: RUN_MAX_WAIT }
  );

  /* ---------- search / category cards ---------- */

  function processCards() {
    const cards = X.getCards();
    const listings = cards.map((el) => X.extractCard(el));
    state.pool = listings.filter((l) => l.priceKind === "price");

    const sig = listings.map((l) => l.sig).join("~");
    const pillsIntact = listings.every((l) => l.priceKind !== "price" || ui.hasPill(l._el));
    if (sig === state.cardsSig && pillsIntact) return;
    state.cardsSig = sig;

    if (listings.length < 2) return;
    for (const { listing, verdict } of E.analyzeAll(listings)) {
      // Unpriced cards (free / exchange / no price) get no pill.
      ui.upsertPill(listing._el, listing.priceKind === "price" ? verdict : null, listing);
    }

    if (debug.enabled && debug.throttle()) {
      debug.event("cards", {
        cards: listings.length,
        priced: state.pool.length,
        missingTitle: listings.filter((l) => !l.title).length,
        missingPrice: listings.filter((l) => l.priceKind === "none").length,
      });
    }
  }

  /* ---------- single ad page ---------- */

  async function processAd() {
    const epoch = state.epoch;
    const target = X.extractPage();
    if (!target.title) return; // not rendered yet; the observer will call us again
    const key = store.listingKey(target.url);

    // Stale-DOM guard: URL already points at the new ad, but React still shows
    // the previous one. Wait for the re-render (bounded, in case the titles
    // really are identical).
    const stale = !!state.prevAd.title && key !== state.prevAd.key && target.title === state.prevAd.title;
    // Search→ad transition: the URL is an ad but the DOM may still be the
    // search page (whose <h1> would pass for a title). Wait for ad markup.
    const notRenderedYet = !X.hasAdMarkup();
    if ((stale || notRenderedYet) && Date.now() - state.routeAt < STALE_DOM_WINDOW) {
      setTimeout(scheduleRun, 600);
      return;
    }

    const { verdict, comps } = E.analyzeTarget(target, state.pool);
    const vSig = `${target.price}|${target.currency}|${verdict.status}|${verdict.baseline}|${verdict.comparablesCount}`;

    // Same ad but a different title: we rendered from a half-updated DOM.
    if (state.ad.key === key && state.ad.widget && state.ad.title !== target.title) teardownAd();

    // Already rendered for this ad: re-mount if React dropped it, refresh data.
    if (state.ad.key === key && state.ad.widget) {
      ui.ensureWidgetMounted(state.ad.widget, target._priceEl);
      if (vSig !== state.ad.verdictSig) {
        state.ad.verdictSig = vSig;
        ui.updateAdWidget(state.ad.widget, { target, verdict, comps, offer: buildOffer(target, verdict), handlers: state.ad.handlers });
      }
      return;
    }
    if (state.ad.pendingKey === key) return;
    state.ad.pendingKey = key;

    try {
      const ctx = { url: target.url, title: target.title, price: target.price, currency: target.currency };
      const { record, change } = await store.recordPrice(key, target.price, ctx);
      const relist = await detectRelist(target, key);
      const collapsed = await store.getFlag("widgetCollapsed");
      if (epoch !== state.epoch || !state.alive) return; // navigated away mid-await

      const handlers = adHandlers(target, key, ctx);
      const data = {
        target,
        verdict,
        comps,
        anchor: target._priceEl,
        collapsed,
        offer: buildOffer(target, verdict),
        history: { change, price: record && record.price, prevPrice: record && record.prevPrice, currency: target.currency },
        relist: relist ? { title: relist.title } : null,
        meta: {
          record,
          statuses: store.STATUSES,
          onStatus: (s) => store.setStatus(key, s, ctx),
          onNote: (n) => store.setNote(key, n, ctx),
          onToggleSave: () => store.toggleSave(key, ctx),
        },
        handlers,
      };
      const widget = ui.renderAdWidget(data);
      // `data` is kept so a language switch can re-render without re-reading storage.
      state.ad = { ...emptyAdState(), key, title: target.title, widget, verdictSig: vSig, handlers, data };

      debug.event("ad", {
        title: target.title.slice(0, 60),
        price: target.price,
        sources: target.sources,
        status: verdict.status,
        comps: verdict.comparablesCount,
      });
    } finally {
      if (state.ad.pendingKey === key) state.ad.pendingKey = null;
    }
  }

  function teardownAd() {
    ui.removeWidget();
    state.ad = emptyAdState();
  }

  function adHandlers(target, key, ctx) {
    return {
      onSimilar: () => openSimilarSearch(target),
      onPresets: (anchor) =>
        ui.openPresetPopover(anchor, {
          getPresets: () => P.getAll(),
          add: (d) => P.add(d),
          update: (id, patch) => P.update(id, patch),
          remove: (id) => P.remove(id),
          setDefault: (id) => P.setDefault(id),
        }),
      onCopyDefault: async () => {
        const d = await P.getDefault();
        if (!d) return ui.toast(t("toast.noDefault"));
        await copyAndMark(d.text, t("toast.copied", { label: d.label }), key, ctx);
      },
      onCopy: (text) => copyAndMark(text, t("toast.offerCopied"), key, ctx),
      onSettings: openOptions,
      onCollapse: (collapsed) => store.setFlag("widgetCollapsed", collapsed),
    };
  }

  // Copying a message to the seller implies contact: advance the status once.
  async function copyAndMark(text, okMessage, key, ctx) {
    const ok = await U.copyText(text);
    ui.toast(ok ? okMessage : t("common.copyFailed"));
    if (!ok) return;
    const rec = await store.getRecord(key);
    if (!rec || rec.status === "not_contacted") {
      await store.setStatus(key, "contacted", ctx);
      const sel = state.ad.widget && state.ad.widget.querySelector(".olxsh-select");
      if (sel) {
        sel.value = "contacted";
        sel.closest(".olxsh-meta").dataset.status = "contacted";
      }
    }
  }

  /* ---------- negotiation template ---------- */

  // Always in the SELLER's language (the OLX domain), regardless of the UI
  // language the user picked: a Romanian seller gets a Romanian message.
  function buildOffer(target, verdict) {
    const value = E.suggestOffer(target, verdict);
    if (value == null) return null;
    const seller = I18N.sellerLocale();
    // Quote the market only when it's leverage (the ad is overpriced).
    const market = verdict.status === "high" ? U.formatPrice(verdict.baseline, verdict.currency) : null;
    const title = U.truncate(target.title, 70);
    return {
      value,
      currency: target.currency,
      askPrice: target.price,
      step: U.niceStep(target.price),
      build: (v) =>
        [
          I18N.tFor(seller, "nego.greet", { title }),
          market && I18N.tFor(seller, "nego.market", { market }),
          I18N.tFor(seller, "nego.offer", { offer: U.formatPrice(v, target.currency) }),
        ]
          .filter(Boolean)
          .join(" "),
    };
  }

  /* ---------- actions ---------- */

  function openSimilarSearch(target) {
    const query = E.modelQuery(target.title);
    if (!query) return;
    // OLX search slugs join words with "-"; the interface language comes from
    // the user's cookie, so no /uk/ prefix is needed.
    const slug = query.split(" ").map(encodeURIComponent).join("-");
    window.open(`${location.origin}/${U.region().searchPath}/q-${slug}/`, "_blank", "noopener");
  }

  // Content scripts can't call openOptionsPage(); the background worker does.
  function openOptions() {
    try {
      chrome.runtime.sendMessage({ type: "openOptions" }, () => void chrome.runtime.lastError);
    } catch (e) {
      shutdown(); // context invalidated
    }
  }

  // Soft relist heuristic: a previously seen ad with a different id but a very
  // similar title and a close price is likely the same item re-posted.
  async function detectRelist(target, currentKey) {
    try {
      const map = await store.getAll();
      if (!target.tokens.length) return null;
      for (const [rid, r] of Object.entries(map)) {
        if (rid === currentKey || !r || !r.title) continue;
        if (E.jaccard(target.tokens, U.tokenize(r.title)) < 0.7) continue;
        const priceClose =
          target.price != null && r.price != null ? Math.abs(target.price - r.price) / Math.max(r.price, 1) <= 0.15 : true;
        if (priceClose) return r;
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  /* ---------- change detection ---------- */

  function onRouteSignal() {
    if (!ensureAlive()) return;
    const key = routeKey();
    if (key === state.route) return; // replaceState for scroll restoration, hash changes…
    state.route = key;
    state.epoch++;
    state.routeAt = Date.now();
    state.prevAd = { key: state.ad.key, title: state.ad.title };
    state.cardsSig = "";
    teardownAd();
    debug.event("route", { path: location.pathname });
    scheduleRun();
  }

  // Our own insertions must never re-trigger a pass (that's the infinite loop).
  // Removals always count: React dropping our pill/widget should restore it.
  function isForeignMutation(m) {
    const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
    if (target && target.closest(X.OWN)) return false;
    if (m.type === "characterData") return true; // React reusing a node with new text
    if (m.removedNodes.length) return true;
    for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || !n.hasAttribute("data-olxsh")) return true;
    }
    return false;
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (isForeignMutation(m)) {
        scheduleRun();
        return;
      }
    }
  });

  window.addEventListener("olxsh:locationchange", onRouteSignal);
  window.addEventListener("popstate", onRouteSignal);
  window.addEventListener("pageshow", (e) => e.persisted && onRouteSignal());
  if (window.navigation && typeof window.navigation.addEventListener === "function") {
    window.navigation.addEventListener("navigatesuccess", onRouteSignal);
  }
  const pollTimer = setInterval(onRouteSignal, URL_POLL_MS);

  // Language switched (popup / options / another tab): pills re-render in
  // place (their signature includes the locale); the widget is rebuilt from
  // its last data so collapsed state, history chips and handlers survive.
  function relocalize() {
    if (!ensureAlive()) return;
    state.cardsSig = "";
    const { widget, data } = state.ad;
    if (widget && data) {
      const rebuilt = ui.renderAdWidget({ ...data, collapsed: widget.classList.contains("is-collapsed") });
      state.ad = { ...state.ad, widget: rebuilt };
    }
    scheduleRun();
  }

  function start() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    I18N.onChange(relocalize);
    scheduleRun();
  }

  // document_idle usually runs after hydration; one idle tick of margin keeps
  // our nodes out of React's hydration diff.
  // The language preference must be loaded before the first render.
  function boot() {
    I18N.ready.then(() => {
      if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 1500 });
      else setTimeout(start, 300);
    });
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
})();
