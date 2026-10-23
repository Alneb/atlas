// copyparty — your copyparty servers in Atlas's explorer (docs/guides/PLUGIN-API.md, `atlas.files.source`). All through
// copyparty's own HTTP API with atlas.fetch (the core makes the request: no CORS, the password never in the page):
// `?ls` lists a folder, a GET fetches a file into its local copy (.atlas/remote/copyparty/<server>/<path>, which the
// explorer opens in the editor or a viewer), a PUT writes one back, POST `?move=` / `?delete` / act=mkdir change them.
// A folder is deleted only when empty: copyparty's own delete takes everything inside, and nothing goes to a trash.
// Thumbnails (the explorer's Thumbnails view) are the server's own, `?th=j`.
export function register(atlas) {
  const servers = () => (Array.isArray(atlas.plugin.settings.servers) ? atlas.plugin.settings.servers : []).filter((s) => s?.name && s?.url);
  const server = (name) => {
    const s = servers().find((x) => x.name === name);
    if (!s) throw new Error(`no copyparty server “${name}” (Settings → copyparty)`);
    return { ...s, url: s.url.trim().replace(/\/+$/, "") };
  };
  const enc = (vpath) => vpath.split("/").map(encodeURIComponent).join("/");
  const abs = (p) => (p.startsWith("/") ? p : `/${p}`);
  const url = (name, vpath, query = "") => `${server(name).url}${enc(abs(vpath))}${query}`;
  // copyparty names a move's target from its own root: the configured address may be a folder of it (…/hdd1/Physics)
  const rootPath = (name) => { try { return decodeURIComponent(new URL(server(name).url).pathname).replace(/\/+$/, ""); } catch { return ""; } };
  const secret = (name) => `servers.${name}.password`;
  const parentOf = (p) => p.replace(/\/+$/, "").replace(/\/[^/]*$/, "") || "/";
  const baseName = (p) => p.replace(/\/+$/, "").split("/").pop();
  const plain = (t) => t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

  async function call(name, vpath, query = "", init = {}) {
    const pw = (await atlas.secrets.has(secret(name))) ? { pw: { secret: secret(name) } } : {};
    const r = await atlas.fetch(url(name, vpath, query), { timeout: 120, ...init, headers: { ...pw, ...init.headers } });
    if (r.status === 401 || r.status === 403) throw new Error(`${name}: not allowed (${r.status}) — a password in Settings → copyparty, or the VPN?`);
    if (!r.ok) throw new Error(`${name}: ${r.status} ${plain(await r.text())}`);
    return r;
  }
  const nameOf = (href) => { const h = href.split("?")[0].replace(/\/+$/, ""), last = h.slice(h.lastIndexOf("/") + 1); try { return decodeURIComponent(last); } catch { return last; } };
  async function ls(name, vpath) {
    const r = await call(name, abs(vpath).replace(/\/*$/, "/"), "?ls&dots", { headers: { accept: "application/json" } });
    let j;
    try { j = await r.json(); } catch { throw new Error(`${name}: ${vpath} did not answer with a folder listing (a sign-in page in front of it, or a volume that serves HTML?)`); }
    const entry = (e, kind) => ({ name: e.name ?? nameOf(e.href ?? ""), kind, size: kind === "file" ? e.sz : undefined, modified: e.ts });
    return [...(j.dirs ?? []).map((e) => entry(e, "dir")), ...(j.files ?? []).map((e) => entry(e, "file"))].filter((e) => e.name && e.name !== "." && e.name !== "..");
  }
  const stat = async (name, path) => (await ls(name, parentOf(path))).find((e) => e.name === baseName(path)) ?? null;

  // folders seen before show at once from a cache kept between runs, the server's answer refreshing it behind;
  // what a write checks (stat) always asks the server, and a change here drops the folders it touched
  const LISTS = "atlas.copyparty.lists", MAX_LISTS = 400;
  const lists = (() => { try { return JSON.parse(localStorage.getItem(LISTS) ?? "{}"); } catch { return {}; } })();
  // written once listing pauses: serialising every kept folder after each one froze the page through a walk of a hundred
  // (the books library over the server)
  let keepTimer = 0;
  const keepLists = () => {
    clearTimeout(keepTimer);
    keepTimer = setTimeout(() => {
      const keys = Object.keys(lists);
      if (keys.length > MAX_LISTS) for (const k of keys.sort((a, b) => lists[a].at - lists[b].at).slice(0, keys.length - MAX_LISTS)) delete lists[k];
      try { localStorage.setItem(LISTS, JSON.stringify(lists)); } catch { /* full: kept for this run */ }
    }, 2000);
  };
  const listKey = (name, vpath) => `${name}\n${abs(vpath).replace(/\/*$/, "/")}`;
  const forget = (name, ...paths) => { for (const p of paths) delete lists[listKey(name, p)]; keepLists(); };
  // a folder's first look in this run: the kept listing, marked stale (the explorer asks again at once); every later
  // look — the explorer's own refresh, F5 — the server's
  const asked = new Set();
  async function cachedLs(name, vpath) {
    const key = listKey(name, vpath), hit = lists[key];
    if (hit && !asked.has(key)) { asked.add(key); return { entries: hit.entries, stale: true }; }
    asked.add(key);
    const entries = await ls(name, vpath);
    lists[key] = { at: Date.now(), entries };
    keepLists();
    return { entries };
  }

  // thumbnails fetched before: (server, path) → the cached file (null: the server has none), written once fetching pauses
  const THUMBS = "atlas.copyparty.thumbs";
  const thumbs = (() => { try { return JSON.parse(localStorage.getItem(THUMBS) ?? "{}"); } catch { return {}; } })();
  let thumbTimer = 0;
  const keepThumbs = () => { clearTimeout(thumbTimer); thumbTimer = setTimeout(() => { try { localStorage.setItem(THUMBS, JSON.stringify(thumbs)); } catch { /* kept for this run */ } }, 2000); };

  // each local copy → the file it came from, as last seen there (its date and size): a save over a newer version is asked first
  const KEY = "atlas.copyparty.copies";
  const copies = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } })();
  const remember = (local, seen) => { copies[local] = seen; try { localStorage.setItem(KEY, JSON.stringify(copies)); } catch { /* kept for this run */ } };
  const put = (name, path, local, replace) => call(name, path, replace ? "?replace" : "", { method: "PUT", bodyFile: local, timeout: 300 });

  if (!atlas.files) return; // an Atlas older than the shared explorer: nothing to add to
  atlas.files.source({
    title: "copyparty", icon: "server",
    places: async () => servers().map((s) => ({ id: s.name, title: s.name, detail: s.url })),
    list: async (name, path) => { const at = path || "/"; return { path: at, ...(await cachedLs(name, at)) }; },
    local: async (name, path) => {
      const e = await stat(name, path);
      if (!e) throw new Error(`${path} is not on ${name} (any more)`);
      const r = await call(name, path, "", { saveTo: `${name}/${path.replace(/^\/+/, "")}`, saveIn: "remote", timeout: 300 });
      remember(r.saved, { server: name, path, ts: e.modified, sz: e.size });
      return r.saved;
    },
    save: async (local, force) => {
      const seen = copies[local];
      if (!seen) throw new Error(`${local} is not a copy of a copyparty file: open it again from the explorer`);
      const now = await stat(seen.server, seen.path);
      if (now && !force && (now.modified !== seen.ts || now.size !== seen.sz)) return { changed: `${seen.path} changed on ${seen.server} since it was opened here` };
      await put(seen.server, seen.path, local, true);
      forget(seen.server, parentOf(seen.path));
      const after = await stat(seen.server, seen.path);
      remember(local, { ...seen, ts: after?.modified, sz: after?.size });
      return { saved: `${seen.server}:${seen.path}` };
    },
    // the server's own thumbnail (`?th=j`: a JPEG of a picture, or of a video / PDF when the server has the tools for it),
    // kept in the plugin's cache; anything else (copyparty answers with an icon) shows the file's icon
    thumb: async (name, path) => {
      if (!/\.(png|jpe?g|gif|webp|avif|bmp|heic|tiff?|mp4|mkv|webm|mov|pdf)$/i.test(path)) return null;
      // made once: a thumbnail fetched before is the file kept in the cache (a library of 900 covers asked the server
      // for each one on every visit); a month later it is asked again
      const key = `${name}\n${path}`, kept = thumbs[key];
      if (kept && Date.now() - kept.at < 30 * 864e5 && (kept.saved === null || (await atlas.exists(kept.saved).catch(() => false)))) return kept.saved;
      const r = await call(name, path, "?th=j", { saveTo: `thumbs/${name}/${path.replace(/^\/+/, "")}.jpg` });
      const saved = (r.headers["content-type"] ?? "").startsWith("image/jpeg") ? r.saved : null; // else the server's icon
      thumbs[key] = { saved, at: Date.now() };
      keepThumbs();
      return saved;
    },
    mkdir: async (name, path) => {
      const b = `----atlas${Math.random().toString(36).slice(2)}`, field = (k, v) => `--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
      await call(name, parentOf(path).replace(/\/*$/, "/"), "", { method: "POST", headers: { "content-type": `multipart/form-data; boundary=${b}` }, body: `${field("act", "mkdir")}${field("name", baseName(path))}--${b}--\r\n` });
      forget(name, parentOf(path));
    },
    rename: async (name, from, to) => {
      if (await stat(name, to)) throw new Error(`${baseName(to)} already exists there`);
      await call(name, from, `?move=${encodeURIComponent(rootPath(name) + abs(to))}`, { method: "POST" });
      forget(name, parentOf(from), parentOf(to), from);
    },
    remove: async (name, path, dir) => {
      if (dir && (await ls(name, path)).length) throw new Error(`${baseName(path)} was not deleted: only an empty folder can be, from here`);
      await call(name, path, "?delete", { method: "POST" });
      forget(name, parentOf(path), path);
      return `Deleted ${baseName(path)} from ${name}.`;
    },
    upload: async (name, local, dir, replace) => {
      const to = `${abs(dir).replace(/\/+$/, "")}/${baseName(local)}`;
      if (!replace && (await stat(name, to))) return "exists";
      await put(name, to, local, replace);
      forget(name, dir);
      return "done";
    },
  });
}
