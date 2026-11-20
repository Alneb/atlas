#!/usr/bin/env node
// The release tag, annotated with the version's notes from docs/CHANGELOG.md (publish/README.md, "A release"):
//   node scripts/dev/release-tag.mjs <x.y.z> [--force] [--print]
// The tag goes on `public` (the commit GitHub gets) and its message is "Atlas x.y.z", a blank line, then the
// changelog's section for that version; release.yml makes that body the GitHub release's text.
// --force: replace a local tag of that name (a tag already pushed then needs `git push --force github vX`).
// --print: only show the message, tagging nothing.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--"));
const force = args.includes("--force");
const print = args.includes("--print");
const say = (line) => console.log(`[tag] ${line}`);
const fail = (why) => { console.error(`[tag] ${why}`); process.exit(1); };
const git = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8" }).trim();

if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail("usage: release-tag.mjs <x.y.z> [--force] [--print]");

/** The changelog's section for `v`: the lines under `## [v]` up to the next `## ` heading, trimmed. */
function notes(v) {
  const lines = readFileSync(join(repo, "docs/CHANGELOG.md"), "utf8").split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${v}]`));
  if (start < 0) fail(`docs/CHANGELOG.md has no "## [${v}]" section`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
  if (!body) fail(`the "## [${v}]" section of docs/CHANGELOG.md is empty`);
  return unwrap(body);
}

/** `md` with each paragraph and list item on one line: GitHub shows a release text's single line breaks as breaks, so
 *  the changelog's wrapped lines came out ragged. A line starts anew after a blank line, as a heading, list item,
 *  table row or code fence, and after a heading, table row or fence. */
function unwrap(md) {
  const starts = (l) => /^\s*([-*+]|\d+\.)\s|^\s*(#|\||```)/.test(l);
  const closed = (l) => /^\s*(#|\||```)/.test(l);
  const out = [];
  for (const line of md.split("\n")) {
    const prev = out.at(-1);
    if (line.trim() && prev?.trim() && !starts(line) && !closed(prev)) out[out.length - 1] = `${prev.trimEnd()} ${line.trim()}`;
    else out.push(line);
  }
  return out.join("\n");
}

/** What each of a release's files is, after its notes: a release carries some fifty, three of them APKs. */
const WHICH_FILE = `### Which file
- **Linux**: \`atlas.flatpak\` (\`flatpak install --user atlas.flatpak\`; at its first start it puts \`atlas\` and \`atlas-capture\` in \`~/.local/bin\`), the \`.AppImage\`, or the \`.deb\` / \`.rpm\`.
- **macOS** (Apple silicon): the \`.dmg\`. **Windows**: the \`-setup.exe\`. Neither is signed yet.
- **Android**: \`atlas.apk\` (the full app), \`atlas-boox.apk\` (the same app tuned for Boox e-ink and its pen), \`atlas-capture.apk\` (only the capture box).
- \`atlas\`, \`atlas-app\`, \`atlas-capture\`: the bare Linux x86-64 programs (the CLI and core, the desktop app, the capture box), for a server or a hand install.
- \`atlas-plugin-*.tar.gz\` and \`plugins.json\`: the plugins, which Atlas installs itself from **Install a plugin**.`;

const message = `Atlas ${version}\n\n${notes(version)}\n\n${WHICH_FILE}\n`;
if (print) { process.stdout.write(message); process.exit(0); }

// the tag names a release of what public holds: its version must be this one
const onPublic = git("show", "public:Cargo.toml").match(/^\[workspace\.package\][^[]*?^version = "([^"]+)"/m)?.[1];
if (onPublic !== version) fail(`public's Cargo.toml says ${onPublic ?? "no version"}, not ${version}: port the release commit first`);

const tag = `v${version}`;
const exists = git("tag", "-l", tag) === tag;
if (exists && !force) fail(`${tag} exists; --force replaces it`);

const dir = mkdtempSync(join(tmpdir(), "atlas-tag-"));
try {
  const file = join(dir, "message");
  writeFileSync(file, message);
  // verbatim: the default cleanup would drop the changelog's "### Added" lines as comments
  git("tag", "-a", ...(force ? ["-f"] : []), "--cleanup=verbatim", "-F", file, tag, "public");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
say(`${exists ? "replaced" : "made"} ${tag} on public (${git("rev-parse", "--short", "public")}), ${message.split("\n").length} lines of notes`);
say(`send it: git push github ${exists ? "--force " : ""}${tag}`);
