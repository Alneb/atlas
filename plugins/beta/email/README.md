# Email

A mail client inside Atlas: conversations, search, fast triage from the keyboard, a composer, rules — over the user's
own IMAP/SMTP accounts (a password) or Outlook / Microsoft 365 (OAuth2). Version 1.0 (2026-10-22) is a rewrite: the
engine in Rust (`engine/`), the pane in Svelte (`ui/`).

## What it does

- **The servers are the store; a local index makes it fast.** The engine keeps an index of every account (SQLite with
  full-text search, in the plugin's cache folder): headers, flags, conversations, the address book, and the bodies of
  the newest messages. The list, counts and search answer from it at once; the inbox is live (IMAP IDLE), the other
  folders are checked every few minutes. Deleting the index loses nothing.
- **Mail becomes a note only when you say so**: *Save as note* (⇧N, the reader's note button, or a rule's `save`)
  writes the conversation as `mail/<account>/<folder>/<date> <subject>.md`, in the same thread-note shape the earlier
  versions kept, with its files beside it; saving again adds the new messages. Such a note is
  drawn as mail, with Reply / Forward.
- **Conversations** by the messages' own ids (Gmail's thread ids where there are any); a new subject is a new
  conversation; a reply without ids joins by subject only with someone in common.
- **Reading**: stacked cards (read ones folded), the HTML in a sandboxed frame whose Content-Security-Policy blocks
  every remote picture unless shown (once, or always for a sender), quoted text folded, dark mode by remapping the
  mail's colours (pictures untouched), invitations as a card, forwarded messages inside, files to open in Atlas or
  save into the vault, one-click unsubscribe.
- **Triage**: Gmail's keys (j/k, e archive, # delete, s star, r/a/f, h snooze, v move, l label, x check, z undo,
  g i / g s …; `?` lists them, Ctrl+K finds any command), hover actions, many at once, drag onto a folder, swipe on a
  touch screen, Undo for every action, snooze (a server folder plus a keyword: it survives a rebuilt index), split
  inbox (People / Newsletters / Notifications by the headers' shape), the Important / Not important mark.
- **Important mail** (1.1): `i` (or a star from another client, a rule's `important`, Claude's `email_mark`) stars it
  and keeps the conversation as a note at once (*Keep important mail as notes*, on), which grows as replies arrive; the
  inbox shows important conversations first under their own heading. `n` sends one to a "Not important" folder (made
  when needed; the sidebar's *Not important*, `g n`).
- **Invitations** (1.1): the card above the message shows the times in the user's own hour (the organiser's beside them
  when their zone differs: IANA, Windows and VTIMEZONE zones), the answer already given, *Accept / Maybe / Decline*
  (an iTIP REPLY to the organiser, then the event filed by the Calendar plugin: `dav_import_invite`), and "In your
  calendar" / "Overlaps …" (`dav_invite_status`).
- **Writing**: To / Cc / Bcc as chips with the address book, identities (the card's *Other addresses*), Markdown
  sent as text + HTML, a preview, files by drag and drop / from disk / from the vault, drafts saved to the server by
  themselves, Undo send (the *Undo send* seconds), Send later (kept in Drafts, sent by whichever engine runs then),
  templates (notes in `mail/templates/`), a forgotten-attachment check.
- **Search**: `from: to: cc: subject: has:attachment is:unread|starred|snoozed list: label: in: account: before:
  after: older_than: newer_than: larger: smaller:`, `"phrases"`, `-word`; as you type from the index, Enter asks the
  servers too.
- **Rules**: `mail/rules.md`, one `email-rules` block: `<search> => <actions>` (move, archive, trash, spam, read, star,
  important, not-important, label, save, notify, stop), run on new inbox mail. Edited in the pane (Rules…), by hand, or
  by Claude (`email_add_rule` — "my supervisors are always important" → `from:a@uni,b@uni => important`; commas in
  `from:` `to:` `cc:` `label:` mean any of them).
- **Elsewhere in Atlas**: the `email.inbox` block — a triage card (1.1): important first, then people (unread
  however old, then the newest), newsletters and notifications folded to a line each, today's events from the Calendar
  plugin; archive / star / snooze / reply on hover or by key (j k e s h u r Enter c) with Undo, replies written inline
  with Undo send — the side tool, the unread count in the status bar, notices of new
  mail, "Email: send this note…", Thunderbird import (accounts; local mail as notes, after asking).
- **Claude** (through `atlas mcp`): `email_inbox`, `email_read` (read-only; each asks first unless the card says
  *always*), `email_send` (only a mail the user asked for), `email_mark`, `email_rules`, `email_add_rule`,
  `email_remove_rule`, `email_accounts`, `email_thunderbird*`.
- **With the Calendar plugin** (`plugins/beta/dav`): invitations answered and filed, CardDAV contacts in the address
  book (after the people from the mail), today's events on the Home card. Without it each of these is simply absent.
- **Times** are shown on the 24-hour clock, in the user's own zone.

## Layout

Three panes (folders | list | reader) by default; the reader below the list, or the list then the message, from
the pane's layout button (kept per vault). The pane's width decides the rest: the folders become an icon strip, then
the list and reader take turns when the reader would be too narrow, and below 700 px it is one column at a time.

## Building

- Engine: `bash plugins/beta/email/engine/build.sh` → `bin/x86_64-linux/email` (ignored by git, as every plugin's helper), static (musl-gcc,
  static-pie, 14 MB) since 1.1; without musl-gcc, `ATLAS_EMAIL_CONTAINER=1` builds in a podman Alpine container,
  else a build for this machine only.
- Pane: `node scripts/dev/plugin-ui.mjs plugins/beta/email` → `view.js`, `main.js`, `ui-lib/`.
- Engine checks on a copy of a real index: `cargo run --release -p atlas-email --example reparse -- <copy of index.sqlite>`
  (bodies read again with the current parser, split conversations joined), `--example text -- <file.eml>` (what the
  parser reads from one message).
- Tests: `cargo test -p atlas-email` (73, the network ones against `engine/src/fake.rs`, an IMAP + SMTP stand-in);
  e2e `ui/tests/example-email-pane.spec.ts` and `example-email.spec.ts` (the `fake-mail` binary).
