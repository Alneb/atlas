# The Email pane, designed: what the good mail clients do, and what Atlas takes from them

The user (2026-10-22): *"redo from scratch the mail plugin, with backend in rust and frontend in svelte + ts, read a UI/UX design guide and study the interface of most email clients and replicate it, i want a lot of features, responsiveness and good UX"*. On the store: *"just do an index only, with the possibility of saving some of them, you need to be careful about parsing emails, specially threads, and also rendering them, do the best job you can"*. Layout: three panes. Features, in order: conversations + search, fast triage, a real composer, rules + organisation.

This file is the study (stage 0 of the rebuild) and the decisions it led to. The engine side is in [REFACTOR-email-rust.md](../refactor/REFACTOR-email-rust.md).

## 1. What was read

- **Atlas's own rules**: [UI-STYLE.md](../guides/UI-STYLE.md), built on Vercel's *Web Interface Guidelines* and Butterick's *Practical Typography*. Everything below is checked against it.
- **Nielsen's ten usability heuristics** (nngroup.com/articles/ten-usability-heuristics). The ones that decide a mail client:
  - **1. Visibility of system status:** syncing, sending, "sent, undo".
  - **3. User control and freedom:** undo every triage action, not a confirm dialog.
  - **4. Consistency and standards:** Gmail's keys are the de-facto standard.
  - **5. Error prevention:** send is delayed, and a forgotten attachment is caught.
  - **6. Recognition rather than recall:** a command palette that shows each key.
  - **7. Flexibility and efficiency:** single keys for experts, buttons for everyone.
  - **8. Minimalist design:** the list row shows only what helps you choose what to open.
  - **9. Errors:** "the server refused the password: set an app password in Settings…".
- **Apple HIG, split views**:
  - A sidebar, a content list and a detail column, where selection in one drives the next.
  - The sidebar can be hidden.
  - On compact widths the columns become a stack (sidebar → list → detail), and each column must stand alone.
  - Selection is kept when the layout changes.
- **Gmail's keyboard reference** (support.google.com/mail/answer/6594), quoted in §4.
- **Superhuman** (help.superhuman.com, "Shortcuts and Cmd+K"):
  - One command line (Cmd/Ctrl+K) finds every action and shows its shortcut on the right, so you learn keys as you go.
  - `e` marks done, `z` undoes, `/` searches, and `h` snoozes ("remind me").
  - Split inbox tabs.
  - Instant: every action moves on to the next message.
- **The clients themselves**, from use and their documentation:

| Client | What it does best | Taken |
|---|---|---|
| Thunderbird | Three panes, folder tree with unread counts, tags (keywords) on 1–9, quick filter bar (unread / starred / contact / tags / attachment), saved searches as virtual folders, columns view | Three panes, keyword labels, quick filters, saved searches |
| Gmail | Conversations, the keymap, archive as the default action, labels, snooze, undo send, "important" markers, inbox tabs, search operators | The keymap, operators, snooze, undo send, conversations |
| Outlook | Focused/Other, sweep (move everything from a sender), hover actions on rows, reading pane right or bottom, pinned messages | Hover actions, reading pane right or below, "everything from this sender" |
| Apple Mail | Calm list rows (sender bold, subject, two lines of preview), a conversation shown as stacked cards, swipe actions, VIP senders | Row anatomy, stacked cards, swipe |
| Fastmail | Speed, a compact density, pinned items, rules written as search queries, send later | Rules as queries, density setting |
| Superhuman | Command line, split inbox, "done" as the one gesture, reminders, keys shown everywhere | Palette, split inbox, keys in the UI |
| Spark | Smart inbox (people / notifications / newsletters), pin, gatekeeper for new senders | Split inbox by header shape (already in 0.20) |
| Mimestream | A native Gmail client: labels in a sidebar, a fast, quiet list | Quiet list, sidebar labels |
| Proton | Remote content blocked with one-click show; "always from this sender" | Per-sender remote images |

## 2. Layout

- **Three panes** (default): sidebar (accounts, smart views, folders, labels) | list | reader. The panes resize by dragging their borders, and the widths are kept per vault in `localStorage`.
- **Other layouts** (Settings → Email → Layout):
  - "Reader below" (Thunderbird classic);
  - "List, then message" (Gmail's default: the message replaces the list, `u`/Esc goes back).
- **Responsive by the pane's own width** (container queries; a pane can be narrow on a wide screen):
  - **≥ 1100 px:** three panes.
  - **700–1100 px:** the sidebar folds to an icon strip (unread dots); list + reader.
  - **< 700 px:** one column at a time (sidebar → list → reader), with a back button and the selection kept. This is also the phone's layout.
- **Density:** comfortable (two-line rows with the preview) or compact (one line, Thunderbird-like), from a setting or a toggle in the list's header.

## 3. Anatomy

**List row** (Apple Mail / Gmail, quiet). Each row shows:
- the unread dot;
- the senders (the latest first, "me" for your own messages, with the number in the conversation);
- the date, relative and short: 14:02 today, "Tue" this week, "12 Sep" this year, then "12 Sep 2024";
- the subject, bold when unread;
- one line of preview;
- chips for labels;
- icons for attachment, star and snoozed.

On hover the row shows its actions (archive, delete, read/unread, snooze), Outlook-style, so the mouse never travels. The selected row has the accent fill, and checked rows have a check in the avatar slot.

**Reader:** a conversation as stacked cards.
- The read messages are folded to one line (sender · preview · date).
- The newest message, and every unread one, are open.
- At the top: the subject, the labels, and the actions (reply / reply all / forward / archive / delete / snooze / move / label / more…).
- Each open message shows its header (avatar, name, address on hover, to/cc folded, date absolute), then the body, then its attachments.
- Quoted text is folded behind "···" (Gmail).
- The reply box sits under the conversation (inline reply); it can pop out to a full pane.

**Message body:**
- **Frame:** a sandboxed iframe with no scripts and a strict CSP. It grows to its content, so the reader has one scrollbar.
- **Remote content:** blocked by default, with a bar offering "Show images" and "Always for <sender>".
- **Dark mode:** the colours of the mail are remapped rather than the whole page inverted. Light backgrounds become the reader's surface, dark text becomes light, mid colours keep their hue, and pictures are untouched.
- **Plain text:** shown in the reader's prose font with links turned into links, `>` quotes as nested bars, and format=flowed rewrapped.

**Composer:**
- **Fields:** To / Cc / Bcc as chips with autocomplete; the From picker (identities) appears when the account has several.
- **Body:** Markdown in Atlas's editor, with a small toolbar (bold, italic, link, list, quote, code) and a preview toggle. It is sent as plain text + HTML.
- **Attachments:** a drop zone over the whole composer, plus "Attach…" and "From the vault…".
- **Footer:** "Send" with a menu that holds "Send later…". While the delay runs, the toast offers "Undo".
- **Drafts:** saved by themselves to the server's Drafts after 2 s of quiet.
- **Signature:** under "-- ", above the quote.
- **Forgotten attachment:** the words "attached / attachment / ci-joint / adjunto" with nothing attached asks once.

## 4. Keys

The Gmail map, because it is the standard (Nielsen 4). Superhuman's palette makes them discoverable (Nielsen 6): Ctrl+K lists every action with its key. `?` shows the sheet.

| Key | Action | Key | Action |
|---|---|---|---|
| j / k, ↓ / ↑ | next / previous conversation | o, Enter | open |
| u, Esc | back to the list | x | select |
| Shift+click, Shift+j/k | extend the selection | * a / * n / * u / * r | select all / none / unread / read |
| e | archive | # , Delete | delete (to Trash) |
| ! | spam | s | star |
| Shift+I / Shift+U | read / unread | i / n | important / not important (kept from 0.20) |
| h | snooze… | v | move… |
| l | label… | m | read / unread |
| r / a / f | reply / reply all / forward | Shift+R / A / F | the same, full pane |
| c | compose | / | search |
| z | undo | g i / g s / g d / g t / g a / g b | inbox / starred / drafts / sent / all / snoozed |
| 1 2 3 4 | split-inbox tabs | ; / : | expand / collapse every message |
| Ctrl+Enter | send | Ctrl+K | command palette |
| ? | the key sheet | ⇧N | save as note |

After archive, delete, move or snooze, the next conversation opens: the newer one in Gmail's order, a setting. The list never jumps.

## 5. Behaviour

- **Optimistic, with Undo** (UI-STYLE §4):
  - Every triage action changes the list at once, is sent behind, and shows a toast "Archived · Undo (z)".
  - A failure rolls the action back and says why.
- **Live, not polled:** the engine keeps an IMAP IDLE connection per account (the inbox, and a NOTIFY/STATUS sweep of the others). New mail arrives as an event, the list updates, and the unread count and a notice follow.
- **Instant, by keeping an index:** the list, counts, threads, search and the address book come from the local index (SQLite). The server is asked behind and the index reconciled. A message's body is fetched once, on open or by prefetching the newest ones, and kept in the index's body cache, bounded by a size setting.
- **Search:**
  - Operators:
    - `from: to: cc: subject:` take text;
    - `has:attachment`;
    - `is:unread is:read is:starred is:snoozed`;
    - `label: in:`;
    - `before: after:` take YYYY-MM-DD or 7d, 2w, 3m;
    - `larger:` takes 5M;
    - `"phrases"`, and `-word` to exclude.
  - Results as you type from the index.
  - "Search the server too" goes past what the index holds.
  - The operators show as chips under the box.
  - A search can be saved, and becomes a smart folder in the sidebar.
- **Empty states say what to do:**
  - "Inbox zero — nothing to answer. c writes a new mail."
  - "No account yet — Add an account…"
  - "The password was refused — Settings…"

## 6. Motion

Every animation is 120 ms, uses only opacity and transform, and is off under `prefers-reduced-motion` (UI-STYLE §5). The animated things:
- a row leaving: it fades and the rows below slide up;
- the reader's cards opening;
- the toast.

Nothing else moves.

## 7. Saved notes, rules, templates (everything is a file)

- **Save as note** (`n` in the reader menu, the palette, or a rule) writes the conversation in the existing thread-note format ([DESIGN-mail-notes.md](DESIGN-mail-notes.md)) under `mail/<account>/<folder>/`. This keeps old notes, their note view, and `today.rs`'s `is_mail` valid.
- **Rules** live in `mail/rules.md` as one `email-rules` code block. Each rule is a search query (the same operators, Fastmail's idea) followed by actions. They run on new mail in the engine, or become a Sieve script when the server takes ManageSieve. The Rules editor in the pane writes the same block.
- **Templates** are the notes in `mail/templates/`. The title is the template's name, the body is Markdown, and the `subject:`/`to:` properties are optional.
