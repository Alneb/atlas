// Sign-ins to the services plugins reach (core service_signin.rs, docs/design/SERVICE-SIGNIN.md). When a plugin's request
// meets a gate (Authelia, Authentik…) the core says so; this offers the sign-in once per host and minute. The desktop
// app catches `/signin/door` and shows the gate's page in a window, the phone app signs in in its own; a browser lands on
// a page explaining why not.
// A service that wants an OpenID token (`token`) gets the plugin's sign-in, its provider found from the service.
import { errText } from "./text";
import { on } from "./bus";
import { api, apiBase } from "./api";
import { signIn } from "./signin";
import { toast } from "./state.svelte";
import type { Needed } from "./gen/Needed";
import { nativeSignInDoor } from "./native-shell.svelte";

const offered = new Map<string, number>();
const QUIET_MS = 60_000;

export function openServiceSignin(page: string): void {
  if (nativeSignInDoor(page)) return; // the phone app: its own window, the session handed to the in-app core
  window.open(`${apiBase()}/signin/door?url=${encodeURIComponent(page)}`, "_blank");
}

/** The plugin's OpenID sign-in `name`, its provider found from the service at `page` (plugin_oauth.rs). */
async function tokenSignin(plugin: string, name: string, page: string): Promise<void> {
  try {
    const { url, redirect } = await api.pluginOauthStart(plugin, { name, resource: page });
    await api.pluginOauthFinish(plugin, await signIn(url, redirect));
    toast(`Signed in for ${plugin}`, "It reaches the service now.", "success");
  } catch (e) {
    toast(`Sign-in for ${plugin} failed`, errText(e), "error", 15_000);
  }
}

function offer(plugin: string, s: Needed): void {
  const key = `${s.kind}:${s.host}`;
  if (Date.now() - (offered.get(key) ?? 0) < QUIET_MS) return;
  offered.set(key, Date.now());
  switch (s.kind) {
    case "door":
      return toast(`Sign in to ${s.host}`, `${plugin} met a sign-in gate in front of it. Atlas keeps the session for the plugins.`, "info", 15_000, { label: "Sign in", run: () => openServiceSignin(s.page) });
    case "token":
      return toast(`Sign in to ${s.host}`, `${plugin} needs an OpenID sign-in there. The token stays with Atlas.`, "info", 15_000, { label: "Sign in", run: () => void tokenSignin(plugin, s.name, s.page) });
  }
}

export function watchServiceSignins(): () => void {
  const offs = [
    on("signinneeded", (e) => offer(e.plugin, e.signin)),
    on("signedin", (e) => { offered.delete(`door:${e.host}`); toast(`Signed in to ${e.host}`, "The plugins reach it now.", "success"); }),
  ];
  return () => offs.forEach((f) => f());
}

/** A bypass rule as typed in Settings → Sign-ins, checked by the same rules as the core's `service_signin::checked`
 *  (which still decides): either the rule to keep, or why not, in words the form shows. */
export type BypassCheck = { ok: true; hosts: string[]; header: string } | { ok: false; why: string };

/** Headers a key may never ride in: the sign-ins' own and the ones HTTP itself owns. */
const RESERVED_HEADERS = ["cookie", "authorization", "host", "content-length", "transfer-encoding", "connection"];

export function checkBypass(hostsText: string, headerText: string): BypassCheck {
  const hosts = hostsText.split(/[\s,]+/).map((h) => h.trim().replace(/\.+$/, "").toLowerCase()).filter(Boolean);
  if (!hosts.length) return { ok: false, why: "Name the hosts the key is for: abs.example.org, or *.example.org for its subdomains." };
  for (const h of hosts) {
    const bare = h.startsWith("*.") ? h.slice(2) : h;
    if (h === "*" || (h.startsWith("*.") && !bare.includes(".") && /^[a-z0-9-]+$/.test(bare)))
      return { ok: false, why: `“${h}” would send the key to every site under it. Name your own domain: *.example.org, or one host.` };
    if (bare.includes("*") || !bare.includes(".") || !/^[a-z0-9.-]+$/.test(bare) || bare.startsWith(".") || bare.includes(".."))
      return { ok: false, why: `“${h}” is not a host (abs.example.org) or a domain's subdomains (*.example.org).` };
  }
  const header = headerText.trim();
  if (!header || !/^[A-Za-z0-9_-]+$/.test(header)) return { ok: false, why: "Give the header's name your gate checks, such as X-Api-Key (letters, digits, - and _)." };
  if (RESERVED_HEADERS.includes(header.toLowerCase())) return { ok: false, why: `${header} is not for keys: Atlas sends the sign-ins there. Use the header your gate checks, such as X-Api-Key.` };
  return { ok: true, hosts, header };
}

/** Whether a bypass rule's host `pattern` (an exact host, or `*.domain` for its subdomains) names `host` — the core's
 *  `service_signin::host_matches`, so the vault switcher can say whether a server already has a key. */
export function hostMatches(pattern: string, host: string): boolean {
  const norm = (s: string) => s.trim().replace(/\.+$/, "").toLowerCase();
  const p = norm(pattern), h = norm(host);
  if (!p || !h) return false;
  if (p.startsWith("*.")) {
    const domain = p.slice(2);
    return !!domain && !domain.includes("*") && h.length > domain.length + 1 && h.endsWith(`.${domain}`);
  }
  return !p.includes("*") && p === h;
}
