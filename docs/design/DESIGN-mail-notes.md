# Mail notes as the mail's own store: lossless, one note per conversation (proposal)

The goals (2026-10-18): mail notes lossless, so they can serve as the app's cache; a conversation in a single
structured Markdown file, in one folder; a better UI; and speed — the mail was slow because nothing was cached (and
the HTML box had a stray scrollbar).

## Where it stands (email 0.13.0)

One note per message, `mail/<account>/<folder>/<date> <subject>.md`: properties `from to cc date subject message_id
account folder`, the HTML kept as it came (remote images blocked), attachments in `<name> files/`. The Email pane does
not read them: every folder shown, every message opened asks the IMAP server — the slowness.

## The proposal

**1. A conversation is one note.** Messages are grouped by thread (References / In-Reply-To, else the subject without
"Re:/Fwd:/TR:"), into `mail/<account>/<folder>/<first date> <subject>.md`:

```markdown
---
type: email-thread
subject: "Cluster time on iq"
participants: ["Ana <ana@uni.example.org>", "Me <me@uni.example.org>"]
messages: 3
unread: 1
first: 2026-09-15T10:02:00-04:00
last: 2026-09-17T08:40:00-04:00
account: uni
folder: Inbox
---
# Cluster time on iq

## 2026-09-15 10:02 · Ana <ana@uni.example.org>
<!-- mail message_id="<a1@x>" uid="1203" flags="seen" to="me@uni.example.org" cc="" in_reply_to="" references="" -->
(the message's HTML, as it came, or its text)

## 2026-09-16 09:10 · Me <me@uni.example.org>
<!-- mail message_id="<b2@x>" … -->
…
```

- **Lossless**: every header the pane and a reply need (`message_id`, `uid`, `flags`, `to`, `cc`, `reply_to`,
  `in_reply_to`, `references`, the date with its zone) is kept on the message's marker line, the body as it came (HTML,
  and the plain text alternative when the mail has one), attachments in `<note> files/` and listed under their message.
  The pane can draw, search, reply and forward from the note alone.
- **New mail joins its conversation**: a reply that arrives is appended as a new section; the note's properties
  (messages, unread, last) follow. My own replies (Sent) join the conversation of the folder it started in.

**2. The pane reads the notes first.** A folder shows at once from its notes' properties (a list of conversations,
newest first), a message opens from its section; the server is asked behind, and what is new is appended. Flags (read,
flagged) are written to the marker and sent to the server.

**3. The HTML box** gets one scroll: the message frame grows to its content inside the reading pane, so the page has one
scrollbar (today the frame scrolls inside the pane: two).

## Migration

The existing notes (a real vault: ~1,000, three accounts) are rewritten into conversations **by the email plugin's own code**
(PHILOSOPHY §2), after a dry run that lists the conversations it would make and the notes each one replaces, and the
user's yes; the old notes go to `.atlas/trash/`. Links to old notes (`[[2026-09-15 Seminar]]`) are pointed at the
conversation note's section.

## Questions for the user

1. A conversation that moves between folders (a reply in Sent, a message filed into "Slurm"): one note in the folder
   where it started, or a note per folder?
2. Keep one-note-per-message for mailing lists and newsletters (no conversation), or everything as conversations?


> **Since email 1.0 (2026-10-22)** mail is no longer kept as notes by itself: the engine keeps an index of the servers, and a conversation becomes a note in this same shape only when the user saves it (Save as note, a rule's `save`) — docs/refactor/REFACTOR-email-rust.md. The notes kept before stay as they are and are drawn by the same note view.
