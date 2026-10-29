# Catalog · Linkwarden

Every catalogued link is also saved in your Linkwarden, in a collection named after its kind (Film, Video, Web
page…), and the note keeps its Linkwarden address. A kind or a vault rule can leave Linkwarden out
(`links: { catalog-linkwarden: false }`, as papers do) or name another collection (`{ collection: Newsletters }`).

## What it adds

- `[contributes.catalog] links = [{ kind = "*", tool = "save" }]`: after the catalog writes a note, `save` posts its
  address (the thing's own link, else one made from its DOI, arXiv, YouTube or IMDb id) to `/api/v1/links` with your
  tags, and answers `linkwarden: <address>` as a property. A link already there (409) is left as it is.
- **The block `linkwarden.links`** (options: a search, how many) and the side tool **Links**: your Linkwarden links,
  searchable; each has a "Note" button that captures the address (so the catalog files it) and a link to open it in
  Linkwarden.
- The tool `save`.

## Settings

- **Linkwarden address**: `https://links.example.org`.
- **Access token** (a secret): Linkwarden → Settings → Access Tokens. Behind a sign-in proxy with no token, Atlas
  offers the sign-in.
- **Tags on every link** (`atlas`).

## How it fits

`requires = ["catalog"]`.

## Platforms

Linux works; the others are untested. The helper is JavaScript run inside Atlas's core.

## Status

Beta. Unit tests in `helper/helper.test.ts` and an end-to-end spec for the block.
