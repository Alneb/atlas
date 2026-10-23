// Vaults (docs/guides/SHELL.md): the folders the user works in, like Obsidian's. Each opens in a window of
// its own with its own `.atlas/` (settings, plugins, pages, workspaces), so vaults share nothing
// but the app. The list lives in ~/.config/atlas/vaults.toml (core vaults.rs).
import { errText } from "./text";
import type { Action } from "./actions";
import { apiBase, ApiError } from "./api";
import { pick } from "./palette.svelte";
import { toast } from "./state.svelte";
import type { VaultList } from "./gen/VaultList";
import type { Vault } from "./gen/Vault";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${apiBase()}${path}`, { method, headers: { "x-atlas": "1", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = r.status === 204 ? undefined : await r.json().catch(() => undefined);
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string } | undefined)?.error ?? `${method} ${path}: ${r.status}`, data);
  return data as T;
}

/** This window, on a vault on a server: the desktop's own page with the server's API through the bridge
 *  (core remote_bridge.rs). */
const throughBridge = (url: string) => { const u = new URL(url); return `/r/${u.host}${u.pathname.replace(/\/?$/, "/")}`; };
/** On a page of a server vault (`/r/<host>/…`): that server's address. */
const remoteHost = () => /^\/remote\/([^/]+)/.exec(apiBase())?.[1] ?? null;
/** The desktop's own core, whatever vault this page shows. */
async function local<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, { method, headers: { "x-atlas": "1", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = r.status === 204 ? undefined : await r.json().catch(() => undefined);
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string } | undefined)?.error ?? `${method} ${path}: ${r.status}`, data);
  return data as T;
}

async function openVault(path: string, create = false): Promise<void> {
  if (/^https?:\/\//i.test(path)) {
    try { await local("POST", "/api/vaults/open", { path }); } catch { /* remembered or not, it opens */ }
    location.href = throughBridge(path);
    return;
  }
  try {
    // the desktop's one core answers where the vault is: this window goes there (no history entry, as a switch)
    const r = await local<{ url?: string } | undefined>("POST", "/api/vaults/open", { path, create });
    if (r?.url) { location.replace(r.url); return; }
    toast("Vault opened in its own window", path, "success");
  } catch (e) {
    // a path that is not a folder yet: offer to make it — never created without being asked
    if (e instanceof ApiError && e.status === 404 && !create) {
      setTimeout(() => pick({
        placeholder: `${path} does not exist`, tag: "New vault", icon: "folder",
        items: [{ value: "create", title: `Create a new vault at ${path}`, icon: "plus" }, { value: "", title: "Cancel" }],
        onpick: (v) => { if (v) void openVault(path, true); },
      }), 0);
    } else toast("The vault was not opened", errText(e), "error", 9000);
  }
}

/** Asks for a folder, then opens it (`create`: makes it a new vault). */
function askFolder(create: boolean): void {
  setTimeout(() => pick({
    placeholder: create ? "Where the new vault goes — a folder that does not exist yet (~/Notes/Course)…" : "The folder to open as a vault (~/Notes)…",
    tag: create ? "New vault" : "Open folder", icon: "folder", items: [],
    typed: (t) => (create ? `Create a new vault at ${t}` : `Open ${t} as a vault`),
    onpick: (v, isNew) => { if (isNew && v.trim()) void openVault(v.trim(), create); },
  }), 0);
}

/** Asks for a server's address, then opens that vault in a window on its page (the sign-in in front happens there). */
function askServer(): void {
  setTimeout(() => pick({
    placeholder: "The server's address — its vault's, or the server's own (https://atlas.example.org/v/notes/)…",
    tag: "Server", icon: "server", items: [],
    typed: (t) => (/^https?:\/\/\S+$/.test(t.trim()) ? `Connect to ${t.trim()}` : "An address starting with https://"),
    onpick: (v, isNew) => { if (isNew && /^https?:\/\/\S+$/.test(v.trim())) void openVault(v.trim()); },
  }), 0);
}

/** A row of the vault switcher (components/VaultSwitcher.svelte): a folder of this computer, or a vault on a server. A
 *  folder and its mirror are one row — the server copy is the same vault (docs/design/DESIGN-mirror.md). */
export interface VaultEntry {
  name: string;
  /** The folder, or the server vault's address. */
  path: string;
  kind: "folder" | "server";
  current: boolean;
  missing: boolean;
  /** Started in this core already: switching is only a page load. */
  warm: boolean;
  /** A folder's copy on a server. */
  mirror?: string;
  /** Can be taken off the list (and, for a folder, linked to a mirror) here. */
  managed: boolean;
  go(): void;
}

export interface VaultListing { entries: VaultEntry[]; manage: boolean }

const slash = (a: string) => a.replace(/\/?$/, "/");

/** Every vault this window can switch to. On a server vault's page (through the bridge) that is the desktop's own list
 *  plus the server's vaults. */
export async function vaultListing(): Promise<VaultListing> {
  const remote = remoteHost();
  const l = remote ? await local<VaultList>("GET", "/api/vaults") : await call<VaultList>("GET", "/api/vaults");
  const theirs = remote ? await call<VaultList>("GET", "/api/vaults").catch(() => null) : null;
  const here = remote ? slash(`https://${remote}${apiBase().replace(/^\/remote\/[^/]+/, "")}`) : l.current;
  // a server lists its own vaults at their place on it (`/v/notes/`): going there is the switch
  const own = (v: Vault) => !!v.url?.startsWith("/");
  const mirrors = new Set(l.vaults.flatMap((v) => (v.mirror ? [slash(v.mirror)] : [])));
  const entries: VaultEntry[] = [];
  for (const v of l.vaults) {
    const server = !!v.url && !own(v);
    if (server && mirrors.has(slash(v.path))) continue; // shown as its folder's mirror
    entries.push({
      name: v.name, path: v.path, kind: server ? "server" : "folder", current: !remote && v.path === l.current, missing: v.missing,
      warm: v.warm, mirror: v.mirror, managed: l.manage,
      go: () => {
        if (remote && v.path === l.current) location.href = "/"; // back to this desktop's own vault
        else if (own(v)) location.replace(v.url!); // no history entry: Back never lands in the other vault
        else void openVault(v.path);
      },
    });
  }
  for (const v of theirs?.vaults ?? []) {
    const address = `https://${remote}${v.url ?? "/"}`;
    if (mirrors.has(slash(address))) continue;
    entries.push({ name: v.name, path: address, kind: "server", current: slash(address) === here, missing: false, warm: false, managed: false, go: () => { location.href = throughBridge(address); } });
  }
  // a vault served by `atlas serve` is on no list: this window's vault is shown all the same
  if (!remote && !entries.some((e) => e.current)) {
    entries.push({ name: l.current.split(/[\\/]/).filter(Boolean).pop() ?? l.current, path: l.current, kind: "folder", current: true, missing: false, warm: true, managed: false, go: () => {} });
  }
  // the vault of this window first, then as the list has them (most recently opened first)
  entries.sort((a, b) => Number(b.current) - Number(a.current));
  // on a server vault: its folder here, the mirror of this page, counts as this window
  if (remote) for (const e of entries) if (e.mirror && slash(e.mirror) === here) e.current = true;
  return { entries, manage: l.manage };
}

/** Links a folder to its copy on a server (`mirror` empty: unlinked). */
export const setMirror = (path: string, mirror: string): Promise<void> =>
  local("POST", "/api/vaults/mirror", { path, mirror: mirror.trim() || undefined });

/** Takes a vault off the list (its folder stays as it is). */
export const forgetVault = (path: string): Promise<void> => local("POST", "/api/vaults/forget", { path });

export { askFolder, askServer, openVault };

/** The vault switcher: a dialog of its own instead of a palette list. */
export async function chooseVault(opts: { linkMirror?: boolean } = {}): Promise<void> {
  if (document.querySelector("[data-testid=vault-switcher]")) return;
  const [{ mount, unmount }, VaultSwitcher] = await Promise.all([import("svelte"), import("../components/VaultSwitcher.svelte").then((m) => m.default)]);
  const host = document.body.appendChild(document.createElement("div"));
  const app = mount(VaultSwitcher, { target: host, props: { linkMirror: !!opts.linkMirror, onclose: () => { void unmount(app); host.remove(); } } });
}

/** The next vault of the list, round and round:
 *  this window's vault, then the others as the switcher lists them; a folder that is not there is skipped. */
export async function nextVault(): Promise<void> {
  try {
    const { entries } = await vaultListing();
    const usable = entries.filter((e) => !e.missing);
    const at = usable.findIndex((e) => e.current);
    const next = usable[(at + 1) % usable.length];
    if (next && !next.current) next.go();
  } catch (e) { toast("No other vault", errText(e), "error"); }
}

export const vaultActions: Action[] = [
  { id: "ui.vault", title: "Vault: switch, open or create…", keys: "Ctrl+Alt+V", run: () => void chooseVault() },
  { id: "ui.vault.next", title: "Vault: the next one", keys: "Super+V", run: () => void nextVault() },
  // the way in from a note
  { id: "ui.vault.mirror", title: "Vault: edit live on its mirror (link this vault to its copy on a server)…", run: () => void chooseVault({ linkMirror: true }) },
];
