// SPDX-License-Identifier: MIT OR Apache-2.0
// The core's side of a JS helper, faked for node tests (testing.ts): set before prelude.js runs. Separate from testing.ts
// because imports run in order, and the prelude must find `__host` already there.
import type { ExecResult, FetchRequest } from "./atlas-helper";

export type Answer = string | object | null | Reply;
/** An explicit answer: a status, a body, headers (`reply(429, "", { "retry-after": "0" })`). */
export class Reply {
  constructor(public status: number, public text = "", public headers: Record<string, string> = {}) {}
}
/** Thrown from `api` to answer an error status (`throw new Status(403, "not yours")`). */
export class Status {
  constructor(public status: number, public error: string) {}
}

// What QuickJS does not have is taken away here too, so a helper leaning on Node fails its tests, not only in the core.
for (const name of ["fetch", "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "WebSocket", "XMLHttpRequest"]) delete (globalThis as any)[name];

export const state = {
  web: (url: string, _req: FetchRequest): Answer => { throw new Error(`no web answer for ${url} (set harness.web)`); },
  api: (verb: string, path: string, _body: unknown): unknown => { throw new Status(404, `no api answer for ${verb} ${path} (set harness.api)`); },
  asked: [] as FetchRequest[],
  events: [] as { event: string; data: unknown }[],
  logs: [] as string[],
  /** The vault's zip files: path → entry name → its text. */
  zips: {} as Record<string, Record<string, string>>,
  /** What `atlas.exec` answers: the program's result, or throw for a refusal. */
  exec: (program: string, _args: string[], _opts: { stdin?: string; cwd?: string; timeout?: number; locale?: "C" }): ExecResult => { throw new Error(`exec: no answer for ${program} (set harness.exec)`); },
  /** The runs asked, in order. */
  /** Native ops the fake core does not do itself (`atlas.convert`, `atlas.hash`): the test's answer. */
  native: undefined as undefined | ((op: string, args: any) => unknown),
  ran: [] as { program: string; args: string[]; stdin?: string; cwd?: string; timeout?: number; locale?: "C" }[],
  waiting: new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>(),
};

/** The fetch route's answer for what `web` returned: null → 404, text → 200, an object → its JSON. */
function fetched(a: Answer, req: FetchRequest) {
  const r = a instanceof Reply ? a : a === null ? new Reply(404) : new Reply(200, typeof a === "string" ? a : JSON.stringify(a));
  return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: r.headers, text: r.text, url: req.url, ...(req.save_to && r.status < 300 ? { saved: `.atlas/cache/plugins/test/${req.save_to}` } : {}) };
}

async function answer(verb: string, path: string, body: unknown): Promise<[number, unknown]> {
  try {
    if (verb === "POST" && /^\/api\/plugins\/[^/]+\/fetch$/.test(path)) {
      const req = body as FetchRequest;
      state.asked.push(req);
      return [200, fetched(await state.web(req.url, req), req)];
    }
    return [200, await state.api(verb, path, body)];
  } catch (e) {
    if (e instanceof Status) return [e.status, { error: e.error }];
    return [500, { error: e instanceof Error ? e.message : String(e) }];
  }
}

// The core decodes every HTML5 name (js_native.rs); fixtures need the numeric references and the common names only.
const NAMES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", ntilde: "ñ", eacute: "é", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", egrave: "è", agrave: "à", ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä", szlig: "ß", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const unescapeForTests = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) =>
  e[0] === "#" ? String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : NAMES[e] ?? whole);

/** CSV as the core reads it (the csv crate, flexible rows): quotes, doubled quotes, line breaks inside quotes. */
function csvForTests(text: string, header: boolean, delimiter: string): string[][] | Record<string, string>[] {
  const d = delimiter || ",", rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, i = 0;
  const end = () => { row.push(field); field = ""; };
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === d) end();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      end(); rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { end(); rows.push(row); }
  if (!header || !rows.length) return rows;
  const names = rows.shift()!;
  return rows.map((r) => Object.fromEntries(names.map((n, k) => [n, r[k]]).filter(([, v]) => v !== undefined)));
}

function zipOf(path: string): Record<string, string> {
  const z = state.zips[path];
  if (!z) throw new Error(`zip: ${path}: no such zip (set harness.zips)`);
  return z;
}

const receive = (msg: object) => (globalThis as any).__atlas_receive(JSON.stringify(msg));

(globalThis as any).__host = {
  id: "test",
  log: (line: string) => state.logs.push(line),
  timer: () => { throw new Error("node has its own timers"); },
  exec: (n: number, ask: string) => {
    const a = JSON.parse(ask);
    state.ran.push(a);
    void Promise.resolve().then(() => state.exec(a.program, a.args ?? [], a)).then((r) => r, (e: Error) => ({ error: e.message }))
      .then((r) => setImmediate(() => (globalThis as any).__atlas_exec(n, JSON.stringify(r))));
  },
  native: (op: string, args: string) => {
    const a = JSON.parse(args);
    if (op === "html.unescape") return JSON.stringify(unescapeForTests(a.text));
    if (op === "csv.parse") return JSON.stringify(csvForTests(a.text ?? "", Boolean(a.header), a.delimiter ?? ""));
    if (op === "zip.list") return JSON.stringify(Object.keys(zipOf(a.path)).map((name) => ({ name, size: zipOf(a.path)[name].length, dir: false })));
    if (op === "zip.read") {
      const z = zipOf(a.path);
      if (!(a.name in z)) throw new Error(`zip: ${a.name}: specified file not found in archive`);
      return JSON.stringify(z[a.name]);
    }
    if (state.native) return JSON.stringify(state.native(op, a));
    throw new Error(`atlas.${op} runs in the core: test it with cargo test (js_native.rs)`);
  },
  send(line: string) {
    const m = JSON.parse(line);
    if (typeof m.call === "number") {
      void answer(m.verb, m.path, m.body).then(([status, body]) => setImmediate(() => receive({ reply: m.call, status, body })));
    } else if (typeof m.id === "number" && state.waiting.has(m.id)) {
      const w = state.waiting.get(m.id)!;
      state.waiting.delete(m.id);
      if (m.error !== undefined) w.reject(new Error(m.error));
      else w.resolve(m.result);
    } else if (typeof m.event === "string") {
      state.events.push({ event: m.event, data: m.data });
    }
  },
};
