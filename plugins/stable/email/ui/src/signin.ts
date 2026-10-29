// Outlook's sign-in, the way Thunderbird does it (the card's flow): automatic — Microsoft's page in the user's own
// browser, the answer caught on localhost by the engine; code — a device code typed at microsoft.com/devicelogin;
// window — Atlas's sign-in window, whose return address finishes it (pasted, in a browser). The engine keeps the
// refresh token in Atlas's secret store (oauth.rs).
import { call, type PluginApi } from "./api";

type Card = { name: string; auth?: string; user?: string };
const cards = (atlas: PluginApi) => ((atlas.plugin.settings.accounts as Card[] | undefined) ?? []).filter((c) => c?.name);

let running = false; // one sign-in at a time: a second start would open Microsoft's page twice

export async function signin(atlas: PluginApi, name?: string | Card): Promise<void> {
  if (running) return;
  running = true;
  try { await signinOnce(atlas, name); } finally { running = false; }
}

async function signinOnce(atlas: PluginApi, name?: string | Card): Promise<void> {
  const record = typeof name === "object" ? name : undefined;
  let account = typeof name === "string" ? name : record?.name;
  if (!account) {
    const outlook = cards(atlas).filter((a) => a.auth === "outlook");
    if (outlook.length > 1) {
      atlas.pick({ placeholder: "Sign in which account?", tag: "Outlook", items: outlook.map((a) => ({ value: a.name, title: a.name, detail: a.user })), onpick: (n) => { setTimeout(() => void signin(atlas, n)); } });
      return;
    }
    if (!outlook.length) { atlas.toast("Outlook sign-in", "No account signs in with Outlook: set one's Sign-in to outlook in Email's settings."); return; }
    account = outlook[0].name;
  }
  const done = () => {
    atlas.toast("Signed in to Outlook", `${account}: its mail can be read now.`, "success");
    window.dispatchEvent(new CustomEvent("atlas-email:signed-in", { detail: { account } }));
    void call(atlas, "watch", {}, 30).catch(() => {});
  };
  const fail = (e: unknown) => atlas.toast("Outlook sign-in", String((e as Error)?.message ?? e), "error");
  try {
    const start = await call<{ flow: string; url: string; opened?: boolean; code?: string; redirect?: string }>(atlas, "signin_start", record ? { record } : { account }, 60);
    // the automatic and code flows belong to the user's own browser: the engine opens it, here and when asked again
    const open = () => void call(atlas, "signin_reopen", { url: start.url }).catch(() => window.open(start.url, "_blank"));
    if (start.flow === "automatic") {
      if (!start.opened) open();
      const close = atlas.pick({ placeholder: `Sign in as ${account} in your browser — Atlas finishes by itself when Microsoft sends you back`, tag: "Outlook", items: [{ value: "open", title: "Open the Microsoft page again", detail: start.url }], onpick: () => { open(); } });
      try { await call(atlas, "signin_finish", { account }, 660); } finally { close(); }
      return done();
    }
    if (start.flow === "code") {
      await navigator.clipboard?.writeText(start.code ?? "").catch(() => {});
      if (!start.opened) open();
      const close = atlas.pick({ placeholder: `Type ${start.code} (copied) on the Microsoft page and sign in as ${account}. Atlas finishes by itself…`, tag: "Outlook", items: [{ value: "open", title: "Open the Microsoft page again", detail: start.url }], onpick: () => { open(); } });
      try { await call(atlas, "signin_finish", { account }, 900); } finally { close(); }
      return done();
    }
    let settled = false;
    const finish = (redirect: string) => { if (settled) return; settled = true; call(atlas, "signin_finish", { redirect, account }, 60).then(done, fail); };
    const back = atlas.signIn ? atlas.signIn(start.url, start.redirect ?? "https://localhost") : (window.open(start.url, "_blank"), null);
    const close = atlas.pick({ placeholder: `Sign in as ${account} in the window that opened. If it ends on a page that does not load, paste its https://localhost/… address here`, tag: "Outlook", items: [], typed: () => "Finish signing in", onpick: finish });
    back?.then((url) => { close(); finish(url); }, () => {});
  } catch (e) { fail(e); }
}
