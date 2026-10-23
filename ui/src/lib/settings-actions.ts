// The "go further" steps at the bottom of Settings pages: each makes the next rung's file for you
// and opens it (docs/design/MALLEABLE.md R1: the step up costs one click, never a blank page).
import { errText } from "./text";
import { api } from "./api";
import { openPath } from "./dock";
import { homeDoc } from "./actions";
import { SNIPPET_TEMPLATE } from "./css-snippets.svelte";
import { toast } from "./state.svelte";

const slug = (name: string) => name.trim().toLowerCase().replace(/\.css$/i, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
const fail = (what: string) => (e: unknown) => toast(what, errText(e), "error");

export async function newSnippet(name: string): Promise<void> {
  const file = `.atlas/snippets/${slug(name) || "snippet"}.css`;
  try { await api.putFile(file, SNIPPET_TEMPLATE); openPath(file); } catch (e) { fail("Could not create the snippet")(e); }
}

const PLUGIN_VIEW = `// A plugin view (docs/guides/PLUGINS.md): draw into \`host\` with plain DOM; \`atlas\` is the plugin API.
// Saving this file reloads the view. Style with the app's variables so it follows the theme.
export default function mount(host, atlas) {
  const box = document.createElement("div");
  box.style.cssText = "padding: 16px; color: var(--text); font-size: calc(14px * var(--ui-scale, 1))";
  const show = (c) => { box.textContent = "Looking at: " + (c.active?.path ?? c.active?.kind ?? "nothing"); };
  show(atlas.context());
  const off = atlas.onContext(show); // follows what you look at (the shared context)
  host.append(box);
  return off; // cleanup
}
`;

export async function newPlugin(name: string): Promise<void> {
  const id = slug(name).replace(/\./g, "-") || "my-plugin"; // plugin ids: letters, digits, - and _
  const dir = `.atlas/plugins/${id}`;
  const toml = `# A workspace plugin: only \`title\` is required (docs/guides/PLUGINS.md).\ntitle = ${JSON.stringify(name.trim() || id)}\ndescription = "what it shows, in one line"\nicon = "plugin"\n# keys = "Ctrl+Alt+P"\n# data = "python3 \\"$ATLAS_PLUGIN_DIR/data.py\\""\n`;
  try {
    await api.putFile(`${dir}/plugin.toml`, toml);
    await api.putFile(`${dir}/view.js`, PLUGIN_VIEW);
    openPath(`${dir}/view.js`);
    toast("Plugin created", `${dir}/ — it is in the palette as "${name.trim() || id}"`, "success");
  } catch (e) { fail("Could not create the plugin")(e); }
}

// the same shape as plugins/examples/wordcount/main.js, cut to the smallest block that does something
const blockCode = (type: string, title: string) => `// A block (docs/guides/EXTENDING.md): draw into \`host\` with plain DOM and return the cleanup.
// Saving this file reloads it wherever it is shown. Use it
//   in a note:               \`\`\`view
//                            type: ${type}
//                            \`\`\`
//   in a page or the sidebar: - [{ view: ${type} }]   (or "+" while arranging a page)
export function register(atlas) {
  atlas.registerBlock("${type}", (host, block) => {
    const draw = async () => {
      // block.options: what the note or page says; block.note: the file the block is in;
      // block.props(): that note's properties (frontmatter and \`key:: value\` of the section)
      const props = await block.props();
      host.textContent = String(block.options.text ?? atlas.plugin.settings.greeting ?? "Hello") + " — " + Object.keys(props).length + " properties in " + block.note;
      host.style.cssText = "padding: 8px 0; color: var(--text-muted)"; // the app's variables follow the theme
    };
    void draw();
    return atlas.onFilesChanged((paths) => { if (paths.includes(block.note)) void draw(); });
  }, {
    title: ${JSON.stringify(title)},
    // the fields of the page's "Options…" form (kinds: text, number, toggle, list, choice)
    options: [{ key: "text", label: "Text", kind: "text", hint: "what the block says first" }],
  });
}
`;

/** "New block from a template": a plugin folder with one block, opened ready to edit. */
export async function newBlock(name: string): Promise<void> {
  const id = slug(name).replace(/\./g, "-") || "my-block";
  const dir = `.atlas/plugins/${id}`, type = `${id}.block`, title = name.trim() || id;
  const toml = `# A workspace plugin with one block, \`${type}\` (docs/guides/PLUGINS.md).\ntitle = ${JSON.stringify(title)}\ndescription = "what the block shows, in one line"\nicon = "plugin"\n\n# A setting: Settings → Plugins shows a form for it; the code reads atlas.plugin.settings.greeting.\n# kind: text, number, toggle, list or choice (with choices = [...]).\n[[setting]]\nkey = "greeting"\nlabel = "Greeting"\nkind = "text"\nhint = "what the block says when the page gives it no text"\ndefault = "Hello"\n`;
  try {
    // the manifest last: writing it is what makes the app load the plugin, and its code must be there
    await api.putFile(`${dir}/main.js`, blockCode(type, title));
    await api.putFile(`${dir}/plugin.toml`, toml);
    openPath(`${dir}/main.js`);
    toast("Block created", `Use it as \`type: ${type}\` in a \`\`\`view block, or add it to a page with "+" while arranging.`, "success", 9000);
  } catch (e) { fail("Could not create the block")(e); }
}

export async function editHome(): Promise<void> {
  const { path } = await homeDoc();
  if (path) openPath(path);
  else toast("No home file", "Set Home screen to a .page file (e.g. Home.page) on this page; Atlas creates it from a template.");
}

export const VIEW_EXAMPLE = "```view\ntype: calendar\nfrom: section\n```\n";
export async function copyViewExample(): Promise<void> {
  try {
    await navigator.clipboard.writeText(VIEW_EXAMPLE);
    toast("A view block is on the clipboard", "Paste it under a heading with dated tasks: it draws them as a calendar. type: list | table | calendar.", "success", 7000);
  } catch {
    toast("Paste this into a note", VIEW_EXAMPLE, "info", 10000);
  }
}
