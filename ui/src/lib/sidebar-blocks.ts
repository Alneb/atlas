// The sidebar's own parts as blocks: what `.atlas/sidebar.page` arranges (docs/design/SHELL.md). Being
// blocks, they also work on any page. Imported once by the shell (App.svelte).
import type { Component } from "svelte";
import { registerBlock, svelteBlock, type BlockCtx } from "./blocks";
import type { IconName } from "./panes";
import SideToolbar from "../components/sidebar/SideToolbar.svelte";
import SidePins from "../components/sidebar/SidePins.svelte";
import SideTabs from "../components/sidebar/SideTabs.svelte";
import Bookmarks from "../components/sidebar/Bookmarks.svelte";

const shell = (type: string, title: string, icon: IconName, C: Component<never>, props: (c: BlockCtx) => Record<string, unknown> = (c) => ({ host: c.host })) =>
  registerBlock({ ...svelteBlock(type, title, C, props), icon, bare: true });

shell("toolbar", "Toolbar (buttons that run commands)", "command", SideToolbar as Component<never>, (c) => ({ items: c.options.items, host: c.host }));
shell("pins", "Pinned tabs", "pin", SidePins as Component<never>);
shell("bookmarks", "Bookmarks", "pin", Bookmarks as Component<never>);
shell("tabs", "Open tabs", "panel-left", SideTabs as Component<never>);
