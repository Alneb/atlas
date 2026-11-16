// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/plan/helper/time.ts
	const MIN = 6e4;
	const HOUR = 60 * MIN;
	const DAY = 24 * HOUR;
	/** This device's clock. */
	function systemClock() {
		return {
			now: Date.now(),
			offset: (ms) => -new Date(ms).getTimezoneOffset()
		};
	}
	/** A fixed zone (tests). */
	function fixedClock(now, offsetMin) {
		return {
			now,
			offset: () => offsetMin
		};
	}
	const pad = (n) => String(n).padStart(2, "0");
	/** The local day (`YYYY-MM-DD`) and minute of the day of an instant. */
	function wall(ms, c) {
		const d = new Date(ms + c.offset(ms) * MIN);
		return {
			day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
			min: d.getUTCHours() * 60 + d.getUTCMinutes()
		};
	}
	/** The instant of a local day and minute (the offset read at that moment, once refined across a DST change). */
	function instant(day, min, c) {
		const [y, m, d] = day.split("-").map(Number);
		const naive = Date.UTC(y, m - 1, d, 0, min);
		const guess = naive - c.offset(naive) * MIN;
		return naive - c.offset(guess) * MIN;
	}
	/** `YYYY-MM-DD` + n days. */
	function addDays(day, n) {
		const [y, m, d] = day.split("-").map(Number);
		const t = new Date(Date.UTC(y, m - 1, d + n));
		return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
	}
	/** Whole days from `a` to `b` (both `YYYY-MM-DD`). */
	function daysBetween(a, b) {
		const at = (s) => {
			const [y, m, d] = s.split("-").map(Number);
			return Date.UTC(y, m - 1, d);
		};
		return Math.round((at(b) - at(a)) / DAY);
	}
	/** `HH:MM` of a minute of the day. */
	const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
	/** `HH:MM` (or `H:MM`) → minute of the day; null when it is not one. */
	function minuteOf(s) {
		const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(s);
		if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
		return Number(m[1]) * 60 + Number(m[2]);
	}
	/** `YYYY-MM-DD HH:MM` of an instant, the ledger's way. */
	function stamp(ms, c) {
		const w = wall(ms, c);
		return `${w.day} ${hhmm(w.min)}`;
	}
	/** The instant a ledger stamp names (local time). */
	function fromStamp(s, c) {
		const m = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2})$/.exec(s.trim());
		const min = m && minuteOf(m[2]);
		return m && min !== null ? instant(m[1], min, c) : null;
	}
	/** RFC 3339 with the local offset, what a planned notice's `at` is. */
	function rfc3339(ms, c) {
		const off = c.offset(ms), sign = off < 0 ? "-" : "+", a = Math.abs(off);
		const w = wall(ms, c), sec = Math.floor(ms / 1e3 % 60);
		return `${w.day}T${hhmm(w.min)}:${pad(sec < 0 ? sec + 60 : sec)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
	}
	/** The instant floored to its minute. */
	const floorMinute = (ms) => Math.floor(ms / MIN) * MIN;
	//#endregion
	//#region plugins/beta/plan/helper/ledger.ts
	/** A title as a link's alias can hold it. */
	const alias = (title) => title.replace(/\|/g, "/").replace(/\[\[/g, "[").replace(/\]\]/g, "]").replace(/\s+/g, " ").trim();
	const titleKey = (t) => `${t.path}|${alias(t.title)}`;
	const keyOf = (t) => t.block ? `${t.path}#^${t.block}` : titleKey(t);
	/** The wikilink to a task: `[[note#^id|title]]`, or `[[note|title]]` (a note's path without `.md`, as Obsidian links). */
	function linkOf(t) {
		return `[[${t.path.replace(/\.md$/i, "")}${t.block ? `#^${t.block}` : ""}|${alias(t.title)}]]`;
	}
	/** A link back to the task's key and title key. */
	function fromLink(link) {
		const m = /^\[\[([^\]|#]+)(?:#\^([\w-]+))?(?:\|([^\]]*))?\]\]$/.exec(link.trim());
		if (!m) return null;
		const t = {
			path: /\.\w+$/.test(m[1]) ? m[1] : `${m[1]}.md`,
			title: m[3] ?? "",
			block: m[2]
		};
		return {
			key: keyOf(t),
			titleKey: titleKey(t)
		};
	}
	const LINE = /^- (\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}) · (.*)$/;
	/** One ledger line, or null for a line that is not one (a heading, a hand-written remark: kept, never read). */
	function parseLine(line, c) {
		const m = LINE.exec(line.trim());
		const at = m && fromStamp(m[1], c);
		if (!m || at === null) return null;
		const parts = m[2].split(" · ");
		const head = parts[0].trim();
		const snooze = /^snoozed → (?:(\d{4}-\d{2}-\d{2}) )?(\d{1,2}:\d{2})$/.exec(head);
		const kind = snooze ? "snoozed" : head;
		if (![
			"nudged",
			"snoozed",
			"done",
			"digest"
		].includes(kind)) return null;
		const e = {
			at,
			kind,
			detail: "",
			line: line.trim()
		};
		if (snooze) e.until = fromStamp(`${snooze[1] ?? m[1].slice(0, 10)} ${snooze[2]}`, c) ?? void 0;
		let rest = parts.slice(1);
		if (kind !== "digest") {
			const link = rest[0] && fromLink(rest[0]);
			if (!link) return null;
			Object.assign(e, link);
			rest = rest.slice(1);
		}
		e.important = rest.some((p) => p.trim() === "important");
		e.detail = rest.filter((p) => p.trim() !== "important").join(" · ");
		return e;
	}
	/** A ledger line for an entry about `task` (none for a digest). */
	function renderLine(e, c, task) {
		let head = e.kind;
		if (e.kind === "snoozed" && e.until !== void 0) {
			const a = wall(e.at, c);
			head = `snoozed → ${wall(e.until, c).day === a.day ? stamp(e.until, c).slice(11) : stamp(e.until, c)}`;
		}
		const parts = [stamp(e.at, c), head];
		if (task) parts.push(linkOf(task));
		if (e.important) parts.push("important");
		if (e.detail) parts.push(e.detail);
		return `- ${parts.join(" · ")}`;
	}
	/** Every entry of a ledger note, newest first. */
	function parse(text, c) {
		return text.split("\n").map((l) => parseLine(l, c)).filter((e) => e !== null).sort((a, b) => b.at - a.at);
	}
	/** The note `lines` go into: the device's month file. */
	const fileOf = (folder, month, device) => `${folder.replace(/\/+$/, "")}/${month} ${device.replace(/[\\/:*?"<>|]/g, "-")}.md`;
	/** The note with `lines` (newest first) put on top of its entries, under its properties; a note not there yet is
	*  made. Lines written by hand stay where they are. */
	function add(text, lines, device, month) {
		const head = `---\ntype: plan-ledger\ndevice: ${device}\nmonth: ${month}\n---\n`;
		const body = text ?? head;
		const fm = /^---\n[\s\S]*?\n---\n/.exec(body);
		const top = fm ? fm[0] : head;
		const rest = fm ? body.slice(fm[0].length) : body;
		return top + lines.join("\n") + "\n" + rest.replace(/^\n+/, "");
	}
	//#endregion
	//#region plugins/beta/plan/helper/plan.ts
	/** The plugin's settings (as Settings saved them, defaults filled in by the core) → numbers the planner uses. */
	function settingsOf(raw = {}) {
		const num = (k, d) => {
			const n = Number(raw[k]);
			return Number.isFinite(n) && raw[k] !== "" && raw[k] !== void 0 && raw[k] !== null ? n : d;
		};
		const [from, to] = String(raw.quiet ?? "22:30-08:00").split(/[-–]/).map((s) => minuteOf(s));
		const durations = {};
		for (const part of String(raw.durations ?? "").split(",")) {
			const m = /^\s*#?([^=\s]+)\s*=\s*(\d+)\s*$/.exec(part);
			if (m) durations[m[1].toLowerCase()] = Number(m[2]);
		}
		return {
			nudges: raw.nudges !== false,
			quietFrom: from ?? 1350,
			quietTo: to ?? 480,
			horizon: num("horizon", 7),
			threshold: num("threshold", 1),
			maxPerDay: num("max_per_day", 0),
			minGap: num("min_gap", 0),
			minutes: num("minutes", 30),
			durations,
			exclude: String(raw.exclude ?? "").split(",").map((s) => s.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean),
			digest: raw.digest !== false,
			digestAt: minuteOf(String(raw.digest_at ?? "08:00")) ?? 480,
			snoozeMinutes: num("snooze_minutes", 60)
		};
	}
	/** How long a nudge stays worth showing after its moment, and how far ahead the plan looks. */
	const RING = 30 * MIN;
	const DIGEST_RINGS = 2 * HOUR;
	const AHEAD = 36 * HOUR;
	const STEP = 15 * MIN;
	/** How long after a nudge a tick still counts as its answer (§3.3a). */
	const ANSWERED_WITHIN = 2 * HOUR;
	const WEIGHT = {
		highest: 3,
		high: 2,
		medium: 1.4,
		normal: 1,
		low: .6,
		lowest: .3
	};
	const MARK = {
		highest: "🔺",
		high: "⏫",
		medium: "🔼"
	};
	/** A task's own duration: `⏱ 45m` / `⏱ 1h30m` / `⏱ 90` on the line, else its first tag's default, else Settings'. */
	function minutesOf(t, s) {
		const m = /⏱️?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:m|min)?)?/.exec(t.text);
		if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
		for (const tag of t.tags) {
			const d = s.durations[tag.toLowerCase()];
			if (d) return d;
		}
		return s.minutes;
	}
	/** Date pressure and its words: overdue 3 · due today 2.5 · scheduled today 2 · due tomorrow 1.6 · within the week
	*  1 + (7 − d)/14 · otherwise 0.5 (§3.3). */
	function pressure(t, today) {
		let p = .5, words = "";
		const week = (d) => d <= 7 ? 1 + (7 - d) / 14 : .5;
		if (t.due) {
			const d = daysBetween(today, t.due);
			p = d < 0 ? 3 : d === 0 ? 2.5 : d === 1 ? 1.6 : week(d);
			words = d < 0 ? `overdue ${-d} day${d === -1 ? "" : "s"}` : d === 0 ? "due today" : d === 1 ? "due tomorrow" : `due in ${d} days`;
		}
		if (t.scheduled) {
			const d = daysBetween(today, t.scheduled);
			const q = d <= 0 ? 2 : d === 1 ? 1.6 : week(d);
			if (q > p) {
				p = q;
				words = d < 0 ? "scheduled before today" : d === 0 ? "scheduled today" : d === 1 ? "scheduled tomorrow" : `scheduled in ${d} days`;
			}
		}
		return {
			p,
			words
		};
	}
	/** Which tasks may nudge (§3.1, decision 7): dated within the horizon or overdue, or priority ≥ high; not in an
	*  excluded folder; its 🛫 start come. Important (not budgeted): ⏫/🔺, overdue, due today. */
	function judge(t, s, today) {
		const name = {
			path: t.path,
			title: t.title,
			block: t.block
		};
		const high = t.priority === "high" || t.priority === "highest";
		const date = t.due ?? t.scheduled;
		const excluded = s.exclude.some((f) => t.path === f || t.path.startsWith(`${f}/`));
		const started = !t.start || t.start <= today;
		const within = !!date && daysBetween(today, date) <= s.horizon;
		const { p, words } = pressure(t, today);
		return {
			task: t,
			key: keyOf(name),
			titleKey: titleKey(name),
			eligible: !t.done && !excluded && started && (within || high),
			important: high || !!t.due && t.due <= today,
			urgency: (WEIGHT[t.priority] ?? 1) * p,
			minutes: minutesOf(t, s),
			dateWords: words
		};
	}
	/** The time the planner may use: outside quiet hours, outside busy events. */
	var Free = class {
		s;
		busy;
		c;
		constructor(s, busy, c) {
			this.s = s;
			this.busy = busy;
			this.c = c;
		}
		quiet(ms) {
			const m = wall(ms, this.c).min, { quietFrom: a, quietTo: b } = this.s;
			return a === b ? false : a < b ? m >= a && m < b : m >= a || m < b;
		}
		taken(ms) {
			return this.busy.some((b) => b.start <= ms && ms < b.end);
		}
		/** Where the gap that starts at `ms` ends: the next busy event or quiet hours. */
		gapEnd(ms) {
			const w = wall(ms, this.c);
			const quiet = w.min < this.s.quietFrom ? instant(w.day, this.s.quietFrom, this.c) : instant(addDays(w.day, 1), this.s.quietFrom, this.c);
			const next = this.busy.filter((b) => b.start > ms).reduce((m, b) => Math.min(m, b.start), Infinity);
			return Math.min(quiet, next);
		}
		/** The moments to consider from `from`: itself, then every quarter hour for 36 hours, outside quiet and busy time. */
		moments(from) {
			const out = [from];
			for (let t = Math.ceil((from + 1) / STEP) * STEP; t < from + AHEAD; t += STEP) out.push(t);
			return out.filter((t) => !this.quiet(t) && !this.taken(t));
		}
		/** How well the gap at `ms` holds `minutes`: 1 all of it, 0.4 half, else 0. */
		room(ms, minutes) {
			const until = this.gapEnd(ms), free = Math.round((until - ms) / MIN);
			return {
				fit: free >= minutes ? 1 : free >= minutes / 2 ? .4 : 0,
				free,
				until
			};
		}
	};
	/** Morning, afternoon or evening of a day: one nudge per task in each (§3.3). */
	function windowOf(ms, c) {
		const w = wall(ms, c);
		return `${w.day} ${w.min < 720 ? "morning" : w.min < 1080 ? "afternoon" : "evening"}`;
	}
	/** The budget measured from the last 28 days of ledger (§3.3a): N, the largest rank of the day still acted on (done or
	*  snoozed within 2 h) 25 % of the time and at half rank 1's rate at least, one more when the last rank seen was;
	*  G, the shortest gap whose acted-on rate is within 80 % of the best. 6 and 45 min until 14 days of ledger exist.
	*  A number pinned in Settings wins. */
	function measure(entries, s, c) {
		const since = c.now - 28 * DAY;
		const recent = entries.filter((e) => e.at >= since && e.at <= c.now);
		const days = new Set(recent.map((e) => wall(e.at, c).day)).size;
		const nudges = recent.filter((e) => e.kind === "nudged" && e.at < c.now - ANSWERED_WITHIN).sort((a, b) => a.at - b.at);
		const acted = (n) => recent.some((e) => (e.kind === "done" || e.kind === "snoozed") && (e.key === n.key || e.titleKey === n.titleKey) && e.at > n.at && e.at <= n.at + ANSWERED_WITHIN);
		const budgeted = nudges.filter((n) => !n.important);
		const actedOn = budgeted.filter(acted).length;
		let perDay = 6, gap = 45;
		const measured = days >= 14;
		if (measured) {
			const byRank = /* @__PURE__ */ new Map(), byGap = /* @__PURE__ */ new Map();
			const count = (m, k, hit) => {
				const v = m.get(k) ?? [0, 0];
				v[0] += hit ? 1 : 0;
				v[1] += 1;
				m.set(k, v);
			};
			const perDayList = /* @__PURE__ */ new Map();
			for (const n of nudges) {
				const d = wall(n.at, c).day;
				perDayList.set(d, [...perDayList.get(d) ?? [], n]);
			}
			const BUCKETS = [
				15,
				30,
				45,
				60,
				90,
				120
			];
			for (const list of perDayList.values()) {
				let rank = 0;
				list.forEach((n, i) => {
					if (n.important) return;
					rank += 1;
					const hit = acted(n);
					count(byRank, rank, hit);
					if (i > 0) {
						const g = (n.at - list[i - 1].at) / MIN;
						count(byGap, [...BUCKETS].reverse().find((b) => b <= g) ?? 15, hit);
					}
				});
			}
			const rate = (v) => v && v[1] ? v[0] / v[1] : 0;
			const ranks = [...byRank.keys()].sort((a, b) => a - b);
			const first = rate(byRank.get(1));
			const ok = ranks.filter((k) => rate(byRank.get(k)) >= .25 && rate(byRank.get(k)) >= .5 * first);
			const k = ok.length ? Math.max(...ok) : 2;
			perDay = Math.min(12, Math.max(2, ranks.length && k === Math.max(...ranks) ? k + 1 : k));
			const known = BUCKETS.filter((b) => (byGap.get(b)?.[1] ?? 0) >= 3);
			const best = Math.max(0, ...known.map((b) => rate(byGap.get(b))));
			gap = known.find((b) => best > 0 && rate(byGap.get(b)) >= .8 * best) ?? 45;
		}
		if (s.maxPerDay > 0) perDay = s.maxPerDay;
		if (s.minGap > 0) gap = s.minGap;
		return {
			perDay,
			gap,
			measured,
			days,
			nudges: budgeted.length,
			acted: actedOn
		};
	}
	/** "16:30", "tomorrow 09:00", "Tue 09:00": a moment as a button says it. */
	function when(ms, c) {
		const w = wall(ms, c), today = wall(c.now, c).day;
		const d = daysBetween(today, w.day);
		return `${d === 0 ? "" : d === 1 ? "tomorrow " : `${[
			"Sun",
			"Mon",
			"Tue",
			"Wed",
			"Thu",
			"Fri",
			"Sat"
		][(/* @__PURE__ */ new Date(`${w.day}T12:00:00Z`)).getUTCDay()]} `}${hhmm(w.min)}`;
	}
	/** Where Snooze puts a nudge at `at` off to: the first gap that holds the task, at least `snoozeMinutes` later. */
	function snoozeTo(at, j, free, s) {
		const from = floorMinute(at + s.snoozeMinutes * MIN);
		return free.moments(from).find((t) => free.room(t, j.minutes).fit === 1) ?? from;
	}
	/** The planned notice of a nudge at `at`. */
	function nudge(j, at, why, free, s, c) {
		const t = j.task, later = snoozeTo(at, j, free, s);
		return {
			at: rfc3339(at, c),
			until: rfc3339(at + RING, c),
			id: `plan:${j.key}`,
			title: t.title,
			body: why,
			open: t.path,
			...t.block ? { subject: `${t.path}#^${t.block}` } : {},
			actions: [
				{
					id: "done",
					label: "Done"
				},
				{
					id: `snooze:${stamp(later, c).replace(" ", "T")}`,
					label: `Snooze to ${when(later, c)}`
				},
				{
					id: "atlas:open",
					label: "Open"
				}
			]
		};
	}
	const round1 = (n) => Math.round(n * 10) / 10;
	/** The plan for the next 36 hours, and the ledger lines its due moments make (a nudge whose moment has come when the
	*  plan is asked is recorded as nudged: the core asks just before it rings, planned.rs). */
	function plan(input) {
		const { settings: s, clock: c } = input;
		const now = c.now, today = wall(now, c).day;
		const entries = [...input.entries].sort((a, b) => b.at - a.at);
		const writes = [], planned = [], decisions = [];
		const budget = measure(entries, s, c);
		const name = (t) => ({
			path: t.path,
			title: t.title,
			block: t.block
		});
		const open = input.tasks.filter((t) => !t.done);
		const openKeys = new Set(open.map((t) => keyOf(name(t))));
		for (const t of input.tasks.filter((t) => t.done)) {
			const k = keyOf(name(t)), last = entries.find((e) => e.key === k);
			if (last && (last.kind === "nudged" || last.kind === "snoozed") && !openKeys.has(k)) writes.push({
				entry: {
					at: floorMinute(now),
					kind: "done",
					key: k,
					detail: "seen ticked"
				},
				task: name(t)
			});
		}
		const free = new Free(s, input.busy, c);
		const nudged = entries.filter((e) => e.kind === "nudged");
		const taken = nudged.map((e) => ({
			at: e.at,
			important: !!e.important
		}));
		const commit = (j, at, important, why, score) => {
			const entry = {
				at,
				kind: "nudged",
				key: j.key,
				titleKey: j.titleKey,
				important,
				detail: `score ${round1(score)} · ${why}`
			};
			writes.push({
				entry,
				task: name(j.task)
			});
		};
		const calendarNote = input.calendarRead ? "" : ", calendar not read";
		const judged = open.map((t) => judge(t, s, today));
		const waiting = [];
		for (const j of s.nudges ? judged : []) {
			const last = entries.find((e) => e.key === j.key);
			const ringing = nudged.find((e) => e.key === j.key && e.at <= now && now < e.at + RING);
			if (ringing) {
				const why = ringing.detail.replace(/^score [\d.]+ · /, "");
				planned.push(nudge(j, ringing.at, why, free, s, c));
				decisions.push({
					title: j.task.title,
					path: j.task.path,
					at: rfc3339(ringing.at, c),
					score: 0,
					why: `ringing · ${why}`
				});
				continue;
			}
			if (last?.kind === "snoozed" && last.until !== void 0 && now < last.until + RING) {
				const at = last.until, why = `snoozed to ${hhmm(wall(at, c).min)}${j.dateWords ? `, ${j.dateWords}` : ""}`;
				if (at <= now) commit(j, at, true, why, j.urgency);
				planned.push(nudge(j, at, why, free, s, c));
				taken.push({
					at,
					important: true
				});
				decisions.push({
					title: j.task.title,
					path: j.task.path,
					at: rfc3339(at, c),
					score: round1(j.urgency),
					why
				});
				continue;
			}
			if (j.eligible) waiting.push(j);
		}
		waiting.sort((a, b) => b.urgency - a.urgency || String(a.task.due ?? "9").localeCompare(String(b.task.due ?? "9")));
		const firstMoment = floorMinute(now);
		const moments = free.moments(firstMoment);
		const scheduledToday = /* @__PURE__ */ new Set();
		for (const j of waiting) {
			const best = (fit) => moments.filter((t) => free.room(t, j.minutes).fit === fit);
			let chosen, held = "";
			for (const t of [...best(1), ...best(.4)]) {
				const score = j.urgency * free.room(t, j.minutes).fit;
				if (score < s.threshold) {
					held = `score ${round1(score)} below ${s.threshold}`;
					break;
				}
				const win = windowOf(t, c);
				if (nudged.some((e) => (e.key === j.key || e.titleKey === j.titleKey) && windowOf(e.at, c) === win)) {
					held = "nudged in this window";
					continue;
				}
				if (!j.important) {
					const day = wall(t, c).day;
					if (taken.filter((x) => !x.important && wall(x.at, c).day === day).length >= budget.perDay) {
						held = `${budget.perDay} a day already`;
						continue;
					}
					if (taken.some((x) => Math.abs(x.at - t) < budget.gap * 6e4)) {
						held = `within ${budget.gap} min of another`;
						continue;
					}
				}
				chosen = t;
				break;
			}
			if (chosen === void 0) {
				decisions.push({
					title: j.task.title,
					path: j.task.path,
					score: round1(j.urgency),
					why: held || "no free moment in 36 h"
				});
				continue;
			}
			const room = free.room(chosen, j.minutes), score = j.urgency * room.fit;
			const end = hhmm(wall(room.until, c).min);
			const roomWords = room.until - chosen >= AHEAD ? "free" : room.free >= 120 ? `free until ${end}` : `${room.free} min free until ${end}`;
			const why = [
				j.dateWords,
				MARK[j.task.priority],
				roomWords
			].filter(Boolean).join(", ") + calendarNote;
			if (chosen <= now) commit(j, chosen, j.important, why, score);
			planned.push(nudge(j, chosen, why, free, s, c));
			taken.push({
				at: chosen,
				important: j.important
			});
			if (wall(chosen, c).day === today) scheduledToday.add(j.key);
			decisions.push({
				title: j.task.title,
				path: j.task.path,
				at: rfc3339(chosen, c),
				score: round1(score),
				why
			});
		}
		if (s.digest) digest(input, judged, scheduledToday, entries, writes, planned);
		return {
			planned,
			writes,
			decisions,
			budget
		};
	}
	/** The morning digest (§3.3): once a day at the first moment after quiet hours (not before Settings' time): what is
	*  overdue and due today, and how many tasks that may nudge have no moment today. */
	function digest(input, judged, scheduledToday, entries, writes, planned) {
		const { settings: s, clock: c } = input;
		const now = c.now, today = wall(now, c).day;
		const from = instant(today, Math.max(s.quietTo, s.digestAt), c);
		const given = entries.find((e) => e.kind === "digest" && wall(e.at, c).day === today);
		if (given ? now >= given.at + DIGEST_RINGS : now >= from && new Free(s, [], c).quiet(now)) return;
		const overdue = judged.filter((j) => j.task.due && j.task.due < today);
		const dueToday = judged.filter((j) => j.task.due === today);
		const unslotted = judged.filter((j) => j.eligible && !scheduledToday.has(j.key) && !overdue.includes(j) && !dueToday.includes(j));
		const counts = [
			overdue.length && `${overdue.length} overdue`,
			dueToday.length && `${dueToday.length} due today`,
			unslotted.length && `${unslotted.length} with no slot today`
		].filter(Boolean).join(", ");
		const names = [...overdue, ...dueToday].slice(0, 3).map((j) => j.task.title);
		const moment = given ? given.at : now >= from ? floorMinute(now) : from;
		if (!given && moment <= now) writes.push({ entry: {
			at: moment,
			kind: "digest",
			detail: counts || "nothing due"
		} });
		if (!counts) return;
		planned.push({
			at: rfc3339(moment, c),
			until: rfc3339(moment + DIGEST_RINGS, c),
			id: `plan:digest:${today}`,
			title: `Today: ${counts}`,
			body: names.join(" · "),
			...input.digestOpens ? { open: input.digestOpens } : {},
			actions: input.digestOpens ? [{
				id: "atlas:open",
				label: "Open"
			}] : []
		});
	}
	//#endregion
	//#region plugins/beta/plan/helper/helper.ts
	/** The clock: this device's, or a test's fixed moment and zone (`now` ms, `offset` minutes east of UTC). */
	function clockOf(p) {
		return typeof p.now === "number" ? fixedClock(p.now, Number(p.offset ?? 0)) : systemClock();
	}
	const folderOf = (p) => String(p.settings?.ledger || "plan/ledger").replace(/\/+$/, "");
	/** This device: its name in the ledger (Settings' `device`, else the computer's), and whether it plans. */
	async function device(p) {
		const d = await atlas.get("/api/device");
		return {
			name: String(p.settings?.device || d.name || "device"),
			plans: !!d.schedules
		};
	}
	async function tasks(status) {
		return (await atlas.get("/api/tasks", { status })).tasks;
	}
	/** The calendar's busy time from `from` for two days: timed events not marked free and not cancelled. No calendar
	*  plugin: nothing busy; one that fails: nothing busy, and the reasons say the calendar was not read. */
	async function busy(today) {
		try {
			const r = await atlas.post("/api/plugins/@calendar/helper", {
				method: "range",
				params: {
					from: today,
					to: addDays(today, 2)
				}
			});
			const out = [];
			for (const e of r.events ?? []) {
				if (e.all_day || e.free || String(e.status ?? "").toUpperCase() === "CANCELLED") continue;
				const start = Date.parse(e.start), end = Date.parse(e.end);
				if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({
					start,
					end
				});
			}
			return {
				busy: out,
				read: true
			};
		} catch (e) {
			if (e.status === 404) return {
				busy: [],
				read: true
			};
			console.error(`plan: the calendar could not be read: ${e instanceof Error ? e.message : e}`);
			return {
				busy: [],
				read: false
			};
		}
	}
	/** Every device's ledger notes of this month and the last (the 28 days the budget is measured on). */
	async function ledgers(folder, c) {
		let listed = [];
		try {
			listed = await atlas.tree(folder);
		} catch {
			return [];
		}
		const months = /* @__PURE__ */ new Set([wall(c.now, c).day.slice(0, 7), wall(c.now - 28 * DAY, c).day.slice(0, 7)]);
		const out = [];
		for (const f of listed.filter((f) => f.kind === "file" && f.name.endsWith(".md") && months.has(f.name.slice(0, 7)))) out.push(...parse(await atlas.read(f.path), c));
		return out.sort((a, b) => b.at - a.at);
	}
	/** Writes ledger lines into this device's notes, one per month, newest first. */
	async function record(writes, folder, deviceName, c) {
		const byMonth = /* @__PURE__ */ new Map();
		for (const w of writes) {
			const m = wall(w.entry.at, c).day.slice(0, 7);
			byMonth.set(m, [...byMonth.get(m) ?? [], w]);
		}
		for (const [month, list] of byMonth) {
			const path = fileOf(folder, month, deviceName);
			let text = null;
			try {
				text = await atlas.read(path);
			} catch {
				text = null;
			}
			const lines = list.sort((a, b) => b.entry.at - a.entry.at).map((w) => renderLine(w.entry, c, w.task));
			await atlas.write(path, add(text, lines, deviceName, month));
		}
	}
	/** The plan as of now, and what it decided; the ledger lines it makes are written only when `write`. */
	async function planNow(p, c, write) {
		const s = settingsOf(p.settings ?? {});
		const dev = await device(p);
		const folder = folderOf(p);
		const today = wall(c.now, c).day;
		const [all, cal, entries] = [
			await tasks("all"),
			await busy(today),
			await ledgers(folder, c)
		];
		let digestOpens = null;
		try {
			digestOpens = await atlas.get("/api/exists", { path: "Deadlines.page" }) ? "Deadlines.page" : null;
		} catch {
			digestOpens = null;
		}
		const out = plan({
			tasks: all,
			busy: cal.busy,
			calendarRead: cal.read,
			entries,
			settings: s,
			clock: c,
			digestOpens
		});
		if (write && dev.plans && out.writes.length) await record(out.writes, folder, dev.name, c);
		return {
			...out,
			device: dev.name,
			plans: dev.plans
		};
	}
	/** `on = "plan"`: the planned nudges, on the device that plans; none elsewhere. */
	async function nudges(p) {
		const out = await planNow(p, clockOf(p), true);
		if (!out.plans) return {
			planned: [],
			summary: `${out.device} does not run this vault's schedules: it does not nudge`
		};
		return {
			planned: out.planned,
			summary: `${out.planned.length} planned, ${out.writes.length} recorded`
		};
	}
	/** `on = "notice"`: Done or Snooze pressed on a nudge. */
	async function pressed(p) {
		const c = clockOf(p);
		const id = String(p.notice_id ?? ""), action = String(p.action ?? "");
		const key = id.replace(/^plan:/, "");
		if (!id.startsWith("plan:") || key.startsWith("digest:")) return {};
		const all = await tasks("all");
		const name = (t) => ({
			path: t.path,
			title: t.title,
			block: t.block
		});
		const open = all.find((t) => !t.done && keyOf(name(t)) === key);
		const dev = await device(p);
		const now = floorMinute(c.now);
		const writes = [];
		if (action === "done") {
			if (open) try {
				await atlas.post("/api/task/tick", {
					path: open.path,
					line: open.line,
					text: open.text,
					...open.block ? { block: open.block } : {}
				});
				writes.push({
					entry: {
						at: now,
						kind: "done",
						key,
						detail: "from the notification"
					},
					task: name(open)
				});
			} catch (e) {
				console.error(`plan: Done on ${key}: ${e instanceof Error ? e.message : e}`);
			}
		} else if (action.startsWith("snooze:")) {
			const until = fromStamp(action.slice(7).replace("T", " "), c);
			if (open && until !== null) {
				let block = open.block;
				if (!block) block = (await atlas.post("/api/task/block", {
					path: open.path,
					line: open.line,
					text: open.text
				})).block;
				const task = {
					...name(open),
					block
				};
				writes.push({
					entry: {
						at: now,
						kind: "snoozed",
						key: keyOf(task),
						until,
						detail: ""
					},
					task
				});
			}
		} else return {};
		if (writes.length) await record(writes, folderOf(p), dev.name, c);
		return { withdraw: [id] };
	}
	/** For Settings: the budget as measured, the plan's decisions and the ledger's last lines. Writes nothing. */
	async function explain(p) {
		const c = clockOf(p);
		const out = await planNow(p, c, false);
		const recent = (await ledgers(folderOf(p), c)).slice(0, 20).map((e) => e.line ?? renderLine(e, c));
		return {
			device: out.device,
			plans: out.plans,
			budget: out.budget,
			decisions: out.decisions,
			recent
		};
	}
	atlas.methods({
		nudges,
		pressed,
		explain
	});
	//#endregion
	exports.explain = explain;
	exports.nudges = nudges;
	exports.pressed = pressed;
	return exports;
})({});
