# Word stats (helper example)

An example of a plugin with a helper: a program of its own that Atlas keeps running, here in Python. It counts the
words of every note and shows the total in the status bar. Copy this folder into a vault's `.atlas/plugins/` to try
it.

- A status bar item ("words: …"; a click counts again) and the command "Word stats: count the words of all notes".
- Counts again whenever a note is saved; the helper remembers each file's count by its modification time, so only
  what changed is read again.
- Shows the whole helper protocol in a few lines (`helper.py`): one JSON object per line, answers by `id`, errors as
  answers, and events (`progress`) sent while a call is still running. What the helper prints to stderr lands in the
  plugin's log under `.atlas/cache/plugins/`.
- See `docs/guides/PLUGIN-API.md` for helpers in general.

## Settings

None.

## Needs

Python 3 on the machine running Atlas's server (standard library only).

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

None yet.
