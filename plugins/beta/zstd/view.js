// A .zst opened (this plugin claims the type, plugin.toml): the file it holds is decompressed into the plugin's cache
// (helper/helper.ts) and opened there in its own view, in this tab's place — the .zst is an input, never edited.
export default function mount(host, atlas) {
  const say = document.createElement("p");
  say.className = "muted";
  say.style.padding = "24px";
  say.textContent = `Decompressing ${(atlas.path ?? "").split("/").pop()}…`;
  host.append(say);
  atlas.helper.call("open", { path: atlas.path }, { timeout: 600 }).then(
    ({ path }) => {
      atlas.open(path);
      atlas.pane?.close();
    },
    (e) => { say.textContent = `This file could not be decompressed: ${e?.message ?? e}`; },
  );
  return () => say.remove();
}
