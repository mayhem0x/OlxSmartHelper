/*
 * OLX Smart Helper — comparable grouping + market deviation.
 *
 * 1. Similarity: IDF-weighted token Jaccard over the listings on the page, so
 *    tokens every card shares ("iphone" on an iPhone search) count little and
 *    distinguishing tokens ("13", "pro", "256gb") count a lot. Conflicting
 *    model numbers, storage sizes, tiers or accessory-vs-device are penalised.
 * 2. Baseline: median of the comparables' prices (same currency only, the
 *    listing itself excluded, IQR/ratio outliers trimmed).
 * 3. Verdict vs. baseline:
 *      good  (green)  Δ < −10%
 *      fair  (orange) −10% … +12%
 *      high  (red)    Δ > +12%
 *      unknown (gray) fewer than MIN_COMPS comparables
 *
 * Locale-agnostic: verdicts and reasons carry codes + params only; the UI
 * translates them (i18n keys `verdict.<status>`, `reason.<code>`).
 */
(function () {
  "use strict";

  const OLXHelper = (window.OLXHelper = window.OLXHelper || {});
  const U = OLXHelper.utils;

  const CFG = {
    MIN_COMPS: 3, // fewer comparables → no price verdict
    STRONG_COMPS: 6, // → high confidence
    MATCH: 0.34, // minimum similarity to count as a comparable
    MAX_COMPS: 40,
    GOOD: -0.1, // Δ below → good deal
    HIGH: 0.12, // Δ above → overpriced
    GREAT: -0.25, // highlight strongly (with high confidence)
    SUSPICIOUS: -0.5, // too good to be true → warn
  };

  const COLORS = { good: "green", fair: "orange", high: "red", unknown: "gray" };

  /* ---------- token classes ---------- */

  // Tier qualifiers that move a model into a different price bracket.
  const TIERS = new Set("pro max plus mini ultra lite air se fe ti slim neo prime edge note fold flip".split(" "));

  // Accessories / parts: never comparable with the device itself.
  const ACCESSORY = new Set(
    (
      "чехол чохол case etui husa калъф стекло скло szklo folie protector кабель kabel cablu " +
      "зарядка зарядное зарядний charger ladowarka incarcator коробка box pudelko cutie " +
      "запчасти запчастини разборка розборка czesci piese дисплей экран екран display wyswietlacz " +
      "батарея акумулятор аккумулятор bateria baterie корпус obudowa carcasa плата"
    )
      .split(/\s+/)
      .map(U.fold)
  );

  const STORAGE_RE = /^\d+(?:gb|tb)$/;
  const UNIT_RE = /^\d+(?:\.\d+)?(?:gb|tb|mb|m2|mah|hz|kw|kg|km|mm|cm|ml|wh)$/;

  // Tokens carrying a model/generation number: "13", "a52", "rtx3060", "2019".
  const isModelToken = (t) => /\d/.test(t) && !UNIT_RE.test(t);
  const isStorageToken = (t) => STORAGE_RE.test(t);

  /* ---------- corpus + profiles ---------- */

  function buildCorpus(listings) {
    const df = new Map();
    let n = 0;
    for (const l of listings) {
      if (!l || !l.tokens || !l.tokens.length) continue;
      n++;
      for (const t of l.tokens) df.set(t, (df.get(t) || 0) + 1);
    }
    return { n: Math.max(n, 1), df, cache: new WeakMap() };
  }

  function tokenWeight(t, corpus) {
    const df = corpus.df.get(t) || 0;
    let w = Math.log(1 + (corpus.n + 1) / (df + 1)); // smoothed IDF
    if (isModelToken(t)) w *= 1.6;
    if (U.isBrand(t)) w *= 1.2;
    return w;
  }

  function profile(listing, corpus) {
    let p = corpus.cache.get(listing);
    if (p) return p;
    const weights = new Map();
    const models = new Set();
    const storage = new Set();
    const tiers = new Set();
    let accessory = false;
    for (const t of listing.tokens || []) {
      weights.set(t, tokenWeight(t, corpus));
      if (isStorageToken(t)) storage.add(t);
      else if (isModelToken(t)) models.add(t);
      if (TIERS.has(t)) tiers.add(t);
      if (ACCESSORY.has(t)) accessory = true;
    }
    p = { weights, models, storage, tiers, accessory };
    corpus.cache.set(listing, p);
    return p;
  }

  const intersects = (a, b) => {
    for (const x of a) if (b.has(x)) return true;
    return false;
  };
  const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

  /* ---------- similarity ---------- */

  function similarity(a, b, corpus) {
    const pa = profile(a, corpus);
    const pb = profile(b, corpus);
    let inter = 0;
    let union = 0;
    for (const [t, w] of pa.weights) {
      union += w;
      if (pb.weights.has(t)) inter += w;
    }
    for (const [t, w] of pb.weights) if (!pa.weights.has(t)) union += w;
    let s = union ? inter / union : 0;

    if (pa.models.size && pb.models.size && !intersects(pa.models, pb.models)) s *= 0.35; // iPhone 13 ≠ 14
    if (pa.storage.size && pb.storage.size && !intersects(pa.storage, pb.storage)) s *= 0.5; // 128gb ≠ 256gb
    if (!sameSet(pa.tiers, pb.tiers)) s *= 0.6; // 13 ≠ 13 Pro Max
    if (pa.accessory !== pb.accessory) s *= 0.25; // case ≠ phone

    if (a.size != null && b.size != null) {
      const rel = Math.abs(a.size - b.size) / Math.max(a.size, b.size, 1);
      s = rel > 0.25 ? s * 0.6 : s * 0.9 + 0.1 * (1 - rel);
    }
    if (a.city && b.city && a.city.toLowerCase() === b.city.toLowerCase()) s = Math.min(1, s * 1.05);
    return s;
  }

  // Simple token Jaccard (no corpus) — used for relist detection across visits.
  function jaccard(aArr, bArr) {
    const a = new Set(aArr);
    const b = new Set(bArr);
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
  }

  const isPriced = (l) => l && l.priceKind === "price" && l.price != null;

  const sameListing = (a, b) =>
    a === b || (a.id && b.id && a.id === b.id) || (!a.id && a.url && a.url === b.url) || (a._el && a._el === b._el);

  function findComparables(target, pool, corpus) {
    if (!isPriced(target) || !target.tokens.length) return [];
    const out = [];
    for (const cand of pool) {
      if (!isPriced(cand) || sameListing(target, cand)) continue;
      if (cand.currency !== target.currency) continue; // never mix грн with $
      const score = similarity(target, cand, corpus);
      if (score >= CFG.MATCH) out.push({ listing: cand, score });
    }
    out.sort((x, y) => y.score - x.score);
    return out.slice(0, CFG.MAX_COMPS);
  }

  /* ---------- statistics ---------- */

  function quantile(sorted, p) {
    if (!sorted.length) return null;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  function median(nums) {
    return quantile([...nums].sort((a, b) => a - b), 0.5);
  }

  // IQR fence for n ≥ 4; for tiny samples drop anything 4× away from the median.
  function trimOutliers(nums) {
    const s = [...nums].sort((a, b) => a - b);
    if (s.length >= 4) {
      const q1 = quantile(s, 0.25);
      const q3 = quantile(s, 0.75);
      const iqr = q3 - q1;
      return s.filter((n) => n >= q1 - 1.5 * iqr && n <= q3 + 1.5 * iqr);
    }
    const m = quantile(s, 0.5);
    return s.filter((n) => n >= m / 4 && n <= m * 4);
  }

  /* ---------- verdict ---------- */

  function evaluate(target, comps) {
    const prices = trimOutliers(comps.map((c) => c.listing.price));
    const n = prices.length;
    const confidenceKey = n >= CFG.STRONG_COMPS ? "high" : n >= CFG.MIN_COMPS ? "mid" : "low";
    const reasons = [];

    let status = "unknown";
    let baseline = null;
    let delta = null;
    if (isPriced(target) && n >= CFG.MIN_COMPS) {
      baseline = quantile(prices, 0.5);
      delta = baseline > 0 ? target.price / baseline - 1 : null;
      if (delta != null) status = delta < CFG.GOOD ? "good" : delta > CFG.HIGH ? "high" : "fair";
    }

    const great = status === "good" && delta <= CFG.GREAT && confidenceKey === "high";
    const suspicious = status === "good" && delta <= CFG.SUSPICIOUS;

    const add = (code, kind, params) => reasons.push({ code, kind, params: params || null });
    if (baseline != null) {
      add("delta", status === "good" ? "pos" : status === "high" ? "neg" : "info", { pct: U.formatPercent(delta), n });
    }
    if (suspicious) add("suspicious", "neg");
    if (target.negotiable) add("negotiable", "info");
    if (target.priceKind === "free") add("free", "info");
    if (target.priceKind === "exchange") add("exchange", "info");
    if (!isPriced(target) && target.priceKind === "none") add("noprice", "neg");
    if (isPriced(target) && n < CFG.MIN_COMPS) add(n ? "few" : "none", "info", { n });

    return {
      status,
      color: COLORS[status],
      confidenceKey,
      comparablesCount: n,
      hasEstimate: baseline != null,
      baseline: baseline != null ? Math.round(baseline) : null,
      spread: n ? { min: prices[0], q1: Math.round(quantile(prices, 0.25)), q3: Math.round(quantile(prices, 0.75)), max: prices[n - 1] } : null,
      delta,
      deltaPct: delta != null ? Math.round(delta * 100) : null,
      currency: target.currency || "",
      great,
      suspicious,
      reasons,
    };
  }

  /* ---------- public entry points ---------- */

  // Every card against the rest of the page. Returns [{ listing, verdict, comps }].
  function analyzeAll(listings) {
    const corpus = buildCorpus(listings);
    return listings.map((listing) => {
      const comps = findComparables(listing, listings, corpus);
      return { listing, comps, verdict: evaluate(listing, comps) };
    });
  }

  // A single ad (detail page) against whatever cards the page renders.
  function analyzeTarget(target, pool) {
    const corpus = buildCorpus([target, ...pool]);
    const comps = findComparables(target, pool, corpus);
    return { comps, verdict: evaluate(target, comps) };
  }

  /*
   * Opening offer for the negotiation template: anchored to the market median
   * when we have one, otherwise a polite ~8% ask. Always below the asking price.
   */
  function suggestOffer(target, verdict) {
    if (!isPriced(target)) return null;
    const price = target.price;
    let offer = price * 0.92;
    if (verdict && verdict.baseline) {
      if (verdict.status === "high") offer = Math.max(verdict.baseline, price * 0.8);
      else if (verdict.status === "fair") offer = Math.max(Math.min(price * 0.95, verdict.baseline * 0.97), price * 0.88);
      else if (verdict.status === "good") offer = price * 0.95;
    }
    const rounded = U.roundNice(offer);
    return rounded >= price ? U.roundNice(price - U.niceStep(price)) : rounded;
  }

  // Model-centric query: brand, model numbers, tier and storage words first,
  // keeping the seller's original spelling so OLX search matches it.
  function modelQuery(title) {
    const words = U.buildSearchQuery(title, 14).split(" ").filter(Boolean);
    const picked = [];
    let filler = 0;
    for (const w of words) {
      const toks = U.tokenize(w);
      if (!toks.length) continue;
      const key = toks.some((t) => U.isBrand(t) || isModelToken(t) || TIERS.has(t) || isStorageToken(t));
      if (key || filler < 2) {
        if (!key) filler++;
        picked.push(w);
      }
      if (picked.length >= 6) break;
    }
    return picked.join(" ") || U.buildSearchQuery(title, 6);
  }

  OLXHelper.estimator = {
    CFG,
    COLORS,
    similarity,
    jaccard,
    median,
    trimOutliers,
    evaluate,
    analyzeAll,
    analyzeTarget,
    suggestOffer,
    modelQuery,
  };
})();
