// Buttons plugins put on their own agents' terminal tabs (`atlas.terminal.button`, API 36): a plugin that declares an
// agent (`[[agent]]`) adds what belongs to that agent's tabs — the Claude plugin's "rendered conversation" — and the
// app draws them in the terminal's corner. The app knows nothing of what a button does: `run` gets the tab.
import type { IconName } from "./panes";

/** The tab a button was pressed on. `session`: the tab's own session id (its agent may have moved the conversation
 *  since; the plugin reads where to). `show()`: brings the tab to the front with the keys in it. */
export interface TerminalTab { id: string; agent: string; session?: string; show(): void }
export interface TerminalButton { plugin: string; id: string; title: string; icon?: IconName; run(tab: TerminalTab): void | Promise<void> }

export const terminalButtons = $state<TerminalButton[]>([]);

/** Adds `b` for its plugin's agent tabs; returns its removal (the plugin unloading). */
export function addTerminalButton(b: TerminalButton): () => void {
  terminalButtons.push(b);
  return () => {
    const i = terminalButtons.findIndex((x) => x.plugin === b.plugin && x.id === b.id);
    if (i >= 0) terminalButtons.splice(i, 1);
  };
}
