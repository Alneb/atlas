// Which Svelte component draws each pane kind. A Record over PaneKind: a kind without a loader is a
// type error. Each loads on first use (CodeMirror, pdf.js, xterm stay out of the startup bundle).
// Shared by the dock (a pane in a tab) and the block registry (the same pane embedded in a page or note).
import type { PaneComponents } from "./dock";

export const paneComponents: PaneComponents = {
  today: () => import("../panes/Today.svelte"),
  editor: () => import("../panes/Editor.svelte"),
  terminal: () => import("../panes/Terminal.svelte"),
  files: () => import("../panes/Files.svelte"),
  explorer: () => import("../panes/Explorer.svelte"),
  search: () => import("../panes/Search.svelte"),
  pdf: () => import("../panes/Pdf.svelte"),
  image: () => import("../panes/Image.svelte"),
  web: () => import("../panes/Web.svelte"),
  settings: () => import("../panes/Settings.svelte"),
  git: () => import("../panes/Git.svelte"),
  commit: () => import("../panes/Commit.svelte"),
  diff: () => import("../panes/Diff.svelte"),
  table: () => import("../panes/Table.svelte"),
  base: () => import("../panes/Base.svelte"),
  page: () => import("../panes/Page.svelte"),
  excalidraw: () => import("../panes/Excalidraw.svelte"),
  plugin: () => import("../panes/Plugin.svelte"),
  library: () => import("../panes/Library.svelte"),
  libraries: () => import("../panes/Libraries.svelte"),
  outline: () => import("../panes/Outline.svelte"),
  commands: () => import("../panes/Commands.svelte"),
  graph: () => import("../panes/Graph.svelte"),
  block: () => import("../panes/Block.svelte"),
};
