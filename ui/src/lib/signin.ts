// `atlas.signIn`: a provider's sign-in page (OAuth) whose answer comes back to a localhost address. The
// desktop app shows such a page in a window of its own and, when it reaches that address, closes it and
// hands the address back (crates/atlas-app `signin_window` → POST /api/signin → the "signin" event). In a
// browser the page opens in a tab; the server answers the address it ends on with a page that posts it back here
// (crates/atlas-core/src/signin_return.rs, the same channel name), and keeps it in localStorage (the same key) for a
// tab that was not waiting: `returned`. Callers keep pasting as the last resort.
import { on } from "./bus";

type Waiter = { back: string; done: (url: string) => void; fail: (e: Error) => void };
const waiting = new Set<Waiter>();
const KEPT = "atlas-signin-return"; // signin_return.rs KEPT
const KEEP_MS = 30 * 60_000;

function kept(): { url: string; at: number } | null {
  try { const k = JSON.parse(localStorage.getItem(KEPT) ?? "null"); return k && typeof k.url === "string" ? k : null; } catch { return null; }
}
function forget(url: string) { try { if (kept()?.url === url) localStorage.removeItem(KEPT); } catch { /* no storage */ } }

/** The address a sign-in to `back` came back to while no tab was waiting for it (kept 30 minutes); taken once. */
export function returned(back: string): string | null {
  const k = kept();
  if (!k || !k.url.startsWith(back) || Date.now() - k.at > KEEP_MS) return null;
  forget(k.url);
  return k.url;
}
let listening = false;

export function signIn(url: string, back: string): Promise<string> {
  if (!listening) {
    listening = true;
    // a waiting tab takes the address and forgets the kept copy, so no other tab finishes it a second time
    const came = (url: string) => { for (const w of waiting) if (url.startsWith(w.back)) { waiting.delete(w); forget(url); w.done(url); } };
    on("signin", (e) => came(e.url));
    if ("BroadcastChannel" in window) new BroadcastChannel("atlas-signin").onmessage = (m) => typeof m.data === "string" && came(m.data);
  }
  // a new sign-in to the same address replaces an unfinished one (its window was closed by hand)
  for (const w of waiting) if (w.back === back) { waiting.delete(w); w.fail(new Error("replaced by a new sign-in")); }
  return new Promise((done, fail) => {
    waiting.add({ back, done, fail });
    window.open(url, "_blank");
  });
}
