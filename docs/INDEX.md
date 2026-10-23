# Docs index — Atlas

**Start here:** [PHILOSOPHY.md](PHILOSOPHY.md) → [CONTRIBUTING.md](CONTRIBUTING.md) → [DEVELOPING.md](guides/DEVELOPING.md) → [EXTENDING.md](guides/EXTENDING.md).

- [PHILOSOPHY.md](PHILOSOPHY.md) — **read first**: everything is a file, everything linkable by `[[wikilink]]`, companion notes (properties + a block) for what is not Markdown, citing is linking, generated files only by their feature, integrations as plugins
- [ARCHITECTURE.md](ARCHITECTURE.md) — shape, invariants, config, and the v0 HTTP/WS API contract
- [TOOLS.md](guides/TOOLS.md) — standalone Python tools (vault scoring/migration, Zotero import, refs.bib) with measurements on real data
- [LSP-language-servers.md](guides/LSP-language-servers.md) — slice 1b: language servers (rust-analyzer, pylsp/pyright, texlab, clangd) relayed over WebSocket; [lsp] settings; fake-server test
- [MD-RENDERING.md](guides/MD-RENDERING.md) — markdown rendering vs Obsidian: the render audit (`npm run audit:md`, every note), 11 root causes fixed (528 → 11 findings), properties panel, what is left in the sources
- [PLUGINS.md](guides/PLUGINS.md) — workspace plugins (`.atlas/plugins/<id>/`: manifest, view module, data script); why Runs left the core; plugin API; trust
- [PAPERS-PDF-SOURCES.md](guides/PAPERS-PDF-SOURCES.md) — how a plugin finds a paper's PDF: `[contributes.catalog-papers] pdf_sources`, `atlas.attach_pdf`, `POST /api/refs/attach`, the order setting; papers-open-access (Semantic Scholar, Europe PMC, CORE)
- [ZOTERO.md](guides/ZOTERO.md) — Zotero → Atlas: automatic one-way sync (three-way per field, conflicts reported) and saving from the browser via the Zotero Connector protocol (off by default, `[refs] connector`); the reading note `<citekey>.md` and the `library.paper` block (section 4)
- [MALLEABLE.md](guides/MALLEABLE.md) — the design guideline (D21, Ink & Switch *Malleable Software* + *Embark*): rules R1–R7, the rung ladder from settings to core, what exists vs planned, roadmap
- [SETTINGS.md](guides/SETTINGS.md) — Settings rebuilt as pages: sidebar + search across pages, features to try per area, controls by field shape, modified/reset, accent/interface font/line height, plugins on/off, keyboard page, toolsmith drafts, pages as `.page` blocks
- [SERVER.md](guides/SERVER.md) — server mode: `atlas serve --listen`, the sign-in (password / Authelia / both), device tokens, Settings → Server, the CLI
- [ANDROID.md](guides/ANDROID.md) — the phone capture app: the capture box as a native Android app, the toolchain in local/toolchains/ (NDK + build-tools + one platform), build-apk.sh, what comes next
- [MOBILE.md](guides/MOBILE.md) — the web UI on a phone: below 720 px one pane at a time (fullscreen held), a bottom bar (Home, Files, Search, Tabs sheet, Commands), what comes next
- [UI-STYLE.md](guides/UI-STYLE.md) — the interface rules every visible change is checked against (tokens, typography, hierarchy, interaction, motion, layout, words), distilled from the design skill, Vercel's guidelines and Practical Typography
- [PAGES.md](guides/PAGES.md) — `.page` screens arranged by hand: the file format, arrange mode (drag, add, resize, menu, undo; one file write per gesture), `page-doc.ts` model, limits
- [NOTES-SYSTEM.md](guides/NOTES-SYSTEM.md) — the note system's generic pieces (review queue in the notes' properties, next actions, typed links, tree by a property, notes from templates, capture as notes, what is left out of the index) and the starter kit `kits/flap/`
- [EXPRESSIONS.md](guides/EXPRESSIONS.md) — notes that compute: inline `` `= expr` `` in JavaScript (worker, what an expression sees, trust), `key:: value` section properties inherited down the outline and read by blocks
- [SHELL.md](guides/SHELL.md) — the shell as files: vaults (Obsidian-style chooser, one window per vault, `~/.config/atlas/vaults.toml`), the layout in `.atlas/cache/layout.json`, named workspaces in `.atlas/workspaces/` that are also commands, pins and bookmarks in `.atlas/bookmarks.yaml`, the sidebar as a page of blocks (`.atlas/sidebar.page`)
- [DEVELOPING.md](guides/DEVELOPING.md) — changing Atlas itself: the five concepts, code map, the dev loop and gates, recipes (add a block, setting, command, route, pane, editor feature), conventions, tests, debugging, release
- [EXTENDING.md](guides/EXTENDING.md) — extending Atlas from inside a vault with no change to the app: the scope rule (vault vs core), the lightest-rung table, recipes for pages, blocks in notes, commands, `init.js`, plugins, the `atlas` plugin API; printed by `atlas guide`
- [TASKS.md](guides/TASKS.md) — tasks: what a task line can say (the Obsidian Tasks fields, read by shape), what ticking does (a date stamp, the next occurrence of a repeating task), and the `task-list` block: filter by tag / folder / priority / date, sort, group, limit
- [ICON.md](guides/ICON.md) — Atlas's icon: the app mark (globe + folded map) and the tab's `[[ globe ]]`, one master SVG each, `scripts/dev/icons.mjs` writing every PNG/ICO/ICNS (Tauri, Android adaptive, favicon, KDE hicolor), the vault-initial badge, how it was chosen
- [FIRST-RUN.md](guides/FIRST-RUN.md) — the first start of someone new: the Welcome vault and its `vaults` block (New vault / Open a folder / Connect), the window fitted to the screen, `atlas serve` refusing a bare home folder, vim off by default, required vs optional tools, the spec that checks it, what is not checked yet
- [CAPTURE.md](guides/CAPTURE.md) — quick capture from anywhere: the small floating box (`atlas-app --capture`), choosing the vault, the KDE shortcut to set once, how it avoids a second core on a vault, and what was not checked on a real screen
- [CONTRIBUTING.md](CONTRIBUTING.md) — for someone changing Atlas: where a change goes (vault, here, or a plugin), setting up, the gate, the rules changes follow, how commits are made
- [KEYS.md](guides/KEYS.md) — the default keys: the Super layer (Super = the app, Ctrl = text editing, nothing on the desktop's KDE keys), how a focused terminal keeps its keys, Super detection on WebKitGTK
- [TERMINAL.md](guides/TERMINAL.md) — the terminal's drawing, colours and fonts: why Claude's ⎿ and │ looked wrong (font subsets, line gaps) and the fix (Atlas Term Symbols, WebGL, a 16-colour palette per theme with a contrast floor), focus fixes, what is still open (a Claude view with LaTeX, sessions that outlive Atlas)
- [SECURITY.md](SECURITY.md) — how to report a vulnerability privately; what is in scope
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — the Contributor Covenant 2.1, by reference
- [THIRD-PARTY.md](THIRD-PARTY.md) — the code from elsewhere (softbuffer, dockview CSS, obsidian-web) and its licences
- [PLUGIN-API.md](guides/PLUGIN-API.md) — **for a plugin's author**: the manifest, every `atlas.*` member by what you want to do, the helper's protocol, the CLI, what is promised to stay — on one page
- [TEMPLATES.md](guides/TEMPLATES.md) — Atlas's own template language: dates with formats and offsets, values, prompts, includes, filters, if/each blocks; templates never linked
