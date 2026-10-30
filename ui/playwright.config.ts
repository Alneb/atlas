import { defineConfig } from "@playwright/test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

// A throwaway workspace, rebuilt on every run, served by the real `atlas` binary (UI embedded).
// Build the UI first (`npm run build`) — the server serves what was compiled into it.
// Overridable so concurrent runs (several people or agents in one checkout) never share a workspace.
// a shell started inside Atlas inherits ATLAS_UI_DIR: the tests would be served the installed UI, not the
// built one. Removed from process.env itself — Playwright gives the web server process.env plus `env`.
delete process.env.ATLAS_UI_DIR;
// a helper never opens the user's real browser from a test (the email plugin's sign-in, mail.py `open_browser`)
process.env.ATLAS_NO_BROWSER = "1";
// …nor puts a deleted file in the desktop Trash (files.rs `trash`): `.atlas/trash/` in the throwaway vault
process.env.ATLAS_VAULT_TRASH = "1";
export const WS = process.env.ATLAS_PW_WS ?? join(process.env.TMPDIR ?? tmpdir(), "atlas-ui-test-ws");
const PORT = Number(process.env.ATLAS_PW_PORT ?? 7720);
// the core runs locked (DESIGN-local-lock.md), as the phone's does: every request of the tests carries this run's key —
// a cookie in the browsers (pages, WebSockets), a header from the request fixture
// (in the environment: the config is read again in every worker, which inherits it from the runner)
const KEY = (process.env.ATLAS_PW_KEY ||= `atl_test${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`);
// a scripted language server (hover, a diagnostic, completion): the LSP test must not depend on what is installed
const FAKE_LS = fileURLToPath(new URL("./tests/fixtures/fake_ls.py", import.meta.url));
// the SSH example plugin runs this instead of ssh (example-ssh.spec.ts): no network, no real config
const FAKE_SSH = fileURLToPath(new URL("./tests/fixtures/fake_ssh.sh", import.meta.url));
// …and its sftp is the machine's sftp-server in this folder (example-sftp.spec.ts): the "remote" files
export const SFTP_ROOT = `${WS}-sftp`;
const files: Record<string, string> = {
  "FOCUS.md": "# Focus\n\n<!-- author note: must not render -->\nFinish the GW notes.\n",
  "notes/hubbard.md": "# Hubbard\n\nEnergy $E = -t\\sum_{ij} c^\\dagger_i c_j$.\n\n- [ ] check the sign of t\n",
  // snippet paths are static fixture config: tests run in parallel against one server, so a
  // test that PUTs config would race another test's restore
  // restore_layout off: the layout is a file of the workspace now, and every test starts clean
  // the AI agent of the tests: a plugin's agent (agent_terminals.rs) whose program is `cat`, so what is typed echoes back
  ".atlas/plugins/claude/plugin.toml": `title = "Claude"\nicon = "claude"\n\n[[agent]]\nid = "claude"\ntitle = "Claude"\nicon = "claude"\ncommand = "cat"\nsend_selection = "@{path}#L{from}-{to} "\n`,
  // the references library is the catalog-papers plugin's: its manifest, its helper the debug build (webServer builds it)
  ".atlas/plugins/catalog-papers/plugin.toml": readFileSync(fileURLToPath(new URL("../plugins/beta/catalog-papers/plugin.toml", import.meta.url)), "utf8")
    .replace(/^run = .*$/m, `run = "${fileURLToPath(new URL("../target/debug/papers", import.meta.url))}"`),
  ".atlas/config.toml": `log_dir = "log"\nfocus = "FOCUS.md"\nvim = true\n\n[ui]\nrestore_layout = false\n\n[latex]\nsnippets_file = "snippets/snips.js"\nvariables_file = "snippets/vars.js"\n\n[terminal]\nrenderer = "text"\n\n[lsp]\npython = "python3 ${FAKE_LS}"\nrust = "off"\nlatex = "off"\nc = "off"\n`,
  "data/sweep.tsv": "U\tE_kin\tZ\n3.0\t-1.25\t0.81\n5.5\t-0.90\t0.42\n4.0\t-1.10\t0.66\n",
  "themes/test-color-theme.json": '{\n  // VS Code themes are JSONC\n  "name": "Test Zed", "type": "dark",\n  "colors": { "editor.background": "#050505", "focusBorder": "#7de486", },\n  "tokenColors": [ { "scope": "keyword", "settings": { "foreground": "#c678dd" } }, { "scope": ["variable"], "settings": { "foreground": "#4cc2fb", "fontStyle": "bold" } } ]\n}\n',
  "snippets/snips.js": '[\n  { trigger: "mk", replacement: "$$0$", options: "tA" },\n  { trigger: "//", replacement: "\\\\frac{$0}{$1}$2", options: "mA" },\n  { trigger: "([A-Za-z])(\\\\d)", replacement: "[[0]]_{[[1]]}", options: "rmA" },\n  { trigger: "@${GREEK}", replacement: "\\\\[[0]]", options: "rmA" },\n  { trigger: "U", replacement: "\\\\underbrace{${VISUAL}}_{$0}", options: "mA" },\n  { trigger: "beg", replacement: "\\\\begin{$0}", options: "mA" },\n  { trigger: "sumk", replacement: "\\\\sum_{k=$0}^{$1}$2", options: "mA" },\n  { trigger: "sumq", replacement: "\\\\sum_{q}$0", options: "mA" },\n  { trigger: "kV", replacement: "\\\\text{kV}", options: "mA" },\n  { trigger: "VA", replacement: "\\\\text{VA}", options: "mA" },\n  { trigger: "kVA", replacement: "\\\\text{kVA}", options: "mA" },\n'
    // commands typed whole, letters-only triggers inside them, a snippet in another's stop, a function's own `const`
    + '  { trigger: "frac", replacement: "\\\\frac{$0}{$1}$2", options: "mA" },\n  { trigger: "bar", replacement: "\\\\bar{$0}$1", options: "mA" },\n'
    + '  { trigger: "ang", replacement: "Å", options: "mA" },\n  { trigger: "([^\\\\\\\\])(hbar|langle|rangle)", replacement: "[[0]]\\\\[[1]]", options: "rmA" },\n'
    + '  { trigger: "bra", replacement: "\\\\bra{$0} $1", options: "mA" },\n  { trigger: "ket", replacement: "\\\\ket{$0} $1", options: "mA" },\n'
    + '  { trigger: "braket", replacement: "\\\\braket{ ${0:\\\\psi} | ${1:\\\\psi} } $2", options: "mA" },\n'
    + '  { trigger: /iden(\\d)/, replacement: (m) => { const n = Number(m[1]); return "I_" + n; }, options: "mA", priority: 1 },\n]\n',
  "snippets/vars.js": '{ "${GREEK}": "(alpha|beta)" }\n',
  "refs/papers/anderson1972more/info.yaml": "title: More Is Different\ntype: journalArticle\nauthor:\n- Anderson, P. W.\ndate: 1972-08-04\npublicationTitle: Science\nDOI: 10.1126/science.177.4047.393\nabstractNote: The reductionist hypothesis may still be a topic for controversy.\ncitekey: anderson1972more\ncollections:\n- Philosophy\n",
  "refs/papers/hubbard1963electron/info.yaml": "title: Electron correlations in narrow energy bands\ntype: journalArticle\nauthor:\n- Hubbard, J.\ndate: 1963\npublicationTitle: Proc. R. Soc. Lond. A\ncitekey: hubbard1963electron\ncollections:\n- ManyBody\ntags:\n- Condensed Matter - Strongly Correlated Electrons\n",
  // notes that tests WRITE to — one per test, since tests run in parallel against one workspace
  "notes/aids.md": "# Aids\n\nSome text.\n",
  "notes/tabstops.md": "# Tab stops\n",
  // links to the static notes: backlinks are read-only, so sharing hubbard.md is safe
  "notes/sub/related.md": "# Related\n\nSee the [[hubbard]] model.\n\nAlso `[[hubbard]]` in code is not a link.\n",
  // older daily logs (Today's ‹ › browses days that have a log; the gap day has none)
  "log/2026-01-02.md": "# 2026-01-02\n\n- 09:00 First day of the year.\n",
  "log/2026-01-05.md": "# 2026-01-05\n\n- 10:30 Read the DCA review.\n",
  "journal.md": "Talked about [the model](notes/hubbard.md) today.\n",
  // an Obsidian Base over db/*: embedded in a topic note and opened on its own
  "db/Topic.md": "# Topic\n\n![[lectures.base]]\n\nAfter the table.\n",
  "db/l1.md": "---\ntype: Lecture\ndate: 2025-02-03\ntopics: [\"[[Topic]]\"]\n---\nFirst.\n",
  "db/l2.md": "---\ntype: Lecture\ndate: 2025-03-10\ntopics: [\"[[Topic]]\"]\n---\nSecond.\n",
  "db/other.md": "---\ntype: Lecture\ndate: 2025-01-01\n---\nNot on this subject; it mentions the topic in passing.\n",
  "db/all.base": 'filters:\n  and:\n    - type == "Lecture"\nviews:\n  - type: table\n    name: Lectures\n    order: [file.name, date]\n  - type: table\n    name: Early\n    filters:\n      and:\n        - date < "2025-03-01"\n    order: [file.name]\n',
  "db/lectures.base": 'filters:\n  and:\n    - topics.contains(link(this.file.name))\nformulas:\n  Date: date(file.properties["date"]).format("YY.MM-DD")\nviews:\n  - type: table\n    name: By date\n    order: [formula.Date, file.name, type]\n    sort:\n      - property: formula.Date\n        direction: DESC\n  - type: table\n    name: All lectures\n    filters:\n      and:\n        - type == "Lecture"\n    order: [file.name]\n',
  "notes/paste.md": "# Paste\n\nA figure goes here.\n",
  // the vault's property spec (`[editor] properties_spec`), shaped like the work vault's; props/*.md are the properties tests' notes
  "templates/properties.yaml": 'properties:\n  date: {kind: datetime, format: "YYYY-MM-DD HH:mm", description: when the note was created}\n  type: {kind: enum, values: [Concept, Talk, Course]}\n  topics: {kind: links, suggest: ["[[Condensed Matter]]", "[[Optics]]"]}\n  tags: list\n  rating: number\n  done: bool\ntypes:\n  Talk: {required: [date, type, topics], optional: [tags, rating]}\n',
  "props/hidden.md": "---\ndate: 2026-10-01 09:00\ntype: Concept\ntags:\n  - physics\n---\n# Hidden\n\nThe body.\n",
  "props/panel.md": "---\n# a comment that stays\ndate: 2026-10-01 09:00\ntype: Talk\ntags:\n  - physics\nrating: 3\nsomething_else: kept as it is\n---\n# Panel\n\nThe body, untouched by the panel.\n",
  "tex/ch2.tex": "\\section{Two}\nText here.\n",
  "tex/ch1.tex": "\\chapter{Intro}\nText.\n\n\\section{Model}\nThe Hubbard model.\n\\subsection*{Limits}\nU=0.\n",
  "scripts/run.py": 'import numpy as np\n\n\ndef energy(t: float) -> float:\n    """Kinetic energy."""\n    return -2 * t  # nearest neighbour\n',
};
// Built once in the main process: workers re-import this file, and rebuilding there raced.
if (!process.env.TEST_WORKER_INDEX) {
  rmSync(WS, { recursive: true, force: true });
  rmSync(`${WS}-vaults.toml`, { force: true });
  rmSync(`${WS}-secrets`, { recursive: true, force: true }); // the plugins' secret store is outside the vault: start each run without one
  rmSync(`${WS}-server.toml`, { force: true }); // Settings → Server writes these (server mode's sign-in), never ~/.config here
  rmSync(`${WS}-server.json`, { force: true });
  rmSync(`${WS}-personal`, { recursive: true, force: true });
  rmSync(`${WS}-capture-other`, { recursive: true, force: true });
  rmSync(SFTP_ROOT, { recursive: true, force: true });
  mkdirSync(join(SFTP_ROOT, "data run"), { recursive: true });
  writeFileSync(join(SFTP_ROOT, "data run", "out [1].txt"), "U\tE_kin\n4.0\t-1.10\n");
  writeFileSync(join(SFTP_ROOT, "notes.md"), "# Remote notes\n\nWritten on the cluster.\n");
  writeFileSync(join(SFTP_ROOT, ".bashrc"), "export PS1='$ '\n");
  const git = (...a: string[]) => execFileSync("git", ["-C", WS, ...a], { stdio: "ignore" });
  const commitAll = (msg: string) => { git("add", "-A"); git("commit", "-q", "-m", msg); };
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(WS, p, ".."), { recursive: true });
    writeFileSync(join(WS, p), text);
  }
  // history with one commit of each class: yours, Claude's work, Claude's housekeeping
  git("init", "-q"); git("config", "user.name", "Tester"); git("config", "user.email", "t@example.org");
  commitAll("My own hubbard note");
  writeFileSync(join(WS, "notes/claude.md"), "# By Claude\n");
  commitAll("Claude adds a note\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>");
  mkdirSync(join(WS, "docs"), { recursive: true });
  writeFileSync(join(WS, "docs/HISTORY.md"), "# history\n");
  commitAll("history\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>");
  writeFileSync(join(WS, "notes/hubbard.md"), files["notes/hubbard.md"] + "\nAn uncommitted line.\n");
}

export default defineConfig({
  testDir: "tests",
  // One server, one workspace and one global /api/ui/state are shared by every test: parallel workers
  // overwrite each other's state (flaky "active pane" / 404s). Serial is deterministic and still fast.
  workers: 1,
  // a shared CI runner is slower and noisier than a desktop: one retry there, reported as "flaky", never locally
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    extraHTTPHeaders: { authorization: `Bearer ${KEY}` },
    storageState: { cookies: [{ name: "atlas_local", value: KEY, domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Strict" }], origins: [] },
    viewport: { width: 1500, height: 900 },
    colorScheme: "dark", // ui.theme follows the desktop by default; the tests look at the dark side
    reducedMotion: "reduce", // ui.motion is on by default; the tests check end states, not transitions
    // Playwright's pinned browser may be newer than the cached one; ATLAS_PW_CHROME overrides.
    launchOptions: process.env.ATLAS_PW_CHROME ? { executablePath: process.env.ATLAS_PW_CHROME } : {},
  },
  webServer: {
    // ATLAS_SERVER_CMD runs another build of the CLI instead, e.g. the Windows one under Wine
    // (`bash scripts/dev/windows.sh run atlas`; docs/design/DESIGN-desktop-ports.md)
    command: process.env.ATLAS_SERVER_CMD
      ? `${process.env.ATLAS_SERVER_CMD} serve ${WS} --port ${PORT}`
      : `cargo build -q -p atlas-papers -p atlas-ssh && cargo run -q -p atlas -- serve ${WS} --port ${PORT}`,
    cwd: "..",
    // the vault list and the secret store are the test's own, and "open a vault" starts nothing
    env: { ...(process.env as Record<string, string>), ATLAS_VAULTS: `${WS}-vaults.toml`, ATLAS_SECRETS_DIR: `${WS}-secrets`, ATLAS_SERVER_CONFIG: `${WS}-server.toml`, ATLAS_SERVER_STATE: `${WS}-server.json`, ATLAS_AGENTS_FILE: `${WS}-agents.json`, ATLAS_APP: "true", ATLAS_LOCAL_LOCK: "1", ATLAS_LOCAL_KEY: KEY, ATLAS_SSH_BIN: FAKE_SSH, ATLAS_FAKE_SFTP_ROOT: SFTP_ROOT },
    url: `http://127.0.0.1:${PORT}/`,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
