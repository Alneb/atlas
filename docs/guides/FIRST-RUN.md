# The first start

What someone who has never run Atlas sees, on a computer that is not the developer's: no settings, no vault list,
no secrets, no `ATLAS_*` variables. The end-to-end spec `ui/tests/first-run.spec.ts` starts a core exactly so (an empty
`HOME` with its own `XDG_*` folders) and checks the path below on every gate.

## The desktop app

1. **No vault asked for and none remembered** → the app opens the **Welcome vault**, a folder in Atlas's own data
   folder (`$XDG_DATA_HOME/atlas/Welcome`, `vault_to_open` in `crates/atlas-app/src/main.rs`). It is a start page,
   nothing of the user's is written there.
2. Its page (`WELCOME_PAGE`) shows the greeting, then the **`vaults` block**, *Start with a vault*:
   - **New vault…** — makes a folder (e.g. `~/Notes`) and opens it;
   - **Open a folder…** — any folder; an Obsidian vault opens as it is;
   - **Connect to a server…** — an `atlas serve --listen` elsewhere;
   - **Your vaults (n)…** — once the list has others.
   Then *What a vault is*: one paragraph on vaults and `.atlas/`, and the two keys worth knowing — **Ctrl+Alt+V**
   switches vaults, **F1** lists every command. (An earlier page told the newcomer to press Ctrl+K, which is not
   Atlas's key, and offered no button.)
3. The chosen vault is remembered and opened at the next start.
4. **The window fits the screen.** The default 1400×900 window overflowed a 1366×768 laptop or a 1280×800 tablet;
   `fit_to_screen` shrinks a window larger than its monitor's work area to 95 % of it and centres it. A screen with
   room keeps the size asked for.

The `vaults` block (`ui/src/components/views/VaultsBlock.svelte`) is an ordinary block: `{view: vaults}` in any
`.page` or a ```` ```view ```` in a note. It goes through `lib/vaults.ts`, the same code as the vault switcher, so a
core that keeps no vault list (a server's) says so instead of offering buttons that cannot work.

## `atlas serve`

- `atlas serve <folder>` serves that folder; a folder that is not a vault yet gets its `.atlas/` and a `Home.page`,
  and the CLI says so on stderr.
- `atlas serve` with no folder serves the vault around the current folder, or the current folder — **except a bare
  home folder** (no `.atlas/` in it): there it stops with *"no vault here: name the folder to serve, e.g.
  `atlas serve ~/Notes`"*. Before, a newcomer's first `atlas serve` in `~` indexed the whole home folder and wrote
  `Home.page` and `.atlas/` into it (`serve_root` in `crates/atlas/src/main.rs`).

## Defaults that assumed the developer

- **Vim keys are off by default** (`Config::vim`), as in Obsidian: a newcomer's keys type text. The status bar's
  `vim off` turns them on; `vim = true` in `.atlas/config.toml` keeps them. The end-to-end workspace sets it, since its
  editor specs drive vim.
- Hints in Settings no longer quote anyone (the Motion setting).
- The Today page no longer flashes *"Activity — Invalid date"* while it loads (`TodayParts.svelte`: no day yet counts
  as today, the day-before button waits for a day).

## What the first start checks (`first-run.spec.ts`)

- The Today screen with nothing configured: *No FOCUS.md yet*, *Nothing captured yet today*, no `Invalid date`,
  `undefined` or `NaN` anywhere, no error toast, no page error, no HTTP 5xx.
- The served folder became a vault (its `Home.page`), and nothing was written in the home folder.
- `vim` is off.
- Settings opens (Super+,) and its Plugins page reads sensibly with no plugin installed.
- The `vaults` block offers *New vault…* and *Open a folder…*.
- `atlas serve` in a bare home folder refuses, names what to do, and writes nothing there.

## Required and optional

**Required to run:** the desktop app needs WebKitGTK 4.1 and GTK 3 (the packages pull them in); the core and
`atlas serve` need nothing beyond the binary. **Required to build:** see the README's *Build from source*.

**Optional** — a feature that needs one of these is off or says what is missing, the rest works:

| Tool | Used for |
| --- | --- |
| `git` | the Git panel, history of a note, commits in Activity |
| `tesseract` | text of scanned PDFs and pictures (OCR) |
| `latexmk` / a TeX distribution | compiling `.tex` files |
| `ssh` | the SSH plugin's remote folders and terminals |
| `podman` | running a run's container (Runs plugin) |
| a Claude CLI | the Claude agent plugin |
| `gio` / a freedesktop file manager (D-Bus) | *Show in file manager*, the trash of the desktop |
| KDE / KWin | only the capture shortcut's one-time setup and the developer's hidden-window screenshots |

First start also fetches the ad-block lists of the built-in browser (EasyList and EasyPrivacy) once; offline, the
browser works without them.

## Not checked yet

- Each optional tool's message when it is missing has not been walked through one by one on a clean machine.
- A build and a run in a container of another distribution (Ubuntu 24.04, Debian 12), to check the package lists of
  the README and of the deb/rpm/Flatpak/AppImage against what the binaries really load.
- GNOME and X11 sessions; a machine without GPU/WebGL (the terminal falls back to its text renderer).
