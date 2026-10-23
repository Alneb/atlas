// A vault's startup script: copy to <vault>/.atlas/init.js. Same API as a plugin (docs/guides/EXTENDING.md),
// for small things that do not deserve a folder. Reloaded on every save.
export function register(atlas) {
  // Today's log, one key away.
  atlas.registerCommand({
    id: "today-note", title: "Open today's log", keys: "Ctrl+Alt+T",
    run: () => atlas.open(`log/${new Date().toISOString().slice(0, 10)}.md`),
  });

  // Two files side by side: the note being written, and the one it draws on.
  atlas.registerCommand({
    id: "focus-beside", title: "Open FOCUS.md beside this tab",
    run: () => atlas.open("FOCUS.md", undefined, { beside: true }),
  });

  // A chooser of your own: `pick` is the same fuzzy list the palette uses.
  atlas.registerCommand({
    id: "state", title: "Set this note's state…",
    run: () => {
      const path = atlas.context().active?.path;
      if (!path) return atlas.toast("Open a note first");
      atlas.pick({
        placeholder: "State of this note", tag: "State",
        items: ["active", "waiting", "done"].map((s) => ({ value: s, title: s })),
        onpick: (s) => atlas.writeProperty(path, "state", s),   // rewrites only that key of the frontmatter
      });
    },
  });
}
