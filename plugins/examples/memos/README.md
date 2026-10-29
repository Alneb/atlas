# memos

Sends a line, or the editor's selection, to your [memos](https://usememos.com) server as a new memo. Also an example
of `atlas.fetch` with a token kept as a secret: the core puts the token into the request, the page never sees it.

## What it adds

- The command **memos: new memo…** (type the memo).
- **Editor menu**: "Save the selection as a memo".
- One request: `POST <server>/api/v1/memos` with `{ content, visibility }`.

## Settings

- **memos server**: `https://memos.example.org`.
- **Access token** (a secret): memos → Settings → My account → Access tokens.
- **Visibility** (PRIVATE, PROTECTED, PUBLIC).

## How it fits

No requirements.

## Platforms

Linux works; Android works (`phone = true`); the others are untested.

## Status

An example (`plugins/examples/`): small, working, meant to be copied. Written against memos' v0.2x API; check it against your server's version. No
tests.
