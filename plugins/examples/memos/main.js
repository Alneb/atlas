// memos — a line or the selection becomes a memo (docs/guides/PLUGIN-API.md). One POST to the memos API;
// the token is put into the request by Atlas's core, never in the page. Written from the memos API
// as documented for v0.2x (`POST /api/v1/memos` with `{ content, visibility }`); check it against
// your server's version.
export function register(atlas) {
  async function send(text) {
    const s = atlas.plugin.settings, base = String(s.server ?? "").trim().replace(/\/+$/, "");
    if (!base) return atlas.toast("memos", "Set the server first: Settings → Plugins → memos → Settings…", "error");
    try {
      const res = await atlas.fetch(`${base}/api/v1/memos`, {
        method: "POST",
        headers: { Authorization: { secret: "token", prefix: "Bearer " } },
        body: { content: text, visibility: s.visibility ?? "PRIVATE" },
      });
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      atlas.toast("Saved to memos", text.length > 60 ? `${text.slice(0, 60)}…` : text, "success");
    } catch (e) { atlas.toast("Not saved to memos", String(e.message ?? e), "error"); }
  }
  atlas.registerCommand({ id: "send", title: "memos: new memo…", run: () => atlas.pick({ placeholder: "The memo…", tag: "memos", items: [], typed: (t) => `Save “${t}”`, onpick: (v) => void send(v) }) });
  atlas.shell.menu("editor", (t) => ((t.selection ?? "").trim() ? [{ label: "Save the selection as a memo", icon: "file-text", run: () => send(t.selection.trim()) }] : []));
}
