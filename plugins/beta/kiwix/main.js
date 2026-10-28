// Kiwix — the command that opens the search pane (view.js).
export function register(atlas) {
  atlas.registerCommand({ id: "search", title: "Kiwix: search the offline library", run: () => atlas.openView(undefined, { title: "Kiwix" }) });
}
