# A local vault's mirror

> **Superseded**: see [DESIGN-mirror-v2.md](DESIGN-mirror-v2.md). Kept as the record of the first design and why it grew. The routing it describes (`file-route.ts`, `mirror.ts` routeFile/mirrorBase, `api.ts` writeTo, the panes' held states, the phone's `CaptureActivity.toMirror`) was removed in v2 step 2: none of it exists in the code any more.

## What was asked

A notion of **mirror** (2026-10-19): a remote mirror of a local vault — the same vault both on this computer and on a server — so that files can be opened through the server while working in the local vault, for live editing, and, if possible, without Syncthing conflicts when both sides edit and save at the same time. The vault switch dialog was to be improved alongside.

Of the two options considered, option **1** was chosen: **one writer** (while the server answers, it is the only one that writes a file being edited); option 2 — both sides saving, merged somehow — was to be explored later if it could avoid conflicts.

## The situation it solves

A vault exists twice: on this computer and on a server, kept in step by Syncthing. Before this change:

- Opening a note in the desktop's vault edited the local file. The server's live room (core `live.rs`) never heard of it, so the phone or the Boox editing the same note on the server's copy saw nothing live.
- When both sides saved within Syncthing's rescan window, Syncthing produced a `.sync-conflict-…` file. A real one was found during a log reshape.

## The design: one writer

A folder on the vault list (`~/.config/atlas/vaults.toml`) may name a **mirror**: the address of the same vault on a server, for example `https://notes.example.org/v/notes/`.

```toml
[[vault]]
name = "Notes"
path = "/home/me/Notes"
last_opened = 1792400000000
mirror = "https://notes.example.org/v/notes/"
```

While the mirror answers, a **note or a drawing** (`.md`, `.excalidraw`, `.excalidraw.md`) opened in the local vault is handled entirely on the server:

- it is read from the server;
- it is saved to the server, with the server's mtimes, so the 409 conflict check works as usual;
- its live room is the server's, so the phone and the Boox editing it there are live with the desktop.

All of this goes through the desktop core's bridge, `/remote/<host>/…` (core `remote_bridge.rs`, the same bridge that carries a server vault's page). The gate's session (Authelia) is the one the desktop keeps for that host.

The local copy of that file is **never written by this window** while it is routed. Syncthing brings the server's version down. So for a file being edited there is one writer, and Syncthing never sees two versions to conflict over.

**Changes to the vault's files also go to the mirror** while it answers (added 2026-10-19, after new files made with the mirror on led to conflicts when deleted): a capture (`/api/capture`), a new note (`/api/note/new`), today's log (`/api/log/today`), a rename (`/api/fs/move`) and a deletion (`/api/fs/trash`) are made by the server (`lib/mirror.ts` `mirrorBase`, used by `api.ts`). Made here, they raced the server's newer copy: a deletion against a newer edit came back as a Syncthing conflict, and a note made here and opened through the mirror before Syncthing carried it was a second copy. A capture into another vault (the quick-capture box) stays with that vault.

The phone does the same for captures (`CaptureActivity.toMirror`): a folder vault whose copy is on a server (set, or the server vault of the same name) captures there while it answers, so the server's settings and plugins file it; with no connection, into the folder on the phone, nothing queued.

The editor ignores the local folder's change events for a routed file (they are Syncthing bringing the mirror's copy back: our own saves), and a save refused only because Syncthing rewrote the same text goes on top — no "changed on disk" banner for either.

Everything else is unchanged and stays local:

- PDFs, pictures and code;
- the file tree, search, Bases and the link index;
- recovery copies (`.atlas/cache/recovery/…`) and the `.svg` export of a drawing.

These read and write this computer's folder as before. Only the files someone can be typing in at the same moment on two devices go through the server.

### On the phone (2026-10-20)

The mirror on Android: the phone shows the same interface over its own in-app core, so it gets the desktop's mirror as it is, once that core knows two things: **the folder's mirror** and **a sign-in for that server**. When a folder vault opens (`AtlasActivity.open` → `Core.serve`), the app takes the folder's mirror (`Vaults.mirror`: the one set in its Settings, else the server vault of the same name) and calls `Core.mirror(vault, mirror, cookies)` (`crates/atlas-android/src/serve.rs` `mirror`): the folder goes on the in-app core's vault list with that mirror (`vaults::set_mirror`), and the app's session for the server — the WebView's cookies for that address and the browser sign-ins of every server of the same domain (`Web.cookies`: Authelia's session covers its whole domain) — is kept in the vault's sign-in store for that host (`service_signin::keep`), which the bridge (`remote_bridge.rs`) sends. From then on `lib/mirror.ts` routes notes and drawings through `/remote/<host>/…` exactly as on the desktop, and falls back to the folder when the server does not answer. Test: `serve.rs` `a_folder_gets_its_mirror_and_the_phones_sign_in_for_that_server`.

**The phone's Vaults page** (Settings → Vaults, `Setup.java`) is the desktop's switcher in the phone's form:

- a folder and its mirror are **one row**: the folder's path, `⇄ host`, and whether the mirror answers (`SignIn.probe`, at most once a minute: "answers", "sign in to use it", "its sign-in is refused", "not answering: the folder is used"); the server vault that is a folder's mirror is not listed again, unless it is the one in use;
- the folder's details (⋯ or a long press): **Mirror on a server… / Change the mirror…** (the known server vaults, the same-name guess marked "(same name)", **Another server…** which signs in to a new one, **None**), the mirror's sign-in rows (look it up again, sign in again, a token or a header, forget the sign-in), **Open the server's copy**, **Unlink the mirror**; the address, the mirror and how the phone is signed in to it at the top;
- a change reaches the open page at once (`AtlasActivity.mirrorChanged`: `Core.mirror` again — an empty mirror unlinks it in the core too — and the page reloaded);
- signing in to a folder's mirror keeps the folder in use (`Vaults.useServer`), where a sign-in used to switch the phone to the server.

### When the server does not answer

- **At open.** The mirror is probed (`GET <bridge>/api/workspace`) when the first file is opened, as the app starts and when a file is opened, waiting at most 5 s the first time (8 s for the answer itself: the first call crosses the internet and the server's gate), and again after a minute. If the server does not answer, the file opens locally, as before the mirror existed. A file is never held back by a server that is down.
- **While editing.** If a routed call fails (a network error, or the bridge's 502, 503 or 504), every routed file goes back to the local copy (`atlas-mirror-lost`). Each open pane then compares the local copy with what it last saved:
  - **the same text**: Syncthing has caught up, so the pane carries on locally with the local mtime;
  - **different text**: Syncthing hasn't brought the last save down yet. That is the conflict banner (reload or keep), **never an overwrite**.
- The editor says which server a note is on with a chip, `⇄ host`, at the bottom right. Next to live peers it reads `Live · phone · ⇄ host`. A drawing has the same chip at the bottom.

### The pieces

| Piece | Where | What |
|---|---|---|
| `Vault.mirror` | `crates/atlas-core/src/vaults.rs` | the address on a folder's entry, kept when the folder is reopened (`remember`), validated as an http(s) address (`set_mirror`), for folders only |
| `POST /api/vaults/mirror` | `server.rs` `vaults_mirror_post` | `{path, mirror?}`; no `mirror` unlinks; a server refuses it (its vaults are its folders) |
| the bridge reaches mirrors | `remote_bridge.rs` `base_in` | the bridge goes only to the server vaults on the list **and the mirrors of the folders on it**, nowhere else |
| `Vault.warm` | `vaults.rs`, `server_desktop.rs` `warm` | the desktop's one core says which vaults are already started (the switcher's "ready" badge) |
| the route table | `ui/src/lib/file-route.ts` | path → API base, reference-counted per pane; `api.file`, `api.putFile` and `liveSocket` ask it for every call, so every reader of a routed file follows |
| routing a file | `ui/src/lib/mirror.ts` `routeFile` / `unrouteFile` | the current vault's mirror (from `/api/vaults`), whether it answers (cached for a minute), only for notes and drawings |
| the panes | `ui/src/panes/Editor.svelte`, `Excalidraw.svelte` | route at open, unroute after the last save at close, the chip, the `atlas-mirror-lost` fallback |
| linking a mirror | `ui/src/components/VaultSwitcher.svelte` | the row's "Link mirror…": an address, with the known servers' vaults offered (a vault of the same name first); "Unlink" |

### The vault switcher

The vault switcher (`Ctrl+Alt+V`, or the vault name at the top of the sidebar) was rebuilt as a dialog of its own, in the same change, because the mirror is set there. It shows:

- a search field: a name filters the list, a folder (`~/Notes`, `/…`) or an address (`https://…`) is offered to open;
- every vault as a row: name, folder or address, and badges:
  - **this window**;
  - **ready**: started already in the one core, so switching is instant;
  - **server**;
  - **⇄ host**: the mirror, coloured by whether it answers;
  - **folder not found**;
- a folder and its mirror as **one row**: the server vault that is a folder's mirror is not listed again;
- row actions: **Link mirror…** / **Mirror…** (folders) and **Remove** (a second click confirms; nothing is deleted);
- a footer: **Open folder…**, **New vault…**, **Connect to a server…**;
- keys: ↑ ↓ Enter, Esc.

On a server vault's page (through the bridge), it lists the desktop's own vaults and the server's. A folder whose mirror is that page counts as "this window".

## Hardening (2026-10-19 evening)

An audit of every path (a subagent, read-only; each finding checked in the code) found 13 defects. What changed:

- **One rule for every write** (`api.ts writeTo`): a write to a vault file goes to the pane's route if one holds the file, else to the mirror while it answers; Atlas's own state under `.atlas/` (layouts, bookmarks, recovery copies) stays on this computer. Before, only saves of an open note, captures, new notes, the day's log, moves and trashing went there — ticking a task (`tickTask`), a property (`setProperty`), a Base cell or row (`baseRow`, `baseView`), find-and-replace (`replace`), linking a mention, a companion note, a pasted picture (`attach`), an upload, a new folder and `createFile` (new notes from Files, new drawings, plugins) wrote the copy here, under a note open on the mirror: a Syncthing conflict, or the tick silently undone by the editor's next save (it ignores the folder's events while routed). `putFile(…, { here: true })` is how a pane that opened the copy here keeps saving there.
- **A note opened on the mirror stays the mirror's when it stops answering** (`Editor.svelte hold`, the drawing pane alike). Before, the pane switched to the copy here — which Syncthing could not update either, since the network was gone — so nearly every lost connection ended in the conflict banner, whose two buttons both made a Syncthing conflict. Now the edits are kept in the editor, a banner says *"<host> is not answering. Your edits are kept here and saved there as soon as it answers"*, saving is tried every 10 s and as soon as the mirror answers (`atlas-mirror-back`). *Use this computer's copy* switches by choice: the copy here, if it holds what was last saved, carries on with the edits; else the conflict banner. A failed routed call no longer drops the routes (`file-route.ts mirrorFailed`): it marks the mirror down (files opened from then on are local) and the panes decide.
- **The mirror is asked again every minute and when the network comes back** (`mirror.ts`), so its return is seen without opening a file. A note opened here while it was down (or before the first answer at start) moves to it once both copies are the same — tried every 30 s, never jumping to an older copy while Syncthing is still carrying the newer one.
- **A sign-in that ran out** (the gate's 401 `signin` through the bridge) is a held state with a *Sign in* button (`signInToMirror`: the gate's page in a window of the app, the plugins' door; the bridge sends the cookies it keeps) — before, every autosave showed a toast, and a 401 on a routed call even sent the local page to `/login`. The vault switcher has *Sign in* on a mirror that wants one.
- **No text lost on close**: a tab closing while a save is in flight or failing saves its last text afterwards, or keeps it (`rescue`: the recovery copy `.atlas/cache/recovery/<path>`, offered back when the note opens — now for notes too, not only code). The 409 retry no longer loses the in-flight guard (a second PUT with the same base mtime). Drawings: the scene is read before the pane goes, saves queue instead of being rescheduled (the last strokes were dropped when the pane closed during a save).
- **The bridge fails fast** (`remote_bridge.rs`): connect timeout 6 s, 60 s per request — a network that silently drops packets hung every save until TCP gave up. `502 { unsent: true }` when no connection was made (nothing reached the server: a capture, a new note, the day's log, a new folder are then done here, `fallback`), `504` after a timeout (it may have been done there: never redone here).
- **A move or a deletion through the mirror** moves the open tabs at once (`atlas-moved` → gone-files.ts); before, they followed only when Syncthing brought the move, and typing in the old tab made the file again on the mirror. A file the mirror does not have (made here, not synced yet: 404 there) is moved or trashed here.
- **Unlinking or relinking** (`forgetMirrorState` → `atlas-mirror-unlinked`): the panes on the old mirror take the copy here, as above.
- **The phone** (CaptureActivity, Server.java): a capture falls back to the folder only when the server never had it (no connection, refused); sent and not answered (a read timeout, a 504) is `maybe`: said, the draft kept, never written twice (two writers of the day's log). Attachments already on the server are not attached again here. A folder's mirror can be chosen or turned off (vault details → *Mirror…*, "None"); the guess (a server vault of the same name) was impossible to turn off.

Still open from the audit: search, backlinks, the file tree and Today read this computer's index, so a capture or a new note made on the mirror shows only once Syncthing brings it; the references library's helper writes (`refsEdit`, `refsAdd`…) and git operations work on the copy here.

## What is left: option 2 (both sides saving)

The one-writer rule covers a file **open in Atlas** on the desktop. It does not cover:

- the desktop saving locally while the server is down **and** a device saving the same file on the server, both before Syncthing runs. That is still a Syncthing conflict, as before;
- a file changed by another program on this computer (an editor, a script) while it is routed. The pane's local fs event re-reads it **from the server**, so that local change reaches the pane only when Syncthing uploads it.

Exploring option 2 means merging these. Ideas, none built:

- keep the Y.Doc of each routed note (the live room's CRDT, `note-live.ts`) and replay it on reconnect instead of the conflict banner;
- have the core watch for Syncthing's `.sync-conflict-*` files and offer a three-way merge, with the common ancestor taken from git or from the trash.

## Tests

- `crates/atlas-core/src/vaults.rs`: `a_local_vault_keeps_its_mirror_across_reopens_and_a_mirror_must_be_a_server_address`.
- `crates/atlas-core/src/remote_bridge.rs`: `the_bridge_goes_to_the_listed_servers_and_the_mirrors_of_folders_only`.
- `ui/tests/vault-switcher.spec.ts`: the list with its badges, search, a typed folder, linking a mirror (one row for the pair, `mirror =` written in the list), removing a vault.
- `ui/tests/mirror.spec.ts`: a note of a mirrored vault read and saved on the server (played by the page's routes) while the local copy stays untouched; the server gone → the note stays the mirror's, the banner says so, the copy here untouched; back → the held edits saved there. Second test: *Use this computer's copy* while it is down carries the edits on here when the copy is the same as last saved.
