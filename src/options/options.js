/*
 * OLX Smart Helper — options page.
 * Runs in the extension page context; uses i18n.js, store.js, presets.js and
 * shared/pages.js (loaded before this file). Storage formats are unchanged.
 */
(function () {
  "use strict";

  const H = window.OLXHelper || {};
  const { store, pages: UI } = H;
  const { t, el, icon, iconButton } = UI;

  const $ = (id) => document.getElementById(id);

  /* ---------- tabs ---------- */

  const TABS = ["general", "presets", "saved", "backup", "debug"];

  function selectTab(name, { focus = false } = {}) {
    const active = TABS.includes(name) ? name : "general";
    for (const tab of TABS) {
      const btn = $(`tab-${tab}`);
      const on = tab === active;
      btn.setAttribute("aria-selected", String(on));
      btn.tabIndex = on ? 0 : -1;
      $(`panel-${tab}`).hidden = !on;
    }
    if (focus) $(`tab-${active}`).focus();
    if (location.hash !== `#${active}`) history.replaceState(null, "", `#${active}`);
  }

  function wireTabs() {
    for (const tab of TABS) $(`tab-${tab}`).addEventListener("click", () => selectTab(tab));
    document.querySelector(".tabs").addEventListener("keydown", (e) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const current = TABS.findIndex((tab) => $(`tab-${tab}`).getAttribute("aria-selected") === "true");
      selectTab(TABS[(current + keys[e.key] + TABS.length) % TABS.length], { focus: true });
    });
    window.addEventListener("hashchange", () => selectTab(location.hash.slice(1)));
    selectTab(location.hash.slice(1));
  }

  /* ---------- formatting ---------- */

  function fmtPrice(p, cur) {
    if (p == null) return "—";
    return Math.round(p).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (cur ? " " + cur : "");
  }

  function fmtDate(ts) {
    try {
      return ts ? new Date(ts).toLocaleDateString(H.i18n.getActive()) : "";
    } catch (e) {
      return "";
    }
  }

  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString(H.i18n.getActive());
    } catch (e) {
      return "";
    }
  }

  function emptyState(iconName, text) {
    const e = el("div", "empty");
    e.append(icon(iconName), el("span", null, text));
    return e;
  }

  // Collapse a row out of a list, then run `done`.
  function collapseOut(row, done) {
    row.style.maxHeight = row.offsetHeight + "px";
    void row.offsetHeight;
    row.classList.add("is-removing");
    let fired = false;
    const finish = () => {
      if (fired) return;
      fired = true;
      done();
    };
    row.addEventListener("transitionend", (e) => e.propertyName === "max-height" && finish());
    setTimeout(finish, 400);
  }

  /* ---------- saved listings (watchlist) ---------- */

  async function renderWatchlist() {
    const box = $("watchlist");
    if (!store) {
      box.replaceChildren(emptyState("info", t("common.storageUnavailable")));
      return;
    }
    const items = await store.getWatchlist();
    const count = $("saved-count");
    count.hidden = !items.length;
    count.textContent = String(items.length);

    if (!items.length) {
      box.replaceChildren(emptyState("bookmark", t("saved.empty", { save: t("w.meta.save") })));
      return;
    }
    box.replaceChildren(...items.map(savedRow));
  }

  function savedRow(r) {
    const row = el("div", "item saved");
    const main = el("div", "item-main");

    const title = el("div", "item-title");
    const link = el("a", null, r.title || t("common.untitled"));
    link.href = r.url || "#";
    link.target = "_blank";
    link.rel = "noopener";
    title.appendChild(link);
    main.appendChild(title);

    const meta = el("div", "saved-meta");
    meta.appendChild(el("span", "saved-price", fmtPrice(r.price, r.currency)));
    const status = r.status || "not_contacted";
    const chip = el("span", "chip", t(`status.${status}`));
    chip.dataset.status = status;
    meta.appendChild(chip);
    if (r.savedAt) meta.appendChild(el("span", "saved-date", t("saved.on", { date: fmtDate(r.savedAt) })));
    main.appendChild(meta);

    if (r.note) main.appendChild(el("div", "saved-note", r.note));
    row.appendChild(main);

    const open = iconButton("open", r.title || t("common.untitled"), "", () => window.open(r.url, "_blank", "noopener"));
    const remove = iconButton("trash", t("saved.remove"), "is-danger", async () => {
      await store.remove(r.id);
      collapseOut(row, renderWatchlist);
      UI.toast(t("saved.remove") + ": " + (r.title || t("common.untitled")), {
        actionLabel: t("common.undo"),
        duration: 5000,
        onAction: async () => {
          await store.upsert(r.id, r); // full record back, including note/status/savedAt
          renderWatchlist();
        },
      });
    });
    row.append(open, remove);
    return row;
  }

  /* ---------- CSV export ---------- */

  function csvCell(val) {
    const s = val == null ? "" : String(val);
    return '"' + s.replace(/"/g, '""') + '"'; // RFC 4180
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function wireCsv() {
    $("wl-csv").addEventListener("click", async () => {
      const items = await store.getWatchlist();
      if (!items.length) return UI.toast(t("saved.csvEmpty"));
      const cols = ["title", "url", "price", "currency", "status", "note", "savedAt"];
      const rows = [cols.join(",")];
      for (const r of items) {
        rows.push(
          [
            csvCell(r.title),
            csvCell(r.url),
            csvCell(r.price),
            csvCell(r.currency),
            csvCell(r.status ? t(`status.${r.status}`) : ""),
            csvCell(r.note),
            csvCell(r.savedAt ? new Date(r.savedAt).toISOString() : ""),
          ].join(",")
        );
      }
      // BOM so Excel opens UTF-8 correctly.
      download("olx-watchlist.csv", "﻿" + rows.join("\r\n"), "text/csv;charset=utf-8");
      UI.toast(t("saved.csvDone", { n: items.length }));
    });
  }

  /* ---------- backup: export / import ---------- */

  function setStatus(msg, kind) {
    const s = $("b-status");
    s.textContent = msg || "";
    s.className = "status-line mt" + (kind ? ` is-${kind}` : "");
  }

  let pendingMode = "merge";

  function wireBackup() {
    const file = $("b-file");

    $("b-export").addEventListener("click", async () => {
      const bundle = await store.exportAll();
      download("olx-smart-helper-backup.json", JSON.stringify(bundle, null, 2), "application/json");
      setStatus(t("backup.exported"), "ok");
    });

    $("b-import").addEventListener("click", () => {
      pendingMode = "merge";
      file.click();
    });
    $("b-import-replace").addEventListener("click", () => {
      if (!confirm(t("backup.confirmReplace"))) return;
      pendingMode = "replace";
      file.click();
    });

    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        let bundle;
        try {
          bundle = JSON.parse(reader.result);
        } catch (e) {
          setStatus(t("backup.badJson"), "err");
          file.value = "";
          return;
        }
        try {
          const res = await store.importAll(bundle, pendingMode);
          setStatus(t(res.mode === "replace" ? "backup.replaced" : "backup.imported", { p: res.presets, l: res.listings }), "ok");
          renderWatchlist();
          presetManager.load();
          renderDebug();
          syncDebugToggle();
        } catch (e) {
          const msg = e && e.code === "invalid_bundle" ? t("backup.badFormat") : (e && e.message) || t("backup.badJson");
          setStatus(t("backup.error", { msg }), "err");
        }
        file.value = "";
      };
      reader.onerror = () => setStatus(t("backup.readError"), "err");
      reader.readAsText(f);
    });
  }

  /* ---------- debug ---------- */

  async function syncDebugToggle() {
    $("dbg").checked = await store.isDebug();
  }

  function shortPayload(p) {
    if (p == null) return "";
    try {
      return typeof p === "string" ? p : JSON.stringify(p);
    } catch (e) {
      return String(p);
    }
  }

  async function renderDebug() {
    const list = $("dbg-list");
    const events = await store.getDebugEvents();
    if (!events.length) {
      list.replaceChildren(emptyState("info", t("debug.empty")));
      return;
    }
    list.replaceChildren(
      ...events
        .slice()
        .reverse()
        .map((ev) => {
          const warn = ev.type === "unmatched-card" || ev.type === "no-title";
          const row = el("div", "log-row");
          row.append(
            el("span", "log-time", fmtTime(ev.t)),
            el("span", `log-type${warn ? " is-warn" : ""}`, ev.type),
            el("span", "log-payload", shortPayload(ev.payload))
          );
          row.title = shortPayload(ev.payload);
          return row;
        })
    );
  }

  function wireDebug() {
    const box = $("dbg");
    box.addEventListener("change", async () => {
      await store.setDebug(box.checked);
      UI.toast(t(box.checked ? "debug.on" : "debug.off"));
    });
    $("dbg-refresh").addEventListener("click", renderDebug);
    $("dbg-clear").addEventListener("click", async () => {
      await store.clearDebugEvents();
      renderDebug();
    });
    $("dbg-copy").addEventListener("click", async () => {
      const events = await store.getDebugEvents();
      const header = [
        t("debug.diagTitle"),
        `${t("common.version")}: ${UI.appVersion()}`,
        `${t("debug.diagDate")}: ${new Date().toISOString()}`,
        `${t("debug.diagCount")}: ${events.length}`,
        "----------------------------------------",
      ].join("\n");
      const lines = events.map((ev) => `[${fmtTime(ev.t)}] ${ev.type} ${shortPayload(ev.payload)}`);
      const text = header + "\n" + (lines.join("\n") || t("debug.diagNone"));
      navigator.clipboard
        .writeText(text)
        .then(() => UI.toast(t("debug.copied")))
        .catch(() => UI.toast(t("common.copyFailed")));
    });
  }

  /* ---------- boot ---------- */

  let presetManager;

  document.addEventListener("DOMContentLoaded", () => {
    $("app-version").textContent = UI.appVersion();
    wireTabs();

    if (!store || !H.presets) {
      $("presets").replaceChildren(emptyState("info", t("common.storageUnavailable")));
      return;
    }

    presetManager = UI.createPresetManager($("presets"));
    UI.bindPresetAdd({ label: $("p-label"), text: $("p-text"), button: $("p-add"), manager: presetManager });
    const refreshLanguage = UI.bindLanguageSelect($("lang"), $("lang-current"));

    wireCsv();
    wireBackup();
    wireDebug();
    syncDebugToggle();

    // Everything that renders text re-runs when the language changes.
    UI.boot(() => {
      refreshLanguage();
      presetManager.load();
      renderWatchlist();
      renderDebug();
    });
  });
})();
