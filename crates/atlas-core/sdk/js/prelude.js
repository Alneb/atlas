// SPDX-License-Identifier: MIT OR Apache-2.0  (the plugin SDK, as atlas_plugin.py; Atlas itself is AGPL-3.0-or-later)
// The `atlas` object of a JavaScript helper (docs/guides/PLUGIN-API.md, "JavaScript helpers"). The core runs it before
// the plugin's helper.js, in the plugin's own QuickJS context (js_helper.rs); the node test harness (testing.ts) runs
// the same file. It speaks the helper protocol of every helper over `__host.send(line)` / `__atlas_receive(line)`:
//   core → helper  {"id", "method", "params"}   and  {"reply", "status", "body"}
//   helper → core  {"id", "result"|"error"}, {"event", "data"}  and  {"call", "verb", "path", "body"}
// so everything a Python helper reaches (the API, `fetch` within `[permissions] net`, its secrets) it reaches the same way.
"use strict";
(function (host) {
  if (!host) throw new Error("the Atlas helper prelude runs only where the core (or the test harness) set __host");
  const methods = Object.create(null);
  const waiting = new Map();
  let calls = 0;

  class AtlasError extends Error {
    constructor(why, status) {
      super(why);
      this.name = "AtlasError";
      this.status = status;
    }
  }

  const send = (msg) => host.send(JSON.stringify(msg));
  const show = (v) => {
    if (typeof v === "string") return v;
    if (v instanceof Error) return v.stack ? `${v.name}: ${v.message}\n${v.stack}` : `${v.name}: ${v.message}`;
    try { return JSON.stringify(v); } catch { return String(v); }
  };

  // QuickJS has no console and no timers: both come from the core. Node keeps its own.
  if (typeof globalThis.console === "undefined") {
    const line = (level) => (...args) => host.log(`${level ? `${level}: ` : ""}${args.map(show).join(" ")}`);
    globalThis.console = { log: line(""), info: line(""), debug: line("debug"), warn: line("warn"), error: line("error") };
  }
  if (typeof globalThis.setTimeout !== "function") {
    const timers = new Map();
    let next = 0;
    const later = (id, ms) => host.timer(id, Math.max(0, Number(ms) || 0));
    globalThis.setTimeout = (fn, ms, ...args) => { const id = ++next; timers.set(id, () => fn(...args)); later(id, ms); return id; };
    globalThis.setInterval = (fn, ms, ...args) => {
      const id = ++next;
      const tick = () => { timers.set(id, tick); later(id, Math.max(1, Number(ms) || 0)); fn(...args); };
      timers.set(id, tick);
      later(id, Math.max(1, Number(ms) || 0));
      return id;
    };
    globalThis.clearTimeout = globalThis.clearInterval = (id) => { timers.delete(id); };
    globalThis.__atlas_timer = (id) => { const fn = timers.get(id); timers.delete(id); if (fn) fn(); };
  }

  /** `{a: 1, b: "x y"}` → `a=1&b=x%20y` (null and undefined left out). */
  const qs = (query) => Object.entries(query || {}).filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  const hostOf = (url) => (/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^/:?#]*)/i.exec(String(url))?.[1] ?? "").toLowerCase();

  function call(verb, path, body, query) {
    const q = qs(query);
    if (q) path += (path.includes("?") ? "&" : "?") + q;
    const n = ++calls;
    return new Promise((resolve, reject) => {
      waiting.set(n, { resolve, reject, what: `${verb} ${path}` });
      send({ call: n, verb, path, body: body === undefined ? null : body });
    });
  }
  const get = (path, query) => call("GET", path, undefined, query);
  const post = (path, body) => call("POST", path, body ?? {});
  const put = (path, body) => call("PUT", path, body);
  const del = (path, query) => call("DELETE", path, undefined, query);
  const plugin = `/api/plugins/${encodeURIComponent(host.id)}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // The web through the core's fetch (plugin_net.rs: only the manifest's `net` hosts), polite and patient as the Python
  // SDK's: one request to a host every `every` seconds at most, a busy answer or a dropped connection tried again.
  const BUSY = [429, 502, 503, 504];
  const last = new Map();
  async function fetchResponse(req) {
    return post(`${plugin}/fetch`, req);
  }
  async function fetchText(url, opts = {}) {
    const { method = "GET", headers = {}, body, timeout = 20, every = 0, missing = [404], waits = [2, 6] } = opts;
    const site = hostOf(url);
    const req = { url, method, headers, timeout_secs: timeout };
    if (body !== undefined) req.body = typeof body === "string" ? body : JSON.stringify(body);
    let pause = 0;
    for (let attempt = 0; attempt <= waits.length; attempt++) {
      if (pause) await sleep(pause * 1000);
      if (every) {
        // the slot is taken before waiting, so two calls at once are paced too
        const wait = every * 1000 - (Date.now() - (last.get(site) ?? -Infinity));
        last.set(site, Date.now() + Math.max(0, wait));
        if (wait > 0) await sleep(wait);
      }
      let res;
      try {
        res = await fetchResponse(req);
      } catch (e) {
        if (String(e && e.message).includes("error sending request") && attempt < waits.length) { pause = waits[attempt]; continue; }
        throw e;
      }
      if (BUSY.includes(res.status) && attempt < waits.length) {
        const asked = String((res.headers || {})["retry-after"] ?? "");
        pause = /^\d+(\.\d+)?$/.test(asked) ? Math.min(Number(asked), 30) : waits[attempt];
        continue;
      }
      if (missing.includes(res.status)) return null;
      if (!res.ok) throw new AtlasError(`${site} answered ${res.status}`, res.status);
      return res.text ?? "";
    }
    return null;
  }
  async function fetchJson(url, opts = {}) {
    const text = await fetchText(url, { ...opts, headers: { Accept: "application/json", ...(opts.headers || {}) } });
    return text === null ? null : JSON.parse(text || "null");
  }

  // Downloads stream to disk in the core (`save_to`: the plugin's cache, or `remote`), never through the script.
  async function download(url, saveTo, opts = {}) {
    const res = await fetchResponse({ url, headers: opts.headers || {}, timeout_secs: opts.timeout ?? 120, save_to: saveTo, save_in: opts.in });
    return { ...res, head: res.ok && res.saved && !opts.in ? native("cache.head", { name: saveTo, bytes: 8 }) : "" };
  }
  /** For a papers PDF source: `url` into the cache's `pdf/<key>.pdf`, where catalog-papers takes it; true when a PDF came. */
  async function attachPdf(key, url, opts = {}) {
    const got = await download(url, `pdf/${String(key).replace(/[^\w.-]/g, "_")}.pdf`, { headers: opts.headers, timeout: opts.timeout ?? 120 });
    return Boolean(got.ok && got.saved && got.head.startsWith("%PDF"));
  }

  // Text a port from Python needs and the engine lacks (QuickJS has no URL class): one copy for every helper.
  const escape = (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
  /** Python's `urllib.parse.quote(s, safe)`: every reserved character escaped, `!'()*` too, but those in `safe`. */
  const quote = (s, safe = "/") => [...String(s ?? "")].map((c) => (safe.includes(c) ? c : encodeURIComponent(c).replace(/[!'()*]/g, escape))).join("");
  /** `ref` read against `base`: absolute, `//host/x`, `/x`, or `x` (beside the base's last `/`). */
  function resolve(ref, base) {
    ref = String(ref ?? "");
    if (/^[a-z][a-z\d+.-]*:/i.test(ref)) return ref;
    const m = /^([a-z][a-z\d+.-]*:)(\/\/[^/?#]*)?([^?#]*)/i.exec(String(base ?? ""));
    if (!m) return ref;
    const [, scheme, origin = "", path] = m;
    if (ref.startsWith("//")) return scheme + ref;
    if (ref.startsWith("/")) return scheme + origin + ref;
    return scheme + origin + (path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "/") + ref;
  }
  /** Python's `str.title()`: each run of letters capitalised, the rest lower case. */
  const title = (s) => String(s ?? "").toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());

  // The heavy primitives, natively (js_native.rs): JSON in, JSON out.
  const native = (op, args) => JSON.parse(host.native(op, JSON.stringify(args)));

  async function dispatch(id, name, params) {
    const fn = methods[name];
    if (typeof fn !== "function") {
      send({ id, error: `no method ${JSON.stringify(name)} (has: ${Object.keys(methods).sort().join(", ") || "none"})` });
      return;
    }
    try {
      const result = await fn(params ?? {});
      send({ id, result: result === undefined ? null : result });
    } catch (e) {
      const why = e instanceof AtlasError ? e.message : e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      try { send({ id, error: why }); } catch { send({ id, error: "the answer could not be sent" }); }
    }
  }

  globalThis.__atlas_receive = (line) => {
    let m;
    try { m = JSON.parse(line); } catch { console.error(`atlas: not JSON: ${String(line).slice(0, 200)}`); return; }
    if (m && typeof m.reply === "number") {
      const w = waiting.get(m.reply);
      if (!w) return;
      waiting.delete(m.reply);
      const status = m.status ?? 500;
      if (status >= 200 && status < 300) w.resolve(m.body ?? null);
      else {
        const why = m.body && typeof m.body === "object" ? m.body.error : m.body;
        w.reject(new AtlasError(`${w.what}: ${why}`, status));
      }
    } else if (m && typeof m.method === "string") {
      void dispatch(m.id, m.method, m.params);
    }
  };

  globalThis.atlas = Object.freeze({
    /** This plugin's id. */
    id: host.id,
    AtlasError,
    /** Registers a method the core (a tool, a page, a schedule) calls: `fn(params)` → a JSON-able answer (or a promise). */
    method(name, fn) { methods[name] = fn; },
    /** Registers every function of `table` as a method. */
    methods(table) { for (const [k, fn] of Object.entries(table)) methods[k] = fn; },
    /** An event for the page's `atlas.helper.on(name, …)`. */
    event(name, data) { send({ event: name, data: data === undefined ? null : data }); },
    call, get, post, put, del, qs, sleep,
    read: async (path) => (await get("/api/file", { path })).text,
    write: (path, text) => put("/api/file", { path, text }),
    files: (index = false) => get("/api/files", { index: index ? "true" : undefined }),
    tree: (folder = "") => get("/api/tree", { path: folder }),
    search: (q, o = {}) => get("/api/search", { q, case: o.case ? "true" : undefined, word: o.word ? "true" : undefined, regex: o.regex ? "true" : undefined }),
    today: () => get("/api/today"),
    capture: (text) => post("/api/capture", { text }),
    secret: async (name) => (await get(`${plugin}/secrets/${encodeURIComponent(name)}`)).value ?? null,
    setSecret: (name, value) => put(`${plugin}/secrets/${encodeURIComponent(name)}`, { value }),
    fetch: fetchText,
    fetchJson,
    fetchResponse,
    download,
    attachPdf,
    hostOf,
    url: Object.freeze({ quote, resolve }),
    text: Object.freeze({ title }),
    html: Object.freeze({ select: (html, css) => native("html.select", { html: String(html ?? ""), css }), unescape: (text) => native("html.unescape", { text: String(text ?? "") }) }),
    csv: Object.freeze({ parse: (text, o = {}) => native("csv.parse", { text: String(text ?? ""), header: Boolean(o.header), delimiter: o.delimiter ?? "," }) }),
    zip: Object.freeze({ list: (path) => native("zip.list", { path }), read: (path, name) => native("zip.read", { path, name }) }),
    hash: Object.freeze({ sha256: (text) => native("hash.sha256", { text: String(text) }) }),
  });
})(globalThis.__host);
delete globalThis.__host;
