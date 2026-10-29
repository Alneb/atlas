# copyparty

Your [copyparty](https://github.com/9001/copyparty) file servers as places in Atlas's explorer, beside the vault's own
folders. You browse a server's folders, open a file (it is fetched into a local copy and opens in the editor or the
right viewer), save it back, upload, download, rename and delete. Everything goes through copyparty's own HTTP API,
made by Atlas's core, so the password never reaches the page and there is no CORS to configure.

## What it adds

- **A file source in the explorer** (`atlas.files.source`): one place per server. Listing uses `?ls`, opening fetches
  the file into `.atlas/remote/copyparty/<server>/<path>`, saving sends it back with a `PUT`.
- **Safe saves**: the date and size of the file as it was when opened are remembered; if the file changed on the server
  since, the save is not sent and Atlas asks first.
- **Folders**: new folder, rename (refused when the name is taken), delete. A folder is deleted only when it is empty:
  copyparty's own delete would remove everything inside, and nothing goes to a trash on the server.
- **Thumbnails** in the explorer's Thumbnails view: the server's own (`?th=j`), kept in the plugin's cache for a month.
- **Folders seen before show at once** from a cached listing, refreshed from the server right behind it.
- **Other plugins read servers through it**: the Books plugin lists the books of a server folder with
  `atlas.files.list("copyparty", …)`.

## Settings

- **Servers** (cards, the first is the main one):
  - **Name**: short, shown in the explorer (`nas`, `home`; letters, digits, `. @ - _`).
  - **Address**: the server, or a folder of it (`https://files.example.org/data/Physics`).
  - **Password**: copyparty's own password, sent as its `pw` header; kept in Atlas's secret store, never in the vault.
    Leave it empty for a server that has none (for example one reachable only over a VPN).

A sign-in in front of the server (Authelia, Authentik…) is detected: Atlas offers the sign-in and the explorer waits
for it instead of failing.

## How it fits

No requirements. It provides a file source that any plugin can read through `atlas.files.*`.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Status

Stable tier. Tested end to end against a stand-in server (`ui/tests/example-copyparty.spec.ts`); no unit tests yet.
The list of opened copies used for the save check is kept in the browser's storage, so a copy opened on one device
cannot be saved from another.
