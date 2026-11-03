// Runs in every frame of Atlas's window (main.rs, `initialization_script_for_all_frames`), and acts only in a web tab's
// frame (a direct child of Atlas's page): what the native view's page script does (webtab.rs KEYS), through
// postMessage — the page's address, title and history to the pane (ui/src/panes/Web.svelte), the pane's back /
// forward / reload / find to the page, Atlas's keys back to Atlas, Shift+click to the system's browser.
(() => {
  if (window === window.top || window.parent !== window.top) return;
  const say = (m) => window.parent.postMessage({ atlasFrame: m }, "*");
  let last = "";
  const where = () => {
    const now = JSON.stringify([location.href, document.title, history.length]);
    if (now !== last) { last = now; say({ url: location.href, title: document.title, back: history.length > 1, forward: false, loading: document.readyState !== "complete" }); }
  };
  for (const ev of ["DOMContentLoaded", "load", "popstate", "hashchange"]) addEventListener(ev, where);
  for (const k of ["pushState", "replaceState"]) {
    const f = history[k];
    history[k] = function (...a) { const r = f.apply(this, a); setTimeout(where); return r; };
  }
  setInterval(where, 1000); // a title set by script (a chat's unread count): nothing else tells
  // the pane's requests (only from Atlas's page, the parent)
  let hits = [];
  addEventListener("message", (e) => {
    const d = e.source === window.parent && e.data && e.data.atlasFrameDo;
    if (!d) return;
    if (d.op === "back") history.back();
    else if (d.op === "forward") history.forward();
    else if (d.op === "reload") location.reload();
    else if (d.op === "find" && d.text) {
      // WebKit's window.find: next / previous match, wrapping; the count from the page's text
      const text = (document.body && document.body.innerText) || "", needle = d.text.toLowerCase();
      let n = 0;
      for (let i = text.toLowerCase().indexOf(needle); i >= 0 && n < 9999; i = text.toLowerCase().indexOf(needle, i + needle.length)) n++;
      if (d.step !== 0 || !hits.length) window.find(d.text, false, d.step === -1, true);
      hits = [d.text];
      say({ found: n });
    } else if (d.op === "findend") { hits = []; const s = getSelection(); if (s) s.removeAllRanges(); }
  });
  // Atlas's keys in the page, as webtab.rs KEYS
  let sup = false;
  const isSup = (e) => /^(Meta|OS|Super|Hyper)(Left|Right)?$/.test(e.key) || /^(Meta|OS|Super|Hyper)(Left|Right)?$/.test(e.code);
  addEventListener("keyup", (e) => { if (isSup(e)) sup = false; }, true);
  addEventListener("blur", () => { sup = false; });
  addEventListener("keydown", (e) => {
    if (isSup(e)) { sup = true; return; }
    if (["Shift", "Control", "Alt", "AltGraph"].includes(e.key)) return;
    const meta = e.metaKey || sup || e.getModifierState("Super") || e.getModifierState("OS");
    const k = e.key.toLowerCase(), plain = !e.altKey && !meta;
    const send = (m) => { e.preventDefault(); e.stopImmediatePropagation(); say(m); };
    if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); history.back(); }
    else if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); history.forward(); }
    else if (e.key === "F5" || (e.ctrlKey && plain && !e.shiftKey && k === "r")) { e.preventDefault(); location.reload(); }
    else if (e.ctrlKey && plain && !e.shiftKey && k === "w") send({ action: "close" });
    else if (e.ctrlKey && plain && !e.shiftKey && k === "p") send({ action: "files" });
    else if (e.key === "F1") send({ action: "palette" });
    else if (e.ctrlKey && plain && !e.shiftKey && k === "l") send({ action: "address" });
    else if (e.ctrlKey && plain && !e.shiftKey && k === "f") send({ action: "find" });
    else if (meta) send({ key: { key: e.key, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey } });
  }, true);
  // Shift+click on a link: the system's browser (the pane asks the core; only http, https and mailto go out)
  addEventListener("click", (e) => {
    if (!e.shiftKey || e.button !== 0 || !e.isTrusted) return;
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a || !/^(https?|mailto):/i.test(a.href)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    say({ external: a.href });
  }, true);
})();
