# REFACTOR — the Email plugin, rebuilt: a Rust engine with a local index, a Svelte pane (2026-10-22)

## Why
The goal (2026-10-22): the mail plugin redone from scratch, with a Rust backend and a Svelte + TS frontend, designed from UI/UX guidance and a study of the main email clients — many features, responsive, good UX. Also open before: IMAP IDLE and identities.

Answers in plan mode:
- **Store**: *"actually just do an index only, with the posibility of saving some of the, you need to be careful about parsing emails, specially threads, and also rendereing them, do the best job you can"*.
- **Layout**: three panes (the other two offered).
- **Features**: conversations + search, fast triage, a real composer, rules + organisation — all four.
- **Cut-over**: replace in place; the old files go.

The study that shaped the pane: [DESIGN-mail-ui.md](../design/DESIGN-mail-ui.md).

## Before → after
| Before (0.20.0) | After (1.0.0) |
|---|---|
| `mail.py`, 2160 lines of Python (imaplib, smtplib), one IMAP login pool, every call a round trip to the server | `engine/` (crate `atlas-email`): async-imap + rustls, its own small SMTP client, mail-parser, ammonia, SQLite + FTS5 |
| The list polled every 120 s; a folder shown from the notes, then from the server | An **index** (`<plugin cache>/index.sqlite`): the list, counts, conversations, search, the address book from it at once; **IMAP IDLE** keeps the inbox live, every folder synced every `check_every` minutes |
| Every mail kept as a note (`keep_notes`, `keep_days`): 2345 notes in a real vault's mail/ | **Index only**; a conversation becomes a note when the user saves it (⇧N, a rule's `save`), in the same thread-note shape — the old notes stay valid and are drawn by the same note view |
| Conversations made by the note writer (References, else subject), `regroup` notes without uids | Conversations in the index (`index::thread_for`): Gmail's X-GM-THRID; else message ids (own, In-Reply-To, References) with Gmail's same-subject rule; else, for a reply with no ids, a recent same-subject conversation with someone in common. Saved notes keep the uid |
| `view.js`, 1075 lines of DOM code | `ui/` (Svelte 5): App, Sidebar, MessageList (virtualised), Reader, MailFrame, Composer, AddressField, Rules, Shortcuts, Toasts, Inbox (block, side tool), NoteView; one command list (`keys.ts`) for keys, palette and key sheet; one state object (`store.svelte.ts`) |
| Remote images rewritten out of the HTML (`data-remote`) | The frame's **Content-Security-Policy** blocks remote content; the HTML is cleaned by ammonia (scripts, frames, forms, handlers gone; `<style>` kept; ids prefixed) |
| Dark mode: the whole mail inverted | The mail's colours remapped in HSL (light backgrounds dark, dark text light, hues kept), pictures untouched |
| — | Snooze, send later, undo send, rules, labels (Gmail labels / IMAP keywords), templates, identities, split inbox tabs, quick filters, saved-note growth, unsubscribe, per-sender remote pictures, drag to folders, swipe |

## The engine
- `account.rs` cards → accounts (Outlook's servers, SMTP security by port, identities from `aliases`, Claude's consent).
- `parse.rs` envelope (ids from the raw header first: mail-parser drops malformed ones; a made-up stable id when there is none; the arrival date for an unreadable Date), body (several HTML parts joined, Apple-style; attachments vs inline pictures; invitations; forwarded messages whole), snippets (quotes and signatures skipped, preheader padding removed). `full_encoding` for CJK charsets.
- `index.rs` the schema (versioned: an older index is dropped and synced again), threading, conversations for the list (a Gmail message in both its label and All Mail counted once — the copy outside All Mail stands for it), the address book (people written to weigh 4×, recency decays it), bodies and their cap, prefs (remote pictures per sender, saved notes per thread).
- `render.rs` the cleaner and the text → HTML (links, `>` quotes, format=flowed, the signature).
- `search.rs` the operators → SQL + FTS5 (the last word a prefix, for search as you type).
- `imap.rs` connections (TLS, STARTTLS, none), XOAUTH2, capabilities, folder roles (special-use, else names in five languages, Exchange's stores as `other`), raw commands read with a callback (COPYUID, APPENDUID, MODSEQ, Gmail ids, OBJECTID THREADID).
- `sync.rs` UIDVALIDITY, the uid diff, headers newest first in batches (progress events), CONDSTORE flags (else the newest 500, all every tenth round), a folder that did not move asked nothing more; body prefetch; IDLE loop with back-off; the periodic sync; snooze and send-later timers.
- `ops.rs` optimistic flags and moves (the index first, rolled back on a refusal), COPYUID kept, placeholders for servers without it, folders made on demand (Archive, Snoozed, Not important), snooze, labels.
- `send.rs` / `compose.rs` / `smtp.rs` the composer's message (Markdown → HTML + the text as typed, the quote, the forward's files), Bcc never in what leaves, drafts in the server's Drafts, send later (`X-Atlas-Send-At` + `$atlas-send-later`).
- `oauth.rs` Outlook's three flows (automatic loopback + PKCE, window, device code), refusals said plainly, token cache, rotated refresh tokens kept (`Atlas::set_secret`) and handed back (`_secrets`). HTTPS through the core's fetch.
- `rules.rs`, `notes.rs`, `thunderbird.rs`, `api.rs` (the method table), `fake.rs` (the stand-in server; `fake-mail` binary).

## Checked
- `cargo test -p atlas-email`: 63 tests — parsing (Outlook reply with encoded words, Shift_JIS, broken headers, attachments/invites/forwards), threading (out of order, across folders, new subject, subject-only replies, Gmail ids, All Mail duplicates), rendering, search, and against the stand-in server: first and later syncs, UIDVALIDITY, IDLE push, flags/moves/undo/trash/delete, no-MOVE servers, snooze and wake, labels, send/drafts/send later/forward, rules, saved notes growing, Claude's consent.
- e2e: `example-email-pane.spec.ts` (inbox, keys, archive + Undo, star, delete; a reply sent threaded with the signature over the quote and no Bcc; search with operators, the HTML frame's safety, Save as note drawn as mail; Claude's consent) and `example-email.spec.ts` (Outlook's window sign-in and a refusal) — 5/5.
- The real Gmail account, read-only (EXAMINE / BODY.PEEK, scratchpad index): 3272 messages in 13 folders, no errors, the inbox's first 100 conversations listed in 7 ms; screenshots in WebKit, both themes, 1440 / 960 / 480 px.

## Watch out
- ~~The binary is not static yet~~ — static since 1.1 (musl-gcc installed; `build.sh` unchanged).
- The first sync of a big account takes minutes (headers of every folder; Gmail's All Mail repeats every label). The list fills as it goes (events per batch).
- `keep_notes` / `keep_days` are gone: existing notes are untouched, new mail is not written as notes unless saved.
- Outlook tokens: a rotated refresh token is stored by the engine at once; a call that fails before handing `_secrets` back loses nothing.
- Not done in this rebuild: Sieve (rules run in the engine, so only while an engine runs — the server's does), PGP / S/MIME, Gmail OAuth (an app password still), calendar replies to invitations.

## 1.1 — the second round (2026-10-23)
After real use of 1.0, the follow-ups: tweaks to the UI; the Home block redone from scratch; important mail downloaded at once; integration with the DAV plugin; better parsing of mails; times in local time; and a bug where scrolling to the bottom of the list reset it and blinked. Answers: important → kept as a note at once (+ an agent can write rules, e.g. "my supervisors are always important"); the DAV plugin grows into the Calendar plugin ([REFACTOR-calendar.md](REFACTOR-calendar.md)); the Home block a triage card.

| Change | Where | Why / how found |
|---|---|---|
| Important = starred + kept as a note at once, followed as replies arrive; rules `important` / `not-important`; Claude's `email_rules`, `email_add_rule`, `email_remove_rule`; `from:a,b` | `ops::importance`, `ops::save_important`, `notes::follow`, `rules::{act,add,remove}`, `search.rs` | the review's answer; 1.0 had only the marks |
| Important conversations pinned on top of the inbox, "Not important" as a view | `Scope.pin` (ORDER BY max(flagged)), `MessageList` section headings in the virtual list | DESIGN-mail-ui §2 |
| A view of a folder no account has is empty | `api::scope_of` (every view but the all-mail ones names folders) | "Not important · 1120" on Gmail (no such folder → every folder) |
| The list jumped back and blinked at its end | the scroll-into-view effect now tracks only the cursor; `more()` stops at the real end, no loading state | reported in review; Gmail duplicates make `total` overcount, so `more()` refetched forever |
| Invitations in local time; Accept / Maybe / Decline | `ical.rs` (TZID via chrono-tz, Windows names, VTIMEZONE offsets; iTIP REPLY), `send::answer_invite`, `InviteCard.svelte` | TZID was ignored: a Toronto 09:00 was shown as 09:00 in Madrid |
| 24-hour clock | `hourCycle: "h23"` in every time format | LANG=en_US, LC_TIME=es_ES: the webview said "09:01 AM" |
| Previews | `parse.rs`: HTML-in-text parts, entities in text, `[cid:…]` / `[image: …]`, `{1}`, rules, long links, quote-aware tags, forwards / quote-only / file-only previews; `parse::VERSION` + `Index::reparse` | a survey of 3272 real previews (probe copy): every pattern now 0, no empty preview with a body |
| Threads | `index::thread_for` joins a conversation the message names when the subject agrees, also under Gmail ids; `Index::rejoin` once | "Re : Research and Internship" stood alone under its own X-GM-THRID |
| Home card | `Inbox.svelte` | review: redo from scratch |
| Calendar plugin hooks | `Mail::core_post` → `/api/plugins/dav/tools/{import_invite,invite_status,contacts,agenda}` | review: integrate with DAV |
| Static engine | `build.sh` with musl-gcc | — |

Checked: `cargo test -p atlas-email` 73; e2e `example-email-pane` + `example-email` 6/6 (new: important pins / keeps / not important / g n); WebKit screenshots on the probe copy (pane, Home card 970 / 404 px, both themes); the parser and threading fixes measured on a copy of the real index (`examples/reparse.rs`: 1292 bodies in 4 s, 4 conversations joined in 2 s).
