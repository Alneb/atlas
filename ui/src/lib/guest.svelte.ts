// A guest folder's window (core guest.rs, docs/design/DESIGN-guest-folder.md): an outside folder opened for a while with
// this vault's plugins, never remembered, read-only until the window's Edit switch is on. Here: whether this window is
// one, the switch, and the editors' read-only state that follows it.
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { api, ApiError, ownCore } from "./api";
import { errText } from "./text";
import { toast } from "./state.svelte";
import type { GuestInfo } from "./gen/GuestInfo";

export const guest = $state<{ info: GuestInfo | null }>({ info: null });

const slot = new Compartment();
const views = new Set<EditorView>();
const locked = (): Extension => (guest.info && !guest.info.editing ? EditorState.readOnly.of(true) : []);

/** Every editor of the window carries it: read-only while a guest's Edit is off (the caret, selection and copy stay). */
export function guestLock(): Extension {
  return [slot.of(locked()), ViewPlugin.define((v) => { views.add(v); return { destroy: () => { views.delete(v); } }; })];
}

function relock(): void {
  for (const v of views) v.dispatch({ effects: slot.reconfigure(locked()) });
}

/** How often a guest's window asks whether it is still served (closed from Settings → Vaults of another window). */
const STILL_OPEN_MS = 5_000;

/** Asked once at the window's start; a guest's window then closes itself once its guest is closed. */
export async function loadGuest(): Promise<void> {
  guest.info = await api.guest().catch(() => null);
  if (!guest.info) return;
  relock();
  let t: ReturnType<typeof setInterval> | undefined = undefined;
  const gone = () => { clearInterval(t); window.close(); };
  // a closed guest's address is no vault any more (404); another failure (the core restarting) is not a close
  t = setInterval(() => {
    api.guest().then((g) => { if (!g) gone(); }, (e) => { if (e instanceof ApiError && e.status === 404) gone(); });
  }, STILL_OPEN_MS);
}

/** Closes the guest at `folder` without a restart (core `POST /api/guests/close`); its window closes with it. */
export async function closeGuest(folder: string): Promise<boolean> {
  try {
    await api.guestClose(folder);
    if (guest.info?.folder === folder) window.close();
    return true;
  } catch (e) { toast("The guest folder was not closed", errText(e), "error"); return false; }
}

export async function setGuestEditing(on: boolean): Promise<void> {
  try {
    guest.info = await api.guestEdit(on);
    relock();
  } catch (e) { toast("Edit was not switched", errText(e), "error"); }
}

/** Opens `path` as a guest of this window's vault, in a window of its own; a folder that is a vault opens as one. */
export async function openGuest(path: string): Promise<void> {
  try {
    const r = await ownCore<{ url?: string; guest?: boolean }>("POST", "/api/vaults/open", { path, guest: true });
    if (!r?.url) return;
    if (r.guest) window.open(`${r.url}?guest=1`, "_blank");
    else { toast("That folder is a vault", "It opens as one, here.", "info"); location.replace(r.url); }
  } catch (e) { toast("The folder was not opened", errText(e), "error", 9000); }
}
