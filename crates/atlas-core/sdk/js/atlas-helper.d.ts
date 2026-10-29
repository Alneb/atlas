// SPDX-License-Identifier: MIT OR Apache-2.0
// The global `atlas` of a JavaScript helper (`[helper] js`), as prelude.js defines it — docs/guides/PLUGIN-API.md,
// "JavaScript helpers". The page side's `atlas` is a different object: ui/src/lib/plugin-api.ts. Both share the
// core's generated wire types (ui/src/lib/gen), so a fetch answer has one shape everywhere.
import type { FetchRequest } from "../../../../ui/src/lib/gen/FetchRequest";
import type { FetchResponse } from "../../../../ui/src/lib/gen/FetchResponse";
import type { HeaderValue } from "../../../../ui/src/lib/gen/HeaderValue";

export type { FetchRequest, FetchResponse, HeaderValue };

/** What a method gets: the caller's arguments, plus `settings` (with defaults) and `secrets` the tool declared. */
export type Params = Record<string, unknown> & { settings?: Record<string, unknown>; secrets?: Record<string, string> };
export type Method = (params: Params) => unknown | Promise<unknown>;

/** What `atlas.exec` answers: the exit status (null when killed past its time: `timedOut`), and the output as text,
 *  each stream kept to 8 MB (`truncated` past it). */
export interface ExecResult { status: number | null; stdout: string; stderr: string; timedOut?: true; truncated?: true }

export interface FetchOptions {
  method?: string;
  /** A header's value: text, `{ secret: "token", prefix: "Bearer " }`, or `{ oauth: "name" }` — filled in by the core. */
  headers?: Record<string, HeaderValue>;
  body?: string | object;
  /** Seconds (default 20). */
  timeout?: number;
  /** At most one request to this host every `every` seconds (MusicBrainz 1, arXiv 3). */
  every?: number;
  /** Statuses answered as `null` (default [404]). */
  missing?: number[];
  /** Seconds to wait before each new try after a busy answer (429, 502–504) or a dropped connection (default [2, 6]). */
  waits?: number[];
}

/** One element `html.select` matched. */
export interface HtmlElement {
  tag: string;
  text: string;
  attrs: Record<string, string>;
  html: string;
}

export interface Download extends FetchResponse {
  /** The first bytes saved, as text (`%PDF` for a PDF); empty when nothing was saved in the cache. */
  head: string;
}

export interface AtlasError extends Error {
  /** The API's own status (403, 404…), when the core answered one. */
  status?: number;
}

export interface AtlasHelper {
  /** This plugin's id. */
  readonly id: string;
  readonly AtlasError: new (why: string, status?: number) => AtlasError;

  /** Registers a method the core calls (a tool, a page's `atlas.helper.call`, a schedule, a capture hook). */
  method(name: string, fn: Method): void;
  methods(table: Record<string, Method>): void;
  /** An event for the page's `atlas.helper.on(name, …)`. */
  event(name: string, data?: unknown): void;

  /** Any endpoint of the core's API, as the pages use it (`/api/…`); the JSON answer, or an AtlasError. */
  call<T = any>(verb: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown, query?: Record<string, unknown>): Promise<T>;
  get<T = any>(path: string, query?: Record<string, unknown>): Promise<T>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  put<T = any>(path: string, body: unknown): Promise<T>;
  del<T = any>(path: string, query?: Record<string, unknown>): Promise<T>;
  /** `{a: 1, b: "x y"}` → `a=1&b=x%20y` (null and undefined left out). */
  qs(query: Record<string, unknown>): string;
  /** The lower-case host of an address. */
  hostOf(url: string): string;
  sleep(ms: number): Promise<void>;

  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<unknown>;
  files(index?: boolean): Promise<string[]>;
  tree(folder?: string): Promise<{ name: string; path: string; kind: "dir" | "file" }[]>;
  search(q: string, o?: { case?: boolean; word?: boolean; regex?: boolean }): Promise<{ files: string[]; lines: { path: string; line: number; text: string }[] }>;
  today(): Promise<any>;
  capture(text: string): Promise<unknown>;
  /** This plugin's secret, or null when unset. */
  secret(name: string): Promise<string | null>;
  setSecret(name: string, value: string): Promise<unknown>;

  /** Runs a program the manifest names (`[permissions] exec = ["pandoc"]`), with no shell, found on the PATH, in the
   *  vault or a folder of it (`cwd`), for at most `timeout` seconds (60 by default, 600 at most). Rejects when it is not
   *  named, not installed (the phone has none) or its folder is outside the vault. `locale: "C"`: it answers in English
   *  whatever the machine's language, for output the script reads. */
  exec(program: string, args?: string[], opts?: { stdin?: string; cwd?: string; timeout?: number; locale?: "C" }): Promise<ExecResult>;

  /** A page's text through the core (only the manifest's `[permissions] net` hosts); null for a `missing` status. */
  fetch(url: string, opts?: FetchOptions): Promise<string | null>;
  fetchJson<T = any>(url: string, opts?: FetchOptions): Promise<T | null>;
  /** The core's whole answer (status, headers, `signin`, `saved`), for a request built by hand. */
  fetchResponse(req: FetchRequest): Promise<FetchResponse>;
  /** `url` streamed by the core into the plugin's cache at `saveTo` (or `.atlas/remote/<id>/` with `in: "remote"`). */
  download(url: string, saveTo: string, opts?: { headers?: Record<string, HeaderValue>; timeout?: number; in?: "cache" | "remote" }): Promise<Download>;
  /** For a papers PDF source: true when `url` gave a PDF, now in this plugin's cache where catalog-papers takes it. */
  attachPdf(key: string, url: string, opts?: { headers?: Record<string, HeaderValue>; timeout?: number }): Promise<boolean>;

  /** Addresses, without a URL class: Python's `quote(s, safe = "/")` (`!'()*` escaped too), and `ref` read against `base`
   *  (absolute, `//host/x`, `/x`, `x`). */
  url: { quote(s: string, safe?: string): string; resolve(ref: string, base: string): string };
  /** Python's `str.title()`: each run of letters capitalised ("arrakis (imaginary place)" → "Arrakis (Imaginary Place)"). */
  text: { title(s: string): string };
  /** Native (run in the core): `select` the elements a CSS selector matches; `unescape` every character reference, all of
   *  HTML5's names (Python's `html.unescape`). */
  html: { select(html: string, css: string): HtmlElement[]; unescape(s: string): string };
  csv: { parse(text: string, o?: { header?: false; delimiter?: string }): string[][]; parse(text: string, o: { header: true; delimiter?: string }): Record<string, string>[] };
  /** A zip file of the vault (a vault-relative path): its entries, one entry's text. */
  zip: { list(path: string): { name: string; size: number; dir: boolean }[]; read(path: string, name: string): string };
  hash: { sha256(text: string): string };
}

declare global {
  const atlas: AtlasHelper;
}
