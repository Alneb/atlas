# Web links in a window of Atlas, with ads blocked

_Session 012, 2026-10-15/16._

The goal (2026-10-15): links to the internet open in a window of Atlas, ideally with uBlock Origin or another ad
blocker built in.

## What happens to a link

Every `window.open` / `target=_blank` of the main window reaches `on_new_window` (crates/atlas-app `main.rs`):

| the address | where it goes |
|---|---|
| a sign-in page returning to localhost (OAuth) | the sign-in window (unchanged) |
| `http(s)://…` with `[web] open_links = "tab"` (the default) | a **Web tab** in the dock: the app calls the page's `window.__atlasOpenWeb(url)` (`web_link` in main.rs, `ui/src/main.ts`), the same tab a clicked link gets |
| `http(s)://…` with `open_links = "window"` | a **browsing window** (`crates/atlas-app/src/browser.rs`) |
| `http(s)://…` with `open_links = "browser"` | the desktop's browser (`xdg-open`) |
| anything else (`mailto:`…) | its desktop handler |

The setting is read at each link (`Config::load`), so Settings → Web applies at once.

A browsing window is a plain WebKitGTK window on the page, titled with the page's title. A script added to every page
(`KEYS` in browser.rs) gives it keys: **Alt+← / Alt+→** back and forward, **F5 / Ctrl+R** reload, **Ctrl+W** close,
**Super+Shift+O** the page in the desktop's browser (for a site that needs the real browser: extensions, passwords).
A page cannot call the app, so the two app actions leave the page as an `atlas-browser:close?…` /
`atlas-browser:outside?<url>` address, caught in `on_navigation` and never loaded. A link that opens a new window from
there opens another browsing window.

## Ad blocking: uBlock Origin's lists, WebKit's blocker

WebKitGTK runs no browser extensions, so **uBlock Origin itself cannot run** in Atlas (nor in Epiphany/GNOME Web, for the
same reason). What WebKit has is its **content blocker**: Safari's JSON rule format (`trigger` url-filter / resource
type / domains → `action` block, css-display-none, ignore-previous-rules), compiled into a fast native matcher and applied
to every request and page of the window. So:

1. `atlas_core::web_filters` fetches the lists in `[web] filter_lists` — by default **EasyList**, **EasyPrivacy** and
   **uBlock Origin's own list** (`uAssets/filters/filters.txt`), the lists uBlock starts with — keeps them in
   `~/.cache/atlas/web-filters/lists/`, and fetches again after a week (offline: the kept copies still block).
2. They are converted with **Brave's adblock-rust** (`content-blocking` feature, what Brave uses for Safari on iOS) into
   WebKit rules, written as `rules-<hash>.json`. What WebKit cannot express is left out: uBlock's scriptlets (`##+js`,
   `#$#`), procedural cosmetic filters (`:has-text`, …), `$redirect`, `$csp`.
3. The desktop app prepares this once per run, off the main thread (`browser::prepare`), then compiles the JSON with
   WebKit's `WebKitUserContentFilterStore` (C API through `webkit2gtk-sys`; the Rust bindings stop short of it) into
   `~/.cache/atlas/web-filters/compiled/`, named by the rules' hash: the next run loads it in milliseconds instead of
   compiling again. Every browsing window gets the filter; one opened before it was ready gets it when it is.

`[web] block_ads = false` turns it off. The log (`atlas-app` stderr) says how many rules and where each list came from.

## Settings → Web

`open_links` (window / browser), `block_ads`, `filter_lists` — the settings page is generated from `WebConfig`
(`config.rs`).

## Not done

- uBlock's element picker and per-site switch (no extension UI in WebKit); a per-site "allow" would be one more
  `ignore-previous-rules` rule with `if-domain` — the place to add it is `web_filters::rules`.
- An address bar: the window is the page alone; Super+Shift+O hands it to the real browser.
- The in-app Web pane (`panes/Web.svelte`, an iframe for local services such as JupyterLab) is unchanged and unfiltered:
  most sites refuse to be framed anyway.


## Web tabs (2026-10-19)

Most websites should open in a tab, even those that forbid framing — Obsidian manages it. Before, a site opened in a tab only when it let itself be framed (`/api/web/frameable`); most forbid it with `X-Frame-Options` or CSP `frame-ancestors`, and went to a browsing window.

**Why not drop the headers.** Obsidian runs on Electron, whose `webRequest.onHeadersReceived` lets an app rewrite every response, so it strips them. WebKitGTK has no such hook: `WebKitURIResponse` has getters only (`/usr/include/webkitgtk-4.1/webkit/WebKitURIResponse.h`), a web extension's `send-request` changes requests, not responses, and the content blocker cannot touch headers. `WebKitSettings:disable-web-security` does not lift the frame check either — measured on WebKitGTK 2.54.1 in a hidden KWin (a page framing a plain page, an `X-Frame-Options: DENY` page, a `frame-ancestors 'none'` page, github.com and google.com): with the setting off and on alike, only the plain page showed. The only other way, proxying the site through the core, moves it to `127.0.0.1` and breaks its sign-in, cookies, WebSockets and anything that checks its own address.

**What is done instead** (`crates/atlas-app/src/webtab.rs`, `ui/src/panes/Web.svelte`): each web tab is a WebKit view of the app's own laid over the tab, as Obsidian's `<webview>`.
- At start the main view goes into a `gtk::Overlay` (`webtab::attach`); its page gets an `atlasWeb` script-message handler.
- The Web pane, when that handler exists, shows a placeholder (`.slot`) and posts `{op: show|hide|go|back|forward|reload|close, id: <panel id>, …}`; `show` carries the slot's rectangle in CSS px (times the view's zoom level → GTK px: an overlay child at `halign/valign = start`, margins = position, size request = size). It re-checks on resize, `atlas-layout`, visibility and every 250 ms.
- The view hides when the slot is hidden (another tab in its group, a closed panel: a zero rectangle) or **covered** by Atlas: `elementFromPoint` at five points of the slot — the palette, a dialog, a menu would otherwise lie under the native view, which GTK draws above the page. This is the one visible seam: the page blinks out while such an overlay is open.
- The app tells the pane (`atlas-web` events) the address, title, loading and back/forward state; the tab's title follows the page's. A link asking for a new window opens a new web tab.
- Keys: inside the site, Alt+←/→, the mouse's side buttons, F5/Ctrl+R are the view's; Ctrl+W (close the tab), Ctrl+P (open file), F1 (palette), Ctrl+L (the address bar) come back to Atlas **as names, not keystrokes** — a site can post them too, so the most it can do is close its own tab or open a palette.
- The views share one `WebContext` with their own data and cookies (`~/.local/share/atlas/web-tabs`, cookies in `cookies.sqlite`, kept so a sign-in lasts) — apart from the Atlas page's, so a site never holds the core's key cookie. Ad blocking is the browsing windows' (`browser::filter::apply`). Only `http(s)` addresses load.
- The page reloading (a new interface, a vault switch) drops every view (`load-changed` Started); the panes ask again.
- Elsewhere (a browser on `atlas serve`, the phone) the Web pane is the iframe as before, and `openWeb` still asks `/api/web/frameable`.
- `[web] open_links = "window"` or `"browser"` keeps links out of tabs, as before.

Checked: the debug app in a hidden KWin on a test page that asks for a tab over a red box: github.com drawn exactly over it (120, 90, 900 × 560), its address/loading events back in the page. A first run panicked — a view's `uri` signal fires inside `load_uri`, while the tab table was borrowed — fixed by keeping the main view in a cell of its own.

Rough edges to watch: a split being dragged may show the view a frame behind; Atlas keys other than the four above do nothing while the site has the keyboard; a site's own fullscreen (video) is untested.
