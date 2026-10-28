// The recovery copy of a file whose save failed as its tab closed (.atlas/cache/recovery/<path>): written, and the
// toast says where it is only when it was — a failed copy says the work is lost instead of claiming it is kept.
import { api } from "./api";
import { errText } from "./text";
import { shownPath } from "./paths";
import { toast } from "./state.svelte";

export const recoveryPath = (path: string) => `.atlas/cache/recovery/${path}`;

export async function keepRecovery(path: string, text: string, kept: string): Promise<boolean> {
  try {
    await api.putFile(recoveryPath(path), text);
    toast(`${shownPath(path)} could not be saved`, kept, "error", 12000);
    return true;
  } catch (e) {
    toast(`${shownPath(path)} could not be saved, nor kept`, `Its recovery copy failed too (${errText(e)}): the unsaved changes are lost.`, "error", 20000);
    return false;
  }
}
