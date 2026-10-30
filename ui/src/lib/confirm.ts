// The app's own questions (components/InputDialog.svelte): a yes/no, or a line of text. Themed, focus kept inside and
// given back, Esc cancels; what commands and plugins (`atlas.confirm`, `atlas.input`) ask instead of window.confirm /
// window.prompt, which are unthemed and blocked in some webviews.
import { mount, unmount } from "svelte";
import InputDialog from "../components/InputDialog.svelte";

type Asked = { title: string; value?: string; hint?: string; ok?: string; confirm?: string; danger?: boolean };

function ask<T>(props: Asked, yes: (v: string) => T, no: T): Promise<T> {
  return new Promise((done) => {
    const host = document.body.appendChild(document.createElement("div"));
    let app: ReturnType<typeof mount> | null = null;
    const end = (r: T) => { if (app) void unmount(app); app = null; host.remove(); done(r); };
    app = mount(InputDialog, { target: host, props: { ...props, onsubmit: (v: string) => end(yes(v)), oncancel: () => end(no) } });
  });
}

/** Whether the user said yes. `danger`: the button in red (deleting, discarding); default yes. */
export function confirmDialog(title: string, hint: string, confirm: string, danger = true): Promise<boolean> {
  return ask({ title, hint, confirm, danger }, () => true, false);
}

/** The line typed (trimmed, never empty), or null when cancelled. `ok`: the button's verb. */
export function inputDialog(title: string, value = "", hint = "", ok = "OK"): Promise<string | null> {
  return ask<string | null>({ title, value, hint, ok }, (v) => v, null);
}
