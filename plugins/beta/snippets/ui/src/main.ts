// Snippets: the engine in every editor, what the vault says loaded and kept current, the list while typing, the page in Settings.
import type { EditorView } from "@codemirror/view";
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
import type { CompletionAt, CompletionItem } from "../../../../../ui/src/lib/editor/plugin-hooks";
import { convert } from "./convert";
import { makeEngine } from "./engine";
import type { Compiled } from "./format";
import { CONVERTED, FOLDER, loadAll, type Read } from "./load";
import { mountSection } from "./settings";

/** A body as a formula to show: stops give way to their placeholders. */
const preview = (body: string) => body.replace(/\$\{VISUAL\}/g, "x").replace(/\$\{\d+:((?:[^{}]|\{[^{}]*\})*)\}/g, "$1").replace(/\$\{\d+\}|\$\d+/g, "\\square ");

export async function register(atlas: PluginApi) {
  const engine = makeEngine(atlas);
  let read: Read | null = null;
  const reload = async () => {
    read = await loadAll(atlas);
    engine.use(read);
    return read;
  };
  atlas.editor.extension(engine.extension);
  atlas.editor.claimTab(engine.claim);
  await reload();
  // not awaited: the plugin works with its short list until the dictionaries arrive
  void engine.loadWords().catch((e) => console.warn("snippets: the word list did not load, only the short one holds:", e));

  // a snippet file changed, or which old file is meant: read again
  atlas.onFilesChanged((paths) => { if (paths.some((p) => p.startsWith(`${FOLDER}/`) || p === ".atlas/config.toml")) void reload(); });

  const where = (view: EditorView, pos: number) => engine.placeOf(view, pos);
  atlas.editor.registerCompletion({
    where: "all",
    trigger: /[A-Za-z@:][\w@:]*$/,
    applies: ({ view, pos, explicit, before }) => {
      if (explicit) return true;
      if ((/[A-Za-z@:][\w@:]*$/.exec(before)?.[0].length ?? 0) < 2) return false;
      const p = where(view, pos);
      return p.kind === "math" && !p.textArg; // never a popup over prose
    },
    // the trigger's list: a way to find a snippet without knowing its name. Regex and computed ones appear by their
    // name only, as there is nothing to expand from a list
    complete: (at: CompletionAt) => {
      const place = where(at.view, at.pos), typed = at.word;
      const fixed = engine.snippets().filter((s) => s.plain?.trim() && typeof s.body === "string" && !s.visual && engine.fits(s, place, at.view));
      // "x@a": the trigger starts where some snippet's name starts, not where the word does
      for (let i = 0; i <= Math.max(0, typed.length - (at.explicit ? 1 : 2)); i++) {
        const prefix = typed.slice(i), lower = prefix.toLowerCase();
        const found = fixed.filter((s) => (s.plain!.trim().startsWith(prefix) && s.plain!.trim() !== prefix) || (prefix.length >= 3 && s.name?.toLowerCase().includes(lower)));
        if (!found.length) continue;
        const items = found.sort((a, b) => a.plain!.length - b.plain!.length || a.plain!.localeCompare(b.plain!)).slice(0, 50).map((s): CompletionItem => {
          const body = s.body as string;
          return {
            label: s.plain!.trim(), detail: s.name ?? body.replace(/\s+/g, " ").slice(0, 48), kind: "keyword",
            apply: (view, from, to) => engine.insert(view, body, from, to, "", s.legacyStops),
            info: s.math ? () => { const host = document.createElement("div"); atlas.editor.drawMath(host, preview(body), false); return host; } : undefined,
          };
        });
        return { from: at.pos - typed.length + i, items };
      }
      return null;
    },
  });

  /** Writes a module from the old file; the old one stays. Run from the page or the palette: the person asked. */
  const runConvert = async (): Promise<void> => {
    const old = read?.oldFile ?? (await atlas.editor.legacySnippets().catch(() => null));
    if (!old?.sources.some((s) => s.trim())) { atlas.toast("Snippets", "There is no old snippet file to convert here.", "info"); return; }
    const path = CONVERTED;
    if (read?.modules.includes(path)) { atlas.toast("Snippets", `${path} is there already. Move it aside to convert again.`, "info"); return; }
    const { text, kept, dropped } = convert(old);
    await atlas.writeText(path, text);
    await reload();
    atlas.toast("Snippets", `${kept} snippets in ${path}, ${dropped.length} changes listed at its top. The old file was left as it was.`, "success");
    atlas.open(path);
  };
  atlas.registerCommand({ id: "convert", title: "Snippets: convert the old snippet file", run: runConvert });

  atlas.plugin.registerSettingsSection({
    id: "snippets", title: "Your snippets", place: "before",
    hint: "What fires, where it fires, and what is wrong. Snippet files are JavaScript and run with what a plugin may do.",
    mount: (host, ctx) => mountSection(host, { atlas, engine, ctx, read: () => read!, reload, convert: runConvert }),
  });
}

export type { Compiled };
