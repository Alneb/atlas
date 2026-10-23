// A link to a web page: with
// `[web] open_links = "tab"`, a tab of Atlas when the site lets itself be shown inside another page, else Atlas's
// browsing window — a site that forbids framing would be a blank tab. The core asks the site (web_frame.rs); the answer
// is kept per site for the session. In the desktop app every site is a tab (atlas-app webtab.rs). "window" and "browser" go straight to window.open, which the app routes.
import { api } from "./api";
import { open } from "./dock";
import { settings } from "./settings.svelte";

const sites = new Map<string, Promise<boolean>>();
const nativeTabs = !!(globalThis as unknown as { webkit?: { messageHandlers?: { atlasWeb?: unknown } } }).webkit?.messageHandlers?.atlasWeb;

export function openWeb(url: string): void {
  let host = "";
  try { host = new URL(url).host; } catch { return void window.open(url, "_blank", "noopener"); }
  if (!/^https?:/i.test(url)) return void window.open(url, "_blank", "noopener"); // mailto: and the like: their handler
  if ((settings.config?.web?.open_links ?? "tab") !== "tab") return void window.open(url, "_blank", "noopener");
  // the desktop app shows any site in a tab (a view of its own over the pane, panes/Web.svelte), framing allowed or not
  if (nativeTabs) return void open({ kind: "web", url });
  if (!sites.has(host)) sites.set(host, api.webFrameable(url).catch(() => false));
  void sites.get(host)!.then((ok) => (ok ? open({ kind: "web", url }) : void window.open(url, "_blank", "noopener")));
}
