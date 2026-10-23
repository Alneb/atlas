// A read-only look at the RUNNING Atlas, in WebKit (the engine of the desktop window), on the user's real vault:
// the page talks to the live core, but nothing it does can change the vault — API GETs go through, every write
// is answered here with `{}`, and the event socket is closed. What passes in Playwright's throwaway workspace and
// still fails in the app is found this way (docs/guides/DEVELOPING.md, "Checking on the real vault").
//
//   node scripts/dev/webkit-probe.mjs [--dist ui/dist] [--shot out.png] [script.mjs]    # shot: else target/webkit-probe.png
//
// --dist: serve this build of the interface instead of the one the core serves (a fix not installed yet).
// script.mjs: `export default async ({ page, errs }) => { … }`, run with the page open; without one, the page is
// opened, errors printed and a screenshot taken. The core's port comes from <vault>/.atlas/cache/server.json
// (ATLAS_VAULT) or ATLAS_URL.
//
// WebKit on Fedora: Playwright's build wants Ubuntu's libicu74, libjpeg-turbo8 and libbacktrace0, and
// libjxl.so.0.8 — copied into ~/.cache/ms-playwright/webkit-<n>/minibrowser-{wpe,gtk}/lib/ (see DEVELOPING.md);
// run with PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { webkit } = createRequire(join(here, "../../ui/package.json"))("playwright");
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".wasm": "application/wasm", ".json": "application/json", ".png": "image/png", ".bcmap": "application/octet-stream", ".pfb": "application/octet-stream", ".ttf": "font/ttf", ".icc": "application/octet-stream" };
// reads sent as POST (a query body), let through
const READS = /\/api\/(base\/query|view|link-mention|search)/;
/** A plugin's fetch that only reads: a GET written nowhere (a copyparty listing) — let through to the real server. */
const readingFetch = (req) => {
  if (!/\/api\/plugins\/[^/]+\/fetch$/.test(new URL(req.url()).pathname)) return false;
  try { const b = JSON.parse(req.postData() ?? "{}"); return (b.method ?? "GET").toUpperCase() === "GET" && !b.save_to && !b.body_file; } catch { return false; }
};
// ATLAS_PROBE_COPY=1: the vault behind ATLAS_URL is a copy (target/probe-vault…), so writes and plugin helper calls go
// through too — a plugin's view that asks its helper (POST) shows what it really shows
const COPY = !!process.env.ATLAS_PROBE_COPY;

/** The live core's address: ATLAS_URL, else the vault's server.json. */
export function coreUrl() {
  if (process.env.ATLAS_URL) return process.env.ATLAS_URL;
  const vault = process.env.ATLAS_VAULT;
  if (!vault) throw new Error("set ATLAS_URL, or ATLAS_VAULT to the vault whose core to probe");
  const info = JSON.parse(readFileSync(join(vault, ".atlas/cache/server.json"), "utf8"));
  return `http://127.0.0.1:${info.port}/`;
}

/** The key a locked core (the desktop's default) left for this user, as the CLI reads it (auth.rs `local_key_file`). */
function localKey(url) {
  const f = join(process.env.XDG_RUNTIME_DIR ?? "/tmp", "atlas", `server-${new URL(url).port}.key`);
  return existsSync(f) ? readFileSync(f, "utf8").trim() : "";
}

/** A WebKit page on the running Atlas that cannot write. `dist`: the interface from this folder. */
export async function readOnlyPage({ url = coreUrl(), dist, width = 1500, height = 900 } = {}) {
  const browser = await webkit.launch();
  const key = localKey(url);
  // ATLAS_PROBE_SCALE=2: a HiDPI screen (canvases sized by devicePixelRatio look different there)
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(process.env.ATLAS_PROBE_SCALE ?? 1), extraHTTPHeaders: key ? { "x-atlas-token": key } : {} });
  if (key) await page.context().addCookies([{ name: "atlas_local", value: key, url }]);
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route("**/*", async (r) => {
    const req = r.request(), u = new URL(req.url());
    if (u.pathname.startsWith("/api/")) return COPY || req.method() === "GET" || READS.test(u.pathname) || readingFetch(req) ? r.continue() : r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (dist) {
      const f = join(dist, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
      if (existsSync(f) && !f.endsWith("/")) return r.fulfill({ body: readFileSync(f), contentType: TYPES[extname(f)] ?? "application/octet-stream" });
    }
    return r.continue();
  });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(url);
  await page.waitForTimeout(5000); // the layout, the plugins, the home page
  return { browser, page, errs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const dist = opt("--dist"), shot = opt("--shot");
  const { browser, page, errs } = await readOnlyPage({ dist: dist && resolve(dist) });
  try {
    if (args[0]) await (await import(pathToFileURL(resolve(args[0])).href)).default({ page, errs });
    const out = shot ?? join(here, "../../target/webkit-probe.png"); // never the repo root (AGENTS.md)
    await page.screenshot({ path: out });
    console.log(`[probe] screenshot: ${out}`);
    console.log(`[probe] page errors: ${errs.length ? errs.slice(0, 8).join(" | ") : "none"}`);
  } finally {
    await browser.close();
  }
}
