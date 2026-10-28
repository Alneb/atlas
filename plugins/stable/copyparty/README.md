# copyparty plugin

Your copyparty servers in Atlas's explorer. Copy the folder into a
vault's `.atlas/plugins/`, then add a server in Settings → copyparty: a name, its address (the server, or a folder of it:
`https://files.example.org/hdd1/Physics`), and a password if it has one (kept outside the vault, sent by the core as
copyparty's `pw` header — never in the page).

| file | what it is |
|---|---|
| `plugin.toml` | the manifest: the servers (cards), `net = ["*"]` (the address is a setting), `secrets = true` |
| `main.js` | the file source (`atlas.files.source`): copyparty's HTTP API through `atlas.fetch` |

What it does, in the explorer (palette: **Files: the explorer**, then the server under COPYPARTY at the left):

- **Browse**: `GET <folder>/?ls&dots` (the JSON copyparty's own UI reads; names come percent-encoded in `href`).
- **Open / edit**: the file is fetched into `.atlas/remote/copyparty/<server>/<path>` (`atlas.fetch` with
  `saveTo` + `saveIn: "remote"`) and opened like any file — the editor, the PDF viewer, the image viewer. Every save goes
  back with `PUT <file>?replace` (`bodyFile`: the copy's bytes). The date and size seen when it was fetched are kept
  (localStorage `atlas.copyparty.copies`); when the file on the server changed since, the save is not sent and the notice
  offers to save over it.
- **Upload**: from this computer or a vault file → `PUT <folder>/<name>`; a name already there is asked about first.
- **Download**: the local copy, copied into a folder of the vault (a second copy gets a number).
- **New folder** (`POST <folder>/` act=mkdir), **Rename** (`POST <file>?move=<target>`: the target counted from the
  server's root, so an address naming a folder of it works), **Delete** (`POST <path>?delete`). copyparty's delete takes a
  folder with everything in it and keeps no trash, so a folder is deleted only when empty — checked here first.

Not done: copyparty's resumable uploads (up2k) for very large files (a plain PUT here, up to 512 MB), search (`?srch`),
shares.

**Thumbnails** (0.2.0): the explorer's Thumbnails view asks the server for its own picture of a file (`?th=j`, a
JPEG; pictures always, videos and PDFs when the server has the tools for them) and keeps it in the plugin's cache;
when copyparty answers with an icon instead, the file's own icon shows.

A gateway in front of copyparty (Authelia and the like): Atlas offers its sign-in, and the listing (and a save) waits
for it — "sign in to <host> first" — instead of failing (0.3.5); once signed in, open the folder again.

**Also in the tree** and **offline**: the servers show under the vault's rows in the side panel (and on the phone's
Files), folded until opened; a file opened before opens from the copy fetched last time when the server is out of
reach, with a notice. Both are Atlas's, for every file source (DEVELOPING.md, the explorer).

Tests: `ui/tests/example-copyparty.spec.ts` against `scripts/vault/tests/fake_copyparty.py` (the same calls on a local folder,
with a password, an address naming a folder of the server, names with accents and spaces).
