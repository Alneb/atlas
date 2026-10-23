# Atlas's icon

Atlas has one app icon and one browser-tab icon. Both are drawn as SVG in `packaging/icon/`, and every other icon file in the repository is generated from them by `node scripts/dev/icons.mjs`. **No icon PNG is edited by hand.** To change the icon, change a master SVG, run the script, look at the output, and commit the masters and the outputs together.

## The two marks

| File | What it is | Where it shows |
|---|---|---|
| `packaging/icon/atlas.svg` | **The app icon.** A globe (one meridian and the equator, tilted), in front of a three-panel folded map, with a dotted route from the globe to a note on the map. White on a rounded tile with a gradient from `#4864dd` (the light theme's accent) to `#8150d6` (its violet). | The desktop app's window and bundle, the KDE launcher, task bar and Alt+Tab, the Android launcher, the capture box's window, and the icon a phone uses when the web app is added to its home screen |
| `packaging/icon/atlas-glyph.svg` | The same drawing without the tile: white on transparent. | Android's adaptive foreground and its themed (monochrome) layer |
| `packaging/icon/favicon.svg` | **The browser-tab icon.** `[[ globe ]]`: double wikilink brackets around the same globe, on the same tile. | Browser tabs, for the server (local or remote) and the Vite dev server |

Why two marks: the app icon has fine detail (the map's folds and the dotted route) that blurs at 16–32 px. The bracketed globe stays crisp at 16 px and rhymes with the app icon (the same globe and the same tile), so the user chose it for the tab.

The meaning, in the user's terms: an *atlas* is a book of maps, and in topology it is a set of charts that cover a manifold, each chart a patch carried onto a flat map. The globe and its map are that chart. The route ending on a note, and the `[[ ]]` of the favicon, stand for "everything is linkable" (`docs/PHILOSOPHY.md`).

The map is hidden behind the globe with an SVG **mask**, not by painting the globe's inside in the tile colour. That keeps the glyph transparent there, which Android's monochrome layer needs, and the tile's gradient shows through the globe exactly.

## What the script writes

`node scripts/dev/icons.mjs` needs `rsvg-convert` (librsvg) and ImageMagick's `magick`. It logs each stage.

- **Desktop app** (`crates/atlas-app/icons/`, listed in `tauri.conf.json` → `bundle.icon`): `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png` (256), `icon.png` (512), `icon.ico` (16/32/48/256) and `icon.icns` (128/256/512). No Linux tool writes ICNS, so the script writes the container itself: an `icns` header, then `ic07`/`ic08`/`ic09` entries, each one holding a PNG.
- **Android** (`crates/atlas-android/android/res/`): `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png` (the whole tile at 48/72/96/144/192 px, for launchers older than adaptive icons) and `ic_launcher_fg.png` (the glyph at 108/162/216/324/432 px). The glyph is shrunk into a 780-unit square so its corners clear the **66 dp safe circle** of the 108 dp layer: a launcher may mask the icon to a circle, and an earlier 605-unit version had the map's corners cut off. `mipmap-anydpi-v26/ic_launcher.xml` puts that foreground on `drawable/ic_launcher_bg.xml`, a gradient shape with the tile's two colours at 315° (top-left to bottom-right). The old flat `#1f2229` background and its `values/colors.xml` are gone.
- **Browser** (`ui/public/`, which Vite copies into `ui/dist`): `favicon.svg` (a copy of the master), `favicon.ico` (16/32/48) and `apple-touch-icon.png` (180, from the app icon). `ui/index.html` links all three with absolute paths, as it does its built assets, so they resolve for a vault at `/v/<name>/` too. The core serves them through its normal static route (`server.rs` `ui_file`): it finds them in the installed UI or the embedded `Dist`, with the MIME type guessed from the extension.

## Where the files are used

- **KDE / freedesktop**: `packaging/install.sh` installs the PNGs into `~/.local/share/icons/hicolor/{32x32,64x64,128x128,256x256,512x512}/apps/atlas.png` and the master as `scalable/apps/atlas.svg`, then refreshes the icon cache if `gtk-update-icon-cache` exists. All three desktop entries say `Icon=atlas`. Before this change only a single 128 px PNG was installed, so every other size was scaled from it.
- **The capture box** (`crates/atlas-capture/src/window.rs`, `window_icon`): the 64 px PNG is built into the program (`include_bytes!`) and set as the winit window icon. That matters on X11. On Wayland the compositor takes the icon from the desktop file that the app id `atlas-capture` names (`atlas-capture.desktop`, `Icon=atlas`).
- **The desktop app's window** uses Tauri's bundle icons, which are compiled in, so it needs a rebuild of `atlas-app` to change.

## Inside the app: the vault's initial, not the logo

The badge at the top of the rail and of the sidebar used to be a hard-coded letter "A". It is now `ui/src/components/VaultBadge.svelte`: the open vault's initial, so two windows on two vaults can be told apart at a glance. It takes the first letter or digit of the name (`~notes` → `N`), otherwise the first grapheme (an emoji stays whole), in upper case. The tooltip is the vault's name. It keeps the old badge's theme gradient, so it follows light, dark and e-ink. `Rail.svelte` (30 px) and `Sidebar.svelte` (28 px) both use it, where each used to carry its own copy of the style.

## How it was chosen

Six rounds on one gallery page (a private claude.ai artifact). The candidates' generator scripts were scratch work and are not kept.

1. Nine marks: the graph "A", wikilink brackets, the refined globe, and new ideas (Atlas holding the world, a folded map). Favourites: 1, 4, 6, 8 and 9 (the figure in 8 looked odd), and the idea of a **topological atlas** came in.
2. Twelve marks on charts covering a manifold, crossed with those favourites. Picks: 17 (a graph A on a globe), 19 (the globe to a map page, to simplify further), 21 (`[[globe]]`, the most finished), and 18 (a torus) as an honourable mention.
3. Refinements that drifted too far; back to the earlier picks.
4. Close variants: 21f or 19e, with 19e preferred as closest in spirit. At 16 px 19e blurs and 21f stays crisp, which led to the split: **19e for the app, 21f for the tab**.
5. 19e with brackets added: rejected.
6. 19e with its map note drawn as `[[ ]]`; final: 19e for the app, plus the browser icon already chosen.
