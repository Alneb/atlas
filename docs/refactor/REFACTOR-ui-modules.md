# The editor's setup and the plugin loader, split by concern

Two of the interface's largest modules each mixed several jobs in one file: `ui/src/lib/editor/create.ts` (595 lines) and `ui/src/lib/plugins.svelte.ts` (503 lines). A change to one concern meant reading all the others. Both are now split so that each file has one job. Their public names are unchanged: importers keep importing from `create.ts` and `plugins.svelte.ts`. The Explorer's split is in [REFACTOR-explorer.md](REFACTOR-explorer.md), last section.

## The editor (`ui/src/lib/editor/`)

| File | What it owns |
|---|---|
| `create.ts` (244 lines) | `createEditor`: the base every file gets (vim, history, search, selection, keys, the change, focus and selection callbacks, where the caret was left, settings reconfigured live), then a note's or a code file's part. Re-exports `codeTools` and `headingRepeats`. |
| `note-extensions.ts` | `noteExtensions(path, viewRef, onOpenLink)`: the live preview with Atlas's renderers, Obsidian's folds (headings and lists only), list continuation, the typing aids and their completions, files pasted or dropped saved beside the note; `mdOptions` (heading folds, typewriter scrolling); `headingRepeats` (the inline title is not drawn twice). |
| `code-extensions.ts` | `codeExtensions(lang, opts, lsp, config)`: the language and language-server slots, brackets, folds; `codeOptions` (line numbers, git gutter, wrap, indent guides, minimap); `codeTools` (the code tab's bar); `openReplace`; `countProblems`. |
| `link-clicks.ts` | `linkClicks(onOpenLink)`: a click on a link follows it, the middle button opens it beside (never the X11 paste), Ctrl+click on a picture opens it, and a finger's tap is taken at touchend, before the caret moves. |
| `completion-sources.ts` | The citation, snippet and symbol sources shared by notes and `.tex` files. Each is one stable function: a languageData provider that returned a new function on every call made the completion plugin ask again forever. |

`onChange(typed, keys)`: `typed` is a change by the user (it marks the tab unsaved at once). `keys` is set when the change was only typed or deleted characters (`input.type`, `delete`). Only then does `panes/Editor.svelte` read the text a moment later, when typing pauses (building a large note's text on every key was most of a key's cost). Any other change, such as the properties panel's (`input.properties`), a paste or a load, is read at once, so whatever made it sees the new text. A panel edit read late had let a renamed property be renamed again onto a name already taken.

## The plugin loader (`ui/src/lib/`)

| File | What it owns |
|---|---|
| `plugin-registry.svelte.ts` | The list (`plugins`), whether a plugin can run (`pluginBlocked`, `pluginOn`, `depth` for start order), `pluginSpec`, `pluginData`, `setPluginOn`; the ledger of registrations (`own`, `disposeAll`, `ownerIds`) and the starts under way (`starting`). It runs no plugin code. |
| `plugin-commands.ts` | A plugin's commands in the palette and on keys (`addCommand`), `runPluginCommand` (it waits for a start under way), and the palette entries that open plugin panes (`registerActions`). |
| `plugin-host-api.svelte.ts` | `pluginApi(p, at)`: the PluginApi a plugin is handed, every registration owned. `INIT_ID`, `noteProps`, `ContextSnapshot`. |
| `plugins.svelte.ts` (170 lines) | Starting (`startMain`, its overtaken-start guard), importing modules, `loadView`, closing orphaned views, `loadPlugins` (level by level along `requires`), `.atlas/init.js`, and `watchPlugins` (reloads on manifest, code and helper changes). Re-exports the public names of the three modules above. |

No static import cycle: the registry imports none of the others; commands import the registry; the host API imports both. The host API's `saveSettings` reloads the plugins through a dynamic `import("./plugins.svelte")`, a cycle closed only at run time.

## What to watch
- A new piece of PluginApi goes in `plugin-host-api.svelte.ts`, owned through `own(p.id, …)` so a reload undoes it.
- A new editor extension goes in the file of its kind (note, code, or the base in `create.ts`), never as a special case in `createEditor`.
- The specs that cover these: the explorer, sftp and copyparty specs; `md-render`, `latex-snippets`, `math-preview`, `embeds`, `middle-click`, `properties`; and the `plugin-*` specs.
