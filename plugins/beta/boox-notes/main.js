// Boox Notes → Atlas drawings: the commands; the work is the helper's (helper.py, convert.py).
export function register(atlas) {
  const say = (r) => {
    const bits = [`${r.made.length} drawing${r.made.length === 1 ? "" : "s"} written (${r.strokes} strokes${r.texts ? `, ${r.texts} texts` : ""}${r.shapes ? `, ${r.shapes} shapes` : ""})`];
    if (r.kept.length) bits.push(`${r.kept.length} kept: edited since their import`);
    if (r.skipped) bits.push(`${r.skipped} pictures or shapes not converted`);
    if (r.failed.length) bits.push(`${r.failed.length} could not be read: ${r.failed.slice(0, 2).join("; ")}`);
    atlas.toast("Boox Notes", bits.join(" · "), r.failed.length ? "error" : "success");
    if (r.made.length === 1) atlas.open(r.made[0]);
  };
  const run = async (ids) => {
    atlas.toast("Boox Notes", ids ? "Importing the note…" : "Importing every note…");
    try { say(await atlas.helper.call("import_notes", { ids, settings: atlas.plugin.settings }, { timeout: 600 })); }
    catch (e) { atlas.toast("Boox Notes", e instanceof Error ? e.message : String(e), "error"); }
  };
  atlas.registerCommand({ id: "import-all", title: "Boox Notes: import every note as a drawing", run: () => run(null) });
  atlas.registerCommand({ id: "import", title: "Boox Notes: import a note…", run: async () => {
    let found;
    try { found = await atlas.helper.call("scan", { settings: atlas.plugin.settings }, { timeout: 60 }); }
    catch (e) { return atlas.toast("Boox Notes", e instanceof Error ? e.message : String(e), "error"); }
    atlas.pick({
      placeholder: `A note from ${found.root}…`, tag: "Boox Notes", icon: "edit",
      items: found.notes.map((n) => ({ value: n.id, title: n.title, detail: n.imported ? `imported: ${n.imported}` : "" })),
      onpick: (id) => run([id]),
    });
  } });
}
