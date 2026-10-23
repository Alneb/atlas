// ntfy — send text to a phone (docs/guides/PLUGIN-API.md). The helper (listen.py `send`) does the POST to
// <server>/<topic>, with the token the core hands it — the same call as the ntfy_send tool, so an agent, a phone on a
// remote server and this page send alike. The title is the note it came from.
export function register(atlas) {
  async function send(text, title) {
    try {
      await atlas.helper.call("send", { text, title: title || "Atlas", settings: atlas.plugin.settings }); // a tool call gets them from the core
      atlas.toast("Sent to your phone", text.length > 60 ? `${text.slice(0, 60)}…` : text, "success");
    } catch (e) { atlas.toast("Not sent", String(e.message ?? e).replace(/^\w+Error: /, ""), "error"); }
  }
  // the phone's side: messages to the inbox topic become captures (the helper keeps the connection)
  const inbox = String(atlas.plugin.settings.inbox ?? "").trim();
  if (inbox) {
    atlas.helper.on("message", (m) => void atlas.capture(m.text));
    // the token goes to the helper from the core (params.secrets), never through the page
    atlas.helper.call("listen", { url: `${String(atlas.plugin.settings.server).replace(/\/+$/, "")}/${encodeURIComponent(inbox)}/json` })
      .catch((e) => atlas.toast("ntfy: not listening", String(e.message ?? e), "error"));
  }
  const from = () => atlas.context().active?.path?.split("/").pop()?.replace(/\.(md|page)$/, ""); // a note or a page, by its name

  atlas.registerCommand({ id: "send", title: "ntfy: send to my phone…", run: () => atlas.pick({
    placeholder: "What to send to your phone…", tag: "ntfy", items: [], typed: (t) => `Send “${t}”`, onpick: (v) => void send(v, from()),
  }) });
  atlas.shell.menu("editor", (t) => ((t.selection ?? "").trim() ? [{ label: "Send the selection to my phone", icon: "arrow-up", run: () => send(t.selection.trim(), from()) }] : []));
}
