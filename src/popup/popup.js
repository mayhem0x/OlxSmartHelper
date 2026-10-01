/*
 * OLX Smart Helper — toolbar popup.
 * Quick access: interface language, message templates, debug toggle.
 * Full settings live on the options page ("All settings" button).
 */
(function () {
  "use strict";

  const H = window.OLXHelper || {};
  const { store, pages: UI } = H;
  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", async () => {
    $("ver").textContent = UI.appVersion();

    $("more").addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
      window.close();
    });

    if (!store || !H.presets) return;

    const manager = UI.createPresetManager($("presets"));
    UI.bindPresetAdd({ label: $("p-label"), text: $("p-text"), button: $("p-add"), manager });
    const refreshLanguage = UI.bindLanguageSelect($("lang"));

    const dbg = $("dbg");
    dbg.checked = await store.isDebug();
    dbg.addEventListener("change", async () => {
      await store.setDebug(dbg.checked);
      UI.toast(UI.t(dbg.checked ? "debug.on" : "debug.off"));
    });

    UI.boot(() => {
      refreshLanguage();
      manager.load();
    });
  });
})();
