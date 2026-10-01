/*
 * OLX Smart Helper — shared logic for extension pages (popup + options).
 * Loaded after i18n.js, store.js and presets.js. Exposes `OLXHelper.pages`.
 */
(function () {
  "use strict";

  const H = (window.OLXHelper = window.OLXHelper || {});
  const I18N = H.i18n;
  const t = (key, params) => I18N.t(key, params);

  /* ---------- DOM helpers ---------- */

  const ICONS = {
    drag: "M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
    star: "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
    starOutline: "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    chat: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z",
    plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    bookmark: "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z",
    open: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
    info: "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
  };

  function icon(name) {
    const NS = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "ico");
    s.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", ICONS[name]);
    s.appendChild(p);
    return s;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function iconButton(name, label, cls, onClick) {
    const b = el("button", `icon-btn${cls ? " " + cls : ""}`);
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild(icon(name));
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  function appVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch (e) {
      return "—";
    }
  }

  /* ---------- toast (with optional action, e.g. Undo) ---------- */

  function toast(message, { actionLabel, onAction, duration = 2600 } = {}) {
    let host = document.querySelector(".toast-host");
    if (!host) {
      host = el("div", "toast-host");
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    const node = el("div", "toast");
    node.appendChild(el("span", null, message));
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      node.classList.remove("is-shown");
      setTimeout(() => node.remove(), 250);
    };
    if (actionLabel) {
      const b = el("button", "toast-action", actionLabel);
      b.type = "button";
      b.addEventListener("click", () => {
        close();
        onAction && onAction();
      });
      node.appendChild(b);
    }
    host.appendChild(node);
    requestAnimationFrame(() => node.classList.add("is-shown"));
    setTimeout(close, duration);
    return close;
  }

  /* ---------- i18n wiring ---------- */

  // Wait for the stored language, translate static markup, run `render`;
  // repeat both whenever the language changes (here or in another surface).
  function boot(render) {
    const run = () => {
      I18N.apply(document);
      render();
    };
    I18N.ready.then(() => {
      run();
      I18N.onChange(run);
    });
  }

  // Fills a <select> with "Auto" + the 5 languages (in their own names).
  function bindLanguageSelect(select, currentEl) {
    function fill() {
      select.replaceChildren();
      const auto = el("option", null, t("lang.auto"));
      auto.value = "auto";
      select.appendChild(auto);
      for (const code of I18N.LOCALES) {
        const o = el("option", null, I18N.NATIVE_NAMES[code]);
        o.value = code;
        o.lang = code;
        select.appendChild(o);
      }
      select.value = I18N.getPreference();
      if (currentEl) currentEl.textContent = t("lang.current", { lang: I18N.NATIVE_NAMES[I18N.getActive()] });
    }
    select.addEventListener("change", () => I18N.setPreference(select.value));
    fill();
    return fill;
  }

  /* ---------- FLIP: animate siblings to their new positions ---------- */

  function flip(container, mutate) {
    const before = new Map([...container.children].map((n) => [n, n.getBoundingClientRect().top]));
    mutate();
    const moved = [];
    for (const n of container.children) {
      const prev = before.get(n);
      if (prev == null) continue;
      const dy = prev - n.getBoundingClientRect().top;
      if (!dy) continue;
      n.style.transition = "none";
      n.style.transform = `translateY(${dy}px)`;
      moved.push(n);
    }
    void container.offsetHeight; // commit the inverted positions before animating
    requestAnimationFrame(() => {
      for (const n of moved) {
        n.style.transition = "";
        n.style.transform = "";
      }
    });
  }

  /* ---------- message template manager ---------- */

  /*
   * Renders presets into `root` with:
   *   drag handle (mouse drag, or ↑/↓ keys while the handle is focused),
   *   ★ default toggle, inline edit, animated delete with Undo.
   * Keeps in sync with changes made in other surfaces via storage events.
   */
  function createPresetManager(root) {
    const P = H.presets;
    let list = [];
    let busy = false; // dragging or editing: ignore external refreshes
    let dragging = null;
    let startOrder = "";

    const ids = () => [...root.querySelectorAll(".preset[data-id]")].map((n) => n.dataset.id);

    async function load() {
      list = await P.getAll();
      render();
    }

    function render() {
      root.replaceChildren();
      if (!list.length) {
        const empty = el("div", "empty");
        empty.append(icon("chat"), el("span", null, `${t("presets.empty")}. ${t("presets.emptyHint")}`));
        root.appendChild(empty);
        return;
      }
      for (const p of list) root.appendChild(row(p));
    }

    function row(p) {
      const r = el("div", `item preset${p.isDefault ? " is-default" : ""}`);
      r.dataset.id = p.id;

      const handle = iconButton("drag", t("presets.drag"), "handle");
      handle.addEventListener("pointerdown", () => (r.draggable = true));
      handle.addEventListener("pointerup", () => (r.draggable = false));
      handle.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          move(r, e.key === "ArrowUp" ? -1 : 1);
        }
      });
      r.addEventListener("dragstart", onDragStart);
      r.addEventListener("dragend", onDragEnd);

      const star = iconButton(
        p.isDefault ? "star" : "starOutline",
        t(p.isDefault ? "presets.isDefault" : "presets.makeDefault"),
        p.isDefault ? "is-on" : "",
        async () => {
          list = await P.setDefault(p.id);
          render();
        }
      );

      const main = el("div", "item-main");
      const title = el("div", "item-title", p.label);
      if (p.isDefault) {
        const tag = el("span", "chip chip-accent preset-default-tag", t("presets.default"));
        title.appendChild(tag);
      }
      main.append(title, el("div", "item-sub", p.text));
      main.title = p.text;

      const edit = iconButton("edit", t("presets.edit"), "", () => startEdit(r, p));
      const del = iconButton("trash", t("common.delete"), "is-danger", () => removePreset(r, p));
      r.append(handle, star, main, edit, del);
      return r;
    }

    /* drag & drop (live reorder with FLIP) */

    function onDragStart(e) {
      dragging = e.currentTarget;
      busy = true;
      startOrder = ids().join();
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", dragging.dataset.id);
      } catch (err) {
        /* some engines refuse custom data; reordering still works */
      }
      requestAnimationFrame(() => dragging && dragging.classList.add("is-dragging"));
    }

    // The row whose vertical midpoint is the first one below the pointer.
    function rowBelow(y) {
      let best = null;
      let bestOffset = -Infinity;
      for (const c of root.querySelectorAll(".preset:not(.is-dragging)")) {
        const box = c.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > bestOffset) {
          bestOffset = offset;
          best = c;
        }
      }
      return best;
    }

    root.addEventListener("dragover", (e) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const ref = rowBelow(e.clientY);
      if (ref === dragging.nextElementSibling || (ref === null && root.lastElementChild === dragging)) return;
      flip(root, () => root.insertBefore(dragging, ref));
    });
    root.addEventListener("drop", (e) => dragging && e.preventDefault());

    async function onDragEnd() {
      const r = dragging;
      dragging = null;
      busy = false;
      if (!r) return;
      r.draggable = false;
      r.classList.remove("is-dragging");
      if (ids().join() !== startOrder) await persistOrder();
    }

    async function move(r, dir) {
      const sibling = dir < 0 ? r.previousElementSibling : r.nextElementSibling;
      if (!sibling) return;
      flip(root, () => (dir < 0 ? root.insertBefore(r, sibling) : root.insertBefore(sibling, r)));
      r.classList.add("is-lifted");
      setTimeout(() => r.classList.remove("is-lifted"), 300);
      r.querySelector(".handle").focus();
      await persistOrder();
    }

    async function persistOrder() {
      list = await P.reorder(ids());
    }

    /* delete with collapse animation + undo */

    async function removePreset(r, p) {
      const index = list.findIndex((x) => x.id === p.id);
      r.style.maxHeight = r.offsetHeight + "px";
      void r.offsetHeight;
      r.classList.add("is-removing");
      list = await P.remove(p.id);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        render(); // also refreshes the default star if the default was removed
      };
      r.addEventListener("transitionend", (e) => e.propertyName === "max-height" && finish());
      setTimeout(finish, 400);

      toast(t("presets.deleted", { label: p.label }), {
        actionLabel: t("common.undo"),
        duration: 5000,
        onAction: async () => {
          list = await P.restore(p, index);
          render();
          root.querySelector(`.preset[data-id="${CSS.escape(p.id)}"]`)?.classList.add("is-entering");
        },
      });
    }

    /* inline edit */

    function startEdit(r, p) {
      busy = true;
      const form = presetForm(
        p,
        async (label, text) => {
          list = await P.update(p.id, { label, text });
          busy = false;
          render();
        },
        () => {
          busy = false;
          render();
        }
      );
      r.replaceWith(form);
      form.querySelector(".input").focus();
    }

    function presetForm(p, onSave, onCancel) {
      const form = el("div", "preset-form");
      const label = el("input", "input");
      label.type = "text";
      label.placeholder = t("presets.name");
      label.value = p.label;
      const text = el("textarea", "textarea");
      text.placeholder = t("presets.text");
      text.value = p.text;

      const save = () => (text.value.trim() ? onSave(label.value, text.value) : text.focus());
      form.addEventListener("keydown", (e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.target === label || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save();
        }
      });

      const actions = el("div", "btn-row");
      const cancel = el("button", "btn btn-sm", t("common.cancel"));
      cancel.type = "button";
      cancel.addEventListener("click", onCancel);
      const ok = el("button", "btn btn-sm btn-primary", t("common.save"));
      ok.type = "button";
      ok.addEventListener("click", save);
      actions.append(cancel, ok);
      form.append(label, text, actions);
      return form;
    }

    async function add(label, text) {
      list = await P.add({ label, text });
      render();
      root.lastElementChild?.classList.add("is-entering");
    }

    // Popup and options page can be open at the same time. onChanged may fire
    // before our own `list = await P.x()` continuation runs, so the check is
    // deferred and re-reads storage; only a genuinely foreign change re-renders.
    let syncTimer = null;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes[P.KEY]) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(async () => {
          if (busy) return;
          const next = await P.getAll();
          if (busy || JSON.stringify(next) === JSON.stringify(list)) return;
          list = next;
          render();
        }, 120);
      });
    } catch (e) {
      /* storage events unavailable */
    }

    return { load, render, add };
  }

  // Wires an "add template" form (name + text + button) to a manager.
  function bindPresetAdd({ label, text, button, manager }) {
    const submit = async () => {
      if (!text.value.trim()) return text.focus();
      await manager.add(label.value, text.value);
      label.value = "";
      text.value = "";
      label.focus();
    };
    button.addEventListener("click", submit);
    for (const input of [label, text]) {
      input.addEventListener("keydown", (e) => {
        const multiline = input.tagName === "TEXTAREA";
        if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submit();
        }
      });
    }
  }

  H.pages = {
    t,
    el,
    icon,
    iconButton,
    appVersion,
    toast,
    boot,
    bindLanguageSelect,
    flip,
    createPresetManager,
    bindPresetAdd,
  };
})();
