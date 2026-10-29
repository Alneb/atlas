<p align="center">
  <img src="packaging/icon/atlas.svg" width="96" alt="">
</p>

<h1 align="center">Atlas</h1>

<p align="center">
  <b>One workspace over a folder of plain files</b>: notes that render like Obsidian, papers like Zotero, mail like
  Thunderbird, an editor like VS Code and real terminals, on the desktop, the phone, an e-ink tablet and your own
  server.
</p>

<p align="center">
  <a href="https://github.com/Alneb/atlas/actions/workflows/ci.yml"><img src="https://github.com/Alneb/atlas/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0"></a>
  <img src="https://img.shields.io/badge/status-early-orange" alt="Status: early">
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/img/readme/workspace-dark.webp">
  <img src="docs/img/readme/workspace-light.webp" alt="Atlas: two notes side by side, one with its properties, a callout and an embedded Bases table, the other with LaTeX and a table">
</picture>

<sub>A demo vault (<code>scripts/dev/readme-shots.mjs</code> builds it and takes these shots).</sub>

## The idea

- **Everything is a file.** A vault is a folder. Notes are Markdown; papers, mail, drawings, runs and tables are files
  too. Atlas keeps its own settings, pages and plugins in one `.atlas/` folder. Nothing lives only in a database or on
  a server, and the vault stays readable in Obsidian.
- **Everything can be linked.** Anything that is not Markdown gets a *companion note*, made for you: the thing's
  metadata as properties and a block that shows the thing itself. You link it with `[[wikilinks]]`, search it, tag it
  and list it in Bases like any note. Citing a paper is linking to its note.
- **Integrations are plugins.** Mail, calendars, the catalogue, file servers, finance and AI agents are plugins. The
  core stays generic: files, blocks, search, the settings form, terminals, and one MCP server any agent can use
  ([docs/PHILOSOPHY.md](docs/PHILOSOPHY.md)).
- **Automation proposes, you decide.** Nothing irreversible happens without a yes, deleted things go to
  `.atlas/trash/`, and long jobs say what they are doing.

## What it does

**Writing and thinking**
- **Notes** with live preview: wikilinks, embeds, callouts, LaTeX with snippets, footnotes. Bases tables and cards
  read Obsidian's `.base` files. Tasks follow the Tasks plugin's format (priorities, dates, repeats). Templates and
  inline expressions.
- **A Today page and a daily log.** Captures land there as one line each, from any device.
- **Pages of blocks** you arrange by hand: a home screen, an inbox, a dashboard. The left bar is one too.
- **Tables**: CSV, TSV and Excel files open as a spreadsheet — edit cells, formulas, filters, sorting, groups with
  sub-totals, plots. Named views are kept in the file's note and can be embedded anywhere (`![[x.csv#view=Name]]`).
- **Drawings**: Excalidraw files with their own note. On a pen tablet a stroke becomes the shape it was meant as.

**Reading and research**
- **The Library page**: one page, one tab per library the vault has — References (papers, books, theses), Drawings,
  and those the plugins add (films and series, music, books, comics, audiobooks…). Search, sort, groups and tags at
  the side, a list or covers, the selected item's details and actions at the right.
- **References**: one folder and one note per paper, added by DOI or arXiv id with its metadata and open-access PDF,
  a `refs.bib` kept current, the Zotero browser extension answered, citations as `[[citekey]]`.
- **PDFs** rendered by PDFium (pdf.js as a backup). Highlights, underlines and ink live in the PDF's note; the PDF
  itself is never rewritten.
- **A catalogue** of what you read, watch and listen to: a pasted link, ISBN or IMDb id is recognised, looked up in the
  source plugins (TMDB, Open Library, MusicBrainz, AniList, Wikipedia, YouTube, Audiobookshelf…) and filed as a note
  of its kind; Linkwarden and download services can be told about it.
- **Readers** for EPUB books and comics (also natively on Android and e-ink), and an offline Wikipedia through
  kiwix-serve.

**Communication and life admin**
- **Mail**: a full client with a Rust engine (IMAP, SMTP, OAuth sign-in), three panes, Gmail's keys, rules, remote
  images blocked by default. The server is the store; a mail becomes a note only when you save it.
- **Calendars and contacts** over CalDAV and CardDAV, several accounts, invitations answered from the mail, push.
- **Finance**: a plain-text journal of your own, booked investment lots, bank-balance assertions, statement imports
  and bank feeds, a baseline budget.
- **Notifications**: your server's ntfy / Apprise messages filed as notes, and messages to your phone.

**Code and machines**
- **Code**: language servers, find and replace, formatting, problems, Run and Test buttons, git changes in the gutter,
  blame and staging, two vim modes.
- **Terminals** beside your notes. AI coding agents see what you are looking at through Atlas's MCP server, which is
  open to any agent; plugins offer their own tools to agents too.
- **Other machines' files in your tree**: SSH hosts and copyparty servers appear in the explorer beside the vault's
  folders. A file you opened before still opens from its kept copy when the server is out of reach.
- **Web pages as tabs**, with ad blocking (Linux).

**Everywhere**
- **Capture from anywhere**: the command bar, a global quick-capture window that opens at once, the share sheet and a
  screenshot shortcut on Android. Captures made offline are kept and sent later. Plugins act on captures: a link is
  catalogued, a screenshot's text is read, money becomes a transaction to review.
- **Server mode**: serve your vaults to a browser or the phone, with a password or a sign-in proxy (Authelia,
  Authentik…) in front.
- **Mirrors**: a vault on the laptop or the phone can mirror a vault on your server. The server hands out one writer
  at a time per file, so synchronisation (for example with Syncthing) does not produce conflicts; copies made offline
  that diverge are merged by the core.

## On which devices

| | |
|---|---|
| **Linux** | The desktop app (AppImage, `.deb`, `.rpm`, Flatpak) and the `atlas` CLI. |
| **macOS, Windows** | Built by the same workflow (`.dmg`, NSIS installer); not yet signed or notarized, and less tried. On Windows, plugins that need a shell use Git for Windows' `sh`. Ad blocking and web tabs are Linux-only for now. |
| **Android** | Three APKs: **Atlas** (the full app, with the core inside it), **Atlas for Boox** (the same app tuned for e-ink and the Boox pen) and **Atlas capture** (just the capture box). |
| **A server** | `atlas serve` or the Docker image. Every folder in `./vaults` becomes a vault. |

Each plugin states where it works in its manifest's `[platforms]`, and Settings says why a plugin is unavailable on the
system you are on.

## Plugins

Plugins live in `plugins/stable/` (used every day and holding up; their settings and files change only with a migration) and
`plugins/beta/` (they work, and may still change). [docs/guides/PLUGIN-MATURITY.md](docs/guides/PLUGIN-MATURITY.md)
says what each tier promises and where each plugin stands. Each plugin's folder has a README.

| Area | Plugins |
|---|---|
| Mail, calendar, people | [Email](plugins/stable/email), [Calendar (dav)](plugins/stable/dav), [Notifications](plugins/beta/notifications) |
| Catalogue and references | [Catalog](plugins/beta/catalog) and its sources: [Science / References](plugins/beta/catalog-papers), [TMDB](plugins/beta/catalog-tmdb), [Open sources](plugins/beta/catalog-open) (books, music, manga and anime, YouTube, Wikipedia), [Linkwarden](plugins/beta/catalog-linkwarden); services told about catalogued things: [Downloader](plugins/beta/downloader) (MeTube, TubeArchivist or your own) |
| Reading | [Books](plugins/beta/books), [Manga](plugins/beta/manga), [Kiwix](plugins/beta/kiwix), [OCR](plugins/beta/ocr), [Rnote](plugins/beta/rnote) |
| Writing and output | [Export](plugins/beta/export) (LaTeX / PDF), [Print](plugins/beta/print), [Weather](plugins/beta/weather), [Today](plugins/beta/today) (the greeting, the day's log, the vault's map) |
| Machines and files | [SSH](plugins/stable/ssh), [copyparty](plugins/beta/copyparty), [Run tools](plugins/beta/run-tools), [Syncthing](plugins/beta/syncthing) |
| Money | [Finance](plugins/beta/finance) |
| Agents | [Claude](plugins/beta/claude) |
| To copy from (`plugins/examples/`, not released) | [Word count](plugins/examples/wordcount) (the smallest plugin), [Word stats](plugins/examples/helper-python) (a plugin with a helper), [TTRPG](plugins/examples/ttrpg) (most of the page side), small integrations: [memos](plugins/examples/memos), [FreshRSS](plugins/examples/freshrss), [Immich](plugins/examples/immich), [Jellyfin](plugins/examples/jellyfin), [Paperless](plugins/examples/paperless) |

## How it is built

```
            ┌──────────────── the same Svelte 5 page ────────────────┐
            │  desktop window   ·   browser   ·   Android WebView     │
            └───────────────────────────┬────────────────────────────┘
                                        │ HTTP + one event stream (local key, or a sign-in on a server)
┌───────────────────────────────────────┴──────────────────────────────────────┐
│ atlas-core (Rust): the vault's files, the index and search, links and Bases, │
│ tasks, templates, git, PDFs, the mirror, the server, the MCP server, and the │
│ plugin host (settings, secrets, network permissions, scheduled tools)        │
└──────────┬──────────────────────────────────────────────┬────────────────────┘
           │ JSON over a pipe, or in-process (QuickJS)     │ in-process
   plugin helpers (JavaScript, Python or Rust)      the desktop app (Tauri), the CLI,
   + each plugin's page side in JavaScript          the Android app (JNI), the capture box
```

- **One core everywhere.** The desktop app, the server and the Android app run the same Rust core, and the page talks
  to it over HTTP in each case. A feature is built once and reaches every device.
- **Plugins** have a page side in JavaScript (`main.js`, optionally a `view.js` pane, either one possibly built from
  Svelte) that reloads when saved. They can also have a *helper*: JavaScript run inside the core by QuickJS (the same
  on the phone), or a long-running program — Python with only the standard library, or a compiled Rust program — that
  speaks JSON over a pipe and can call the core back on that same pipe. A plugin declares its settings, secrets,
  network hosts, agent tools, schedules and what it requires or provides in `plugin.toml`; Atlas draws the settings
  page from those declarations and enforces the rest ([docs/guides/PLUGIN-API.md](docs/guides/PLUGIN-API.md)).
- **Extending without touching this repository**: commands, templates, pages, CSS snippets and plugins can all live
  in a vault's `.atlas/` folder ([docs/guides/EXTENDING.md](docs/guides/EXTENDING.md)).

### Repository map

| Path | What it is |
|---|---|
| `crates/atlas-core` | The core: files, index, API, server, mirror, plugin host, MCP |
| `crates/atlas` | The `atlas` CLI: serve, capture, run commands, open files |
| `crates/atlas-app` | The desktop window (Tauri), with the core in-process |
| `crates/atlas-android` | The Android apps: the in-app core over JNI, the native screens (Java, no Gradle), the pen notepad |
| `crates/atlas-capture` | The quick-capture box, a native window drawn on the CPU so it opens at once |
| `crates/atlas-pen` | Pen strokes to shapes, shared by the phone's notepad and the web drawing |
| `crates/atlas-template` | The template language (`{{…}}`), a superset of Obsidian's |
| `crates/atlas-text`, `crates/atlas-plugin` | Helpers shared with plugin engines, and the Rust plugin SDK |
| `ui/` | The interface: Svelte 5 + TypeScript, CodeMirror 6, dockview |
| `plugins/stable`, `plugins/beta` | The plugins, by maturity ([docs/guides/PLUGIN-MATURITY.md](docs/guides/PLUGIN-MATURITY.md)) |
| `plugins/examples` | The smallest working plugins to copy from |
| `packaging/` | Linux packages, the Docker image, the icon masters |
| `scripts/dev/` | The gate, probes, screenshots, the dev server |

## Install

**Linux packages.** Download the AppImage, `.deb`, `.rpm` or Flatpak from the
[latest release](https://github.com/Alneb/atlas/releases), or build from source (below).

**Android.** The APKs are attached to each release. They are signed with the project's key, so later versions install
as updates ([docs/guides/ANDROID.md](docs/guides/ANDROID.md)).

**Server (Docker).** Every folder in `./vaults` becomes a vault at `http://<host>:7700/v/<folder>/`:

```sh
cp .env.example .env                                   # where your vaults are, which user owns them
docker compose run --rm atlas server password          # once: set the owner's password
docker compose up -d
```

To put a sign-in proxy in front, see [docs/guides/SERVER.md](docs/guides/SERVER.md).

## Build from source

You need Rust (stable), Node 20+ and, on Linux, the WebKitGTK development packages Tauri asks for
(`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libdbus-1-dev`, `libxkbcommon-dev` on Debian and Ubuntu).

```sh
npm --prefix ui ci && npm --prefix ui run build   # the interface, embedded into the binaries
cargo build                                       # the core and CLI (target/debug/atlas) and the desktop app
bash scripts/dev/dev.sh ~/Notes                   # the core and the UI with hot reload → http://localhost:5173
bash packaging/install.sh                         # build and install the desktop app and the CLI for this user
bash scripts/dev/gate.sh                          # every check: secrets scan, Rust tests, lints, types, build, end-to-end
```

The end-to-end tests need Playwright's Chromium once: `npx --prefix ui playwright install chromium`. Plugins with a
compiled helper build it with their own `engine/build.sh`; plugins with a Svelte pane or a TypeScript helper are built
with `node scripts/dev/plugin-ui.mjs plugins/<tier>/<id>`. The Android toolchain is downloaded into `local/` by
`crates/atlas-android/get-toolchain.sh`, and `build-apk.sh` builds the APKs with neither Gradle nor Android Studio.

## Documentation

| Start here | |
|---|---|
| [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md) | The principles every feature is checked against |
| [docs/guides/FIRST-RUN.md](docs/guides/FIRST-RUN.md) | Opening a first vault |
| [docs/guides/KEYS.md](docs/guides/KEYS.md) | The keyboard |
| [docs/guides/EXTENDING.md](docs/guides/EXTENDING.md) | Extending Atlas from inside a vault |
| [docs/guides/PLUGIN-API.md](docs/guides/PLUGIN-API.md) | Writing a plugin |
| [docs/guides/PLUGIN-MATURITY.md](docs/guides/PLUGIN-MATURITY.md) | What beta and stable promise, plugin by plugin |
| [docs/guides/SERVER.md](docs/guides/SERVER.md) | Running a server |
| [docs/guides/DEVELOPING.md](docs/guides/DEVELOPING.md) | How the app itself is changed |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The core, the API and the UI |
| [docs/INDEX.md](docs/INDEX.md) | Every other document |

## Status

Atlas is young and used every day by its author, on a desktop, a phone, an e-ink tablet and a home server. Expect
rough edges, settings that still move, and plugins at different levels of polish: `plugins/stable/` keeps its
promises, `plugins/beta/` may still change. Changes are listed in [docs/CHANGELOG.md](docs/CHANGELOG.md).

## Contributing

Issues and pull requests are welcome. Start with [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md). AI coding agents
follow [AGENTS.md](AGENTS.md). Please report security issues privately ([docs/SECURITY.md](docs/SECURITY.md)), and
follow the [code of conduct](docs/CODE_OF_CONDUCT.md).

## License

[AGPL-3.0-or-later](LICENSE), except the plugin SDK (`crates/atlas-plugin`, `crates/atlas-core/sdk/python`), which is
MIT OR Apache-2.0 so plugins may carry any licence. Third-party code inside the repository keeps its own licence
([docs/THIRD-PARTY.md](docs/THIRD-PARTY.md)).
