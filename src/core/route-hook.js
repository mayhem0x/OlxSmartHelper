/*
 * OLX Smart Helper — SPA route hook (runs in the page's MAIN world).
 *
 * Content scripts live in an isolated JS world: patching history.pushState
 * there never sees the calls made by OLX's Next.js router. This tiny script is
 * injected into the MAIN world at document_start, wraps pushState/replaceState
 * and re-broadcasts each call as a DOM event, which the isolated-world content
 * script can listen to (DOM events are shared between worlds).
 *
 * It never reads page data and never touches the DOM.
 */
(function () {
  "use strict";

  const FLAG = Symbol.for("olxsh.routeHook");
  if (history[FLAG]) return;
  history[FLAG] = true;

  const EVENT = "olxsh:locationchange";

  function notify() {
    try {
      window.dispatchEvent(new Event(EVENT));
    } catch (e) {
      /* never break the host router */
    }
  }

  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    if (typeof original !== "function") continue;
    history[method] = function () {
      const result = original.apply(this, arguments);
      notify();
      return result;
    };
  }
})();
