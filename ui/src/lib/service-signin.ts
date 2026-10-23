// Sign-ins to the services plugins reach (core service_signin.rs, docs/design/SERVICE-SIGNIN.md). When a plugin's request
// meets a gate (Authelia, Authentik…) the core says so; this offers the sign-in once per host and minute. The desktop
// app catches `/signin/door` and shows the gate's page in a window; a browser lands on a page explaining why not.
// A service that wants an OpenID token (`token`) gets the plugin's sign-in, its provider found from the service.
import { errText } from "./text";
import { on } from "./bus";
import { api, apiBase } from "./api";
import { signIn } from "./signin";
import { toast } from "./state.svelte";
import type { Needed } from "./gen/Needed";

const offered = new Map<string, number>();
const QUIET_MS = 60_000;

export function openServiceSignin(page: string): void {
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
      return toast(`Sign in to ${s.host}`, `${plugin} met a sign-in in front of it. Click to sign in; Atlas keeps it for the plugins.`, "info", 15_000, () => openServiceSignin(s.page));
    case "token":
      return toast(`Sign in to ${s.host}`, `${plugin} needs an OpenID sign-in there. Click to sign in; the token stays with Atlas.`, "info", 15_000, () => void tokenSignin(plugin, s.name, s.page));
  }
}

export function watchServiceSignins(): () => void {
  const offs = [
    on("signinneeded", (e) => offer(e.plugin, e.signin)),
    on("signedin", (e) => { offered.delete(`door:${e.host}`); toast(`Signed in to ${e.host}`, "The plugins reach it now.", "success"); }),
  ];
  return () => offs.forEach((f) => f());
}
