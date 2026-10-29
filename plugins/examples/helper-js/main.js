// "Word stats": the page side of a plugin with a helper (see helper.js for the other side).
export function register(atlas) {
  const cell = atlas.shell.statusItem({ id: "words", text: "words: ?", title: "Words in all notes (click to count)", run: () => void count() });
  // events the helper prints while a call is running
  atlas.helper.on("progress", (d) => cell.set(`counting… ${d.files} notes`));

  async function count(changed = []) {
    try {
      const r = await atlas.helper.call("count", { dir: "", changed });
      cell.set(`words: ${r.words.toLocaleString()}`, `${r.files} notes · the helper remembers ${r.cached} files`);
      return r;
    } catch (e) {
      cell.set("words: failed", String(e.message ?? e));
    }
  }

  atlas.registerCommand({ id: "count", title: "Word stats: count the words of all notes", run: async () => {
    const r = await count();
    if (r) atlas.toast("Word stats", `${r.words.toLocaleString()} words in ${r.files} notes`);
  } });
  // a saved note: count again (cheap — the helper only re-reads what changed)
  atlas.on("file:save", (e) => { if (e.path.endsWith(".md")) void count([e.path]); });
}
