/*
 * OLX Smart Helper — shared utilities and namespace.
 * Everything hangs off a single global `window.OLXHelper` so the content
 * scripts can be modular without a bundler / ES modules.
 *
 * Contents: regional config, text cleaning, price parsing/normalization,
 * tokenization for similarity, debounce, clipboard, debug logger.
 */
(function () {
  "use strict";

  const OLXHelper = (window.OLXHelper = window.OLXHelper || {});

  /* ---------- regional config ---------- */

  // Per-TLD defaults: currency used when a price string has no sign, the
  // language sellers expect in messages, and the search path segment.
  const REGIONS = {
    ua: { currency: "грн", lang: "uk", searchPath: "list" },
    pl: { currency: "zł", lang: "pl", searchPath: "oferty" },
    ro: { currency: "lei", lang: "ro", searchPath: "oferte" },
    bg: { currency: "лв", lang: "bg", searchPath: "ads" },
    kz: { currency: "₸", lang: "ru", searchPath: "list" },
    uz: { currency: "сум", lang: "ru", searchPath: "list" },
  };

  function region(host = location.hostname) {
    const tld = String(host).split(".").pop().toLowerCase();
    return { tld, ...(REGIONS[tld] || { currency: "", lang: "ru", searchPath: "list" }) };
  }

  /* ---------- text cleaning ---------- */

  const HTML_ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

  // Decode the handful of entities that leak through JSON-LD / attributes.
  function decodeEntities(str) {
    return String(str ?? "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return HTML_ENTITIES[code.toLowerCase()] ?? m;
    });
  }

  // Collapse every flavour of whitespace (NBSP U+00A0, narrow NBSP U+202F used
  // by pl/fr number formatting, thin spaces, zero-width chars) to one space.
  function cleanText(str) {
    return decodeEntities(str)
      .replace(/[​-‍⁠﻿]/g, "")
      .replace(/[\s    ]+/g, " ")
      .trim();
  }

  // Lowercase + Unicode compatibility fold: strips diacritics (ł/ą/ș/ї → l/a/s/і)
  // and turns ² / full-width digits into ASCII. Applied identically to both
  // sides of every comparison, so folding "й"→"и" is harmless.
  function fold(str) {
    return cleanText(str)
      .toLowerCase()
      .replace(/ł/g, "l")
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "");
  }

  function normalize(str) {
    return fold(str)
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripEmoji(str) {
    return String(str || "").replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,
      ""
    );
  }

  function truncate(str, max) {
    const s = String(str || "");
    return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
  }

  /* ---------- tokenization ---------- */

  const foldSet = (words) => new Set(words.split(/\s+/).filter(Boolean).map(fold));

  // Words that carry no signal for similarity (RU/UA/PL/RO/BG/EN).
  const STOPWORDS = foldSet(
    "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы " +
      "по только ее мне было вот от меня еще нет о из ему когда даже ну для или " +
      "і й та що це як від до при без під над про є " +
      "the a an of for and or to in on with by new used " +
      "бу б/у состояние стан торг срочно терміново продам продаю продается продається " +
      "продажа продаж цена ціна договорная договірна обмен обмін идеал ідеал идеальное " +
      "ідеальний отличное відмінний хорошее хороший новый новий новая нова " +
      "i z za w na do od dla nowy nowa nowe uzywany uzywana stan sprzedam okazja pilne " +
      "de la si cu in pe vand vând nou noua stare " +
      "за на продавам нов нова отлично състояние"
  );

  // Cyrillic spellings of common brands → canonical Latin token.
  const SYNONYMS = new Map(
    Object.entries({
      айфон: "iphone", айфона: "iphone", ифон: "iphone", iphon: "iphone",
      самсунг: "samsung", галакси: "galaxy", галаксі: "galaxy",
      сяоми: "xiaomi", ксиоми: "xiaomi", ксяоми: "xiaomi", редми: "redmi",
      хуавей: "huawei", хонор: "honor", макбук: "macbook", айпад: "ipad",
      аирподс: "airpods", эирподс: "airpods", ейрподс: "airpods", эпл: "apple", епл: "apple",
      плейстейшн: "playstation", пс5: "ps5", пс4: "ps4", иксбокс: "xbox", хбокс: "xbox",
      нинтендо: "nintendo", свитч: "switch", мерседес: "mercedes", мерс: "mercedes",
      фольксваген: "volkswagen", тойота: "toyota", шкода: "skoda", бмв: "bmw",
      ауди: "audi", хонда: "honda", дайсон: "dyson", макита: "makita", бош: "bosch",
    }).map(([k, v]) => [fold(k), v])
  );

  const BRANDS = foldSet(
    "apple iphone samsung galaxy xiaomi redmi poco huawei honor oppo realme oneplus " +
      "nokia motorola sony lg google pixel asus acer lenovo hp dell msi macbook ipad " +
      "airpods playstation ps4 ps5 xbox nintendo switch steam bmw audi mercedes " +
      "volkswagen vw toyota honda ford renault skoda kia hyundai nissan mazda opel " +
      "peugeot bosch makita dewalt dyson ikea canon nikon gopro dji jbl bose logitech " +
      "razer intel amd nvidia rtx gtx geforce radeon garmin xbox"
  );

  // Suffixes that make "<digits><letters>" a single measured token (128gb, 5000mah).
  const UNIT_WORDS = new Set(["gb", "tb", "mb", "m2", "mah", "hz", "kw", "kg", "km", "mm", "cm", "ml", "wh"]);

  /*
   * Split a title into comparable tokens:
   *  - units are glued to their number ("128 GB" / "128гб" → "128gb", "45 м²" → "45m2")
   *  - long words glued to model numbers are split ("iphone13" → "iphone", "13")
   *    while short model codes stay intact ("a52", "rtx3060", "ps5")
   *  - Cyrillic brand spellings are canonicalised ("айфон" → "iphone")
   */
  function tokenize(str) {
    const s = fold(stripEmoji(str))
      .replace(/(\d+)\s*(?:gb|гб|gig)(?![\p{L}])/gu, " $1gb ")
      .replace(/(\d+)\s*(?:tb|тб)(?![\p{L}])/gu, " $1tb ")
      .replace(/(\d+)\s*(?:mah|мач)(?![\p{L}])/gu, " $1mah ")
      .replace(/(\d+(?:[.,]\d+)?)\s*(?:m2|м2|кв\.?\s?м|mkw|mp|sqm)(?![\p{L}\d])/gu, (_, n) => ` ${n.replace(",", ".")}m2 `)
      .replace(/(\d)[,](\d)/g, "$1.$2")
      .replace(/(\p{L}{4,})(\d)/gu, "$1 $2")
      .replace(/(\d)(\p{L}{3,})/gu, (m, d, l) => (UNIT_WORDS.has(l) ? m : `${d} ${l}`));

    const out = [];
    const seen = new Set();
    for (let tok of s.split(/[^\p{L}\p{N}.]+/u)) {
      tok = tok.replace(/^\.+|\.+$/g, "");
      if (!tok) continue;
      tok = SYNONYMS.get(tok) || tok;
      if (tok.length < 2 && !/^\d$/.test(tok)) continue;
      if (STOPWORDS.has(tok) || seen.has(tok)) continue;
      seen.add(tok);
      out.push(tok);
    }
    return out;
  }

  const isBrand = (tok) => BRANDS.has(tok);

  // Brand + model-ish hints (kept for search-query building and scoring).
  function extractBrandHints(tokensOrTitle) {
    const tokens = Array.isArray(tokensOrTitle) ? tokensOrTitle : tokenize(tokensOrTitle);
    return tokens.filter((t) => isBrand(t) || (/\d/.test(t) && t.length <= 8));
  }

  // Headings OLX renders that are NOT product titles (chat/nav blocks).
  const JUNK_TITLE = foldSet(
    "повідомлення сообщение message wiadomosc mesaj съобщение чат chat меню menu войти вход увійти"
  );
  const JUNK_PHRASES = new Set(
    ["повідомлення продавцю", "написати повідомлення", "сообщение продавцу", "написать сообщение",
     "napisz wiadomosc", "trimite mesaj"].map(normalize)
  );

  function isJunkTitle(str) {
    const n = normalize(str);
    if (!n || n.length < 2) return true;
    return JUNK_TITLE.has(n) || JUNK_PHRASES.has(n);
  }

  // Clean, human-readable OLX search query from a title (keeps original words).
  function buildSearchQuery(title, maxWords = 8) {
    return cleanText(stripEmoji(title))
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .slice(0, maxWords)
      .join(" ");
  }

  /* ---------- price parsing ---------- */

  // Lookarounds instead of \b: JS \b is ASCII-only and never fires around Cyrillic.
  const word = (src) => `(?<![\\p{L}])(?:${src})(?![\\p{L}])`;

  const CURRENCIES = [
    { sym: "грн", src: "грн\\.?|₴|" + word("uah") },
    { sym: "zł", src: "zł|" + word("zl|pln") },
    { sym: "€", src: "€|" + word("eur|euro|евро|євро") },
    { sym: "$", src: "\\$|" + word("usd") + "|у\\.\\s?е\\.|y\\.\\s?e\\." },
    { sym: "lei", src: word("lei|ron") },
    { sym: "лв", src: word("лв") + "\\.?|" + word("bgn") },
    { sym: "₸", src: "₸|" + word("тг|тенге|kzt") },
    { sym: "сум", src: word("сум|so['ʻ’]?m|uzs") },
  ].map((c) => ({ ...c, re: new RegExp(c.src, "iu") }));

  const CODE_TO_SYM = { UAH: "грн", PLN: "zł", EUR: "€", USD: "$", RON: "lei", BGN: "лв", KZT: "₸", UZS: "сум" };

  const CUR_SRC = CURRENCIES.map((c) => `(?:${c.src})`).join("|");

  // A number with optional thousands groups (space/./,/') and optional decimals.
  // "12 999", "1.299,00", "1,200", "480,00", "12000", "19.990"
  const NUM_SRC =
    "\\d{1,3}(?:[ .,'’](?=\\d{3}(?!\\d))\\d{3})+(?:[.,]\\d{1,2}(?!\\d))?|\\d+(?:[.,]\\d{1,2}(?!\\d))?";

  // Number immediately before or after a currency sign: "480 грн", "€ 1.299", "$2,500".
  const PRICE_RE = new RegExp(`(${NUM_SRC})\\s?(${CUR_SRC})|(${CUR_SRC})\\s?(${NUM_SRC})`, "giu");
  const PRICE_TEST_RE = new RegExp(`(?:${NUM_SRC})\\s?(?:${CUR_SRC})|(?:${CUR_SRC})\\s?(?:${NUM_SRC})`, "iu");
  const FIRST_NUM_RE = new RegExp(NUM_SRC);

  const FREE_RE = new RegExp(word("безкоштовно|бесплатно|даром|za darmo|gratis|gratuit|безплатно|тегін|bepul"), "iu");
  const EXCHANGE_RE = new RegExp(word("обмін|обмен|zamienię|zamienie|zamiana|schimb|замяна|айырбас|almashish"), "iu");
  // Substring match on purpose: OLX often fuses it to the price ("1 200 złdo negocjacji").
  const NEGOTIABLE_RE = /договірна|договорная|торг|negocjac|negociabil|договаряне|келісімді|kelishiladi/iu;

  function detectCurrency(raw) {
    const s = String(raw || "");
    for (const c of CURRENCIES) if (c.re.test(s)) return c.sym;
    return "";
  }

  function currencyFromCode(code) {
    if (!code) return "";
    const s = String(code).trim();
    return CODE_TO_SYM[s.toUpperCase()] || detectCurrency(s);
  }

  /*
   * Resolve thousands vs decimal separators in an isolated numeric token.
   *   "1 200" → 1200   "1,200" → 1200   "1.299,00" → 1299   "480,00" → 480
   *   "19.990" → 19990 "19.99" → 19.99
   */
  function parseNumber(token) {
    if (token == null) return null;
    const t = cleanText(token).replace(/['’]/g, " ");
    if (!/\d/.test(t)) return null;
    const lastComma = t.lastIndexOf(",");
    const lastDot = t.lastIndexOf(".");
    let dec = null;
    if (lastComma > -1 && lastDot > -1) {
      dec = lastComma > lastDot ? "," : ".";
    } else if (lastComma > -1 || lastDot > -1) {
      const sep = lastComma > -1 ? "," : ".";
      const parts = t.split(sep);
      const thousands = parts.length > 2 || parts[parts.length - 1].length === 3;
      dec = thousands ? null : sep;
    }
    let digits = t.replace(/ /g, "");
    if (dec === ",") digits = digits.replace(/\./g, "").replace(",", ".");
    else if (dec === ".") digits = digits.replace(/,/g, "");
    else digits = digits.replace(/[.,]/g, "");
    const n = parseFloat(digits);
    return Number.isFinite(n) ? n : null;
  }

  /*
   * Full price analysis of a node's text.
   * Returns { value, currency, kind: 'price'|'free'|'exchange'|'none', negotiable, raw }.
   *  - Prefers currency-adjacent numbers, so badges/photo counts ("1 фото") and
   *    titles can't be glued onto the price.
   *  - If an old (crossed-out) and a new price survive in one node, the lower
   *    same-currency value is the current price.
   */
  function parsePriceInfo(raw, fallbackCurrency = "") {
    const text = cleanText(raw);
    const info = { value: null, currency: "", kind: "none", negotiable: NEGOTIABLE_RE.test(text), raw: text };
    if (!text) return info;

    const found = [];
    PRICE_RE.lastIndex = 0;
    let m;
    while ((m = PRICE_RE.exec(text))) {
      const num = m[1] || m[4];
      const cur = detectCurrency(m[2] || m[3]);
      const value = parseNumber(num);
      if (value != null) found.push({ value, cur });
    }

    if (found.length) {
      const cur = found[0].cur;
      const same = found.filter((f) => f.cur === cur).map((f) => f.value);
      info.value = Math.min(...same);
      info.currency = cur;
    } else {
      const n = text.match(FIRST_NUM_RE);
      if (n) {
        info.value = parseNumber(n[0]);
        info.currency = detectCurrency(text) || fallbackCurrency;
      }
    }

    if (info.value != null && info.value >= 1 && info.value < 1e10) {
      info.value = Math.round(info.value);
      info.kind = "price";
    } else {
      info.value = null;
      if (FREE_RE.test(text)) info.kind = "free";
      else if (EXCHANGE_RE.test(text)) info.kind = "exchange";
    }
    return info;
  }

  // Back-compat shorthand → number | null.
  function parsePrice(raw) {
    return parsePriceInfo(raw).value;
  }

  // Short text that is "just a price" (used to reject price nodes as titles).
  function looksLikePrice(str) {
    const s = cleanText(str);
    return s.length <= 40 && (PRICE_TEST_RE.test(s) || FREE_RE.test(s) || EXCHANGE_RE.test(s));
  }

  function hasPriceText(str) {
    return PRICE_TEST_RE.test(cleanText(str));
  }

  function formatPrice(n, currency) {
    if (n == null) return "—";
    const grouped = Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return currency ? `${grouped} ${currency}` : grouped;
  }

  function formatPercent(delta) {
    if (delta == null || !Number.isFinite(delta)) return "";
    const pct = Math.round(delta * 100);
    if (pct === 0) return "0%";
    return `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`;
  }

  // Round DOWN to a step that looks natural for the magnitude (for offers).
  function niceStep(n) {
    if (n < 100) return 5;
    if (n < 1000) return 10;
    if (n < 5000) return 50;
    if (n < 20000) return 100;
    if (n < 100000) return 500;
    return 1000;
  }

  function roundNice(n) {
    if (n == null || !Number.isFinite(n)) return null;
    const step = niceStep(n);
    return Math.max(step, Math.floor(n / step) * step);
  }

  // Numeric "size" (m², storage GB, litres) from title/params text.
  function extractSize(str) {
    const norm = fold(str);
    const m =
      norm.match(/(\d+[.,]?\d*)\s?(?:м2|кв\.?\s?м|m2|mkw)/) ||
      norm.match(/(\d+[.,]?\d*)\s?(?:гб|gb|тб|tb)/) ||
      norm.match(/(\d+[.,]?\d*)\s?(?:л|литр|l)(?![\p{L}])/u);
    if (!m) return null;
    const val = parseFloat(m[1].replace(",", "."));
    return Number.isFinite(val) ? val : null;
  }

  /* ---------- OLX URLs ---------- */

  // Stable ad id from an OLX ad URL: ".../iphone-13-IDabc12.html" → "abc12".
  function adIdFromUrl(url) {
    const m = String(url || "").match(/-ID([0-9A-Za-z]+)\.html/);
    return m ? m[1] : null;
  }

  function isAdUrl(url) {
    const s = String(url || "");
    return /-ID[0-9A-Za-z]+\.html/.test(s) || /\/d\/(?:[a-z]{2}\/)?(?:obyavlenie|oferta|ogloszenie|ad)\//i.test(s);
  }

  /* ---------- timing ---------- */

  /*
   * Trailing debounce with an optional maxWait, so a continuous stream of
   * events (infinite scroll, carousels) still produces a run every `maxWait`.
   */
  function debounce(fn, wait, { maxWait = 0 } = {}) {
    let timer = null;
    let firstAt = 0;
    let lastArgs = null;

    function invoke() {
      clearTimeout(timer);
      timer = null;
      firstAt = 0;
      const args = lastArgs || [];
      lastArgs = null;
      fn.apply(null, args);
    }

    function debounced(...args) {
      lastArgs = args;
      const now = Date.now();
      if (!firstAt) firstAt = now;
      clearTimeout(timer);
      const left = maxWait ? maxWait - (now - firstAt) : Infinity;
      if (left <= 0) return invoke();
      timer = setTimeout(invoke, Math.min(wait, left));
    }
    debounced.cancel = () => {
      clearTimeout(timer);
      timer = null;
      firstAt = 0;
      lastArgs = null;
    };
    debounced.flush = () => timer && invoke();
    return debounced;
  }

  /* ---------- clipboard ---------- */

  // Clipboard API first; falls back to execCommand when the page isn't
  // focused or a permissions policy blocks clipboard-write.
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.setAttribute("data-olxsh", "clipboard");
      ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  /* ---------- debug logger (gated by the `debug` flag in storage) ---------- */

  const debug = {
    enabled: false,
    _last: 0,
    set(v) {
      this.enabled = !!v;
    },
    // Throttle noisy per-run summaries to at most once per `ms`.
    throttle(ms = 1500) {
      const now = Date.now();
      if (now - this._last < ms) return false;
      this._last = now;
      return true;
    },
    log(...args) {
      if (this.enabled) console.log("%c[OLX Helper]", "color:#23e5db;font-weight:bold", ...args);
    },
    warn(...args) {
      if (this.enabled) console.warn("%c[OLX Helper]", "color:#ffab00;font-weight:bold", ...args);
    },
    // Structured event: console-logs AND appends to a small rolling buffer in
    // storage (max 20) so the Options debug panel can show recent diagnostics.
    event(type, payload) {
      if (!this.enabled) return;
      this.log(type, payload || "");
      try {
        chrome.storage.local.get("olxsh_debug", (o) => {
          const buf = (o && o["olxsh_debug"]) || [];
          buf.push({ t: Date.now(), type, payload });
          while (buf.length > 20) buf.shift();
          chrome.storage.local.set({ olxsh_debug: buf });
        });
      } catch (e) {
        /* ignore */
      }
    },
  };
  OLXHelper.debug = debug;

  OLXHelper.utils = {
    REGIONS,
    region,
    decodeEntities,
    cleanText,
    fold,
    normalize,
    stripEmoji,
    truncate,
    STOPWORDS,
    BRANDS,
    tokenize,
    isBrand,
    extractBrandHints,
    isJunkTitle,
    buildSearchQuery,
    detectCurrency,
    currencyFromCode,
    parseNumber,
    parsePriceInfo,
    parsePrice,
    looksLikePrice,
    hasPriceText,
    formatPrice,
    formatPercent,
    roundNice,
    niceStep,
    extractSize,
    adIdFromUrl,
    isAdUrl,
    debounce,
    copyText,
  };
})();
