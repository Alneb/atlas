# Keys — what is bound, what was added for the Super key, and what is still a proposal

The user (2026-10-14): *"super + e opens a super comand bar that does commands actions and also searches and opens files, and make the most useful shortcuts use super instead of ctrl, look at the obsidian and zen shortcuts as inspiration"*, with their own Obsidian hotkeys: Super/Ctrl+E command palette, Super+F omnisearch, Alt+N / Super+N new note from a template, Ctrl+Q cycle list / checklist, Ctrl+Shift+= zoom. And later: *"don't stop to ask me anything"* — so the part that is safe was applied, and the part that would change habits is written here as a proposal instead of being done.

Every key can be changed in Settings → Keyboard (it writes `.atlas/keys.toml`); this page is about the defaults (`keys` and `alsoKeys` on the actions in `ui/src/lib/actions.ts`, `notes-system.ts`, `tabs.svelte.ts`).

## Applied on 2026-10-14 — only additions, nothing taken away (superseded by "Decided" below)

A command keeps its Ctrl key and gains a second one. Nothing that worked stopped working.

| key | does | note |
|---|---|---|
| **Super+E**, Ctrl+E | the command bar | besides Ctrl+K, Ctrl+Shift+P, F1. The user's Obsidian key |
| **Super+F** | fullscreen: the tab with the keys over the whole window (2026-10-15, *"make super + f also do fullscreen"*) | besides F11; search moved to **Ctrl+Shift+F** |
| **Alt+N**, **Super+N** | new note from a template | besides Ctrl+Alt+N |
| **Ctrl+Q** | cycle the line: text → list item → to-do → text | new command `note.cycle` (Obsidian's "cycle bullet / checkbox"); Ctrl+L still toggles a to-do done / open |
| Super+K | the Claude terminal | besides Ctrl+Alt+K |
| Super+J | show / hide the terminal panel | besides Ctrl+J |
| Super+B | show / hide the side panel | besides Ctrl+B, Ctrl+Alt+E |
| Super+O | outline | besides Ctrl+Shift+O |
| Super+G | git | besides Ctrl+Shift+G |
| Super+, | settings | besides Ctrl+, |
| Super+H | home | had no key |
| Super+[ · Super+] | back · forward in the history of tabs | had no key of their own in the list (the mouse buttons and the touchpad gesture stay) |

**Capture mode**: `+` as the first character makes the bar a capture box — tag "Capture", the capture box's completions on its input (task fields as in a note, `[[` notes, `#tags`, `@days`; `textarea-complete.ts`, now also on an `<input>` with a `when`), one row saying what the text becomes ("a to-do, due tomorrow"; a written `📅 date` is read too), Enter captures, Backspace on the empty box goes back to the commands. Also the command **Capture in the bar**. Test: `command-bar.spec.ts`.

**It also captures**: whatever is typed, the last row is "Capture “…”" — Enter on it (or a click) writes it to today's log exactly as the capture box would (`[] ` a to-do, `@tomorrow` a date). Test in `command-bar.spec.ts`. On the user's desktop Super+E is free (KDE has the file manager on Super+Shift+E there), so once Atlas is restarted on the new build it reaches the bar.

**The command bar is one bar** (`components/Palette.svelte`, mode "all"): commands first, then headings of the open note, then files by name, and — new — **lines of notes that hold the words typed** ("In notes", from three letters on, eight lines; the Search tool has them all). Enter opens the line; Ctrl+Enter opens it beside. `>` limits it to commands, `#` to headings. Test: `command-bar.spec.ts`.

**A warning about Super that cannot be fixed inside Atlas:** the desktop sees a Super key first. On KDE Plasma, Super+E opens the file manager, Super+L locks the screen, Super+D shows the desktop, Super+1…9 switch tasks, Super+Tab switches activities, and more. A key the desktop takes never reaches Atlas — nothing breaks, the key just does what the desktop says, and the Ctrl key for the same command still works. To give Super+E to Atlas: System Settings → Keyboard → Shortcuts, search the key, remove it there. That is why the Super keys above avoid the ones KDE uses by default except Super+E, which the user asked for by name. **Not checked on the user's desktop.**

## Two vim modes (2026-10-14)

The user: *"make two vim modes, classic one, but also one where visual deos not interfere wuth crtl x y c etc and it works in a normal way, while also having a nice vim experience"*.

Settings → Writing → **Vim keys** (`[editor] vim_keys`):

- **classic** (the default): every key is vim's. Ctrl+V starts a block selection, Ctrl+A / Ctrl+X change a number, `u` and Ctrl+R undo and redo. Ctrl+C with something selected already copies (the vim library's own exception).
- **desktop**: Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+Z, Ctrl+Y (and Ctrl+Shift+Z) and Ctrl+A copy, cut, paste, undo, redo and select all — in normal, visual and insert mode. After a cut or a paste over a visual selection the editor is back in normal mode. Everything else is vim as before. What is given up is vim's own meaning of those six keys.

How (`desktopKeys` in `ui/src/lib/editor/create.ts`, placed before vim in the editor's extensions): copy, cut and paste must be the *browser's* (it owns the clipboard), so the key has to pass vim untouched — and the vim library has no "skip this key". Its key handler returns at once when the editor has no vim state; so the state is put aside for that one key event and put back in a microtask. Undo, redo and select-all are CodeMirror's own commands. The setting is read at each key press: switching it needs no restart. Test: `vim-desktop-keys.spec.ts` (both modes). **Not checked in the desktop window** (WebKitGTK), where the clipboard sometimes behaves differently from Chromium.

## A formatting bar, for when the keys are not in the fingers yet (2026-10-14)

Settings → Writing → **Format bar** (`[editor] format_bar`, off by default): a row of buttons above a note — **B**, *I*, `<>` · H, •, 1., ☐, ❝ · Link, Table. Each does what the key does, with the same function (`formatNote` in `ui/src/lib/editor/md-format.ts`), and the keyboard stays in the text (a button does not take the selection). H cycles # → ## → ### → none; •, 1. and ❝ switch the line's start on and off (a list item becomes a numbered one, not both); Table puts a 2 × 2 table under the caret's line with the first header selected. A button's tooltip names its key where it has one. Component: `ui/src/components/FormatBar.svelte`. Test: `format-bar.spec.ts`. Looked at in both themes.

## Decided (2026-10-14) — Super is Atlas's key, Ctrl is for text

The user: *"the main key is super, ctrl is for the classic things like text edit etc, do not conflict with kde, you should be able to read them"*, and on the table below: drop the old Ctrl+Shift / Ctrl+Alt app keys. Every Super key was checked against the user's **active** KDE bindings (`~/.config/kglobalshortcutsrc`, first field of each entry). KDE keeps Super alone (the launcher), Super+A (launches Atlas), D, L, R, T, W, Tab, Return, Backspace, the digits and Shift+A/E/I/P/Q/T, so none of those is used.

| command | key now | was |
|---|---|---|
| command bar | **Super+E**, F1 | Ctrl+K (outside notes), Ctrl+E, Ctrl+Shift+P |
| open file | **Super+P**, Ctrl+P | Ctrl+P |
| search the vault | **Ctrl+Shift+F** | (Super+F until 2026-10-15; now fullscreen) |
| new note from a template | **Super+N**, Alt+N | Ctrl+Alt+N |
| capture | **Super+C** | Ctrl+Alt+C |
| Claude terminal | **Super+K** | Ctrl+Alt+K |
| terminal panel | **Super+J** (focus: Ctrl+`) | Ctrl+J |
| side panel | **Super+B** | Ctrl+B (outside notes), Ctrl+Alt+E |
| files | **Super+Shift+F** | Ctrl+Shift+E |
| outline · git · graph | **Super+O** · **Super+G** · **Super+Shift+G** | Ctrl+Shift+O · Ctrl+Shift+G · Ctrl+Alt+G |
| library · problems · commands pane | **Super+Shift+L** · **Super+M** · **Super+Shift+K** | Ctrl+Shift+L · Ctrl+Shift+M · Ctrl+Shift+K |
| drawing · left bar · settings | **Super+Shift+D** · **Super+S** · **Super+,** | Ctrl+Alt+D · Ctrl+Alt+S · Ctrl+, |
| home · back / forward | Super+H · Super+[ / ] | (unchanged) |
| capture box: the vault list · the vault before / after | **Super+V** · **Super+↑ / ↓** (2026-10-15; shown in the box's footer) | Alt+V · Alt+↑ / ↓ (still work) |
| capture box: take the screen · the last screenshot · the clipboard · the page you were on | **Super+S** · **Super+Shift+S** · **Super+C** · **Super+U** (2026-10-16; in the chips, or their hover note) | — (the box is its own window: Atlas's Super+S / Super+C do not apply there; KDE binds none of them) |
| browsing window: the page in the desktop's browser | **Super+Shift+O** (Super+O is the outline) | Ctrl+Shift+O (never released) |
| terminal copy / paste | **Ctrl+Shift+C / V** (Konsole's) | — |
| close the tab | **Super+Q**, Ctrl+W (Ctrl+W stays the shell's in a terminal; Super+Q closes the terminal tab too) | Ctrl+W |
| switch tabs | **Ctrl+Tab**: a glance over the focused split's tabs, most recent first; let go of Ctrl to switch, Esc stays (`[ui] tab_switcher = cycle`: the older step through every tab) | Ctrl+Tab cycled every tab in the bar's order |

**Kept on Ctrl** (text editing and the universal editor keys): Ctrl+W (also Super+Q), Ctrl+Tab, Ctrl+1…9, Ctrl+S, Ctrl+F, Ctrl+Z / Y / C / V / X / A, and in a note Ctrl+B / I / K / L / Q; zoom Ctrl+Plus / Minus / 0; Ctrl+` (focus the terminal). Commands not in the table keep their keys (Ctrl+Shift+H replace, Ctrl+Alt+O open with, Ctrl+Alt+P pin, Ctrl+Shift+A find a tab, Ctrl+Alt+Enter send to Claude, the Ctrl+Alt zoom-all keys).

**Tab in the editor** (2026-10-15, after *"it just tabs the whole line instead of adding a tab character, that is not intuitive is it?"* and *"the tab is kind of broken with code autocompletion"*), `tabKey` and `walkList` in `ui/src/lib/editor/create.ts`:

| where | Tab | Shift+Tab |
|---|---|---|
| a note, plain text | a tab character at the caret (Obsidian) | takes an indent away |
| a note, a list item or task | indents the item | outdents it |
| a selection (note or code) | indents the selected lines | outdents them |
| a code file, no list | one indent unit at the caret (VS Code) | outdents |
| a completion list in a note | moves down the list; Enter takes | moves up |
| a completion list in a code file | takes the entry (VS Code; walking a one-entry list did nothing) | moves up |
| the full task-field list (nothing typed matched) | indents the task, as in Obsidian | outdents |
| a snippet with fields | the next field | the previous one |

Before, `indentWithTab` indented the whole line from anywhere in it. A list on screen counts even while a source is still answering: a language server is re-asked at every key, CodeMirror then reports the list as "pending", and Tab used to wait for "active", close the list and indent instead — the code-completion bug. Tests: `complete-keys.spec.ts`, `lsp.spec.ts` (Tab takes the server's entry), `task-complete.spec.ts`.

**The terminal keeps its keys.** In a focused terminal every key without Super goes to the shell (Ctrl+W, Ctrl+K, Ctrl+B, Ctrl+J, Alt+…), except F-keys and the commands marked `fromTerminal` (Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+`). From a terminal the bar opens with Super+E or F1.

**Super in the desktop app.** WebKitGTK on Wayland can report Super+E with `metaKey` false. `superOf(e)` in `ui/src/lib/keys.ts` also counts a Super key seen going down (until it goes up or the window blurs) and the "Super"/"OS" modifier state; every check uses it, never `e.metaKey` alone. Test: the WebKitGTK case is simulated in `command-bar.spec.ts`. Still to confirm by hand in the desktop window after a restart.

## Clashes are shown (2026-10-14)

Settings → Keyboard marks, in red beside the command, a key that another command also has **in the same place** ("same key as Git") — only one of the two would ever run. A key that means one thing in notes and another elsewhere (Ctrl+K: link in a note, the command bar outside) is not a clash; that is the design. The default keys have none: a test fails if a new default ever collides (`key-clashes.spec.ts`; `keyClashes()` in `ui/src/lib/keymap.svelte.ts`).

**Every key a command has is shown** on its row in Settings → Keyboard ("also Ctrl+Shift+P · F1 · Super+E · Ctrl+E"), and the page's search finds them: typing `super` lists the whole Super layer.

## Where keys are decided (for whoever changes this)

- A default is `keys: "Ctrl+Alt+K"` on the action, with `alsoKeys: ["Super+K"]` for more. Keys are matched by physical key (`ui/src/lib/keys.ts`), so they work on a Spanish layout; `Super`, `Meta` and `Cmd` are the same modifier.
- `where: "note"` limits a key to notes (Ctrl+B is bold there and nothing elsewhere); a focused terminal keeps every key without Super for its shell; `fromTerminal: true` lets a command's keys work from there too (Ctrl+Tab, Ctrl+`). (Until only plain Ctrl+letter keys of commands marked `yieldToTerminal` went to the shell.)
- The user's own bindings win: `.atlas/keys.toml`, edited by Settings → Keyboard.


**Closing tabs** (2026-10-15, *"make close all other tabs of this group only apply to normal tabs, not terminal ones, and add an option to close all tabs (not including terminal), if no tab is open home should open automatically"*): "Close others in this group" and **"Close all tabs"** (`ui.tabs.closeAll`, in the tab menu and the palette) close documents only — never a terminal, never a pinned tab. When the last document tab is gone, Home opens by itself (`tabs.svelte.ts` `whenNoTabs`).
