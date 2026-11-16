import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { cpSync, existsSync, createReadStream, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { DEP_REWRITES, rewriteDeps } from "./scripts/dep-rewrites";
import { join, resolve, normalize } from "node:path";

// Offline app: libraries that fetch assets at runtime get them from the app itself — from
// node_modules in dev, copied into dist on build. pdf.js (the backup PDF engine): cMaps / fonts / wasm under /pdfjs/;
// Excalidraw: its hand-drawn fonts under /excalidraw/ (window.EXCALIDRAW_ASSET_PATH). TikZJax (lib/tikz.ts): TeX's
// WebAssembly, its format, the TeX files it reads and the Computer Modern fonts under /tikzjax/.
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

// TeX packages TikZJax does not ship (tikz-feynman and what it loads; src/vendor/tex-extra/README.md), kept as plain text
// in the repository and served gzipped beside TikZJax's own, as TeX in the page asks for them: /tikzjax/tex_files/<f>.gz.
function texExtra(): Plugin {
  const dir = resolve(__dirname, "src/vendor/tex-extra/tex_files"), mount = "/tikzjax/tex_files/";
  const files = () => (existsSync(dir) ? readdirSync(dir) : []);
  return {
    name: "atlas-tex-extra",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0]);
        const name = url.startsWith(mount) && url.endsWith(".gz") ? url.slice(mount.length, -3) : "";
        if (!name || !files().includes(name)) return next();
        res.setHeader("Content-Type", "application/gzip");
        res.end(gzipSync(readFileSync(join(dir, name))));
      });
    },
    writeBundle(options) {
      const out = join(options.dir ?? resolve(__dirname, "dist"), mount);
      mkdirSync(out, { recursive: true });
      for (const f of files()) writeFileSync(join(out, `${f}.gz`), gzipSync(readFileSync(join(dir, f))));
    },
  };
}

// Dependencies changed at build time (scripts/dep-rewrites.ts); a rewrite whose spot a package no longer has fails the build.
function depRewrites(): Plugin {
  const hits = new Set<string>(), seen = new Set<string>();
  return {
    name: "atlas-dep-rewrites",
    transform(code, id) {
      for (const r of DEP_REWRITES) if (r.pkg.test(id)) seen.add(r.name);
      const out = rewriteDeps(code, id);
      if (!out) return null;
      out.hit.forEach((h) => hits.add(h));
      return { code: out.code, map: null };
    },
    // a package the build loaded whose spot was nowhere in it
    buildEnd() {
      if (this.meta.watchMode !== false) return;
      for (const r of DEP_REWRITES) if (seen.has(r.name) && !hits.has(r.name)) this.error(`atlas-dep-rewrites: ${r.name} not found (scripts/dep-rewrites.ts): ${r.lost}`);
    },
  };
}

const API = process.env.ATLAS_API ?? "http://127.0.0.1:7717";
// a locked core (DESIGN-local-lock.md) takes its key: the dev proxy signs every request with it
const KEY = process.env.ATLAS_API_KEY;

// The stamp of the core's types this interface was built against (ui/src/lib/gen, generated from the Rust): a core
// serves an installed interface only when its own stamp matches (ui_files.rs), so a new interface never reaches an
// older core. FNV-1a 64 over each file's name and bytes, sorted — crates/atlas-core/build.rs computes the same.
function coreTypes(dir = resolve(__dirname, "src/lib/gen")): string {
  let h = 0xcbf29ce484222325n;
  const eat = (bytes: Uint8Array) => { for (const b of bytes) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn; };
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".ts")).sort()) { eat(Buffer.from(`${f}\0`)); eat(readFileSync(join(dir, f))); eat(Buffer.from([0])); }
  return h.toString(16).padStart(16, "0");
}
const coreTypesStamp = (): Plugin => ({
  name: "atlas-core-types",
  apply: "build",
  writeBundle(options) { writeFileSync(join(options.dir ?? resolve(__dirname, "dist"), "core-types"), coreTypes()); },
});

export default defineConfig({
  plugins: [
    svelte(),
    nodeAssets("pdfjs", "/pdfjs", "pdfjs-dist", ["cmaps", "standard_fonts", "wasm", "iccs"]),
    nodeAssets("excalidraw", "/excalidraw", "@excalidraw/excalidraw/dist/prod", ["fonts"]),
    nodeAssets("tikzjax", "/tikzjax", "@drgrice1/tikzjax/dist", ["run-tex.js", "tex.wasm.gz", "core.dump.gz", "tex_files", "fonts", "fonts.css"]),
    texExtra(),
    depRewrites(),
    coreTypesStamp(),
  ],
  // the dev server pre-bundles dependencies: the same rewrites there
  optimizeDeps: { rolldownOptions: { plugins: [{ name: "atlas-dep-rewrites-deps", transform: (code: string, id: string) => rewriteDeps(code, id)?.code ?? null }] } },
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
