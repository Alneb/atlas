# Notifications

Your server's notifications, kept as notes. It reads the ntfy topics that Apprise (or anything else) posts to and
files each message in a note per source — the message's first tag (Apprise's tag: `backups`, `updates`…), else the
topic — newest first, with an unread count. It also sends to your phone (through Apprise when its address is set,
else your phone's ntfy topic) and turns what the phone sends to an inbox topic into captures.

## What it adds

- **`sync`** (every 5 minutes by the core's schedule, once when a page starts, and on "check now"; one at a time, so
  nothing is filed twice): what arrived on the kept topics since the last
  time (`?poll=1&since=<id>`) goes into `<folder>/<source>.md` as a line (time, priority mark, title, text, an "open"
  link), long bodies folded as a quote; the note's `unread` grows. Messages from sources that are not muted become
  toasts in every open window (the helper's `synced` event). Messages to the inbox topic are captured into today's log.
- **A bell** in the status bar with the unread count; opening a source's note marks it read.
- **Commands**: "Notifications: check now", "Notifications: a source's notes…", "Notifications: mute a source…" (a
  day, a week, a month, until unmuted — muted sources are still logged), "Notifications: send to my phone…" (titled
  with the note you are in).
- **Editor menu**: "Send the selection to my phone".
- **Tools for agents**: `notifications_sync`, `notifications_send` (only when the user asks to be told on the phone).

## Settings

- **ntfy server** (`https://ntfy.sh`).
- **Topics to keep**: comma-separated.
- **Folder of the notes** (`notifications`).
- **Your phone's topic**: what "send to my phone" posts to when no Apprise address is set.
- **Topic to capture from**: what you send there from the phone becomes a capture; empty: not read.
- **Apprise address**: the Apprise API's notify address (`…/notify/<key>`); when set, Atlas's own messages go through
  it.
- **ntfy user** and **ntfy password** (a secret), or **ntfy access token** (a secret), for a server that asks for a
  sign-in; empty for open topics.

## How it fits

No requirements. The Calendar plugin (`dav`) uses this plugin's ntfy server for its instant updates when it has none of
its own and this plugin can run with a server set. It replaces the older **ntfy** plugin (`replaces`): installing it
carries ntfy's server, inbox and token over, its topic as **Your phone's topic**, and moves ntfy's folder to
`.atlas/trash/`.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested. The helper is JavaScript run
inside Atlas's core (no Python, the same on the phone).

## Status

Beta. Unit tests against a stand-in ntfy (`helper/helper.test.ts`), including two syncs at once.
