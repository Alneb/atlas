// The mirror under load, for real (docs/design/DESIGN-mirror-v2.md "Under load"): two isolated Syncthing instances
// (own homes, ports, no discovery; their watchers on), a server core on side B with the password sign-in, a desktop
// core on side A whose vault is mirrored to it. Two writers append to one note at once, one through each core, as the
// editor saves (read, add, PUT with base_mtime, retry on 409). Passes when no conflict copy appears, no line is lost and
// both copies end the same. Nothing touches the user's own Syncthing, vaults or Atlas settings.
//
//   node scripts/dev/mirror-stress.mjs [--control] [--lines 25] [--atlas target/debug/atlas] [--dir /tmp/mirror-stress]
//   --control: the desktop without the mirror (no leases) — expected to FAIL (a conflict copy, lines lost)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, realpathSync, openSync } from "node:fs";
import { join, relative } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CONTROL = process.argv.includes("--control");
const N = Number(arg("--lines", "25"));
const ATLAS = arg("--atlas", "target/debug/atlas");
const ROOT = arg("--dir", "/tmp/mirror-stress");
const ST = { A: { gui: 8421, listen: 22121 }, B: { gui: 8422, listen: 22122 } };
const SRV = 7821, DESK = 7822;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const kids = [];

async function st(n, method, path, body) {
  const r = await fetch(`http://127.0.0.1:${ST[n].gui}${path}`, { method, headers: { "X-API-Key": ST[n].key, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  return t.trim() ? JSON.parse(t) : null;
}

/** Both Syncthings idle with nothing left to fetch, a moment apart. */
async function settle(ms = 20000) {
  for (const n of "AB") await st(n, "POST", "/rest/db/scan?folder=vault");
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const busy = (await Promise.all([..."AB"].map((n) => st(n, "GET", "/rest/db/status?folder=vault")))).some((s) => s.state !== "idle" || s.needTotalItems);
    if (!busy) { await sleep(1500); if ((await Promise.all([..."AB"].map((n) => st(n, "GET", "/rest/db/status?folder=vault")))).every((s) => s.state === "idle")) return; }
    await sleep(500);
  }
}

async function syncthings() {
  for (const n of "AB") {
    const home = join(ROOT, `st${n}`), dir = join(ROOT, `dir${n}`);
    rmSync(home, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    spawnSync("syncthing", ["generate", `--home=${home}`], { stdio: "ignore" });
    const cfg = readFileSync(join(home, "config.xml"), "utf8");
    ST[n].key = /<apikey>([^<]+)<\/apikey>/.exec(cfg)[1];
    ST[n].id = /<device id="([^"]+)"/.exec(cfg)[1];
    kids.push(spawn("syncthing", ["serve", `--home=${home}`, "--no-browser", `--gui-address=127.0.0.1:${ST[n].gui}`],
      { env: { ...process.env, STNODEFAULTFOLDER: "1", STNOUPGRADE: "1" }, stdio: ["ignore", openSync(join(ROOT, `st${n}.log`), "w"), "inherit"] }));
  }
  for (const n of "AB") for (let i = 0; i < 60; i++) { try { await st(n, "GET", "/rest/system/ping"); break; } catch { await sleep(500); } }
  for (const n of "AB") {
    const o = n === "A" ? "B" : "A";
    await st(n, "PATCH", "/rest/config/options", { listenAddresses: [`tcp://127.0.0.1:${ST[n].listen}`], globalAnnounceEnabled: false, localAnnounceEnabled: false, relaysEnabled: false, natEnabled: false, urAccepted: -1, crashReportingEnabled: false });
    await st(n, "PUT", `/rest/config/devices/${ST[o].id}`, { deviceID: ST[o].id, name: o, addresses: [`tcp://127.0.0.1:${ST[o].listen}`] });
    // realistic: Syncthing's own watcher on, a short delay, a rescan now and then
    await st(n, "PUT", "/rest/config/folders/vault", { id: "vault", label: "vault", path: join(ROOT, `dir${n}`), devices: [{ deviceID: ST.A.id }, { deviceID: ST.B.id }], rescanIntervalS: 20, fsWatcherEnabled: true, fsWatcherDelayS: 1 });
  }
  for (let i = 0; i < 120; i++) { const c = (await st("A", "GET", "/rest/system/connections")).connections; if (Object.values(c).some((x) => x.connected)) return log("Syncthing pair connected"); await sleep(500); }
  throw new Error("the two Syncthings never connected");
}

/** An Atlas core's own home: its settings, vault list, sign-ins and server state, nothing of the user's. */
function homeEnv(name) {
  const home = join(ROOT, `home-${name}`);
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { recursive: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("ATLAS_")));
  return { ...env, HOME: home, XDG_CONFIG_HOME: `${home}/.config`, XDG_STATE_HOME: `${home}/.state`, XDG_CACHE_HOME: `${home}/.cache`, ATLAS_NO_BROWSER: "1",
    ATLAS_VAULTS: `${home}/vaults.toml`, ATLAS_SECRETS_DIR: `${home}/secrets`, ATLAS_SERVER_CONFIG: `${home}/server.toml`, ATLAS_SERVER_STATE: `${home}/server.json` };
}

function core(args, env, name) {
  kids.push(spawn(ATLAS, args, { env, stdio: ["ignore", openSync(join(ROOT, `${name}.log`), "w"), openSync(join(ROOT, `${name}.log`), "a")] }));
}

async function up(port) {
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/api/ui/build`); return; } catch { await sleep(200); } }
  throw new Error(`the core on ${port} never answered`);
}

/** Appends `who-i` N times as the editor saves; `pace`: the most it waits between lines (ms). */
async function writer(base, who, headers, out, pace) {
  const H = { "x-atlas": "1", "Content-Type": "application/json", ...headers };
  for (let i = 0; i < N; i++) {
    const t0 = Date.now();
    for (;;) {
      const g = await fetch(`${base}/api/file?path=notes/log.md`, { headers: H });
      if (g.ok) {
        const f = await g.json();
        const p = await fetch(`${base}/api/file`, { method: "PUT", headers: H, body: JSON.stringify({ path: "notes/log.md", text: `${f.text}- ${who}-${i}\n`, base_mtime: f.mtime }) });
        if (p.ok) break;
      }
      out.refused++;
      if (Date.now() - t0 > 90000) { out.gaveUp++; break; }
      await sleep(200 + Math.random() * 300);
    }
    await sleep(Math.random() * pace);
  }
}

function files(d) {
  const out = [];
  const walk = (p) => { for (const e of readdirSync(p)) { const f = join(p, e); if (e === ".stfolder" || e === ".atlas") continue; if (statSync(f).isDirectory()) walk(f); else if (!e.startsWith(".st")) out.push(relative(d, f)); } };
  walk(d);
  return out;
}

try {
  if (!existsSync(ATLAS)) throw new Error(`${ATLAS}: build it first (cargo build -p atlas)`);
  mkdirSync(ROOT, { recursive: true });
  await syncthings();
  const [a, b] = [join(ROOT, "dirA"), join(ROOT, "dirB")];
  for (const d of [a, b]) writeFileSync(join(d, ".stignore"), ".atlas/cache\n");
  mkdirSync(join(a, "notes"));
  writeFileSync(join(a, "notes/log.md"), "# Log\n");
  await settle(15000);
  if (!existsSync(join(b, "notes/log.md"))) throw new Error("the note did not sync first");

  const es = homeEnv("server");
  spawnSync(ATLAS, ["server", "password"], { input: "a long password\n", env: es });
  core(["serve", b, "--listen", `127.0.0.1:${SRV}`], es, "server");
  await up(SRV);
  const login = await fetch(`http://127.0.0.1:${SRV}/login`, { method: "POST", redirect: "manual", headers: { Origin: `http://127.0.0.1:${SRV}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "password=a+long+password&next=%2F" });
  const session = (login.headers.get("set-cookie") ?? "").split(";")[0];
  if (!session) throw new Error(`no session from the server's sign-in (${login.status})`);

  const ed = homeEnv("desktop");
  writeFileSync(ed.ATLAS_VAULTS, `[[vault]]\nname = "dirA"\npath = ${JSON.stringify(realpathSync(a))}\nlast_opened = 1\n${CONTROL ? "" : `mirror = "http://127.0.0.1:${SRV}/"\n`}`);
  core(["serve", a, "--port", String(DESK)], ed, "desktop");
  await up(DESK);
  const [name, value] = [session.slice(0, session.indexOf("=")), session.slice(session.indexOf("=") + 1)];
  const kept = await fetch(`http://127.0.0.1:${DESK}/api/signin/door`, { method: "POST", headers: { "x-atlas": "1", "Content-Type": "application/json" }, body: JSON.stringify({ host: "127.0.0.1", cookies: [{ name, value, domain: "127.0.0.1", host_only: true, path: "/", secure: false }] }) });
  log(`cores up (${CONTROL ? "control: no mirror" : "mirrored"}); the desktop keeps the server's sign-in: ${kept.status}`);

  const stats = { desktop: { refused: 0, gaveUp: 0 }, server: { refused: 0, gaveUp: 0 } };
  const t0 = Date.now();
  await Promise.all([writer(`http://127.0.0.1:${DESK}`, "desk", {}, stats.desktop, 400), writer(`http://127.0.0.1:${SRV}`, "srv", { Cookie: session }, stats.server, 3000)]);
  log(`writers done in ${Math.round((Date.now() - t0) / 1000)} s`, JSON.stringify(stats));
  await sleep(5000); await settle(30000); await sleep(5000); await settle(20000);

  const conflicts = [...new Set([...files(a), ...files(b)].filter((f) => f.includes("sync-conflict")))];
  const [ta, tb] = [readFileSync(join(a, "notes/log.md"), "utf8"), readFileSync(join(b, "notes/log.md"), "utf8")];
  const have = new Set(ta.split("\n"));
  const lost = ["desk", "srv"].flatMap((w) => Array.from({ length: N }, (_, i) => `- ${w}-${i}`)).filter((l) => !have.has(l));
  log("conflict copies:", JSON.stringify(conflicts), "| both sides the same:", ta === tb, `| lines kept: ${2 * N - lost.length} of ${2 * N}`);
  const pass = !conflicts.length && ta === tb && !lost.length;
  log(`RESULT ${CONTROL ? "control" : "mirror"}: ${pass ? "PASS" : "FAIL"}`);
  process.exitCode = pass ? 0 : 1;
} catch (e) {
  log("ERROR", e instanceof Error ? e.message : String(e));
  process.exitCode = 2;
} finally {
  for (const k of kids) k.kill("SIGTERM");
  await sleep(1500);
  log("stopped");
}
