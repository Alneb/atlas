// Inline expressions (docs/design/EXPRESSIONS.md): `= days(note.due)` written as inline code in a note is
// shown as its value. This module evaluates one (in the worker, lib/expr-worker.ts) and draws the
// value into an element — the editor's widget and the reading view both end here.
//
// An expression sees: `note` (frontmatter), `section` (the `key:: value` lines of its section and
// the ones above it), `props` (both; the nearest wins), `tasks` (of its section), `heading`, `path`,
// `today`, `now`, and the helpers days(), sum(), avg(), round(), rows(), note_of().
import { errText } from "./text";
import { api } from "./api";
import type { EvalRequest, WorkerOut } from "./expr-worker";
import { queryRows } from "./base-rows";
import { scopeAt, type Scope } from "./section-props";

export type ExprResult = { ok: true; value: unknown } | { ok: false; error: string };

const TIMEOUT_MS = 3000;

/** What the worker may ask the app for (`call` in the worker): reads only, of this vault. */
const HOST: Record<string, (path: string, ...args: unknown[]) => Promise<unknown>> = {
  /** `rows("filters: 'type == \"paper\"'")`: the rows of a Bases query (lib/base-rows.ts) */
  rows: (path, yaml) => queryRows(String(yaml ?? ""), path),
  /** `note_of("notes/dmft.md")`: another note's frontmatter */
  note_of: async (_path, other) => scopeAt((await api.file(String(other))).text, 1).note,
};

let worker: Worker | null = null;
let ids = 0;
const pending = new Map<number, { path: string; request: EvalRequest; done(r: ExprResult): void; timer: ReturnType<typeof setTimeout> }>();

function start(): Worker {
  const w = new Worker(new URL("./expr-worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<WorkerOut>) => {
    const m = e.data, p = pending.get(m.id);
    if (!p) return;
    if ("call" in m) {
      const answer = (ok: boolean, value: unknown) => w.postMessage({ answer: m.n, ok, value });
      const f = HOST[m.call];
      if (!f) answer(false, `${m.call}() is not available`);
      else f(p.path, ...m.args).then((v) => answer(true, v), (err) => answer(false, errText(err)));
      return;
    }
    finish(m.id, m.ok ? { ok: true, value: m.value } : { ok: false, error: m.error });
  };
  return w;
}
function finish(id: number, r: ExprResult): void {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.done(r);
}
function send(id: number): void {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => stuck(id), TIMEOUT_MS);
  try { (worker ??= start()).postMessage(p.request); }
  catch (e) { finish(id, { ok: false, error: errText(e) }); } // data that cannot be cloned
}
/** An expression that never ends holds the worker: it fails, the worker is replaced, and the ones
 *  that were waiting behind it are asked again. */
function stuck(id: number): void {
  worker?.terminate();
  worker = null;
  finish(id, { ok: false, error: `took longer than ${TIMEOUT_MS / 1000} s` });
  for (const other of [...pending.keys()]) send(other);
}

export function evaluate(expr: string, path: string, scope: Scope): Promise<ExprResult> {
  return new Promise((done) => {
    const id = ++ids;
    pending.set(id, { path, done, request: { id, expr, scope: { ...scope, path } }, timer: undefined as unknown as ReturnType<typeof setTimeout> });
    send(id);
  });
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(6)));
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.map(formatValue).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// --- drawing ------------------------------------------------------------------------------------------

// the last value of each expression in each scope: a redraw (typing elsewhere, scrolling) shows it at once
const last = new Map<string, ExprResult>();

/** `= expr` → `expr`; null when the inline code is not an expression. */
export const exprOf = (code: string) => (/^=\s*\S/.test(code) ? code.replace(/^=\s*/, "") : null);

function show(el: HTMLElement, expr: string, r: ExprResult | undefined): void {
  el.classList.toggle("expr-error", !!r && !r.ok);
  el.classList.toggle("expr-wait", !r);
  el.textContent = !r ? "…" : r.ok ? formatValue(r.value) : "⚠";
  el.title = !r ? `= ${expr}` : r.ok ? `= ${expr}` : `= ${expr}\n${r.error}`;
  el.dataset.value = r?.ok ? formatValue(r.value) : "";
}

/** Fills `el` with the value of `expr` as written at `line` of the note `path` (whose text is `text`). */
export function renderExpr(el: HTMLElement, expr: string, path: string, text: string, line: number): void {
  const scope = scopeAt(text, line);
  const key = `${path}\n${expr}\n${JSON.stringify(scope)}`;
  el.classList.add("expr");
  el.dataset.key = key;
  show(el, expr, last.get(key));
  if (last.has(key) && !isVolatile(expr)) return;
  void evaluate(expr, path, scope).then((r) => {
    last.set(key, r);
    if (last.size > 500) last.delete(last.keys().next().value!);
    if (el.dataset.key === key) show(el, expr, r);
  });
}
/** Expressions that read beyond their own note (or the clock) are asked again on every draw. */
const isVolatile = (expr: string) => /\b(rows|note_of|now)\b/.test(expr);

/** Reading view: fills every `<code class="expr">` under `root` (rendered from the note `path`). The
 *  nth copy of an expression takes the scope of its nth place in the text. */
export function hydrateExprs(root: HTMLElement, path: string, text: string): void {
  const seen = new Map<string, number>();
  for (const el of root.querySelectorAll<HTMLElement>("code[data-expr]:not([data-key])")) {
    const expr = el.dataset.expr ?? "";
    const n = seen.get(expr) ?? 0;
    seen.set(expr, n + 1);
    renderExpr(el, expr, path, text, nthLine(text, expr, n));
  }
}
function nthLine(text: string, expr: string, n: number): number {
  const lines = text.split("\n");
  const hits = lines.flatMap((l, i) => (l.includes("`") && l.replace(/`=\s*/g, "`=").includes(`\`=${expr}\``) ? [i + 1] : []));
  return hits[Math.min(n, hits.length - 1)] ?? 1;
}
