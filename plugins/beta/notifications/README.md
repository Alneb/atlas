# Notifications

Your server's notifications, kept: what arrives on the ntfy topics you name is filed in a note per source, newest
first, in `notifications/` (the folder is a setting). A source is the message's first tag — the tag Apprise gives it
(`backups`, `updates`, `alerts`…) — else the topic.

- **Apprise is the hub.** On a server whose services notify through Apprise, and Apprise sends on to ntfy, keep the
  ntfy topic here: every tag becomes its own note. Atlas's own messages ("Send to my phone", an agent's `send`) go
  out through the Apprise API's notify address when it is set, else straight to your phone's ntfy topic.
- **A note per source**: properties `type: notifications`, `source`, `from`, `muted`, `unread`; one line per message
  (time · 🔴/🟠 for urgent/high · **title** — text · a link), a long text folded under it. Searchable, linkable,
  listed by Bases.
- **Mute a source**: `muted: true`, or a date (muted until then) — from "Notifications: mute a source…" or the note's
  properties. Still logged; no toast, not counted.
- **Read**: opening a source's note sets its `unread` to 0; the bell in the status bar counts the rest.
- **The phone's inbox**: what you send to the "Topic to capture from" becomes a capture in today's log (this replaces
  the ntfy plugin, which did that and "send to my phone").

Checked every 5 minutes on the server (the `sync` tool's schedule) and while a window is open, so nothing is missed
while you are away (ntfy keeps messages for hours; the last id per topic is kept in the plugin's cache).

Runs on Linux, macOS, Windows and the phone (Python's standard library only). Tests: `python3 -m unittest
test_notify` (a stand-in ntfy server).
