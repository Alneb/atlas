// A block and a command in ~30 lines. Reloaded on every save (no restart, no build).
//
// Use the block in a note:        ```view
//                                 type: wordcount.count
//                                 ```
// or in a page / the sidebar:     - [{view: wordcount.count}]
export function register(atlas) {
  // A block is a function that draws into `host` and returns its cleanup.
  // Name it `<plugin id>.<name>`: a dotted type waits for its plugin and redraws when it changes.
  atlas.registerBlock("wordcount.count", (host, block) => {
    const goal = Number(block.options.goal ?? atlas.plugin.settings.goal ?? 0);
    const draw = async () => {
      if (!block.note.endsWith(".md")) { host.textContent = "Put this block in a note."; return; }
      const words = (await atlas.readText(block.note)).replace(/^---[\s\S]*?\n---/, "").split(/\s+/).filter(Boolean).length;
      host.textContent = goal ? `${words} of ${goal} words` : `${words} words`;
      // the app's CSS variables keep a plugin in step with the theme
      host.style.color = goal && words >= goal ? "var(--accent)" : "var(--text-muted)";
    };
    void draw();
    // redraw when the note is saved; the returned function is the block's cleanup
    return atlas.onFilesChanged((paths) => { if (paths.includes(block.note)) void draw(); });
  }, {
    // optional: a name for the "add a block" list, and the options as form fields — a page's
    // block menu then has "Options…" (kinds: text, number, toggle, list, choice)
    title: "Word count",
    options: [{ key: "goal", label: "Goal", kind: "number", hint: "words to reach (default: the plugin's setting)" }],
  });

  // A command: in the palette at once, bindable in Settings → Keyboard, `atlas cmd plugin.wordcount.goal` from a terminal.
  atlas.registerCommand({
    id: "goal",
    title: "Word count: how far is this note from the goal?",
    run: async () => {
      const path = atlas.context().active?.path;
      if (!path?.endsWith(".md")) return atlas.toast("Word count", "Open a note first.");
      const words = (await atlas.readText(path)).split(/\s+/).filter(Boolean).length;
      atlas.toast("Word count", `${words} words in ${path}`);
    },
  });

  // A row in a right-click menu ("file", "tab", "editor" or "block"), shown after the app's own rows.
  // The function gets what was clicked and returns the rows for it (none: return nothing).
  atlas.shell.menu("editor", (target) => {
    const n = (target.selection ?? "").split(/\s+/).filter(Boolean).length;
    if (!n) return;
    return [{ label: `Word count: ${n} selected`, icon: "outline", detail: "copies the number", run: () => navigator.clipboard.writeText(String(n)) }];
  });
}
