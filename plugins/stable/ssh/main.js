// SSH — the hosts of your ssh config (docs/guides/PLUGIN-API.md). The helper (engine/, atlas-ssh) reads them; each
// session gets a terminal tab of its own (atlas.terminal.open), so ssh asks for a password or a key's
// passphrase there, where the user types it — Atlas never sees one.
//   ```view
//   type: ssh.hosts
//   ```
// Commands: "SSH: connect to…", "SSH: run a command on…", "SSH: mount…", "SSH: browse files on…" (Atlas's
// explorer: the hosts are a file source, sftp over the same connection); a file's menu: "Copy to host…".
// an empty state or an error in Atlas's shared look (ui base.css .atlas-notice / .atlas-btn): the reason and the way out
const notice = (text, { error = false, actions = [] } = {}) => {
  const box = document.createElement("div");
  box.className = `atlas-notice${error ? " error" : ""}`;
  box.append(Object.assign(document.createElement("span"), { textContent: String(text).replace(/^POST \S+: \d+ [^:]*: plugin [\w-]+: (\w+: )?/, "").replace(/^(Runtime|Value)Error: /, "") }));
  if (actions.length) {
    const row = Object.assign(document.createElement("div"), { className: "actions" });
    for (const [label, run, primary] of actions) row.append(Object.assign(document.createElement("button"), { className: `atlas-btn${primary ? " primary" : ""}`, textContent: label, onclick: (e) => { e.stopPropagation(); void run(); } }));
    box.append(row);
  }
  return box;
};
const quiet = (text) => Object.assign(document.createElement("div"), { className: "atlas-empty", textContent: text });
const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };
/** An argument quoted for the terminal's shell (POSIX, PowerShell or cmd): the app's own rule (`atlas.terminal.quote`,
 *  API 23); on an older app, POSIX quoting. `~` stays bare so the remote side expands it. */
const quoter = (atlas, shell) => (s) => (/^[\w@%+=:,./~-]+$/.test(s) ? s : atlas.terminal.quote ? atlas.terminal.quote(String(s), shell) : `'${String(s).replace(/'/g, `'\\''`)}'`);

export function register(atlas) {
  // the hosts in Atlas's explorer (the helper's sftp over the shared connection): a file opens from a copy in
  // .atlas/remote/ssh/<host>/, and each save of it goes back (refused when the file there changed meanwhile)
  const files = (method, params) => atlas.helper.call(`files_${method}`, { settings: atlas.plugin.settings, ...params }, { timeout: 600 });
  const done = (r) => { if (r?.waiting_for_login) throw new Error(r.message); return r; };
  atlas.files?.source({
    title: "SSH", icon: "terminal",
    places: async () => (await atlas.helper.call("status", { settings: atlas.plugin.settings })).map((h) => ({ id: h.name, title: h.name, detail: detail(h), up: h.up })),
    onPlaces: (fn) => atlas.helper.on("connections", fn),
    list: async (host, path) => {
      const r = await files("list", { host, path });
      if (r.waiting_for_login) return { waiting: r.message };
      if (r.not_dir) return { file: path };
      return { path: r.path, entries: r.entries.map((e) => ({ name: e.name, kind: e.type, size: e.size, modified: e.mtime ?? undefined })) };
    },
    local: async (host, path) => done(await files("edit", { host, path })).local,
    save: async (local, force) => {
      const r = await files("save", { host: local.slice(".atlas/remote/ssh/".length).split("/")[0], local, force });
      return r.waiting_for_login ? { waiting: r.message } : r.changed ? { changed: r.message } : { saved: r.saved };
    },
    mkdir: async (host, path) => { done(await files("mkdir", { host, path })); },
    rename: async (host, from, to) => { done(await files("rename", { host, from, to })); },
    remove: async (host, path, dir) => { done(await files("delete", { host, path, dir })); return `Deleted ${path.split("/").pop()} from ${host}.`; },
    upload: async (host, local, folder, replace) => (done(await files("put", { host, local, folder, replace })).exists ? "exists" : "done"),
    download: async (host, path, folder, dir) => done(await files("get", { host, path, folder, dir })).saved,
  });
  const opts = () => String(atlas.plugin.settings.options ?? "").trim();
  const hosts = async () => { const h = await atlas.helper.call("hosts", { settings: atlas.plugin.settings }); return Array.isArray(h) ? h : []; };
  // scp / sshfs name a config host as it is (ssh applies its config), an extra one as user@host[:port]
  const scpTarget = (h) => (h.from === "settings" ? { port: h.port ? `-P ${String(h.port).replace(/\D/g, "")} ` : "", host: h.user ? `${h.user}@${h.hostname}` : h.hostname } : { port: "", host: h.name });
  // the helper builds every ssh command line, so terminals and Claude's sessions share one connection per host
  const sshLine = (h, command) => atlas.helper.call("command", { host: h.name, command, settings: atlas.plugin.settings });
  const detail = (h) => [h.user && `${h.user}@`, h.hostname ?? "", h.port && `:${h.port}`].filter(Boolean).join("") || undefined;

  // Connect logs in and no more: the login tab (only when a passphrase / 2FA is asked) closes once connected; a shell
  // is opened when wanted (Shell, the status bar, the terminal's "+" menu)
  const connect = async (h) => {
    const r = await atlas.helper.call("connect", { host: h.name, settings: atlas.plugin.settings });
    if (r?.connected) atlas.toast(`SSH: connected to ${h.name}`, "Files, Shell and Claude's sessions need no password now.", "success");
  };
  // a terminal on a host (the "+" menu): a shell there, logging in in that tab when needed
  const terminalOn = async (h) => atlas.terminal.open(await sshLine(h), h.name);
  const runOn = async (h, command) => atlas.terminal.open(await sshLine(h, command), `${h.name}: ${command}`);
  // the user asked (Connect, Files) and the host wants a passphrase or 2FA: a tab of its own where they answer
  const loginTab = (d) => atlas.terminal.open(d.command, `${d.host}: log in`);
  atlas.helper.on("login", (d) => { atlas.toast(`SSH: log in to ${d.host}`, "Answer the passphrase / 2FA in the new terminal tab."); void loginTab(d); });
  // something in the background (an agent's session, another plugin's polling) needs it: offered once, never a tab
  // popping up by itself; the cell goes when the host connects
  const offers = new Map();
  atlas.helper.on("login_needed", (d) => {
    if (offers.has(d.host)) return;
    const item = atlas.shell.statusItem({ id: `login-${d.host}`, text: "", run: () => { void loginTab(d); } });
    item.set(`ssh: log in to ${d.host}`, `${d.why} needs ${d.host}: click to log in (passphrase / 2FA)`);
    offers.set(d.host, item);
    atlas.toast(`SSH: ${d.host} needs a login`, `For ${d.why}. Click "ssh: log in to ${d.host}" in the status bar when you are ready.`);
  });
  // an agent's ssh_terminal: a tab for the user, then the answer the helper waits for
  atlas.helper.on("tab", async (d) => {
    let ok = false;
    try { ok = await atlas.terminal.open(d.command, d.title); } finally { await atlas.helper.call("tab_opened", { id: d.id, ok }); }
  });

  // the hosts with a live shared connection (the helper's watcher says when that changes): a shell
  // on one opens at once, no password — from the status bar, a terminal tab's menu or the palette
  let up = [], cell = null;  // the cell exists only while a host is connected
  const show = (list) => {
    up = Array.isArray(list) ? list : [];
    for (const h of up) { offers.get(h)?.remove(); offers.delete(h); }
    if (!up.length) { cell?.remove(); cell = null; return; }
    cell ??= atlas.shell.statusItem({ id: "connections", text: "", run: () => openShell() });
    cell.set(`ssh: ${up.join(", ")}`, `Connected: ${up.join(", ")} (click: open a shell, no password)`);
  };
  atlas.helper.on("connections", show);
  void atlas.helper.call("connections", { settings: atlas.plugin.settings }).then(show, () => {});
  const shellOn = async (name) => atlas.terminal.open(await atlas.helper.call("command", { host: name, settings: atlas.plugin.settings }), name);
  const openShell = () => (up.length === 1 ? shellOn(up[0]) : atlas.pick({
    placeholder: up.length ? "Open a shell on…" : "No ssh host is connected", tag: "SSH", icon: "terminal",
    items: up.map((n) => ({ value: n, title: n, detail: "connected" })), onpick: (n) => shellOn(n),
  }));
  atlas.registerCommand({ id: "shell", title: "SSH: open a shell on a connected host…", run: () => openShell() });
  atlas.shell.menu("tab", (t) => (t.kind === "terminal" ? up.map((n) => ({ label: `Open ssh on ${n}`, icon: "terminal", hint: "connected", run: () => shellOn(n) })) : []));
  // the terminal's "+" menu: every host, connected ones first (menus are built synchronously: a cached list)
  let known = [];
  const refreshHosts = () => void hosts().then((h) => { known = h; }, () => {});
  refreshHosts();
  try {
    atlas.shell.menu("terminal", () => {
      refreshHosts();
      const rank = (h) => (up.includes(h.name) ? 0 : 1);
      return [...known].sort((a, b) => rank(a) - rank(b)).map((h) => ({ label: `SSH: ${h.name}`, icon: "terminal", detail: up.includes(h.name) ? "connected, no password" : detail(h), run: () => terminalOn(h) }));
    });
  } catch { /* an Atlas older than the "terminal" menu place: the palette and the side tool still connect */ }
  // what the terminal's shell reads: scp is there on Windows too (OpenSSH), sshfs and `tail` only on a POSIX system
  const shell = async () => (atlas.terminal.shell ? atlas.terminal.shell() : "posix");
  const copyTo = async (h, path) => {
    const quote = quoter(atlas, await shell()), t = scpTarget(h), dir = String(atlas.plugin.settings.remote_dir ?? "~").trim() || "~";
    return atlas.terminal.run(`scp ${t.port}${opts() ? `${opts()} ` : ""}${quote(path)} ${quote(`${t.host}:${dir.replace(/\/?$/, "/")}`)}`);
  };
  const mount = async (h) => {
    const sh = await shell();
    if (sh !== "posix") return atlas.toast("SSH: no sshfs here", `Mounting needs sshfs, which this system's terminal (${sh}) does not have: "SSH: browse files on…" shows ${h.name}'s files in the explorer.`, "error");
    const quote = quoter(atlas, sh), t = scpTarget(h), dir = `${String(atlas.plugin.settings.mounts ?? "~/mnt").trim().replace(/\/+$/, "")}/${h.name.replace(/[^\w.-]/g, "_")}`;
    return atlas.terminal.run(`mkdir -p ${quote(dir)} && sshfs ${t.port ? t.port.replace("-P", "-p") : ""}${quote(`${t.host}:`)} ${quote(dir)} && echo "mounted on ${dir}"`);
  };

  // one chooser for every action: pick a host, then do `then` with it
  const chooseHost = (placeholder, then) => atlas.pick({
    placeholder, tag: "SSH", icon: "terminal",
    items: async () => (await hosts()).map((h) => ({ value: h.name, title: h.name, detail: detail(h) })),
    onpick: async (name) => { const h = (await hosts()).find((x) => x.name === name); if (h) await then(h); },
  });
  atlas.registerCommand({ id: "connect", title: "SSH: connect to…", run: () => chooseHost("Connect to…", connect) });
  atlas.registerCommand({ id: "run", title: "SSH: run a command on…", run: () => chooseHost("Run a command on…", (h) => atlas.pick({
    placeholder: `A command to run on ${h.name}…`, tag: h.name, items: [], typed: (t) => `Run “${t}” on ${h.name}`, onpick: (c) => runOn(h, c),
  })) });
  atlas.registerCommand({ id: "mount", title: "SSH: mount a host's files (sshfs)…", run: () => chooseHost("Mount…", mount) });
  // a host's files: in Atlas's explorer (an Atlas from before 2026-10-16 has none: it says so)
  const browse = (h) => (atlas.files ? atlas.files.explore({ place: h.name }) : atlas.toast("SSH: no explorer", "This Atlas is older than the shared explorer: update Atlas (docs/scripts/auto-install.sh).", "error"));
  atlas.registerCommand({ id: "files", title: "SSH: browse files on… (SFTP)", run: () => chooseHost("Browse the files of…", browse) });
  const watchSession = () => atlas.pick({
    placeholder: "Follow a session's log…", tag: "SSH", icon: "terminal",
    items: async () => ((await atlas.helper.call("sessions", {})) ?? []).map((s) => ({ value: s.log, title: s.session, detail: `${s.host}${s.running ? " · running" : ""}` })),
    onpick: async (log) => { const sh = await shell(); return atlas.terminal.open(sh === "posix" ? `tail -n 200 -f ${quoter(atlas, sh)(log)}` : `powershell -NoProfile -Command Get-Content -Tail 200 -Wait ${quoter(atlas, "powershell")(log)}`, "ssh log"); },
  });
  atlas.registerCommand({ id: "watch", title: "SSH: watch a session (Claude's too)…", run: watchSession });
  atlas.shell.menu("file", (t) => (t.path && !t.dir ? [{ label: "Copy to host…", icon: "arrow-up", run: () => chooseHost(`Copy ${t.path} to…`, (h) => copyTo(h, t.path)) }] : []));

  atlas.shell.sideTool({ id: "hosts", title: "SSH", icon: "server", mount: (host) => atlas.mountBlock(host, { type: "ssh.hosts" }) });
  // The panel: one card per host, connected ones first. The name and address on top (never squeezed by the buttons),
  // what the connection is doing under it, the actions on their own wrapping line: the main one (Shell / Connect) is
  // also a click on the card; the rarer ones (run, mount, disconnect…) are under "⋯". Redrawn when a connection comes
  // or goes. (The buttons used to push the names out.)
  const ago = (t) => { const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60)); return m < 1 ? "just now" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
  const stays = (persist) => (/^(yes|0)$/i.test(persist) ? "kept until you disconnect" : /^no$/i.test(persist) ? "closes with its last tab" : `closes ${persist} after its last tab`);
  const small = "font-size: calc(12px * var(--ui-scale, 1)); padding: 1px 8px";
  /** A button that says it is busy while `run` runs, and tells what failed. */
  const button = (label, title, run, { primary = false, busy } = {}) => {
    const b = Object.assign(document.createElement("button"), { className: `atlas-btn${primary ? " primary" : ""}`, textContent: label, title });
    b.style.cssText = small;
    b.onclick = async (e) => {
      e.stopPropagation();
      if (b.disabled) return;
      b.disabled = true; if (busy) b.textContent = busy;
      try { await run(); } catch (err) { atlas.toast(`SSH: ${label} failed`, String(err?.message ?? err), "error"); }
      finally { b.disabled = false; b.textContent = label; }
    };
    return b;
  };
  atlas.registerBlock("ssh.hosts", (host) => {
    let gone = false;
    const disconnect = async (h) => { await atlas.helper.call("disconnect", { host: h.name, settings: atlas.plugin.settings }); void draw(); };
    const more = (h) => atlas.pick({
      placeholder: `${h.name}…`, tag: "SSH", icon: "terminal",
      items: [
        { value: "run", title: "Run a command…", detail: "in a new terminal tab" },
        { value: "files", title: "Browse files", detail: "in the explorer (SFTP)" },
        { value: "mount", title: "Mount (sshfs)", detail: `under ${String(atlas.plugin.settings.mounts ?? "~/mnt")}` },
        { value: "watch", title: "Watch a session's log", detail: "Claude's sessions too" },
        ...(h.up ? [{ value: "disconnect", title: "Disconnect", detail: "its tabs and sessions end too" }] : [{ value: "connect", title: "Connect", detail: "log in; no shell is left open" }]),
        { value: "settings", title: "SSH settings…", detail: "hosts, options, how long connections stay" },
      ],
      onpick: (v) => ({
        run: () => atlas.pick({ placeholder: `A command to run on ${h.name}…`, tag: h.name, items: [], typed: (t) => `Run “${t}” on ${h.name}`, onpick: (c) => runOn(h, c) }),
        files: () => browse(h), mount: () => mount(h), watch: watchSession,
        disconnect: () => disconnect(h), connect: () => connect(h).then(() => draw()), settings: () => atlas.plugin.openSettings(),
      })[v]?.(),
    });
    const card = (h) => {
      const main = h.up ? () => shellOn(h.name) : () => connect(h).then(() => draw());
      const box = el("div", `display: flex; flex-direction: column; gap: 3px; padding: 7px 8px; margin: 2px 0; border-radius: var(--radius-sm); cursor: pointer; ${h.up ? "background: var(--bg-hover)" : ""}`);
      box.title = h.up ? `${h.name}: click for a shell (no password)` : `${h.name}: click to connect`;
      box.onmouseenter = () => { if (!h.up) box.style.background = "var(--bg-hover)"; };
      box.onmouseleave = () => { if (!h.up) box.style.background = ""; };
      box.onclick = () => void Promise.resolve(main()).catch((e) => atlas.toast(`SSH: ${h.name}`, String(e?.message ?? e), "error"));
      const top = el("div", "display: flex; gap: 7px; align-items: baseline; min-width: 0");
      top.append(el("span", `width: 7px; height: 7px; border-radius: 50%; flex: none; align-self: center; background: ${h.up ? "var(--green)" : "var(--border-strong)"}`),
        el("span", "flex: none; max-width: 100%; color: var(--text); font-family: var(--font-mono); font-weight: 600; overflow-wrap: anywhere", h.name),
        el("span", "flex: 1; min-width: 0; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap", detail(h) ?? ""));
      box.append(top);
      if (h.up) {
        const info = [`up ${ago(h.since)}`, stays(h.persist)];
        if (h.sessions.length) info.push(`Claude: ${h.sessions.length} session${h.sessions.length > 1 ? "s" : ""}`);
        box.append(el("div", "color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); padding-left: 14px", info.join(" · ")));
      }
      const actions = el("div", "display: flex; flex-wrap: wrap; gap: 4px; padding-left: 14px; margin-top: 2px");
      if (h.up) actions.append(button("Shell", `a shell on ${h.name}, no password (the shared connection)`, () => shellOn(h.name), { primary: true }));
      else actions.append(button("Connect", `log in to ${h.name} (a passphrase / 2FA in a tab that closes once connected); no shell is left open`, () => connect(h).then(() => draw()), { primary: true, busy: "Connecting…" }));
      actions.append(button("Files", `browse ${h.name}'s files (SFTP${h.up ? ", no password" : ": logs in first"})`, () => browse(h)),
        button("⋯", `more for ${h.name}: run a command, mount, ${h.up ? "disconnect" : "connect"}…`, () => more(h)));
      box.append(actions);
      return box;
    };
    const section = (title) => el("div", "font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); margin: 8px 0 4px", title);
    const draw = async () => {
      let list;
      try { list = await atlas.helper.call("status", { settings: atlas.plugin.settings }); }
      catch (e) { if (!gone) host.replaceChildren(notice(String(e.message ?? e), { error: true, actions: [["Try again", draw], ["Settings…", () => atlas.plugin.openSettings()]] })); return; }
      if (gone) return;
      if (!list.length) return host.replaceChildren(notice("No hosts yet: add some to ~/.ssh/config, or in this plugin's settings.", { actions: [["Add a host…", () => atlas.plugin.openSettings(), true]] }));
      const up = list.filter((h) => h.up), down = list.filter((h) => !h.up);
      const add = el("button", "margin: 8px 0 0 8px; padding: 0; border: 0; background: none; color: var(--text-faint); cursor: pointer; font-size: calc(12px * var(--ui-scale, 1))", "+ Add a host…");
      add.onclick = () => atlas.plugin.openSettings();
      host.replaceChildren(...(up.length ? [section(`Connected · ${up.length}`), ...up.map(card)] : []), ...(down.length ? [section(up.length ? "Other hosts" : "Hosts"), ...down.map(card)] : []), add);
    };
    host.replaceChildren(quiet("Reading the ssh config…"));
    void draw();
    const off = atlas.helper.on("connections", () => void draw());
    const tick = setInterval(() => void draw(), 60_000); // "up 12 min" stays true
    return () => { gone = true; off(); clearInterval(tick); };
  }, { title: "SSH hosts" });
}
