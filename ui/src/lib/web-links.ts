// A link to a web page: with
// `[web] open_links = "tab"`, a tab of Atlas when the site lets itself be shown inside another page, else Atlas's
// browsing window — a site that forbids framing would be a blank tab. The core asks the site (web_frame.rs); the answer
// is kept per site for the session. In the desktop app every site is a tab: on Linux a native view (atlas-app webtab.rs), on Windows an iframe whose
// forbidding headers the app's WebView2 extension removes (atlas-app main.rs `frame_any_extension`). "window" and "browser" go straight to window.open, which the app routes.
import { api, ownCore } from "./api";
import { open } from "./dock";
import { settings } from "./settings.svelte";

const sites = new Map<string, Promise<boolean>>();
/** The desktop app's window frames any site: on Windows its WebView2 extension, on Linux its libsoup hook removes the
 *  headers that forbid it for Atlas's own page (atlas-app main.rs). */
export const framesAnything = !!(globalThis as unknown as { __atlasFramesAnything?: boolean }).__atlasFramesAnything;
/** The desktop app's window (atlas-app main.rs says so before the page runs), not a plain browser. */
const desktopApp = !!(globalThis as unknown as { __atlasDesktop?: boolean }).__atlasDesktop;
const nativeTabs = !!(globalThis as unknown as { webkit?: { messageHandlers?: { atlasWeb?: unknown } } }).webkit?.messageHandlers?.atlasWeb;

/** A web tab uses the native view (Linux, atlas-app webtab.rs) only when there is no hook, or `[web] tab_view = "native"`. */
export const nativeTabView = (): boolean => nativeTabs && (!framesAnything || settings.config?.web?.tab_view === "native");

/** The system's browser, whatever `[web] open_links` says (Shift+click, "Open in the browser"): through the desktop's
 *  core, since the desktop window turns every window.open into a tab of Atlas; in a plain browser (or a server that
 *  refuses) window.open, which is a tab of that browser. */
export async function openOutside(url: string): Promise<void> {
  try { await ownCore("POST", "/api/open-outside", { url }); } catch { window.open(url, "_blank", "noopener"); }
}

export function openWeb(url: string): void {
  let host = "";
  try { host = new URL(url).host; } catch { return void window.open(url, "_blank", "noopener"); }
  if (!/^https?:/i.test(url)) return void window.open(url, "_blank", "noopener"); // mailto: and the like: their handler
  // Atlas in a plain browser (a vault on a server): a tab of that browser, as any web page's links
  if (!desktopApp) return void window.open(url, "_blank", "noopener");
  if ((settings.config?.web?.open_links ?? "tab") !== "tab") return void window.open(url, "_blank", "noopener");
  // the desktop app shows any site in a tab (a view of its own over the pane, panes/Web.svelte), framing allowed or not
  if (nativeTabs || framesAnything) return void open({ kind: "web", url });
  // a failed ask (the core restarting) opens a window this time and is asked again next time, not kept as the answer
  if (!sites.has(host)) sites.set(host, api.webFrameable(url).catch(() => (sites.delete(host), false)));
  void sites.get(host)!.then((ok) => (ok ? open({ kind: "web", url }) : void window.open(url, "_blank", "noopener")));
}
