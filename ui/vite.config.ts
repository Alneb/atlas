import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { cpSync, existsSync, createReadStream } from "node:fs";
import { join, resolve, normalize } from "node:path";

// Offline app: libraries that fetch assets at runtime get them from the app itself — from
// node_modules in dev, copied into dist on build. pdf.js: cMaps / fonts / wasm under /pdfjs/;
// Excalidraw: its hand-drawn fonts under /excalidraw/ (window.EXCALIDRAW_ASSET_PATH).
function nodeAssets(name: string, mount: string, pkgDir: string, dirs: string[]): Plugin {
  const root = resolve(__dirname, "node_modules", pkgDir);
  return {
    name: `atlas-assets-${name}`,
    configureServer(server) {
      server.middlewares.use(mount, (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
        const file = join(root, rel);
        if (!file.startsWith(root) || !existsSync(file)) return next();
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = options.dir ?? resolve(__dirname, "dist");
      for (const d of dirs) {
        const src = join(root, d);
        if (existsSync(src)) cpSync(src, join(out, mount.replace(/^\//, ""), d), { recursive: true });
      }
    },
  };
}

// Excalidraw draws every freehand stroke with fixed smoothing (perfect-freehand: thinning .6, smoothing .5, streamline .5),
// which rounds handwriting off and makes the settled stroke differ from the Boox's quick line. This one spot asks `globalThis.__atlasInk(element)` first (lib/draw-ink.ts): a stroke the
// notepad's pen made gets crisp settings, every other stroke Excalidraw's own. A new Excalidraw that moved the code fails
// the build here rather than silently drawing the old way.
const INK_AT = /size:\s*(\w+)\.strokeWidth\s*\*\s*4\.25,\s*thinning:\s*0?\.6,\s*smoothing:\s*0?\.5,\s*streamline:\s*0?\.5/;
function rewriteInk(code: string, id: string): { code: string; hit: boolean } | null {
  if (!/@excalidraw[\\/]excalidraw/.test(id) || !code.includes("thinning")) return null;
  const out = code.replace(INK_AT, (_m, el: string) => `size:${el}.strokeWidth*4.25,...(globalThis.__atlasInk?.(${el})??{thinning:.6,smoothing:.5,streamline:.5})`);
  return { code: out, hit: out !== code };
}
function inkStroke(): Plugin {
  let hits = 0;
  return {
    name: "atlas-ink-stroke",
    transform(code, id) { const r = rewriteInk(code, id); if (!r) return null; if (r.hit) hits++; return r.hit ? { code: r.code, map: null } : null; },
    buildEnd() { if (this.meta.watchMode === false && hits === 0) this.error("atlas-ink-stroke: Excalidraw's freedraw options were not found (vite.config.ts INK_AT): the pen's crisp strokes would be lost"); },
  };
}

const API = process.env.ATLAS_API ?? "http://127.0.0.1:7717";
// a locked core (DESIGN-local-lock.md) takes its key: the dev proxy signs every request with it
const KEY = process.env.ATLAS_API_KEY;

export default defineConfig({
  plugins: [
    svelte(),
    nodeAssets("pdfjs", "/pdfjs", "pdfjs-dist", ["cmaps", "standard_fonts", "wasm", "iccs"]),
    nodeAssets("excalidraw", "/excalidraw", "@excalidraw/excalidraw/dist/prod", ["fonts"]),
    inkStroke(),
  ],
  // the dev server pre-bundles Excalidraw: the same rewrite there
  optimizeDeps: { rolldownOptions: { plugins: [{ name: "atlas-ink-stroke-deps", transform: (code: string, id: string) => rewriteInk(code, id)?.code ?? null }] } },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [".."] }, // the starter kit's files live beside ui/ (kits/), bundled as text
    // a plugin's own files (plugin-files.ts) are the core's too
    // the core takes sockets only from its own origin (server.rs origin_ok) and the dev port is picked at start
    // (5174…): the proxy, already trusted with the key, speaks as the core's own page — else events and terminals
    // fail ("Offline — retrying") in the Atlas (dev) window
    proxy: Object.fromEntries(["/api", "/plugin-files"].map((at) => [at, {
      target: API, ws: at === "/api", headers: KEY ? { authorization: `Bearer ${KEY}` } : undefined,
      configure: (proxy: { on(ev: string, fn: (req: { setHeader(k: string, v: string): void }) => void): void }) => {
        const own = new URL(API).origin;
        proxy.on("proxyReq", (req) => req.setHeader("origin", own));
        proxy.on("proxyReqWs", (req) => req.setHeader("origin", own));
      },
    }])),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 4000,
    // two pages: the app, and the quick-capture box (capture.html: a bundle of its own, so it opens fast)
    rollupOptions: { input: { main: "index.html", capture: "capture.html" } },
  },
  worker: { format: "es" },
});
