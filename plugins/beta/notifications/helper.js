// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/notifications/helper/helper.ts
	const STATE = `.atlas/cache/${atlas.id}.json`;
	/** Where the Python helper kept a topic's last id (one file per topic), read once so an upgrade files nothing twice. */
	const OLD_SINCE = (topic) => `.atlas/cache/plugins/${atlas.id}/since-${topic.replace(/[^\w.-]/g, "_")}`;
	const MARK = {
		5: "🔴",
		4: "🟠"
	};
	/** UTF-8 text → base64, without btoa or TextEncoder (QuickJS has neither). */
	function base64(s) {
		const bytes = unescape(encodeURIComponent(s)), abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		let out = "";
		for (let i = 0; i < bytes.length; i += 3) {
			const n = bytes.charCodeAt(i) << 16 | (bytes.charCodeAt(i + 1) || 0) << 8 | (bytes.charCodeAt(i + 2) || 0);
			out += abc[n >> 18] + abc[n >> 12 & 63] + (i + 1 < bytes.length ? abc[n >> 6 & 63] : "=") + (i + 2 < bytes.length ? abc[n & 63] : "=");
		}
		return out;
	}
	const str = (v) => String(v ?? "").trim();
	/** ntfy's sign-in as a request header: a user and password (Basic), else an access token (Bearer), else none. */
	function auth(p) {
		const s = p.settings ?? {}, sec = p.secrets ?? {};
		const user = str(s.user), token = sec.token ?? "";
		if (user) return { Authorization: `Basic ${base64(`${user}:${sec.password ?? ""}`)}` };
		return token ? { Authorization: `Bearer ${token}` } : {};
	}
	/** The messages of `topic` since the last one kept (ntfy keeps them for hours), oldest first. */
	async function poll(net, vault, server, topic, headers) {
		const since = await vault.since(topic) || "12h";
		return (await net.get(`${server.replace(/\/+$/, "")}/${encodeURIComponent(topic)}/json?poll=1&since=${encodeURIComponent(since)}`, headers)).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((m) => m.event === "message");
	}
	/** The message's first tag (the server's Apprise tag), else the topic: a name fit for a file. */
	function sourceOf(m, topic) {
		return ((m.tags ?? []).find((t) => typeof t === "string" && !!t.trim()) ?? topic).replace(/[\\/:*?"<>|]+/g, " ").trim() || topic;
	}
	const two = (n) => String(n).padStart(2, "0");
	/** Seconds since 1970 → "2026-10-25 01:00", in the machine's own time. */
	const stamp = (secs) => {
		const d = /* @__PURE__ */ new Date(secs * 1e3);
		return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
	};
	/** One message as a line of its source's note; a long body folded into a quote under it. */
	function lineOf(m) {
		const mark = MARK[Number(m.priority ?? 3)] ?? "";
		const title = str(m.title), body = str(m.message);
		const cut = body.indexOf("\n"), first = cut < 0 ? body : body.slice(0, cut), rest = cut < 0 ? "" : body.slice(cut + 1).trim();
		let head = `- ${stamp(Number(m.time ?? 0))} · ${mark ? `${mark} ` : ""}${title ? `**${title}** — ${first}` : first}`;
		if (m.click) head += ` · [open](${m.click})`;
		head += ` <!-- n=${m.id ?? ""} -->`;
		return head + (rest ? rest.split("\n").map((l) => `\n  > ${l}`).join("") : "");
	}
	/** `muted: true`, or a date not yet passed (`today` as YYYY-MM-DD). */
	function muted(props, today) {
		const v = str(props.muted);
		if (v.toLowerCase() === "true") return true;
		return /^\d{4}-\d{2}-\d{2}/.test(v) && v.slice(0, 10) >= today;
	}
	/** `lines` (newest first) put at the top of the source's note, made when missing; its `unread` grows. → its properties. */
	async function fileIn(vault, path, source, origin, lines) {
		const text = await vault.read(path) ?? `---\ntype: notifications\nsource: ${source}\nfrom: ${origin}\nmuted: false\nunread: 0\n---\n# ${source[0].toUpperCase()}${source.slice(1)}\n\n`;
		const end = text.startsWith("---\n") ? text.indexOf("\n---\n") : -1;
		let head = end < 0 ? "" : text.slice(0, end), body = end < 0 ? text : text.slice(end + 5);
		const props = {};
		for (const l of head.split("\n").slice(1)) {
			const k = l.slice(0, l.indexOf(":")).trim();
			if (l.includes(":") && k) props[k] = l.slice(l.indexOf(":") + 1).trim();
		}
		const unread = (Number(props.unread) || 0) + lines.length;
		head = /^unread:/m.test(head) ? head.replace(/^unread:.*$/m, `unread: ${unread}`) : head + `\nunread: ${unread}`;
		const top = /^\s*#[^\n]*\n\n?/.exec(body)?.[0] ?? "";
		body = top + lines.join("\n") + "\n" + body.slice(top.length);
		await vault.write(path, head ? `${head}\n---\n${body}` : body);
		return props;
	}
	async function syncWith(net, vault, p) {
		const s = p.settings ?? {};
		const server = str(s.server) || "https://ntfy.sh", folder = (str(s.folder) || "notifications").replace(/^\/+|\/+$/g, "");
		const headers = auth(p), inbox = str(s.inbox);
		const topics = String(s.topics ?? "").split(",").map((t) => t.trim()).filter(Boolean);
		let fresh = 0, captured = 0;
		const loud = [], problems = [];
		for (const topic of topics) {
			let msgs;
			try {
				msgs = await poll(net, vault, server, topic, headers);
			} catch (e) {
				problems.push(`${topic}: ${e.message}`);
				continue;
			}
			const by = /* @__PURE__ */ new Map();
			for (const m of msgs) by.set(sourceOf(m, topic), [...by.get(sourceOf(m, topic)) ?? [], m]);
			for (const [source, ms] of by) {
				const path = `${folder}/${source}.md`;
				const props = await fileIn(vault, path, source, `ntfy: ${topic}`, ms.map(lineOf).reverse());
				fresh += ms.length;
				if (!muted(props, vault.today())) loud.push(...ms.map((m) => ({
					source,
					path,
					title: m.title || source,
					text: (m.message ?? "").slice(0, 200)
				})));
			}
			if (msgs.length) await vault.keep(topic, msgs[msgs.length - 1].id ?? "");
		}
		if (inbox) try {
			const msgs = await poll(net, vault, server, inbox, headers);
			for (const m of msgs) if (str(m.message)) {
				await vault.capture(m.message);
				captured++;
			}
			if (msgs.length) await vault.keep(inbox, msgs[msgs.length - 1].id ?? "");
		} catch (e) {
			problems.push(`${inbox}: ${e.message}`);
		}
		const summary = `${fresh} new` + (captured ? `, ${captured} captured` : "") + (problems.length ? `; ${problems.join("; ")}` : "");
		return {
			new: fresh,
			loud: loud.slice(-20),
			captured,
			problems,
			summary
		};
	}
	async function sendWith(net, p) {
		const s = p.settings ?? {};
		const text = String(p.text ?? ""), title = String(p.title || "Atlas");
		if (!text.trim()) throw new Error("nothing to send");
		const apprise = str(s.apprise);
		if (apprise) {
			await net.post(apprise, JSON.stringify({
				title,
				body: text
			}), { "Content-Type": "application/json" });
			return {
				sent: true,
				through: "apprise"
			};
		}
		const topic = str(s.phone_topic);
		if (!topic) throw new Error("set the Apprise address or your phone's topic first: Settings → Notifications");
		await net.post(`${(str(s.server) || "https://ntfy.sh").replace(/\/+$/, "")}/${encodeURIComponent(topic)}?${atlas.qs({ title })}`, text, auth(p));
		return {
			sent: true,
			through: "ntfy"
		};
	}
	const net = {
		get: async (url, headers) => await atlas.fetch(url, {
			headers,
			timeout: 30,
			missing: []
		}) ?? "",
		post: (url, body, headers) => atlas.fetch(url, {
			method: "POST",
			body,
			headers,
			timeout: 30,
			missing: []
		})
	};
	async function readOrNull(path) {
		try {
			return await atlas.read(path);
		} catch (e) {
			if (e.status === 404) return null;
			throw e;
		}
	}
	let kept = null;
	const vault = {
		read: readOrNull,
		write: (path, text) => atlas.write(path, text),
		capture: (text) => atlas.capture(text),
		async since(topic) {
			kept ??= JSON.parse(await readOrNull(STATE) ?? "{}").since ?? {};
			return kept[topic] ?? str(await readOrNull(OLD_SINCE(topic)));
		},
		async keep(topic, id) {
			(kept ??= {})[topic] = id;
			try {
				await atlas.write(STATE, JSON.stringify({ since: kept }));
			} catch (e) {
				console.warn(`notifications: cannot keep the last id of ${topic}: ${e.message}`);
			}
		},
		today: () => {
			const d = /* @__PURE__ */ new Date();
			return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
		}
	};
	/** `fn` run after every call before it has ended: two syncs at once (the schedule and a page's "Check now") would poll
	*  from the same kept id and file the same messages twice. */
	function oneAtATime(fn) {
		let last = Promise.resolve();
		return (a) => {
			const run = last.then(() => fn(a), () => fn(a));
			last = run.catch(() => void 0);
			return run;
		};
	}
	atlas.methods({
		sync: oneAtATime(async (p) => {
			const r = await syncWith(net, vault, p);
			if (r.new) atlas.event("synced", {
				new: r.new,
				loud: r.loud
			});
			return r;
		}),
		send: (p) => sendWith(net, p)
	});
	//#endregion
	exports.auth = auth;
	exports.lineOf = lineOf;
	exports.muted = muted;
	exports.oneAtATime = oneAtATime;
	exports.sendWith = sendWith;
	exports.sourceOf = sourceOf;
	exports.syncWith = syncWith;
	return exports;
})({});
