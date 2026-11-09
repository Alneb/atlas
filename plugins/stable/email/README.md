# Email

A mail client inside Atlas: conversations, search, triage from the keyboard, a composer, rules, invitations — over your
own IMAP/SMTP accounts (a password) or Outlook / Microsoft 365 (OAuth2), several at once. The engine is Rust
(`engine/`), the pane Svelte (`ui/`). The servers are the store; a mail becomes a note only when you ask.

## What it adds

- **The Email pane** (a left-bar tile): folders, the list and the reader side by side, below each other, or one at a
  time; a narrow pane collapses to one column.
- **A local index** of every account (SQLite with full-text search, in the plugin's cache): headers, flags,
  conversations, the address book and the newest bodies, so lists, counts and search answer at once. The inbox is live
  (IMAP IDLE); other folders are checked every few minutes. Deleting the index loses nothing.
- **Notes only on Save**: *Save as note* (⇧N, the reader's button, or a rule's `save`) writes the conversation as
  `mail/<account>/<folder>/<date> <subject>.md` with its files beside it; saving again adds new messages. Such a note
  is drawn as mail, with Reply and Forward.
- **Reading**: stacked cards, the mail's HTML in a sandboxed frame whose policy blocks remote pictures unless shown
  (once, or always for a sender), quoted text folded, a dark mode that remaps the mail's colours, files to open or
  save into the vault, one-click unsubscribe.
- **Triage**: Gmail's keys (`j`/`k`, `e` archive, `#` delete, `s` star, `r`/`a`/`f`, `h` snooze, `v` move, `l`
  label, `x` select, `z` undo, `g i`…; `?` lists them), hover actions, many at once, drag to a folder, swipe, Undo for
  every action, snooze that survives a rebuilt index, a split inbox (People / Newsletters / Notifications by the
  headers), Important / Not important.
- **Important mail**: `i` (or a star from another client, a rule, an agent) marks a conversation important and, with
  *Keep important mail as notes*, keeps it as a note that grows with replies; important conversations come first.
- **Invitations**: a card with the times in your zone, your answer, Accept / Maybe / Decline (a reply to the organiser,
  then the event filed through the Calendar plugin), and whether it is already in your calendar or overlaps something.
  On an Outlook account whose calendar the Calendar plugin reads over Exchange, Exchange answers instead (as Outlook
  does): the meeting stays linked to the organiser's, and no second answer is mailed.
- **Meetings**: the reader's **Meeting** button opens the Calendar's new-event dialog with the conversation's subject
  and everyone in it but you; saved in an Exchange calendar, Exchange sends the invitations.
- **Your calendar on Outlook**: the Calendar plugin's Exchange account signs in through the Outlook account here of the
  same address (`calendar_token`, the role `mail`): no second sign-in.
- **Writing**: To / Cc / Bcc with the address book, identities, Markdown sent as text and HTML, a preview, files from
  disk or the vault, drafts saved to the server, Undo send, Send later, templates (notes in `mail/templates/`), a
  forgotten-attachment check.
- **Search** with operators: `from: to: cc: subject: has:attachment is:unread|starred|snoozed list: label: in:
  account: before: after: older_than: newer_than: larger: smaller:`, phrases and `-word`.
- **Find in a conversation** (Ctrl+F): every message opened, the matches marked in the mails themselves (case and
  accents ignored), folded quotes opened; Enter / Shift+Enter step.
- **Pictures pasted into a mail** go where the cursor is (`![](cid:pasted-1.png)` in the text) and leave inline, in a
  `multipart/related` part, not as attachments; a draft reopens with them in place.
- **Rules** in `mail/rules.md` (one `email-rules` block): `<search> => <actions>` (move, archive, trash, spam, read,
  star, important, not-important, label, save, notify, stop), run on new inbox mail, a rule's moves after its other
  actions and a moved message seen by no later rule (as in Thunderbird); edited in a dialog (the pane's
  **Rules…**), in Settings → Email, by hand or by an agent.
- **Elsewhere**: the `email.inbox` block (a triage card for Home), a side tool, the unread count in the status bar,
  notices of new mail, "Email: send this note…", Thunderbird import (accounts; local mail as notes, after asking).
- **Tools for agents** (`atlas mcp`): `email_inbox`, `email_read`, `email_attachment`, `email_send` (only a mail the
  user asked for), `email_mark`, `email_rules`, `email_add_rule`, `email_remove_rule`, `email_accounts`,
  `email_thunderbird`, `email_thunderbird_mail`, `email_open` (shows one mail in the Email pane, by uid or Message-ID;
  it answers once the window has shown it, and fails when no Atlas window is open). Each account says whether an agent
  may read it: ask, always or never (`email_open` asks nothing: it reads nothing back).

## Settings

- **Accounts** (cards, also under Settings → Accounts, with Gmail, Outlook / Microsoft 365, iCloud and Fastmail
  presets, a state line and Test; the first is the main one):
  - **Name**; **Sign-in** (password or outlook); **Address / user name**; **From** (`Name <address>`);
  - with a password: **Password** (a secret; an app password where the provider has them), **IMAP server / port**,
    **SMTP server / port** (465 TLS, otherwise STARTTLS), **Security** (ssl, starttls, none);
  - with Outlook: **Application (client) ID** (empty: Thunderbird's public id), **Sign-in flow** (automatic: the
    system browser; window: a window of Atlas; code: a device code), **Tenant** (`common`), and the kept sign-in
    (set by "Sign in to Outlook");
  - **Other addresses** (identities, one per line), **Signature**, **Claude may read it** (ask, always, never).
  - Under the cards: **Import from Thunderbird…**.
- **Layout** (three, below, full), **Rows** (comfortable, compact), **Split inbox**, **Mark read when opened**,
  **Keep important mail as notes**, **After archiving or deleting** (next, list), **Undo send (seconds)**, **Remote
  pictures** (off: blocked until asked), **Notices of new mail**, **Check every folder every (minutes)**,
  **Messages read ahead**, **Message cache (MB)**, **Folder for saved mail** (`mail`: notes, `rules.md`,
  `templates/`).

## How it fits

No requirements. With the Calendar plugin (`dav`): invitations answered and filed, CardDAV contacts in the address
book, today's events on the inbox card. Without it those parts are absent.

## Needs

The engine is built by `bash engine/build.sh` into `bin/<arch>-<os>/email` (static; not committed); the pane by
`node scripts/dev/plugin-ui.mjs plugins/stable/email`. Release archives carry the engine for Linux, macOS and Windows.

## Platforms

Linux works; the others are untested.

## Status

Beta, and the strongest candidate for stable: `cargo test -p atlas-email` (against an IMAP + SMTP stand-in,
`engine/src/fake.rs`) and the specs `ui/tests/example-email-pane.spec.ts`, `example-email.spec.ts`. What it still
needs: saved notes, rules and attachments written through Atlas's API instead of directly to disk.
