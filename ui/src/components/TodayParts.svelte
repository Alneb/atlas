<script lang="ts">
  // Today's parts — greeting, capture box (Enter sends), focus, today's log, open tasks, activity.
  // The Today pane shows them all; each is also a view type for ```view blocks (the home document,
  // any note), so `parts` picks which. Data comes from the shared, cached today-store.
  import { errText, escapeRegExp } from "../lib/text";
  import { listVault } from "../lib/vault";
  import { shownName } from "../lib/paths";
  import { localDay } from "../lib/local-day";
  import { greetingChips } from "../lib/plugin-greeting.svelte";
  import { rel } from "../lib/time";
  import { onMount, tick } from "svelte";
  import { api } from "../lib/api";
  import { app, toast } from "../lib/state.svelte";
  import { open, openPath } from "../lib/dock";
  import { openCaptures } from "../lib/quick-capture.svelte";
  import { settings } from "../lib/settings.svelte";
  import CommitRow from "../components/CommitRow.svelte";
  import { capture } from "../lib/registry";
  import { inPhoneApp } from "../lib/eink";
  import { captureHint } from "../lib/capture-hints.svelte";
  import { complete } from "../lib/textarea-complete";
  import { renderInlineMarkdown } from "../lib/markdown";
  import { chipEl, sayDate, taskTextWithChips } from "../lib/task-chips";
  import type { Today } from "../lib/types";
  import type { DockviewPanelApi } from "dockview-core";
  import { todayData, refreshToday, useToday } from "../lib/today-store.svelte";
  import Markdown from "../components/Markdown.svelte";
  import Icon from "../components/Icon.svelte";
  import { isIconName } from "../lib/icons";
  import CaptureGuides from "../components/CaptureGuides.svelte";
  import { PROMPT, landedAt } from "../lib/capture-guides";

  export type TodayPart = "greeting" | "capture" | "focus" | "log" | "tasks" | "activity";
  const ALL: TodayPart[] = ["greeting", "capture", "focus", "log", "tasks", "activity"];
  /** `day`: a day's log showing its own activity (fixed, no ‹ ›). */
  let { panel, parts = ALL, day: fixedDay }: { panel?: DockviewPanelApi; parts?: TodayPart[]; day?: string } = $props();
  const show = (p: TodayPart) => parts.includes(p);
  const full = $derived(parts.length === ALL.length);

  const today = $derived<Today | null>(todayData.v);
  // Activity: your commits first, Claude's apart, housekeeping (history/session logs) as one line.
  const commits = $derived(today?.activity.commits ?? []);
  const showHouse = $derived(settings.config?.activity.show_housekeeping ?? false);
  const showClaude = $derived(settings.config?.activity.show_claude ?? true);
  const house = $derived(commits.filter((c) => c.kind === "housekeeping"));
  const work = $derived(commits.filter((c) => showHouse || c.kind !== "housekeeping"));
  const mine = $derived(work.filter((c) => c.by === "you"));
  const claude = $derived(work.filter((c) => c.by === "agent"));
  let claudeAll = $state(false);
  // Changed files: ≥ group_threshold files in one folder collapse into one expandable row.
  let openDirs = $state<Record<string, boolean>>({});
  // Activity, a day at a time: what was made that day (the core decides when a file was made: its
  // `created:` property, git, then the disk), what else changed, and today's commits
  let actDay = $state<string | null>(null); // null: today
  let actTab = $state<"created" | "changed" | "commits">("created");
  let dayAct = $state<import("../lib/gen/DayActivity").DayActivity | null>(null);
  const shownDay = $derived(fixedDay ?? actDay ?? today?.date ?? "");
  // no day yet (Today still loading) counts as today: no "Invalid date" title, no day buttons on nothing
  const onToday = $derived(!shownDay || (!!today && shownDay === today.date));
  async function loadActivity() {
    const d = shownDay;
    if (!d || !show("activity")) return; // each Home block is its own instance: only the activity one asks
    try { const a = await api.activity(d); if (d === shownDay) dayAct = a; } catch { dayAct = null; }
  }
  $effect(() => { void shownDay; void today; void loadActivity(); });
  // the captures still to triage (captures.rs), on the log card: counted again whenever Today refreshes
  let untriaged = $state(0);
  $effect(() => { void today; if (show("log")) void api.captures().then((l) => { untriaged = l.open; }, () => {}); });
  const shiftDay = (d: string, n: number) => { const t = new Date(`${d}T12:00:00`); t.setDate(t.getDate() + n); return localDay(t); };
  const created = $derived(dayAct?.created ?? []);
  let createdAll = $state(false), changedAll = $state(false);
  const madeAt = (ms: number) => (onToday ? rel(ms) : new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
  const groups = $derived.by(() => {
    const files = dayAct?.changed ?? [];
    const threshold = settings.config?.activity.group_threshold ?? 3;
    const byDir = new Map<string, typeof files>();
    for (const f of files) {
      const d = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
      byDir.set(d, [...(byDir.get(d) ?? []), f]);
    }
    const out: { key: string; files: typeof files }[] = [];
    for (const [d, fs] of byDir) {
      if (d && fs.length >= threshold) out.push({ key: d, files: fs });
      else for (const f of fs) out.push({ key: f.path, files: [f] });
    }
    return out.sort((a, b) => b.files[0].mtime - a.files[0].mtime);
  });
  const error = $derived(todayData.error);
  let text = $state("");
  let sending = $state(false);
  let confirm = $state<{ msg: string; n: number } | null>(null);
  let box = $state<HTMLTextAreaElement>();
  let showAllTasks = $state(false);

  const refresh = refreshToday;

  const dateLabel = $derived.by(() => {
    if (!today) return "";
    const d = new Date(`${today.date}T12:00:00`);
    return isNaN(d.getTime()) ? today.date : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  });
  const greeting = $derived.by(() => {
    const h = new Date().getHours();
    return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  });
  // browsing other days' logs (‹ ›): only days that have a log file, newest last
  let viewDay = $state<string | null>(null); // null = today
  let pastText = $state("");
  /** day → its log file: found by name anywhere under the log folder (`log_folders` files them by year and month) */
  let days = $state<Record<string, string>>({});
  const logRoot = $derived((settings.config?.log_dir ?? "").replace(/\/+$/, ""));
  async function markDone(t: { path: string; line: number }) {
    try { await api.tickTask(t.path, t.line); await refresh(); }
    catch (e) { toast("Could not tick the task", e instanceof Error && /409/.test(e.message) ? "The line changed — open the note." : String(e), "error"); }
  }

  async function loadDays() {
    try {
      const found: Record<string, string> = {};
      for (const p of await listVault()) {
        const m = /(?:^|\/)(\d{4}-\d{2}-\d{2})\.md$/.exec(p);
        if (m && (!logRoot || p.startsWith(`${logRoot}/`))) found[m[1]] = p;
      }
      days = found;
    } catch { days = {}; }
  }
  async function showDay(d: string | null) {
    const want = (viewDay = d && d !== today?.date ? d : null);
    if (!want) return;
    const path = days[want];
    // stepping fast: only the read of the day still shown lands (an older answer would put its text under this heading)
    const text = path ? await api.file(path).then((f) => f.text, () => "") : "";
    if (viewDay === want) pastText = text;
  }
  async function step(dir: -1 | 1) {
    if (!Object.keys(days).length) await loadDays();
    const cur = viewDay ?? today?.date ?? "";
    const list = [...new Set([...Object.keys(days), today?.date ?? ""])].filter(Boolean).sort();
    const i = list.indexOf(cur);
    const next = dir < 0 ? list.slice(0, i < 0 ? list.length : i).pop() : list.slice(i + 1)[0];
    if (next) void showDay(next);
  }
  /** A heading with nothing under it (the template's "## Dreams" on a day without dreams) left blank, so the card shows
   *  what was written; blanked, not removed, so the lines keep their numbers (the log's to-dos are ticked by line). */
  function blankEmptySections(md: string): string {
    const lines = md.split("\n");
    const level = (l: string) => /^(#{1,6})\s/.exec(l)?.[1].length ?? 0;
    let fence = false;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
      const h = fence ? 0 : level(lines[i]);
      if (!h) continue;
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length || (level(lines[j]) > 0 && level(lines[j]) <= h)) lines[i] = "";
    }
    return lines.join("\n");
  }
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const logText = $derived(viewDay ? pastText : today?.log.text ?? "");
  // the card says the day: the file's properties and its own top heading ("# 2026-10-05", "# Monday, 5 October 2026") left out
  /** The day's note by its `##` sections (outside code fences): the card shows the one the captures go to (`## Log`);
   *  the others (Journal, Dreams…) are buttons that open the note there. */
  const sections = $derived.by(() => {
    const out: { title: string; line: number }[] = [];
    let fence = false;
    logText.split("\n").forEach((l, i) => {
      if (/^\s*(```|~~~)/.test(l)) fence = !fence;
      const m = !fence && /^##\s+(.+?)\s*$/.exec(l);
      if (m) out.push({ title: m[1], line: i });
    });
    return out;
  });
  const logSection = $derived(sections.find((x) => /^(log|registro|bit[aá]cora)$/i.test(x.title)) ?? null);
  const otherSections = $derived(sections.filter((x) => x !== logSection));
  const logBody = $derived.by(() => {
    if (!logText) return "";
    if (!logSection) return blankEmptySections(logText.replace(/^(?:---\n[\s\S]*?\n---\n)?(?:#\s[^\n]*\n+)?/, ""));
    const lines = logText.split("\n"), next = sections.find((x) => x.line > logSection.line)?.line ?? lines.length;
    // the blocks closing the note (the activity block at the end) are not the log's
    return lines.slice(logSection.line + 1, next).join("\n").replace(/(?:\n```view\n[\s\S]*?\n```\s*)+$/, "\n");
  });
  /** lines of the log file above logBody (its properties, heading, other sections): the log's to-dos are ticked by line */
  const logHidden = $derived(logSection ? logSection.line + 1 : logText.split("\n").length - logBody.split("\n").length);
  const logPath = $derived(viewDay ? days[viewDay] ?? "" : today?.log.path ?? "");
  /** The title's one button: today's log made from
   *  the template when missing (POST /api/log/today), then opened at its journal section, else at its top. */
  async function writeLog() {
    let path = logPath;
    if (!viewDay && !logText) {
      try {
        path = (await api.todayLog()).path;
      } catch (err) {
        toast("Could not make today's log", errText(err), "error");
        return;
      }
      await refresh();
    }
    const at = otherSections.find((x) => /journal|diario|diary/i.test(x.title)) ?? otherSections[0];
    openPath(path, at ? at.line + 2 : undefined);
  }
  const tasks = $derived(today ? (showAllTasks ? today.tasks : today.tasks.slice(0, 12)) : []);

  const hint = captureHint(() => text);
  let confirmSeq = 0;
  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    sending = true;
    try {
      const res = await api.capture(value);
      text = "";
      const n = ++confirmSeq;
      confirm = { msg: `Saved to ${landedAt(res)}`, n };
      setTimeout(() => { if (confirm?.n === n) confirm = null; }, 2600);
      autosize();
      void refresh();
    } catch (err) {
      toast("Capture failed — your text is still in the box", errText(err), "error");
    } finally {
      sending = false;
      box?.focus();
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  function autosize() {
    void tick().then(() => {
      if (!box) return;
      box.style.height = "auto";
      box.style.height = `${Math.min(box.scrollHeight, 240)}px`;
    });
  }


  const inline = renderInlineMarkdown; // task text arrives without the checkbox
  /** A task's fields as chips after its text (lib/task-chips.ts), not as Obsidian's emoji. */
  function chips(host: HTMLElement, text: string) {
    const draw = (t: string) => host.replaceChildren(...(settings.config?.editor.task_chips === false ? [] : taskTextWithChips(t).chips.map(chipEl)));
    draw(text);
    return { update: draw };
  }
  /** Where a task lives, as read: a day's log by its day ("yesterday", "Wed 28 Oct"), another note by its name; the
   *  line stays in the tooltip ("2026-10-28:15" read as a time). */
  // a day log is named by its date: said as the log of that day, so the date does not read as a due date
  const sourceOf = (path: string) => { const n = shownName(path); return /^\d{4}-\d{2}-\d{2}$/.test(n) ? `log · ${sayDate(n).text}` : n; };
  /** The focus file without the title that repeats the card's ("# Focus"), and "" when nothing else is written yet
   *  (comments and blank lines only). */
  const focusBody = (text: string, path: string) => {
    const body = text.replace(new RegExp(`^\\s*#\\s+(focus|${escapeRegExp(shownName(path))})\\s*\\n`, "i"), "");
    return body.replace(/<!--[\s\S]*?-->/g, "").trim() ? body : "";
  };
  const focusText = $derived(today ? focusBody(today.focus.text ?? "", today.focus.path) : "");
  const titleOf = (t: string) => (settings.config?.editor.task_chips === false ? t : taskTextWithChips(t).title);

  onMount(() => {
    useToday();
    if (!show("capture")) return;
    const offCapture = box ? capture.add(box) : () => {};
    // a frame later, only if nothing took the focus meanwhile (Ctrl+P right after Ctrl+J: the
    // palette must keep it — a race seen in send-to-claude.spec)
    // …or when the focus is merely the note that hosts this box (the home document at startup: D14,
    // capture first) — never when the user is somewhere else
    // never on a touch screen without a keyboard (the phone, the Boox): the focus opened the on-screen keyboard every
    // time Home showed
    // (the app on a phone or a Boox: its pen hovers, so the media query alone said "a mouse" there)
    const touchOnly = inPhoneApp() || matchMedia("(hover: none) and (pointer: coarse)").matches;
    // …and never after a key or click since it was asked: Ctrl+Shift+F at startup opened Search, whose box may not
    // hold the focus yet that frame — the query then went into this box
    let acted = false;
    const act = () => (acted = true);
    const claim = () => { acted = false; requestAnimationFrame(() => {
      if (touchOnly || acted) return;
      const a = document.activeElement;
      if (!a || a === document.body || (a.classList.contains("cm-content") && box?.closest(".cm-editor")?.contains(a))) box?.focus();
    }); };
    addEventListener("keydown", act, true); addEventListener("pointerdown", act, true);
    claim();
    const offActive = panel?.onDidActiveChange((e) => { if (e.isActive) { void refresh(); claim(); } });
    return () => { offActive?.dispose(); offCapture(); removeEventListener("keydown", act, true); removeEventListener("pointerdown", act, true); };
  });
</script>

<div class="today" class:scroll={full} class:part={!full}>
  <div class="today-inner">
    {#if show("greeting")}
    <header class="today-head">
      <div class="eyebrow">{greeting}{app.workspace ? ` · ${app.workspace.name}` : ""}</div>
      <h1 class="today-date">{dateLabel || "Today"}</h1>
      {#if greetingChips.length}
        <div class="greet-chips">
          {#each greetingChips as c (c.key)}
            {#if c.run}<button class="greet-chip" title={c.title} onclick={() => void c.run?.()}>{#if c.icon && isIconName(c.icon)}<Icon name={c.icon} size={13} />{:else if c.icon}<span class="gi">{c.icon}</span>{/if}{c.text}</button>
            {:else}<span class="greet-chip" title={c.title}>{#if c.icon && isIconName(c.icon)}<Icon name={c.icon} size={13} />{:else if c.icon}<span class="gi">{c.icon}</span>{/if}{c.text}</span>{/if}
          {/each}
        </div>
      {/if}
    </header>
    {/if}

    {#if show("capture")}
    <section class="card capture" class:is-sending={sending}>
      <textarea
        bind:this={box}
        bind:value={text}
        {onkeydown}
        use:complete
        oninput={autosize}
        rows="1"
        placeholder={PROMPT}
        aria-label="Capture to today's log"
        data-testid="capture"
      ></textarea>
      <div class="capture-foot">
        {#if confirm}
          <span class="capture-ok" data-testid="capture-ok"><Icon name="check" size={14} /> {confirm.msg}</span>
        {:else}
          <!-- what the text will become, or — while the box is empty — the short forms that exist -->
          <span class="what" data-testid="capture-what">
            {#if !text.trim()}<CaptureGuides {box} />
            {:else}{hint.current.says}{/if}
          </span>
          <span class="hint keys-only"><kbd>Enter</kbd> to save · <kbd>Shift</kbd><kbd>Enter</kbd> new line</span>
        {/if}
      </div>
    </section>
    {/if}

    {#if error && full}
      <div class="card error-card"><strong>Can't reach the Atlas server.</strong><span class="faint small">{error}</span></div>
    {/if}

    <div class="today-grid">
      <div class="col">
        {#if show("focus")}
        <section class="card">
          <div class="card-head">
            <h2>Focus</h2>
            {#if today}
              <button class="icon-btn" title="Edit {today.focus.path}" onclick={() => openPath(today!.focus.path)}><Icon name="edit" size={15} /></button>
            {/if}
          </div>
          {#if focusText}
            <Markdown text={focusText} path={today!.focus.path} class="focus-md" />
          {:else if today?.focus.text}
            <p class="empty">Nothing written in it yet. <button class="link" onclick={() => openPath(today!.focus.path)}>Write what matters now</button></p>
          {:else if today}
            <p class="empty">No <code>{today.focus.path}</code> yet. <button class="link" onclick={() => openPath(today!.focus.path)}>Write one</button> — it's yours; Atlas only shows it.</p>
          {/if}
        </section>
        {/if}

        {#if show("log")}
        <section class="card">
          <div class="card-head">
            <h2>{viewDay ? `Log — ${dayLabel(viewDay)}` : "Today's log"}</h2>
            {#if untriaged}<button class="triage-pill" onclick={openCaptures} title="Every capture still to triage: make it a task, file it into a note, dismiss it" data-testid="untriaged">{untriaged} to triage</button>{/if}
            <!-- one row of icons: open the day's note (made from the template when missing), then the days -->
            <span class="day-nav">
              {#if viewDay}<button class="link today-btn" onclick={() => showDay(null)}>Today</button>{/if}
              {#if viewDay || today}
                <button class="icon-btn log-open" onclick={writeLog} title={logText ? "Open the log" : "Create today's log from the template and open it"} aria-label={logText ? "Open the log" : "Create today's log"}>
                  <Icon name={logText ? "edit" : "plus"} size={14} />
                </button>
              {/if}
              <button class="icon-btn" title="Previous day with a log" aria-label="Previous day" onclick={() => step(-1)}>‹</button>
              <button class="icon-btn" title="Next day with a log" aria-label="Next day" disabled={!viewDay} onclick={() => step(1)}>›</button>
            </span>
          </div>
          {#if logBody.trim()}
            <Markdown text={logBody} path={logPath} class="log-md" tickable compact log hidden={logHidden} />
          {:else}
            <p class="empty">{viewDay ? "Nothing in this log." : "Nothing captured yet today."}</p>
          {/if}
        </section>
        {/if}
      </div>

      <div class="col">
        {#if show("tasks")}
        <section class="card">
          <div class="card-head"><h2>Open tasks</h2>{#if today}<span class="count">{today.tasks.length}</span>{/if}</div>
          {#if today && today.tasks.length}
            <ul class="tasks">
              {#each tasks as t (t.path + ":" + t.line)}
                <li class="task-li">
                  <button class="task-box" aria-label="Mark done: {t.text}" title="Mark done (writes [x] in {t.path})" onclick={() => markDone(t)}></button>
                  <button class="task" onclick={() => openPath(t.path, t.line)} title="{t.path}:{t.line}">
                    <span class="task-text">{@html inline(titleOf(t.text))}<span class="task-chips" use:chips={t.text}></span></span>
                    <span class="task-src">{sourceOf(t.path)}</span>
                  </button>
                </li>
              {/each}
            </ul>
            {#if today.tasks.length > 12}
              <button class="link more" onclick={() => (showAllTasks = !showAllTasks)}>{showAllTasks ? "Show fewer" : `Show all ${today.tasks.length}`}</button>
            {/if}
          {:else if today}
            <p class="empty">No open <code>- [ ]</code> tasks.</p>
          {/if}
        </section>
        {/if}

        {#if show("activity")}
        <section class="card">
          <div class="card-head">
            <h2>{fixedDay ? "Made this day" : onToday ? "Activity" : `Activity — ${dayLabel(shownDay)}`}</h2>
            <span class="day-nav">
              {#if !fixedDay}
                <button class="icon-btn" title="The day before" aria-label="Activity of the day before" disabled={!shownDay} onclick={() => (actDay = shiftDay(shownDay, -1))}>‹</button>
                {#if !onToday}<button class="link today-btn" onclick={() => (actDay = null)}>Today</button>{/if}
                <button class="icon-btn" title="The day after" aria-label="Activity of the day after" disabled={onToday} onclick={() => (actDay = shiftDay(shownDay, 1) === today?.date ? null : shiftDay(shownDay, 1))}>›</button>
              {/if}
              <button class="icon-btn" title="Files" aria-label="Open the file explorer" onclick={() => open({ kind: "files" })}><Icon name="folder" size={15} /></button>
              {#if !fixedDay}<button class="icon-btn" title="Git" aria-label="Git" onclick={() => open({ kind: "git" })}><Icon name="git" size={15} /></button>{/if}
            </span>
          </div>
          <div class="act-tabs" role="tablist" aria-label="Activity">
            <button role="tab" class="act-tab" class:on={actTab === "created"} aria-selected={actTab === "created"} onclick={() => (actTab = "created")}><Icon name="plus" size={12} />Created <span class="count">{created.length}</span></button>
            <button role="tab" class="act-tab" class:on={actTab === "changed"} aria-selected={actTab === "changed"} onclick={() => (actTab = "changed")}><Icon name="clock" size={12} />Changed <span class="count">{dayAct?.changed.length ?? 0}</span></button>
            {#if onToday && !fixedDay && (mine.length || claude.length)}
              <button role="tab" class="act-tab" class:on={actTab === "commits"} aria-selected={actTab === "commits"} onclick={() => (actTab = "commits")}><Icon name="git" size={12} />Commits <span class="count">{mine.length + claude.length}</span></button>
            {/if}
          </div>
          {#if actTab === "created"}
            {#if created.length}
              <ul class="activity changed">
                {#each createdAll ? created : created.slice(0, 8) as f (f.path)}
                  <li><button class="changed-row" onclick={() => openPath(f.path)} title={f.path}><Icon name={/\.md$/i.test(f.path) ? "file-text" : "file"} size={14} /><span class="path">{shownName(f.path)}{#if f.path.includes("/")}{" "}<span class="n">· {f.path.slice(0, f.path.lastIndexOf("/"))}</span>{/if}</span><span class="when">{madeAt(f.created)}</span></button></li>
                {/each}
              </ul>
              {#if created.length > 8}<button class="link more" onclick={() => (createdAll = !createdAll)}>{createdAll ? "Show fewer" : `Show all ${created.length}`}</button>{/if}
            {:else}
              <p class="empty">{onToday ? "Nothing made yet today." : "Nothing was made that day."}</p>
            {/if}
          {:else if actTab === "changed"}
            {#if groups.length}
              <ul class="activity changed">
                {#each changedAll ? groups : groups.slice(0, 8) as g (g.key)}
                  {#if g.files.length === 1}
                    <li><button class="changed-row" onclick={() => openPath(g.files[0].path)}><Icon name="file" size={14} /><span class="path">{g.files[0].path}</span><span class="when">{madeAt(g.files[0].mtime)}</span></button></li>
                  {:else}
                    <li><button class="changed-row" onclick={() => (openDirs[g.key] = !openDirs[g.key])}><Icon name={openDirs[g.key] ? "folder-open" : "folder"} size={14} /><span class="path">{g.key}/ <span class="n">· {g.files.length} files</span></span><span class="when">{madeAt(g.files[0].mtime)}</span></button></li>
                    {#if openDirs[g.key]}
                      {#each g.files as f (f.path)}
                        <li><button class="changed-row nested" onclick={() => openPath(f.path)}><Icon name="file" size={13} /><span class="path">{f.path.slice(g.key.length + 1)}</span><span class="when">{madeAt(f.mtime)}</span></button></li>
                      {/each}
                    {/if}
                  {/if}
                {/each}
              </ul>
              {#if groups.length > 8}<button class="link more" onclick={() => (changedAll = !changedAll)}>{changedAll ? "Show fewer" : `Show all ${groups.length}`}</button>{/if}
            {:else}
              <p class="empty">Nothing else changed.</p>
            {/if}
          {:else}
            {#if mine.length}
              <div class="sub-head"><span class="dot-you"></span>Yours <span class="count">{mine.length}</span></div>
              <div class="activity">{#each mine as c (c.hash)}<CommitRow {c} />{/each}</div>
            {/if}
            {#if showClaude && claude.length}
              <div class="sub-head"><Icon name="claude" size={12} />{[...new Set(claude.map((c) => c.agent ?? "Agent"))].join(", ")} <span class="count">{claude.length}</span></div>
              <div class="activity">{#each claudeAll ? claude : claude.slice(0, 6) as c (c.hash)}<CommitRow {c} compact />{/each}</div>
              {#if claude.length > 6}<button class="link more" onclick={() => (claudeAll = !claudeAll)}>{claudeAll ? "Show fewer" : `Show all ${claude.length}`}</button>{/if}
            {/if}
            {#if house.length && !showHouse}
              <button class="link more house" onclick={() => open({ kind: "git" })} title="History, session logs, HTML views — see the Git pane">+ {house.length} housekeeping commit{house.length === 1 ? "" : "s"}</button>
            {/if}
          {/if}
        </section>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .today { height: 100%; overflow: auto; background: var(--bg); container-type: inline-size; }
  .today-inner { max-width: 1080px; margin: 0 auto; padding: 40px 36px 64px; }
  .today-head { margin-bottom: 22px; }
  .eyebrow { font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text-faint); letter-spacing: .02em; margin-bottom: 4px; }
  .act-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 10px; }
  .act-tab { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text-muted);
    background: transparent; border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; cursor: pointer; }
  .act-tab:hover { color: var(--text); border-color: var(--border-strong); }
  .act-tab.on { color: var(--heading); background: var(--accent-soft); border-color: transparent; }
  .greet-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .greet-chip { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: calc(12.5px * var(--ui-scale, 1)); color: var(--text-muted);
    background: var(--bg-alt); border: 1px solid var(--border); border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
  button.greet-chip { cursor: pointer; }
  button.greet-chip:hover { color: var(--text); border-color: var(--border-strong); }
  .greet-chip .gi { font-size: 1.05em; line-height: 1; }
  .today-date { font-size: calc(30px * var(--ui-scale, 1)); font-weight: 650; letter-spacing: -.02em; color: var(--heading); margin: 0; }

  .card { background: var(--bg-alt); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px 18px; margin-bottom: 16px; }
  .day-nav { display: inline-flex; align-items: center; gap: 2px; }
  .day-nav .icon-btn { font-size: calc(17px * var(--ui-scale, 1)); line-height: 1; }
  .day-nav .icon-btn:disabled { opacity: .35; }
  .today-btn { font-size: calc(12px * var(--ui-scale, 1)); padding: 0 6px; }
  .card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; min-height: 26px; }
  .card-head h2 { font-size: calc(12px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--text-muted); margin: 0; }
  .count { font-size: calc(12px * var(--ui-scale, 1)); color: var(--text-faint); font-variant-numeric: tabular-nums; background: var(--bg-hover); padding: 1px 8px; border-radius: 99px; }
  .empty { color: var(--text-faint); margin: 4px 0; font-size: calc(13.5px * var(--ui-scale, 1)); }

  .capture { position: relative; padding: 4px 4px 0; background: var(--bg-elev); border-color: var(--border-strong); box-shadow: var(--shadow-sm); transition: border-color .15s, box-shadow .15s; }
  .capture:focus-within { border-color: color-mix(in srgb, var(--accent) 55%, transparent); box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow-sm); }
  .capture textarea { display: block; width: 100%; resize: none; border: 0; outline: 0; background: transparent; color: var(--text);
    font: inherit; font-size: calc(15.5px * var(--ui-scale, 1)); line-height: 1.55; padding: 12px 14px 6px; min-height: 48px; }
  .capture textarea::placeholder { color: var(--text-faint); }
  .capture-foot .what { margin-right: auto; color: var(--text-faint); }
  .capture-foot { display: flex; justify-content: flex-end; padding: 2px 12px 9px; min-height: 30px; align-items: center; font-size: calc(12px * var(--ui-scale, 1)); }
  .hint { color: var(--text-faint); }
  .capture-ok { color: var(--green); display: inline-flex; align-items: center; gap: 5px; animation: fade-in .18s ease-out; }
  .is-sending { opacity: .85; }
  .error-card { display: flex; flex-direction: column; gap: 4px; border-color: color-mix(in srgb, var(--red) 40%, var(--border)); }

  /* one part inside a note: no page chrome, the note's column decides the width */
  .today.part { background: none; }
  .today.part .today-inner { max-width: none; padding: 0; }
  .today.part .card { margin-bottom: 0; }
  .today.part .today-grid { display: block; }
  .today-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }
  @container (max-width: 760px) { .today-grid { grid-template-columns: 1fr; } .today-inner { padding: 28px 18px 48px; } }
  .col > .card:last-child { margin-bottom: 0; }

  :global(.focus-md), :global(.log-md) { font-size: calc(14.5px * var(--ui-scale, 1)); }
  :global(.log-md ul) { padding-left: 1.1em; }
  /* beside the title; the day's icons stay on the right */
  .triage-pill { margin: 0 auto 0 8px; padding: 1px 9px; border-radius: 999px; font-size: calc(11.5px * var(--ui-scale, 1)); font-variant-numeric: tabular-nums;
    color: var(--accent-strong, var(--accent)); background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
  .triage-pill:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  /* the day's log (lib/log-entries.ts): the time in a muted column, the text beside it, pictures as thumbnails */
  :global(.log-md ul.log-entries) { padding-left: 0; list-style: none; }
  /* time | marker | text: a capture's dot and a task's box share the marker column, every text starts at one edge */
  :global(.markdown.log-md li.log-entry) { position: relative; padding: 3px 0 3px 5.2em; line-height: 1.45; --mark: 4.3em; --row: calc(3px + .725em); }
  :global(.markdown.log-md li.log-entry:not(.task-list-item)::before) { content: ""; position: absolute; left: calc(var(--mark) - 4px); top: calc(var(--row) - 4px);
    width: 8px; height: 8px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--accent) 70%, transparent); box-sizing: border-box; }
  :global(.markdown.log-md li.log-entry.log-untimed:not(.task-list-item)::before) { width: 6px; height: 6px; left: calc(var(--mark) - 3px); top: calc(var(--row) - 3px); border: 0; background: color-mix(in srgb, var(--accent) 45%, transparent); }
  :global(.log-md li.log-entry + li.log-entry) { border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  :global(.log-md .log-time) { position: absolute; left: 0; top: 3px; width: 3.6em; padding-top: .14em; text-align: right; white-space: nowrap;
    font-size: .8em; font-variant-numeric: tabular-nums; color: var(--text-faint); }
  :global(.log-md li.log-entry img.embed-img) { display: inline-block; vertical-align: top; width: auto !important; max-width: min(140px, 100%); max-height: 140px;
    margin: 4px 6px 2px 0; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: zoom-in; }
  :global(.log-md li.log-entry .file-card) { margin: 4px 0 2px; padding: .25em .65em; font-size: .88em; }
  :global(.markdown.log-md li.log-entry.task-list-item input.task-checkbox) { position: absolute; left: calc(var(--mark) - .5em); top: calc(var(--row) - .5em); margin: 0; transform: none;
    font-size: inherit; } /* the li's em: --mark is in it */
  :global(.log-md a.log-url) { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }

  .tasks, .activity { list-style: none; margin: 0; padding: 0; }
  /* the source under the text, small: a narrow column keeps the task's words, and the date never takes a column of its own */
  .task { display: flex; flex-direction: column; gap: 0; width: 100%; text-align: left;
    padding: 4px 8px; margin: 0 -8px; width: calc(100% + 16px); border-radius: var(--radius-sm); color: var(--text); font-size: calc(12.5px * var(--ui-scale, 1)); line-height: 1.35; }
  .task:hover { background: var(--bg-hover); }
  .task-li { display: flex; align-items: baseline; gap: 4px; }
  .task-li .task { flex: 1; min-width: 0; }
  .task-box { flex: none; width: 13px; height: 13px; margin: 0 2px 0 8px; border: 1.5px solid var(--text-faint); border-radius: 3px; transform: translateY(2px); }
  .task-box:hover { border-color: var(--accent); background: var(--accent-soft); }
  .task-text { overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .task-text :global(code) { font-size: .9em; }
  .task-text :global(a) { color: var(--link); text-decoration: none; }
  .task-chips:not(:empty) { margin-left: 4px; }
  .task-src { color: var(--text-faint); font-size: calc(10.5px * var(--ui-scale, 1)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .more { margin-top: 6px; font-size: calc(12.5px * var(--ui-scale, 1)); }

  .activity li { font-size: calc(13px * var(--ui-scale, 1)); }
  .when { color: var(--text-faint); font-size: calc(11.5px * var(--ui-scale, 1)); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .changed { margin-top: 0; }
  .changed-row { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 8px; align-items: center; width: calc(100% + 16px); margin: 0 -8px;
    padding: 4px 8px; border-radius: var(--radius-sm); color: var(--text-muted); text-align: left; }
  .changed-row:hover { background: var(--bg-hover); color: var(--text); }
  .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: calc(12.5px * var(--ui-scale, 1)); }
  .sub-head { display: flex; align-items: center; gap: 6px; margin: 10px 0 2px; font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; text-transform: uppercase; letter-spacing: .07em; color: var(--text-muted); }
  .sub-head:first-of-type { margin-top: 2px; }
  .sub-head .count { font-weight: 500; color: var(--text-faint); }
  .dot-you { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
  .more { display: block; margin: 4px 0 0; font-size: calc(12px * var(--ui-scale, 1)); }
  .more.house { color: var(--text-faint); }
  .changed-row.nested { padding-left: 28px; }
  .changed-row .n { color: var(--text-faint); }
</style>
