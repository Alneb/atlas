// The Calendar plugin's page side, loaded with Atlas (not only with the pane): its commands, the Home card, the
// notices of dates the important-notes sync added, the account and subscription cards' Test, the 0.1 settings moved
// into an account card, and the engine's background sync.
import { mount, unmount } from "svelte";
import Upcoming from "./Upcoming.svelte";
import CalendarsSection from "./CalendarsSection.svelte";
import { call, type PluginApi } from "./api";

type Show = { date?: string; view?: string; quick?: boolean; create?: boolean };

export function register(atlas: PluginApi) {
  type Card = { name?: string; url?: string; user?: string };
  const cards = () => (atlas.plugin.settings.accounts as Card[] | undefined) ?? [];
  const ready = () => cards().some((c) => c.name && c.url && c.user) || Boolean(atlas.plugin.settings.url && atlas.plugin.settings.user);
  const show = (detail: Show = {}) => {
    (window as unknown as { __atlasCalendarShow?: unknown }).__atlasCalendarShow = detail;
    atlas.openView(undefined, { title: "Calendar", icon: "calendar" });
    // a pane already open hears it now; a new one reads __atlasCalendarShow when it mounts
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("atlas-calendar:show", { detail }));
      (window as unknown as { __atlasCalendarShow?: unknown }).__atlasCalendarShow = undefined;
    }, 300);
  };

  atlas.registerCommand({ id: "open", title: "Calendar: open", run: () => show() });
  atlas.registerCommand({ id: "today", title: "Calendar: today", run: () => show({ date: new Date().toISOString().slice(0, 10), view: "day" }) });
  atlas.registerCommand({ id: "new", title: "Calendar: new event", run: () => show({ create: true }) });
  atlas.registerCommand({ id: "quick", title: "Calendar: quick add (in words)…", run: () => show({ quick: true }) });
  atlas.registerCommand({
    id: "sync",
    title: "Calendar: put important notes on the server",
    run: async () => {
      if (!ready()) { atlas.toast("Calendar", "Add a calendar account first.", "error"); atlas.plugin.openSettings(); return; }
      atlas.toast("Calendar", "Looking for important notes…");
      try {
        const r = await call<{ summary: string; events?: { outcome: string; title: string; why?: string }[] }>(atlas, "sync", {}, 300);
        const failed = (r.events ?? []).filter((e) => e.outcome === "failed").map((e) => `${e.title}: ${e.why}`);
        atlas.toast("Calendar", [r.summary, ...failed.slice(0, 3)].join("\n"), failed.length ? "error" : undefined);
      } catch (e) { atlas.toast("Calendar", (e as Error).message, "error"); }
    },
  });
  atlas.registerCommand({
    id: "calendars",
    title: "Calendar: test the accounts",
    run: async () => {
      try {
        await call(atlas, "refresh", { force: true }, 300);
        type Listed = { accounts: { account: string; status?: { state: string; text: string }; calendars: { id: string; name: string; writable: boolean }[] }[]; default: string | null };
        const r = await call<Listed>(atlas, "calendars");
        if (!r.accounts.length) { atlas.toast("Calendar", "No account yet.", "error"); atlas.plugin.openSettings(); return; }
        const lines = r.accounts.map((a) => `${a.account}: ${a.status?.state === "ok" ? a.calendars.map((c) => `${c.name}${c.id === r.default ? " (new events)" : ""}${c.writable ? "" : " (read-only)"}`).join(", ") || "no calendar" : a.status?.text ?? "?"}`);
        atlas.toast("Calendar", lines.join("\n"), r.accounts.some((a) => a.status?.state === "error") ? "error" : undefined);
      } catch (e) { atlas.toast("Calendar", (e as Error).message, "error"); }
    },
  });
  // an account card's "Test" (Settings saves the form first, then calls this with the card)
  atlas.registerCommand({
    id: "test-account",
    title: "Calendar: test an account",
    run: async (arg?: unknown) => {
      const record = (arg as { record?: Record<string, unknown> } | undefined)?.record;
      if (!record) { atlas.plugin.openSettings(); return; }
      try {
        const r = await call<{ ok: boolean; text: string }>(atlas, "test_account", { record }, 60);
        atlas.toast(String(record.name ?? "Account"), r.text, r.ok ? "success" : "error");
        if (r.ok) void call(atlas, "refresh", { force: true }, 300).catch(() => {});
      } catch (e) { atlas.toast("Calendar", (e as Error).message, "error"); }
    },
  });
  // under the account cards: every account and subscription read again now, each one's problem said
  atlas.registerCommand({
    id: "sync-now",
    title: "Calendar: sync now",
    run: async () => {
      try {
        const r = await call<{ errors: string[] }>(atlas, "refresh", { force: true }, 300);
        atlas.toast("Calendar", r.errors.length ? r.errors.join("\n") : "Every account and subscription is up to date.", r.errors.length ? "error" : "success");
      } catch (e) { atlas.toast("Calendar", (e as Error).message, "error"); }
    },
  });
  // the Subscriptions card's "Test" (Settings saves the form first, then calls this with the card)
  atlas.registerCommand({
    id: "test-subscription",
    title: "Calendar: test a subscription",
    run: async (arg?: unknown) => {
      const record = (arg as { record?: Record<string, unknown> } | undefined)?.record;
      if (!record) { atlas.plugin.openSettings(); return; }
      try {
        const r = await call<{ summary: string }>(atlas, "test_subscription", { record }, 60);
        atlas.toast("Subscription", r.summary, "success");
        void call(atlas, "refresh", { force: true }, 120).catch(() => {});
      } catch (e) { atlas.toast("Subscription", (e as Error).message, "error"); }
    },
  });

  // the automatic sync (on changed files) runs in the core; it tells the page what it added
  atlas.helper.on("added", (d) => {
    const a = d as { title: string; start: string; outcome: string };
    atlas.toast(a.outcome === "updated" ? "Updated in your calendar" : "Added to your calendar", `${a.title} — ${a.start}`, "info", { run: () => show({ date: a.start.slice(0, 10), view: "day" }) });
  });

  // ```view\ntype: dav.upcoming\ndays: 7\n``` — today, tomorrow, the week
  atlas.registerBlock("dav.upcoming", (host, b) => {
    const v = mount(Upcoming, { target: host, props: { atlas, options: b.options ?? {}, onopen: (date: string) => show({ date, view: "day" }) } });
    return () => unmount(v);
  }, { title: "Calendar: upcoming", options: [{ key: "days", label: "Days", kind: "number" }] });

  // 0.1 kept one account as flat settings (url, user, the `password` secret): moved into a card once, its secret
  // copied by the helper — nothing to retype. Not awaited here (saveSettings reloads the plugin).
  if (atlas.plugin.settings.url && atlas.plugin.settings.user && !cards().length) {
    void (async () => {
      const plan = await call<{ values?: Record<string, unknown>; name?: string }>(atlas, "migrate", {}, 60);
      if (!plan.values) return;
      await atlas.plugin.saveSettings(plan.values);
      atlas.toast("Calendar", `Your calendar account is now the card “${plan.name}” (Settings → Calendar → Accounts); add more there.`, "success");
    })().catch((e) => atlas.toast("Calendar: account not moved", String((e as Error).message ?? e), "error"));
  }

  // a renamed account card: its calendars' ids (`<account>/<calendar>`) change with it, so do the settings holding them
  atlas.helper.on("settings:renamed", (d) => {
    const { key, from, to } = d as { key: string; from: string; to: string };
    if (key !== "accounts") return;
    const move = (v: unknown) => (typeof v === "string" && v.startsWith(`${from}/`) ? `${to}/${v.slice(from.length + 1)}` : v);
    const s = atlas.plugin.settings;
    void atlas.plugin.saveSettings({
      calendar: move(s.calendar) || null,
      hidden: ((s.hidden as string[] | undefined) ?? []).map(move),
      colors: ((s.colors as string[] | undefined) ?? []).map(move),
    }).catch((e) => atlas.toast("Calendar", `The renamed account's calendars kept their old ids: ${(e as Error).message}`, "error"));
  });

  // Settings v2 (API 12): the calendars of every account with their visibility and colour, under the account cards
  const offSection = atlas.plugin.registerSettingsSection?.({
    id: "calendars", title: "Calendars", hint: "Which calendars the pane shows, and their colours.", place: "before",
    mount(host, ctx) { const v = mount(CalendarsSection, { target: host, props: { ctx } }); return () => unmount(v); },
  });

  // the engine keeps the cache fresh (CalDAV every few minutes, subscriptions when due) once Atlas is up
  const first = setTimeout(() => { void call(atlas, "watch", {}, 60).catch(() => {}); }, 5000);
  return () => { clearTimeout(first); offSection?.(); };
}
