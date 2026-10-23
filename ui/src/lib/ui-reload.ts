// A new interface reloads into the open window (no restart): the desktop app serves the UI from
// the installed folder (atlas-core ui_files.rs), and when its build changes the page saves every
// open editor and reloads. The layout is a file, so the tabs come back as they were — and so do the
// terminals: a core that keeps them across a reload says `terminals_survive` (pty.rs). An older core
// killed every shell and Claude session in them ("it reset"), so then the page does not reload by
// itself while a terminal is open: it says so once, and "Reload the interface" does it when wanted.
import { parkAll, terminals } from "./registry";
import { toast } from "./state.svelte";
import { apiBase } from "./api";

const EVERY_MS = 15_000; // one tiny request; the window stays idle otherwise

type Build = { build: string; terminals_survive?: boolean };

async function build(): Promise<Build | null> {
  try {
    const r = await fetch(`${apiBase()}/api/ui/build`, { headers: { "x-atlas": "1" } });
    return r.ok ? ((await r.json()) as Build) : null;
  } catch { return null; }
}

/** Saves every open note (a code file keeps its recovery copy), then reloads the page. */
export async function reloadInterface(): Promise<void> {
  await Promise.allSettled(parkAll());
  location.reload();
}

/** Whether reloading now would end running terminals. */
export const reloadKillsTerminals = (b: Build) => !b.terminals_survive && terminals.size > 0;

export async function watchUiBuild(): Promise<void> {
  const mine = (await build())?.build;
  if (!mine || mine === "built-in") return; // the UI inside the program changes only with the program
  let told = "";
  setInterval(async () => {
    const now = await build();
    if (!now || now.build === mine) return;
    if (reloadKillsTerminals(now)) {
      if (told !== now.build) toast("Atlas was updated", "Not reloaded: the terminals would end. Run “Reload the interface” when ready, or restart Atlas.", "info", 12_000);
      told = now.build;
      return;
    }
    toast("Atlas was updated", "Saving and reloading the interface…", "info", 3000);
    await reloadInterface();
  }, EVERY_MS);
}
