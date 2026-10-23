// Checks a LaTeX Suite snippets file for entries that can never fire: a second definition of the same
// trigger, and auto triggers whose first letters are another auto trigger (which fires first).
// Usage: node scripts/dev/check-snippets.js <snippets file> <variables file>   (read-only)
const fs = require("fs");
const src = fs.readFileSync(process.argv[2], "utf8");
const vars = new Function(`return (${fs.readFileSync(process.argv[3], "utf8")});`)();
const arr = new Function(`return (${src.trim().replace(/;\s*$/, "")});`)();
const lineOf = (t) => { const i = src.indexOf(typeof t === "string" ? JSON.stringify(t).slice(1, -1) : String(t)); return i < 0 ? "?" : src.slice(0, i).split("\n").length; };
console.log("entries:", arr.length);
const visual = (s) => typeof s.replacement === "string" && s.replacement.includes("${VISUAL}"); // needs a selection: never fires while typing
const seen = new Map(); let bad = 0;
// display-only (M) and inline-only (n) are different places: the same trigger may have one of each
const modes = (o) => (/t/.test(o) ? "t" : "") + (/M/.test(o) ? "M" : /n/.test(o) ? "n" : /m/.test(o) || !/[tc]/.test(o) ? "Mn" : "") + (/c/.test(o) ? "c" : "");
arr.forEach((s, i) => {
  if (!s || s.trigger == null || s.replacement == null) { console.log("MISSING trigger/replacement at entry", i, JSON.stringify(s)); bad++; return; }
  const o = String(s.options ?? "");
  if (/[^tmMncArwv]/.test(o)) console.log(`UNKNOWN option letter in "${o}" — trigger ${s.trigger} (line ${lineOf(s.trigger)})`);
  if (typeof s.trigger === "string" && o.includes("r")) { let t = s.trigger; for (const k in vars) t = t.split(k).join(vars[k]); try { new RegExp(t); } catch (e) { console.log("BAD REGEX", s.trigger, e.message); } }
  if (typeof s.trigger === "string" && !o.includes("r") && /\$\{[A-Z_]+\}/.test(s.trigger)) console.log("VARIABLE in a non-regex trigger (never matches):", s.trigger);
  if (typeof s.replacement === "function" && !o.includes("r") && !(s.trigger instanceof RegExp)) console.log(`FUNCTION replacement without a regex (gets no match) — ${s.trigger} line ${lineOf(s.trigger)}`);
  if (visual(s)) return;
  const key = `${s.trigger instanceof RegExp ? "re:" + s.trigger.source : (o.includes("r") ? "re:" : "") + s.trigger}|${modes(o)}`;
  if (seen.has(key)) { const p = seen.get(key); console.log(`DUPLICATE ${JSON.stringify(String(s.trigger))} [${o}] entries ${p.i} and ${i}: ${JSON.stringify(String(p.s.replacement)).slice(0, 50)} vs ${JSON.stringify(String(s.replacement)).slice(0, 50)}`); }
  else seen.set(key, { i, s });
});
// an auto plain trigger that ends with another earlier/higher auto trigger in the same mode can never be typed
const auto = arr.filter((s) => s && typeof s.trigger === "string" && !String(s.options).includes("r") && String(s.options).includes("A") && !visual(s));
const said = new Set();
for (const a of auto) for (const b of auto) {
  if (a === b || !modes(a.options).split("").some((c) => modes(b.options).includes(c))) continue;
  // b fires first while typing a, if b is a proper prefix-ending of a's prefix: some prefix of a ends with b
  for (let n = 1; n < a.trigger.length; n++) if (a.trigger.slice(0, n).endsWith(b.trigger) && (b.priority ?? 0) >= (a.priority ?? 0)) { const k = a.trigger + "|" + b.trigger; if (!said.has(k)) { said.add(k); console.log(`UNREACHABLE "${a.trigger}" (line ${lineOf(a.trigger)}) — typing it fires "${b.trigger}" [${b.options}] first`); } break; }
}
