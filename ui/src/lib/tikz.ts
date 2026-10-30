// TikZ to SVG in the page: TeX compiled to WebAssembly (TikZJax, @drgrice1/tikzjax) runs in a worker, its files served
// by the app itself under /tikzjax/ (vite.config.ts), so nothing is fetched from the network. A picture is kept by the
// hash of its source, in memory and in IndexedDB: a note opened again draws at once. Pure parts (parsing, the TeX
// error, the SVG's ids) are exported for the tests; `renderTikz` is the one entry point.
import DOMPurify from "dompurify";

/** What a ```tikz fence holds: `\usetikzlibrary` / `\usepackage` lines, then the picture. */
export interface TikzSource {
  libraries: string[];
  packages: { name: string; options: string }[];
  body: string;
}

export type TikzResult = { ok: true; svg: string } | { ok: false; error: string };

const LIBRARY = /^\\usetikzlibrary\s*\{([^}]*)\}\s*$/;
const PACKAGE = /^\\usepackage\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}\s*$/;

/** Splits the fence: leading library / package lines (blank lines and `%` comments between them allowed), the rest. */
export function parseTikz(source: string): TikzSource {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: TikzSource = { libraries: [], packages: [], body: "" };
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("%")) continue;
    const lib = LIBRARY.exec(line);
    const pkg = PACKAGE.exec(line);
    if (lib) out.libraries.push(...lib[1].split(",").map((s) => s.trim()).filter(Boolean));
    else if (pkg) for (const name of pkg[2].split(",").map((s) => s.trim()).filter(Boolean)) out.packages.push({ name, options: pkg[1] ?? "" });
    else break;
  }
  out.body = lines.slice(i).join("\n").trim();
  out.libraries = [...new Set(out.libraries)];
  return out;
}

/** The lines of TeX's console a person needs: each `! message` with the `l.N …` line that locates it. */
export function texError(log: string[], fallback: string): string {
  const keep: string[] = [];
  for (let i = 0; i < log.length; i++) {
    const l = log[i];
    if (!l.startsWith("!") || /^! (Emergency stop|==> Fatal error)/.test(l)) continue;
    keep.push(l);
    const at = log.slice(i + 1, i + 6).find((n) => /^l\.\d+/.test(n));
    if (at) keep.push(at);
  }
  return keep.length ? [...new Set(keep)].join("\n") : fallback;
}

/** pgf names its shadings and markers `pgf…`: made unique per picture, so two pictures on a page never share one. */
export function uniqueIds(svg: string, key: string): string {
  const ids = [...new Set((svg.match(/\bid="pgf[^"]*"/g) ?? []).map((m) => m.slice(7, -1)))].sort((a, b) => b.length - a.length);
  for (const id of ids) svg = svg.replaceAll(`pgf${id}`, `pgf${key}${id}`);
  return svg;
}

/** TeX's \\special can put any markup in the SVG: only SVG is kept (no script, no handlers). */
export function cleanSvg(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) as string;
}

// ---- the engine: one worker, one TeX run at a time ----------------------------------------------------------------

const ENGINE = "tikzjax-1.0.0-beta24"; // part of the cache key: a new TeX build draws again
const TIMEOUT_MS = 60_000;
const assets = () => new URL("tikzjax/", document.baseURI).toString();

interface Worker_ { worker: Worker; call(method: string, args: unknown[]): Promise<unknown>; log: string[] }
let engine: Promise<Worker_> | undefined;
let queue: Promise<unknown> = Promise.resolve();

/** The worker of run-tex.js speaks threads.js's messages: `run` in; `init`, `result`, `error` and console lines out. */
function startEngine(): Promise<Worker_> {
  ensureFonts();
  const worker = new Worker(new URL("run-tex.js", assets()));
  const pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();
  const log: string[] = [];
  let uid = 0;
  let ready!: () => void;
  const inited = new Promise<void>((r) => (ready = r));
  const failAll = (why: string) => { for (const p of pending.values()) p.rej(new Error(why)); pending.clear(); };
  worker.onmessage = (e: MessageEvent) => {
    const d = e.data;
    if (typeof d === "string") { log.push(d); return; }
    if (d?.type === "init") ready();
    else if (d?.type === "result" && d.complete) { pending.get(d.uid)?.res(d.payload); pending.delete(d.uid); }
    else if (d?.type === "error") { pending.get(d.uid)?.rej(new Error(d.error?.message ?? "TeX failed")); pending.delete(d.uid); }
    else if (d?.type === "uncaughtError") failAll(d.error?.message ?? "the TeX engine stopped");
  };
  worker.onerror = (e) => { failAll(e.message || "the TeX engine could not start"); };
  const call = async (method: string, args: unknown[]) => {
    await inited;
    return new Promise<unknown>((res, rej) => { const id = ++uid; pending.set(id, { res, rej }); worker.postMessage({ type: "run", uid: id, method, args }); });
  };
  const w: Worker_ = { worker, call, log };
  return call("load", [assets().replace(/\/$/, "")]).then(() => w);
}

let fontsLinked = false;
/** The Computer Modern fonts the SVG's text is set in. */
function ensureFonts(): void {
  if (fontsLinked) return;
  fontsLinked = true;
  const link = Object.assign(document.createElement("link"), { rel: "stylesheet", href: new URL("fonts.css", assets()).toString() });
  document.head.append(link);
}

/** A package TeX cannot find makes a misleading "Undefined control sequence": the missing one is named instead. */
async function missingPackages(src: TikzSource): Promise<string[]> {
  const here = await Promise.all(src.packages.map((p) => fetch(new URL(`tex_files/${p.name}.sty.gz`, assets()), { method: "HEAD" }).then((r) => r.ok, () => false)));
  return src.packages.filter((_, i) => !here[i]).map((p) => p.name);
}

async function compile(src: TikzSource, key: string): Promise<TikzResult> {
  const missing = await missingPackages(src);
  if (missing.length) return { ok: false, error: `Not in the TeX that draws in Atlas: ${missing.join(", ")}. It has amsmath, amssymb, array, pgfplots, tikz-cd, tikz-3dplot, etoolbox, xparse and every TikZ library; the PDF export uses your TeX distribution and has them all.` };
  engine ??= startEngine();
  let w: Worker_;
  try { w = await engine; } catch (e) { engine = undefined; return { ok: false, error: `The TeX engine did not load: ${(e as Error).message}` }; }
  w.log.length = 0;
  const dataset: Record<string, string> = { showConsole: "true" };
  if (src.libraries.length) dataset.tikzLibraries = src.libraries.join(",");
  if (src.packages.length) dataset.texPackages = JSON.stringify(Object.fromEntries(src.packages.map((p) => [p.name, p.options])));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`TeX ran for more than ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS); });
  try {
    const svg = (await Promise.race([w.call("texify", [src.body, dataset]), timeout])) as string;
    return { ok: true, svg: cleanSvg(uniqueIds(svg, key.slice(0, 12))) };
  } catch (e) {
    if (/more than/.test((e as Error).message)) { w.worker.terminate(); engine = undefined; } // a stuck TeX: a fresh engine next time
    return { ok: false, error: texError(w.log, (e as Error).message) };
  } finally {
    clearTimeout(timer);
  }
}

// ---- the cache: by the hash of the source --------------------------------------------------------------------------

const memory = new Map<string, string>();
const DB = "atlas-tikz";

async function hashOf(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function store<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore("svg");
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const db = open.result;
        const req = op(db.transaction("svg", mode).objectStore("svg"));
        req.onsuccess = () => { resolve(req.result); db.close(); };
        req.onerror = () => { resolve(undefined); db.close(); };
      };
    } catch { resolve(undefined); } // no IndexedDB (a private window): the memory cache only
  });
}

/** The SVG of a ```tikz fence's source, from the cache when it was drawn before. Errors are not cached. */
export async function renderTikz(source: string): Promise<TikzResult> {
  const key = await hashOf(`${ENGINE}\n${source}`);
  const known = memory.get(key) ?? (await store<string>("readonly", (s) => s.get(key) as IDBRequest<string>));
  if (known) { memory.set(key, known); return { ok: true, svg: known }; }
  const src = parseTikz(source);
  if (!/\\begin\s*\{tikzpicture\}/.test(src.body)) return { ok: false, error: "A tikz block holds a \\begin{tikzpicture} … \\end{tikzpicture}." };
  const run = queue.then((): Promise<TikzResult> | TikzResult => { const done = memory.get(key); return done ? { ok: true, svg: done } : compile(src, key); }); // a twin drawn meanwhile
  queue = run.catch(() => {});
  const r = await run;
  if (r.ok) { memory.set(key, r.svg); void store("readwrite", (s) => s.put(r.svg, key)); }
  return r;
}

// ---- a picture for a document: PNG, its fonts inside --------------------------------------------------------------

/** The `font-family` names an SVG's text is set in (TikZJax's Computer Modern: `cmr10`, `cmmi10`…). */
export function fontsOf(svg: string): string[] {
  return [...new Set([...svg.matchAll(/font-family\s*[=:]\s*["']?([\w-]+)/g)].map((m) => m[1]))];
}

/** An SVG length in points (TikZJax writes `pt`; a bare number is CSS px). */
export function lengthPt(v: string | null): number | null {
  const m = /^\s*([\d.]+)\s*(pt|px|in|cm|mm|em)?\s*$/.exec(v ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  return n * ({ pt: 1, px: 0.75, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, em: 10 }[m[2] ?? "px"] ?? 1);
}

const toDataUrl = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

/** A ```tikz fence's picture as a PNG for a document that has no Computer Modern web fonts (Typst, Word): the SVG
 *  with its fonts inlined, drawn on a canvas `scale` times its size in CSS px. `width`: its width in points, as TeX
 *  set it. Throws TeX's error. */
export async function tikzPng(source: string, scale = 4): Promise<{ png: Blob; width: number }> {
  const r = await renderTikz(source);
  if (!r.ok) throw new Error(r.error);
  const faces = await Promise.all(fontsOf(r.svg).map(async (f) => {
    const res = await fetch(new URL(`fonts/${f}.woff2`, assets()));
    return res.ok ? `@font-face{font-family:${f};src:url(${await toDataUrl(await res.blob())}) format("woff2")}` : "";
  }));
  // an SVG drawn as an image loads nothing from outside: its fonts must travel inside it
  const svg = r.svg.replace(/<svg\b[^>]*>/, (open) => `${open}<style>${faces.join("")}</style>`);
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  const box = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const width = lengthPt(root.getAttribute("width")) ?? box[2] ?? 100;
  const height = lengthPt(root.getAttribute("height")) ?? box[3] ?? 100;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((width / 0.75) * scale);
    canvas.height = Math.ceil((height / 0.75) * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("the picture could not be drawn"))), "image/png"));
    return { png, width };
  } finally { URL.revokeObjectURL(url); }
}
