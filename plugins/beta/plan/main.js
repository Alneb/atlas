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
  // presence (§3.2): a nudge due now waits while no one has used this device for 30 min, unless it is urgent
  root.append(el("div", r.used ? `${r.device} last used ${short(r.used)} — a nudge due now waits while no one has used it for 30 min, unless it is urgent.` : `${r.device} does not say whether someone is using it: nudges are not held for it.`, "muted"));
  // the device rule (§3.7): the computer used in the last 5 min, else a phone running Atlas, else the planner
  const says = r.at
    ? r.at.here
      ? `Nudges ring here: ${r.at.why}.${r.plans ? "" : " This device plans for itself while you are at it."}`
      : `Nudges ring on ${r.at.name}: ${r.at.why}.${r.plans ? " This device still writes plan/next.md." : ""}`
    : !r.plans
      ? r.local
        ? `${r.device} does not run this vault's schedules, but plans for itself: ${r.local} (plan/next.md older than 2 hours).`
        : `${r.device} does not run this vault's schedules ([automation] schedules_on): the planner's nudges ring there.`
      : null;
  if (says) root.append(el("div", says, "muted"));
  // a phone trusted with a nudge while its app is closed: it set an exact alarm for it (§3.7)
  for (const h of r.handed || []) root.append(el("div", `A nudge rings on ${h.name}: ${h.why}.`, "muted"));
  // the quiet hours measured from the devices' use (§3.3a): proposed here, used only with "Quiet hours measured" on
  const q = r.quiet;
  if (q) {
    const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;
    const range = q.from !== null ? `${hh(q.from)}–${hh(q.to)}` : null;
    root.append(el("div", !q.measured
      ? `Quiet hours are measured once your devices' use is known for 14 days (${q.days} so far).`
      : !range
        ? `Quiet hours measured from ${q.days} days of use: no hour was unused on 80 % of them.`
        : q.used
          ? `Quiet hours measured from ${q.days} days of use: ${range} — in use (Quiet hours measured is on).`
          : `Quiet hours measured from ${q.days} days of use: ${range} — turn on “Quiet hours measured” to use them instead of the range set.`,
    "muted"));
  }
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
  // when each kind of task gets done (the habit of the hour): its busiest hours, once it moves nudges
  const habits = (r.habits || []).filter((h) => h.done > 0);
  if (habits.length) {
    root.append(el("h4", "When you get things done"));
    const list = el("ul", undefined, "next");
    for (const h of habits.slice(0, 8)) {
      const top = h.hours.map((n, i) => [n, i]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => `${String(i).padStart(2, "0")}:00`);
      const what = el("span", undefined, "what");
      what.append(el("span", h.group), el("span", h.done >= r.habitMin ? `most often ${top.join(", ")}` : `${h.done} of ${r.habitMin} done times before it moves nudges`, "why"));
      const li = el("li");
      li.append(el("span", `${h.done} done`, "when"), what);
      list.append(li);
    }
    root.append(list);
  }
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
