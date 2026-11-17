#!/usr/bin/env node
// The plugins the phone app carries (docs/guides/ANDROID.md, "Plugins bundled in the app"): every plugin of
// plugins/stable and plugins/beta made for the phone, its run-time files only, packed by build-apk.sh as the APK's
// `plugins/<id>/…` assets. The app brings a folder vault's older copies up to them (plugin_install::sync_bundled).
//   node scripts/dev/bundle-plugins.mjs list           → the ids it would pack, one per line
//   node scripts/dev/bundle-plugins.mjs copy <dir>     → <dir>/plugins/<id>/… (the folder is emptied first)
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { plugins, shippedFiles } from "./plugin-files.mjs";

const log = (m) => console.error(`[bundle-plugins] ${m}`);

/** Not needed on the phone besides the sources every copy leaves out: the native side's Java (compiled into the app
 *  by native-plugins.sh), desktop engines, tests and TypeScript configs. */
const PHONE_SKIP = /^(android|bin|tests?)\/|(^|\/)[^/]*\.test\.[cm]?[jt]s$|(^|\/)tsconfig\.json$|(^|\/)node_modules\//;

/** The tables of a plugin.toml: { "": top-level lines, "android": …, "platforms": …, "platforms.android": … }, each
 *  its lines without comments. Enough for the three keys read here; the core reads the manifest for real. */
function tables(text) {
  const out = { "": [] };
  let at = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const t = line.match(/^\[([^\]]+)\]$/);
    if (t) out[(at = t[1].trim())] ??= [];
    else if (line && !line.startsWith("#")) out[at].push(line);
  }
  return out;
}

/** Whether a plugin runs on the phone, as plugins.rs `platforms_of` decides: `[platforms] android` says so unless it
 *  is "no"; unsaid, `phone = true` — or an `[android]` table (a native plugin is made for the phone). */
export function forPhone(text) {
  const t = tables(text);
  const said =
    t.platforms?.map((l) => l.match(/^android\s*=\s*(?:"([a-z]+)"|\{.*support\s*=\s*"([a-z]+)")/)).find(Boolean) ??
    t[""].map((l) => l.match(/^platforms\.android(?:\.support)?\s*=\s*"([a-z]+)"/)).find(Boolean);
  const level = said ? (said[1] ?? said[2]) : t["platforms.android"]?.map((l) => l.match(/^support\s*=\s*"([a-z]+)"/)).find(Boolean)?.[1];
  if (level) return level !== "no";
  return t[""].some((l) => /^phone\s*=\s*true$/.test(l)) || "android" in t;
}

/** The plugins the app carries, each with the files it carries. */
export function bundled() {
  return plugins()
    .filter((p) => forPhone(readFileSync(join(p.dir, "plugin.toml"), "utf8")))
    .map((p) => ({ ...p, files: shippedFiles(p, PHONE_SKIP) }));
}

function copy(dest) {
  const out = join(dest, "plugins");
  rmSync(out, { recursive: true, force: true });
  let n = 0;
  for (const p of bundled()) {
    for (const f of p.files) {
      mkdirSync(dirname(join(out, p.id, f)), { recursive: true });
      copyFileSync(join(p.dir, f), join(out, p.id, f));
      n++;
    }
    log(`${p.id} (${p.tier}): ${p.files.length} files`);
  }
  log(`${n} files of the phone's plugins in ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, dir] = process.argv.slice(2);
  if (cmd === "list") for (const p of bundled()) console.log(p.id);
  else if (cmd === "copy" && dir) copy(dir);
  else {
    console.error("usage: bundle-plugins.mjs list | copy <dir>");
    process.exit(2);
  }
}
