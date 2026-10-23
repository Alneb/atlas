# One file explorer for the vault, SSH hosts and copyparty servers

_Session 012, 2026-10-15/16._

## Why

The goal: one file explorer shared by the local files, SSH hosts and copyparty servers, integrated with the rest of the
app (files edited in the same editor as local files, sent, downloaded; ANSI colours; fast), and a big Dolphin-like
explorer as a tab.

Before: the vault had its sidebar tree (`panes/Files.svelte`); the SSH plugin had a 460-line pane of its own
(`plugins/stable/ssh/view.js`) with its list, keys, rename / delete / upload / download, a read-only reader; copyparty
had nothing. Three explorers would have meant three copies of the same list, keys and dialogs.

## The shape now

```
panes/Explorer.svelte          the one explorer (a tab): Places | bar (back, forward, up, crumbs/typed path, Hidden,
                               New folder, Upload…) | the list (Name / Size / Modified, sortable) | status line
lib/file-sources.svelte.ts     FileSource (the contract), the vault's source, the save-back of local copies,
                               downloadInto (generic download), receive (uploads from this computer), the listing cache
plugins:  atlas.files.source(def)  → a plugin's places in the explorer (ssh: hosts, copyparty: servers)
          atlas.files.explore({ source?, place?, path? })
core:     GET /api/tree           entries now carry size and modified (TreeEntry)
          POST /api/fs/upload     raw bytes to a vault path (409 unless replace)
          atlas.fetch saveIn: "remote" (→ .atlas/remote/<plugin>/…), bodyFile (a vault file's bytes as the body)
```

A **source** is `{ id, title, icon, places, list, local, save?, mkdir?, rename?, remove?, upload?, download?, onPlaces? }`.
Only `places`, `list` and `local` are required; a missing operation hides its button. `list` answers
`{ path, entries } | { waiting } | { file }` (a login to wait for — SSH's 2FA tab —, or "that path is a file", a link to one).
A plugin's source takes the plugin's id: one source per plugin, its local copies in `.atlas/remote/<plugin id>/`.

**Opening a remote file**: `local(place, path)` fetches it into its local copy and returns that vault path; the explorer
opens it with `openPath`, so the editor (text: highlighting, vim, ANSI colours), the PDF viewer and the image viewer are
the same as for any file. **Saving**: every `file:save` of a path under `.atlas/remote/<id>/` goes to that source's
`save(local, force)` (lib/file-sources `addSource`), which answers `{ saved }`, `{ changed }` (the file there changed since
the copy was made: not sent; the notice offers to save over) or `{ waiting }`. SSH compares size + date from sftp's
listing (`.atlas/remote/ssh/index.json`), copyparty its `ts` + `sz` (kept in the page's localStorage).

**Uploading**: from this computer (the file chooser, or files dropped on the list) → the vault takes the bytes directly
(`/api/fs/upload`); a remote source gets them through a staged copy `.atlas/remote/<id>/.upload/<name>` and its
`upload(place, local, dir, replace)`. A vault file (the sidebar's tree dragged onto the list, or "A file of this vault…")
→ `upload` too; in the vault itself a drop is a move. A name already there is asked about before it is replaced.

**Downloading**: a remote row's "Download…" (or a remote row dragged onto a vault folder in another explorer tab) →
`downloadInto`: the source's own `download` (SSH: a folder with everything in it), else its local copy copied into the
folder under a free name.

**Slow links**: every folder's last listing is kept for the run (`listings`), shown at once and refreshed behind
("updating…"); an answer older than the last click is dropped (`seq`). Taken from the SSH pane (0.3.3), now for all.

**Deleting**: the vault's goes to `.atlas/trash/` (as the sidebar's); SSH and copyparty delete for good, so the question
says so and a folder is deleted only when empty (copyparty's own delete is recursive; the plugin checks first).

## Keys

↑ ↓ Home End PageUp PageDown move · a letter jumps (type a few quickly: a prefix) · Enter / double-click open ·
Backspace or Alt+↑ the folder above · Alt+← / Alt+→ back / forward · F2 rename in place · Delete (asks) · Ctrl+L type a path
· F5 refresh · Ctrl+H hidden files. The SSH pane's `r` and `.` became F5 and Ctrl+H (Dolphin's), freeing letters for
type-ahead.

## Where it opens

The palette: **Files: the explorer (vault, SSH hosts, servers)**; the sidebar's Files header (the folder-open button) and
its right-click menu, **Show in the explorer**; the SSH side tool's **Files** and **SSH: browse files on…**; a block
(`view: explorer`, `source:`, `place:`, `path:`). A tab remembers where it is (its parameters) and says it in its title:
`Physics (nas)`.

## What went

- `plugins/stable/ssh/view.js` (the old Files pane, its read-only reader) and the rail button; ssh 0.5.0.
- `files_read`, `vault_folders`, `vault_files` in the ssh helper (the core lists the vault's folders now).
- sftp.py no longer refuses binary files: a PDF or a picture opens in its viewer from its copy (up to 512 MB).

## Thumbnails (2026-10-15)

The user: *"also add a thumbnail mode for the file explorer"*. A List / Thumbnails switch in the bar (remembered in this browser, `localStorage["atlas.explorer.view"]`, one choice for every explorer tab). Thumbnails is the same rows drawn as tiles (CSS grid on `.rows`), so selection, keys, drag and drop, the context menu and the hover buttons are one implementation; ← → move one tile, ↑ ↓ one line (`perLine()` counts the tiles on the first line).

Pictures come from the source: `FileSource.thumb(place, path, width)` → a `Blob`, a vault path of an image (then `/api/thumb` downsizes and caches it, `raw.ts thumbUrl`), or `null` (the icon stays). The vault: images through `/api/thumb`, PDFs' first page drawn by pdf.js into a canvas (`toBlob`, WebP). copyparty: the server's own `?th=j`. SSH: none (a picture would mean fetching the whole file over SFTP). `ui/src/lib/explorer-thumbs.ts` asks only for tiles near the screen (an `IntersectionObserver`, 300 px ahead), three at a time, and keeps each picture for the run under the file's date and size, so a changed file is drawn again; a tile gone before its turn came is skipped and asked again later.

The list view at the same time: the Modified column shows the time for today, the day for this year, else the date (the full date in a tooltip), and the row's buttons float over the row's right end on hover (no column of their own: the date ran under them, the user's screenshot of 2026-10-15).

## Other vaults (2026-10-19)
The user: *"in the file explorer in one vault we should also be able to see the files in another vault"*; asked how far,
*"Fully writable"*. `ui/src/lib/other-vaults.ts` is a built-in source, **Other vaults**, beside the vault's own:
- **Places**: every vault `/api/vaults` lists at `/v/<name>/` other than this one — the desktop's one core serves each
  local vault there (started on its first request, `server_desktop.rs`), a server its own vaults. A core serving a single
  vault has none, and the group is hidden (`FileSource.hideEmpty`; a source with nothing to set up shows no "add some in its
  settings").
- **Reads and writes** go through that vault's own API (`/v/<name>/api/tree`, `/raw`, `/fs/upload`, `/fs/mkdir`, `/fs/move`,
  `/fs/trash`, `/thumb`): the other vault's core does the writing, so its index, watchers and Trash stay its own. A
  deletion goes to *that* vault's `.atlas/trash/`.
- **Editing** is the remote files' path: a file opens from a copy in `.atlas/remote/vaults/<name>/…` (the folder names the
  vault, so a save after a restart still knows where it goes), and each save of the copy goes back. Before writing, the
  file's state there (mtime + size: a change within the same second differs in size) is compared with what was copied;
  changed → refused with "changed in <name> since it was opened here", a click saves over it. A copy from before a restart
  has no record and asks the same way.
- Test: `ui/tests/other-vaults.spec.ts` runs a second real core (`atlas serve`) and passes the page's `/v/second/` calls to it.
- Why copies and not the file opened in place: every pane reads and saves through this vault's API; opening another
  vault's path in place would need a vault on every path in the app. The copy path already exists, is tested, and
  refuses to overwrite a newer version.

## Watch out

- An Atlas older than this has no `atlas.files`: ssh 0.5.0 then says "update Atlas" on Files; copyparty adds nothing.
- `.atlas/remote/` keeps itself out of git (its own `.gitignore`, written by the core and by sftp.py) and out of search
  and `[[` (the vault walk keeps only `.atlas/pages`).
- WebKitGTK and drops from the desktop: the list takes `dataTransfer.files` as the Library pane does; the file chooser
  (Upload… → From this computer…) works everywhere.

Tests: `ui/tests/explorer.spec.ts` (the vault), `ui/tests/example-sftp.spec.ts` (SSH, a real sftp-server),
`ui/tests/example-copyparty.spec.ts` (a stand-in copyparty, `scripts/vault/tests/fake_copyparty.py`, with a password and an
address that names a folder of the server), `scripts/vault/tests/test_ssh_plugin.py` (`FilesTest`: copies, save-back, refusals),
`plugin_net.rs` (remote copies and file bodies), `files.rs` (uploads).


## The pane split into its parts (2026-10-23)

`panes/Explorer.svelte` had grown to 629 lines, mixing six concerns in one script: loading, places, keys, actions on entries, dragging and drawing. Each concern now has its own module, and the pane (429 lines, about 100 of them CSS) only wires them together:

| Module | What it owns |
|---|---|
| `lib/explorer/browse.svelte.ts` | `Browse`, one tab's folder: `loc`, `history`, `entries`, `mode`, `note`, `refreshing`, `selName`; `go` / `reload` / `up` / `travel` / `dispose`. The loading rules (the cached listing shown at once and refreshed behind; an answer older than the last click dropped with `#seq`; a login retried every 3 s; a link that turns out to be a file) live here alone. The pane's part comes through `BrowseHooks` (`file`, `stale`, `shown`, `left`). |
| `lib/explorer/places.svelte.ts` | `PlaceGroups`: the Places column's groups, filled one source at a time (15 s timeout each); `watch(sources)` reloads on a source's `onPlaces`; `markUp(loc)` flags a place connected once it answers. |
| `components/explorer/Places.svelte` | Draws the column (and its CSS; hidden under 620 px through the explorer's container query). |
| `lib/explorer/keys.ts` | `explorerKey(e, actions, at)`, the keymap as one table, and `TypeAhead`. A pure function: the keys can be read in one place. |
| `lib/explorer/actions.ts` | Open, delete (asks), new folder / rename (`finishEdit`), download, upload from this computer or the vault, a remote row dropped. Each takes `Here`, the tab read when the action runs (source, location, title, `say`, `ask`, `reload`, `focus`), so none of them reaches into the component. |
| `lib/explorer/drag.ts` | `VAULT_DRAG` / `REMOTE_DRAG` (the sidebar's tree, `panes/Files.svelte`, now imports the same constant instead of repeating the string), `dragRow`, `takesDrop`, `dropped`. |

What to watch:
- The Places effect re-runs when a source is added (`sources.list.length`): a plugin's source (SSH) that loads after the tab opened must get its group. Missing this left the column without the host, a race the sftp spec caught.
- `Browse` is a class with `$state` fields. The pane reads `b.loc` through a `$derived` alias, `loc`, and writes only through `b.go` / `b.selName`.
- Actions get `Here` built at call time (`here()`), never a stored copy: `loc` and the source change under them.
- `explorer.spec`, `explorer-touch.spec`, `example-sftp`, `example-copyparty`, `other-vaults`, `shown-names` and `reveal-outside` cover the behaviour. The split changed none of it.
