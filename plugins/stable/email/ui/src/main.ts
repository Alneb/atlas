// The Email plugin's page side, loaded with Atlas (not only with the pane): its commands, the unread count in the
// status bar, notices of new mail, the inbox block and side tool, saved mail notes drawn as mail, Outlook's sign-in,
// and the question when Claude asks to read an account. The engine watches the accounts (IDLE) from the start.
import { mount, unmount } from "svelte";
import Inbox from "./Inbox.svelte";
import Rules from "./Rules.svelte";
import NoteView from "./NoteView.svelte";
import { call, type PluginApi } from "./api";
import { openMail as openPane } from "./open-mail";
import { THUNDERBIRD_DIALOG, standIn } from "./rules-host";
import { signin } from "./signin";

type Card = { name: string; auth?: string; user?: string; claude?: string };

export function register(atlas: PluginApi) {
  const cards = () => ((atlas.plugin.settings.accounts as Card[] | undefined) ?? []).filter((c) => c?.name);
  const openMail = (detail: Record<string, unknown> = {}) => openPane(atlas, detail);

  atlas.registerCommand({ id: "open", title: "Email: open mail", run: () => openMail() });
  atlas.registerCommand({ id: "compose", title: "Email: new message", run: () => openMail({ compose: {} }) });
  atlas.registerCommand({ id: "check", title: "Email: check for new mail", run: async () => {
    atlas.toast("Email", "Checking for new mail…");
    try { await call(atlas, "sync", {}, 600); } catch (e) { atlas.toast("Email", (e as Error).message, "error"); }
  } });
  atlas.registerCommand({ id: "send", title: "Email: send this note…", run: () => {
    const path = atlas.context().active?.path;
    if (!path?.endsWith(".md")) { atlas.toast("Email", "Open the note to send first."); return; }
    void atlas.readText(path).then((raw) => {
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
      const subject = body.match(/^# (.+)$/m)?.[1] ?? path.split("/").pop()!.replace(/\.md$/, "");
      openMail({ compose: { subject, body: body.replace(/^# .+\n+/, "") } });
    });
  } });
  atlas.registerCommand({ id: "accounts", title: "Email: accounts…", run: () => atlas.plugin.openSettings() });
  atlas.registerCommand({ id: "signin", title: "Email: sign in to Outlook…", run: (arg?: unknown) => void signin(atlas, (arg as { record?: Card })?.record) });
  // Thunderbird's accounts and local mail: one dialog over the app (API 20); a tab of its own on an older one
  const thunderbird = () => (typeof atlas.openDialog === "function"
    ? void atlas.openDialog(THUNDERBIRD_DIALOG, { title: "Import from Thunderbird", width: 640, height: 560 })
    : atlas.openView(THUNDERBIRD_DIALOG, { title: "Thunderbird", icon: "mail" }));
  atlas.registerCommand({ id: "thunderbird", title: "Email: import an account from Thunderbird…", run: thunderbird });
  atlas.registerCommand({ id: "thunderbird-mail", title: "Email: keep Thunderbird's local mail as notes…", run: thunderbird });
  // one listener however often the plugin is loaded again (a stale one would start a second sign-in)
  const w = window as unknown as { __atlasEmailSignin?: EventListener };
  if (w.__atlasEmailSignin) window.removeEventListener("atlas-email:signin", w.__atlasEmailSignin);
  w.__atlasEmailSignin = (e) => void signin(atlas, (e as CustomEvent<string>).detail);
  window.addEventListener("atlas-email:signin", w.__atlasEmailSignin);

  // Settings → Email: the rules, edited where the other settings are (plugin API 12)
  atlas.plugin.registerSettingsSection?.({ id: "rules", title: "Rules", hint: "What happens to new mail by itself: important, archive, a label, kept as a note.", mount: (host) => {
    const v = mount(Rules, { target: host, props: { frame: "page", mail: standIn(atlas) } });
    return () => unmount(v);
  } });

  // saved mail notes are drawn as mail
  atlas.registerNoteView?.("mail", { title: "Mail", types: ["email-thread", "email"], render: (host, note) => {
    const v = mount(NoteView, { target: host, props: { atlas, note, onmail: openMail } });
    return () => unmount(v);
  } });

  atlas.registerBlock("email.inbox", (host, block) => {
    const v = mount(Inbox, { target: host, props: { atlas, options: block.options ?? {}, onopen: openMail } });
    return () => unmount(v);
  }, { title: "Mail", options: [{ key: "limit", label: "At most", kind: "number" }, { key: "unseen", label: "Only unread", kind: "toggle" }, { key: "folder", label: "Folder", kind: "text" }, { key: "account", label: "Account", kind: "text", hint: "an account's name in Email's settings; empty: every account" }] });

  atlas.shell.sideTool({ id: "mail", title: "Email", icon: "inbox", mount: (host) => {
    const v = mount(Inbox, { target: host, props: { atlas, options: { limit: 12 }, onopen: openMail } });
    return () => unmount(v);
  } });

  // the unread count: from the index, again whenever the engine says something changed
  const status = atlas.shell.statusItem({ id: "unread", text: "", title: "Unread mail — open Email", run: () => openMail() });
  let countTimer: ReturnType<typeof setTimeout> | undefined;
  const count = () => {
    clearTimeout(countTimer);
    countTimer = setTimeout(async () => {
      try {
        const { unread } = await call<{ unread: number }>(atlas, "unread_count", {}, 20);
        status.set(unread ? `✉ ${unread}` : "", `${unread} unread — open Email`);
      } catch { status.set("", "Email"); }
    }, 400);
  };
  atlas.helper.on("changed", count);
  atlas.helper.on("new", (d) => {
    count();
    if (atlas.plugin.settings.notify === false) return;
    const n = d as { count: number; messages: { id: number; subject: string; from: { name: string; addr: string }[] }[] };
    for (const m of n.messages.slice(0, 3)) atlas.toast(m.from[0]?.name || m.from[0]?.addr || "New mail", m.subject || "(no subject)", "info", { run: () => openMail({ id: m.id }) });
    if (n.count > 3) atlas.toast("Email", `${n.count - 3} more new messages`, "info", { run: () => openMail() });
  });
  atlas.helper.on("sent", (d) => { const s = d as { subject: string; later?: boolean }; if (s.later) atlas.toast("Sent (scheduled)", s.subject, "success"); });
  atlas.helper.on("notify", (d) => { const r = d as { rule: string; ids: number[] }; atlas.toast("Email", `New mail for the rule “${r.rule}”`, "info", { run: () => openMail({ id: r.ids[0] }) }); });

  // a card renamed in Settings: the index and the saved notes' folder follow (the core moved its secrets)
  atlas.helper.on("settings:renamed", (d) => {
    const r = d as { key?: string; from: string; to: string };
    if (r?.key === "accounts") void call(atlas, "rename_account", { from: r.from, to: r.to }).catch((e) => atlas.toast("Email", `The account's mail kept its old name: ${(e as Error).message}`, "error"));
  });

  // Claude asks to read an account (the card's "Claude may read it" = ask): the answer is given here
  atlas.helper.on("consent", (d) => {
    const q = d as { id: string; account: string; user: string; what: string };
    const reply = (allow: string) => atlas.helper.call("consent_answer", { id: q.id, allow, settings: atlas.plugin.settings });
    atlas.pick({
      placeholder: `Claude asks to read ${q.account}${q.user ? ` (${q.user})` : ""}: ${q.what}`, tag: "Email",
      items: [
        { value: "once", title: "Allow this once" },
        { value: "always", title: `Always allow for ${q.account}`, detail: "its card's “Claude may read it” becomes always" },
        { value: "no", title: "Don't allow" },
      ],
      onpick: async (v) => {
        await reply(v);
        if (v === "always") await atlas.plugin.saveSettings({ accounts: cards().map((a) => (a.name === q.account ? { ...a, claude: "always" } : a)) });
      },
    });
  });

  // the engine starts watching the accounts (IDLE, the periodic sync, snoozes, scheduled mail) once Atlas is up
  const first = setTimeout(() => { void call(atlas, "watch", {}, 60).then(count, () => {}); }, 4000);
  return () => clearTimeout(first);
}
