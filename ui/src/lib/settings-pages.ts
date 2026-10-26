// Settings pages (docs/guides/SETTINGS.md): each page groups one area's options, the features you can try
// there, and the next rung up the ladder (docs/guides/MALLEABLE.md R1). Fields come from the config schema;
// this table only places them. A field no page claims lands on its section's own page, so a new
// config section shows up with no UI work (shape over lists).

import type { IconName } from "./panes";

export type PageId =
  | "overview" | "appearance" | "writing" | "today" | "code" | "files" | "web" | "server" | "papers" | "drawing"
  | "terminal" | "keyboard" | "automation" | "agents" | "advanced";

/** Custom panels drawn by the Settings UI beside the generated fields. */
export type Panel = "overview" | "preview" | "snippets" | "keys" | "plugins" | "signins" | "scripts" | "drafts" | "openwith" | "server" | "agents" | "templates";

export interface NextRung {
  label: string;
  /** What it is, in a sentence. */
  why: string;
  /** An action id (lib/actions.ts) or a special opener handled by the page. */
  run: string;
}

export interface PageDef {
  id: PageId;
  title: string;
  icon: IconName;
  /** One line: what this area is for. */
  blurb: string;
  /** Dotted config paths, in display order. `section.*` takes the rest of a section. */
  fields: string[];
  /** Action ids worth knowing here (shown with their shortcut and a Try button). */
  features: string[];
  panels?: Panel[];
  next?: NextRung[];
  /** Shown only where the page runs (hostOf): Server only in a browser on the server's page, Advanced (the desktop's
   *  rendering) only on this machine. */
  only?: SettingsHost[];
}

/** Where a Settings page runs: `app` this machine's own vault (the desktop app, or its page in a browser), `bridged` a
 *  server's vault seen through this machine's core (/remote/<host>/…), `phone` the phone apps, `browser` a server's
 *  page in a browser. */
export type SettingsHost = "app" | "bridged" | "phone" | "browser";
export function hostOf(where: { server: boolean; phone: boolean; path: string }): SettingsHost {
  if (where.phone) return "phone";
  if (where.path.startsWith("/remote/")) return "bridged";
  return where.server ? "browser" : "app";
}

export const PAGES: PageDef[] = [
  {
    id: "overview", title: "Overview", icon: "outline", blurb: "What Atlas can do, area by area — and where to change it.",
    fields: [], features: ["ui.palette", "ui.quickOpen", "ui.capture", "ui.commands"], panels: ["overview"],
  },
  {
    id: "appearance", title: "Appearance", icon: "sun", blurb: "Colours, fonts, sizes, how tabs are shown and where the side panel sits; e-ink screens (a Boox) get pure black on white. A split shows two tabs side by side; a tab outside it shows alone and a click on the pair brings both back. Super+F puts one tab over the whole window. Changes apply as you make them.",
    fields: ["ui.theme", "ui.accent", "ui.vscode_theme", "ui.font_size", "ui.ui_font", "ui.motion", "ui.eink", "ui.eink_refresh", "ui.tabs", "ui.side_panel", "ui.restore_layout", "ui.tab_preview", "ui.tab_switcher", "ui.sleep_after_min", "ui.awake_tabs", "ui.libraries",
      "editor.prose_font", "editor.prose_font_size", "editor.prose_line_height", "editor.prose_width",
      "editor.code_font", "editor.code_font_size", "editor.inline_title"],
    features: ["ui.theme", "ui.zoomIn", "ui.zoomOut", "ui.zoomReset", "ui.zoomAllIn", "ui.zoomAllOut", "ui.zoomAllReset", "ui.sidePanel", "ui.sidePanel.move", "ui.fullscreen", "ui.resetLayout"], panels: ["preview", "snippets"],
    next: [{ label: "Write a CSS snippet", why: "Restyle anything — a file in .atlas/snippets/ applies live on save.", run: "settings.newSnippet" }],
  },
  {
    id: "writing", title: "Writing", icon: "edit", blurb: "Notes in markdown: vim, links, citations, math, the / menu, properties, capture and templates. A plain note starts from the default template, which the New… list leaves out; a template's `template_title:` names it there and is never copied into its notes. A note open on two devices is edited together, live. In a note Ctrl+B is bold, Ctrl+I italic, Ctrl+K a link, Ctrl+Q turns a line into a list item or a to-do.",
    fields: ["vim", "editor.vim_keys", "editor.format_bar", "editor.math_preview", "editor.link_preview", "editor.task_chips", "editor.task_suggest", "editor.task_short_forms", "editor.properties", "editor.properties_spec", "editor.link_completion", "editor.citation_completion", "editor.slash_menu", "editor.fold_headings", "editor.typewriter", "editor.live",
      "editor.backlinks", "editor.latex_snippets", "editor.latex_snippets_file", "editor.latex_snippet_variables_file",
      "editor.attachment_folder", "editor.date_names", "editor.strict_line_breaks", "notes.*"],
    features: ["ui.vim", "ui.new", "ui.note.new", "note.cycle", "note.insert-template", "ui.properties", "ui.properties.inline", "ui.kit.install", "ui.outline", "ui.graph"], panels: ["templates"],
    next: [{ label: "Put a live view in a note", why: "A ```view block (calendar, list, table) over the note's own tasks or a folder.", run: "settings.viewHelp" }],
  },
  {
    id: "today", title: "Home & Today", icon: "today", blurb: "The first screen, the daily log, your focus file and the activity feed. Capture (Super+C) adds a line to today's log, a note in notes/log that starts with its date as properties, or from the daily log template; the Weather plugin adds the day's weather to it.",
    fields: ["home", "focus", "log_dir", "log_folders", "log_template", "activity.*"],
    features: ["ui.today", "ui.capture", "ui.focusFile"],
    next: [{ label: "Reshape the home screen", why: "Home is a .page file: rows and columns of blocks you add, move or remove.", run: "settings.editHome" }],
  },
  {
    id: "code", title: "Code", icon: "file-code", blurb: "The code editor and language servers (completion, errors, go to definition). VS Code's keys work in a code file: Ctrl+G go to line, Ctrl+Shift+K delete line, Ctrl+Shift+L select all occurrences, Ctrl+D next occurrence, Ctrl+/ comment, Alt+↑/↓ move the line, F2 rename, F12 definition.",
    fields: ["editor.autosave_code", "editor.code_bar", "editor.git_gutter", "editor.line_numbers", "editor.wrap_code", "editor.indent_guides", "editor.minimap", "editor.breadcrumbs", "lsp.*"],
    features: ["ui.problems", "ui.symbols", "ui.python.env", "ui.git", "ui.git.blame", "ui.replace"],
  },
  {
    id: "files", title: "Files & search", icon: "files", blurb: "What the file tree, search and the note index see — and which files are an AI agent's own, kept apart from your notes. The explorer also opens other vaults, SSH hosts and servers (copyparty) beside your vault.",
    fields: ["ignore", "editor.index_exclude", "files.*"],
    features: ["ui.files", "ui.explorer", "ui.quickOpen", "ui.search", "ui.history", "ui.openWith", "ui.vault"], panels: ["openwith"],
  },
  {
    id: "web", title: "Web", icon: "globe", blurb: "Links to web pages: in a tab of Atlas when the site allows it, in a browsing window of Atlas (Alt+← / Alt+→ back and forward, Super+Shift+O to your browser, Ctrl+W close) with ads and trackers blocked, or in your own browser.",
    fields: ["web.*"], features: ["ui.web"],
  },
  {
    id: "server", title: "Server", icon: "server", blurb: "Serving a vault to other machines and the phone (atlas serve --listen): who may sign in, the password, device tokens.",
    fields: [], features: [], panels: ["server"], only: ["browser"],
  },
  {
    id: "papers", title: "References & PDF", icon: "library", blurb: "The PDF reader / annotator. Your references — papers, books, theses, lecture notes: their folder, refs.bib, the Zotero connector, PDF sources — are the Catalog · Science plugin's: Settings → Plugins & automation → Catalog · Science.",
    fields: ["pdf.*"], features: ["ui.library"],
  },
  {
    id: "drawing", title: "Drawing", icon: "image", blurb: "Excalidraw drawings inside Atlas: as a notepad (pens and paper, as on the Boox) or plain, on pages of a size you choose or an endless canvas. A drawing open on two devices shares its strokes as they are drawn. Rnote for long handwriting.",
    fields: ["draw.*"], features: ["ui.drawing", "draw.exportSvg"],
  },
  {
    id: "terminal", title: "Terminal & agents", icon: "terminal", blurb: "Shell and AI agent panes (an agent comes from its plugin: Claude), and where they dock.",
    fields: ["terminal.*"], features: ["ui.terminal", "ui.panel", "ui.claude", "ui.sendToClaude", "ui.panel.move", "ui.terminal.new", "ui.claude.new"],
  },
  {
    id: "keyboard", title: "Keyboard", icon: "command", blurb: "Every command and its shortcut. Click a shortcut, press the new keys.",
    fields: [], features: [], panels: ["keys"],
    next: [{ label: "Turn a shell line into a command", why: "A command gets a palette entry, a shortcut and an optional schedule.", run: "ui.commands" }],
  },
  {
    id: "automation", title: "Plugins & automation", icon: "plugin", blurb: "Plugins, your workspace commands, schedules, and the tools Atlas drafted from how you work.",
    fields: ["automation.*", "plugins.oidc_issuer", "plugins.oidc_client_id", "plugins.oidc_redirect"], features: ["ui.commands"], panels: ["drafts", "plugins", "signins", "scripts"],
    next: [
      { label: "Write a plugin", why: "A folder in .atlas/plugins/ with a view.js and an optional data script; reloads on save.", run: "settings.pluginHelp" },
      { label: "Make a block of your own", why: "A block for notes and pages from a template: one file, with its options form.", run: "settings.newBlock" },
    ],
  },
  {
    id: "agents", title: "AI agents", icon: "command", blurb: "Claude Code and other agents drive Atlas through `atlas mcp`. Each one you allow gets a token of its own, which you can revoke alone.",
    fields: [], features: [], panels: ["agents"], only: ["app"],
  },
  {
    id: "advanced", title: "Advanced", icon: "settings", blurb: "Rendering and the raw settings file.",
    fields: ["ui.gpu_rendering"], features: [], only: ["app", "bridged"],
  },
];

/** Fields edited by a custom panel, never as a raw row. */
export const HIDDEN = new Set(["ui.css_snippets_off", "plugins.off", "files.open_with"]);

export interface Placed { page: string; title: string; icon: IconName; blurb: string; fields: string[] }

/** Places every schema leaf on a page: explicit paths first, then `section.*`, then a page per
 *  unclaimed section (titled from its key) and "General" for unclaimed top-level fields. */
export function placeFields(leaves: string[], host: SettingsHost = "app"): Placed[] {
  const shown = PAGES.filter((p) => !p.only || p.only.includes(host));
  const placed: Placed[] = shown.map((p) => ({ page: p.id, title: p.title, icon: p.icon, blurb: p.blurb, fields: [] }));
  const byId = new Map(placed.map((p) => [p.page, p]));
  const taken = new Set<string>();
  for (const def of shown) {
    const out = byId.get(def.id)!;
    for (const f of def.fields) {
      if (f.endsWith(".*")) {
        const pre = f.slice(0, -1);
        for (const l of leaves) if (l.startsWith(pre) && !taken.has(l) && !HIDDEN.has(l) && !def.fields.includes(l)) { out.fields.push(l); taken.add(l); }
      } else if (leaves.includes(f) && !taken.has(f)) { out.fields.push(f); taken.add(f); }
    }
  }
  for (const l of leaves) {
    if (taken.has(l) || HIDDEN.has(l)) continue;
    const sec = l.includes(".") ? l.split(".")[0] : "general";
    let p = byId.get(sec);
    if (!p) {
      p = { page: sec, title: sec === "general" ? "General" : human(sec), icon: "settings", blurb: "", fields: [] };
      placed.push(p);
      byId.set(sec, p);
    }
    p.fields.push(l);
  }
  // pages with nothing to show and no panel are dropped
  return placed.filter((p) => p.fields.length || (PAGES.find((d) => d.id === p.page)?.panels?.length ?? 0) || (PAGES.find((d) => d.id === p.page)?.features.length ?? 0));
}

export const pageDef = (id: string) => PAGES.find((p) => p.id === id);
// acronyms and names keep their casing in labels ("vscode_theme" → "VS Code theme")
const WORDS: Record<string, string> = { eink: "e-ink", oidc: "OpenID", vscode: "VS Code", ui: "UI", lsp: "LSP", pdf: "PDF", svg: "SVG", gpu: "GPU", css: "CSS", url: "URL", bib: "BibTeX", rnote: "Rnote", latex: "LaTeX" };
/** Labels that read better than their key. */
const LABELS: Record<string, string> = { ui_font: "Interface font", font_size: "Text size", min_size: "Minimum size", off: "Switched off",
  index_exclude: "Agent files (kept apart from your notes)", side_panel: "Side panel: where it sits", restore_layout: "Reopen the last tabs at start",
  tab_preview: "Preview a tab on hover", link_preview: "Preview a link on hover", tab_switcher: "Ctrl+Tab", libraries: "Libraries shown", properties: "Properties", properties_spec: "Property spec (file)",
  dir: "Folder", templates: "Templates folder", template_rules: "Templates by name or folder", default_template: "Default template (a plain note starts from it)", strict_line_breaks: "Strict line breaks" };
export const human = (k: string) => LABELS[k] ?? k.split("_").map((w, i) => WORDS[w] ?? (i ? w : w.replace(/^./, (c) => c.toUpperCase()))).join(" ");
/** Labels of one field, where its key alone is vague or would collide ("dir" is the notes' and the drawings' folder). */
const FIELD_LABELS: Record<string, string> = {
  log_dir: "Daily log folder", log_folders: "Daily logs filed in (YYYY/MM-MMMM)", log_template: "Daily log template", "notes.dir": "Notes folder", "draw.dir": "Drawings folder",
  "notes.capture": "Capture writes", "notes.inbox": "Inbox folder (fleeting notes)", "notes.capture_template": "Fleeting note template", "notes.capture_thumbnail": "Captured pictures in the log, width (px)",
  "editor.live": "Live editing between devices", "editor.code_bar": "Tool bar above code files", "editor.task_chips": "Task dates as chips",
  "activity.show_claude": "AI agents' commits", "activity.show_housekeeping": "Housekeeping commits", "activity.group_threshold": "Group a folder's changes from",
  "plugins.oidc_issuer": "Sign-in provider (OpenID Connect)", "plugins.oidc_client_id": "Sign-in client id", "plugins.oidc_redirect": "Sign-in return address",
  "ui.eink": "E-ink screen", "ui.eink_refresh": "E-ink full refresh", "terminal.min_size": "Terminal's smallest size (px)",
  "lsp.c": "C / C++ server", "lsp.rust": "Rust server", "lsp.python": "Python server", "lsp.latex": "LaTeX server", "lsp.language": "Servers' message language", "lsp.inlay_hints": "Inlay hints", "lsp.python_env": "Python environment",
  "draw.page_format": "A new drawing's pages",
  "web.open_links": "Web links open in", "pdf.export_on_save": "Export annotations on save",
};
/** A field's label from its dotted path. */
export const fieldLabel = (path: string) => FIELD_LABELS[path] ?? human(path.split(".").pop() ?? path);

/** How a string field is edited, from its name (shape-based: new fields get the right control). */
export type StringKind = "colour" | "folder" | "file" | "plain";
export function stringKind(path: string): StringKind {
  const key = path.split(".").pop() ?? "";
  if (/(^|_)(accent|colou?r)$/.test(key)) return "colour";
  if (/(^|_)(dir|folder)$/.test(key)) return "folder";
  if (/(^|_)(file|home|focus|bib|path|spec)$/.test(key)) return "file";
  return "plain";
}
