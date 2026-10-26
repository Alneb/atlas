// Notifications (docs/design/DESIGN-notifications.md): the server's messages, a note per source in the folder set
// (newest first). The helper's `sync` files them — every 5 minutes on the server, and here when the page starts and
// every 5 minutes while it is open — and answers the new ones from sources not muted, which become toasts. The bell
// in the status bar counts what is unread; opening a source's note reads it. A source is muted from its note's
// `muted:` (true, or a date), here with "Notifications: mute a source…".
export function register(atlas) {
  const folder = () => String(atlas.plugin.settings.folder || "notifications").replace(/\/+$/, "");
  const isNote = (path) => path?.startsWith(`${folder()}/`) && path.endsWith(".md");
  const bell = atlas.shell.statusItem({ id: "bell", text: "🔔", title: "Notifications", run: () => void list() });

  async function notes() {
    const entries = await atlas.list(folder()).catch(() => []); // none yet: nothing filed
    return entries.filter((e) => !e.dir).map((e) => e.path).filter(isNote);
  }
  async function count() {
    let n = 0;
    for (const p of await notes()) n += Number((await atlas.noteProps(p).catch(() => ({}))).unread) || 0;
    bell.set(n ? `🔔 ${n}` : "🔔", n ? `${n} unread notification${n === 1 ? "" : "s"}` : "Notifications");
  }
  async function sync(quiet) {
    try {
      const r = await atlas.helper.call("sync", {}, { timeout: 60 });
      const a = r.result ?? r;
      for (const m of (a.loud ?? []).slice(-5)) atlas.toast(`${m.source}: ${m.title}`, m.text, "info", { run: () => atlas.open(m.path) });
      if (!quiet && !a.new) atlas.toast("Notifications", a.problems?.length ? a.problems.join("; ") : "nothing new");
    } catch (e) { if (!quiet) atlas.toast("Notifications", String(e.message ?? e), "error"); }
    void count();
  }
  async function list() {
    const items = await Promise.all((await notes()).map(async (p) => {
      const props = await atlas.noteProps(p).catch(() => ({}));
      const unread = Number(props.unread) || 0;
      return { value: p, title: p.slice(folder().length + 1, -3), detail: [unread ? `${unread} unread` : "", props.muted && String(props.muted) !== "false" ? `muted ${props.muted === true || props.muted === "true" ? "" : `until ${props.muted}`}`.trim() : ""].filter(Boolean).join(" · ") };
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
    const items = (await notes()).map((p) => ({ value: p, title: p.slice(folder().length + 1, -3) }));
    atlas.pick({ placeholder: "Mute which source?", tag: "Mute", items, onpick: (p) => atlas.pick({
      placeholder: "For how long?", tag: "Mute",
      items: [
        { value: "1", title: "A day" }, { value: "7", title: "A week" }, { value: "30", title: "A month" },
        { value: "always", title: "Until I unmute it" }, { value: "off", title: "Unmute" },
      ],
      onpick: async (v) => {
        const until = v === "always" ? "true" : v === "off" ? "false" : new Date(Date.now() + Number(v) * 864e5).toISOString().slice(0, 10);
        await atlas.writeProperty(p, "muted", until);
        atlas.toast(v === "off" ? "Unmuted" : "Muted", `${p.slice(folder().length + 1, -3)}${v === "off" || v === "always" ? "" : ` until ${until}`} — still logged`);
      },
    }) });
  } });
  atlas.registerCommand({ id: "send", title: "Notifications: send to my phone…", run: () => atlas.pick({
    placeholder: "What to send to your phone…", tag: "Phone", items: [], typed: (t) => `Send “${t}”`,
    onpick: async (text) => {
      try { const r = await atlas.helper.call("send", { text }); atlas.toast("Sent to your phone", `through ${(r.result ?? r).through}`, "success"); }
      catch (e) { atlas.toast("Not sent", String(e.message ?? e), "error"); }
    },
  }) });

  void sync(true);
  const every = setInterval(() => void sync(true), 5 * 60 * 1000);
  return () => clearInterval(every);
}
