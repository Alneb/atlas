// "Show in the explorer" (Atlas's, at the file's folder) and "Show in the system's file manager" (the desktop's own,
// the file selected): the same two items in a tab's menu and the file tree's.
import { api } from "./api";
import { open } from "./dock";
import { basename, dirOf } from "./paths";
import { me } from "./me.svelte";
import { phone } from "./phone.svelte";
import { nativeShell } from "./native-shell.svelte";
import { toast } from "./state.svelte";
import { errText } from "./text";
import type { IconName } from "./panes";

export function revealItems(path: string, isDir = false): { label: string; icon: IconName; run: () => void }[] {
  const dir = isDir ? path : dirOf(path);
  const items: { label: string; icon: IconName; run: () => void }[] = [
    // at the file's folder with the file selected (an explorer already open goes there: dock.ts explorerGo)
    { label: "Show in the explorer", icon: "folder-open", run: () => { open({ kind: "explorer", source: "vault", place: "", path: dir, ...(isDir ? {} : { select: basename(path) }) }); } },
  ];
  // only the desktop has a file manager of its own to show it in (not a server's page, not a phone)
  if (!me.info?.server && !phone.on && !nativeShell.on) {
    items.push({ label: "Show in the system's file manager", icon: "folder", run: () => void api.revealOutside(path).catch((e) => toast("Not shown", errText(e), "error")) });
  }
  return items;
}
