// Where inline expressions run (docs/guides/EXPRESSIONS.md): a worker of their own, so a slow or broken one
// cannot freeze the app, with the worker's doors to the network and to storage closed first. What an
// expression may know arrives as plain data; what it may ask for goes through `call` to the app.
/// <reference lib="webworker" />
import { errText } from "./text";

const CLOSED = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "BroadcastChannel", "Worker", "SharedWorker", "navigator", "postMessage"] as const;
const post = self.postMessage.bind(self);
for (const k of CLOSED) { try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch { /* not there in this browser */ } }

export interface EvalRequest { id: number; expr: string; scope: Record<string, unknown> }
export type WorkerOut =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; call: string; args: unknown[]; n: number };
export type WorkerIn = EvalRequest | { answer: number; ok: boolean; value: unknown };

const waiting = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
let calls = 0;
/** Ask the app (lib/expr.ts `HOST`) for something only it can read. */
const call = (id: number, name: string) => (...args: unknown[]) => new Promise((resolve, reject) => {
  const n = ++calls;
  waiting.set(n, { resolve, reject });
  post({ id, call: name, args, n } satisfies WorkerOut);
});

// --- helpers every expression has -------------------------------------------------------------------
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const asDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v).length <= 10 ? `${String(v)}T00:00:00` : String(v)));
const nums = (list: unknown) => (Array.isArray(list) ? list : []).map(Number).filter((n) => !Number.isNaN(n));
const helpers = {
  /** whole days from `a` to `b` (today when left out): `days(note.due)` is negative before the date */
  days: (a: unknown, b: unknown = new Date()) => Math.round((asDate(day(asDate(b))).getTime() - asDate(day(asDate(a))).getTime()) / 86_400_000),
  sum: (list: unknown) => nums(list).reduce((a, b) => a + b, 0),
  avg: (list: unknown) => { const n = nums(list); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0; },
  round: (x: number, digits = 0) => { const f = 10 ** digits; return Math.round(x * f) / f; },
};

/** What crosses back to the page: plain data (a Date as its day or time, anything odd as text). */
function plain(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v ?? null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "invalid date" : v.getHours() || v.getMinutes() ? v.toISOString() : day(v);
  if (depth > 6) return String(v);
  if (Array.isArray(v)) return v.map((x) => plain(x, depth + 1));
  if (typeof v === "object") return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, plain(x, depth + 1)]));
  return String(v);
}

const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

async function run({ id, expr, scope }: EvalRequest): Promise<void> {
  try {
    // `import(…)` would load code from anywhere: an expression is one expression of the note's own data
    if (/\bimport\s*\(/.test(expr)) throw new Error("import() is not available in an expression");
    const env = { ...scope, ...helpers, today: day(new Date()), now: new Date(), rows: call(id, "rows"), note_of: call(id, "note_of") };
    const names = Object.keys(env);
    const fn = new AsyncFunction(...names, `"use strict"; return (${expr}\n);`);
    post({ id, ok: true, value: plain(await fn(...names.map((n) => (env as Record<string, unknown>)[n]))) } satisfies WorkerOut);
  } catch (e) {
    post({ id, ok: false, error: errText(e) } satisfies WorkerOut);
  }
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  if ("answer" in m) {
    const w = waiting.get(m.answer);
    waiting.delete(m.answer);
    if (m.ok) w?.resolve(m.value); else w?.reject(new Error(String(m.value)));
  } else void run(m);
};
