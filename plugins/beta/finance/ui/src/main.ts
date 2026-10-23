// The Finance plugin's page side: its pane on a command, and its blocks (DESIGN-finance "UI").
import { mount, unmount } from "svelte";
import Block, { type Kind } from "./Block.svelte";
import type { PluginApi } from "./api";

const BLOCKS: [Kind, string][] = [["balance", "Finance: balances"], ["spending", "Finance: this month"], ["register", "Finance: register"]];

export function register(atlas: PluginApi) {
  atlas.registerCommand({ id: "open", title: "Finance", run: () => atlas.openView(undefined, { title: "Finance", icon: "chart" }) });
  atlas.registerCommand({ id: "review", title: "Finance: review", run: () => atlas.openView("review", { title: "Finance", icon: "chart" }) });
  for (const [kind, title] of BLOCKS) {
    atlas.registerBlock(`finance.${kind}`, (host, block) => {
      const b = mount(Block, { target: host, props: { atlas, kind, options: block.options } });
      return () => unmount(b);
    }, {
      title,
      options: [
        ...(kind === "register" ? [{ key: "account", label: "Account", kind: "text" as const, hint: "Assets:Revolut, Expenses:Food…" }] : []),
        { key: "limit", label: "Rows", kind: "number" as const },
      ],
    });
  }
}
