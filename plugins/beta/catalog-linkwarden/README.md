# Catalog · Linkwarden

Every catalogued link is also saved in your Linkwarden, in a collection named after its library (Films, Videos, Web
pages…), and the note keeps its Linkwarden address. Also a block and the side panel's "Links" to browse and search
your Linkwarden. A subplugin of the Library (`catalog`).

- Saves whatever a link turned out to be; a kind or a vault rule can leave it out
  (`links: { catalog-linkwarden: false }`) or name another collection (`{ collection: Newsletters }`). Papers are
  left out by default.
- The `linkwarden.links` block (options: a search, at most N links) lists the newest links or a search; each link has
  "Note" (sends it to the catalog as a capture) and a button to open it in Linkwarden.

## Settings

- **Linkwarden address** (`https://links.example.org`).
- **Access token** (a secret): Linkwarden → Settings → Access Tokens.
- **Tags on every link** (`atlas`).

## Needs

A Linkwarden server and the Catalog plugin (`requires = ["catalog"]`); nothing installed: the helper is JavaScript run
inside Atlas's core (`helper.js`, built from `helper/helper.ts`). Requests go through Atlas's core, which adds the token.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`ui/tests/example-links.spec.ts` (the block); `node scripts/dev/plugin-ui.mjs --check plugins/beta/catalog-linkwarden`
(what Linkwarden is sent: `helper/helper.test.ts`).
