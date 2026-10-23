# The mirror, rethought: local copies, the server as relay and lease-keeper

Status: **agreed, being built**. It replaces
the per-file routing of [DESIGN-mirror.md](DESIGN-mirror.md).

## What was asked

The first mirror design had become unsustainable and needed rethinking (2026-10-20). Of the options — local copies
with bridged live rooms, the whole vault on the server, Atlas doing the sync itself, or no mirror — the first was
chosen: local copies, the server as relay for the live rooms, and no Syncthing conflicts.

So: every device reads and writes **its own copy**; the server is the **relay of the live rooms**; and the design must
make **Syncthing conflicts impossible** (not merely rare, not merely repaired).

## Why the first design was unsustainable

DESIGN-mirror.md made the server the only writer of a file open on the desktop, and enforced it **per API call in the
interface**: `api.ts writeTo`, `file-route.ts`, `mirror.ts`, each pane holding a route. Every way a file can be
written had to learn to go to the server: saves, ticking a task, a property, a Base cell, find-and-replace, a pasted
picture, an upload, a new folder, `createFile`, captures, the day's log, moves, trash, plugins — the audit of
2026-10-19 found 13 holes, and listed more it could not close (search, backlinks, the tree and Today read the copy
here; the references helper and git write it). On top: held states when the server stops answering, sign-in states,
fallbacks that depend on whether a 502 or a 504 came back, rescue copies on close — and the whole of it a second time
on the phone (`CaptureActivity.toMirror`, `Setup.java`, `Vaults.java`). Every new feature that writes a file was a new
hole. The interface was being asked to be a distributed system.

## What Syncthing actually does (measured)

Two isolated Syncthing 2.1.6 instances on this computer (own homes and ports, discovery and relays off; a throwaway script `st/sttest.py`): a file synced on both, both folders paused, each side writes, resumed.

| Both sides wrote | Result |
|---|---|
| the **same** bytes | **no conflict**, one file |
| **different** bytes | `diff.sync-conflict-20261020-231529-H3IIIUW.md` on both sides (the server side's text kept as the file) |

A conflict is two **concurrent** changes with different content. The same content written on both sides is harmless.
But "both cores save the same text" is not enough to rely on: while someone types, the two sides autosave at different
moments, and whatever Syncthing scans on each side at that time differs → a conflict on an intermediate save, even if
the final texts agree. **No conflicts therefore means: at any moment one device writes a given file, and it writes it
only on top of the latest version.** That is a rule for the core, not for each button in the interface.

## The design: one writer at a time, granted by the server

### 1. Every device writes its own copy

The desktop's core writes `~/Notes`, the server's core writes the server's `~/Notes`, the phone's in-app core its folder.
No file is ever read or written through the bridge for a mirrored vault. The index, search, backlinks, Bases, Today,
the tree, helpers, git: all work on the copy here, exactly as in a vault without a mirror. **`file-route.ts`, the
routing half of `mirror.ts`, `api.ts writeTo`, the panes' route/hold/rescue states and the phone's mirror captures go.**

### 2. A write needs a lease from the server (while the server answers)

The server's core keeps, per mirrored vault, a table **path → (holder, version)** where `version` is the hash of the
last content written by anyone. Before the core here writes a file of a mirrored vault (any write: a save, a tick, a
capture, a rename, a deletion, a helper's write — they all end in one place in the core, `files::write…` and friends,
which is where the check goes, once):

1. it asks the server for the path's lease, sending the hash of **its own copy on disk**;
2. the server grants it only if **no one else holds it** and the hash sent is the **last version** (the two copies are
   in step: Syncthing has carried the last write over). Otherwise it answers *wait* (with why: held by the phone, or
   your copy is behind);
3. granted → the core writes, then tells the server the new version (hash). The lease is short for a one-off write,
   held for as long as a pane is the writer of a live room (§3);
4. *wait* → the write waits (a capture, a tick) and is retried as Syncthing catches up — a few seconds; the interface
   says so after a second ("waiting for Syncthing to bring the server's copy").

The server's own writes take the lease in the same table, without a network call. With every write serialized through
"one holder, on top of the last version", Syncthing never sees two concurrent changes: **no conflict is possible while
the server answers.** Writes to Atlas's own state under `.atlas/cache/` (layouts, recovery copies) need no lease (not
synced, or per device).

### 3. Live rooms: the server relays, one pane writes

A note or a drawing open on several devices is one live room **on the server** (`live.rs`): the desktop's core joins
the server's room for the path through the bridge (it already reaches the mirror for the sign-in), and its own panes
join their local room as today, the core relaying between the two. The room's messages (the note's CRDT updates, a
drawing's elements, the pen's pointer) reach every device; each device's text is the same.

Only **one pane in the room saves**: the room's **writer**, the holder of the path's lease. The room says who it is
(`{"t":"writer","peer":n}`); the others do not save while they are in the room (their edits reach the writer through
the room, and come back to their own disk through Syncthing). The writer saves to **its own core** — the desktop's
pane to `~/Notes` here. When the writer leaves (closes the note, loses the network), the lease goes to the next pane, which
starts saving **only once its own copy has the last version** (rule 2) — until then it keeps the edits in the room.

### 4. When the server does not answer

Then no lease can be had, and the copy here is written as in any vault — **this is the only way two concurrent
changes can still happen**: the desktop offline and the phone editing the same file on the server. To make even that
invisible, the core keeps the **last version it knew both copies had** (the base, `.atlas/cache/sync-base/<path>`,
saved at each lease) and watches for Syncthing's `*.sync-conflict-*` copies of text files: it merges the two sides
against the base (a three-way merge, line by line; notes' properties key by key), writes the result **with a lease**,
and moves the conflict copy to `.atlas/trash/`. Only when both sides changed the same lines does it ask (the conflict
banner, both texts shown). Drawings merge element by element (`Excalidraw.svelte mergeTheirs` already does this).

### 5. What stays from the first design

The vault list's `mirror = …` (one line: "this folder is also on that server"), the vault switcher's one row per pair
and `⇄ host`, the bridge and its sign-in, the phone's Vaults page (minus its mirror captures). The `⇄ host` chip now
means "live with the server" and says who writes.

## Before / after

| | Before (DESIGN-mirror.md) | After |
|---|---|---|
| where a note is read/written | the server, through the bridge, per pane | always here |
| who decides | the interface, per call (`writeTo`, routes) | the core, once, at its write functions |
| search, backlinks, Today | stale until Syncthing | unchanged (always here) |
| helpers, git, plugins | wrote here: conflicts | take the lease like everything else |
| live with the phone | yes, by reading the server's file | yes, by relaying the server's room |
| server down | held states, banners, fallbacks | plain local vault; a later conflict merged by the core |
| conflicts | rare | none while connected; merged against a base when not |

## Decided

1. Leases: *"So determine if its safe to write to the server without syncthing conflict, if not it has to be local and
   the server has two purposes. 1 live edit routing. 2 full server mode its just on the server no local"*. Read as:
   writing the server's copy from here (the first design) is safe only if this copy is never written meanwhile, which
   cannot be promised → **every write is local**. The server's two roles: **(1) the live rooms' relay**, **(2) full
   server mode** — a server vault opened as such (`/v/<name>/`), nothing local. "Determine if it is safe" is the lease
   check of §2, on every local write of a mirrored vault.
2. Offline: **edit, and the core merges** Syncthing's conflict copies against the base (§4).
3. Syncthing's API: **yes, as a plugin** (scan the written file at once).

## As built: step 1

Built in three parts:
- `vault_write.rs`: the one write path, plus the clippy rule. See [REFACTOR-vault-write.md](../refactor/REFACTOR-vault-write.md).
- `lease.rs`: the table.
- `mirror_guard.rs`: the guard on both sides, the wire format, the device id, and the bases.

The details:
- **Wire.** `POST <vault>/api/lease/ask {path, holder, have}` answers one of:
  - `{"granted":true}`,
  - `{"held_by":"<device>"}`,
  - `{"behind":true,"last":"<sha256 hex>"|null}`.

  `POST …/api/lease/done {path, holder, version}` hands the lease back. A `done` from a device that no longer holds the lease is ignored, because the lease ran out and was given to someone else. The endpoint sits behind the server's sign-in like the rest of the API, answers only on a server core, refuses the holder name `server` (the server's own core) and refuses paths outside the vault.
- **Holding.** A one-off write holds a lease for 30 s (`HOLD`) at most, and its `after` hands it back at once. A device that vanishes mid-write frees the path when the 30 s run out.
- **Behind, by kind of change.**
  - A write, removal or rename whose copy is behind fails at once with `Conflict` (409). Its new content was computed from the old version, so writing it after waiting would silently undo the other device's change. The editor already treats a 409 as "changed on disk, reload".
  - An append or a create waits up to 20 s for Syncthing to bring the last version, then goes on top of it.
  - Held by another device: any kind waits up to 20 s, then fails with "being written by <device>".
- **Unreachable** (no network, signed out, an older server) means the write is made here only, with a log line. That is the offline case of §4.
- **The server's own writes** take the lease only after the first device has asked for one. A vault nobody mirrors (full server mode) is never hashed on write.
- **Bases.** After a write made under a granted lease, the new content is the version both copies will have, so it is kept in `.atlas/cache/sync-base/<path>` (files ≤ 2 MB). It is not kept after an offline write. A rename moves the base, and a removal drops it.
- **Folders** take no lease (`Mkdir`, `RemoveDir`). A file's own change is what Syncthing compares.
- **Not covered yet** (from the funnel's notes):
  - outside programs that write vault files themselves (helpers, `git`);
  - `atlas-app` writing the Welcome vault at first start.
- **Tests.**
  - `lease::tests`: 2.
  - `mirror_guard::tests`: 5. They cover a stale save refused, an append waiting for Syncthing, a held path, an unreachable server, a rename, the bases and the wire format.
  - `tests/mirror_lease.rs`: a real password server and a desktop vault reaching it over HTTP with a kept cookie. The desktop writes v2, and the server's save from v1 gets a 409. After the "Syncthing" copy the server writes v3, and the desktop's v2-based write then gets a `Conflict`. A fake `server` holder, a path outside the vault and a request without sign-in are all refused.

## As built: step 2

The interface no longer knows where a file is written; every call goes to `apiBase()`.
- **Removed.** `ui/src/lib/file-route.ts` (the route table). In `mirror.ts`: `routeFile`, `unrouteFile`, `mirrorBase`,
  `LIVE_KINDS`, the `atlas-mirror-lost` / `atlas-mirror-back` events and the minute-by-minute re-asking that existed
  to move held panes. In `api.ts`: `writeTo`, `viaMirror`, the `route` / `fallback` request options, `ApiError.routed`,
  `mirrorTrouble` / `MirrorTrouble`, `putFile`'s `here` option, the 404-then-here retry of `move` / `trash` and their
  `atlas-moved` event (with its listener in `gone-files.ts`: the watcher's `fs` events close and follow tabs, as for
  any other change). In `Editor.svelte` and `Excalidraw.svelte`: `via`, `held`, `hold()`, `useHere()`, `mirrorDown`,
  the 10-second retry, the mirror's event listeners and the held banners ("is not answering", "Use this computer's
  copy"). On the phone: `CaptureActivity.toMirror` and the second `toFolder` that resumed after it; a capture of a
  folder vault is always `Core.save` / `Core.attach` in the in-app core.
- **Kept.** `bridgeBase`, `hostOf`, `MirrorState`, `reach`, `serverVaults`, `mirrorState`, `forgetMirrorState` (it
  still fires `atlas-mirror-unlinked`, now only so the chips ask again), `signInToMirror`. The vault switcher's linking
  and unlinking, the phone's Vaults page and its mirror field. The panes' conflict banner, the recovery copies, the
  rescue on close for a save that really failed, and the live-room writer logic (`live.writes()`, the writer behind
  the last version retrying each second).
- **The chip.** A note or drawing of a vault with a mirror shows one `⇄ <host>` chip: "live with the server", its
  title saying who writes (this device when `live.writes()`, else "another device writes; its saves come here through
  Syncthing"). Not answering: `⇄ host · offline` (dashed), saved here only; wanting a sign-in: `⇄ host · sign in`,
  which on a note opens the server's sign-in. With others in the room it is folded into the `Live · …` chip.
- **Tests.** `ui/tests/mirror.spec.ts` rewritten: a mirrored vault's note is saved in the folder here while the server
  answers (the chip says this device writes) and while it does not (the chip says offline, no held banner); in both,
  no call of the page goes to the server's `/api/file`.
- **Not yet.** The phone's in-app core does not take the lease (step 6), so a phone capture of a mirrored folder is a
  plain local write until then.

## As built: step 3

- **One room per file, on the server.** A desktop core's `/api/live` for a vault with `mirror = …` is spliced to `<mirror>api/live`. It uses `remote_bridge::connect` with the gate's kept cookies and a 6 s timeout, then `splice`. So every pane of every device is a peer in the server's room. When the server does not answer, the pane joins the room here, as before.
- **The writer** (`live.rs`) is the earliest device still in the room.
  - `hello` carries `writer`.
  - When the writer leaves, the room itself (sender 0) sends `{"t":"writer","peer":w}` to everyone.
  - `Rooms::writer(path)` answers who writes.
- **The UI.**
  - `live.ts` offers `writes()`: true for the writer, for a device alone in the room, and for a device out of any room.
  - It calls `writing()` when the room hands the writer role over.
  - Editor.svelte and Excalidraw.svelte save only when `writes()` is true. A new writer saves at once.
  - A writer whose save gets a 409 (its copy is behind, so the lease was refused) waits 1 s and tries again, at most 30 times. Before, it retried in a tight loop.
- **Tests.** `live::tests` covers the writer handover. The e2e note-live and draw-live specs pass 4/4 on a fresh build; "the file holds both" holds.

## As built: step 4

`sync_merge.rs`, spawned per served vault beside the scheduler (`VaultRun.merges`).
- **Which files.** `original_of` recognises Syncthing's names: `<name>.sync-conflict-<8 digits>-<6 digits>-<device>[.<ext>]`. It does not match Syncthing's `.syncthing.*.tmp` downloads.
- **When.** The vault is scanned at start, for copies made while no core was running. After that, every `Fs` event naming a copy is handled.
- **The merge** (`merge3`) is a line diff3 against `.atlas/cache/sync-base/<path>`:
  - a change on only one side is taken from that side;
  - the same change on both sides is taken once;
  - changes to the same lines, or to neighbouring lines with no line both kept between them, are left for the user;
  - lines keep their endings, so unchanged parts come back byte for byte.
- **What happens after the merge.**
  - Clean: the result is written through `vault_write` (so with a lease, when the server answers), and the copy is moved to `.atlas/trash/<stamp>/`. It never goes to the desktop's Trash, and the move syncs to the other side.
  - A copy whose text equals the file's is trashed the same way.
  - The copy is left in place, with a log line saying why, when there is no base, the file is not UTF-8, the merge clashes, or the write is refused for now.
- **Drawings** (`.excalidraw`, `.excalidraw.md`) are left to their pane's element-by-element `mergeTheirs`.
- **A clash is the user's** (`ui/src/components/SyncCopies.svelte`, in the note's editor):
  - The note shows a banner for each copy beside it, looked for 2 s after a change, so copies the core merges at once never show.
  - The banner offers **Show it beside** (the copy in a split), **Keep this one** (the copy to the trash) and **Take the other** (its text becomes the note's, then the copy goes to the trash).
  - The core also sends a notice when it leaves a copy.
  - e2e: `tests/sync-copies.spec.ts`, 2 tests.
- **Not built:** properties merged key by key (a frontmatter line is a line), and a line-by-line view of the two versions (the copy opens beside the note instead).
- **Only the vault's own files** (2026-10-21, after the first start on a real server logged a line and sent a notice for each of dozens of old copies): copies under another program's hidden folder (`.obsidian/`, Obsidian's `.trash/`, Syncthing's `.stversions/`, `.git/`) or Atlas's `.atlas/cache|trash|remote` are never touched (`in_vault_files`); hidden *files* such as `runs/.live.json` still count. The copies found at start (mostly older than any base) make **one** log line and **one** notice with their count; a copy arriving while the core runs still gets its own notice.
- **Tests.** `sync_merge::tests` has 4 tests (names, merges and clashes, settling, other programs' folders). `tests/mirror_lease.rs` checks that a running core merges a copy appearing in its vault and trashes it into `.atlas/trash`.
- **Checked with real Syncthing 2.1.6.** The harness was a throwaway script, `st/merge_test.py` on top of `st/sttest.py`. It ran two isolated instances, with a debug `atlas serve` on side A and `.atlas/cache` in `.stignore`. Both folders were paused. A edited line 1 and B appended line 4, then both resumed. Syncthing made `log.sync-conflict-20261020-235320-VN3CHZJ.md`, the core logged "merged into log.md", and both sides then held the merged text. No conflict copy was left on either side, and the copy was in A's `.atlas/trash/`.

## As built: step 5

The plugin is `plugins/beta/syncthing`.
- **The core's part** is a generic hook, `on = "fs"` (PLUGIN-API.md). A plugin tool is called with `{ paths }` for each batch the vault's watcher sees: Atlas's own writes, git's, any program's. One call runs at a time; batches that arrive meanwhile are joined. Core watchers have their own bus channel (`EventBus::on_fs`).
- **The helper** posts `POST /rest/db/scan?folder=<id>&sub=<path>` for each changed path.
  - It finds the Syncthing folder holding the vault by path: the deepest match, with the vault's subfolder inside it.
  - The API key is the setting, else read from this computer's Syncthing config (`~/.local/state/syncthing` for 2.x, `~/.config/syncthing` for 1.x).
  - The address defaults to `http://127.0.0.1:8384`.
  - A vault in no Syncthing folder is `skipped`.
- **On a server** (a container), set the address and the key of the server's own Syncthing.
- **Tests.** `test_helper.py` has 4 offline tests. Against the two isolated Syncthing 2.1.6 instances (watchers off, rescan every hour; scratchpad `st/scan_test.py`): a file written on A was not on B 4 s later, and arrived 1.3 s after the helper's scan.
- **Not done:** the plugin is not installed into any vault (`<vault>/.atlas/plugins`); installing it is the vault owner's call.

## As built: step 6

The phone's in-app core is the same Rust core (`atlas-android` serve.rs `serve_on`), so it needed one line:
- `serve::mirror`, which links a folder vault to its server copy and keeps the phone's sign-in cookies for that host, now also installs the lease guard (`install_for_mirror`). `serve` runs before the vault list has the mirror, so at start the guard was missing.
- After that, every write of the phone's core asks the server's table, under the phone's own `device_id` (`$XDG_STATE_HOME` is the app's folder), exactly as on the desktop.
- The phone's live rooms are spliced to the server's by the same `live_ws`.
- Its mirror captures were removed in step 2: a capture is written by the in-app core, so it takes a lease too.

## Under load, for real (2026-10-21 ~02:00)

The harness is `scripts/dev/mirror-stress.mjs`: `node scripts/dev/mirror-stress.mjs [--control] [--lines 25] [--atlas target/debug/atlas] [--dir /tmp/mirror-stress]`.
- It needs `syncthing` on the PATH and a built `atlas`.
- Exit codes: 0 pass, 1 fail, 2 a broken setup.
- The script reproduces the table below. Its first run, 02:04: mirror PASS (refused 11 / 17, 50 / 50 lines); control FAIL (one conflict copy, 25 / 50 lines).
- The first runs were by an equivalent throwaway Python version.
- **The setup.** Two isolated Syncthing 2.1.6 instances with their own watchers on (1 s delay, a rescan every 20 s, `.atlas/cache` in `.stignore`).
  - Side B: a real server core (`atlas serve dirB --listen …`, password sign-in).
  - Side A: a real desktop core (`atlas serve dirA`), whose vault list gives it `mirror = http://127.0.0.1:<server>/` and which keeps the server's session cookie, given through `/api/signin/door`.
- **The writers.** Two of them append 25 lines each to the same note at the same time, one through each core. They read, add a line, and `PUT` with `base_mtime`, retrying on a 409 as the editor does. The server's writer is paced 0–3 s, so the two interleave.

| Run | Conflict copies | Lines kept | Both sides identical | Refused (then retried) |
|---|---|---|---|---|
| with the mirror (leases), 5 runs | **0** | **50 / 50** | yes | desktop 8–21, server 0–19 |
| control: the same, no mirror, 2 runs | **1** each | 25 / 50 (one writer's lines all lost) | yes (after the conflict) | 0 |

- The control's conflict copy is not merged by the core: nothing was ever leased, so there is no base. That is the offline case, and it needs a base from an earlier leased write.
- With leases, the two writers take turns in blocks: whoever is behind waits about a Syncthing round (1–2 s) while the other goes on. That is one writer at a time, as designed. In the app, the live room's single writer keeps panes from competing like this.

## Build order
1. Core: the lease table on the server (`/api/lease`), the check at the core's write functions, the base copies. **Done** (above).
2. Interface: the per-file routing removed (`file-route.ts`, `mirror.ts` routing, `api.ts writeTo`, the panes' held
   states); the phone's mirror captures removed. **Done** (below).
3. Live: the desktop core relays a path's room to the server's; the writer in the room. **Done** (above).
4. The conflict watcher and the three-way merge. **Done** (above; the clash dialog still to do).
5. The Syncthing plugin (scan now). **Done** (above).
6. The phone's core the same (it is the same core). **Done** (above).
