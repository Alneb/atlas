// The engine's answers (engine/src/api.rs) as types, the helper call, and the formatting every view shares.
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
export type { PluginApi };

export interface Person { name: string; addr: string }
export interface Folder { account: string; path: string; label: string; role: string | null; delimiter: string | null; unread: number; total: number }
export interface Status { state: "syncing" | "idle" | "error" | "offline"; error?: string; errors?: string[] }
export interface Account {
  name: string; user?: string; from?: string; main?: boolean; own?: string[]; identities?: string[]; outlook?: boolean;
  unread?: number; status?: Status | null; syncing?: boolean; signature?: string; error?: string;
}
export interface Row {
  thread: number; id: number; account: string; folder: string; subject: string; from: Person[]; count: number; unread: number;
  flagged: boolean; has_attachments: boolean; draft: boolean; labels: string[]; kind: string; date: number; snippet: string;
  snippet_missing: boolean; saved: string | null; folder_role: string | null;
}
export interface Attachment { part: number; name: string; mime: string; size: number; cid?: string; inline: boolean }
export interface Invite {
  method: string; uid: string; summary: string; start: string; end: string; all_day: boolean; zone: string; location: string;
  organizer: string; organizer_addr: string; attendees: { name: string; addr: string; partstat: string }[]; repeats: string;
  answer: string | null; mine: boolean;
}
export interface InviteStatus { in_calendar: boolean; partstat?: string; conflicts: { summary: string; start: string; end: string; calendar: string }[] }
export interface Body {
  html: string; plain: boolean; remote: number; remote_allowed: boolean; attachments: Attachment[]; invite: Invite | null;
  forwarded: { from: Person[]; to: Person[]; subject: string; date: number; html: string; plain: boolean }[]; text: string;
}
export interface Message {
  id: number; account: string; folder: string; uid: number; thread: number; message_id: string; subject: string;
  from: Person[]; to: Person[]; cc: Person[]; reply_to: Person[]; date: number; size: number; seen: boolean; flagged: boolean;
  answered: boolean; draft: boolean; labels: string[]; kind: string; has_attachments: boolean; snippet: string;
  unsubscribe: { url?: string; mailto?: string; one_click: boolean } | null; body?: Body; error?: string;
  folder_role: string | null; folder_label: string | null;
}
export interface Thread { thread: number; subject: string; messages: Message[]; saved: string | null }
export interface Moved { id: number; from: string; to: string }
export interface Contact { name: string; addr: string; sent: number; received: number; last: number }
export interface Rule { when: string; actions: string[] }
export interface Template { name: string; subject?: string; to?: string; cc?: string; body: string; path: string }
export interface FileRef { name: string; mime?: string; size?: number; data?: string; path?: string; from?: [number, number] }
/** What the composer holds (engine/src/send.rs `Compose`). */
export interface Draft {
  account: string; from: string; to: string; cc: string; bcc: string; subject: string; body: string;
  reply_to: number | null; forward: number | null; files: FileRef[]; draft: number | null; send_at: number | null;
}

/** A helper call with the plugin's settings; the error stripped of the transport's prefix. */
export async function call<T>(atlas: PluginApi, method: string, params: Record<string, unknown> = {}, timeout = 120): Promise<T> {
  try {
    return (await atlas.helper.call(method, { ...params, settings: atlas.plugin.settings }, { timeout })) as T;
  } catch (e) {
    throw new Error(String((e as Error)?.message ?? e).replace(/^.*?plugin [\w-]+: \w+: /, "").replace(/^.*?(method|error): /i, ""));
  }
}

export const setting = <T>(atlas: PluginApi, key: string, fallback: T): T => (atlas.plugin.settings[key] as T) ?? fallback;

/** A person as a list shows them: the name, else the address's local part; "me" for the user's own addresses. */
export function who(p: Person | undefined, own: string[] = []): string {
  if (!p) return "(no sender)";
  if (own.includes(p.addr.toLowerCase())) return "me";
  return p.name || p.addr.split("@")[0];
}
export const display = (p: Person) => (p.name ? `${p.name} <${p.addr}>` : p.addr);

/** Senders of a conversation: "Ana, Bo, me" — the first and the last two when there are many. */
export function senders(ps: Person[], own: string[]): string {
  const names = ps.map((p) => who(p, own));
  if (names.length <= 3) return names.join(", ");
  return `${names[0]} … ${names.slice(-2).join(", ")}`;
}

const day = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
/** The list's date (DESIGN-mail-ui §3): 14:02 today, "Tue" this week, "12 Sep" this year, then "12 Sep 2024". */
export function when(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000), now = new Date();
  const days = (day(now) - day(d)) / 86400000;
  if (days === 0) return d.toLocaleTimeString(undefined, { hour: "2-digit", hourCycle: "h23", minute: "2-digit" });
  if (days > 0 && days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
/** The reader's date: full, with a relative hint. */
export function fullDate(unix: number): string {
  const d = new Date(unix * 1000);
  const ago = relative(unix);
  return `${d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit" })}${ago ? ` (${ago})` : ""}`;
}
export function relative(unix: number): string {
  const s = Date.now() / 1000 - unix;
  if (s < 0) return "";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 2) return "yesterday";
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} days ago`;
  return "";
}
export function size(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
/** A hue from a name: the avatar's colour, stable for a person. */
export function hue(s: string): number {
  let h = 0;
  for (const c of s.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
export const initials = (p: Person | undefined) => {
  const n = (p?.name || p?.addr || "?").replace(/["']/g, "").trim();
  const parts = n.split(/[\s.@_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[1][0] : "")).toUpperCase();
};

/** Snooze choices (Gmail's): later today, tomorrow morning, this weekend, next week. */
export function snoozeTimes(now = new Date()): { label: string; at: number }[] {
  const at = (d: Date) => Math.floor(d.getTime() / 1000);
  const at8 = (d: Date) => { const x = new Date(d); x.setHours(8, 0, 0, 0); return x; };
  const later = new Date(now); later.setHours(now.getHours() + 3, 0, 0, 0);
  const tomorrow = at8(new Date(now.getTime() + 86400000));
  const sat = at8(new Date(now.getTime() + ((6 - now.getDay() + 7) % 7 || 7) * 86400000));
  const mon = at8(new Date(now.getTime() + ((8 - now.getDay()) % 7 || 7) * 86400000));
  const out = [
    { label: `Later today · ${later.toLocaleTimeString(undefined, { hour: "2-digit", hourCycle: "h23", minute: "2-digit" })}`, at: at(later) },
    { label: `Tomorrow · ${tomorrow.toLocaleDateString(undefined, { weekday: "short" })} 08:00`, at: at(tomorrow) },
    { label: `This weekend · Sat 08:00`, at: at(sat) },
    { label: `Next week · Mon 08:00`, at: at(mon) },
  ];
  return later.getDate() === now.getDate() ? out : out.slice(1);
}

/** "tomorrow 9", "mon 14:00", "2026-11-02 08:00", "3h", "2d" → unix seconds, or null. */
export function parseWhen(text: string, now = new Date()): number | null {
  const t = text.trim().toLowerCase();
  const rel = t.match(/^(\d+)\s*(m|min|h|d|w)$/);
  if (rel) return Math.floor(now.getTime() / 1000) + Number(rel[1]) * ({ m: 60, min: 60, h: 3600, d: 86400, w: 604800 } as Record<string, number>)[rel[2]];
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})(?:[ t](\d{1,2})(?::(\d{2}))?)?$/);
  if (iso) { const d = new Date(`${iso[1]}T${(iso[2] ?? "8").padStart(2, "0")}:${iso[3] ?? "00"}:00`); return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000); }
  const m = t.match(/^(today|tomorrow|mon|tue|wed|thu|fri|sat|sun)\w*\s*(\d{1,2})?(?::(\d{2}))?$/);
  if (!m) return null;
  const d = new Date(now);
  if (m[1] === "tomorrow") d.setDate(d.getDate() + 1);
  else if (m[1] !== "today") { const want = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(m[1]); d.setDate(d.getDate() + (((want - d.getDay()) + 7) % 7 || 7)); }
  d.setHours(m[2] ? Number(m[2]) : 8, m[3] ? Number(m[3]) : 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** The app's own yes/no (`atlas.confirm`, API 23); the browser's on an older Atlas. */
export const askYes = (atlas: PluginApi, question: string, opts?: { ok?: string; danger?: boolean }): Promise<boolean> =>
  typeof atlas.confirm === "function" ? atlas.confirm(question, opts) : Promise.resolve(window.confirm(question));

/** The app's own one-line question (`atlas.input`, API 23): the text, or null; the browser's on an older Atlas. */
export const askLine = (atlas: PluginApi, title: string, value = ""): Promise<string | null> =>
  typeof atlas.input === "function" ? atlas.input(title, { value }) : Promise.resolve(window.prompt(title, value)?.trim() || null);
