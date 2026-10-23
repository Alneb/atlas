// A table file read and written whole through /api/raw (no 5 MB cap, unlike /api/file): read with its modification
// time, parsed in a worker, saved only if nobody changed it since (409 otherwise, as every editor's save).
import { apiBase, ApiError } from "../api";
import type { Sheet } from "./parse";
import { writeSheet } from "./write";

const href = (path: string, q: Record<string, string> = {}) => `${apiBase()}/api/raw?${new URLSearchParams({ path, ...q })}`;

export interface Loaded { sheet: Sheet; mtime: number; bytes: number }

export async function loadSheet(path: string, progress?: (done: number) => void): Promise<Loaded> {
  const res = await fetch(href(path), { headers: { "x-atlas": "1" } });
  if (!res.ok) throw new ApiError(res.status, res.status === 404 ? `${path} is not there` : `reading ${path}: ${res.status}`);
  const mtime = Number(res.headers.get("x-atlas-mtime") ?? 0);
  const bytes = await res.arrayBuffer();
  const size = bytes.byteLength;
  const sheet = await new Promise<Sheet>((resolve, reject) => {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    // the rows come in slices (worker.ts), then the sheet without them
    const rows: string[][] = [], raw: (string | null)[] = [];
    w.onmessage = (e) => {
      if (e.data.progress !== undefined) return progress?.(e.data.progress);
      if (e.data.rows) { for (let i = 0; i < e.data.rows.length; i++) { rows.push(e.data.rows[i]); raw.push(e.data.raw[i]); } return; }
      w.terminate();
      if (e.data.sheet) resolve({ ...e.data.sheet, rows, raw }); else reject(new Error(e.data.error ?? "the table could not be read"));
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "the table reader failed")); };
    w.postMessage({ bytes, path }, [bytes]);
  });
  return { sheet, mtime, bytes: size };
}

/** Writes the sheet; the new modification time. A 409 (changed on disk since `baseMtime`) is an ApiError of status 409. */
export async function saveSheet(path: string, sheet: Sheet, baseMtime: number, force = false): Promise<number> {
  const q: Record<string, string> = force || !baseMtime ? {} : { base_mtime: String(baseMtime) };
  const res = await fetch(href(path, q), { method: "PUT", headers: { "x-atlas": "1", "content-type": "text/plain; charset=utf-8" }, body: writeSheet(sheet) });
  const body = await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, res.status === 409 ? "changed on disk since it was opened" : `saving ${path}: ${res.status}`, body);
  return Number(body?.mtime ?? 0);
}

/** The file's modification time on disk now (a HEAD: no body), to tell our own save from someone else's change. */
export async function diskMtime(path: string): Promise<number> {
  const res = await fetch(href(path), { method: "HEAD", headers: { "x-atlas": "1" } });
  return res.ok ? Number(res.headers.get("x-atlas-mtime") ?? 0) : 0;
}
