/*
 * OLX Smart Helper — UI rendering.
 * Surfaces:
 *   - a glass status pill on each search card (updated in place, never stacked)
 *   - a market widget next to the price block on a single ad page
 *   - message-preset popover + toast
 * Every root node gets `olxsh-root` (scoped design tokens + reset) and a
 * `data-olxsh` attribute so the extractor and MutationObserver ignore it.
 * All text goes through i18n `t()`; verdicts arrive as codes from the estimator.
 */
(function () {
  "use strict";

  const OLXHelper = (window.OLXHelper = window.OLXHelper || {});
  const U = OLXHelper.utils;
  const I18N = OLXHelper.i18n;
  const t = (key, params) => I18N.t(key, params);

  const verdictLabel = (v) => t(`verdict.${v.status}`);
  const verdictShort = (v) => t(`verdict.${v.status}.short`);

  /* ---------- tiny DOM helpers ---------- */

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function rootEl(tag, cls, kind) {
    const node = el(tag, `olxsh-root ${cls}`);
    node.setAttribute("data-olxsh", kind);
    return node;
  }

  const ICONS = {
    search: "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
    chat: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z",
    tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
    chevron: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
    minus: "M19 13H5v-2h14v2z",
    plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    bolt: "M7 2v11h3v9l7-12h-4l4-8z",
    close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    star: "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
    starOutline: "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    info: "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
    warn: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  };

  // Brand mark: same geometry as icons/icon.svg (128-unit grid).
  const LOGO_S = "M81.3 41.5A20 15 0 1 0 64 64A20 15 0 1 1 46.7 86.5";

  function logoMark() {
    const NS = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 128 128");
    s.setAttribute("class", "olxsh-logo");
    s.setAttribute("aria-hidden", "true");
    const bg = document.createElementNS(NS, "rect");
    for (const [k, v] of Object.entries({ x: 4, y: 4, width: 120, height: 120, rx: 30, class: "olxsh-logo-bg" })) bg.setAttribute(k, v);
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", LOGO_S);
    p.setAttribute("class", "olxsh-logo-s");
    s.append(bg, p);
    return s;
  }

  function icon(name) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "olxsh-ico");
    s.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICONS[name]);
    s.appendChild(p);
    return s;
  }

  // Buttons swallow the click so OLX's card/link handlers never fire.
  function button(cls, label, iconName, onClick, title) {
    const b = el("button", cls);
    b.type = "button";
    if (iconName) b.appendChild(icon(iconName));
    if (label) b.appendChild(el("span", null, label));
    if (title) {
      b.title = title;
      b.setAttribute("aria-label", title);
    }
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick && onClick(b, e);
    });
    return b;
  }

  function meter(key) {
    const level = key === "high" ? 3 : key === "mid" ? 2 : 1;
    const wrap = el("span", "olxsh-meter");
    wrap.setAttribute("aria-label", t("confidence.aria", { level }));
    for (let i = 1; i <= 3; i++) wrap.appendChild(el("span", `olxsh-bar${i <= level ? " is-on" : ""}`));
    return wrap;
  }

  /* ---------- card pill ---------- */

  const positioned = new WeakSet();

  // Inline style (not a class): React rewrites className on re-render but
  // leaves style properties it doesn't manage alone.
  function ensurePositioned(card) {
    if (positioned.has(card)) return;
    positioned.add(card);
    if (getComputedStyle(card).position === "static") card.style.position = "relative";
  }

  // Locale is part of the signature so a language switch re-renders in place.
  function pillSig(v) {
    return `${I18N.getActive()}|${v.status}|${v.deltaPct}|${v.comparablesCount}|${v.suspicious}|${v.great}`;
  }

  function pillTooltip(v, listing) {
    const lines = [`OLX Smart Helper — ${verdictLabel(v)}`];
    if (v.hasEstimate) {
      lines.push(t("pill.median", { price: U.formatPrice(v.baseline, v.currency), n: v.comparablesCount }));
      lines.push(t("pill.thisPrice", { price: U.formatPrice(listing.price, listing.currency), pct: U.formatPercent(v.delta) }));
    } else {
      lines.push(t("pill.noData"));
    }
    if (v.suspicious) lines.push(t("pill.suspicious"));
    return lines.join("\n");
  }

  function hasPill(card) {
    return !!card.querySelector(':scope > [data-olxsh="pill"]');
  }

  // Create or update in place; no-op when the verdict hasn't changed.
  function upsertPill(card, v, listing) {
    let pill = card.querySelector(':scope > [data-olxsh="pill"]');
    if (!v) {
      if (pill) pill.remove();
      return;
    }
    const sig = pillSig(v);
    if (pill && pill.dataset.sig === sig) return;

    ensurePositioned(card);
    if (!pill) {
      pill = rootEl("div", "olxsh-pill", "pill");
      pill.setAttribute("role", "status");
      card.appendChild(pill);
    }
    pill.dataset.sig = sig;
    pill.dataset.status = v.status;
    pill.classList.toggle("is-great", !!v.great);

    const parts = [el("span", "olxsh-dot")];
    if (v.suspicious) parts.push(icon("warn"));
    parts.push(el("span", "olxsh-pill-label", verdictShort(v)));
    if (v.deltaPct != null && v.status !== "unknown") parts.push(el("span", "olxsh-pill-delta", U.formatPercent(v.delta)));
    if (v.status !== "unknown") parts.push(meter(v.confidenceKey));
    pill.replaceChildren(...parts);
    pill.title = pillTooltip(v, listing);
  }

  /* ---------- ad page widget ---------- */

  const WIDGET_ID = "olxsh-widget";

  /*
   * data = {
   *   target, verdict, comps, anchor, collapsed,
   *   offer: { value, currency, step, build(value) → message } | null,
   *   history: { change, price, prevPrice, currency }, relist,
   *   meta: { record, statuses, onStatus, onNote, onToggleSave },
   *   handlers: { onSimilar, onPresets, onCopyDefault, onCopy(text), onSettings, onCollapse }
   * }
   */
  function renderAdWidget(data) {
    document.getElementById(WIDGET_ID)?.remove();

    const w = rootEl("section", "olxsh-widget", "widget");
    w.id = WIDGET_ID;
    w.setAttribute("aria-label", "OLX Smart Helper");
    w.dataset.status = data.verdict.status;
    w.classList.toggle("is-collapsed", !!data.collapsed);
    // Keep OLX's click/key handlers (gallery, shortcuts) out of the widget.
    for (const type of ["click", "keydown", "keyup", "keypress"]) {
      w.addEventListener(type, (e) => e.stopPropagation());
    }

    w.appendChild(widgetHeader(w, data));

    const body = el("div", "olxsh-w-body");
    body.appendChild(marketSection(data));
    const signals = signalChips(data.history, data.relist);
    if (signals) body.appendChild(signals);
    if (data.offer) body.appendChild(offerSection(data.offer, data.handlers));
    body.appendChild(actionRow(data));
    body.appendChild(compsSection(data.comps));
    if (data.meta) body.appendChild(metaSection(data.meta));
    w.appendChild(body);

    mountWidget(w, data.anchor);
    return w;
  }

  // Refresh only the data-driven sections; note input / offer state survive.
  function updateAdWidget(w, data) {
    w.dataset.status = data.verdict.status;
    const chip = w.querySelector(".olxsh-w-head-chip");
    if (chip) {
      chip.dataset.status = data.verdict.status;
      chip.lastChild.textContent = verdictShort(data.verdict);
    }
    w.querySelector(".olxsh-w-market")?.replaceWith(marketSection(data));
    w.querySelector(".olxsh-comps")?.replaceWith(compsSection(data.comps));
    const offer = w.querySelector(".olxsh-offer");
    if (offer && data.offer && !offer.dataset.touched) offer.replaceWith(offerSection(data.offer, data.handlers));
  }

  function widgetHeader(w, data) {
    const head = el("header", "olxsh-w-head");
    const brand = el("div", "olxsh-w-brand");
    brand.appendChild(logoMark());
    brand.appendChild(el("span", "olxsh-w-title", "Smart Helper"));
    const chip = el("span", "olxsh-chip olxsh-w-head-chip");
    chip.dataset.status = data.verdict.status;
    chip.appendChild(el("span", "olxsh-dot"));
    chip.appendChild(el("span", null, verdictShort(data.verdict)));
    brand.appendChild(chip);
    head.appendChild(brand);

    const tools = el("div", "olxsh-w-tools");
    tools.appendChild(button("olxsh-icon-btn", null, "tune", () => data.handlers.onSettings(), t("w.settings")));
    const collapse = button("olxsh-icon-btn olxsh-collapse", null, "chevron", () => {
      const collapsed = w.classList.toggle("is-collapsed");
      collapse.setAttribute("aria-expanded", String(!collapsed));
      data.handlers.onCollapse && data.handlers.onCollapse(collapsed);
    }, t("w.collapse"));
    collapse.setAttribute("aria-expanded", String(!data.collapsed));
    tools.appendChild(collapse);
    head.appendChild(tools);
    return head;
  }

  function priceSourceLabel(src) {
    return ["dom", "jsonld", "meta", "heuristic"].includes(src) ? t(`w.src.${src}`) : "";
  }

  function marketSection(data) {
    const { target, verdict: v } = data;
    const box = el("div", "olxsh-w-market");

    const row = el("div", "olxsh-w-price-row");
    const left = el("div", "olxsh-w-price-col");
    left.appendChild(el("div", "olxsh-eyebrow", t("w.price")));
    const price = el("div", "olxsh-w-price");
    if (target.price != null) {
      price.textContent = U.formatPrice(target.price, target.currency);
    } else {
      price.classList.add("is-muted");
      price.textContent = t(
        target.priceKind === "free" ? "w.price.free" : target.priceKind === "exchange" ? "w.price.exchange" : "w.price.none"
      );
    }
    left.appendChild(price);

    const tags = [];
    if (target.negotiable) tags.push(t("w.tag.negotiable"));
    const src = priceSourceLabel(target.sources && target.sources.price);
    if (src) tags.push(t("w.tag.source", { src }));
    if (tags.length) left.appendChild(el("div", "olxsh-w-tags", tags.join(" · ")));
    row.appendChild(left);

    if (v.status !== "unknown") {
      const chip = el("span", "olxsh-chip olxsh-chip-lg");
      chip.dataset.status = v.status;
      chip.appendChild(el("span", "olxsh-dot"));
      chip.appendChild(el("span", null, verdictLabel(v)));
      row.appendChild(chip);
    }
    box.appendChild(row);

    if (v.hasEstimate) {
      box.appendChild(gauge(v));
      const stats = el("div", "olxsh-stats");
      stats.appendChild(stat(t("w.stat.median"), U.formatPrice(v.baseline, v.currency)));
      stats.appendChild(stat(t("w.stat.delta"), U.formatPercent(v.delta), v.status));
      const conf = stat(t("w.stat.comps"), String(v.comparablesCount));
      conf.querySelector(".olxsh-stat-value").appendChild(meter(v.confidenceKey));
      stats.appendChild(conf);
      box.appendChild(stats);
      if (v.spread && v.spread.q1 !== v.spread.q3) {
        box.appendChild(
          el(
            "div",
            "olxsh-w-range",
            t("w.range", { from: U.formatPrice(v.spread.q1, v.currency), to: U.formatPrice(v.spread.q3, v.currency) })
          )
        );
      }
    } else if (target.price != null) {
      const empty = el("div", "olxsh-empty");
      empty.appendChild(icon("info"));
      empty.appendChild(el("span", null, t("w.empty", { action: t("w.action.similar") })));
      box.appendChild(empty);
    }

    // Price/negotiable/few-comparables are already shown above; only the
    // scam-risk warning needs its own banner.
    const warning = v.reasons.find((r) => r.code === "suspicious");
    if (warning) {
      const banner = el("div", "olxsh-warning");
      banner.appendChild(icon("warn"));
      banner.appendChild(el("span", null, t("reason.suspicious")));
      box.appendChild(banner);
    }
    return box;
  }

  // Position on a −40%…+40% scale with the three verdict zones.
  function gauge(v) {
    const RANGE = 0.4;
    const CFG = OLXHelper.estimator.CFG;
    const toPct = (d) => ((Math.max(-RANGE, Math.min(RANGE, d)) + RANGE) / (2 * RANGE)) * 100;

    const g = el("div", "olxsh-gauge");
    g.style.setProperty("--olxsh-g-good", `${toPct(CFG.GOOD)}%`);
    g.style.setProperty("--olxsh-g-high", `${toPct(CFG.HIGH)}%`);
    const track = el("div", "olxsh-gauge-track");
    const marker = el("div", "olxsh-gauge-marker");
    marker.dataset.status = v.status;
    marker.style.left = `${toPct(v.delta)}%`;
    track.appendChild(marker);
    track.appendChild(el("div", "olxsh-gauge-mid"));
    g.appendChild(track);

    const scale = el("div", "olxsh-gauge-scale");
    scale.appendChild(el("span", null, t("w.gauge.cheaper")));
    scale.appendChild(el("span", null, t("w.gauge.median")));
    scale.appendChild(el("span", null, t("w.gauge.pricier")));
    g.appendChild(scale);
    return g;
  }

  function stat(label, value, status) {
    const s = el("div", "olxsh-stat");
    s.appendChild(el("div", "olxsh-eyebrow", label));
    const val = el("div", "olxsh-stat-value", value);
    if (status) val.dataset.status = status;
    s.appendChild(val);
    return s;
  }

  function signalChips(ph, relist) {
    const chips = [];
    if (ph) {
      const was = ph.prevPrice != null ? ` · ${t("w.signal.was", { price: U.formatPrice(ph.prevPrice, ph.currency) })}` : "";
      if (ph.change === "drop") chips.push(["good", t("w.signal.drop") + was]);
      else if (ph.change === "rise") chips.push(["high", t("w.signal.rise") + was]);
      else if (ph.change === "new") chips.push(["unknown", t("w.signal.new")]);
    }
    if (relist) chips.push(["fair", t("w.signal.relist")]);
    if (!chips.length) return null;
    const box = el("div", "olxsh-signals");
    for (const [status, text] of chips) {
      const c = el("span", "olxsh-chip", text);
      c.dataset.status = status;
      box.appendChild(c);
    }
    return box;
  }

  // Offer stepper + live preview of the message that will be copied.
  function offerSection(offer, handlers) {
    const box = el("div", "olxsh-offer");
    let value = offer.value;

    const head = el("div", "olxsh-offer-head");
    head.appendChild(el("span", "olxsh-eyebrow", t("w.offer.title")));
    const hint = el("span", "olxsh-offer-hint");
    head.appendChild(hint);
    box.appendChild(head);

    const row = el("div", "olxsh-offer-row");
    const valueEl = el("output", "olxsh-offer-value");
    const preview = el("div", "olxsh-offer-preview");

    const paint = () => {
      valueEl.textContent = U.formatPrice(value, offer.currency);
      hint.textContent = offer.askPrice ? U.formatPercent(value / offer.askPrice - 1) : "";
      preview.textContent = offer.build(value);
    };
    const nudge = (dir) => {
      box.dataset.touched = "1";
      value = Math.max(offer.step, value + dir * offer.step);
      paint();
    };

    row.appendChild(button("olxsh-icon-btn olxsh-step", null, "minus", () => nudge(-1), t("w.offer.less")));
    row.appendChild(valueEl);
    row.appendChild(button("olxsh-icon-btn olxsh-step", null, "plus", () => nudge(1), t("w.offer.more")));
    row.appendChild(button("olxsh-btn olxsh-btn-primary", t("w.offer.copy"), "copy", () => handlers.onCopy(offer.build(value))));
    box.appendChild(row);
    box.appendChild(preview);
    paint();
    return box;
  }

  function actionRow(data) {
    const row = el("div", "olxsh-actions");
    row.appendChild(button("olxsh-btn", t("w.action.similar"), "search", () => data.handlers.onSimilar()));
    row.appendChild(button("olxsh-btn", t("w.action.presets"), "chat", (b) => data.handlers.onPresets(b)));
    row.appendChild(
      button("olxsh-btn olxsh-btn-square", null, "bolt", () => data.handlers.onCopyDefault(), t("w.action.copyDefault"))
    );
    return row;
  }

  function compsSection(comps) {
    const box = el("div", "olxsh-comps");
    const items = (comps || []).slice(0, 5).map((c) => c.listing);
    if (!items.length) {
      box.hidden = true;
      return box;
    }
    const list = el("div", "olxsh-comps-list");
    list.hidden = true;
    const toggle = button("olxsh-comps-toggle", t("w.comps", { n: items.length }), null, () => {
      list.hidden = !list.hidden;
      toggle.setAttribute("aria-expanded", String(!list.hidden));
    });
    toggle.appendChild(icon("chevron"));
    toggle.setAttribute("aria-expanded", "false");

    for (const it of items) {
      const a = el("a", "olxsh-comp");
      a.href = it.url || "#";
      a.target = "_blank";
      a.rel = "noopener";
      a.appendChild(el("span", "olxsh-comp-title", it.title || t("common.untitled")));
      a.appendChild(el("span", "olxsh-comp-price", U.formatPrice(it.price, it.currency)));
      list.appendChild(a);
    }
    box.appendChild(toggle);
    box.appendChild(list);
    return box;
  }

  // Contact status, watchlist toggle and a personal note.
  function metaSection(meta) {
    const rec = meta.record || {};
    const box = el("div", "olxsh-meta");
    box.dataset.status = rec.status || "not_contacted";

    const row = el("div", "olxsh-meta-row");
    const sel = el("select", "olxsh-select");
    sel.setAttribute("aria-label", t("w.meta.statusAria"));
    for (const s of meta.statuses) {
      const opt = el("option", null, t(`status.${s}`));
      opt.value = s;
      opt.selected = (rec.status || "not_contacted") === s;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", () => {
      meta.onStatus(sel.value);
      box.dataset.status = sel.value;
    });
    row.appendChild(sel);

    const save = button("olxsh-btn olxsh-save", "", null, async () => {
      const updated = await meta.onToggleSave();
      paint(updated && updated.saved);
    });
    const paint = (saved) => {
      save.replaceChildren(icon(saved ? "star" : "starOutline"), el("span", null, t(saved ? "w.meta.saved" : "w.meta.save")));
      save.classList.toggle("is-on", !!saved);
    };
    paint(rec.saved);
    row.appendChild(save);
    box.appendChild(row);

    // `change` fires once on blur/Enter — typing is never interrupted.
    const note = el("input", "olxsh-input");
    note.type = "text";
    note.placeholder = t("w.meta.note");
    note.value = rec.note || "";
    note.addEventListener("change", () => meta.onNote(note.value));
    box.appendChild(note);
    return box;
  }

  function findWidgetAnchor(hint) {
    const container = (hint && hint.closest('[data-testid="ad-price-container"]')) || hint;
    return (
      (container && container.isConnected ? container : null) ||
      document.querySelector('[data-testid="ad-price-container"]') ||
      document.querySelector('[data-cy="ad_title"], [data-testid="ad_title"]')
    );
  }

  function mountWidget(w, anchorHint) {
    const anchor = findWidgetAnchor(anchorHint);
    if (anchor && anchor.parentElement && !anchor.closest("[data-olxsh]")) {
      w.classList.remove("is-floating");
      anchor.parentElement.insertBefore(w, anchor.nextSibling);
    } else {
      w.classList.add("is-floating");
      document.body.appendChild(w);
    }
  }

  // React may drop our node when it re-renders the price block: re-insert the
  // SAME element so its state (note text, offer, collapsed) survives.
  function ensureWidgetMounted(w, anchorHint) {
    if (!w.isConnected) return mountWidget(w, anchorHint);
    // Floating fallback: dock next to the price as soon as it renders.
    if (w.classList.contains("is-floating") && findWidgetAnchor(anchorHint)) mountWidget(w, anchorHint);
  }

  function removeWidget() {
    document.getElementById(WIDGET_ID)?.remove();
    document.getElementById("olxsh-presets")?.remove();
  }

  /* ---------- seller message presets popover ---------- */

  // controller: { getPresets, add, update, remove, setDefault } — mutators return the new list.
  async function openPresetPopover(anchor, controller) {
    document.getElementById("olxsh-presets")?.remove();

    const pop = rootEl("div", "olxsh-popover", "presets");
    pop.id = "olxsh-presets";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", t("presets.title"));
    for (const type of ["click", "keydown", "keyup", "keypress"]) {
      pop.addEventListener(type, (e) => e.stopPropagation());
    }

    const head = el("div", "olxsh-pp-head");
    head.appendChild(el("span", "olxsh-pp-title", t("presets.title")));
    head.appendChild(button("olxsh-icon-btn", null, "close", () => cleanup(), t("common.close")));
    pop.appendChild(head);

    const body = el("div", "olxsh-pp-body");
    pop.appendChild(body);

    const foot = el("div", "olxsh-pp-foot");
    foot.appendChild(button("olxsh-btn olxsh-btn-dashed", t("presets.new"), "plus", () => showForm(null, null)));
    pop.appendChild(foot);

    let presets = await controller.getPresets();

    async function copy(preset) {
      const ok = await U.copyText(preset.text);
      toast(ok ? t("toast.copied", { label: preset.label }) : t("common.copyFailed"));
    }

    function renderList() {
      body.replaceChildren();
      const def = presets.find((p) => p.isDefault);
      if (def) {
        const quick = button("olxsh-pp-quick", null, "bolt", () => copy(def));
        const q = el("span", "olxsh-pp-quick-text");
        q.appendChild(el("span", "olxsh-eyebrow", t("presets.default")));
        q.appendChild(el("span", "olxsh-pp-quick-sub", def.label));
        quick.appendChild(q);
        body.appendChild(quick);
      }
      for (const p of presets) body.appendChild(presetRow(p));
      if (!presets.length) body.appendChild(el("div", "olxsh-pp-empty", t("presets.empty")));
    }

    function presetRow(p) {
      const row = el("div", `olxsh-pp-row${p.isDefault ? " is-default" : ""}`);
      row.appendChild(
        button("olxsh-icon-btn olxsh-pp-star", null, p.isDefault ? "star" : "starOutline", async () => {
          presets = await controller.setDefault(p.id);
          renderList();
        }, t(p.isDefault ? "presets.isDefault" : "presets.makeDefault"))
      );

      const main = button("olxsh-pp-main", null, null, () => copy(p), t("presets.copy"));
      main.appendChild(el("span", "olxsh-pp-label", p.label));
      main.appendChild(el("span", "olxsh-pp-text", p.text));
      row.appendChild(main);

      row.appendChild(button("olxsh-icon-btn", null, "edit", () => showForm(p, row), t("presets.edit")));
      row.appendChild(
        button("olxsh-icon-btn olxsh-danger", null, "trash", async () => {
          presets = await controller.remove(p.id);
          renderList();
        }, t("common.delete"))
      );
      return row;
    }

    // Inline add/edit form. `preset` null → add mode.
    function showForm(preset, replaceRow) {
      const form = el("div", "olxsh-pp-form");
      const labelInput = el("input", "olxsh-input");
      labelInput.placeholder = t("presets.name");
      labelInput.value = preset ? preset.label : "";
      const textInput = el("textarea", "olxsh-input olxsh-textarea");
      textInput.placeholder = t("presets.text");
      textInput.value = preset ? preset.text : "";
      form.appendChild(labelInput);
      form.appendChild(textInput);

      const actions = el("div", "olxsh-pp-form-actions");
      actions.appendChild(
        button("olxsh-btn olxsh-btn-primary", t("common.save"), null, async () => {
          if (!textInput.value.trim()) return textInput.focus();
          const patch = { label: labelInput.value, text: textInput.value };
          presets = preset ? await controller.update(preset.id, patch) : await controller.add(patch);
          renderList();
        })
      );
      actions.appendChild(button("olxsh-btn", t("common.cancel"), null, () => renderList()));
      form.appendChild(actions);

      if (replaceRow) replaceRow.replaceWith(form);
      else body.insertBefore(form, body.firstChild);
      labelInput.focus();
    }

    renderList();
    document.body.appendChild(pop);
    positionPopover(pop, anchor);

    const onDoc = (e) => {
      if (!pop.contains(e.target)) cleanup();
    };
    const onKey = (e) => {
      if (e.key === "Escape") cleanup();
    };
    function cleanup() {
      pop.remove();
      document.removeEventListener("click", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
    }
    setTimeout(() => {
      document.addEventListener("click", onDoc, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
  }

  function positionPopover(pop, anchor) {
    const r = anchor ? anchor.getBoundingClientRect() : { left: 40, bottom: 80, top: 80 };
    const width = Math.min(340, window.innerWidth - 24);
    pop.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - width - 12))}px`;
    const h = pop.offsetHeight || 380;
    pop.style.top = r.top > h + 16 ? `${Math.max(12, r.top - h - 10)}px` : `${Math.min(r.bottom + 10, window.innerHeight - h - 12)}px`;
  }

  /* ---------- toast ---------- */

  function toast(message) {
    const t = rootEl("div", "olxsh-toast", "toast");
    t.setAttribute("role", "status");
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("is-shown"));
    setTimeout(() => {
      t.classList.remove("is-shown");
      setTimeout(() => t.remove(), 260);
    }, 1600);
  }

  OLXHelper.ui = {
    WIDGET_ID,
    hasPill,
    upsertPill,
    renderAdWidget,
    updateAdWidget,
    ensureWidgetMounted,
    removeWidget,
    openPresetPopover,
    toast,
  };
})();
