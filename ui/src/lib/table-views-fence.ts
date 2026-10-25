// The core's own fence: a table's ```table-views``` block (lib/csv/views.ts) shown in its note as the views it keeps —
// each one's name, filters, sort and hidden columns — the lines staying the store. Plain DOM: a handful of rows.
import { registerFence } from "./fences";
import { describeView, readViews } from "./csv/views";

registerFence("atlas", "table-views", (host, fence) => {
  const views = readViews("```table-views\n" + fence.source + "\n```");
  const box = document.createElement("div");
  box.className = "table-views";
  const head = document.createElement("div");
  head.className = "table-views-head";
  head.textContent = views.length ? `Saved views of this table (${views.length}) — chosen from the table's Views button` : "No saved views";
  box.append(head);
  for (const v of views) {
    const row = document.createElement("div");
    row.className = "table-views-row";
    const name = document.createElement("b");
    name.textContent = v.name;
    const what = document.createElement("span");
    what.textContent = describeView(v);
    row.append(name, what);
    box.append(row);
  }
  host.append(box);
  return () => box.remove();
});
