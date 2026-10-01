/*
 * OLX Smart Helper — DOM / JSON-LD extraction.
 *
 * Turns OLX markup (search cards and single-ad pages) into plain `Listing`
 * objects. Never relies on generated CSS classes (`.css-1r0ai0q`): every
 * lookup is a cascade of data-cy / data-testid hooks → schema.org JSON-LD /
 * meta tags → structural anchors (`a[href*="/d/"]`) → text-pattern fallbacks.
 */
(function () {
  "use strict";

  const OLXHelper = (window.OLXHelper = window.OLXHelper || {});
  const U = OLXHelper.utils;

  // Anything we inject carries this attribute; extraction must never read it.
  const OWN = "[data-olxsh]";

  /* ---------- low-level DOM helpers ---------- */

  // Old prices are rendered struck-through; those tags never hold current data.
  const SKIP_TAGS = new Set(["S", "DEL", "STRIKE", "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "svg"]);

  // textContent that skips our own nodes and struck-through text. Text nodes are
  // joined with a space so "480 грн" + "Договірна" never fuse into "грнДоговірна".
  function textOf(el) {
    if (!el) return "";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) {
          return n.hasAttribute("data-olxsh") || SKIP_TAGS.has(n.tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let out = "";
    while (walker.nextNode()) out += walker.currentNode.nodeValue + " ";
    return U.cleanText(out);
  }

  function attr(el, name) {
    return el ? U.cleanText(el.getAttribute(name) || "") : "";
  }

  /*
   * First element matching any selector (in priority order) that passes
   * `accept(el, text)`. Our own nodes are always skipped.
   */
  function firstMatch(root, selectors, accept) {
    for (const sel of selectors) {
      let nodes;
      try {
        nodes = root.querySelectorAll(sel);
      } catch (e) {
        continue; // tolerate selectors unsupported by older engines
      }
      for (const el of nodes) {
        if (el.closest(OWN)) continue;
        const text = textOf(el);
        if (text && (!accept || accept(el, text))) return { el, text, selector: sel };
      }
    }
    return null;
  }

  /* ---------- selector cascades ---------- */

  const CARD_SELECTORS = [
    '[data-cy="l-card"]',
    '[data-testid="l-card"]',
    '[data-testid="listing-ad"]',
    '[data-cy="ad-card"]',
    '[data-testid="ad-card"]',
  ];
  const CARD_SELECTOR = CARD_SELECTORS.join(", ");

  // Structural anchor: every OLX ad URL lives under /d/ and ends with -ID<id>.html.
  const AD_LINK = 'a[href*="/d/"], a[href*="-ID"]';

  // Title selectors inside a card. `[data-cy="ad-card-title"]` wraps BOTH the
  // title and the price, so its inner heading/link must be tried first.
  const CARD_TITLE = [
    '[data-cy="ad-card-title"] h4',
    '[data-cy="ad-card-title"] h6',
    '[data-cy="ad-card-title"] a',
    '[data-testid="ad-card-title"]',
    '[data-testid="ad-title"]',
    "h4",
    "h6",
    "h3",
    "h2",
  ];

  const CARD_PRICE = [
    '[data-testid="ad-price"]',
    '[data-testid="ad-card-price"]',
    '[data-cy="ad-card-price"]',
    '[data-testid="price"]',
  ];

  const CARD_LOCATION = ['[data-testid="location-date"]', '[data-testid="location"]', '[data-cy="location-date"]'];

  const PAGE_TITLE = [
    '[data-cy="ad_title"] h4',
    '[data-cy="ad_title"] h1',
    '[data-cy="ad_title"]',
    '[data-testid="ad_title"]',
    '[data-testid="offer_title"]',
    '[data-cy="offer_title"]',
    "main h1",
    "h1",
  ];

  const GENERIC_TITLE = new Set(["main h1", "h1"]);

  const PAGE_PRICE = [
    '[data-testid="ad-price-container"] h3',
    '[data-testid="ad-price-container"] h2',
    '[data-testid="ad-price-container"]',
    '[data-cy="ad-price"]',
    '[data-testid="ad-price"]',
    '[data-testid="price"]',
  ];

  const PAGE_LOCATION = [
    '[data-testid="location-date"]',
    '[data-testid="map-aside-section"] p',
    '[data-cy="ad-location"]',
  ];

  const PAGE_PARAMS = ['[data-testid="ad-parameters-container"]', '[data-cy="ad-parameters"]', '[data-testid="ad-parameters"]'];

  // Seller/profile blocks: their headings are a person's name, not the ad title.
  const SELLER_CONTAINERS =
    '[data-testid="user-profile"],[data-testid="seller-box"],[data-testid="user-profile-user-name"],' +
    '[data-cy="seller_card"],[data-cy="user-profile"],a[href*="/users/"],a[href*="/list/user/"]';

  /* ---------- page classification ---------- */

  const SEARCH_PATH_RE = /\/(?:list|oferty|oferte|ads)\/|\/q-/i;

  const AD_MARKUP = '[data-cy="ad_title"], [data-testid="ad_title"], [data-testid="offer_title"], [data-testid="ad-price-container"]';

  // Ad-page-only hooks are rendered (vs. a search page still on screen).
  function hasAdMarkup() {
    return !!document.querySelector(AD_MARKUP);
  }

  function pageType(loc = location) {
    if (SEARCH_PATH_RE.test(loc.pathname)) return "search";
    if (U.isAdUrl(loc.pathname + loc.search) || hasAdMarkup()) return "ad";
    // Category pages (/elektronika/telefony/…) behave like search grids.
    return "search";
  }

  /* ---------- search / category cards ---------- */

  // Climb from an ad link to the largest ancestor that still holds only this ad.
  function climbToCard(anchor, id) {
    let node = anchor;
    for (let depth = 0; depth < 8; depth++) {
      const parent = node.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      let foreign = false;
      for (const link of parent.querySelectorAll(AD_LINK)) {
        const lid = U.adIdFromUrl(link.href);
        if (lid && lid !== id) {
          foreign = true;
          break;
        }
      }
      if (foreign) break;
      node = parent;
    }
    return node;
  }

  function getCards(root = document) {
    const cards = [];
    const seen = new Set();
    const push = (el) => {
      if (!el || seen.has(el) || el.closest(OWN)) return;
      seen.add(el);
      cards.push(el);
    };

    root.querySelectorAll(CARD_SELECTOR).forEach(push);

    // Structural fallback when OLX ships markup without the data hooks.
    if (cards.length < 2) {
      for (const a of root.querySelectorAll(AD_LINK)) {
        const id = U.adIdFromUrl(a.href);
        if (!id || a.closest(OWN) || cards.some((c) => c.contains(a))) continue;
        const card = climbToCard(a, id);
        if (card && card !== a && U.hasPriceText(textOf(card))) push(card);
      }
    }

    // Nested matches (card inside card): keep the innermost per ad.
    return cards.filter((c) => !cards.some((o) => o !== c && c.contains(o)));
  }

  function pickAdLink(card) {
    if (card.matches && card.matches("a[href]")) return card;
    let fallback = null;
    for (const a of card.querySelectorAll("a[href]")) {
      if (a.closest(OWN)) continue;
      if (U.adIdFromUrl(a.href)) return a;
      fallback = fallback || a;
    }
    return fallback;
  }

  // Last-resort price lookup: a short leaf-ish node whose text is a price.
  function findPriceLeaf(root) {
    const nodes = root.querySelectorAll("p, span, strong, b, h2, h3, h4, h5, h6, div");
    let checked = 0;
    for (const el of nodes) {
      if (el.childElementCount > 3 || el.closest(OWN)) continue;
      if (++checked > 160) break;
      const t = textOf(el);
      if (t && t.length <= 48 && U.hasPriceText(t)) return el;
    }
    return null;
  }

  function cityFrom(locationText) {
    const head = U.cleanText(locationText).split(/\s[-–—]\s/)[0];
    return (head.split(",")[0] || "").trim();
  }

  function extractCard(card) {
    const link = pickAdLink(card);
    const url = link ? link.href : "";

    const notPrice = (_el, t) => !U.isJunkTitle(t) && !U.looksLikePrice(t);
    let title = (firstMatch(card, CARD_TITLE, notPrice) || {}).text || "";
    if (!title && link) title = attr(link, "title") || attr(link, "aria-label");
    if (!title) title = attr(card.querySelector("img[alt]"), "alt");
    if (!title && link) {
      const t = textOf(link);
      if (t.length > 3 && !U.looksLikePrice(t)) title = t;
    }

    const priceHit = firstMatch(card, CARD_PRICE);
    const priceEl = priceHit ? priceHit.el : findPriceLeaf(card);
    const locText = (firstMatch(card, CARD_LOCATION) || {}).text || "";

    return buildListing({
      title,
      priceText: priceEl ? textOf(priceEl) : "",
      location: locText,
      url,
      source: "card",
      el: card,
      priceEl,
    });
  }

  /* ---------- schema.org JSON-LD + meta tags ---------- */

  function typeList(node) {
    const t = node && node["@type"];
    return (Array.isArray(t) ? t : [t]).filter(Boolean).map((x) => String(x).toLowerCase());
  }

  function collectLd(node, out, depth = 0) {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
      for (const n of node) collectLd(n, out, depth + 1);
    } else if (typeof node === "object") {
      out.push(node);
      if (node["@graph"]) collectLd(node["@graph"], out, depth + 1);
      if (node.mainEntity) collectLd(node.mainEntity, out, depth + 1);
    }
  }

  function readJsonLdProduct() {
    const nodes = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        collectLd(JSON.parse(s.textContent), nodes);
      } catch (e) {
        /* malformed block — skip */
      }
    }
    const product =
      nodes.find((n) => typeList(n).includes("product") && n.offers) ||
      nodes.find((n) => n.offers && n.name);
    if (!product) return null;

    const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    const rawPrice =
      offers && (offers.price ?? offers.lowPrice ?? (offers.priceSpecification && offers.priceSpecification.price));
    const value = typeof rawPrice === "number" ? rawPrice : U.parseNumber(rawPrice);
    return {
      name: U.cleanText(product.name || ""),
      value: value != null && value > 0 ? Math.round(value) : null,
      currency: U.currencyFromCode(offers && offers.priceCurrency),
      url: String(product.url || (offers && offers.url) || product["@id"] || ""),
    };
  }

  function readMeta() {
    const get = (sel) => attr(document.querySelector(sel), "content");
    const amount = get('meta[property="product:price:amount"], meta[property="og:price:amount"]');
    return {
      name: get('meta[property="og:title"]'),
      url: get('meta[property="og:url"]'),
      value: U.parseNumber(amount),
      currency: U.currencyFromCode(get('meta[property="product:price:currency"], meta[property="og:price:currency"]')),
    };
  }

  // Share of `a`'s tokens present in `b` (0..1).
  function tokenCoverage(a, b) {
    const ta = U.tokenize(a);
    if (!ta.length) return 0;
    const tb = new Set(U.tokenize(b));
    return ta.filter((t) => tb.has(t)).length / ta.length;
  }

  /*
   * Next.js keeps <head> blocks from the PREVIOUS ad for a moment after a
   * client-side transition. Structured data is only trusted when its URL
   * carries the current ad id, or its name matches the live DOM/document title.
   */
  function isFresh(data, domTitle) {
    if (!data) return false;
    const currentId = U.adIdFromUrl(location.href);
    const dataId = U.adIdFromUrl(data.url);
    if (currentId && dataId) return currentId === dataId;
    const reference = domTitle || document.title;
    return !!data.name && tokenCoverage(data.name, reference) >= 0.6;
  }

  // "iPhone 13 128GB: 15 000 грн - Мобільні телефони Київ на Olx" → "iPhone 13 128GB"
  function titleFromDocument() {
    const t = U.cleanText(document.title);
    if (!/olx/i.test(t)) return "";
    return t
      .split(/\s[-–|]\s/)[0]
      .replace(/:\s*[\d\s.,]+\S*$/, "")
      .trim();
  }

  /* ---------- single ad page ---------- */

  function extractPage() {
    const notCard = (el) => !el.closest(CARD_SELECTOR);
    const sources = { title: null, price: null };

    // Title: live DOM first (always fresh), then structured data, then <title>.
    const titleHit = firstMatch(
      document,
      PAGE_TITLE,
      (el, t) => notCard(el) && !el.closest(SELLER_CONTAINERS) && !U.isJunkTitle(t) && !U.looksLikePrice(t)
    );
    let title = titleHit ? titleHit.text : "";
    if (title) sources.title = "dom";
    // A bare <h1> is a weak signal (search pages have one too).
    const weakTitle = !!titleHit && GENERIC_TITLE.has(titleHit.selector);

    const ld = readJsonLdProduct();
    const ldFresh = isFresh(ld, weakTitle ? "" : title);
    const meta = readMeta();
    const metaFresh = isFresh(meta, weakTitle ? "" : title);
    if (weakTitle && ldFresh && ld.name) [title, sources.title] = [ld.name, "jsonld"];

    if (!title && ldFresh && ld.name) [title, sources.title] = [ld.name, "jsonld"];
    if (!title && metaFresh && meta.name) [title, sources.title] = [meta.name, "meta"];
    if (!title) {
      const docTitle = titleFromDocument();
      if (docTitle) [title, sources.title] = [docTitle, "document"];
    }

    // Price: never from a "similar ads" card further down the page.
    const priceHit = firstMatch(document, PAGE_PRICE, (el) => notCard(el));
    let priceEl = priceHit ? priceHit.el : null;
    let priceInfo = priceHit ? U.parsePriceInfo(priceHit.text, U.region().currency) : null;
    if (priceInfo && priceInfo.kind !== "none") sources.price = "dom";

    if ((!priceInfo || priceInfo.kind === "none") && ldFresh && ld.value != null) {
      priceInfo = { value: ld.value, currency: ld.currency || U.region().currency, kind: "price", negotiable: false, raw: "" };
      sources.price = "jsonld";
    }
    if ((!priceInfo || priceInfo.kind === "none") && metaFresh && meta.value != null) {
      priceInfo = { value: Math.round(meta.value), currency: meta.currency || U.region().currency, kind: "price", negotiable: false, raw: "" };
      sources.price = "meta";
    }
    if (!priceInfo || priceInfo.kind === "none") {
      // Heuristic: a price-looking node near the title block.
      let scope = titleHit ? titleHit.el : null;
      for (let i = 0; scope && i < 4; i++) scope = scope.parentElement;
      const leaf = scope ? findPriceLeaf(scope) : null;
      if (leaf && notCard(leaf)) {
        priceEl = leaf;
        priceInfo = U.parsePriceInfo(textOf(leaf), U.region().currency);
        if (priceInfo.kind !== "none") sources.price = "heuristic";
      }
    }

    const locText = (firstMatch(document, PAGE_LOCATION, notCard) || {}).text || "";
    const params = PAGE_PARAMS.map((s) => textOf(document.querySelector(s))).join(" ");

    return buildListing({
      title,
      priceInfo,
      location: locText,
      url: location.href,
      source: "page",
      priceEl,
      extraText: params,
      sources,
    });
  }

  /* ---------- shared builder ---------- */

  function buildListing({ title, priceText, priceInfo, location: loc, url, source, el, priceEl, extraText, sources }) {
    const p = priceInfo || U.parsePriceInfo(priceText || "", U.region().currency);
    const cleanTitle = U.cleanText(title);
    const tokens = U.tokenize(cleanTitle);
    const id = U.adIdFromUrl(url);
    return {
      id,
      title: cleanTitle,
      url: url || "",
      price: p.value,
      currency: p.currency || (p.value != null ? U.region().currency : ""),
      priceKind: p.kind,
      negotiable: !!p.negotiable,
      priceRaw: p.raw || "",
      location: U.cleanText(loc),
      city: cityFrom(loc || ""),
      size: U.extractSize(`${cleanTitle} ${extraText || ""}`),
      tokens,
      brandHints: U.extractBrandHints(tokens),
      source,
      sources: sources || null,
      // Change-detection key: React may reuse a card node for a different ad.
      sig: `${id || url}|${p.value}|${p.currency}|${cleanTitle.length}`,
      _el: el || null,
      _priceEl: priceEl || null,
    };
  }

  OLXHelper.extractor = {
    CARD_SELECTOR,
    OWN,
    textOf,
    pageType,
    hasAdMarkup,
    getCards,
    extractCard,
    extractPage,
    readJsonLdProduct,
  };
})();
