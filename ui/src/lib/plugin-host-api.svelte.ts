// What a plugin is handed (`register(atlas)`, a pane's `api`): the PluginApi of plugin-api.ts, built for one plugin.
// Every registration goes through `own`, so it is undone when the plugin reloads or is switched off.
import { zipIndex, zipBlob } from "./zip";
import { mount, unmount } from "svelte";
import { frontmatterOf } from "./property-model";
import type { Extension } from "@codemirror/state";
import * as cmState from "@codemirror/state";
import * as cmView from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { placeAt } from "./editor/math-context";
import { renderMathInto } from "./math";
import { errText } from "./text";
import { on } from "./bus";
import { returned, signIn } from "./signin";
import { blobUrl, thumbUrl } from "./raw";
import { addNewKind } from "./new-thing";
import { toast } from "./state.svelte";
import { confirmDialog, inputDialog } from "./confirm";
import { context, onContext, setHover } from "./context.svelte";
import { registerView } from "./views";
import { registerNoteView } from "./note-views.svelte";
import { registerBlock, mountBlock } from "./blocks";
import { loadTable } from "./table-load";
import { exists } from "./vault-files";
import { registerLibrary as addLibrary } from "./libraries.svelte";
import { registerEmbed } from "./embed-registry";
import { pick } from "./palette.svelte";
import { registerSuggestion } from "./suggestions";
import { isIconName } from "./icons";
import Plot from "../components/Plot.svelte";
import { registerEntities } from "./entities";
import { registerMenu } from "./plugin-menus";
import { addStatusCell } from "./plugin-status.svelte";
import { addGreetingChip } from "./plugin-greeting.svelte";
import { addSideTool, toolId } from "./side-tools.svelte";
import { registerFence } from "./fences";
import { registerCodeTools } from "./plugin-code-tools";

/** The terminal's shell, asked of the core once (an older core does not say: POSIX, what it always ran). */
let shellAsked: Promise<"posix" | "powershell" | "cmd"> | null = null;
const terminalShell = () => (shellAsked ??= api.version().then((v) => v.shell ?? "posix", () => "posix"));
import { penOver } from "./pen-target";
import * as hooks from "./editor/plugin-hooks";
import { onPluginEvent } from "./plugin-events";
import { addSource, pluginSource, openExplorer, sourceNamed, type FileSource } from "./file-sources.svelte";
import { sourcePicture } from "./explorer-thumbs";
import { joinLive } from "./live";
import { addSettingsSection } from "./settings-sections.svelte";
import { api, apiBase } from "./api";
import { pageSvg } from "./pdf-marks";
import { open, openNative, openPath, openSide } from "./dock";
import { guard, logPlugin } from "./plugin-log.svelte";
import { pluginAssetUrl } from "./plugin-files";
import { PLUGIN_API_VERSION, type PluginApi, type PluginPane } from "./plugin-api";
import { INIT_ID, own, pluginData, pluginOn, pluginSpec, plugins, type Plugin } from "./plugin-registry.svelte";
import { addCommand } from "./plugin-commands";


/** A file as a plugin names it: a vault path as it is, else a link's target ("[[x.png]]", "x.png") resolved as a link is.
 *  `./vault` loaded when first needed: imported up front it closes a cycle and the app does not start. */
const vaultPath = async (name: string): Promise<string> => {
  const t = name.replace(/^!?\[\[|\]\]$/g, "");
  return (await import("./vault")).resolveLink(t, "") ?? t;
};

export type ContextSnapshot = ReturnType<typeof snapshot>;
const snapshot = () => $state.snapshot(context);

export async function noteProps(path: string): Promise<Record<string, unknown>> {
  const text = (await api.file(path)).text;
  return frontmatterOf(text)?.data ?? {};
}

/** What a plugin hands `atlas.files.source`: a FileSource without its id (the plugin's) and with any icon name. */
export type PluginFileSource = Partial<Omit<FileSource, "id" | "icon">> & { icon?: string };

/** Where a pane's API is: the file, `openView` argument and link anchor it was opened with, and its editor contract. */
export interface PaneAt { path?: string; arg?: string; anchor?: string; pane?: PluginPane }

export function pluginApi(p: Plugin, at: PaneAt = {}): PluginApi {
  const { path, arg } = at;
  return {
    version: PLUGIN_API_VERSION,
    plugin: {
      ...p,
      saveSettings: async (values) => { await api.pluginSettings(p.id, values); await (await import("./plugins.svelte")).loadPlugins(); }, // a cycle closed at run time only
      openSettings: () => void import("./plugin-settings.svelte").then((m) => m.openPluginSettings(p.id)),
      registerSettingsSection: (s) => own(p.id, addSettingsSection(p.id, s)),
    },
    path,
    arg,
    anchor: at.anchor,
    pane: at.pane,
    openView: (arg, opts = {}) => {
      if (!p.view) throw new Error(`plugin ${p.id} has no pane (no view.js)`);
      open({ ...pluginSpec(p), ...(opts.title ? { title: opts.title } : {}), ...(opts.icon ? { icon: opts.icon } : {}), ...(arg !== undefined ? { arg: String(arg) } : {}) }, { beside: opts.beside });
    },
    // the dialog's module loads when first asked for (it imports the pane machinery: a cycle closed at run time only)
    openDialog: (arg, opts = {}) => import("./plugin-dialog").then((m) => m.openPluginDialog(p, arg === undefined ? undefined : String(arg), opts)),
    zip: { index: zipIndex, blob: zipBlob },
    openLibrary: (id) => open({ kind: "libraries", ...(id ? { at: id } : {}) }),
    data: (args) => pluginData(p.id, args),
    open: (path, line, opts) => openPath(path, line, opts),
    openNative: (path) => openNative(String(path)),
    openTable: (path) => { open({ kind: "table", path }); },
    readText: async (path) => (await api.file(path)).text,
    exists: (path) => exists(String(path)),
    list: async (dir) => (await api.tree(dir)).map((e) => ({ name: e.name, path: e.path, dir: e.kind === "dir", ignored: e.ignored, ...(e.size === undefined ? {} : { size: e.size }), ...(e.modified === undefined ? {} : { mtime: e.modified }) })),
    writeText: async (path, text, opts) => ({ mtime: (await api.putFile(path, String(text), opts?.baseMtime)).mtime }),
    writeBytes: (path, data) => api.upload(path, data, true),
    // a picture named the way a note names it ("poster.png", "[[Frances Ha.png]]") is found where it is, as a link is
    fileUrl: async (path) => blobUrl(await vaultPath(path)),
    assetUrl: (rel) => { if (p.id === INIT_ID) throw new Error("init.js has no folder of its own: assetUrl is a plugin's"); return pluginAssetUrl(p.id, rel); },
    thumbUrl: async (path, width) => thumbUrl(await vaultPath(path), width),
    onFilesChanged: (fn) => on("fs", (e) => fn(e.paths)),
    eink: { get on() { return document.documentElement.classList.contains("eink"); }, refresh: () => void import("./eink").then((m) => m.einkRefresh()), pen: penOver },
    toast: (title, body, kind = "info", options) => toast(title, body, kind, undefined, options?.run && { label: options.label ?? "Open", run: () => { try { options.run!(); } catch (e) { logPlugin(p.id, "toast", e); } } }),
    context: snapshot,
    onContext: (fn) => onContext(() => fn(snapshot())),
    hover: (path, line) => setHover(path ? { path, line, source: `plugin:${p.id}` } : null),
    writeProperty: (path, key, value) => api.setProperty({ path, key, text: Array.isArray(value) ? value.join(", ") : value, list: Array.isArray(value) }),
    query: (baseYaml, thisPath) => api.baseQuery(baseYaml, thisPath),
    view: (src, path) => api.view(path ?? "", String(src)),
    registerEmbed: (patterns, render) => own(p.id, registerEmbed(p.id, patterns, render)),
    registerView: (type, render) => own(p.id, registerView(type, render)),
    registerNoteView: (name, v) => own(p.id, registerNoteView(name, {
      ...v, render: (host, note) => { try { return v.render(host, note); } catch (e) { logPlugin(p.id, `note view ${name}`, e); throw e; } },
    })),
    registerEntities: (e) => own(p.id, registerEntities({
      prefix: e.prefix, list: e.list,
      get: async (id) => { const x = await e.get(id); return x ? { ...x, open: () => { if (x.path) openPath(x.path); } } : null; },
    })),
    registerBlock: (type, render, about) => own(p.id, registerBlock({
      type, title: about?.title ?? `${p.title}: ${type.split(".").pop()}`, options: about?.options,
      // a block that throws shows its error where it stands (blocks.ts); the log keeps it too
      mount: (host, c) => { try { return render(host, { src: c.src, options: c.options, note: c.doc, props: () => (/\.(md|markdown)$/i.test(c.doc) ? c.props() : noteProps(c.doc)) }); } catch (e) { logPlugin(p.id, `block ${type}`, e); throw e; } },
    })),
    registerCommand: (c) => own(p.id, addCommand(p.id, c)),
    registerNew: (k) => own(p.id, addNewKind({ id: `${p.id}.${k.id}`, title: k.title, detail: k.detail, icon: k.icon && isIconName(k.icon) ? k.icon : undefined, plugin: p.title,
      run: async () => { try { await k.run(); } catch (e) { logPlugin(p.id, `new ${k.id}`, e); toast(`Plugin ${p.id}`, errText(e), "error"); } } })),
    other: (id) => {
      const o = plugins.list.find((x) => x.id === id);
      return o && pluginOn(o) ? { settings: (o.settings ?? {}) as Record<string, unknown>, data: (args) => pluginData(id, args) } : null;
    },
    mountBlock: (host, block, notePath = "") => mountBlock(host, notePath, typeof block === "string" ? block : stringifyBlock(block)),
    mountLibrary: (host, source) => {
      // the page is loaded when first asked for: the startup bundle stays without it
      let app: ReturnType<typeof mount> | null = null, gone = false;
      host.style.height = "100%"; // in a pane it fills it and its columns scroll; in a note, 100% of nothing is its own height
      void import("../components/library/Library.svelte").then(({ default: Library }) => {
        if (gone) return;
        app = mount(Library, { target: host, props: { source: { ...source, icon: isIconName(source.icon) ? source.icon : "library" } } });
      }, (e) => logPlugin(p.id, "library", e));
      return () => { gone = true; if (app) void unmount(app); };
    },
    registerLibrary: (source) => own(p.id, addLibrary({ id: source.id, title: source.title, icon: isIconName(source.icon) ? source.icon : "library", by: p.id, subject: source.subject, source: () => ({ ...source, icon: isIconName(source.icon) ? source.icon : "library" }) })),
    table: (path) => loadTable(path),
    plot: (host, d) => {
      const app = mount(Plot, { target: host, props: { x: d.x, ys: d.ys, xLabel: d.xLabel ?? "", yLabels: d.yLabels ?? d.ys.map((_, i) => `y${i + 1}`) } });
      return () => void unmount(app);
    },
    noteProps,
    trash: async (path) => { await api.trash(path); },
    companion: async (path, opts) => (await api.companion({ path, title: opts?.title ?? null, properties: opts?.properties ?? {}, block: null, find: opts?.find ?? false })).path,
    marks: async (file) => { const r = await api.pdfMarks(file); return { note: r.note ?? null, marks: r.marks }; },
    marksSvg: (marks, page, size = [1000, 1000]) => {
      const svg = pageSvg(marks, page, { view: [0, 0, size[0], size[1]], rotate: 0 });
      svg.setAttribute("preserveAspectRatio", "none"); // a picture page's places are fractions of each side
      return svg;
    },
    templates: () => api.templates(),
    newNote: async (o) => (await api.newNote({ title: o.title, dir: o.folder, template: o.template, values: o.values, text: o.body })).path,
    applyTemplate: async (path, template) => {
      const f = await api.file(path);
      const m = await api.mergeTemplate(path, template, f.text);
      if (m.text !== undefined && m.text !== f.text) await api.putFile(path, m.text, f.mtime);
      return m.added;
    },
    pick: (req) => pick(req),
    signIn: (url, back) => signIn(url, back),
    signInReturned: (back) => returned(back),
    oauth: {
      signIn: async (name, o = {}) => {
        const { url, redirect } = await api.pluginOauthStart(p.id, { name, issuer: o.issuer, resource: o.resource, client_id: o.clientId, redirect: o.redirect, scopes: o.scopes });
        await api.pluginOauthFinish(p.id, await signIn(url, redirect));
      },
      finish: async (address) => { await api.pluginOauthFinish(p.id, address); },
      status: (name) => api.pluginOauthStatus(p.id, name),
      signOut: (name) => api.pluginOauthSignOut(p.id, name),
    },
    registerSuggestion: (sp) => own(p.id, registerSuggestion(sp)),
    on: (type, fn) => own(p.id, onPluginEvent(p.id, type, fn)),
    media: async (url, init = {}) => `${apiBase()}/media/${(await api.pluginMedia(p.id, { url, headers: init.headers })).ticket}`,
    fetch: async (url, init = {}) => {
      const json = init.body !== undefined && typeof init.body !== "string";
      const r = await api.pluginFetch(p.id, {
        url, method: init.method, timeout_secs: init.timeout, save_to: init.saveTo, save_in: init.saveIn, body_file: init.bodyFile, form: init.form,
        headers: { ...(json ? { "content-type": "application/json" } : {}), ...init.headers },
        body: init.body === undefined ? undefined : json ? JSON.stringify(init.body) : (init.body as string),
      });
      return { status: r.status, ok: r.ok, headers: r.headers, url: r.url, saved: r.saved, signin: r.signin, text: async () => r.text, json: async () => JSON.parse(r.text) as unknown };
    },
    files: {
      source: (def) => own(p.id, addSource(pluginSource(p, def))),
      explore: (at = {}) => openExplorer(at.source ?? p.id, at.place ?? "", at.path),
      list: async (source, place, path) => sourceNamed(source).list(place, path),
      local: async (source, place, path) => sourceNamed(source).local(place, path),
      thumb: async (source, place, path) => { const s = sourceNamed(source); return s.thumb ? sourcePicture(s, place, path) : null; },
    },
    terminal: {
      run: (command) => import("./actions").then((m) => m.runInTerminal(String(command))),
      open: (command, title) => import("./actions").then((m) => m.runInNewTerminal(String(command), title === undefined ? undefined : String(title))),
      shell: () => terminalShell(),
    },
    helper: {
      call: (method, params, opts) => api.pluginHelper(p.id, method, params, opts?.timeout),
      on: (event, fn) => own(p.id, on("plugin", (e) => { if (e.plugin === p.id && e.event === event) void guard(p.id, `helper.on("${event}")`, () => fn(e.data), undefined); })),
      state: async () => (await api.pluginHelperState(p.id)).state,
      restart: async () => { await api.stopPluginHelper(p.id); },
    },
    secrets: {
      get: async (name) => (await api.pluginSecret(p.id, name)).value,
      set: (name, value) => api.setPluginSecret(p.id, name, value),
      delete: (name) => api.deletePluginSecret(p.id, name),
      has: async (name) => (await api.pluginSecretNames(p.id)).includes(name),
    },
    editor: {
      registerFence: (name, render) => own(p.id, registerFence(p.id, name, render)),
      registerCompletion: (spec) => own(p.id, hooks.registerCompletion(p.id, spec)),
      registerKey: (keys, run, where) => own(p.id, hooks.registerEditorKey(p.id, keys, run, where)),
      onPaste: (fn) => own(p.id, hooks.registerPaste(p.id, fn)),
      onDrop: (fn) => own(p.id, hooks.registerDrop(p.id, fn)),
      registerDecoration: (pattern, render) => own(p.id, hooks.registerDecoration(p.id, pattern, render)),
      toolbar: (fn) => own(p.id, registerCodeTools(p.id, fn)),
      extension: (ext) => own(p.id, hooks.registerExtension(p.id, ext as Extension)),
      codemirror: { state: cmState, view: cmView, language: { syntaxTree } },
      claimTab: (claim) => own(p.id, hooks.registerTabClaim(p.id, claim)),
      place: (view, pos) => placeAt(view.state, pos ?? view.state.selection.main.head, view.state.facet(hooks.editorPath)),
      path: (view) => view.state.facet(hooks.editorPath),
      drawMath: (host, source, block = false) => renderMathInto(host, String(source), block),
      legacySnippets: () => api.snippets(),
    },
    pen: { shape: (xyt) => api.penShape(xyt) },
    confirm: (question, opts) => confirmDialog(String(question), opts?.hint ?? "", opts?.ok ?? "OK", opts?.danger ?? false),
    input: (title, opts) => inputDialog(String(title), opts?.value ?? "", opts?.hint ?? ""),
    // loaded when asked: TeX and its sanitizer stay out of the start
    tikz: { png: (source, scale) => import("./tikz").then((m) => m.tikzPng(String(source), scale)) },
    live: {
      join: (file, on) => {
        const room = joinLive(file, on);
        const leave = own(p.id, () => room.close());
        return { ...room, close: leave };
      },
    },
    shell: {
      menu: (where, fn) => own(p.id, registerMenu(p.id, where, fn)),
      sideTool: (t) => {
        // a side tool is a block that lives in the side zone: registered as one, then listed as a tool
        const type = `${p.id}.${t.id}`;
        const offBlock = registerBlock({ type, title: t.title, mount: (host) => { try { return t.mount(host); } catch (e) { logPlugin(p.id, `side tool ${t.id}`, e); throw e; } } });
        const offTool = addSideTool({ plugin: p.id, type, title: t.title, icon: t.icon && isIconName(t.icon) ? t.icon : "plugin" });
        const offCmd = addCommand(p.id, { id: `side.${t.id}`, title: `Side panel: ${t.title}`, run: () => openSide(toolId(type)) });
        return own(p.id, () => { offCmd(); offTool(); offBlock(); });
      },
      statusItem: (it) => { const h = addStatusCell(p.id, it); own(p.id, h.remove); return h; },
      greetingItem: (it) => { const h = addGreetingChip(p.id, it); own(p.id, h.remove); return h; },
    },
    capture: (text) => api.capture(String(text)),
    // one exclusive write on the server: no probing GET, so no 404 in the console and no race with another writer
    createFile: async (path, text) => (await api.createFile(path, text)).written,
  };
}

// flat options → the YAML a block reads (`{type: runs.plot, y: [n]}` → "type: runs.plot\ny: [\"n\"]")
const stringifyBlock = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n") + "\n";
