#!/usr/bin/env node
/*
 * Renders icons/icon.svg → icon48.png + icon128.png and icons/icon-16.svg →
 * icon16.png with a transparent background, using headless Chrome over the
 * DevTools protocol. No npm dependencies (Node 22+ for the global WebSocket).
 *
 *   node tools/render-icons.mjs [path-to-chrome]
 *
 * Chrome is looked up in CHROME_PATH, the argument, then common install paths.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ICONS = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
const JOBS = [
  { svg: "icon-16.svg", out: "icon16.png", size: 16 },
  { svg: "icon.svg", out: "icon48.png", size: 48 },
  { svg: "icon.svg", out: "icon128.png", size: 128 },
];

const CANDIDATES = [
  process.env.CHROME_PATH,
  process.argv[2],
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const chromePath = CANDIDATES.find((p) => p && existsSync(p));
if (!chromePath) {
  console.error("Chrome not found — pass its path as an argument or set CHROME_PATH.");
  process.exit(1);
}

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "olxsh-icons-"));
const chrome = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--disable-gpu",
  "about:blank",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageSocketUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("Chrome DevTools endpoint did not come up");
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (const w of waiters.splice(0)) if (w.method === msg.method) w.resolve(msg.params);
        else waiters.push(w);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));
  return new Promise((resolve) => (ws.onopen = () => resolve({ send, once, close: () => ws.close() })));
}

try {
  const cdp = await connect(await pageSocketUrl());
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 256, height: 256, deviceScaleFactor: 1, mobile: false });

  for (const job of JOBS) {
    const svg = readFileSync(join(ICONS, job.svg)).toString("base64");
    const html =
      `<!doctype html><html><body style="margin:0;background:transparent">` +
      `<img src="data:image/svg+xml;base64,${svg}" width="${job.size}" height="${job.size}" style="display:block">` +
      `</body></html>`;
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: "data:text/html;base64," + Buffer.from(html).toString("base64") });
    await loaded;
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width: job.size, height: job.size, scale: 1 },
    });
    writeFileSync(join(ICONS, job.out), Buffer.from(data, "base64"));
    console.log(`icons/${job.out}  ${job.size}×${job.size}`);
  }
  cdp.close();
} finally {
  chrome.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch (e) {
    /* Chrome may still hold the profile on Windows; it is in the temp dir */
  }
}
