// The Tasks plugin's field markers as the core reads them (crates/atlas-core/src/tasks.rs `MARKERS`): one list for
// every reader here (the task dialog's parser, the chips, Today's sections), its alternatives included (`📆` / `🗓`
// due, `⌛` scheduled). A marker may carry the emoji variation selector (U+FE0F).

export type DateField = "created" | "start" | "scheduled" | "due" | "done";

/** Each date marker and the field it sets. */
export const DATE_MARKS: Readonly<Record<string, DateField>> = {
  "📅": "due", "📆": "due", "🗓": "due", "⏳": "scheduled", "⌛": "scheduled", "🛫": "start", "➕": "created", "✅": "done",
};
const PRIORITY_MARKS = ["🔺", "⏫", "🔼", "🔽", "⏬"];
const ALL = [...Object.keys(DATE_MARKS), ...PRIORITY_MARKS, "🔁"].join("");

/** A field in a task's text: captures (date marker, day) | (priority marker) | (the 🔁 rule). `rule` starts the
 *  rule's pattern (`every\\b` to take only rules that read as one). */
export const fieldPattern = (rule = ""): RegExp => new RegExp(
  `(${Object.keys(DATE_MARKS).join("|")})\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})|(${PRIORITY_MARKS.join("|")})\\uFE0F?|🔁\\uFE0F?\\s*(${rule}[^${ALL}#\\n]*?)(?=\\s*(?:[${ALL}]|#|$))`,
  "gu",
);

/** A due date in a task's text (any of its markers): the whole field and the day. */
export const DUE = new RegExp(`\\s*(?:${Object.entries(DATE_MARKS).filter(([, f]) => f === "due").map(([m]) => m).join("|")})\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})`, "u");
