// A local vault's mirror (docs/design/DESIGN-mirror-v2.md): the same vault on a server, kept in step by Syncthing.
// Every file is read and written here; the core asks the server for a lease before each write (core mirror_guard.rs)
// and splices the live rooms to the server's (server.rs live_ws), so the interface only shows the link (the panes'
// `⇄ host` chip), and offers the server's sign-in. The desktop reaches the server through its bridge (core
// remote_bridge.rs), which only goes to servers on the vault list or named as a mirror.
import { apiBase } from "./api";

/** Where a server vault's API is through the desktop's bridge: `https://host/v/notes/` → `/remote/host/v/notes`. */
export function bridgeBase(address: string): string {
  const u = new URL(address);
  return `/remote/${u.host}${u.pathname.replace(/\/+$/, "")}`;
}

/** The server part of an address, as the dialog shows it (`atlas.example.org`). */
export const hostOf = (address: string): string => { try { return new URL(address).host; } catch { return address; } };

/** `online`: it answers; `signin`: its gate wants a sign-in first; `offline`: no answer (the local copy is used). */
export type MirrorState = "online" | "signin" | "offline";

export async function reach(address: string, ms = 8000): Promise<MirrorState> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    const r = await fetch(`${bridgeBase(address)}/api/workspace`, { headers: { "x-atlas": "1" }, signal: stop.signal });
    if (r.ok) return "online";
    const body = await r.json().catch(() => null) as { signin?: unknown } | null;
    return r.status === 401 && body?.signin ? "signin" : "offline";
  } catch {
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

/** The vaults a server serves (its own list, through the bridge): what a local vault can be mirrored to. */
export async function serverVaults(server: string): Promise<{ name: string; address: string }[]> {
  try {
    const origin = new URL(server).origin;
    const r = await fetch(`${bridgeBase(origin)}/api/vaults`, { headers: { "x-atlas": "1" } });
    if (!r.ok) return [];
    const l = await r.json() as { vaults: { name: string; url?: string }[] };
    return l.vaults.map((v) => ({ name: v.name, address: `${origin}${v.url ?? "/"}` }));
  } catch {
    return [];
  }
}

// --- This vault's mirror, for the chip ------------------------------------------------------------------------------

let known: { address: string | null; state: MirrorState; at: number } | null = null;
let asking: Promise<void> | null = null;

/** This vault's mirror and whether it answers. */
function refresh(): Promise<void> {
  asking ??= (async () => {
    try {
      // a page already on a server (through the bridge) has no mirror of its own
      const address = apiBase().startsWith("/remote/") ? null : await fetch(`${apiBase()}/api/vaults`, { headers: { "x-atlas": "1" } })
        .then((r) => (r.ok ? r.json() : null))
        .then((l: { current: string; vaults: { path: string; mirror?: string }[] } | null) => l?.vaults.find((v) => v.path === l.current)?.mirror ?? null, () => null);
      known = { address, state: address ? await reach(address) : "offline", at: Date.now() };
    } finally { asking = null; }
  })();
  return asking;
}

/** This vault's mirror and whether it answers now (null: none linked, or a page already on a server); asked again after
 *  a minute. */
export async function mirrorState(): Promise<{ address: string; state: MirrorState } | null> {
  if (!known || Date.now() - known.at > 60_000) await refresh();
  return known?.address ? { address: known.address, state: known.state } : null;
}

/** The link was changed (the vault switcher): asked again, and the panes' chips follow (`atlas-mirror-unlinked`). */
export function forgetMirrorState(): void {
  known = null;
  window.dispatchEvent(new Event("atlas-mirror-unlinked"));
}

/** The mirror's gate wants a sign-in (the core's leases and live rooms go through it): its page in a window of the app
 *  (the plugins' sign-in window: core service_signin.rs keeps the cookies the bridge then sends), asked again once done. */
export function signInToMirror(): void {
  const address = known?.address;
  if (!address) return;
  window.open(`/signin/door?url=${encodeURIComponent(new URL(address).origin + "/")}`, "_blank");
  const t = setInterval(() => void refresh().then(() => { if (known?.state === "online") clearInterval(t); }), 3000);
  setTimeout(() => clearInterval(t), 300_000);
}
