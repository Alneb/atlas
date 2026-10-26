# ntfy

Send a line or the selection to your phone through an ntfy server (ntfy.sh, or your own), and capture what the phone
sends back.

- The command "ntfy: send to my phone…", and "Send the selection to my phone" in the editor's right-click menu; the
  notification's title is the note it came from.
- **From the phone**: what you send to the inbox topic becomes a capture (into today's log). The helper keeps the
  subscription open and remembers the last message, so what was sent while Atlas was closed is captured too, and
  nothing twice.
- **For agents**: the `send` tool sends a short message to your phone, e.g. when a long job ends. The page, a phone on
  a remote server and an agent all send through the same helper call.

## Settings

- **ntfy server** (`https://ntfy.sh`).
- **Topic**: the topic your phone is subscribed to.
- **Topic to capture from**: what you send there from the phone is captured; empty, nothing is listened to.
- **Access token** (a secret): only for a protected topic.

## Needs

An ntfy server and the ntfy app on the phone, and Python 3 on the machine running Atlas's server (the helper,
`listen.py`; standard library only), which talks to the ntfy server itself.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`python3 -m unittest test_listen` (`send` against a stand-in ntfy server) and `ui/tests/example-ntfy.spec.ts`.
