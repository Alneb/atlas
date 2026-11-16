// Settings → Plan: why you are (or are not) nudged — the day's budget as measured from the ledger, each open task's
// next nudge or what holds it back, and the ledger's last lines. Read from the helper's `explain` (nothing written).

/** One line of text in an element. */
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

const STYLE = `
.plan-why { display: grid; gap: 10px; font-size: 0.92em; }
.plan-why h4 { margin: 0; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); font-weight: 600; }
.plan-why ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; }
.plan-why ul.next { gap: 6px; }
.plan-why ul.ledger { gap: 4px; }
.plan-why li { display: flex; gap: 8px; min-width: 0; }
.plan-why .when { flex: none; width: 6.5em; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.plan-why .what { flex: 1; min-width: 0; display: grid; overflow-wrap: anywhere; }
.plan-why .why { color: var(--text-muted); font-size: 0.92em; }
.plan-why .muted { color: var(--text-muted); }
.plan-why .ledger li { display: block; font-variant-numeric: tabular-nums; font-size: 0.92em; color: var(--text-muted); overflow-wrap: anywhere; }
`;

/** "2026-11-16T14:00:00+01:00" → "Mon 14:00" (the device's own reading of the offset is not needed: it is local). */
function short(at) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(at || "");
  if (!m) return "—";
  const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]} ${m[4]}`;
}

/** A ledger line as read: `[[notes/Thesis#^t1|Write]]` → "Write", `[[notes/Thesis]]` → "Thesis". */
function readable(line) {
  return line.replace(/^- /, "").replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, target, label) => label || target.split("#")[0].split("/").pop());
}

function draw(host, r) {
  host.replaceChildren();
  const root = el("div", undefined, "plan-why");
  root.append(el("style", STYLE));
  const b = r.budget;
  const budget = b.measured
    ? `${b.perDay} nudges a day, ${b.gap} min apart — measured from ${b.days} days: ${b.nudges} nudges, ${b.acted} acted on.`
    : `${b.perDay} nudges a day, ${b.gap} min apart — until the ledger has 14 days (${b.days} so far).`;
  root.append(el("div", budget));
  if (!r.plans) root.append(el("div", `${r.device} does not run this vault's schedules ([automation] schedules_on): it does not nudge.`, "muted"));
  root.append(el("h4", "Next"));
  const next = el("ul", undefined, "next");
  const decisions = [...r.decisions].sort((a, b) => String(a.at || "~").localeCompare(String(b.at || "~")));
  for (const d of decisions.slice(0, 20)) {
    const li = el("li");
    const what = el("span", undefined, "what");
    what.append(el("span", d.title), el("span", d.why, "why"));
    li.append(el("span", d.at ? short(d.at) : "not nudged", "when"), what);
    li.title = `${d.path} · score ${d.score}`;
    next.append(li);
  }
  if (!decisions.length) next.append(el("li", "No open task may nudge now.", "muted"));
  root.append(next);
  root.append(el("h4", "Ledger"));
  const ledger = el("ul", undefined, "ledger");
  for (const l of r.recent) ledger.append(el("li", readable(l)));
  if (!r.recent.length) ledger.append(el("li", "Nothing recorded yet."));
  root.append(ledger);
  host.append(root);
}

export function register(atlas) {
  atlas.plugin.registerSettingsSection?.({
    id: "why", title: "Why now?", place: "after",
    hint: "The budget as measured, each task's next nudge or what holds it back, and the ledger's last lines.",
    mount(host, ctx) {
      host.textContent = "Reading the plan…";
      ctx.call("explain", {}, 30).then((r) => draw(host, r), (e) => { host.textContent = `The plan could not be read: ${e?.message ?? e}`; });
      return () => host.replaceChildren();
    },
  });
}
