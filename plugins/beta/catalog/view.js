// The Library app (main.js `catalog.app`): every kind the catalog knows, as covers or a table, with the item beside.
export default function mount(host, atlas) {
  return atlas.mountBlock(host, { type: "catalog.app" });
}
