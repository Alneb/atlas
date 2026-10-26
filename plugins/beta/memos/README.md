# memos

A line or the selection sent to your memos server as a new memo. Also a small example of `atlas.fetch` with a token
kept as a secret.

- The command "memos: new memo…" asks for the text and saves it.
- In the editor's right-click menu, "Save the selection as a memo" when text is selected.
- A notice says whether it was saved, or what the server answered.
- One `POST /api/v1/memos` (the memos API as documented for v0.2x); the token is added by Atlas's core and never
  reaches the page.

## Settings

- **memos server** (`https://memos.example.org`).
- **Access token** (a secret): memos → Settings → My account → Access tokens.
- **Visibility** (`PRIVATE`, `PROTECTED`, `PUBLIC`; private by default).

## Needs

A memos server and an access token.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`ui/tests/example-memos.spec.ts`.
