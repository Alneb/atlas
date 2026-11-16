// A link to a web page: with
// `[web] open_links = "tab"`, a tab of Atlas when the site lets itself be shown inside another page, else Atlas's
// browsing window — a site that forbids framing would be a blank tab. The core asks the site (web_frame.rs); the answer
// is kept per site for the session. In the desktop app every site is a tab: an iframe whose forbidding headers
// are lifted for Atlas's own page (Linux: the libsoup hook, Windows: the WebView2 extension; atlas-app main.rs). "window" and "browser" go straight to window.open, which the app routes.
import { api, ownCore } from "./api";
import { open } from "./dock";
import { settings } from "./settings.svelte";
import { confirmDialog } from "./confirm";
import { toast } from "./state.svelte";
import { errText } from "./text";

const sites = new Map<string, Promise<boolean>>();
/** The desktop app's window frames any site: on Windows its WebView2 extension, on Linux its libsoup hook removes the
 *  headers that forbid it for Atlas's own page (atlas-app main.rs). */
export const framesAnything = !!(globalThis as unknown as { __atlasFramesAnything?: boolean }).__atlasFramesAnything;
/** This run's token, known only to Atlas's top page and the web tabs' page script (atlas-app frame_page.js): a web tab's
 *  message counts only with it, so a framed site cannot speak as the script (Web.svelte). */
export const frameToken = (globalThis as unknown as { __atlasFrameToken?: string }).__atlasFrameToken ?? "";
/** The desktop app's window (atlas-app main.rs says so before the page runs), not a plain browser. */
const desktopApp = !!(globalThis as unknown as { __atlasDesktop?: boolean }).__atlasDesktop;

/** The system's browser, whatever `[web] open_links` says (Shift+click, "Open in the browser"): through the desktop's
 *  core, since the desktop window turns every window.open into a tab of Atlas; in a plain browser (or a server that
 *  refuses) window.open, which is a tab of that browser. */
export async function openOutside(url: string): Promise<void> {
  try { await ownCore("POST", "/api/open-outside", { url }); } catch { window.open(url, "_blank", "noopener"); }
}

/** "Web tabs: forget sign-ins and site data": every website's cookies, storage and cache, Atlas's own kept (atlas-app
 *  browser.rs) — asked first, since it signs you out of every site. Web tabs are frames of Atlas's page and so share
 *  its network session: this is how their data is kept apart from Atlas's. */
export async function forgetWebData(): Promise<void> {
  const hint = "Every website's cookies, stored data and cache in Atlas's web tabs and browsing windows go, so you are signed out of every site. Atlas's own data and your vault stay as they are.";
  if (!(await confirmDialog("Forget sign-ins and site data?", hint, "Forget"))) return;
  try {
    const r = await ownCore<{ sites: number }>("POST", "/api/shell/forget-web-data");
    toast("Site data forgotten", r.sites ? `${r.sites} site${r.sites === 1 ? "" : "s"} forgotten; you are signed out of them.` : "No site kept any data.", "success");
  } catch (e) { toast("Site data not forgotten", errText(e), "error"); }
}

export function openWeb(url: string): void {
  // a DOI is a paper: its note, or the offer to file it (doi-links.ts); the page itself when that cannot be done
  if (/doi\.org\/10\.|^doi:/i.test(url)) {
    void import("./doi-links").then(async (m) => { const doi = m.doiOf(url); if (!doi || !(await m.openDoi(doi))) openPage(url); });
    return;
  }
  // a file on a server Atlas browses (a copyparty link): that file in Atlas, as the explorer opens it
  if (owned?.(url)) return;
  openPage(url);
}

// who claims an address before it opens as a page: the file sources (file-sources.svelte.ts), set when they load. A
// synchronous check, so a page that opens anyway still opens within the click (a browser blocks a late window.open).
let owned: ((url: string) => boolean) | null = null;
export const claimLinks = (fn: (url: string) => boolean): void => { owned = fn; };

/** A web page in Atlas (a tab or its browsing window, `[web] open_links`). */
export function openPage(url: string): void {
  let host = "";
  try { host = new URL(url).host; } catch { return void window.open(url, "_blank", "noopener"); }
  if (!/^https?:/i.test(url)) return void window.open(url, "_blank", "noopener"); // mailto: and the like: their handler
  // Atlas in a plain browser (a vault on a server): a tab of that browser, as any web page's links
  if (!desktopApp) return void window.open(url, "_blank", "noopener");
  if ((settings.config?.web?.open_links ?? "tab") !== "tab") return void window.open(url, "_blank", "noopener");
  // the desktop app shows any site in a tab (a view of its own over the pane, panes/Web.svelte), framing allowed or not
  if (framesAnything) return void open({ kind: "web", url });
  // a failed ask (the core restarting) opens a window this time and is asked again next time, not kept as the answer
  if (!sites.has(host)) sites.set(host, api.webFrameable(url).catch(() => (sites.delete(host), false)));
  void sites.get(host)!.then((ok) => (ok ? open({ kind: "web", url }) : void window.open(url, "_blank", "noopener")));
}
