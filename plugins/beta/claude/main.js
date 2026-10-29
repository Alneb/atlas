// Claude usage in the status bar (README.md): "Claude 42 %" — the session limit of the account Atlas's Claude runs
// as (the helper's `in_use`, engine/src/lib.rs) — and its limits on hover; a click looks again.
export function register(atlas) {
  const cell = atlas.shell.statusItem({ id: "usage", text: "Claude …", title: "Claude usage", run: () => void look(true) });
  // A limit is announced once per window, also across restarts. The key leaves out resets_at: the endpoint moves it
  // by a fraction of a second on every look, so a key holding it was new each time (a notice every 2 min).
  const STORE = "atlas.claude.warned";
  const warned = (() => { try { return JSON.parse(localStorage.getItem(STORE) ?? "{}") ?? {}; } catch { return {}; } })(); // "folder:kind" → the window's end (ms), 0 unknown
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(warned)); } catch { /* storage off: once per run */ } };
  function announce(a, l, warn) {
    const key = `${a.folder}:${l.kind}`;
    if (l.percent < warn) { if (key in warned) { delete warned[key]; save(); } return; } // below again (a new window): re-armed
    if (a.stale || (key in warned && (!warned[key] || Date.now() < warned[key]))) return; // old numbers, or this window was announced
    warned[key] = Date.parse(l.resets_at ?? "") || 0;
    save();
    atlas.toast(`Claude: ${Math.round(l.percent)} % of the ${l.label} used`, `${a.name}${when(l.resets_at) ? ` — ${when(l.resets_at)}` : ""}`, "info");
  }
  const when = (iso) => {
    if (!iso) return "";
    const d = new Date(iso), mins = Math.round((d.getTime() - Date.now()) / 60_000);
    if (mins < 0) return "";
    if (mins < 60) return `resets in ${mins} min`;
    if (mins < 24 * 60) return `resets at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    return `resets ${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}`;
  };
  let looking = false;
  async function look(asked) {
    if (looking) return;
    looking = true;
    try {
      const { accounts } = await atlas.helper.call("usage", {}, { timeout: 30 });
      const warn = Number(atlas.plugin.settings.warn ?? 80);
      const sessions = accounts.flatMap((a) => a.limits.filter((l) => !l.weekly).map((l) => ({ a, l })));
      sessions.sort((x, y) => y.l.percent - x.l.percent);
      const top = sessions.find((s) => s.a.current) ?? sessions[0];
      const many = accounts.length > 1;
      const lines = accounts.map((a) => a.error ? `${a.name}: ${a.error}` : `${a.current && many ? "▸ " : ""}${a.name}: ${a.limits.map((l) => `${l.label} ${Math.round(l.percent)} %${when(l.resets_at) ? ` (${when(l.resets_at)})` : ""}`).join(" · ") || "no limits reported"}${a.credits ? " · usage credits on" : ""}${a.stale ? ` · as of ${a.stale} min ago` : ""}`);
      if (!top) cell.set(accounts.some((a) => a.error) ? "Claude ?" : "Claude", lines.join("\n") || "No Claude account found on this computer");
      else cell.set(`${top.l.percent >= warn ? "⚠ " : ""}Claude ${Math.round(top.l.percent)} %${many ? ` · ${top.a.name}` : ""}`, lines.join("\n"));
      for (const { a, l } of sessions) if (a.current) announce(a, l, warn);
      if (asked) atlas.toast("Claude usage", lines.join("\n"));
    } catch (e) {
      cell.set("Claude ?", `Usage not read: ${e.message ?? e}`);
    } finally { looking = false; }
  }
  atlas.registerCommand({ id: "show", title: "Claude: show usage", run: () => void look(true) });
  const every = Math.max(0, Number(atlas.plugin.settings.every ?? 2));
  const first = setTimeout(() => void look(false), 3000);
  const timer = every > 0 ? setInterval(() => void look(false), every * 60_000) : null;
  return () => { clearTimeout(first); if (timer) clearInterval(timer); };
}
