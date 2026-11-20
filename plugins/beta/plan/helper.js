// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	// plugins/beta/plan/helper/time.ts
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
	// plugins/beta/plan/helper/ledger.ts
	const KINDS = [
		"nudged",
		"snoozed",
		"done",
		"dismissed",
		"digest",
		"used"
	];
	/** The kinds about no task (no link on their line). */
	const UNLINKED = ["digest", "used"];
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
		const m = /^\[\[([^\]|#]+)(?:#\^([\w-]+))?(?:\|(.*))?\]\]$/.exec(link.trim());
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
		if (!KINDS.includes(kind)) return null;
		const e = {
			at,
			kind,
			detail: "",
			line: line.trim()
		};
		if (snooze) e.until = fromStamp(`${snooze[1] ?? m[1].slice(0, 10)} ${snooze[2]}`, c) ?? void 0;
		let rest = parts.slice(1);
		if (!UNLINKED.includes(kind)) {
			const link = rest[0] && fromLink(rest[0]);
			if (!link) return null;
			Object.assign(e, link);
			rest = rest.slice(1);
		}
		e.important = rest.some((p) => p.trim() === "important");
		e.detail = rest.filter((p) => p.trim() !== "important").join(" · ");
		return e;
	}
	/** A day's hours in use (0–23) as a `used` line says them: `08:00–12:00, 14:00–15:00` (each range's end excluded). */
	function hoursText(hours) {
		const hs = [...new Set(hours)].filter((h) => Number.isInteger(h) && h >= 0 && h < 24).sort((a, b) => a - b);
		const out = [];
		const two = (h) => `${String(h).padStart(2, "0")}:00`;
		for (let i = 0; i < hs.length;) {
			let j = i;
			while (j + 1 < hs.length && hs[j + 1] === hs[j] + 1) j += 1;
			out.push(`${two(hs[i])}–${two(hs[j] + 1)}`);
			i = j + 1;
		}
		return out.join(", ");
	}
	/** The hours a `used` line's detail names (the inverse of hoursText); a range it cannot read is left out. */
	function hoursOf(detail) {
		const out = [];
		for (const m of detail.matchAll(/(\d{2}):00[–-](\d{2}):00/g)) for (let h = Number(m[1]); h < Math.min(24, Number(m[2])); h++) out.push(h);
		return out;
	}
	/** A ledger line for an entry about `task` (none for a digest or a day's use). */
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
	/** A mark of a task's line as written (its block id aside: given on a snooze, it is no edit), so a dismissal can say
	*  which version of the task it was about: `line <8 hex digits>` in its detail (FNV-1a). */
	function lineMark(text) {
		let h = 2166136261;
		for (const ch of text.replace(/\s+\^[\w-]+\s*$/, "").trim()) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
		return h.toString(16).padStart(8, "0");
	}
	/** The line mark a dismissal's detail carries, if any. */
	const markOf = (e) => /(?:^|· )line ([0-9a-f]{8})\b/.exec(e.detail)?.[1];
	// plugins/beta/plan/helper/devices.ts
	/** A desktop used this recently is where the person is. */
	const AT_DESKTOP = 5 * MIN;
	/** A phone whose core reported this recently is running Atlas, so it can ring. */
	const PHONE_UP = 10 * MIN;
	/** A phone's exact alarm for a `plan/next.md` stamp covers a nudge whose moment is this much earlier than the stamp
	*  (the planner's rounds, 5 minutes apart, move a nudge not yet rung to the round's minute)… */
	const ARMED_BEFORE = 5 * MIN;
	/** …or up to this much later: the phone wakes 2 minutes after the stamp and rings what its own plan has due, and its
	*  ledger line takes a moment to reach the planner (the nudge's 30 minutes of ringing, plan.ts RING). */
	const ARMED_AFTER = 30 * MIN;
	function alarmsOf(a) {
		if (!a || typeof a !== "object" || !Array.isArray(a.nudges)) return null;
		return {
			exact: a.exact === true,
			nudges: a.nudges.filter((t) => typeof t === "number" && Number.isFinite(t))
		};
	}
	/** The core's `devices`, as far as they are well-formed. */
	function seenOf(raw) {
		if (!Array.isArray(raw)) return [];
		return raw.flatMap((d) => d && typeof d.id === "string" && (d.kind === "desktop" || d.kind === "phone") ? [{
			id: d.id,
			name: String(d.name ?? d.id),
			kind: d.kind,
			activeAt: typeof d.active_at === "number" ? d.active_at : null,
			reportedAt: Number(d.reported_at) || 0,
			here: d.here === true,
			alarms: alarmsOf(d.alarms)
		}] : []);
	}
	const latest = (a, b) => (b.activeAt ?? 0) > (a.activeAt ?? 0) ? b : a;
	/** The desktop used last when one was used in the last AT_DESKTOP; else the phone used last among those running
	*  Atlas; else — for the nudge at `moment`, when one is named — a phone that set an exact alarm for it (armedFor);
	*  else none. */
	function pick(devices, now, c, moment) {
		const desks = devices.filter((d) => d.kind === "desktop" && d.activeAt !== null && now - d.activeAt <= AT_DESKTOP);
		if (desks.length) {
			const d = desks.reduce(latest);
			return {
				device: d,
				why: `${d.name} was used at ${stamp(d.activeAt, c).slice(11)}`
			};
		}
		const phones = devices.filter((d) => d.kind === "phone" && now - d.reportedAt <= PHONE_UP);
		if (phones.length) {
			const d = phones.reduce(latest);
			return {
				device: d,
				why: `no computer used for ${AT_DESKTOP / MIN} min; ${d.name} runs Atlas`
			};
		}
		const armed = moment === void 0 ? null : armedFor(devices, moment);
		return armed && {
			device: armed.device,
			why: `no computer used for ${AT_DESKTOP / 6e4} min; ${armed.device.name} set an exact alarm for ${stamp(armed.stamp, c).slice(11)}`
		};
	}
	/** The phone trusted with the nudge at `moment` while its app is closed: one whose report says its alarms are exact
	*  and set for a stamp from ARMED_BEFORE after the moment to ARMED_AFTER before it (the latest used, when several).
	*  Per nudge, so it is safe: a nudge the phone never saw in `plan/next.md` (a new one, a moved one) is no stamp it
	*  armed, and stays with the planner; an inexact alarm (the permission withheld) may come minutes late in Doze. */
	function armedFor(devices, moment) {
		let best = null;
		for (const d of devices) {
			if (d.kind !== "phone" || !d.alarms?.exact) continue;
			const s = d.alarms.nudges.find((t) => moment >= t - ARMED_BEFORE && moment <= t + ARMED_AFTER);
			if (s !== void 0 && (!best || (d.activeAt ?? 0) > (best.device.activeAt ?? 0))) best = {
				device: d,
				stamp: s
			};
		}
		return best;
	}
	/** The devices whose core runs (reported in the last PHONE_UP, desktop or phone): one of them rings the nudges, by the
	*  rule above or as the planner, so the server's ntfy fallback stays silent. */
	function running(devices, now) {
		return devices.filter((d) => now - d.reportedAt <= PHONE_UP);
	}
	// plugins/beta/plan/helper/next.ts
	/** A plan this old is no longer the planner's word: another device plans for itself. */
	const STALE = 2 * HOUR;
	/** The plan is written again after this even when it has not changed. */
	const REFRESH = HOUR;
	/** The note beside the ledger folder: `plan/ledger` → `plan/next.md`. */
	const nextFileOf = (ledger) => {
		const i = ledger.replace(/\/+$/, "").lastIndexOf("/");
		return `${i < 0 ? "plan" : ledger.slice(0, i)}/next.md`;
	};
	/** One planned notice as a line: when, the task's link, why. */
	function lineOf(p, c) {
		const when = stamp(Date.parse(p.at), c);
		if (p.id.startsWith("plan:digest:")) return `- ${when} · digest · ${p.title.replace(/^Today: /, "")}`;
		const note = (p.subject ?? p.open ?? "").replace(/\.md(?=#|$)/i, "");
		return `- ${when} · ${note ? `[[${note}|${alias(p.title)}]]` : alias(p.title)}${p.body ? ` · ${p.body}` : ""}`;
	}
	function renderNext(planned, device, at, c) {
		const lines = [...planned].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map((p) => lineOf(p, c));
		return [
			"---",
			"type: plan-next",
			`device: ${device}`,
			`planned_at: ${stamp(at, c)}`,
			"---",
			`The next nudges, as planned by ${device}. Written by the Plan plugin each time the plan changes; edits are replaced.`,
			"",
			...lines.length ? lines : ["- nothing planned"],
			""
		].join("\n");
	}
	/** The device and the moment of a plan note; null for no note or one that is not ours. */
	function readNext(text, c) {
		const head = text && /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
		if (!head || !/^type: plan-next$/m.test(head)) return null;
		const device = /^device: (.+)$/m.exec(head)?.[1]?.trim();
		const at = fromStamp(/^planned_at: (.+)$/m.exec(head)?.[1] ?? "", c);
		return device && at !== null ? {
			device,
			plannedAt: at
		} : null;
	}
	const body = (text) => text.replace(/^planned_at: .*$/m, "");
	/** Whether the planner writes its note now: it changed, or its last writing is REFRESH old — unless another device
	*  that plans too (no `schedules_on` named: every computer runs the schedules) holds a fresh one: one writer, so sync
	*  never makes a conflict copy of it. */
	function shouldWrite(old, fresh, self, now, c) {
		const was = readNext(old, c);
		if (!was) return true;
		if (was.device !== self) return now - was.plannedAt >= STALE;
		return body(old) !== body(fresh) || now - was.plannedAt >= REFRESH;
	}
	/** Why a device that does not run the schedules plans for itself — the planner's note is missing or stale — or null
	*  when the planner's word holds. */
	function localReason(next, now, c) {
		if (!next) return "no device has written the plan";
		if (now - next.plannedAt < STALE) return null;
		return `${next.device} last planned ${stamp(next.plannedAt, c)}`;
	}
	// plugins/beta/plan/helper/habits.ts
	const WEEK = [
		"sun",
		"mon",
		"tue",
		"wed",
		"thu",
		"fri",
		"sat"
	];
	const EVERY = [...WEEK];
	const PRESETS = {
		gym: {
			days: [
				"mon",
				"wed",
				"fri"
			],
			from: 1020,
			to: 1200,
			nag: 30
		},
		running: {
			days: [
				"tue",
				"thu",
				"sat"
			],
			from: 420,
			to: 540,
			nag: 30
		},
		sleep: {
			days: EVERY,
			from: 1380,
			to: 1440,
			nag: 15
		}
	};
	/** Any other kind: every day, an hour from 09:00 (or from the time given). */
	const PLAIN = {
		days: EVERY,
		from: 540,
		to: 600,
		nag: 30
	};
	const presetOf = (kind) => PRESETS[kind.toLowerCase()] ?? PLAIN;
	/** "mon wed fri", ["mon", "wed"], "monday", "daily", "weekdays", "weekends" → the days; null when it names none (a
	*  word that is not a day — "evening" — names none). */
	function daysOf(v) {
		const words = (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[\s,]+/)).map((w) => w.trim().toLowerCase()).filter(Boolean);
		const out = /* @__PURE__ */ new Set();
		for (const w of words) {
			const day = WEEK.find((d) => w === d || w === FULL[d]);
			if (day) out.add(day);
			else if (w === "daily" || w === "everyday") EVERY.forEach((d) => out.add(d));
			else if (w === "weekdays") [
				"mon",
				"tue",
				"wed",
				"thu",
				"fri"
			].forEach((d) => out.add(d));
			else if (w === "weekends") ["sat", "sun"].forEach((d) => out.add(d));
			else return null;
		}
		return out.size ? WEEK.filter((d) => out.has(d)) : null;
	}
	const FULL = {
		sun: "sunday",
		mon: "monday",
		tue: "tuesday",
		wed: "wednesday",
		thu: "thursday",
		fri: "friday",
		sat: "saturday"
	};
	/** "17:00-20:00" (or "17:00–20:00") → minutes; an end before the start is the next day's. */
	function windowOf$1(v) {
		const m = /^\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*$/.exec(String(v ?? ""));
		const from = m && minuteOf(m[1]), to = m && minuteOf(m[2]);
		if (from === null || to === null || from === void 0 || to === void 0) return null;
		return {
			from,
			to: to <= from ? to + 1440 : to
		};
	}
	/** The habit a note's properties make, or null: not a habit, or paused. */
	function ruleOf(path, props) {
		const kind = String(props.habit ?? "").trim();
		if (!kind || props.paused === true || String(props.paused) === "true") return null;
		const p = presetOf(kind);
		const at = minuteOf(String(props.at ?? ""));
		const w = windowOf$1(props.window) ?? (at !== null ? {
			from: at,
			to: at + (p.to - p.from)
		} : {
			from: p.from,
			to: p.to
		});
		const nag = Number(props.nag);
		return {
			path,
			kind,
			title: path.split("/").pop().replace(/\.md$/i, ""),
			days: daysOf(props.days) ?? p.days,
			...w,
			nag: Number.isFinite(nag) && nag >= 5 ? Math.round(nag) : p.nag
		};
	}
	/** `habit <kind> [days…] [HH:MM | HH:MM-HH:MM]` in a capture → the habit's note (its name and text); null: not one. */
	function setupOf(line) {
		const m = /^\s*(?:[-*+] )?(?:\[ \] )?habit\s+(.+?)\s*$/i.exec(line);
		if (!m) return null;
		const words = m[1].split(/\s+/);
		const kind = [], days = [];
		let time = "";
		for (const w of words) if (/^\d{1,2}:\d{2}([-–]\d{1,2}:\d{2})?$/.test(w)) time = w.replace("–", "-");
		else if (daysOf(w) && !kind.length) return null;
		else if (daysOf(w)) days.push(w.toLowerCase());
		else if (!days.length && !time) kind.push(w);
		else return null;
		if (!kind.length) return null;
		const name = kind.join(" ").replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
		if (!name) return null;
		const p = presetOf(name);
		const props = [`habit: ${name.toLowerCase()}`];
		const d = days.length ? daysOf(days.join(" ")) : null;
		if (d) props.push(`days: [${d.join(", ")}]`);
		if (time.includes("-")) props.push(`window: "${time}"`);
		else if (time) {
			const from = minuteOf(time);
			props.push(`window: "${hhmm(from)}-${hhmm((from + (p.to - p.from)) % 1440)}"`);
		}
		return {
			name: name.charAt(0).toUpperCase() + name.slice(1),
			text: `---\n${props.join("\n")}\n---\nNagged in its window until done; Done or Skip today on the notification (Plan).\n`
		};
	}
	const nameOf = (r) => ({
		path: r.path,
		title: r.title
	});
	/** What every nag of a habit is about: Done withdraws them all by it. */
	const subjectOf = (path) => `${path}#habit`;
	/** A habit's ledger name from its key (`habits/Gym.md|Gym`). */
	function habitNameOf(key) {
		const bar = key.indexOf("|");
		return bar > 0 ? {
			path: key.slice(0, bar),
			title: key.slice(bar + 1)
		} : null;
	}
	/** A habit's notice id: its key and the nag's moment (each nag rings once; Done answers them all). */
	const noticeId = (key, at, c) => `plan:habit:${key}@${rfc3339(at, c)}`;
	/** The habit's key in a notice id, or null when the id is not a habit's. */
	function habitKeyOf(id) {
		if (!id.startsWith("plan:habit:")) return null;
		const rest = id.slice(11), at = rest.lastIndexOf("@");
		return at > 0 ? rest.slice(0, at) : null;
	}
	/** The nags of the habits now and in the next day and a half, and the ledger lines of those whose moment has come. */
	function habitPlan(rules, entries, c, mark = "") {
		const planned = [], writes = [];
		const now = c.now, today = wall(now, c).day;
		for (const r of rules) {
			const key = keyOf(nameOf(r));
			for (const day of [
				addDays(today, -1),
				today,
				addDays(today, 1)
			]) {
				const wd = WEEK[(/* @__PURE__ */ new Date(`${day}T12:00:00Z`)).getUTCDay()];
				if (!r.days.includes(wd)) continue;
				const start = instant(day, r.from, c), end = instant(day, r.to, c);
				if (end <= now) continue;
				const mine = entries.filter((e) => e.key === key && e.at >= start - 432e5 && e.at < end);
				if (mine.some((e) => e.kind === "done" || e.kind === "dismissed")) continue;
				const rang = new Set(mine.filter((e) => e.kind === "nudged").map((e) => e.at));
				for (let at = start, n = 1; at < end; at += r.nag * MIN, n++) {
					const until = Math.min(at + r.nag * MIN, end);
					if (until <= now) continue;
					if (at <= now && !rang.has(at)) writes.push({
						entry: {
							at,
							kind: "nudged",
							key,
							important: true,
							detail: `habit ${r.kind} · nag ${n}${mark}`
						},
						task: nameOf(r)
					});
					planned.push({
						at: rfc3339(at, c),
						until: rfc3339(until, c),
						id: noticeId(key, at, c),
						title: r.title,
						body: n === 1 ? `${hhmm(r.from % 1440)}–${hhmm(r.to % 1440)}: now` : `${hhmm(r.from % 1440)}–${hhmm(r.to % 1440)}: still not done (${n})`,
						open: r.path,
						subject: subjectOf(r.path),
						actions: [
							{
								id: "done",
								label: "Done"
							},
							{
								id: "skip",
								label: "Skip today"
							},
							{
								id: "atlas:open",
								label: "Open"
							}
						]
					});
					if (at > now) break;
				}
			}
		}
		return {
			planned,
			writes
		};
	}
	// plugins/beta/plan/helper/plan.ts
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
			quietMeasured: raw.quiet_measured === true,
			horizon: num("horizon", 7),
			stale: num("stale", 2),
			staleMax: num("stale_max", 30),
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
	const PART = (min) => min < 720 ? "morning" : min < 1080 ? "afternoon" : "evening";
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
	const QUIET_SHARE = .8;
	/** The quiet hours measured from the last 28 days (§3.3a): the days some device wrote a `used` line for; an hour is in
	*  use on such a day when a device was seen in use in it or a task was ticked in it (the ledger's done lines), and
	*  quiet when it was in use on no more than a fifth of the days. The range proposed is the longest run of quiet hours
	*  (across midnight; on a tie the one holding 03:00, else the first). */
	function quietOf(entries, c) {
		const today = wall(c.now, c).day, since = addDays(today, -28);
		const byDay = /* @__PURE__ */ new Map();
		for (const e of entries) {
			const day = wall(e.at, c).day;
			if (e.kind !== "used" || day < since || day >= today) continue;
			const hours = byDay.get(day) ?? /* @__PURE__ */ new Set();
			for (const h of hoursOf(e.detail)) hours.add(h);
			byDay.set(day, hours);
		}
		for (const e of entries) {
			const w = wall(e.at, c);
			if (e.kind === "done") byDay.get(w.day)?.add(Math.floor(w.min / 60));
		}
		const days = byDay.size;
		const none = {
			from: null,
			to: null,
			days,
			measured: days >= 14,
			used: false
		};
		if (days < 14) return none;
		const quiet = Array.from({ length: 24 }, (_, h) => [...byDay.values()].filter((hs) => !hs.has(h)).length >= QUIET_SHARE * days);
		if (quiet.every(Boolean) || !quiet.some(Boolean)) return none;
		const start = quiet.indexOf(false);
		const holds3 = (r) => (3 - r.from + 24) % 24 < r.len;
		const runs = [];
		for (let i = 1; i <= 24; i++) {
			const h = (start + i) % 24, last = runs[runs.length - 1];
			if (!quiet[h]) continue;
			if (last && (last.from + last.len) % 24 === h) last.len += 1;
			else runs.push({
				from: h,
				len: 1
			});
		}
		const best = runs.reduce((a, r) => r.len > a.len || r.len === a.len && holds3(r) && !holds3(a) ? r : a);
		return {
			...none,
			from: best.from * 60,
			to: (best.from + best.len) % 24 * 60
		};
	}
	/** A task's kind for its habit: its first tag (`#writing`), else its note's folder (`notes/thesis/`, `/` at the top). */
	function groupOf(t) {
		if (t.tags[0]) return `#${t.tags[0].replace(/^#/, "").toLowerCase()}`;
		const i = t.path.lastIndexOf("/");
		return i < 0 ? "/" : `${t.path.slice(0, i)}/`;
	}
	/** The habits from the ledger's done lines of the last 90 days, each matched to its task (still listed, done or not)
	*  for its kind; a done line whose task is gone is left out. */
	function habitsOf(entries, tasks, c) {
		const byKey = /* @__PURE__ */ new Map();
		for (const t of tasks) {
			const n = {
				path: t.path,
				title: t.title,
				block: t.block
			};
			byKey.set(keyOf(n), t);
			if (!byKey.has(titleKey(n))) byKey.set(titleKey(n), t);
		}
		const out = /* @__PURE__ */ new Map();
		for (const e of entries) {
			if (e.kind !== "done" || e.at < c.now - 7776e6 || e.at > c.now) continue;
			const t = e.key && byKey.get(e.key) || e.titleKey && byKey.get(e.titleKey);
			if (!t) continue;
			const g = groupOf(t), h = out.get(g) ?? {
				group: g,
				done: 0,
				hours: Array(24).fill(0),
				days: Array.from({ length: 7 }, () => Array(24).fill(0))
			};
			const hour = Math.floor(wall(e.at, c).min / 60);
			h.hours[hour] += 1;
			h.days[weekdayOf(e.at, c)][hour] += 1;
			h.done += 1;
			out.set(g, h);
		}
		return out;
	}
	/** The local weekday of `ms` (0 Sunday … 6 Saturday). */
	const weekdayOf = (ms, c) => (/* @__PURE__ */ new Date(`${wall(ms, c).day}T12:00:00Z`)).getUTCDay();
	/** The habit of the hour (§3.3): 0.5 + the hour's share of the busiest, smoothed over the hours beside it — from 0.5
	*  to 1.5; 1 for a kind with fewer than HABIT_MIN done times. The profile is the moment's weekday's, shrunk toward
	*  the every-day one by WEEKDAY_PRIOR pseudo-records. */
	function habitFactor(h, ms, c) {
		if (!h || h.done < 10) return 1;
		const smooth = (hours, i) => hours[i] + .5 * (hours[(i + 23) % 24] + hours[(i + 1) % 24]);
		const all = h.hours.map((_, i) => smooth(h.hours, i)), allSum = all.reduce((a, b) => a + b, 0);
		const own = h.days?.[weekdayOf(ms, c)] ?? Array(24).fill(0);
		const mine = own.map((_, i) => smooth(own, i)), mineSum = mine.reduce((a, b) => a + b, 0);
		const profile = all.map((x, i) => (mine[i] + 10 * (allSum ? x / allSum : 0)) / (mineSum + 10));
		const top = Math.max(...profile);
		return top > 0 ? .5 + profile[Math.floor(wall(ms, c).min / 60)] / top : 1;
	}
	/** Fatigue (§3.3): × 0.8 for each nudge of any task in the hour before `ms`. */
	const fatigue = (taken, ms) => .8 ** taken.filter((x) => x.at < ms && x.at > ms - 36e5).length;
	/** The mark of a nudge a device planned for itself (§3.7, "Offline"). */
	const LOCAL = " · (local plan)";
	/** The marks a nudge's ledger line may end in (this one, fallback.ts's ntfy), left out of its reasons. */
	const MARKS = / · \((?:local plan|ntfy)\)/g;
	/** Presence (§3.3): no use of this device for AWAY_AFTER weighs a nudge now by AWAY; later moments are not weighed
	*  (whoever comes back is there then). Unknown presence weighs nothing. */
	const AWAY_AFTER = 30 * MIN;
	const AWAY = .6;
	const awaySince = (activeAt, now) => activeAt && now - activeAt >= AWAY_AFTER ? activeAt : null;
	const DISMISS_DAYS = 3;
	/** The dismissals of this version of the task (its line unchanged since), newest first. */
	const dismissalsOf = (entries, j) => {
		const mark = lineMark(j.task.text);
		return entries.filter((e) => e.kind === "dismissed" && (e.key === j.key || e.titleKey === j.titleKey) && markOf(e) === mark);
	};
	/** × 0.6 for each dismissal of the task on the day of `ms`. */
	const dismissedFactor = (dismissed, ms, c) => .6 ** dismissed.filter((e) => e.at < ms && wall(e.at, c).day === wall(ms, c).day).length;
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
	/** When a task was written: its ➕ created date, else a date in its note's name (a daily log's `2026-11-05.md`, a
	*  report's "… 2026-11-04 to 11-18": the first full date) — null when neither says. */
	function writtenOf(t) {
		const created = /➕\s*(\d{4}-\d{2}-\d{2})/u.exec(t.text);
		if (created) return created[1];
		const name = t.path.split("/").pop() ?? "";
		return /(\d{4}-\d{2}-\d{2})/.exec(name)?.[1] ?? null;
	}
	/** Which tasks may nudge (§3.1, decision 7): dated within the horizon or overdue, or priority ≥ high — and, with no
	*  date at all, one left open `stale` days or more (most real to-dos are written undated: a daily log's `- [ ] …`
	*  lines; without this nothing ever qualified) but not over `staleMax` (a task open for months is a someday: those
	*  rang, 164 to 418 days old). Not in an excluded folder, not untitled; its 🛫 start come. Important
	*  (not budgeted): ⏫/🔺, overdue, due today — an old undated task never is, so the budget holds it. */
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
		const written = date ? null : writtenOf(t);
		const waited = written ? daysBetween(written, today) : -1;
		const stale = !date && s.stale > 0 && waited >= s.stale && waited <= s.staleMax;
		const pr = pressure(t, today);
		const p = stale ? 1 + Math.min(waited - s.stale, 14) / 28 : pr.p;
		const words = stale ? `open ${waited} days` : pr.words;
		return {
			task: t,
			key: keyOf(name),
			titleKey: titleKey(name),
			eligible: !t.done && !excluded && started && !!t.title.trim() && (within || high || stale),
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
		return `${w.day} ${PART(w.min)}`;
	}
	/** The budget measured from the last 28 days of ledger (§3.3a): N, the largest rank of the day still acted on (done or
	*  snoozed within 2 h) 25 % of the time and at half rank 1's rate at least, one more when the last rank seen was;
	*  G, the shortest gap whose acted-on rate is within 80 % of the best. 6 and 45 min until 14 days of ledger exist.
	*  A number pinned in Settings wins. */
	function measure(entries, s, c) {
		const since = c.now - 28 * DAY;
		const recent = entries.filter((e) => e.at >= since && e.at <= c.now && e.kind !== "used");
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
	/** A Block button's action id: the slot's start and its length in minutes (`block:2026-11-16T16:00+30`). */
	function blockAction(start, minutes) {
		return `block:${start.replace(" ", "T")}+${minutes}`;
	}
	/** The slot a Block action names, or null when it is not one. */
	function blockOf(action) {
		const m = /^block:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\+(\d+)$/.exec(action);
		return m ? {
			start: m[1],
			minutes: Number(m[2])
		} : null;
	}
	/** A task's words as a notification shows them: an embedded picture or note left out, a link as its text
	*  (`[[note|text]]` → text, `[[folder/note]]` → note, `[text](url)` → text) — a log line often starts with a pasted
	*  picture. The title itself (what names the task in the ledger) is never changed. */
	function shown(title) {
		return title.replace(/!\[\[[^\]]*\]\]/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, (_, t) => t.split("#")[0].split("/").pop() ?? t).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim() || "A task with a picture";
	}
	/** The planned notice of a nudge at `at`. Block (when the calendar can) comes before Open: a phone shows three
	*  buttons, and a tap on the notification opens the task anyway. */
	function nudge(j, at, why, free, s, c, canBlock = false) {
		const t = j.task, later = snoozeTo(at, j, free, s);
		return {
			at: rfc3339(at, c),
			until: rfc3339(at + RING, c),
			id: `plan:${j.key}`,
			title: shown(t.title),
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
				...canBlock ? [{
					id: blockAction(stamp(later, c), j.minutes),
					label: `Block ${when(later, c)}`
				}] : [],
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
		const measuredQuiet = quietOf(input.entries, input.clock);
		const quiet = {
			...measuredQuiet,
			used: input.settings.quietMeasured && measuredQuiet.from !== null
		};
		if (quiet.used) input = {
			...input,
			settings: {
				...input.settings,
				quietFrom: quiet.from,
				quietTo: quiet.to
			}
		};
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
			if (openKeys.has(k)) continue;
			if (last && (last.kind === "nudged" || last.kind === "snoozed" || last.kind === "dismissed")) writes.push({
				entry: {
					at: floorMinute(now),
					kind: "done",
					key: k,
					detail: "seen ticked"
				},
				task: name(t)
			});
			else if (input.wasOpen?.has(k) && !entries.some((e) => e.key === k && e.kind === "done")) writes.push({
				entry: {
					at: floorMinute(now),
					kind: "done",
					key: k,
					detail: "seen ticked, never nudged"
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
				detail: `score ${round1(score)} · ${why}${input.local ? LOCAL : ""}${input.mark ?? ""}`
			};
			writes.push({
				entry,
				task: name(j.task)
			});
		};
		const calendarNote = input.calendarRead ? "" : ", calendar not read";
		const away = awaySince(input.activeAt, now);
		const presence = (t) => away !== null && t <= now ? AWAY : 1;
		const awayNote = away === null ? "" : `, no one at this device since ${wall(away, c).day === today ? hhmm(wall(away, c).min) : wall(away, c).day}`;
		const judged = open.map((t) => judge(t, s, today));
		const waiting = [];
		for (const j of s.nudges ? judged : []) {
			const last = entries.find((e) => e.key === j.key);
			const ringing = nudged.find((e) => e.key === j.key && e.at <= now && now < e.at + RING);
			if (ringing) {
				const why = ringing.detail.replace(/^score [\d.]+ · /, "").replace(MARKS, "");
				planned.push(nudge(j, ringing.at, why, free, s, c, input.canBlock));
				decisions.push({
					title: shown(j.task.title),
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
				planned.push(nudge(j, at, why, free, s, c, input.canBlock));
				taken.push({
					at,
					important: true
				});
				decisions.push({
					title: shown(j.task.title),
					path: j.task.path,
					at: rfc3339(at, c),
					score: round1(j.urgency),
					why
				});
				continue;
			}
			const dismissed = dismissalsOf(entries, j).filter((e) => e.at > now - DISMISS_DAYS * DAY);
			if (j.eligible && dismissed.length >= 3 && !(j.task.due && j.task.due <= today)) {
				decisions.push({
					title: shown(j.task.title),
					path: j.task.path,
					score: round1(j.urgency),
					why: `paused: dismissed ${dismissed.length} times since ${wall(dismissed[dismissed.length - 1].at, c).day}; editing the task, or its due day, brings it back`
				});
				continue;
			}
			if (j.eligible) waiting.push(j);
		}
		waiting.sort((a, b) => b.urgency - a.urgency || String(a.task.due ?? "9").localeCompare(String(b.task.due ?? "9")));
		const firstMoment = floorMinute(now);
		const moments = free.moments(firstMoment);
		const scheduledToday = /* @__PURE__ */ new Set();
		const habits = habitsOf(entries, input.tasks, c);
		for (const j of waiting) {
			const habit = habits.get(groupOf(j.task));
			const learnt = !!habit && habit.done >= 10;
			const dismissed = dismissalsOf(entries, j);
			const scoreAt = (t) => j.urgency * free.room(t, j.minutes).fit * fatigue(taken, t) * dismissedFactor(dismissed, t, c) * presence(t);
			const best = (fit) => moments.filter((t) => free.room(t, j.minutes).fit === fit);
			let chosen, top = 0, held = "";
			for (const t of [...best(1), ...best(.4)]) {
				if (chosen !== void 0 && (!learnt || wall(t, c).day !== wall(chosen, c).day || free.room(t, j.minutes).fit !== free.room(chosen, j.minutes).fit)) break;
				const score = scoreAt(t);
				if (score < s.threshold) {
					held ||= `score ${round1(score)} below ${s.threshold}${presence(t) < 1 ? awayNote : ""}`;
					continue;
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
				const ranked = score * habitFactor(habit, t, c);
				if (chosen === void 0 || ranked > top + 1e-9) {
					chosen = t;
					top = ranked;
				}
			}
			if (chosen === void 0) {
				decisions.push({
					title: shown(j.task.title),
					path: j.task.path,
					score: round1(j.urgency),
					why: held || "no free moment in 36 h"
				});
				continue;
			}
			const room = free.room(chosen, j.minutes), score = scoreAt(chosen);
			const end = hhmm(wall(room.until, c).min);
			const roomWords = room.until - chosen >= AHEAD ? "free" : room.free >= 120 ? `free until ${end}` : `${room.free} min free until ${end}`;
			const usual = learnt && habitFactor(habit, chosen, c) >= 1.25 ? `you usually finish ${habit.group.startsWith("#") ? habit.group : `tasks in ${habit.group}`} in the ${PART(wall(chosen, c).min)}` : "";
			const why = [
				j.dateWords,
				MARK[j.task.priority],
				roomWords,
				usual
			].filter(Boolean).join(", ") + calendarNote;
			if (chosen <= now) commit(j, chosen, j.important, why, score);
			planned.push(nudge(j, chosen, why, free, s, c, input.canBlock));
			taken.push({
				at: chosen,
				important: j.important
			});
			if (wall(chosen, c).day === today) scheduledToday.add(j.key);
			decisions.push({
				title: shown(j.task.title),
				path: j.task.path,
				at: rfc3339(chosen, c),
				score: round1(score),
				why
			});
		}
		if (s.digest) digest(input, judged, scheduledToday, entries, writes, planned);
		const nags = habitPlan(input.habits ?? [], entries, c, `${input.local ? LOCAL : ""}${input.mark ?? ""}`);
		planned.push(...nags.planned);
		writes.push(...nags.writes);
		return {
			planned,
			writes,
			decisions,
			budget,
			habits: [...habits.values()].sort((a, b) => b.done - a.done),
			quiet
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
		const names = [
			...overdue,
			...dueToday,
			...unslotted
		].slice(0, 3).map((j) => shown(j.task.title));
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
	// plugins/beta/plan/helper/fallback.ts
	/** The ledger mark of a nudge sent through ntfy (left out of its reasons while it rings). */
	const NTFY = " · (ntfy)";
	/** The messages for what has just come due (the plan's `writes` of nudges and the digest), each with its planned
	*  notice. Without `showText` a message says nothing of the task: "A task is waiting" and the buttons. */
	function messagesOf(planned, writes, showText) {
		const byId = new Map(planned.map((p) => [p.id, p]));
		const out = [];
		for (const w of writes) if (w.entry.kind === "nudged") {
			const p = byId.get(`plan:${w.entry.key}`);
			if (!p) continue;
			const buttons = p.actions.filter((a) => !a.id.startsWith("atlas:")).map((a) => ({
				label: a.label,
				action: a.id
			}));
			out.push({
				noticeId: p.id,
				title: showText ? p.title : "A task is waiting",
				text: showText ? p.body || "Now is a good moment" : "Open Atlas to see it, or answer here.",
				buttons,
				writes: [w]
			});
		} else if (w.entry.kind === "digest") {
			const p = [...byId.values()].find((x) => x.id.startsWith("plan:digest:"));
			if (!p) continue;
			out.push({
				noticeId: p.id,
				title: p.title,
				text: showText && p.body ? p.body : "Open Atlas for the list.",
				buttons: [],
				writes: [w]
			});
		}
		return out;
	}
	/** The writes that are no message (a tick seen): written whether or not anything is sent. */
	const quietWrites = (writes) => writes.filter((w) => w.entry.kind !== "nudged" && w.entry.kind !== "digest");
	/** How long a button's token lives: a press the next morning still records Done (a Done on a task already done does
	*  nothing; a snooze to a moment gone is not kept). */
	const BUTTON_TTL = 86400;
	/** The server's address for the buttons: Settings' when given, else as the core saw the devices reach it; null when
	*  neither is known (then the message goes without buttons). */
	function baseOf(setting, origin) {
		const own = String(setting ?? "").trim().replace(/\/+$/, "");
		if (/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(own)) return own.replace(/\/v\/[^/]+$/, "").replace(/\/+$/, "");
		return typeof origin === "string" && /^https?:\/\/[^\s/]+$/.test(origin) ? origin : null;
	}
	// plugins/beta/plan/helper/helper.ts
	/** The clock: this device's, or a test's fixed moment and zone (`now` ms, `offset` minutes east of UTC). */
	function clockOf(p) {
		return typeof p.now === "number" ? fixedClock(p.now, Number(p.offset ?? 0)) : systemClock();
	}
	const folderOf = (p) => String(p.settings?.ledger || "plan/ledger").replace(/\/+$/, "");
	/** This device: its name in the ledger (Settings' `device`, else the computer's), whether it plans, its last use, and
	*  the person's devices as the mirror server shares them. */
	async function device(p) {
		const d = await atlas.get("/api/device");
		return {
			name: String(p.settings?.device || d.name || "device"),
			plans: !!d.schedules,
			activeAt: typeof d.active_at === "number" ? d.active_at : null,
			devices: seenOf(d.devices)
		};
	}
	/** Whether this device rings, and why it plans for itself when it is not the planner (`local`): the device rule's
	*  pick when the presence known makes one; else the planner rings, and another device only while the planner's note
	*  is missing or stale. */
	function role(plans, at, stale) {
		if (at) return {
			rings: at.device.here,
			local: at.device.here && !plans ? `you are at it (${at.why})` : null
		};
		const local = plans ? null : stale();
		return {
			rings: plans || local !== null,
			local
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
				read: true,
				calendar: true
			};
		} catch (e) {
			if (e.status === 404) return {
				busy: [],
				read: true,
				calendar: false
			};
			console.error(`plan: the calendar could not be read: ${e instanceof Error ? e.message : e}`);
			return {
				busy: [],
				read: false,
				calendar: true
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
			const have = new Set((text ?? "").split("\n"));
			const lines = list.sort((a, b) => b.entry.at - a.entry.at).map((w) => renderLine(w.entry, c, w.task)).filter((l) => !have.has(l));
			if (!lines.length) continue;
			await atlas.write(path, add(text, lines, deviceName, month));
		}
	}
	async function readOr(path) {
		try {
			return await atlas.read(path);
		} catch {
			return null;
		}
	}
	/** The tasks open at this helper's last round (plan.ts `Input.wasOpen`): a task ticked between two rounds is a done
	*  time. In memory only: after a restart the first round only learns, so a tick made while no helper ran is never
	*  given the wrong hour. */
	let wasOpen = null;
	/** The day's hours this device was seen in use (§3.3a), kept between rounds in memory and in `.atlas/cache` (a
	*  restart keeps them; nothing of the vault): `{ device, day, hours }`. */
	let used = null;
	const usedFileOf = (deviceName) => `.atlas/cache/${atlas.id}-used-${deviceName.replace(/[^\w.-]+/g, "_")}.json`;
	/** For the tests: forget the hours kept in memory (the cache file stays). */
	function forgetUsed() {
		used = null;
	}
	/** One round's look at this device's presence: the hour of its last use joins its day's hours; once a day is over, its
	*  hours become one `used` line in this device's ledger (stamped 23:59 of that day; none for a day it was never seen
	*  in use, and none twice: a line already there for that day is kept). */
	async function keepUsed(deviceName, activeAt, folder, c) {
		const file = usedFileOf(deviceName), today = wall(c.now, c).day;
		if (!used || used.device !== deviceName) {
			let kept = null;
			try {
				kept = JSON.parse(await readOr(file) ?? "null");
			} catch {
				kept = null;
			}
			used = kept && typeof kept.day === "string" && Array.isArray(kept.hours) ? {
				device: deviceName,
				day: kept.day,
				hours: kept.hours.filter((h) => typeof h === "number")
			} : {
				device: deviceName,
				day: today,
				hours: []
			};
		}
		const before = JSON.stringify(used);
		const seen = activeAt === null ? null : wall(activeAt, c);
		if (seen && seen.day === used.day && !used.hours.includes(Math.floor(seen.min / 60))) used.hours = [...used.hours, Math.floor(seen.min / 60)].sort((a, b) => a - b);
		if (used.day < today) {
			if (used.hours.length) {
				const at = instant(used.day, 1439, c);
				const mine = await readOr(fileOf(folder, used.day.slice(0, 7), deviceName));
				if (!(mine !== null && parse(mine, c).some((e) => e.kind === "used" && wall(e.at, c).day === used.day))) await record([{ entry: {
					at,
					kind: "used",
					detail: hoursText(used.hours)
				} }], folder, deviceName, c);
			}
			used = {
				device: deviceName,
				day: today,
				hours: seen && seen.day === today ? [Math.floor(seen.min / 60)] : []
			};
		}
		if (JSON.stringify(used) !== before) await atlas.write(file, JSON.stringify({
			day: used.day,
			hours: used.hours
		}));
	}
	/** The nudges handed to a phone that set an exact alarm for them (devices.ts armedFor), while the presence picks no
	*  device: they stay in `plan/next.md`, but this device neither rings nor records them. */
	function handOff(out, devices, c) {
		const armed = (moment) => pick(devices, c.now, c, moment);
		const handed = [];
		return {
			planned: out.planned.filter((p) => {
				const a = armed(Date.parse(p.at));
				if (a) handed.push(a);
				return !a;
			}),
			writes: out.writes.filter((w) => !((w.entry.kind === "nudged" || w.entry.kind === "digest") && armed(w.entry.at))),
			handed
		};
	}
	/** The habit notes: every note with a `habit` property, wherever it is (one Bases query over the core's index). */
	async function habitRules() {
		const src = `filters:\n  and:\n    - file.hasProperty("habit")\nviews:\n  - type: table\n    name: habits\n    order:\n${[
			"habit",
			"days",
			"window",
			"at",
			"nag",
			"paused"
		].map((k) => `      - ${JSON.stringify(k)}\n`).join("")}`;
		try {
			const v = (await atlas.post("/api/base/query", { src })).views?.[0];
			const cols = (v?.columns ?? []).map((c) => c.key ?? "");
			return (v?.rows ?? []).flatMap((row) => {
				const props = Object.fromEntries(cols.map((k, i) => [k, row.values?.[i]]).filter(([k, x]) => k && x !== null && x !== void 0));
				const rule = row.path ? ruleOf(row.path, props) : null;
				return rule ? [rule] : [];
			});
		} catch (e) {
			if (e.status !== 404) console.error(`plan: the habit notes could not be read: ${e instanceof Error ? e.message : e}`);
			return [];
		}
	}
	/** The plan from the vault's tasks, the calendar's busy time and every ledger (`more`: what this device knows besides). */
	async function gather(s, folder, c, more) {
		const today = wall(c.now, c).day;
		const [all, cal, entries, habits] = [
			await tasks("all"),
			await busy(today),
			await ledgers(folder, c),
			await habitRules()
		];
		let digestOpens = null;
		try {
			digestOpens = await atlas.get("/api/exists", { path: "Deadlines.page" }) ? "Deadlines.page" : null;
		} catch {
			digestOpens = null;
		}
		return {
			out: plan({
				tasks: all,
				busy: cal.busy,
				calendarRead: cal.read,
				canBlock: cal.calendar && cal.read,
				habits,
				entries,
				settings: s,
				clock: c,
				digestOpens,
				...more
			}),
			all
		};
	}
	/** The plan as of now, and what it decided; the ledger lines it makes are written only when `write`, and only by the
	*  device that rings (`role`). The planner writes `plan/next.md` whoever rings. */
	async function planNow(p, c, write) {
		const s = settingsOf(p.settings ?? {});
		const dev = await device(p);
		const folder = folderOf(p);
		const at = pick(dev.devices, c.now, c);
		const note = dev.plans || at ? null : await readOr(nextFileOf(folder));
		const { rings, local } = role(dev.plans, at, () => localReason(readNext(note, c), c.now, c));
		if (write) await keepUsed(dev.name, dev.activeAt, folder, c);
		const { out, all } = await gather(s, folder, c, {
			activeAt: dev.activeAt,
			local: local !== null,
			wasOpen: write ? wasOpen ?? void 0 : void 0
		});
		const own = at ? {
			planned: out.planned,
			writes: out.writes,
			handed: []
		} : handOff(out, dev.devices, c);
		if (write) wasOpen = new Set(all.filter((t) => !t.done).map((t) => keyOf({
			path: t.path,
			title: t.title,
			block: t.block
		})));
		if (write && rings && own.writes.length) await record(own.writes, folder, dev.name, c);
		if (write && dev.plans) {
			const path = nextFileOf(folder), old = await readOr(path), fresh = renderNext(out.planned, dev.name, floorMinute(c.now), c);
			if (shouldWrite(old, fresh, dev.name, c.now, c)) await atlas.write(path, fresh);
		}
		return {
			...out,
			planned: own.planned,
			writes: own.writes,
			handed: own.handed,
			device: dev.name,
			plans: dev.plans,
			local,
			activeAt: dev.activeAt,
			rings,
			at
		};
	}
	/** `on = "plan"`: the planned nudges, on the device that rings; none elsewhere. */
	async function nudges(p) {
		const out = await planNow(p, clockOf(p), true);
		if (out.at && !out.rings) return {
			planned: [],
			summary: `nudges ring on ${out.at.device.name}: ${out.at.why}`
		};
		if (!out.rings) return {
			planned: [],
			summary: `${out.device} does not run this vault's schedules: it does not nudge`
		};
		const local = out.local ? ` (local plan: ${out.local})` : "";
		const handed = out.handed.length ? `; ${out.handed.length} left to ${[...new Set(out.handed.map((h) => h.device.name))].join(", ")} (an exact alarm set for it)` : "";
		return {
			planned: out.planned,
			summary: `${out.planned.length} planned, ${out.writes.length} recorded${local}${handed}`
		};
	}
	/** `on = "notice"`: Done or Snooze pressed on a nudge, or the nudge dismissed (`atlas:dismissed`, said by the core:
	*  recorded with its line's mark, for the back-off). */
	async function pressed(p) {
		const c = clockOf(p);
		const id = String(p.notice_id ?? ""), action = String(p.action ?? "");
		const key = id.replace(/^plan:/, "");
		if (!id.startsWith("plan:") || key.startsWith("digest:")) return {};
		const habit = habitKeyOf(id);
		if (habit) return habitPressed(habit, action, id, p, c);
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
		} else if (blockOf(action)) {
			const slot = blockOf(action);
			const start = fromStamp(slot.start.replace("T", " "), c);
			if (open && start !== null) {
				const end = start + slot.minutes * 6e4;
				try {
					const r = await atlas.post("/api/plugins/@calendar/tools/time_block", {
						title: open.title,
						start: slot.start,
						end: stamp(end, c).replace(" ", "T"),
						task: {
							path: open.path,
							line: open.line,
							text: open.text
						}
					});
					const task = {
						...name(open),
						block: r.block ?? open.block
					};
					writes.push({
						entry: {
							at: now,
							kind: "snoozed",
							key: keyOf(task),
							until: end,
							detail: `time-blocked${r.label ? ` · ${r.label}` : ""}`
						},
						task
					});
				} catch (e) {
					console.error(`plan: Block on ${key}: ${e instanceof Error ? e.message : e}`);
					return {};
				}
			}
		} else if (action === "atlas:dismissed") {
			if (open) writes.push({
				entry: {
					at: now,
					kind: "dismissed",
					key,
					detail: `line ${lineMark(open.text)}`
				},
				task: name(open)
			});
		} else return {};
		if (writes.length) await record(writes, folderOf(p), dev.name, c);
		return { withdraw: [id] };
	}
	/** Done or Skip today on a habit's nag: the ledger says it, and every nag of it today goes. A nag swiped away is
	*  nothing: the next one comes (that is what a habit asked for). */
	async function habitPressed(key, action, id, p, c) {
		const name = habitNameOf(key);
		if (!name || action !== "done" && action !== "skip") return {};
		const dev = await device(p);
		await record([{
			entry: action === "done" ? {
				at: floorMinute(c.now),
				kind: "done",
				key,
				detail: "habit · from the notification"
			} : {
				at: floorMinute(c.now),
				kind: "dismissed",
				key,
				detail: "habit · skipped today"
			},
			task: name
		}], folderOf(p), dev.name, c);
		return { withdraw: [id, subjectOf(name.path)] };
	}
	/** `on = "capture"`: `habit gym mon wed fri 18:00` in a capture makes the habit's note (once; an existing one is
	*  left as it is, and named). Any other capture is not this plugin's. */
	async function capture(p) {
		const made = String(p.text ?? "").split("\n").map(setupOf).find((x) => x !== null);
		if (!made) return { skipped: "no habit line" };
		const path = `${String(p.settings?.habits || "habits").replace(/\/+$/, "")}/${made.name}.md`;
		if (await readOr(path) !== null) return {
			path,
			notice: `The habit ${made.name} already has its note: edit it there.`
		};
		await atlas.write(path, made.text);
		return {
			path,
			notice: `Habit ${made.name}: nagged in its window until done.`
		};
	}
	/** The Notifications plugin's `send`; a failure (not installed, no phone topic) is said, not thrown. */
	async function send(msg) {
		try {
			await atlas.post("/api/plugins/notifications/tools/send", {
				title: msg.title,
				text: msg.text,
				...msg.actions.length ? { actions: msg.actions } : {},
				...msg.click ? { click: msg.click } : {}
			});
			return null;
		} catch (e) {
			return e.status === 404 ? "the Notifications plugin is not installed or switched on" : `not sent: ${e instanceof Error ? e.message : e}`;
		}
	}
	/** Scheduled on the server (`background = "server"`): when no device of the person runs Atlas, the nudges that come due
	*  go out through ntfy with Done / Snooze buttons (hook `press`); recorded in the server's ledger once each went, with
	*  `(ntfy)`. Silent on a core with a person at it, when no device ever reported (who runs Atlas is unknown), while
	*  one runs, and when Settings turn it off. */
	async function fallback(p) {
		const c = clockOf(p);
		const d = await atlas.get("/api/device");
		if (d.person !== false) return {
			sent: 0,
			summary: "this core shows its own notices: it rings nudges itself"
		};
		if (p.settings?.ntfy_fallback === false) return {
			sent: 0,
			summary: "the ntfy fallback is off (Settings → Plan)"
		};
		const devices = seenOf(d.devices);
		if (!devices.length) return {
			sent: 0,
			summary: "no device has reported to this server: whether one runs Atlas is unknown, nothing sent"
		};
		const up = running(devices, c.now);
		if (up.length) return {
			sent: 0,
			summary: `${up.map((x) => x.name).join(", ")} ${up.length === 1 ? "runs" : "run"} Atlas: the nudges ring there`
		};
		const at = pick(devices, c.now, c);
		if (at) return {
			sent: 0,
			summary: `nudges ring on ${at.device.name}: ${at.why}`
		};
		const s = settingsOf(p.settings ?? {}), folder = folderOf(p), name = String(p.settings?.device || d.name || "server");
		const { out: all } = await gather(s, folder, c, { mark: NTFY });
		const out = handOff(all, devices, c);
		const messages = messagesOf(out.planned, out.writes, p.settings?.ntfy_text === true);
		const written = quietWrites(out.writes), problems = [];
		let sent = 0, unbuttoned = false;
		for (const m of messages) {
			const actions = [];
			let click;
			for (const b of m.buttons) try {
				const signed = await atlas.post("/api/plugins/plan/hooks/sign", {
					hook: "press",
					data: {
						notice_id: m.noticeId,
						action: b.action
					},
					ttl_secs: BUTTON_TTL
				});
				const base = baseOf(p.settings?.server_url, signed.origin);
				if (!base) {
					unbuttoned = true;
					break;
				}
				actions.push({
					label: b.label,
					url: `${base}${signed.path}`
				});
				click ??= `${base}${signed.path.slice(0, Math.max(0, signed.path.indexOf("/api/")))}/`;
			} catch (e) {
				problems.push(`no buttons: ${e instanceof Error ? e.message : e}`);
				break;
			}
			const why = await send({
				title: m.title,
				text: m.text,
				actions: actions.length === m.buttons.length ? actions : [],
				click
			});
			if (why) {
				problems.push(why);
				continue;
			}
			sent += 1;
			written.push(...m.writes);
		}
		if (written.length) await record(written, folder, name, c);
		const notes = [unbuttoned ? "no address for the buttons: set the server's address in Settings → Plan" : "", ...new Set(problems)].filter(Boolean);
		return {
			sent,
			summary: `${sent} sent through ntfy (no device runs Atlas)${notes.length ? `; ${notes.join("; ")}` : ""}`
		};
	}
	/** `on = "hook"`: a button of a nudge sent through ntfy, pressed on the phone (its token's data: the nudge and the
	*  action) — answered as the notification's own Done or Snooze. */
	async function press(p) {
		const data = p.data ?? {};
		const action = String(data.action ?? "");
		if (action !== "done" && !action.startsWith("snooze:")) return {};
		return pressed({
			...p,
			notice_id: data.notice_id,
			action
		});
	}
	/** A task row's "No nudge until tomorrow" (its right-click): the task at `path`/`line` snoozed until tomorrow's first
	*  moment (Settings' digest time, after quiet hours) — the notification's own Snooze path, so the ledger says the
	*  same. `{ until }`: when it may nudge again; `{}` when no open task is there. */
	async function snoozeTask(p) {
		const c = clockOf(p);
		const s = settingsOf(p.settings ?? {});
		const open = (await tasks("all")).find((t) => !t.done && t.path === String(p.path ?? "") && t.line === Number(p.line));
		if (!open) return {};
		const key = keyOf({
			path: open.path,
			title: open.title,
			block: open.block
		});
		const until = stamp(instant(addDays(wall(c.now, c).day, 1), Math.max(s.digestAt, s.quietTo), c), c).replace(" ", "T");
		await pressed({
			...p,
			notice_id: `plan:${key}`,
			action: `snooze:${until}`
		});
		return { until };
	}
	/** For Settings: the budget as measured, the plan's decisions and the ledger's last lines. Writes nothing. */
	async function explain(p) {
		const c = clockOf(p);
		const out = await planNow(p, c, false);
		const recent = (await ledgers(folderOf(p), c)).slice(0, 20).map((e) => e.line ?? renderLine(e, c));
		const used = out.activeAt === null ? null : rfc3339(out.activeAt, c);
		const at = out.at && {
			name: out.at.device.name,
			here: out.at.device.here,
			why: out.at.why
		};
		const handed = out.handed.map((h) => ({
			name: h.device.name,
			why: h.why
		}));
		return {
			device: out.device,
			plans: out.plans,
			local: out.local,
			rings: out.rings,
			at,
			used,
			handed,
			budget: out.budget,
			quiet: out.quiet,
			decisions: out.decisions,
			habits: out.habits,
			habitMin: 10,
			recent
		};
	}
	atlas.methods({
		nudges,
		pressed,
		explain,
		fallback,
		press,
		capture,
		snoozeTask
	});
	exports.capture = capture;
	exports.explain = explain;
	exports.fallback = fallback;
	exports.forgetUsed = forgetUsed;
	exports.nudges = nudges;
	exports.press = press;
	exports.pressed = pressed;
	exports.snoozeTask = snoozeTask;
	return exports;
})({});
