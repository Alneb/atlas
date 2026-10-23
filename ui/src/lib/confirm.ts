// A themed yes/no question for a command (components/InputDialog.svelte in confirm mode): whether the user said yes.
import { mount, unmount } from "svelte";
import InputDialog from "../components/InputDialog.svelte";

export function confirmDialog(title: string, hint: string, confirm: string): Promise<boolean> {
  return new Promise((done) => {
    const host = document.body.appendChild(document.createElement("div"));
    let app: ReturnType<typeof mount> | null = null;
    const end = (yes: boolean) => { if (app) void unmount(app); app = null; host.remove(); done(yes); };
    app = mount(InputDialog, { target: host, props: { title, hint, confirm, onsubmit: () => end(true), oncancel: () => end(false) } });
  });
}
