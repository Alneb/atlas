# Atlas's philosophy

The principles every feature is checked against. A design that breaks one of them needs an explicit decision to do so, recorded with the design.

## 1. Everything is a file

Everything is a file, and everything can be linked.

- **Everything you work with lives in the vault as a file**: notes, pages, papers, mail, runs, drawings, tables. State that matters is never only in a database, a cache or a server.
- **Everything can be referenced with a wikilink**, `[[name]]`, the Obsidian way — and a place inside it too: a heading (`[[note#heading]]`), a block, a PDF page or passage (`[[paper.pdf#page=3&selection=…]]`, docs/guides/ZOTERO.md).
- **A thing that is not Markdown gets a companion Markdown note, made automatically**: its metadata as properties (frontmatter) and a **block that displays the thing itself**. That note is what is linked, searched, listed in Bases, tagged and backlinked:
  - a paper → `refs/papers/<key>/<key>.md` (properties from Zotero, the `library.paper` block with the PDF; `atlas paper-notes`),
  - a mail → `mail/<account>/<folder>/<date> <subject>.md` (from, to, date, message-id as properties; the mail's own HTML as the body; attachments beside it),
  - a simulation run → its run page (`notes/runs/`, the Runs plugin),
  - (to do) any other kind as it comes: a drawing, a data table, a recording.
- **Citing is linking**: a paper is cited as `[[citekey]]`, a link to its note — no separate citation syntax (`[@key]` and an `@` cite command were removed on 2026-10-15: a citation is a wikilink to the paper's note). `\cite{key}` stays inside `.tex` files, where LaTeX needs it.

## 2. Generated files are written by their feature, never patched

A companion note is written only by the feature's own path (keeping mail from the server, the paper-note generator). Generated files such as mail notes are never edited by hand or by an ad-hoc script. A format change reaches existing files by regenerating them through that path, old ones to `.atlas/trash/`, **after asking** — never by a script run over them. The owner's own writing is never touched without being asked (AGENTS.md in the vault).

## 3. Integrations are plugins; the core is generic

Email, SSH, Linkwarden, Zotero sync, Claude usage — and AI agents, each agent its own plugin over the one generic MCP server (docs/refactor/REFACTOR-agents-as-plugins.md) — are plugins (docs/guides/PLUGIN-API.md). The core offers generic pieces: files, blocks, the MCP server any agent can use, terminals, the settings form. A plugin's settings appear in Settings; every new feature is reflected there.

## 4. Obsidian-compatible, Thunderbird-grade, the owner's habits

The vault stays readable in Obsidian (wikilinks, frontmatter, callouts, `$…$` math, the Tasks plugin's emoji fields); where a domain has a reference app, its behaviour is the bar (Obsidian Tasks for tasks, Thunderbird for mail: remote images blocked by default, the sign-in that needs nothing copied). Keys follow the owner's own habits (docs/guides/KEYS.md).

## 5. Automate, but a person decides

Automation proposes and explains; nothing irreversible without an explicit yes. Deleted things go to `.atlas/trash/`. Long jobs narrate themselves.
