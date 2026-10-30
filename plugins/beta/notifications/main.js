// Notifications (docs/design/DESIGN-notifications.md): the server's messages, a note per source in the folder set
// (newest first). The helper's `sync` files them — every 5 minutes by the core's schedule, once when the page starts,
// and on "Check now" — and says what it found as a `synced` event, whose loud messages (sources not muted) become
// toasts here. The bell in the status bar counts what is unread; opening a source's note reads it. A source is muted
// from its note's `muted:` (true, or a date), here with "Notifications: mute a source…" (sources.js, a dialog). "Send
// to my phone" (a command, the editor menu) goes through the helper's `send`, as the agents' `notifications_send` tool
// does; the command's form is send.js, a dialog.
const folderOf = (atlas) => String(atlas.plugin.settings.folder || "notifications").replace(/\/+$/, "");
/** A source's name: its note's, under the folder. */
export const sourceName = (atlas, path) => path.slice(folderOf(atlas).length + 1, -3);

/** The sources' notes, one per source. */
export async function sourceNotes(atlas) {
  const entries = await atlas.list(folderOf(atlas)).catch(() => []); // none yet: nothing filed
  return entries.filter((e) => !e.dir).map((e) => e.path).filter((p) => p.startsWith(`${folderOf(atlas)}/`) && p.endsWith(".md"));
}

/** A note's `muted:` read: "always", the last day as YYYY-MM-DD, or "" (not muted, or a day gone by). */
export function mutedOf(props) {
  const m = String(props?.muted ?? "false");
  if (m === "true") return "always";
  return /^\d{4}-\d{2}-\d{2}$/.test(m) && m >= new Date().toISOString().slice(0, 10) ? m : "";
}

/** How long a source can be muted, as the mute's `how`. */
export const MUTE_CHOICES = [
  { value: "1", title: "A day" }, { value: "7", title: "A week" }, { value: "30", title: "A month" },
  { value: "always", title: "Until I unmute it" }, { value: "off", title: "Unmute" },
];

/** How long a mute lasts: a number of days, "always", or "off" (unmute). Returns the note's new `muted:`. */
export async function muteSource(atlas, path, how) {
  const until = how === "always" ? "true" : how === "off" ? "false" : new Date(Date.now() + Number(how) * 864e5).toISOString().slice(0, 10);
  await atlas.writeProperty(path, "muted", until);
  return until;
}

/** Sends to the phone; the channel it went through (Apprise or ntfy), or throws with the reason. */
export async function sendToPhone(atlas, text, title) {
  const r = await atlas.helper.call("send", { text, title: title || "Atlas" });
  return (r.result ?? r).through;
}

const dialogs = (atlas) => (atlas.version ?? 0) >= 23; // openDialog's `view` (plugin API 23)

export function register(atlas) {
  const folder = () => folderOf(atlas);
  const isNote = (path) => path?.startsWith(`${folder()}/`) && path.endsWith(".md");
  const bell = atlas.shell.statusItem({ id: "bell", text: "🔔", title: "Notifications", run: () => void list() });
  const notes = () => sourceNotes(atlas);
  async function count() {
    let n = 0;
    for (const p of await notes()) n += Number((await atlas.noteProps(p).catch(() => ({}))).unread) || 0;
    bell.set(n ? `🔔 ${n}` : "🔔", n ? `${n} unread notification${n === 1 ? "" : "s"}` : "Notifications");
  }
  // whoever ran the sync (the schedule, this page, another window): its loud messages are toasted once, here
  const unhear = atlas.helper.on("synced", (a) => {
    for (const m of (a?.loud ?? []).slice(-5)) atlas.toast(`${m.source}: ${m.title}`, m.text, "info", { run: () => atlas.open(m.path) });
    void count();
  });
  async function sync(quiet) {
    try {
      const r = await atlas.helper.call("sync", {}, { timeout: 60 });
      const a = r.result ?? r;
      if (!quiet && !a.new) atlas.toast("Notifications", a.problems?.length ? a.problems.join("; ") : "nothing new");
    } catch (e) { if (!quiet) atlas.toast("Notifications", String(e.message ?? e), "error"); }
    void count();
  }
  async function send(text, title) {
    try {
      atlas.toast("Sent to your phone", `through ${await sendToPhone(atlas, text, title)}`, "success");
    } catch (e) { atlas.toast("Not sent", String(e.message ?? e).replace(/^\w+Error: /, ""), "error"); }
  }
  const from = () => atlas.context().active?.path?.split("/").pop()?.replace(/\.(md|page)$/, ""); // a note or a page, by its name
  async function list() {
    const items = await Promise.all((await notes()).map(async (p) => {
      const props = await atlas.noteProps(p).catch(() => ({}));
      const unread = Number(props.unread) || 0;
      return { value: p, title: sourceName(atlas, p), detail: [unread ? `${unread} unread` : "", { always: "muted", "": "" }[mutedOf(props)] ?? `muted until ${mutedOf(props)}`].filter(Boolean).join(" · ") };
    }));
    atlas.pick({ placeholder: "A source's notifications…", tag: "Notifications", items, onpick: (p) => atlas.open(p) });
  }

  // a source's note opened: read
  atlas.on("file:open", async ({ path }) => {
    if (!isNote(path)) return;
    const props = await atlas.noteProps(path).catch(() => ({}));
    if (Number(props.unread)) { await atlas.writeProperty(path, "unread", "0"); void count(); }
  });

  atlas.registerCommand({ id: "check", title: "Notifications: check now", run: () => void sync(false) });
  atlas.registerCommand({ id: "open", title: "Notifications: a source's notes…", run: () => void list() });
  atlas.registerCommand({ id: "mute", title: "Notifications: mute a source…", run: async () => {
    if (dialogs(atlas)) return atlas.openDialog(undefined, { title: "Notification sources", width: 520, height: 440, view: "sources.js" });
    const items = (await notes()).map((p) => ({ value: p, title: sourceName(atlas, p) }));
    atlas.pick({ placeholder: "Mute which source?", tag: "Mute", items, onpick: (p) => atlas.pick({
      placeholder: "For how long?", tag: "Mute",
      items: MUTE_CHOICES,
      onpick: async (v) => {
        const until = await muteSource(atlas, p, v);
        atlas.toast(v === "off" ? "Unmuted" : "Muted", `${sourceName(atlas, p)}${v === "off" || v === "always" ? "" : ` until ${until}`} — still logged`);
      },
    }) });
  } });
  atlas.registerCommand({ id: "send", title: "Notifications: send to my phone…", run: () => dialogs(atlas)
    ? atlas.openDialog(from() ?? "", { title: "Send to my phone", width: 480, height: 320, view: "send.js" })
    : atlas.pick({
    placeholder: "What to send to your phone…", tag: "Phone", items: [], typed: (t) => `Send “${t}”`,
    onpick: (text) => void send(text, from()),
  }) });
  atlas.shell.menu("editor", (t) => ((t.selection ?? "").trim() ? [{ label: "Send the selection to my phone", icon: "arrow-up", run: () => send(t.selection.trim(), from()) }] : []));

  void sync(true); // then the core's schedule, every 5 minutes; its findings arrive as `synced`
  return unhear;
}
