// TTRPG — an example plugin (docs/guides/PLUGINS.md). Everything here reloads when this file is saved.
//
// In a note:
//   ```statblock            a creature's card             ```roll          one button per line,
//   name: Goblin                                           attack: d20+4    each rolls its dice
//   ac: 15                                                 damage: 1d6+2
//   hp: 2d6                                                ```
//   ```
// In a page or a note:  ```view / type: ttrpg.initiative   — the characters, by their `initiative`
// Commands (palette, bindable): "TTRPG: roll…", "TTRPG: new session note".

/** "2d6+3", "d20", "4d8-1" → { total, text } ; null when it is not a dice expression. */
export function roll(expr, random = Math.random) {
  const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(expr);
  if (!m) return null;
  const n = Math.min(Number(m[1] || 1), 100), sides = Number(m[2]), bonus = Number((m[3] ?? "0").replace(/\s+/g, ""));
  if (!n || !sides) return null;
  const dice = Array.from({ length: n }, () => 1 + Math.floor(random() * sides));
  const total = dice.reduce((a, b) => a + b, 0) + bonus;
  return { total, text: `${expr.trim()} → ${dice.join(" + ")}${bonus ? ` ${bonus > 0 ? "+" : "−"} ${Math.abs(bonus)}` : ""} = ${total}` };
}

/** `key: value` lines → an object (the tiny format the fences use, so a note stays readable as text). */
const pairs = (source) => Object.fromEntries(source.split("\n").map((l) => l.match(/^\s*([^:]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1].trim().toLowerCase(), m[2].trim()]));
const el = (tag, style, text) => { const e = document.createElement(tag); if (style) e.style.cssText = style; if (text !== undefined) e.textContent = text; return e; };

export function register(atlas) {
  const settings = atlas.plugin.settings;
  const last = atlas.shell.statusItem({ id: "last", text: "🎲", title: "The last roll (click: roll the default die)", run: () => say(settings.die) });
  function say(expr) {
    const r = roll(expr);
    if (!r) return atlas.toast("TTRPG", `“${expr}” is not dice — write 2d6+3, d20, 4d8-1`, "error");
    last.set(`🎲 ${r.total}`, r.text);
    if (settings.loud) atlas.toast(String(r.total), r.text);
    return r;
  }

  // ```statblock: the app's own colours (CSS variables), so the card follows the theme
  atlas.editor.registerFence("statblock", (host, fence) => {
    const s = pairs(fence.source), { name = "Unnamed", ...rest } = s;
    const card = el("div", "border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--radius); padding: 10px 14px; background: var(--bg-elev); margin: 6px 0");
    card.append(el("div", "font-weight: 600; font-size: 1.1em; color: var(--text)", name));
    const grid = el("div", "display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 6px");
    for (const [k, v] of Object.entries(rest)) {
      const cell = el("span", "color: var(--text-muted)");
      cell.append(el("b", "color: var(--text-faint); font-weight: 500; text-transform: uppercase; font-size: .78em; letter-spacing: .05em; margin-right: 6px", k));
      // a value that is dice is a button
      if (roll(v)) { const b = el("button", "color: var(--accent); cursor: pointer", v); b.title = "Roll"; b.onclick = () => say(v); cell.append(b); }
      else cell.append(v);
      grid.append(cell);
    }
    card.append(grid);
    host.append(card);
  });

  // ```roll: a button per line
  atlas.editor.registerFence("roll", (host, fence) => {
    const row = el("div", "display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0");
    for (const [label, expr] of Object.entries(pairs(fence.source))) {
      const b = el("button", "border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 3px 10px; color: var(--text); background: var(--bg-elev); cursor: pointer", `${label} ${expr}`);
      b.onclick = () => say(expr);
      row.append(b);
    }
    host.append(row);
  });

  // a block: every note with `type: character`, ordered by its `initiative` property
  atlas.registerBlock("ttrpg.initiative", (host) => {
    const draw = async () => {
      // Bases YAML over all notes: the one column asked for comes back per row (`edit`: its raw text)
      const res = await atlas.query("filters: 'type == \"character\"'\nviews:\n  - type: table\n    order: [initiative]\n");
      const rows = (res.views?.[0]?.rows ?? []).map((r) => ({ path: r.path, name: r.path.split("/").pop().replace(/\.md$/, ""), init: Number(r.edit?.[0] ?? 0) || 0 })).sort((a, b) => b.init - a.init);
      host.replaceChildren(...(rows.length ? rows.map((r) => {
        const line = el("button", "display: flex; gap: 10px; width: 100%; padding: 3px 0; text-align: left; color: var(--text); cursor: pointer");
        line.append(el("b", "width: 2.5em; color: var(--accent); font-variant-numeric: tabular-nums", String(r.init)), el("span", "", r.name));
        line.onclick = () => atlas.open(r.path);
        return line;
      }) : [el("p", "color: var(--text-faint)", "No notes with type: character yet.")]));
    };
    void draw();
    return atlas.onFilesChanged(() => void draw());
  }, { title: "Initiative" });

  atlas.registerCommand({ id: "roll", title: "TTRPG: roll…", run: () => atlas.pick({
    placeholder: `Dice to roll (2d6+3) — Enter alone rolls ${settings.die}`, tag: "Roll", items: [{ value: settings.die, title: `Roll ${settings.die}` }],
    typed: (t) => `Roll ${t}`, onpick: (v) => void say(v),
  }) });

  atlas.registerCommand({ id: "session", title: "TTRPG: new session note", run: async () => {
    const day = new Date().toISOString().slice(0, 10), path = `${String(settings.sessions).replace(/\/+$/, "")}/Session ${day}.md`;
    const made = await atlas.createFile(path, `---\ntype: session\ndate: ${day}\n---\n# Session ${day}\n\n## Recap\n\n## What happened\n\n## Loot and threads\n`);
    atlas.open(path);
    if (!made) atlas.toast("TTRPG", "Today's session note was already there.");
  } });

  // the editor's right-click menu: roll what is selected, when it is dice
  atlas.shell.menu("editor", (t) => (roll(t.selection ?? "") ? [{ label: `Roll ${t.selection.trim()}`, icon: "refresh", run: () => void say(t.selection) }] : []));
}
