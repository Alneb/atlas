# Start here

This vault uses a small note system (four kinds of notes, one inbox, one list of next actions). Everything below is a plain file you can change or delete; nothing is hidden in the app.

## The four kinds of notes

A note says what it is with one property, `type:`.

- **fleeting** — a thought caught quickly. It waits in [[Inbox.page|Inbox]] until you decide what it is.
- **literature** — what one source says, in your words. One note per paper, book or talk.
- **atomic** — one idea, stated so that it stands alone. Link it to the notes it came from.
- **project** — something with an end. Its first unchecked task is its next action; `state:` says where it stands.

A note points to what it belongs to with `up: "[[Parent]]"`. Folders stay as they are: the properties, not the place, say what a note is.

## The daily loop

1. **Capture** without thinking where it goes (Ctrl+Alt+C, or the box on the Inbox page).
2. **Review** the inbox once a day: [[Inbox.page|Inbox]] shows one note at a time. *Keep as…* gives it a type; *Later* brings it back in a few days, then less and less often; *Done* lets it go.
3. **Do** the next action of each project: [[Next.page|Next]] lists the first unchecked task of every project note, beside the calendar. A project with `start:` in the future stays out of the way until then.

## Changing it

- The pages are files, kept in `.atlas/pages/` so the vault's root stays yours: open one (the links above, or Ctrl+P and its name) and press **Arrange**, or **Edit as text**.
- The templates are in `templates/`; "New note from a template…" in the palette uses them.
- [[Projects.base|Projects]] is a table and a board over `type: project`; add columns from its header.
- How every piece works: run `atlas guide` in a terminal, or read `docs/guides/NOTES-SYSTEM.md` in the Atlas repository.
