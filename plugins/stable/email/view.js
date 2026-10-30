import { $ as e, A as t, B as n, C as r, D as i, E as a, F as o, G as s, H as c, I as l, J as u, K as d, L as f, M as p, N as m, O as h, P as g, Q as _, R as v, S as y, T as b, U as x, V as S, W as C, X as w, Y as T, Z as E, _ as D, at as O, b as k, c as A, d as j, dt as M, et as N, f as P, ft as F, g as I, h as L, ht as ee, i as R, it as z, j as B, k as V, l as H, lt as te, m as U, n as W, nt as G, o as ne, ot as K, p as re, pt as q, q as J, r as ie, rt as Y, s as ae, st as X, t as oe, tt as Z, u as se, ut as ce, v as le, w as ue, x as Q, y as de, z as fe } from "./ui-lib/Rules.js";
//#region plugins/stable/email/ui/src/Sidebar.svelte
var pe = C("<span>New message</span>"), $ = C("<span class=\"name svelte-t2e5ba\"> </span>"), me = C("<span> </span>"), he = C("<button><!> <!> <!></button>"), ge = C("<span></span>"), _e = C("<span class=\"spin svelte-t2e5ba\" title=\"Checking for mail…\"></span>"), ve = C("<span class=\"faint svelte-t2e5ba\">offline</span>"), ye = C("<!> <span class=\"acct svelte-t2e5ba\"> </span> <!> <!>", 1), be = C("<button class=\"link svelte-t2e5ba\">Sign in…</button>"), xe = C("<div class=\"err svelte-t2e5ba\" role=\"alert\"><span class=\"svelte-t2e5ba\"> </span> <!> <button class=\"link svelte-t2e5ba\">Settings…</button></div>"), Se = C("<button class=\"twist svelte-t2e5ba\"><!></button>"), Ce = C("<div class=\"frow svelte-t2e5ba\"><button><!> <!> <!></button> <!></div>"), we = C("<button><!><span class=\"name svelte-t2e5ba\"> </span></button>"), Te = C("<button class=\"row faint svelte-t2e5ba\"><!><span class=\"name svelte-t2e5ba\"> </span></button> <!>", 1), Ee = C("<button class=\"row faint add svelte-t2e5ba\"><!><span class=\"name svelte-t2e5ba\">New folder…</span></button>"), De = C("<!> <!> <!>", 1), Oe = C("<div class=\"group svelte-t2e5ba\"><button class=\"head svelte-t2e5ba\"><!></button> <!> <!></div>"), ke = C("<div class=\"empty svelte-t2e5ba\"><p class=\"svelte-t2e5ba\">No mail account yet.</p> <button class=\"atlas-btn\">Add an account…</button></div>"), Ae = C("<nav aria-label=\"Mail folders\"><button class=\"compose svelte-t2e5ba\" title=\"New message (c)\"><!><!></button> <div class=\"group svelte-t2e5ba\"></div> <!></nav>"), je = {
	hash: "svelte-t2e5ba",
	code: ".side.svelte-t2e5ba {display:flex;flex-direction:column;gap:10px;padding:10px 8px 16px;overflow-y:auto;height:100%;box-sizing:border-box;font-size:0.95em;}.compose.svelte-t2e5ba {all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 14px;border-radius:var(--radius);background:var(--accent);color:var(--accent-fg);font-weight:600;box-shadow:var(--shadow-sm);}.compose.svelte-t2e5ba:hover {filter:brightness(1.06);}.compose.svelte-t2e5ba:focus-visible {outline:2px solid var(--accent-strong);outline-offset:2px;}.rail.svelte-t2e5ba .compose:where(.svelte-t2e5ba) {justify-content:center;padding:9px;}.group.svelte-t2e5ba {display:flex;flex-direction:column;gap:1px;}.row.svelte-t2e5ba {all:unset;box-sizing:border-box;display:flex;align-items:center;gap:9px;cursor:pointer;padding:5px 8px 5px calc(8px + var(--depth, 0) * 14px);border-radius:var(--radius-sm);color:var(--text-muted);min-height:28px;flex:1;min-width:0;}.row.svelte-t2e5ba:hover {background:var(--bg-hover);color:var(--text);}.row.on.svelte-t2e5ba {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.row.over.svelte-t2e5ba {outline:2px dashed var(--accent);background:var(--accent-soft);}.row.svelte-t2e5ba:focus-visible, .head.svelte-t2e5ba:focus-visible, .twist.svelte-t2e5ba:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.rail.svelte-t2e5ba .row:where(.svelte-t2e5ba) {justify-content:center;padding:6px;}.frow.svelte-t2e5ba {display:flex;align-items:center;}.twist.svelte-t2e5ba {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-faint);}.twist.svelte-t2e5ba:hover {background:var(--bg-hover);color:var(--text);}.name.svelte-t2e5ba {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.n.svelte-t2e5ba {font-size:0.85em;color:var(--text-faint);font-variant-numeric:tabular-nums;}.n.strong.svelte-t2e5ba {color:var(--text);font-weight:600;}.rail.svelte-t2e5ba .n:where(.svelte-t2e5ba) {display:none;}.head.svelte-t2e5ba {all:unset;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 8px 4px;color:var(--text-faint);font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;min-width:0;}.head.svelte-t2e5ba:hover {color:var(--text-muted);}.rail.svelte-t2e5ba .head:where(.svelte-t2e5ba) {justify-content:center;padding:8px 0 4px;}.acct.svelte-t2e5ba {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:none;letter-spacing:0;font-size:1.15em;}.faint.svelte-t2e5ba {color:var(--text-faint);font-weight:400;}.add.svelte-t2e5ba {font-size:0.9em;}.dot.svelte-t2e5ba {width:8px;height:8px;border-radius:50%;background:var(--text-faint);}.dot.busy.svelte-t2e5ba {background:var(--accent);}.dot.bad.svelte-t2e5ba {background:var(--red);}.spin.svelte-t2e5ba {width:9px;height:9px;border-radius:50%;border:2px solid var(--accent);border-right-color:transparent; animation: svelte-t2e5ba-spin 0.8s linear infinite;}\n  @keyframes svelte-t2e5ba-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-t2e5ba { animation: none;} }.err.svelte-t2e5ba {margin:2px 6px 6px;padding:8px 10px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--red) 12%, transparent);color:var(--text);font-size:0.88em;display:flex;flex-wrap:wrap;gap:6px 10px;}.err.svelte-t2e5ba span:where(.svelte-t2e5ba) {flex-basis:100%;overflow-wrap:anywhere;}.link.svelte-t2e5ba {all:unset;cursor:pointer;color:var(--accent);}.empty.svelte-t2e5ba {padding:14px 8px;color:var(--text-muted);display:grid;gap:8px;justify-items:start;}.empty.svelte-t2e5ba p:where(.svelte-t2e5ba) {margin:0;}"
};
function Me(e, t) {
	M(t, !0), g(e, je);
	let i = r(t, "rail", 3, !1), a = [
		[
			"inbox",
			"Inbox",
			"inbox"
		],
		[
			"unimportant",
			"Not important",
			"down"
		],
		[
			"starred",
			"Starred",
			"star"
		],
		[
			"snoozed",
			"Snoozed",
			"clock"
		],
		[
			"drafts",
			"Drafts",
			"draft"
		],
		[
			"sent",
			"Sent",
			"send"
		],
		[
			"scheduled",
			"Scheduled",
			"clock"
		],
		[
			"all",
			"All mail",
			"all"
		]
	], o = {
		inbox: "inbox",
		sent: "send",
		drafts: "draft",
		archive: "archive",
		junk: "spam",
		trash: "trash",
		snoozed: "clock",
		unimportant: "down",
		all: "all"
	}, s = {
		inbox: 0,
		unimportant: 1,
		snoozed: 2,
		drafts: 3,
		sent: 4,
		archive: 5,
		junk: 6,
		trash: 7,
		all: 8
	}, d = X(() => t.mail.accounts.filter((e) => !e.error).length > 1), f = K(z(y())), _ = K(null);
	function y() {
		try {
			return JSON.parse(localStorage.getItem("atlas-email-folded") ?? "{}");
		} catch {
			return {};
		}
	}
	function b(e) {
		O(f, {
			...T(f),
			[e]: !T(f)[e]
		}, !0);
		try {
			localStorage.setItem("atlas-email-folded", JSON.stringify(T(f)));
		} catch {}
	}
	function S(e) {
		let n = t.mail.folders.filter((t) => t.account === e), r = n.filter((e) => e.role === "other" || e.role === "view"), i = n.filter((e) => e.role !== "other" && e.role !== "view"), a = i.filter((e) => e.role && s[e.role] !== void 0).sort((e, t) => s[e.role] - s[t.role]), o = i.filter((e) => !a.includes(e)).sort((e, t) => e.label.localeCompare(t.label)), c = a.map((e) => ({
			f: e,
			depth: 0,
			children: 0
		})), l = (e) => e.label.split(e.delimiter ?? "/");
		for (let t of o) {
			let n = l(t).length - 1, r = o.filter((e) => e !== t && e.label.startsWith(t.label + (t.delimiter ?? "/"))).length;
			o.some((n) => n !== t && t.label.startsWith(n.label + (n.delimiter ?? "/")) && T(f)[`${e}:${n.path}`]) || c.push({
				f: t,
				depth: n,
				children: r
			});
		}
		return {
			main: c,
			other: r
		};
	}
	let C = (e) => e.label.split(e.delimiter ?? "/").at(-1) ?? e.label;
	function w(e) {
		t.mail.go(e), t.onpicked?.();
	}
	let D = (e, n = null) => t.mail.view.name === e && t.mail.view.account === n, k = (e) => t.mail.view.name === "folder" && t.mail.view.account === e.account && t.mail.view.folder === e.path, A = (e) => [
		"inbox",
		"snoozed",
		"drafts",
		"scheduled",
		"unimportant"
	].includes(e) ? t.mail.counts[e] : void 0;
	function j(e, n) {
		e.preventDefault(), O(_, null);
		let r = JSON.parse(e.dataTransfer?.getData("application/x-atlas-mail") || "[]"), i = t.mail.rows.filter((e) => r.includes(e.id) && e.account === n.account);
		i.length ? t.mail.moveTo(n.path, n.label, i) : r.length && t.mail.toast("Mail moves within its own account", "error");
	}
	var P = Ae();
	let I;
	var L = N(P), R = N(L);
	Q(R, {
		name: "pen",
		size: 17
	});
	var B = Y(R), V = (e) => {
		var t = pe();
		c(e, t);
	};
	v(B, (e) => {
		i() || e(V);
	}), q(L);
	var H = Y(L, 2);
	l(H, 21, () => a, ([e, t, n]) => e, (e, t) => {
		var r = X(() => ee(T(t), 3));
		let a = () => T(r)[0], o = () => T(r)[1], s = () => T(r)[2], l = X(() => A(a()));
		var u = x(), f = Z(u), p = (e) => {
			var t = he();
			let r;
			var u = N(t);
			Q(u, { get name() {
				return s();
			} });
			var f = Y(u, 2), p = (e) => {
				var t = $(), r = G(t, !0);
				E(() => n(r, T(d) && a() === "inbox" ? "All inboxes" : o())), c(e, t);
			};
			v(f, (e) => {
				i() || e(p);
			});
			var g = Y(f, 2), _ = (e) => {
				var t = me();
				let r;
				var i = G(t, !0);
				E(() => {
					r = m(t, 1, "n svelte-t2e5ba", null, r, { strong: a() === "inbox" }), n(i, a() === "inbox" ? T(l).unread : T(l).total);
				}), c(e, t);
			};
			v(g, (e) => {
				T(l) && (a() === "inbox" ? T(l).unread : T(l).total) && e(_);
			}), q(t), E((e) => {
				r = m(t, 1, "row svelte-t2e5ba", null, r, { on: e }), h(t, "title", o());
			}, [() => D(a())]), J("click", t, () => w({
				name: a(),
				account: null,
				folder: null,
				label: T(d) && a() === "inbox" ? "All inboxes" : o()
			})), c(e, t);
		};
		v(f, (e) => {
			(a() !== "scheduled" && a() !== "unimportant" || (T(l)?.total ?? 0) > 0) && e(p);
		}), c(e, u);
	}), q(H);
	var te = Y(H, 2);
	l(te, 17, () => t.mail.accounts, (e) => e.name, (e, r) => {
		let a = X(() => `acct:${T(r).name}`), s = X(() => S(T(r).name));
		var d = Oe(), g = N(d), y = N(g), D = (e) => {
			var t = ge();
			let n;
			E(() => n = m(t, 1, "dot svelte-t2e5ba", null, n, {
				busy: T(r).syncing,
				bad: T(r).error || T(r).status?.state === "error"
			})), c(e, t);
		}, A = (e) => {
			var t = ye(), i = Z(t);
			{
				let e = X(() => T(f)[T(a)] ? "right" : "down");
				Q(i, {
					get name() {
						return T(e);
					},
					size: 12
				});
			}
			var o = Y(i, 2), s = G(o, !0), l = Y(o, 2), u = (e) => {
				var t = _e();
				c(e, t);
			};
			v(l, (e) => {
				(T(r).syncing || T(r).status?.state === "syncing") && e(u);
			});
			var d = Y(l, 2), p = (e) => {
				var t = ve();
				E(() => h(t, "title", T(r).status.error)), c(e, t);
			};
			v(d, (e) => {
				T(r).status?.state === "offline" && e(p);
			}), E(() => n(s, T(r).name)), c(e, t);
		};
		v(y, (e) => {
			i() ? e(D) : e(A, -1);
		}), q(g);
		var M = Y(g, 2), P = (e) => {
			var i = xe(), a = N(i), o = G(a, !0), s = Y(a, 2), l = (e) => {
				var t = be();
				J("click", t, () => window.dispatchEvent(new CustomEvent("atlas-email:signin", { detail: T(r).name }))), c(e, t);
			};
			v(s, (e) => {
				T(r).outlook && e(l);
			});
			var u = Y(s, 2);
			q(i), E(() => n(o, T(r).error ?? T(r).status?.error)), J("click", u, () => t.mail.atlas.plugin.openSettings()), c(e, i);
		};
		v(M, (e) => {
			(T(r).error || T(r).status?.state === "error") && e(P);
		});
		var I = Y(M, 2), L = (e) => {
			var t = De(), d = Z(t);
			l(d, 17, () => T(s).main, ({ f: e, depth: t, children: n }) => e.path, (e, t) => {
				let a = () => T(t).f, s = () => T(t).depth, l = () => T(t).children;
				var d = Ce();
				let g;
				var y = N(d);
				let x;
				var S = N(y);
				{
					let e = X(() => o[a().role ?? ""] ?? "folder");
					Q(S, { get name() {
						return T(e);
					} });
				}
				var D = Y(S, 2), A = (e) => {
					var t = $(), r = G(t, !0);
					E((e) => n(r, e), [() => C(a())]), c(e, t);
				};
				v(D, (e) => {
					i() || e(A);
				});
				var M = Y(D, 2), P = (e) => {
					var t = me();
					let r;
					var i = G(t, !0);
					E(() => {
						r = m(t, 1, "n svelte-t2e5ba", null, r, { strong: a().role === "inbox" }), n(i, a().unread);
					}), c(e, t);
				};
				v(M, (e) => {
					a().unread && a().role !== "sent" && a().role !== "trash" && a().role !== "junk" && a().role !== "drafts" && e(P);
				}), q(y);
				var F = Y(y, 2), I = (e) => {
					var t = Se(), n = N(t);
					{
						let e = X(() => T(f)[`${T(r).name}:${a().path}`] ? "right" : "down");
						Q(n, {
							get name() {
								return T(e);
							},
							size: 12
						});
					}
					q(t), E(() => h(t, "aria-label", T(f)[`${T(r).name}:${a().path}`] ? "Show the folders in it" : "Hide the folders in it")), J("click", t, () => b(`${T(r).name}:${a().path}`)), c(e, t);
				};
				v(F, (e) => {
					l() && !i() && e(I);
				}), q(d), E((e) => {
					g = p(d, "", g, { "--depth": i() ? 0 : s() }), x = m(y, 1, "row svelte-t2e5ba", null, x, {
						on: e,
						over: T(_) === `${T(r).name}:${a().path}`
					}), h(y, "title", a().label);
				}, [() => k(a())]), J("click", y, () => w({
					name: "folder",
					account: T(r).name,
					folder: a().path,
					label: a().label
				})), u("dragover", y, (e) => {
					e.preventDefault(), O(_, `${T(r).name}:${a().path}`);
				}), u("dragleave", y, () => O(_, null)), u("drop", y, (e) => j(e, a())), c(e, d);
			});
			var g = Y(d, 2), y = (e) => {
				var t = Te(), i = Z(t), o = N(i);
				{
					let e = X(() => T(f)[`${T(a)}:other`] ? "down" : "right");
					Q(o, {
						get name() {
							return T(e);
						},
						size: 12
					});
				}
				var u = Y(o), d = G(u);
				q(i);
				var h = Y(i, 2), g = (e) => {
					var t = x(), i = Z(t);
					l(i, 17, () => T(s).other, (e) => e.path, (e, t) => {
						var i = we();
						let a;
						p(i, "", {}, { "--depth": 1 });
						var o = N(i);
						Q(o, { name: "folder" });
						var s = Y(o), l = G(s, !0);
						q(i), E((e) => {
							a = m(i, 1, "row svelte-t2e5ba", null, a, { on: e }), n(l, T(t).label);
						}, [() => k(T(t))]), J("click", i, () => w({
							name: "folder",
							account: T(r).name,
							folder: T(t).path,
							label: T(t).label
						})), c(e, i);
					}), c(e, t);
				};
				v(h, (e) => {
					T(f)[`${T(a)}:other`] && e(g);
				}), E(() => n(d, `More (${T(s).other.length ?? ""})`)), J("click", i, () => b(`${T(a)}:other`)), c(e, t);
			};
			v(g, (e) => {
				T(s).other.length && !i() && e(y);
			});
			var S = Y(g, 2), D = (e) => {
				var t = Ee(), n = N(t);
				Q(n, {
					name: "plus",
					size: 14
				}), F(), q(t), J("click", t, () => window.dispatchEvent(new CustomEvent("atlas-email:new-folder", { detail: T(r).name }))), c(e, t);
			};
			v(S, (e) => {
				i() || e(D);
			}), c(e, t);
		};
		v(I, (e) => {
			!T(f)[T(a)] && !T(r).error && e(L);
		}), q(d), E(() => {
			h(g, "aria-expanded", !T(f)[T(a)]), h(g, "title", T(r).user ?? T(r).name);
		}), J("click", g, () => b(T(a))), c(e, d);
	}, (e) => {
		var n = x(), r = Z(n), a = (e) => {
			var n = ke(), r = Y(N(n), 2);
			q(n), J("click", r, () => t.mail.atlas.plugin.openSettings()), c(e, n);
		};
		v(r, (e) => {
			i() || e(a);
		}), c(e, n);
	}), q(P), E(() => I = m(P, 1, "side svelte-t2e5ba", null, I, { rail: i() })), J("click", L, () => t.mail.compose()), c(e, P), ce();
}
d(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/MessageList.svelte
var Ne = C("<div class=\"sect svelte-g4my5v\">Everything else</div>"), Pe = C("<div class=\"sect svelte-g4my5v\"><!> Important<span class=\"faint svelte-g4my5v\"> </span></div> <!>", 1), Fe = C("<div> </div>"), Ie = C("<span></span>"), Le = C("<span class=\"udot svelte-g4my5v\" aria-label=\"unread\"></span>"), Re = C("<span class=\"count svelte-g4my5v\"> </span>"), ze = C("<span class=\"draftmark svelte-g4my5v\">· Draft</span>"), Be = C("<span class=\"subject svelte-g4my5v\"> <span class=\"snip svelte-g4my5v\"> </span></span>"), Ve = C("<span class=\"star svelte-g4my5v\"><!></span>"), He = C("<span class=\"chip acct svelte-g4my5v\"> </span>"), Ue = C("<span class=\"chip svelte-g4my5v\"> </span>"), We = C("<div class=\"line2 svelte-g4my5v\"><span class=\"subject svelte-g4my5v\"> </span></div> <div class=\"line3 svelte-g4my5v\"><!> <!> <span class=\"snip svelte-g4my5v\"> </span></div>", 1), Ge = C("<div role=\"option\" tabindex=\"-1\" draggable=\"true\"><!> <button class=\"avatar svelte-g4my5v\"><!></button> <div class=\"main svelte-g4my5v\"><div class=\"line1 svelte-g4my5v\"><!> <span class=\"who svelte-g4my5v\"> <!><!></span> <!> <span class=\"marks svelte-g4my5v\"><!> <!> <!></span> <time class=\"date svelte-g4my5v\"> </time></div> <!></div> <div class=\"hover svelte-g4my5v\" role=\"toolbar\" aria-label=\"Actions\"><button title=\"Archive (e)\" class=\"svelte-g4my5v\"><!></button> <button title=\"Delete (#)\" class=\"svelte-g4my5v\"><!></button> <button class=\"svelte-g4my5v\"><!></button> <button title=\"Snooze (h for when)\" class=\"svelte-g4my5v\"><!></button></div></div>"), Ke = C("<div class=\"ghost svelte-g4my5v\"><span class=\"svelte-g4my5v\"></span><span class=\"svelte-g4my5v\"></span></div>"), qe = C("<div role=\"listbox\" aria-label=\"Conversations\" aria-multiselectable=\"true\" tabindex=\"-1\"><div class=\"pad svelte-g4my5v\"><!> <!></div> <!></div>"), Je = {
	hash: "svelte-g4my5v",
	code: ".list.svelte-g4my5v {position:relative;overflow-y:auto;height:100%;outline:none;contain:strict;}.pad.svelte-g4my5v {position:relative;}.row.svelte-g4my5v {position:absolute;left:0;right:0;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:0 12px 0 10px;border-bottom:1px solid var(--border);cursor:default;user-select:none;transition:transform 120ms var(--ease);}.row.svelte-g4my5v:hover {background:var(--bg-hover);}.row.cursor.svelte-g4my5v {box-shadow:inset 3px 0 0 var(--accent);}.row.open.svelte-g4my5v {background:var(--accent-soft);}.row.checked.svelte-g4my5v {background:var(--accent-sel);}.avatar.svelte-g4my5v {all:unset;flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);cursor:pointer;}.compact.svelte-g4my5v .avatar:where(.svelte-g4my5v) {width:20px;height:20px;background:transparent;color:var(--text-faint);}.checked.svelte-g4my5v .avatar:where(.svelte-g4my5v) {background:var(--accent);color:var(--accent-fg);}.avatar.svelte-g4my5v:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.dotonly.svelte-g4my5v {width:8px;height:8px;border-radius:50%;}.dotonly.on.svelte-g4my5v {background:var(--accent);}.main.svelte-g4my5v {flex:1;min-width:0;display:grid;gap:2px;}.line1.svelte-g4my5v, .line2.svelte-g4my5v, .line3.svelte-g4my5v {display:flex;align-items:center;gap:6px;min-width:0;}.udot.svelte-g4my5v {width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none;}.who.svelte-g4my5v {flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.compact.svelte-g4my5v .who:where(.svelte-g4my5v) {flex:0 0 28%;}.unread.svelte-g4my5v .who:where(.svelte-g4my5v), .unread.svelte-g4my5v .subject:where(.svelte-g4my5v) {font-weight:650;color:var(--heading);}.count.svelte-g4my5v {margin-left:5px;color:var(--text-faint);font-size:0.86em;font-weight:400;}.draftmark.svelte-g4my5v {color:var(--red);font-weight:400;}.marks.svelte-g4my5v {margin-left:auto;display:flex;gap:4px;align-items:center;color:var(--text-faint);}.star.svelte-g4my5v {color:var(--yellow);}.date.svelte-g4my5v {flex:none;color:var(--text-muted);font-size:0.85em;font-variant-numeric:tabular-nums;}.unread.svelte-g4my5v .date:where(.svelte-g4my5v) {color:var(--text);font-weight:600;}.subject.svelte-g4my5v {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.compact.svelte-g4my5v .subject:where(.svelte-g4my5v) {flex:1;}.snip.svelte-g4my5v {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.92em;}.chip.svelte-g4my5v {flex:none;font-size:0.78em;padding:0 6px;border-radius:999px;background:hsl(var(--h, 220) 60% 50% / 0.16);color:var(--text);line-height:1.6;}.chip.acct.svelte-g4my5v {background:var(--bg-active);color:var(--text-muted);}\n  /* over the date's line (hidden on hover), not over the subject; centred in a one-line compact row */.hover.svelte-g4my5v {position:absolute;right:8px;top:5px;display:none;gap:0;background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 1px;box-shadow:var(--shadow-sm);}.row.svelte-g4my5v:hover .hover:where(.svelte-g4my5v) {display:flex;}.compact.svelte-g4my5v .hover:where(.svelte-g4my5v) {top:50%;transform:translateY(-50%);}.row.svelte-g4my5v:hover .date:where(.svelte-g4my5v), .row.svelte-g4my5v:hover .marks:where(.svelte-g4my5v) {visibility:hidden;}.hover.svelte-g4my5v button:where(.svelte-g4my5v) {all:unset;cursor:pointer;padding:2px 5px;border-radius:var(--radius-sm);color:var(--text-muted);min-width:22px;min-height:20px;display:grid;place-items:center;}.hover.svelte-g4my5v button:where(.svelte-g4my5v):hover {background:var(--bg-hover);color:var(--text);}.swipe.svelte-g4my5v {position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-start;padding:0 20px;color:#fff;background:var(--green);font-weight:600;z-index:-1;}.swipe.left.svelte-g4my5v {justify-content:flex-end;background:var(--accent);}.ghost.svelte-g4my5v {position:absolute;left:0;right:0;padding:14px 16px 0 54px;display:grid;gap:8px;border-bottom:1px solid var(--border);}.ghost.svelte-g4my5v span:where(.svelte-g4my5v) {height:10px;border-radius:4px;background:var(--bg-hover);width:40%;}.ghost.svelte-g4my5v span:where(.svelte-g4my5v) + span:where(.svelte-g4my5v) {width:75%;}\n  @media (prefers-reduced-motion: reduce) {.row.svelte-g4my5v {transition:none;} }.sect.svelte-g4my5v {position:absolute;left:0;right:0;height:28px;display:flex;align-items:center;gap:6px;padding:0 14px;font-size:0.78em;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted);background:var(--bg-secondary, var(--bg));border-bottom:1px solid var(--border);}.sect.svelte-g4my5v .faint:where(.svelte-g4my5v) {font-weight:400;margin-left:2px;}\n  @media (hover: none) {.hover.svelte-g4my5v {display:none !important;} }"
};
function Ye(e, t) {
	M(t, !0), g(e, Je);
	let i = r(t, "mail", 7), a = r(t, "compact", 3, !1), o = X(() => a() ? 34 : 76), d = X(() => {
		if (!i().pinning) return 0;
		let e = i().rows.findIndex((e) => !e.flagged);
		return e < 0 ? i().rows.length : e;
	}), y = (e) => e * T(o) + (T(d) ? e < T(d) ? 28 : 56 : 0), S = K(void 0), C = K(0), D = K(600), k = X(() => Math.max(0, Math.floor(T(C) / T(o)) - 8)), A = X(() => Math.min(i().rows.length, Math.ceil((T(C) + T(D)) / T(o)) + 8)), j = X(() => i().rows.slice(T(k), T(A)));
	_(() => {
		i().cursor;
		let e = w(() => i().index());
		if (!T(S) || e < 0) return;
		let t = w(() => y(e));
		t < T(S).scrollTop ? T(S).scrollTop = Math.max(0, t - (e === 0 || e === T(d) ? 28 : 0)) : t + T(o) > T(S).scrollTop + T(S).clientHeight && (T(S).scrollTop = t + T(o) - T(S).clientHeight);
	});
	let F;
	_(() => {
		let e = T(j);
		return clearTimeout(F), F = setTimeout(() => w(() => i().fillSnippets(e)), 250), () => clearTimeout(F);
	});
	function I() {
		T(S) && (O(C, T(S).scrollTop, !0), T(S).scrollTop + T(S).clientHeight > T(S).scrollHeight - T(o) * 10 && i().more());
	}
	function ee(e, n) {
		if (e.shiftKey) {
			i().extend(n.id);
			return;
		}
		if (e.ctrlKey || e.metaKey) {
			i().toggle(n.thread), i().cursor = n.id;
			return;
		}
		t.onopen(n);
	}
	function R(e, t) {
		let n = i().checked.includes(t.thread) ? i().rows.filter((e) => i().checked.includes(e.thread)).map((e) => e.id) : [t.id];
		e.dataTransfer?.setData("application/x-atlas-mail", JSON.stringify(n)), e.dataTransfer?.setData("text/plain", `${n.length} conversation${n.length === 1 ? "" : "s"}`), e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
	}
	let z = K(null);
	function B(e, t) {
		e.pointerType === "touch" && O(z, {
			id: t.id,
			x0: e.clientX,
			dx: 0
		}, !0);
	}
	function V(e) {
		T(z) && (T(z).dx = e.clientX - T(z).x0);
	}
	function H(e, t) {
		if (!T(z) || T(z).id !== t.id) return;
		let n = e.currentTarget.clientWidth, r = T(z).dx;
		O(z, null), r < -n / 3 ? i().archive([t]) : r > n / 3 && i().toggleRead([t]);
	}
	let te = (e) => P(e);
	var U = qe();
	let W;
	var ne = N(U);
	let ie;
	var ae = N(ne), oe = (e) => {
		var t = Pe(), r = Z(t);
		p(r, "", {}, { top: "0" });
		var a = N(r);
		Q(a, {
			name: "star",
			size: 13,
			filled: !0
		});
		var s = Y(a, 2), l = G(s, !0);
		q(r);
		var u = Y(r, 2), f = (e) => {
			var t = Ne();
			let n;
			E(() => n = p(t, "", n, { top: `${T(d) * T(o) + 28}px` })), c(e, t);
		};
		v(u, (e) => {
			T(d) < i().rows.length && e(f);
		}), E(() => n(l, T(d))), c(e, t);
	};
	v(ae, (e) => {
		T(d) && e(oe);
	});
	var se = Y(ae, 2);
	l(se, 19, () => T(j), (e) => e.thread, (e, t, r) => {
		let d = X(() => T(k) + T(r)), f = X(() => i().checked.includes(T(t).thread)), g = X(() => T(z)?.id === T(t).id ? T(z).dx : 0);
		var _ = Ge();
		let b, x;
		var S = N(_), C = (e) => {
			var r = Fe();
			let i;
			var a = G(r, !0);
			E(() => {
				i = m(r, 1, "swipe svelte-g4my5v", null, i, { left: T(g) < 0 }), n(a, T(g) < 0 ? "Archive" : T(t).unread ? "Read" : "Unread");
			}), c(e, r);
		};
		v(S, (e) => {
			T(g) && e(C);
		});
		var w = Y(S, 2);
		let D;
		var A = N(w), j = (e) => {
			Q(e, {
				name: "check",
				size: 15
			});
		}, M = (e) => {
			var n = Ie();
			let r;
			E(() => r = m(n, 1, "dotonly svelte-g4my5v", null, r, { on: T(t).unread > 0 })), c(e, n);
		}, F = (e) => {
			var r = s();
			E((e) => n(r, e), [() => re(T(t).from.at(-1))]), c(e, r);
		};
		v(A, (e) => {
			T(f) ? e(j) : a() ? e(M, 1) : e(F, -1);
		}), q(w);
		var I = Y(w, 2), U = N(I), W = N(U), ne = (e) => {
			var t = Le();
			c(e, t);
		};
		v(W, (e) => {
			T(t).unread > 0 && !a() && e(ne);
		});
		var K = Y(W, 2), ie = N(K, !0), ae = Y(ie), oe = (e) => {
			var r = Re(), i = G(r, !0);
			E(() => n(i, T(t).count)), c(e, r);
		};
		v(ae, (e) => {
			T(t).count > 1 && e(oe);
		});
		var se = Y(ae), ce = (e) => {
			var t = ze();
			c(e, t);
		};
		v(se, (e) => {
			T(t).draft && T(t).count > 1 && e(ce);
		}), q(K);
		var ue = Y(K, 2), fe = (e) => {
			var r = Be(), i = N(r, !0), a = Y(i), o = G(a);
			q(r), E(() => {
				n(i, T(t).subject || "(no subject)"), n(o, `— ${T(t).snippet ?? ""}`);
			}), c(e, r);
		};
		v(ue, (e) => {
			a() && e(fe);
		});
		var pe = Y(ue, 2), $ = N(pe), me = (e) => {
			Q(e, {
				name: "attach",
				size: 13,
				title: "has files"
			});
		};
		v($, (e) => {
			T(t).has_attachments && e(me);
		});
		var he = Y($, 2), ge = (e) => {
			Q(e, {
				name: "note",
				size: 13,
				title: "saved as a note"
			});
		};
		v(he, (e) => {
			T(t).saved && e(ge);
		});
		var _e = Y(he, 2), ve = (e) => {
			var t = Ve(), n = N(t);
			Q(n, {
				name: "star",
				size: 14,
				filled: !0,
				title: "starred"
			}), q(t), c(e, t);
		};
		v(_e, (e) => {
			T(t).flagged && e(ve);
		}), q(pe);
		var ye = Y(pe, 2), be = G(ye, !0);
		q(U);
		var xe = Y(U, 2), Se = (e) => {
			var r = We(), a = Z(r), o = N(a), s = G(o, !0);
			q(a);
			var u = Y(a, 2), d = N(u), f = (e) => {
				var r = He(), i = G(r, !0);
				E(() => n(i, T(t).account)), c(e, r);
			};
			v(d, (e) => {
				i().view.name !== "folder" && i().view.account === null && i().accounts.length > 1 && e(f);
			});
			var m = Y(d, 2);
			l(m, 16, () => T(t).labels.slice(0, 3), (e) => e, (e, t) => {
				var r = Ue();
				let i;
				var a = G(r, !0);
				E((e, t) => {
					i = p(r, "", i, { "--h": e }), n(a, t);
				}, [() => te(t), () => t.replace(/^\$/, "")]), c(e, r);
			});
			var h = Y(m, 2), g = G(h, !0);
			q(u), E(() => {
				n(s, T(t).subject || "(no subject)"), n(g, T(t).snippet_missing ? "…" : T(t).snippet);
			}), c(e, r);
		};
		v(xe, (e) => {
			a() || e(Se);
		}), q(I);
		var Ce = Y(I, 2), we = N(Ce), Te = N(we);
		Q(Te, { name: "archive" }), q(we);
		var Ee = Y(we, 2), De = N(Ee);
		Q(De, { name: "trash" }), q(Ee);
		var Oe = Y(Ee, 2), ke = N(Oe);
		{
			let e = X(() => T(t).unread ? "read" : "unread");
			Q(ke, { get name() {
				return T(e);
			} });
		}
		q(Oe);
		var Ae = Y(Oe, 2), je = N(Ae);
		Q(je, { name: "clock" }), q(Ae), q(Ce), q(_), E((e, r, a, s, c) => {
			b = m(_, 1, "row svelte-g4my5v", null, b, {
				unread: T(t).unread > 0,
				cursor: i().cursor === T(t).id,
				open: i().openId === T(t).id,
				checked: T(f)
			}), h(_, "aria-selected", T(f) || i().openId === T(t).id), x = p(_, "", x, {
				top: e,
				height: `${T(o) ?? ""}px`,
				transform: T(g) ? `translateX(${T(g)}px)` : void 0
			}), h(w, "aria-label", T(f) ? "Uncheck" : "Check"), h(w, "aria-pressed", T(f)), D = p(w, "", D, { "--h": r }), n(ie, a), h(ye, "datetime", s), n(be, c), h(Oe, "title", T(t).unread ? "Mark read" : "Mark unread");
		}, [
			() => `${y(T(d)) ?? ""}px`,
			() => P(T(t).from.at(-1)?.addr ?? T(t).subject),
			() => T(t).draft && T(t).count === 1 ? "Draft" : L(T(t).from, i().own),
			() => (/* @__PURE__ */ new Date(T(t).date * 1e3)).toISOString(),
			() => de(T(t).date)
		]), J("click", _, (e) => ee(e, T(t))), J("keydown", _, () => {}), u("dragstart", _, (e) => R(e, T(t))), J("pointerdown", _, (e) => B(e, T(t))), J("pointermove", _, V), J("pointerup", _, (e) => H(e, T(t))), u("pointercancel", _, () => O(z, null)), J("click", w, (e) => {
			e.stopPropagation(), i().toggle(T(t).thread);
		}), J("click", we, (e) => {
			e.stopPropagation(), i().archive([T(t)]);
		}), J("click", Ee, (e) => {
			e.stopPropagation(), i().trash([T(t)]);
		}), J("click", Oe, (e) => {
			e.stopPropagation(), i().toggleRead([T(t)]);
		}), J("click", Ae, (e) => {
			e.stopPropagation(), i().snooze(le()[0].at, [T(t)]);
		}), c(e, _);
	}), q(ne);
	var fe = Y(ne, 2), pe = (e) => {
		var t = x(), n = Z(t);
		l(n, 16, () => Array(8), f, (e, t, n) => {
			var r = Ke();
			let i;
			E(() => i = p(r, "", i, {
				top: `${n * T(o)}px`,
				height: `${T(o) ?? ""}px`
			})), c(e, r);
		}), c(e, t);
	};
	v(fe, (e) => {
		i().loading && !i().rows.length && e(pe);
	}), q(U), ue(U, (e) => O(S, e), () => T(S)), E(() => {
		W = m(U, 1, "list svelte-g4my5v", null, W, { compact: a() }), ie = p(ne, "", ie, { height: `${i().rows.length * T(o) + (T(d) ? 56 : 0)}px` });
	}), u("scroll", U, I), b(U, "clientHeight", (e) => O(D, e)), c(e, U), ce();
}
d([
	"click",
	"keydown",
	"pointerdown",
	"pointermove",
	"pointerup"
]);
//#endregion
//#region plugins/stable/email/ui/src/InviteCard.svelte
var Xe = C("<span class=\"faint svelte-720w0p\"> </span>"), Ze = C("<span> </span>"), Qe = C("<span class=\"ok svelte-720w0p\"><!> In your calendar</span>"), $e = C("<span class=\"clash svelte-720w0p\"> </span>"), et = C("<span class=\"state svelte-720w0p\"><!> <!></span>"), tt = C("<span class=\"given svelte-720w0p\"> </span>"), nt = C("<div class=\"answer svelte-720w0p\" role=\"group\" aria-label=\"Answer the invitation\"><!> <button>Accept</button> <button>Maybe</button> <button>Decline</button></div>"), rt = C("<div><!> <div class=\"what svelte-720w0p\"><b class=\"svelte-720w0p\"> </b> <span> <!></span> <!> <!> <!> <!></div> <!></div>"), it = {
	hash: "svelte-720w0p",
	code: ".invite.svelte-720w0p {display:flex;flex-wrap:wrap;gap:10px 12px;align-items:flex-start;padding:10px 12px;margin-bottom:10px;border-radius:var(--radius);border:1px solid var(--border-strong);background:var(--accent-soft);}.invite.cancelled.svelte-720w0p b:where(.svelte-720w0p) {text-decoration:line-through;}.what.svelte-720w0p {display:grid;gap:2px;flex:1 1 220px;min-width:0;}.faint.svelte-720w0p {color:var(--text-muted);}.state.svelte-720w0p {display:flex;flex-wrap:wrap;gap:4px 10px;font-size:0.9em;margin-top:2px;}.ok.svelte-720w0p {display:inline-flex;align-items:center;gap:4px;color:var(--success, var(--text));}.clash.svelte-720w0p {color:var(--warning, var(--text-muted));}.answer.svelte-720w0p {display:flex;align-items:center;gap:6px;flex-wrap:wrap;}.given.svelte-720w0p {color:var(--text-muted);font-size:0.9em;margin-right:4px;}.answer.svelte-720w0p button:where(.svelte-720w0p) {padding:4px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);cursor:pointer;}.answer.svelte-720w0p button:where(.svelte-720w0p):hover:not(:disabled) {border-color:var(--accent);}.answer.svelte-720w0p button.on:where(.svelte-720w0p) {background:var(--accent);color:var(--accent-fg);border-color:transparent;}.answer.svelte-720w0p button:where(.svelte-720w0p):disabled {opacity:0.6;cursor:default;}"
};
function at(e, t) {
	M(t, !0), g(e, it);
	let r = K(null), i = K(null), a = K(!1), o = X(() => T(i) ?? t.invite.answer);
	_(() => {
		let e = t.id;
		O(r, null), t.mail.call("invite_status", { id: e }).then((n) => {
			e === t.id && O(r, n, !0);
		}).catch(() => {});
	});
	let s = (e) => /* @__PURE__ */ new Date(`${e}T00:00:00`), u = (e) => e.length > 10 ? new Date(e) : s(e), d = (e) => e.toLocaleDateString(void 0, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: e.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() ? void 0 : "numeric"
	}), f = (e, t) => e.toLocaleTimeString(void 0, {
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit",
		timeZone: t
	}), p = (e, t) => e.toDateString() === t.toDateString(), h = X(() => {
		if (!t.invite.start) return "";
		let e = u(t.invite.start), n = t.invite.end ? u(t.invite.end) : null;
		if (t.invite.all_day) {
			let t = n ? /* @__PURE__ */ new Date(n.getTime() - 864e5) : e;
			return p(e, t) ? `${d(e)} · all day` : `${d(e)} – ${d(t)}`;
		}
		let r = n ? p(e, n) ? `${f(e)} – ${f(n)}` : `${f(e)} – ${d(n)} ${f(n)}` : f(e);
		return `${d(e)} · ${r}`;
	}), y = X(() => {
		if (!t.invite.zone || t.invite.all_day || !t.invite.start) return "";
		try {
			let e = t.invite.zone.split("/").pop().replace(/_/g, " ");
			return `${f(u(t.invite.start), t.invite.zone)} in ${e}`;
		} catch {
			return "";
		}
	}), b = X(() => {
		let e = /FREQ=(\w+)/.exec(t.invite.repeats)?.[1];
		return e ? {
			DAILY: "every day",
			WEEKLY: "every week",
			MONTHLY: "every month",
			YEARLY: "every year"
		}[e] ?? "repeats" : "";
	}), x = (e) => ({
		ACCEPTED: "You accepted",
		TENTATIVE: "You said maybe",
		DECLINED: "You declined"
	})[e] ?? "", S = X(() => t.invite.method === "REQUEST" && !t.invite.mine);
	async function C(e) {
		O(a, !0);
		try {
			let n = await t.mail.call("answer_invite", {
				id: t.id,
				partstat: e
			});
			O(i, e, !0);
			let a = n.calendar ? " · in your calendar" : n.calendar_error && e !== "DECLINED" ? " · not filed in a calendar" : "";
			t.mail.toast(`${x(e)}${a}`, "success"), n.calendar && O(r, {
				...T(r) ?? { conflicts: [] },
				in_calendar: !0
			}, !0);
		} catch (e) {
			t.mail.toast(`Could not answer: ${e.message}`, "error");
		} finally {
			O(a, !1);
		}
	}
	var w = rt();
	let D;
	var k = N(w);
	Q(k, {
		name: "calendar",
		size: 22
	});
	var A = Y(k, 2), j = N(A), P = G(j), I = Y(j, 2), L = N(I, !0), ee = Y(L), R = (e) => {
		var t = Xe(), r = G(t);
		E(() => n(r, `· ${T(b) ?? ""}`)), c(e, t);
	};
	v(ee, (e) => {
		T(b) && e(R);
	}), q(I);
	var z = Y(I, 2), B = (e) => {
		var t = Xe(), r = G(t, !0);
		E(() => n(r, T(y))), c(e, t);
	};
	v(z, (e) => {
		T(y) && e(B);
	});
	var V = Y(z, 2), H = (e) => {
		var r = Ze(), i = G(r, !0);
		E(() => n(i, t.invite.location)), c(e, r);
	};
	v(V, (e) => {
		t.invite.location && e(H);
	});
	var te = Y(V, 2), U = (e) => {
		var r = Xe(), i = G(r);
		E(() => n(i, `from ${t.invite.organizer ?? ""}${t.invite.attendees.length > 1 ? ` · ${t.invite.attendees.length} invited` : ""}`)), c(e, r);
	};
	v(te, (e) => {
		t.invite.organizer && e(U);
	});
	var W = Y(te, 2), ne = (e) => {
		var t = et(), i = N(t), a = (e) => {
			var t = Qe(), n = N(t);
			Q(n, {
				name: "check",
				size: 13
			}), F(), q(t), c(e, t);
		};
		v(i, (e) => {
			T(r).in_calendar && e(a);
		});
		var o = Y(i, 2);
		l(o, 17, () => T(r).conflicts.slice(0, 2), (e) => e.summary + e.start, (e, t) => {
			var r = $e(), i = G(r);
			E((e) => n(i, `Overlaps ${T(t).summary ?? ""} (${e ?? ""})`), [() => f(u(T(t).start))]), c(e, r);
		}), q(t), c(e, t);
	};
	v(W, (e) => {
		T(r) && e(ne);
	}), q(A);
	var re = Y(A, 2), ie = (e) => {
		var t = nt(), r = N(t), i = (e) => {
			var t = tt(), r = G(t, !0);
			E((e) => n(r, e), [() => x(T(o))]), c(e, t);
		};
		v(r, (e) => {
			T(o) && e(i);
		});
		var s = Y(r, 2);
		let l;
		var u = Y(s, 2);
		let d;
		var f = Y(u, 2);
		let p;
		q(t), E(() => {
			s.disabled = T(a), l = m(s, 1, "svelte-720w0p", null, l, { on: T(o) === "ACCEPTED" }), u.disabled = T(a), d = m(u, 1, "svelte-720w0p", null, d, { on: T(o) === "TENTATIVE" }), f.disabled = T(a), p = m(f, 1, "svelte-720w0p", null, p, { on: T(o) === "DECLINED" });
		}), J("click", s, () => C("ACCEPTED")), J("click", u, () => C("TENTATIVE")), J("click", f, () => C("DECLINED")), c(e, t);
	};
	v(re, (e) => {
		T(S) && e(ie);
	}), q(w), E(() => {
		D = m(w, 1, "invite svelte-720w0p", null, D, { cancelled: t.invite.method === "CANCEL" }), n(P, `${t.invite.method === "CANCEL" ? "Cancelled: " : ""}${(t.invite.summary || "An invitation") ?? ""}`), n(L, T(h));
	}), c(e, w), ce();
}
d(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/AddressField.svelte
var ot = C("<span><span class=\"svelte-1y6wl7m\"> </span> <button class=\"svelte-1y6wl7m\">×</button></span>"), st = C("<span class=\"svelte-1y6wl7m\"> </span>"), ct = C("<li role=\"option\"><button><b> </b><!></button></li>"), lt = C("<ul class=\"offers svelte-1y6wl7m\" role=\"listbox\"></ul>"), ut = C("<div class=\"field svelte-1y6wl7m\"><span class=\"label svelte-1y6wl7m\"> </span> <div class=\"box svelte-1y6wl7m\" role=\"presentation\"><!> <input autocomplete=\"off\" spellcheck=\"false\" class=\"svelte-1y6wl7m\"/></div> <!></div>"), dt = {
	hash: "svelte-1y6wl7m",
	code: ".field.svelte-1y6wl7m {position:relative;display:flex;align-items:flex-start;gap:8px;border-bottom:1px solid var(--border);padding:4px 0;}.label.svelte-1y6wl7m {flex:none;width:3.2em;color:var(--text-faint);padding-top:5px;font-size:0.9em;}.box.svelte-1y6wl7m {flex:1;display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:28px;cursor:text;min-width:0;}.chip.svelte-1y6wl7m {display:inline-flex;align-items:center;gap:2px;padding:1px 2px 1px 8px;border-radius:999px;background:hsl(var(--h) 55% 50% / 0.16);max-width:100%;}.chip.svelte-1y6wl7m span:where(.svelte-1y6wl7m) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.chip.bad.svelte-1y6wl7m {background:color-mix(in srgb, var(--red) 18%, transparent);outline:1px solid var(--red);}.chip.svelte-1y6wl7m button:where(.svelte-1y6wl7m) {all:unset;cursor:pointer;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;color:var(--text-muted);}.chip.svelte-1y6wl7m button:where(.svelte-1y6wl7m):hover {background:var(--bg-active);color:var(--text);}input.svelte-1y6wl7m {all:unset;flex:1;min-width:8em;padding:4px 0;}.offers.svelte-1y6wl7m {position:absolute;z-index:10;left:3.6em;right:0;top:100%;margin:2px 0 0;padding:4px;list-style:none;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));}.offers.svelte-1y6wl7m button:where(.svelte-1y6wl7m) {all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:baseline;padding:6px 10px;border-radius:var(--radius-sm);cursor:pointer;}.offers.svelte-1y6wl7m button.on:where(.svelte-1y6wl7m), .offers.svelte-1y6wl7m button:where(.svelte-1y6wl7m):hover {background:var(--accent-soft);}.offers.svelte-1y6wl7m span:where(.svelte-1y6wl7m) {color:var(--text-muted);font-size:0.9em;overflow:hidden;text-overflow:ellipsis;}"
};
function ft(e, t) {
	M(t, !0), g(e, dt);
	let o = r(t, "value", 15), s = r(t, "autofocus", 3, !1), d = K(""), f = K(z([])), y = K(0), b = K(void 0), x;
	function S(e) {
		let t = [], n = "", r = !1, i = !1;
		for (let a of e) a === "\"" && (r = !r), a === "<" && (i = !0), a === ">" && (i = !1), (a === "," || a === ";") && !r && !i ? (n.trim() && t.push(n.trim()), n = "") : n += a;
		return n.trim() && t.push(n.trim()), t;
	}
	let C = X(() => S(o())), w = (e) => (e.match(/<([^>]+)>/)?.[1] ?? e).trim(), D = (e) => e.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || w(e), k = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w(e));
	function A(e) {
		let t = e.trim().replace(/,$/, "");
		t && (o([...T(C).filter((e) => w(e).toLowerCase() !== w(t).toLowerCase()), t].join(", ")), O(d, ""), O(f, [], !0));
	}
	function j(e) {
		o(T(C).filter((t, n) => n !== e).join(", "));
	}
	function F() {
		if (/[,;]/.test(T(d))) {
			for (let e of S(T(d))) A(e);
			return;
		}
		clearTimeout(x);
		let e = T(d).trim();
		if (!e) {
			O(f, [], !0);
			return;
		}
		x = setTimeout(async () => {
			try {
				let n = await H(t.atlas, "contacts", {
					q: e,
					limit: 7
				}, 10);
				T(d).trim() === e && (O(f, n.contacts.filter((e) => !T(C).some((t) => w(t).toLowerCase() === e.addr)), !0), O(y, 0));
			} catch {
				O(f, [], !0);
			}
		}, 90);
	}
	let I = (e) => e.name ? `${/[,"<>]/.test(e.name) ? `"${e.name.replace(/"/g, "")}"` : e.name} <${e.addr}>` : e.addr;
	function L(e) {
		T(f).length && (e.key === "ArrowDown" || e.key === "ArrowUp") ? (e.preventDefault(), O(y, (T(y) + (e.key === "ArrowDown" ? 1 : T(f).length - 1)) % T(f).length)) : e.key === "Enter" || e.key === "Tab" && T(d).trim() ? T(f).length ? (e.preventDefault(), A(I(T(f)[T(y)]))) : T(d).trim() && (e.preventDefault(), A(T(d))) : e.key === "Backspace" && !T(d) && T(C).length ? (e.preventDefault(), O(d, T(C).at(-1), !0), j(T(C).length - 1)) : e.key === "Escape" && T(f).length && (e.stopPropagation(), O(f, [], !0));
	}
	_(() => {
		s() && T(b)?.focus();
	});
	var ee = ut(), R = N(ee), B = G(R, !0), V = Y(R, 2), te = N(V);
	l(te, 19, () => T(C), (e, t) => e + t, (e, t, r) => {
		var i = ot();
		let a, o;
		var s = N(i), l = G(s, !0), u = Y(s, 2);
		q(i), E((e, r, s, c) => {
			a = m(i, 1, "chip svelte-1y6wl7m", null, a, { bad: e }), h(i, "title", T(t)), o = p(i, "", o, { "--h": r }), n(l, s), h(u, "aria-label", c);
		}, [
			() => !k(T(t)),
			() => P(w(T(t))),
			() => D(T(t)),
			() => `Remove ${w(T(t))}`
		]), J("click", u, (e) => {
			e.stopPropagation(), j(T(r));
		}), c(e, i);
	});
	var U = Y(te, 2);
	i(U), ue(U, (e) => O(b, e), () => T(b)), q(V);
	var W = Y(V, 2), ne = (e) => {
		var t = lt();
		l(t, 23, () => T(f), (e) => e.addr, (e, t, r) => {
			var i = ct(), a = N(i);
			let o;
			var s = N(a), l = G(s, !0), u = Y(s), d = (e) => {
				var r = st(), i = G(r, !0);
				E(() => n(i, T(t).addr)), c(e, r);
			};
			v(u, (e) => {
				T(t).name && e(d);
			}), q(a), q(i), E(() => {
				h(i, "aria-selected", T(r) === T(y)), o = m(a, 1, "svelte-1y6wl7m", null, o, { on: T(r) === T(y) }), n(l, T(t).name || T(t).addr);
			}), J("mousedown", a, (e) => {
				e.preventDefault(), A(I(T(t)));
			}), c(e, i);
		}), q(t), c(e, t);
	};
	v(W, (e) => {
		T(f).length && e(ne);
	}), q(ee), E(() => {
		n(B, t.label), h(U, "aria-label", t.label);
	}), J("click", V, () => T(b)?.focus()), J("input", U, F), J("keydown", U, L), u("blur", U, () => {
		T(d).trim() && A(T(d)), O(f, [], !0);
	}), a(U, () => T(d), (e) => O(d, e)), c(e, ee), ce();
}
d([
	"click",
	"input",
	"keydown",
	"mousedown"
]);
//#endregion
//#region plugins/stable/email/ui/src/Composer.svelte
var pt = C("<header class=\"bar svelte-zp5xms\"><b class=\"svelte-zp5xms\"> </b> <span class=\"grow svelte-zp5xms\"></span> <button class=\"tool svelte-zp5xms\"><!></button> <button class=\"tool svelte-zp5xms\" title=\"Close (kept in Drafts)\"><!></button></header>"), mt = C("<option> </option>"), ht = C("<div class=\"from svelte-zp5xms\"><span class=\"label svelte-zp5xms\">From</span> <select class=\"svelte-zp5xms\"></select></div>"), gt = C("<button class=\"link svelte-zp5xms\">Cc</button>"), _t = C("<button class=\"link svelte-zp5xms\">Bcc</button>"), vt = C("<input class=\"subject svelte-zp5xms\" placeholder=\"Subject\" aria-label=\"Subject\"/>"), yt = C("<div class=\"preview svelte-zp5xms\"></div>"), bt = C("<textarea aria-label=\"The message\" spellcheck=\"true\" class=\"svelte-zp5xms\"></textarea>"), xt = C("<span class=\"faint svelte-zp5xms\"> </span>"), St = C("<span class=\"faint svelte-zp5xms\">(forwarded)</span>"), Ct = C("<span class=\"file svelte-zp5xms\"><!><span class=\"svelte-zp5xms\"> </span><!><!><button class=\"svelte-zp5xms\">×</button></span>"), wt = C("<span class=\"warn svelte-zp5xms\"> </span>"), Tt = C("<div class=\"files svelte-zp5xms\"><!> <!></div>"), Et = C("<div class=\"error svelte-zp5xms\" role=\"alert\"> </div>"), Dt = C("<div class=\"drop svelte-zp5xms\">Drop to attach</div>"), Ot = C("<button class=\"svelte-zp5xms\"> <span class=\"faint svelte-zp5xms\"> </span></button>"), kt = C("<div class=\"later svelte-zp5xms\" role=\"dialog\" aria-label=\"Send later\"><!> <div class=\"custom svelte-zp5xms\"><input placeholder=\"tomorrow 9, mon 14:00, 3h…\" class=\"svelte-zp5xms\"/><button class=\"atlas-btn svelte-zp5xms\">Schedule</button></div></div>"), At = C("<button class=\"tool svelte-zp5xms\" title=\"Pop out\"><!></button>"), jt = C("<div role=\"form\"><!> <div class=\"fields svelte-zp5xms\"><!> <div class=\"torow svelte-zp5xms\"><div class=\"grow svelte-zp5xms\"><!></div> <!> <!></div> <!> <!> <!></div> <div class=\"tb svelte-zp5xms\" role=\"toolbar\" aria-label=\"Formatting\"><button title=\"Bold (Ctrl+B)\" class=\"svelte-zp5xms\"><b>B</b></button> <button title=\"Italic (Ctrl+I)\" class=\"svelte-zp5xms\"><i>I</i></button> <button title=\"Strikethrough\" class=\"svelte-zp5xms\"><s>S</s></button> <button title=\"Link (Ctrl+K)\" class=\"svelte-zp5xms\"><!></button> <button title=\"List\" class=\"svelte-zp5xms\">•</button> <button title=\"Numbered list\" class=\"svelte-zp5xms\">1.</button> <button title=\"Quote\" class=\"svelte-zp5xms\">”</button> <button title=\"Code\" class=\"svelte-zp5xms\"><code></code></button> <span class=\"grow svelte-zp5xms\"></span> <button title=\"How it will look\"> </button></div> <!> <!> <!> <!> <footer class=\"foot svelte-zp5xms\"><div class=\"send svelte-zp5xms\"><button class=\"atlas-btn primary svelte-zp5xms\" title=\"Send (Ctrl+Enter)\">Send</button> <button class=\"atlas-btn primary more svelte-zp5xms\" title=\"Send later…\"><!></button> <!></div> <button class=\"tool svelte-zp5xms\" title=\"Attach files\"><!></button> <button class=\"tool svelte-zp5xms\" title=\"Attach a file of the vault…\"><!></button> <input type=\"file\" multiple=\"\" hidden=\"\"/> <span class=\"status faint svelte-zp5xms\"> </span> <span class=\"grow svelte-zp5xms\"></span> <!> <button class=\"tool svelte-zp5xms\" title=\"Discard\"><!></button></footer></div>"), Mt = {
	hash: "svelte-zp5xms",
	code: ".composer.svelte-zp5xms {position:relative;display:flex;flex-direction:column;gap:6px;background:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius);padding:0 14px 10px;box-shadow:var(--shadow-sm);min-width:0;}.composer.inline.svelte-zp5xms {margin-left:38px;padding-top:6px;}.composer.over.svelte-zp5xms {outline:2px dashed var(--accent);}.bar.svelte-zp5xms {display:flex;align-items:center;gap:6px;margin:0 -14px;padding:8px 10px 8px 14px;background:var(--bg-alt);border-bottom:1px solid var(--border);border-radius:var(--radius) var(--radius) 0 0;}.bar.svelte-zp5xms b:where(.svelte-zp5xms) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.grow.svelte-zp5xms {flex:1;min-width:0;}.fields.svelte-zp5xms {display:grid;}.from.svelte-zp5xms {display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border);padding:4px 0;}.from.svelte-zp5xms select:where(.svelte-zp5xms) {flex:1;min-width:0;background:transparent;color:var(--text);border:0;padding:4px 0;font:inherit;}.label.svelte-zp5xms {flex:none;width:3.2em;color:var(--text-faint);font-size:0.9em;}.torow.svelte-zp5xms {display:flex;align-items:flex-start;gap:8px;}.torow.svelte-zp5xms .link:where(.svelte-zp5xms) {margin-top:9px;}.link.svelte-zp5xms {all:unset;cursor:pointer;color:var(--text-muted);font-size:0.9em;}.link.svelte-zp5xms:hover {color:var(--accent);}.subject.svelte-zp5xms {all:unset;padding:8px 0;border-bottom:1px solid var(--border);font-weight:600;}.tb.svelte-zp5xms {display:flex;gap:2px;align-items:center;padding-top:2px;}.tb.svelte-zp5xms button:where(.svelte-zp5xms) {all:unset;cursor:pointer;min-width:26px;height:26px;display:grid;place-items:center;border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.92em;padding:0 4px;}.tb.svelte-zp5xms button:where(.svelte-zp5xms):hover, .tb.svelte-zp5xms button.on:where(.svelte-zp5xms) {background:var(--bg-hover);color:var(--text);}textarea.svelte-zp5xms {all:unset;box-sizing:border-box;width:100%;min-height:120px;resize:none;white-space:pre-wrap;line-height:1.55;font-size:15px;font-family:var(--font-prose, var(--font-ui));overflow-y:auto;}.preview.svelte-zp5xms {min-height:120px;padding:4px 0;line-height:1.55;overflow-wrap:anywhere;}.preview.svelte-zp5xms blockquote {margin:0.4em 0;padding-left:0.9em;border-left:3px solid var(--border-strong);color:var(--text-muted);}.files.svelte-zp5xms {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.file.svelte-zp5xms {display:inline-flex;gap:6px;align-items:center;padding:3px 4px 3px 8px;border-radius:var(--radius-sm);background:var(--bg-alt);border:1px solid var(--border);font-size:0.9em;max-width:260px;}.file.svelte-zp5xms span:where(.svelte-zp5xms):not(.faint) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.file.svelte-zp5xms button:where(.svelte-zp5xms) {all:unset;cursor:pointer;width:18px;height:18px;display:grid;place-items:center;border-radius:50%;color:var(--text-muted);}.file.svelte-zp5xms button:where(.svelte-zp5xms):hover {background:var(--bg-hover);}.warn.svelte-zp5xms {color:var(--orange);font-size:0.86em;}.faint.svelte-zp5xms {color:var(--text-faint);}.error.svelte-zp5xms {color:var(--red);font-size:0.9em;}.drop.svelte-zp5xms {position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb, var(--accent) 12%, var(--bg));border-radius:var(--radius);font-weight:600;color:var(--accent-strong);pointer-events:none;}.foot.svelte-zp5xms {display:flex;align-items:center;gap:6px;padding-top:4px;}.send.svelte-zp5xms {position:relative;display:flex;}.send.svelte-zp5xms .atlas-btn.primary:where(.svelte-zp5xms) {background:var(--accent);color:var(--accent-fg);border-color:transparent;font-weight:600;}.send.svelte-zp5xms .atlas-btn:where(.svelte-zp5xms):first-child {border-radius:var(--radius-sm) 0 0 var(--radius-sm);padding-inline:18px;}.send.svelte-zp5xms .more:where(.svelte-zp5xms) {border-radius:0 var(--radius-sm) var(--radius-sm) 0;border-left:1px solid color-mix(in srgb, var(--accent-fg) 25%, transparent) !important;padding-inline:6px;display:grid;place-items:center;}.later.svelte-zp5xms {position:absolute;bottom:110%;left:0;z-index:10;width:280px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));padding:6px;display:grid;gap:2px;}.later.svelte-zp5xms > button:where(.svelte-zp5xms) {all:unset;cursor:pointer;display:flex;justify-content:space-between;padding:7px 10px;border-radius:var(--radius-sm);}.later.svelte-zp5xms > button:where(.svelte-zp5xms):hover {background:var(--bg-hover);}.custom.svelte-zp5xms {display:flex;gap:6px;padding:6px 4px 2px;border-top:1px solid var(--border);margin-top:4px;}.custom.svelte-zp5xms input:where(.svelte-zp5xms) {flex:1;min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 8px;font:inherit;}.tool.svelte-zp5xms {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;}.tool.svelte-zp5xms:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-zp5xms:focus-visible, .tb.svelte-zp5xms button:where(.svelte-zp5xms):focus-visible, .link.svelte-zp5xms:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.status.svelte-zp5xms {font-size:0.85em;}\n  @container (max-width: 560px) {.composer.inline.svelte-zp5xms {margin-left:0;} }"
};
function Nt(e, s) {
	M(s, !0), g(e, Mt);
	let d = r(s, "c", 7), f = r(s, "inline", 3, !1), p = r(s, "big", 15, !1), y = X(() => d().draft), b = K(!!T(y).cc), S = K(!!T(y).bcc), C = K(null), w = K(void 0), k = K(!1), j = K(""), P = K(!1), F = K(void 0), L, ee = X(() => s.mail.accounts.find((e) => e.name === T(y).account)), R = X(() => T(ee)?.identities?.filter(Boolean) ?? []), z = X(() => s.mail.accounts.filter((e) => !e.error));
	_(() => {
		T(y).to && T(w)?.focus();
	});
	function V() {
		d().dirty = !0, clearTimeout(L), L = setTimeout(H, 2e3);
	}
	async function H() {
		if (d().dirty && !d().sending && (T(y).body.trim() || T(y).subject.trim() || T(y).to.trim())) {
			d().saving = !0;
			try {
				let e = await s.mail.call("save_draft", { ...T(y) });
				T(y).draft = e.id, d().savedAt = Date.now(), d().dirty = !1, d().error = "";
			} catch (e) {
				d().error = `Not saved: ${e.message}`;
			} finally {
				d().saving = !1;
			}
		}
	}
	function W(e, t = e, n = "text") {
		if (!T(w)) return;
		let { selectionStart: r, selectionEnd: i, value: a } = T(w), o = a.slice(r, i) || n;
		T(y).body = a.slice(0, r) + e + o + t + a.slice(i), V(), requestAnimationFrame(() => {
			T(w).focus(), T(w).setSelectionRange(r + e.length, r + e.length + o.length);
		});
	}
	function ne(e) {
		if (!T(w)) return;
		let { selectionStart: t, selectionEnd: n, value: r } = T(w), i = r.lastIndexOf("\n", t - 1) + 1, a = r.slice(i, n).split("\n").map((t) => e + t).join("\n");
		T(y).body = r.slice(0, i) + a + r.slice(n), V();
	}
	async function re() {
		let e = await ae(s.mail.atlas, "Link to (address):", "https://");
		e && W("[", `](${e})`, "link text");
	}
	async function ie() {
		if (T(C) !== null) {
			O(C, null);
			return;
		}
		try {
			O(C, (await s.mail.call("preview", { body: T(y).body })).html, !0);
		} catch (e) {
			d().error = e.message;
		}
	}
	async function oe(e) {
		for (let t of Array.from(e)) {
			let e = await new Promise((e, n) => {
				let r = new FileReader();
				r.onload = () => e(String(r.result).replace(/^data:[^,]*,/, "")), r.onerror = () => n(r.error), r.readAsDataURL(t);
			});
			T(y).files = [...T(y).files, {
				name: t.name,
				mime: t.type,
				size: t.size,
				data: e
			}];
		}
		V();
	}
	function se() {
		s.mail.atlas.pick({
			placeholder: "A file of the vault to attach…",
			tag: "Attach",
			items: async () => {
				try {
					return (await (await fetch("/api/files")).json()).filter((e) => !e.startsWith(".atlas/")).slice(0, 5e3).map((e) => ({
						value: e,
						title: e.split("/").at(-1) ?? e,
						detail: e
					}));
				} catch {
					return [];
				}
			},
			typed: (e) => `Attach “${e}”`,
			onpick: (e) => {
				T(y).files = [...T(y).files, {
					name: e.split("/").at(-1) ?? e,
					path: e
				}], V();
			}
		});
	}
	function le(e) {
		e.preventDefault(), O(P, !1);
		let t = e.dataTransfer?.getData("text/x-atlas-path") || "";
		if (t) {
			T(y).files = [...T(y).files, {
				name: t.split("/").at(-1) ?? t,
				path: t
			}], V();
			return;
		}
		e.dataTransfer?.files.length && oe(e.dataTransfer.files);
	}
	let de = (e) => {
		T(y).files = T(y).files.filter((t) => t !== e), V();
	}, fe = X(() => T(y).files.reduce((e, t) => e + (t.size ?? 0), 0)), pe = /\b(attached|attachment|attaching|enclosed|ci-joint|pi[eè]ce jointe|adjunto|te adjunto|anexo|allegato|anhang|angeh[aä]ngt)\b/i;
	async function $() {
		if (!T(y).to.trim() && !T(y).cc.trim() && !T(y).bcc.trim()) return d().error = "Who is it for? Fill in To.", !1;
		if (!T(y).subject.trim() && !await A(s.mail.atlas, "Send it without a subject?", { ok: "Send" })) return !1;
		let e = T(y).body.split(/\n\s*>|\nOn .* wrote:/)[0];
		return !(pe.test(e) && !T(y).files.length && !T(y).forward && !await A(s.mail.atlas, "The text mentions an attachment, but nothing is attached. Send anyway?", { ok: "Send anyway" }));
	}
	async function me(e = null) {
		if (!await $()) return;
		clearTimeout(L), d().sending = !0;
		let t = {
			...T(y),
			send_at: e
		};
		if (s.mail.closeComposer(d().key), e) {
			try {
				await s.mail.call("send", t), s.mail.toast(`Will be sent ${(/* @__PURE__ */ new Date(e * 1e3)).toLocaleString(void 0, {
					weekday: "short",
					day: "numeric",
					month: "short",
					hour: "2-digit",
					hourCycle: "h23",
					minute: "2-digit"
				})}`, "success"), s.mail.later();
			} catch (e) {
				he(e);
			}
			return;
		}
		let n = Number(I(s.mail.atlas, "undo_send", 10)) * 1e3, r = !1, i = setTimeout(async () => {
			if (!r) try {
				let e = await s.mail.call("send", t, 300);
				e.refused?.length ? s.mail.toast(`Sent, but refused for ${e.refused.map((e) => e.address).join(", ")}`, "error") : s.mail.toast("Sent", "success"), s.mail.later();
			} catch (e) {
				he(e);
			}
		}, n);
		s.mail.toast("Sending…", "info", {
			until: Date.now() + n,
			undo: async () => {
				r = !0, clearTimeout(i), s.mail.compose({ ...t }, d().inline);
			}
		});
	}
	function he(e) {
		let t = s.mail.compose({ ...T(y) }, d().inline);
		t.error = `Not sent: ${e.message}`, s.mail.toast(`Not sent: ${e.message}`, "error");
	}
	function ge() {
		let e = U(T(j));
		if (!e || e * 1e3 < Date.now()) {
			d().error = "When? e.g. tomorrow 8, mon 14:00, 2026-11-02 09:00, 3h";
			return;
		}
		O(k, !1), me(e);
	}
	let _e = () => {
		let e = (e) => {
			let t = /* @__PURE__ */ new Date();
			return t.setDate(t.getDate() + e), t.setHours(8, 0, 0, 0), Math.floor(t.getTime() / 1e3);
		}, t = (8 - (/* @__PURE__ */ new Date()).getDay()) % 7 || 7;
		return [{
			label: "Tomorrow morning",
			at: e(1)
		}, {
			label: "Monday morning",
			at: e(t)
		}];
	};
	async function ve() {
		if ((!d().dirty && !T(y).draft || !T(y).body.trim() && !T(y).subject.trim() || await A(s.mail.atlas, "Discard this message?", {
			ok: "Discard",
			danger: !0
		})) && (clearTimeout(L), s.mail.closeComposer(d().key), T(y).draft)) try {
			await s.mail.call("discard_draft", { id: T(y).draft }), s.mail.later();
		} catch {}
	}
	function ye(e) {
		e.stopPropagation();
		let t = e.ctrlKey || e.metaKey;
		t && e.key === "Enter" ? (e.preventDefault(), me()) : t && e.key.toLowerCase() === "s" ? (e.preventDefault(), d().dirty = !0, H()) : t && e.key.toLowerCase() === "b" && e.target === T(w) ? (e.preventDefault(), W("**")) : t && e.key.toLowerCase() === "i" && e.target === T(w) ? (e.preventDefault(), W("*")) : t && e.key.toLowerCase() === "k" && e.target === T(w) ? (e.preventDefault(), re()) : t && e.shiftKey && e.key.toLowerCase() === "c" ? (e.preventDefault(), O(b, !0)) : t && e.shiftKey && e.key.toLowerCase() === "b" ? (e.preventDefault(), O(S, !0)) : e.key === "Escape" && !f() && (e.preventDefault(), H(), s.mail.closeComposer(d().key));
	}
	function be() {
		T(w) && (T(w).style.height = "auto", T(w).style.height = `${Math.min(Math.max(T(w).scrollHeight, f() ? 120 : 220), p() ? 2e3 : 520)}px`);
	}
	_(() => {
		T(y).body, be();
	});
	var xe = jt();
	let Se;
	var Ce = N(xe), we = (e) => {
		var t = pt(), r = N(t), i = G(r, !0), a = Y(r, 4), o = N(a);
		Q(o, {
			name: "layout",
			size: 15
		}), q(a);
		var l = Y(a, 2), u = N(l);
		Q(u, {
			name: "x",
			size: 15
		}), q(l), q(t), E(() => {
			n(i, T(y).subject || (T(y).reply_to ? "Reply" : T(y).forward ? "Forward" : "New message")), h(a, "title", p() ? "Smaller" : "Full size");
		}), J("click", a, () => p(!p())), J("click", l, () => {
			H(), s.mail.closeComposer(d().key);
		}), c(e, t);
	};
	v(Ce, (e) => {
		f() || e(we);
	});
	var Te = Y(Ce, 2), Ee = N(Te), De = (e) => {
		var r = ht(), i = Y(N(r), 2);
		l(i, 21, () => T(z), (e) => e.name, (e, t) => {
			var r = x(), i = Z(r);
			l(i, 16, () => T(t).identities?.length ? T(t).identities : [T(t).from ?? T(t).user ?? T(t).name], (e) => e, (e, r) => {
				var i = mt(), a = G(i), o = {};
				E(() => {
					n(a, `${r ?? ""}${T(z).length > 1 ? ` · ${T(t).name}` : ""}`), o !== (o = `${T(t).name}\u0000${r === T(t).from ? "" : r}`) && (i.value = i.__value = o);
				}), c(e, i);
			}), c(e, r);
		}), q(i);
		var a;
		t(i), q(r), E(() => {
			a !== (a = `${T(y).account}\u0000${T(y).from}`) && (i.value = i.__value = a, B(i, a));
		}), J("change", i, (e) => {
			let [t, n] = e.currentTarget.value.split("\0");
			T(y).account = t, T(y).from = n, V();
		}), c(e, r);
	};
	v(Ee, (e) => {
		(T(z).length > 1 || T(R).length > 1) && e(De);
	});
	var Oe = Y(Ee, 2), ke = N(Oe), Ae = N(ke);
	{
		let e = X(() => !T(y).to && !f());
		ft(Ae, {
			get atlas() {
				return s.mail.atlas;
			},
			label: "To",
			get autofocus() {
				return T(e);
			},
			get value() {
				return T(y).to;
			},
			set value(e) {
				T(y).to = e;
			}
		});
	}
	q(ke);
	var je = Y(ke, 2), Me = (e) => {
		var t = gt();
		J("click", t, () => O(b, !0)), c(e, t);
	};
	v(je, (e) => {
		T(b) || e(Me);
	});
	var Ne = Y(je, 2), Pe = (e) => {
		var t = _t();
		J("click", t, () => O(S, !0)), c(e, t);
	};
	v(Ne, (e) => {
		T(S) || e(Pe);
	}), q(Oe);
	var Fe = Y(Oe, 2), Ie = (e) => {
		ft(e, {
			get atlas() {
				return s.mail.atlas;
			},
			label: "Cc",
			get value() {
				return T(y).cc;
			},
			set value(e) {
				T(y).cc = e;
			}
		});
	};
	v(Fe, (e) => {
		T(b) && e(Ie);
	});
	var Le = Y(Fe, 2), Re = (e) => {
		ft(e, {
			get atlas() {
				return s.mail.atlas;
			},
			label: "Bcc",
			get value() {
				return T(y).bcc;
			},
			set value(e) {
				T(y).bcc = e;
			}
		});
	};
	v(Le, (e) => {
		T(S) && e(Re);
	});
	var ze = Y(Le, 2), Be = (e) => {
		var t = vt();
		i(t), J("input", t, V), a(t, () => T(y).subject, (e) => T(y).subject = e), c(e, t);
	};
	v(ze, (e) => {
		(!f() || !T(y).reply_to) && e(Be);
	}), q(Te);
	var Ve = Y(Te, 2), He = N(Ve), Ue = Y(He, 2), We = Y(Ue, 2), Ge = Y(We, 2), Ke = N(Ge);
	Q(Ke, {
		name: "open",
		size: 14
	}), q(Ge);
	var qe = Y(Ge, 2), Je = Y(qe, 2), Ye = Y(Je, 2), Xe = Y(Ye, 2), Ze = N(Xe);
	Ze.textContent = "<>", q(Xe);
	var Qe = Y(Xe, 4);
	let $e;
	var et = G(Qe, !0);
	q(Ve);
	var tt = Y(Ve, 2), nt = (e) => {
		var t = yt();
		o(t, () => T(C), !0), q(t), c(e, t);
	}, rt = (e) => {
		var t = bt();
		te(t), ue(t, (e) => O(w, e), () => T(w)), E(() => h(t, "placeholder", T(y).reply_to ? "Your reply…" : "Write… (Markdown: **bold**, *italic*, - lists, > quotes)")), J("input", t, V), a(t, () => T(y).body, (e) => T(y).body = e), c(e, t);
	};
	v(tt, (e) => {
		T(C) === null ? e(rt, -1) : e(nt);
	});
	var it = Y(tt, 2), at = (e) => {
		var t = Tt(), r = N(t);
		l(r, 17, () => T(y).files, (e) => e.name + (e.path ?? "") + (e.from?.join() ?? ""), (e, t) => {
			var r = Ct(), i = N(r);
			Q(i, {
				name: "attach",
				size: 13
			});
			var a = Y(i), o = G(a, !0), s = Y(a), l = (e) => {
				var r = xt(), i = G(r, !0);
				E((e) => n(i, e), [() => D(T(t).size)]), c(e, r);
			};
			v(s, (e) => {
				T(t).size && e(l);
			});
			var u = Y(s), d = (e) => {
				var t = St();
				c(e, t);
			};
			v(u, (e) => {
				T(t).from && e(d);
			});
			var f = Y(u);
			q(r), E(() => {
				n(o, T(t).name), h(f, "aria-label", `Remove ${T(t).name}`);
			}), J("click", f, () => de(T(t))), c(e, r);
		});
		var i = Y(r, 2), a = (e) => {
			var t = wt(), r = G(t);
			E((e) => n(r, `${e ?? ""}: most servers take about 25 MB`), [() => D(T(fe))]), c(e, t);
		};
		v(i, (e) => {
			T(fe) > 20971520 && e(a);
		}), q(t), c(e, t);
	};
	v(it, (e) => {
		T(y).files.length && e(at);
	});
	var ot = Y(it, 2), st = (e) => {
		var t = Et(), r = G(t, !0);
		E(() => n(r, d().error)), c(e, t);
	};
	v(ot, (e) => {
		d().error && e(st);
	});
	var ct = Y(ot, 2), lt = (e) => {
		var t = Dt();
		c(e, t);
	};
	v(ct, (e) => {
		T(P) && e(lt);
	});
	var ut = Y(ct, 2), dt = N(ut), Nt = N(dt), Pt = Y(Nt, 2), Ft = N(Pt);
	Q(Ft, {
		name: "down",
		size: 14
	}), q(Pt);
	var It = Y(Pt, 2), Lt = (e) => {
		var t = kt(), r = N(t);
		l(r, 17, _e, (e) => e.label, (e, t) => {
			var r = Ot(), i = N(r, !0), a = Y(i), o = G(a, !0);
			q(r), E((e) => {
				n(i, T(t).label), n(o, e);
			}, [() => (/* @__PURE__ */ new Date(T(t).at * 1e3)).toLocaleString(void 0, {
				weekday: "short",
				hour: "2-digit",
				hourCycle: "h23",
				minute: "2-digit"
			})]), J("click", r, () => {
				O(k, !1), me(T(t).at);
			}), c(e, r);
		});
		var o = Y(r, 2), s = N(o);
		i(s);
		var u = Y(s);
		q(o), q(t), J("keydown", s, (e) => {
			e.key === "Enter" && (e.preventDefault(), ge());
		}), a(s, () => T(j), (e) => O(j, e)), J("click", u, ge), c(e, t);
	};
	v(It, (e) => {
		T(k) && e(Lt);
	}), q(dt);
	var Rt = Y(dt, 2), zt = N(Rt);
	Q(zt, { name: "attach" }), q(Rt);
	var Bt = Y(Rt, 2), Vt = N(Bt);
	Q(Vt, { name: "note" }), q(Bt);
	var Ht = Y(Bt, 2);
	ue(Ht, (e) => O(F, e), () => T(F));
	var Ut = Y(Ht, 2), Wt = G(Ut, !0), Gt = Y(Ut, 4), Kt = (e) => {
		var t = At(), n = N(t);
		Q(n, {
			name: "open",
			size: 15
		}), q(t), J("click", t, () => {
			d().inline = !1;
		}), c(e, t);
	};
	v(Gt, (e) => {
		f() && e(Kt);
	});
	var qt = Y(Gt, 2), Jt = N(qt);
	Q(Jt, { name: "trash" }), q(qt), q(ut), q(xe), E((e) => {
		Se = m(xe, 1, "composer svelte-zp5xms", null, Se, {
			inline: f(),
			over: T(P)
		}), h(xe, "aria-label", T(y).reply_to ? "Reply" : T(y).forward ? "Forward" : "New message"), $e = m(Qe, 1, "svelte-zp5xms", null, $e, { on: T(C) !== null }), n(et, T(C) === null ? "Preview" : "Edit"), Nt.disabled = d().sending, h(Pt, "aria-expanded", T(k)), n(Wt, e);
	}, [() => d().saving ? "Saving…" : d().savedAt ? `Draft saved ${new Date(d().savedAt).toLocaleTimeString(void 0, {
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	})}` : ""]), J("keydown", xe, ye), u("dragover", xe, (e) => {
		e.preventDefault(), O(P, !0);
	}), u("dragleave", xe, (e) => {
		e.currentTarget === e.target && O(P, !1);
	}), u("drop", xe, le), J("click", He, () => W("**")), J("click", Ue, () => W("*")), J("click", We, () => W("~~")), J("click", Ge, re), J("click", qe, () => ne("- ")), J("click", Je, () => ne("1. ")), J("click", Ye, () => ne("> ")), J("click", Xe, () => W("`")), J("click", Qe, ie), J("click", Nt, () => me()), J("click", Pt, () => O(k, !T(k))), J("click", Rt, () => T(F)?.click()), J("click", Bt, se), J("change", Ht, (e) => {
		e.currentTarget.files && oe(e.currentTarget.files), e.currentTarget.value = "";
	}), J("click", qt, ve), c(e, xe), ce();
}
d([
	"keydown",
	"click",
	"change",
	"input"
]);
//#endregion
//#region plugins/stable/email/ui/src/Reader.svelte
var Pt = C("<div class=\"loading svelte-j5oobt\"><div class=\"bar svelte-j5oobt\"></div><div class=\"bar short svelte-j5oobt\"></div><div class=\"bar svelte-j5oobt\"></div></div>"), Ft = C("<div class=\"atlas-empty\"><p> </p><button class=\"atlas-btn\">Try again</button></div>"), It = C("<button class=\"tool svelte-j5oobt\" title=\"Back to the list (u)\"><!></button>"), Lt = C("<button role=\"menuitem\" class=\"svelte-j5oobt\">Open the note</button>"), Rt = C("<button role=\"menuitem\" class=\"svelte-j5oobt\">Unsubscribe</button>"), zt = C("<div class=\"menu svelte-j5oobt\" role=\"menu\" tabindex=\"-1\"><!> <button role=\"menuitem\" class=\"svelte-j5oobt\">Mark important</button> <button role=\"menuitem\" class=\"svelte-j5oobt\">Not important…</button> <!> <button role=\"menuitem\" class=\"svelte-j5oobt\">Make a task</button> <button role=\"menuitem\" class=\"svelte-j5oobt\">Expand all (;)</button></div>"), Bt = C("<span class=\"chip svelte-j5oobt\"> </span>"), Vt = C("<button class=\"link svelte-j5oobt\">Unsubscribe</button>"), Ht = C("<span class=\"addr svelte-j5oobt\"> </span>"), Ut = C("<span class=\"snip svelte-j5oobt\"> </span>"), Wt = C("<span> </span>"), Gt = C("<button class=\"atlas-btn\">Edit the draft</button>"), Kt = C("<button class=\"mini svelte-j5oobt\" title=\"Reply (r)\"><!></button> <button class=\"mini svelte-j5oobt\" title=\"Reply all (a)\"><!></button> <button class=\"mini svelte-j5oobt\" title=\"Forward (f)\"><!></button>", 1), qt = C("<div class=\"atlas-notice error\"> </div>"), Jt = C("<div class=\"remote svelte-j5oobt\" role=\"status\"><!> <span> </span> <button class=\"link svelte-j5oobt\">Show</button> <button class=\"link svelte-j5oobt\"> </button></div>"), Yt = C("<div class=\"fwd svelte-j5oobt\"><div class=\"fwdhead svelte-j5oobt\"><b>Forwarded:</b> </div> <!></div>"), Xt = C("<div class=\"file svelte-j5oobt\"><button class=\"fopen svelte-j5oobt\" title=\"Open in Atlas\"><!><span class=\"fname svelte-j5oobt\"> </span><span class=\"faint svelte-j5oobt\"> </span></button> <button class=\"mini svelte-j5oobt\" title=\"Save into the vault…\"><!></button></div>"), Zt = C("<div class=\"files svelte-j5oobt\"></div>"), Qt = C("<!> <!> <!> <!> <!>", 1), $t = C("<div class=\"loading svelte-j5oobt\"><div class=\"bar svelte-j5oobt\"></div></div>"), en = C("<div class=\"detail svelte-j5oobt\"><div class=\"to svelte-j5oobt\" role=\"presentation\"><!> <!> <span class=\"faint svelte-j5oobt\"> </span> <span class=\"grow svelte-j5oobt\"></span> <!></div> <!></div>"), tn = C("<article><button class=\"head svelte-j5oobt\"><span class=\"avatar svelte-j5oobt\"> </span> <span class=\"from svelte-j5oobt\"><b class=\"svelte-j5oobt\"> </b><!></span> <!> <span class=\"when svelte-j5oobt\"><!> </span></button> <!></article>"), nn = C("<div class=\"quick svelte-j5oobt\"><button class=\"atlas-btn svelte-j5oobt\"><!> Reply</button> <button class=\"atlas-btn svelte-j5oobt\"><!> Reply all</button> <button class=\"atlas-btn svelte-j5oobt\"><!> Forward</button></div>"), rn = C("<header class=\"top svelte-j5oobt\"><div class=\"tools svelte-j5oobt\" role=\"toolbar\" aria-label=\"Conversation actions\"><!> <button class=\"tool svelte-j5oobt\" title=\"Archive (e)\"><!></button> <button class=\"tool svelte-j5oobt\"><!></button> <button class=\"tool svelte-j5oobt\"><!></button> <span class=\"sep svelte-j5oobt\"></span> <button class=\"tool svelte-j5oobt\" title=\"Mark unread (⇧U)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Snooze (h)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Move to (v)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Label (l)\"><!></button> <span class=\"grow svelte-j5oobt\"></span> <button><!></button> <div class=\"menu-wrap svelte-j5oobt\"><button class=\"tool svelte-j5oobt\" title=\"More\"><!></button> <!></div></div> <h2 class=\"subject svelte-j5oobt\"> <button><!></button></h2> <div class=\"meta svelte-j5oobt\"><!> <span class=\"faint svelte-j5oobt\"> </span> <!></div></header> <div class=\"cards svelte-j5oobt\"></div> <div class=\"answer svelte-j5oobt\"><!></div>", 1), an = C("<div class=\"atlas-empty nothing svelte-j5oobt\"><!> <p class=\"svelte-j5oobt\"> </p> <p class=\"faint svelte-j5oobt\">j / k to move, Enter to open, c to write, ? for every key.</p></div>"), on = C("<section class=\"reader svelte-j5oobt\" aria-label=\"The conversation\"><!></section>"), sn = {
	hash: "svelte-j5oobt",
	code: ".reader.svelte-j5oobt {height:100%;overflow-y:auto;display:flex;flex-direction:column;box-sizing:border-box;}.top.svelte-j5oobt {position:sticky;top:0;z-index:2;background:var(--bg);padding:8px 20px 10px;border-bottom:1px solid var(--border);display:grid;gap:6px;}.tools.svelte-j5oobt {display:flex;align-items:center;gap:2px;margin-left:-6px;}.tool.svelte-j5oobt {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);min-width:24px;min-height:24px;display:grid;place-items:center;}.tool.svelte-j5oobt:hover {background:var(--bg-hover);color:var(--text);}.tool.on.svelte-j5oobt {color:var(--accent);}.tool.svelte-j5oobt:focus-visible, .head.svelte-j5oobt:focus-visible, .mini.svelte-j5oobt:focus-visible, .fopen.svelte-j5oobt:focus-visible, .star.svelte-j5oobt:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.sep.svelte-j5oobt {width:1px;height:18px;background:var(--border-strong);margin:0 4px;}.grow.svelte-j5oobt {flex:1;}.subject.svelte-j5oobt {margin:0;font-size:1.32em;line-height:1.3;font-weight:600;color:var(--heading);display:flex;gap:8px;align-items:flex-start;overflow-wrap:anywhere;}.star.svelte-j5oobt {all:unset;cursor:pointer;color:var(--text-faint);padding:3px;border-radius:var(--radius-sm);margin-top:1px;}.star.on.svelte-j5oobt {color:var(--yellow);}.meta.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:0.88em;}.chip.svelte-j5oobt {font-size:0.9em;padding:0 7px;border-radius:999px;background:hsl(var(--h) 60% 50% / 0.16);}.faint.svelte-j5oobt {color:var(--text-faint);}.link.svelte-j5oobt {all:unset;cursor:pointer;color:var(--accent);}.link.svelte-j5oobt:hover {text-decoration:underline;}.menu-wrap.svelte-j5oobt {position:relative;}.menu.svelte-j5oobt {position:absolute;right:0;top:100%;z-index:5;min-width:200px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));padding:4px;display:grid;}.menu.svelte-j5oobt button:where(.svelte-j5oobt) {all:unset;cursor:pointer;padding:7px 10px;border-radius:var(--radius-sm);}.menu.svelte-j5oobt button:where(.svelte-j5oobt):hover {background:var(--bg-hover);}.cards.svelte-j5oobt {padding:12px 16px;display:grid;gap:8px;}.card.svelte-j5oobt {border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-alt);overflow:hidden;}.card.open.svelte-j5oobt {background:var(--bg);box-shadow:var(--shadow-sm);}.card.draft.svelte-j5oobt {border-color:color-mix(in srgb, var(--red) 40%, transparent);}.head.svelte-j5oobt {all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;min-width:0;}.head.svelte-j5oobt:hover {background:var(--bg-hover);}.avatar.svelte-j5oobt {flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);}.from.svelte-j5oobt {display:flex;gap:8px;align-items:baseline;min-width:0;flex:0 1 auto;white-space:nowrap;}.unread.svelte-j5oobt .from:where(.svelte-j5oobt) b:where(.svelte-j5oobt) {color:var(--heading);}.addr.svelte-j5oobt {color:var(--text-faint);font-size:0.86em;overflow:hidden;text-overflow:ellipsis;}.snip.svelte-j5oobt {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);}.when.svelte-j5oobt {margin-left:auto;flex:none;color:var(--text-muted);font-size:0.85em;display:flex;gap:5px;align-items:center;}.detail.svelte-j5oobt {padding:0 16px 14px 54px;display:grid;gap:10px;}.to.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;font-size:0.86em;color:var(--text-muted);}.mini.svelte-j5oobt {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;}.mini.svelte-j5oobt:hover {background:var(--bg-hover);color:var(--text);}.remote.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:7px 10px;border-radius:var(--radius-sm);background:var(--bg-hover);font-size:0.86em;color:var(--text-muted);}.fwd.svelte-j5oobt {border-left:3px solid var(--border-strong);padding-left:12px;display:grid;gap:6px;}.fwdhead.svelte-j5oobt {font-size:0.86em;color:var(--text-muted);}.files.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:8px;}.file.svelte-j5oobt {display:flex;align-items:center;border:1px solid var(--border-strong);border-radius:var(--radius);background:var(--bg-alt);}.fopen.svelte-j5oobt {all:unset;cursor:pointer;display:flex;gap:8px;align-items:center;padding:7px 10px;max-width:280px;}.fopen.svelte-j5oobt:hover {color:var(--accent);}.fname.svelte-j5oobt {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}.fopen.svelte-j5oobt .faint:where(.svelte-j5oobt) {white-space:nowrap;flex:none;font-size:0.86em;}.answer.svelte-j5oobt {padding:4px 16px 24px 16px;}.quick.svelte-j5oobt {display:flex;gap:8px;flex-wrap:wrap;padding-left:38px;}.quick.svelte-j5oobt .atlas-btn:where(.svelte-j5oobt) {display:inline-flex;gap:6px;align-items:center;}.nothing.svelte-j5oobt {margin:auto;display:grid;justify-items:center;gap:6px;color:var(--text-faint);text-align:center;padding:40px;}.nothing.svelte-j5oobt p:where(.svelte-j5oobt) {margin:0;}.loading.svelte-j5oobt {padding:24px;display:grid;gap:12px;}.bar.svelte-j5oobt {height:12px;border-radius:4px;background:var(--bg-hover);}.bar.short.svelte-j5oobt {width:40%;}\n  @container (max-width: 560px) {.detail.svelte-j5oobt {padding-left:14px;}.quick.svelte-j5oobt {padding-left:0;}.top.svelte-j5oobt {padding:6px 12px 8px;}.cards.svelte-j5oobt {padding:8px;} }"
};
function cn(e, t) {
	M(t, !0), g(e, sn);
	let i = r(t, "narrow", 3, !1), a = X(() => t.mail.open), o = K(z([])), s = K(z([])), d = K(!1), y = -1;
	_(() => {
		if (!T(a) || T(a).thread === y) return;
		y = T(a).thread;
		let e = T(a).messages.at(-1);
		O(o, T(a).messages.filter((t) => !t.seen || t.draft || t === e).map((e) => e.id), !0), O(s, [], !0);
	});
	function b(e) {
		T(a) && O(o, e ? T(a).messages.map((e) => e.id) : [T(a).messages.at(-1).id], !0);
	}
	let S = (e) => O(o, T(o).includes(e) ? T(o).filter((t) => t !== e) : [...T(o), e], !0), C = X(() => t.mail.own), w = (e) => e.map((e) => T(C).includes(e.addr.toLowerCase()) ? "me" : e.name || e.addr).join(", "), I = K(z([]));
	function L(e, t, n) {
		let r = `${t}:${n}`;
		return e.length <= 4 || T(I).includes(r) ? w(e) : `${w(e.slice(0, 3))} and ${e.length - 3} more`;
	}
	let ee = X(() => t.mail.composers.find((e) => e.inline)), R = X(() => T(a) ? t.mail.rows.find((e) => e.thread === T(a).thread) : void 0), B = X(() => !!T(a)?.messages.some((e) => e.flagged)), V = X(() => T(a)?.messages.findLast((e) => e.unsubscribe)?.unsubscribe ? T(a)?.messages.findLast((e) => e.unsubscribe) : void 0), H = X(() => T(a)?.messages.at(-1)?.folder_role ?? null);
	async function te(e, n, r = !0) {
		try {
			let i = await t.mail.call("attachment", {
				id: e.id,
				part: n.part,
				name: n.name
			});
			t.mail.atlas.open(i.path, void 0, { beside: r });
		} catch (e) {
			t.mail.toast(`Cannot open ${n.name}: ${e.message}`, "error");
		}
	}
	async function U(e, n) {
		let r = await ae(t.mail.atlas, `Save ${n.name} into which vault folder?`, "attachments");
		if (r) try {
			let i = await t.mail.call("attachment", {
				id: e.id,
				part: n.part,
				name: n.name,
				to: r
			});
			t.mail.toast(`Saved ${i.path}`, "success", { action: {
				label: "Open",
				run: () => t.mail.atlas.open(i.path, void 0, { beside: !0 })
			} });
		} catch (e) {
			t.mail.toast(`Cannot save ${n.name}: ${e.message}`, "error");
		}
	}
	async function W(e) {
		let n = e.from[0]?.addr;
		n && (await t.mail.call("allow_remote", { sender: n }), O(s, [...T(s), ...T(a).messages.filter((e) => e.from[0]?.addr === n).map((e) => e.id)], !0), t.mail.toast(`Pictures from ${n} are shown from now on`));
	}
	async function ie() {
		if (T(V) && await A(t.mail.atlas, `Unsubscribe from ${T(V).from[0]?.name || T(V).from[0]?.addr}?`, { ok: "Unsubscribe" })) try {
			let e = await t.mail.call("unsubscribe", { id: T(V).id });
			e.open ? window.open(e.open, "_blank") : t.mail.toast(e.done === "mail" ? "Unsubscribe mail sent" : "Unsubscribed", "success");
		} catch (e) {
			t.mail.toast(`Could not unsubscribe: ${e.message}`, "error");
		}
	}
	let oe = (e) => e.startsWith("image/") ? "image" : e === "text/calendar" ? "calendar" : "attach";
	var le = { expandAll: b }, ue = on(), fe = N(ue), pe = (e) => {
		var t = Pt();
		c(e, t);
	}, $ = (e) => {
		var r = Ft(), i = N(r), a = G(i, !0), o = Y(i);
		q(r), E(() => n(a, t.mail.readError)), J("click", o, () => t.mail.openId && t.mail.read(t.mail.openId)), c(e, r);
	}, me = (e) => {
		var r = rn(), g = Z(r), _ = N(g), y = N(_), w = (e) => {
			var n = It(), r = N(n);
			Q(r, { name: "back" }), q(n), J("click", n, function(...e) {
				t.onback?.apply(this, e);
			}), c(e, n);
		};
		v(y, (e) => {
			i() && e(w);
		});
		var A = Y(y, 2), M = N(A);
		Q(M, { name: "archive" }), q(A);
		var z = Y(A, 2), K = N(z);
		Q(K, { name: "trash" }), q(z);
		var ae = Y(z, 2), ce = N(ae);
		Q(ce, { name: "spam" }), q(ae);
		var le = Y(ae, 4), ue = N(le);
		Q(ue, { name: "unread" }), q(le);
		var fe = Y(le, 2), pe = N(fe);
		Q(pe, { name: "clock" }), q(fe);
		var $ = Y(fe, 2), me = N($);
		Q(me, { name: "folder" }), q($);
		var he = Y($, 2), ge = N(he);
		Q(ge, { name: "label" }), q(he);
		var _e = Y(he, 4);
		let ve;
		var ye = N(_e);
		Q(ye, { name: "note" }), q(_e);
		var be = Y(_e, 2), xe = N(be), Se = N(xe);
		Q(Se, { name: "more" }), q(xe);
		var Ce = Y(xe, 2), we = (e) => {
			var n = zt(), r = N(n), i = (e) => {
				var n = Lt();
				J("click", n, () => {
					O(d, !1), t.mail.atlas.open(T(a).saved, void 0, { beside: !0 });
				}), c(e, n);
			};
			v(r, (e) => {
				T(a).saved && e(i);
			});
			var o = Y(r, 2), s = Y(o, 2), l = Y(s, 2), f = (e) => {
				var t = Rt();
				J("click", t, () => {
					O(d, !1), ie();
				}), c(e, t);
			};
			v(l, (e) => {
				T(V) && e(f);
			});
			var p = Y(l, 2), m = Y(p, 2);
			q(n), u("mouseleave", n, () => O(d, !1)), J("click", o, () => {
				O(d, !1), t.mail.importance(!0);
			}), J("click", s, () => {
				O(d, !1), t.mail.importance(!1);
			}), J("click", p, () => {
				O(d, !1), t.mail.atlas.capture(`- [ ] ${T(a).subject} (mail from ${k(T(a).messages.at(-1)?.from[0], T(C))})`), t.mail.toast("Added a task to today's log");
			}), J("click", m, () => {
				O(d, !1), b(!0);
			}), c(e, n);
		};
		v(Ce, (e) => {
			T(d) && e(we);
		}), q(be), q(_);
		var Te = Y(_, 2), Ee = N(Te), De = Y(Ee);
		let Oe;
		var ke = N(De);
		Q(ke, {
			name: "star",
			size: 18,
			get filled() {
				return T(B);
			}
		}), q(De), q(Te);
		var Ae = Y(Te, 2), je = N(Ae), Me = (e) => {
			var t = x(), r = Z(t);
			l(r, 16, () => T(R).labels, (e) => e, (e, t) => {
				var r = Bt();
				let i;
				var a = G(r, !0);
				E((e, t) => {
					i = p(r, "", i, { "--h": e }), n(a, t);
				}, [() => P(t), () => t.replace(/^\$/, "")]), c(e, r);
			}), c(e, t);
		};
		v(je, (e) => {
			T(R) && e(Me);
		});
		var Ne = Y(je, 2), Pe = G(Ne, !0), Fe = Y(Ne, 2), Ie = (e) => {
			var t = Vt();
			J("click", t, ie), c(e, t);
		};
		v(Fe, (e) => {
			T(V) && e(Ie);
		}), q(Ae), q(g);
		var Le = Y(g, 2);
		l(Le, 21, () => T(a).messages, (e) => e.id, (e, r) => {
			let i = X(() => T(o).includes(T(r).id)), a = X(() => !!T(r).body?.remote_allowed || T(s).includes(T(r).id));
			var u = tn();
			let d;
			var g = N(u), _ = N(g);
			let y;
			var b = G(_, !0), x = Y(_, 2), w = N(x), A = G(w, !0), M = Y(w), F = (e) => {
				var t = Ht(), i = G(t, !0);
				E(() => n(i, T(r).from[0]?.addr)), c(e, t);
			};
			v(M, (e) => {
				T(i) && !T(r).draft && e(F);
			}), q(x);
			var ee = Y(x, 2), R = (e) => {
				var t = Ut(), i = G(t, !0);
				E((e) => n(i, e), [() => T(r).snippet || T(r).body?.text?.slice(0, 160)]), c(e, t);
			};
			v(ee, (e) => {
				T(i) || e(R);
			});
			var z = Y(ee, 2), B = N(z), V = (e) => {
				Q(e, {
					name: "attach",
					size: 13
				});
			};
			v(B, (e) => {
				T(r).has_attachments && e(V);
			});
			var H = Y(B, 1, !0);
			q(z), q(g);
			var K = Y(g, 2), ie = (e) => {
				var i = en(), o = N(i), u = N(o), d = (e) => {
					var t = Wt(), i = G(t);
					E((e) => n(i, `to ${e ?? ""}`), [() => L(T(r).to, T(r).id, "to")]), c(e, t);
				};
				v(u, (e) => {
					T(r).to.length && e(d);
				});
				var p = Y(u, 2), m = (e) => {
					var t = Wt(), i = G(t);
					E((e) => n(i, `cc ${e ?? ""}`), [() => L(T(r).cc, T(r).id, "cc")]), c(e, t);
				};
				v(p, (e) => {
					T(r).cc.length && e(m);
				});
				var h = Y(p, 2), g = G(h, !0), _ = Y(h, 4), y = (e) => {
					var n = Gt();
					J("click", n, () => t.mail.editDraft(T(r).id)), c(e, n);
				}, b = (e) => {
					var n = Kt(), i = Z(n), a = N(i);
					Q(a, {
						name: "reply",
						size: 15
					}), q(i);
					var o = Y(i, 2), s = N(o);
					Q(s, {
						name: "replyall",
						size: 15
					}), q(o);
					var l = Y(o, 2), u = N(l);
					Q(u, {
						name: "forward",
						size: 15
					}), q(l), J("click", i, () => t.mail.reply("reply", T(r).id)), J("click", o, () => t.mail.reply("all", T(r).id)), J("click", l, () => t.mail.reply("forward", T(r).id)), c(e, n);
				};
				v(_, (e) => {
					T(r).draft ? e(y) : e(b, -1);
				}), q(o);
				var x = Y(o, 2), S = (e) => {
					var t = qt(), i = G(t, !0);
					E(() => n(i, T(r).error)), c(e, t);
				}, C = (e) => {
					var i = Qt(), o = Z(i), u = (e) => {
						var t = Jt(), i = N(t);
						Q(i, {
							name: "lock",
							size: 14
						});
						var a = Y(i, 2), o = G(a), l = Y(a, 2), u = Y(l, 2), d = G(u);
						q(t), E(() => {
							n(o, `${T(r).body.remote ?? ""} remote picture${T(r).body.remote === 1 ? "" : "s"} blocked (they can tell the sender you read it).`), n(d, `Always from ${T(r).from[0]?.addr ?? ""}`);
						}), J("click", l, () => O(s, [...T(s), T(r).id], !0)), J("click", u, () => W(T(r))), c(e, t);
					};
					v(o, (e) => {
						T(r).body.remote && !T(a) && e(u);
					});
					var d = Y(o, 2), p = (e) => {
						at(e, {
							get mail() {
								return t.mail;
							},
							get id() {
								return T(r).id;
							},
							get invite() {
								return T(r).body.invite;
							}
						});
					};
					v(d, (e) => {
						T(r).body.invite && e(p);
					});
					var m = Y(d, 2);
					ne(m, {
						get html() {
							return T(r).body.html;
						},
						get plain() {
							return T(r).body.plain;
						},
						get remote() {
							return T(a);
						},
						get dark() {
							return t.dark;
						}
					});
					var h = Y(m, 2);
					l(h, 17, () => T(r).body.forwarded, f, (e, r) => {
						var i = Yt(), o = N(i), s = Y(N(o));
						q(o);
						var l = Y(o, 2);
						ne(l, {
							get html() {
								return T(r).html;
							},
							get plain() {
								return T(r).plain;
							},
							get remote() {
								return T(a);
							},
							get dark() {
								return t.dark;
							}
						}), q(i), E((e, t) => n(s, ` ${T(r).subject ?? ""} · ${e ?? ""} · ${t ?? ""}`), [() => T(r).from.map(se).join(", "), () => de(T(r).date)]), c(e, i);
					});
					var g = Y(h, 2), _ = (e) => {
						var t = Zt();
						l(t, 21, () => T(r).body.attachments, (e) => e.part, (e, t) => {
							var i = Xt(), a = N(i), o = N(a);
							{
								let e = X(() => oe(T(t).mime));
								Q(o, { get name() {
									return T(e);
								} });
							}
							var s = Y(o), l = G(s, !0), u = Y(s), d = G(u, !0);
							q(a);
							var f = Y(a, 2), p = N(f);
							Q(p, {
								name: "save",
								size: 14
							}), q(f), q(i), E((e) => {
								n(l, T(t).name), n(d, e);
							}, [() => D(T(t).size)]), J("click", a, () => te(T(r), T(t))), J("click", f, () => U(T(r), T(t))), c(e, i);
						}), q(t), c(e, t);
					};
					v(g, (e) => {
						T(r).body.attachments.length && e(_);
					}), c(e, i);
				}, w = (e) => {
					var t = $t();
					c(e, t);
				};
				v(x, (e) => {
					T(r).error ? e(S) : T(r).body ? e(C, 1) : e(w, -1);
				}), q(i), E((e) => n(g, e), [() => j(T(r).date)]), J("click", o, () => O(I, [
					...T(I),
					`${T(r).id}:to`,
					`${T(r).id}:cc`
				], !0)), c(e, i);
			};
			v(K, (e) => {
				T(i) && e(ie);
			}), q(u), E((e, t, a, o, s) => {
				d = m(u, 1, "card svelte-j5oobt", null, d, {
					open: T(i),
					unread: !T(r).seen,
					draft: T(r).draft
				}), h(g, "aria-expanded", T(i)), y = p(_, "", y, { "--h": e }), n(b, t), n(A, a), h(z, "title", o), n(H, s);
			}, [
				() => P(T(r).from[0]?.addr ?? ""),
				() => re(T(r).from[0]),
				() => T(r).draft ? "Draft" : k(T(r).from[0], T(C)),
				() => j(T(r).date),
				() => de(T(r).date)
			]), J("click", g, () => S(T(r).id)), c(e, u);
		}), q(Le);
		var Re = Y(Le, 2), ze = N(Re), Be = (e) => {
			Nt(e, {
				get mail() {
					return t.mail;
				},
				get c() {
					return T(ee);
				},
				inline: !0
			});
		}, Ve = (e) => {
			var n = nn(), r = N(n), i = N(r);
			Q(i, {
				name: "reply",
				size: 15
			}), F(), q(r);
			var a = Y(r, 2), o = N(a);
			Q(o, {
				name: "replyall",
				size: 15
			}), F(), q(a);
			var s = Y(a, 2), l = N(s);
			Q(l, {
				name: "forward",
				size: 15
			}), F(), q(s), q(n), J("click", r, () => t.mail.reply("reply")), J("click", a, () => t.mail.reply("all")), J("click", s, () => t.mail.reply("forward")), c(e, n);
		};
		v(ze, (e) => {
			T(ee) ? e(Be) : e(Ve, -1);
		}), q(Re), E((e) => {
			h(z, "title", T(H) === "trash" ? "Delete for good" : "Delete (#)"), h(ae, "title", T(H) === "junk" ? "Not spam" : "Spam (!)"), ve = m(_e, 1, "tool svelte-j5oobt", null, ve, { on: !!T(a).saved }), h(_e, "title", T(a).saved ? `Saved as ${T(a).saved} — save again to add new messages` : "Save as note (⇧N)"), h(xe, "aria-expanded", T(d)), n(Ee, `${(T(a).subject || "(no subject)") ?? ""} `), Oe = m(De, 1, "star svelte-j5oobt", null, Oe, { on: T(B) }), h(De, "title", T(B) ? "Unstar (s)" : "Star (s)"), h(De, "aria-pressed", T(B)), n(Pe, e);
		}, [() => `${T(a).messages.length} message${T(a).messages.length === 1 ? "" : "s"}${T(a).messages.at(-1)?.folder_label ? ` · ${T(a).messages.at(-1)?.folder_label}` : ""}`]), J("click", A, () => t.mail.archive()), J("click", z, () => t.mail.trash()), J("click", ae, () => t.mail.spam()), J("click", le, () => t.mail.toggleRead()), J("click", fe, () => t.onpick("snooze")), J("click", $, () => t.onpick("move")), J("click", he, () => t.onpick("label")), J("click", _e, () => t.mail.saveNote()), J("click", xe, () => O(d, !T(d))), J("click", De, () => t.mail.toggleStar()), c(e, r);
	}, he = (e) => {
		var r = an(), i = N(r);
		Q(i, {
			name: "inbox",
			size: 40
		});
		var a = Y(i, 2), o = G(a, !0);
		F(2), q(r), E(() => n(o, t.mail.rows.length ? "Choose a conversation to read it." : "Nothing here.")), c(e, r);
	};
	return v(fe, (e) => {
		t.mail.reading && !T(a) ? e(pe) : t.mail.readError ? e($, 1) : T(a) ? e(me, 2) : e(he, -1);
	}), q(ue), c(e, ue), ce(le);
}
d(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/Toasts.svelte
var ln = C("<button class=\"svelte-1rm31ba\">Undo</button>"), un = C("<button class=\"svelte-1rm31ba\"> </button>"), dn = C("<div><span class=\"text svelte-1rm31ba\"> </span> <!> <!> <button class=\"x svelte-1rm31ba\" aria-label=\"Close\">×</button></div>"), fn = C("<div class=\"toasts svelte-1rm31ba\" aria-live=\"polite\"></div>"), pn = {
	hash: "svelte-1rm31ba",
	code: ".toasts.svelte-1rm31ba {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-1rm31ba {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-1rm31ba-in 120ms var(--ease);}.toast.error.svelte-1rm31ba {background:var(--red);color:#fff;}.text.svelte-1rm31ba {min-width:0;overflow-wrap:anywhere;}button.svelte-1rm31ba {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-1rm31ba button:where(.svelte-1rm31ba) {color:#fff;text-decoration:underline;}button.svelte-1rm31ba:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-1rm31ba:focus-visible {outline:2px solid currentColor;}.x.svelte-1rm31ba {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-1rm31ba-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-1rm31ba { animation: none;} }"
};
function mn(e, t) {
	M(t, !0), g(e, pn);
	var r = fn();
	l(r, 21, () => t.mail.toasts, (e) => e.id, (e, r) => {
		var i = dn();
		let a;
		var o = N(i), s = G(o, !0), l = Y(o, 2), u = (e) => {
			var n = ln();
			J("click", n, async () => {
				t.mail.dismiss(T(r).id), await T(r).undo?.();
			}), c(e, n);
		};
		v(l, (e) => {
			T(r).undo && e(u);
		});
		var d = Y(l, 2), f = (e) => {
			var i = un(), a = G(i, !0);
			E(() => n(a, T(r).action.label)), J("click", i, () => {
				t.mail.dismiss(T(r).id), T(r).action?.run();
			}), c(e, i);
		};
		v(d, (e) => {
			T(r).action && e(f);
		});
		var p = Y(d, 2);
		q(i), E(() => {
			a = m(i, 1, "toast svelte-1rm31ba", null, a, {
				error: T(r).kind === "error",
				success: T(r).kind === "success"
			}), h(i, "role", T(r).kind === "error" ? "alert" : "status"), n(s, T(r).text);
		}), J("click", p, () => t.mail.dismiss(T(r).id)), c(e, i);
	}), q(r), c(e, r), ce();
}
d(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/keys.ts
var hn = (e) => e.targets().length > 0, gn = [
	{
		id: "down",
		title: "Next conversation",
		group: "Move around",
		keys: "j, arrowdown",
		run: (e) => {
			e.move(1), e.openId !== null && e.cursor !== null && e.read(e.cursor);
		}
	},
	{
		id: "up",
		title: "Previous conversation",
		group: "Move around",
		keys: "k, arrowup",
		run: (e) => {
			e.move(-1), e.openId !== null && e.cursor !== null && e.read(e.cursor);
		}
	},
	{
		id: "open",
		title: "Open",
		group: "Move around",
		keys: "o, enter",
		when: (e) => e.cursor !== null,
		run: (e) => {
			e.cursor !== null && e.read(e.cursor);
		}
	},
	{
		id: "back",
		title: "Back to the list",
		group: "Move around",
		keys: "u, escape",
		run: (e, t) => t.back()
	},
	{
		id: "search",
		title: "Search mail",
		group: "Move around",
		keys: "/",
		run: (e, t) => t.focusSearch()
	},
	{
		id: "expand",
		title: "Expand every message",
		group: "Move around",
		keys: ";",
		run: (e, t) => t.expandAll(!0)
	},
	{
		id: "collapse",
		title: "Collapse every message",
		group: "Move around",
		keys: ":",
		run: (e, t) => t.expandAll(!1)
	},
	{
		id: "first",
		title: "First conversation",
		group: "Move around",
		keys: "home",
		run: (e) => e.move(-1e9)
	},
	{
		id: "last",
		title: "Last conversation",
		group: "Move around",
		keys: "end",
		run: (e) => e.move(1e9)
	},
	{
		id: "archive",
		title: "Archive",
		group: "Act",
		keys: "e",
		when: hn,
		run: (e) => e.archive()
	},
	{
		id: "trash",
		title: "Delete (to Trash)",
		group: "Act",
		keys: "#, delete",
		when: hn,
		run: (e) => e.trash()
	},
	{
		id: "spam",
		title: "Spam / not spam",
		group: "Act",
		keys: "!",
		when: hn,
		run: (e) => e.spam()
	},
	{
		id: "star",
		title: "Star / unstar",
		group: "Act",
		keys: "s",
		when: hn,
		run: (e) => e.toggleStar()
	},
	{
		id: "read",
		title: "Mark read",
		group: "Act",
		keys: "shift+i",
		when: hn,
		run: (e) => e.mark("read", !0)
	},
	{
		id: "unread",
		title: "Mark unread",
		group: "Act",
		keys: "shift+u",
		when: hn,
		run: (e) => e.mark("read", !1)
	},
	{
		id: "toggle-read",
		title: "Read / unread",
		group: "Act",
		keys: "m",
		when: hn,
		run: (e) => e.toggleRead()
	},
	{
		id: "snooze",
		title: "Snooze…",
		group: "Act",
		keys: "h, b",
		when: hn,
		run: (e, t) => t.pick("snooze")
	},
	{
		id: "unsnooze",
		title: "Back to the inbox now (unsnooze)",
		group: "Act",
		when: (e) => e.view.name === "snoozed" && hn(e),
		run: (e) => e.unsnooze()
	},
	{
		id: "move",
		title: "Move to…",
		group: "Act",
		keys: "v",
		when: hn,
		run: (e, t) => t.pick("move")
	},
	{
		id: "label",
		title: "Label…",
		group: "Act",
		keys: "l",
		when: hn,
		run: (e, t) => t.pick("label")
	},
	{
		id: "important",
		title: "Important",
		group: "Act",
		keys: "i",
		when: hn,
		run: (e) => e.importance(!0)
	},
	{
		id: "not-important",
		title: "Not important (moves it out of the inbox)",
		group: "Act",
		keys: "n",
		when: hn,
		run: (e) => e.importance(!1)
	},
	{
		id: "note",
		title: "Save as note",
		group: "Act",
		keys: "shift+n",
		when: hn,
		run: (e) => e.saveNote()
	},
	{
		id: "undo",
		title: "Undo",
		group: "Act",
		keys: "z, ctrl+z",
		run: (e) => e.undo()
	},
	{
		id: "compose",
		title: "New message",
		group: "Write",
		keys: "c",
		run: (e) => {
			e.compose();
		}
	},
	{
		id: "reply",
		title: "Reply",
		group: "Write",
		keys: "r",
		when: (e) => e.openId !== null || e.cursor !== null,
		run: (e) => e.reply("reply")
	},
	{
		id: "reply-all",
		title: "Reply all",
		group: "Write",
		keys: "a",
		when: (e) => e.openId !== null || e.cursor !== null,
		run: (e) => e.reply("all")
	},
	{
		id: "forward",
		title: "Forward",
		group: "Write",
		keys: "f",
		when: (e) => e.openId !== null || e.cursor !== null,
		run: (e) => e.reply("forward")
	},
	{
		id: "reply-pane",
		title: "Reply in a full pane",
		group: "Write",
		keys: "shift+r",
		when: (e) => e.openId !== null || e.cursor !== null,
		run: (e) => e.reply("reply", void 0, !1)
	},
	{
		id: "reply-all-pane",
		title: "Reply all in a full pane",
		group: "Write",
		keys: "shift+a",
		when: (e) => e.openId !== null || e.cursor !== null,
		run: (e) => e.reply("all", void 0, !1)
	},
	{
		id: "forward-pane",
		title: "Forward in a full pane",
		group: "Write",
		keys: "shift+f",
		when: (e) => e.openId !== null || e.cursor !== null,
		run: (e) => e.reply("forward", void 0, !1)
	},
	{
		id: "template",
		title: "New from a template…",
		group: "Write",
		run: (e, t) => t.pick("template")
	},
	{
		id: "go-inbox",
		title: "Go to the inbox",
		group: "Go to",
		keys: "g i",
		run: (e) => e.go({
			name: "inbox",
			account: e.view.account,
			folder: null,
			label: "Inbox"
		})
	},
	{
		id: "go-starred",
		title: "Go to Starred",
		group: "Go to",
		keys: "g s",
		run: (e) => e.go({
			name: "starred",
			account: e.view.account,
			folder: null,
			label: "Starred"
		})
	},
	{
		id: "go-unimportant",
		title: "Go to Not important",
		group: "Go to",
		keys: "g n",
		run: (e) => e.go({
			name: "unimportant",
			account: e.view.account,
			folder: null,
			label: "Not important"
		})
	},
	{
		id: "go-snoozed",
		title: "Go to Snoozed",
		group: "Go to",
		keys: "g b",
		run: (e) => e.go({
			name: "snoozed",
			account: e.view.account,
			folder: null,
			label: "Snoozed"
		})
	},
	{
		id: "go-drafts",
		title: "Go to Drafts",
		group: "Go to",
		keys: "g d",
		run: (e) => e.go({
			name: "drafts",
			account: e.view.account,
			folder: null,
			label: "Drafts"
		})
	},
	{
		id: "go-sent",
		title: "Go to Sent",
		group: "Go to",
		keys: "g t",
		run: (e) => e.go({
			name: "sent",
			account: e.view.account,
			folder: null,
			label: "Sent"
		})
	},
	{
		id: "go-all",
		title: "Go to all mail",
		group: "Go to",
		keys: "g a",
		run: (e) => e.go({
			name: "all",
			account: e.view.account,
			folder: null,
			label: "All mail"
		})
	},
	{
		id: "go-folder",
		title: "Go to a folder…",
		group: "Go to",
		keys: "g l, g f",
		run: (e, t) => t.pick("go")
	},
	{
		id: "select",
		title: "Check this conversation",
		group: "Select",
		keys: "x",
		when: (e) => e.cursor !== null,
		run: (e) => {
			let t = e.current;
			t && e.toggle(t.thread);
		}
	},
	{
		id: "select-down",
		title: "Check and go down",
		group: "Select",
		keys: "shift+j, shift+arrowdown",
		run: (e) => {
			let t = e.current;
			t && !e.checked.includes(t.thread) && e.toggle(t.thread), e.move(1);
			let n = e.current;
			n && !e.checked.includes(n.thread) && e.toggle(n.thread);
		}
	},
	{
		id: "select-up",
		title: "Check and go up",
		group: "Select",
		keys: "shift+k, shift+arrowup",
		run: (e) => {
			let t = e.current;
			t && !e.checked.includes(t.thread) && e.toggle(t.thread), e.move(-1);
			let n = e.current;
			n && !e.checked.includes(n.thread) && e.toggle(n.thread);
		}
	},
	{
		id: "select-all",
		title: "Check all",
		group: "Select",
		keys: "* a, ctrl+a",
		run: (e) => e.selectWhere("all")
	},
	{
		id: "select-none",
		title: "Check none",
		group: "Select",
		keys: "* n",
		run: (e) => e.selectWhere("none")
	},
	{
		id: "select-unread",
		title: "Check the unread",
		group: "Select",
		keys: "* u",
		run: (e) => e.selectWhere("unread")
	},
	{
		id: "select-read",
		title: "Check the read",
		group: "Select",
		keys: "* r",
		run: (e) => e.selectWhere("read")
	},
	{
		id: "select-starred",
		title: "Check the starred",
		group: "Select",
		keys: "* s",
		run: (e) => e.selectWhere("starred")
	},
	{
		id: "palette",
		title: "All commands…",
		group: "Pane",
		keys: "ctrl+k",
		run: (e, t) => t.palette()
	},
	{
		id: "help",
		title: "Keyboard shortcuts",
		group: "Pane",
		keys: "?",
		run: (e, t) => t.help()
	},
	{
		id: "refresh",
		title: "Check for new mail",
		group: "Pane",
		keys: "shift+g",
		run: async (e) => {
			e.toast("Checking for new mail…"), await e.call("sync", {}, 600), e.later();
		}
	},
	{
		id: "rules",
		title: "Rules…",
		group: "Pane",
		run: (e, t) => t.rules()
	},
	{
		id: "layout",
		title: "Change the layout",
		group: "Pane",
		run: (e, t) => t.layout()
	},
	{
		id: "settings",
		title: "Email settings…",
		group: "Pane",
		run: (e) => e.atlas.plugin.openSettings()
	}
];
function _n(e) {
	let t = (e.key.length, e.key.toLowerCase()), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var vn = new Map(gn.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e]))), yn = new Set([...vn.keys()].filter((e) => e.includes(" ")).map((e) => e.split(" ")[0]));
function bn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.split(" ").map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowdown", "↓").replace("arrowup", "↑").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("home", "Home").replace("end", "End").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)).join(" then ")) : [];
}
//#endregion
//#region plugins/stable/email/ui/src/Shortcuts.svelte
var xn = C("<span class=\"or svelte-8ls7cr\">or</span>"), Sn = C("<!><kbd class=\"svelte-8ls7cr\"> </kbd>", 1), Cn = C("<div class=\"line svelte-8ls7cr\"><span> </span><span class=\"keys svelte-8ls7cr\"></span></div>"), wn = C("<section class=\"svelte-8ls7cr\"><h3 class=\"svelte-8ls7cr\"> </h3> <!></section>"), Tn = C("<div class=\"scrim svelte-8ls7cr\" role=\"presentation\"><div class=\"sheet svelte-8ls7cr\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Keyboard shortcuts\" tabindex=\"-1\"><header class=\"svelte-8ls7cr\"><h2 class=\"svelte-8ls7cr\">Keyboard shortcuts</h2><span class=\"faint svelte-8ls7cr\">Ctrl+K finds any command by name</span><button class=\"x svelte-8ls7cr\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-8ls7cr\"></div></div></div>"), En = {
	hash: "svelte-8ls7cr",
	code: ".scrim.svelte-8ls7cr {position:absolute;inset:0;z-index:60;background:rgba(0, 0, 0, 0.35);display:grid;place-items:center;padding:16px;}.sheet.svelte-8ls7cr {background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-lg);box-shadow:var(--shadow-md, var(--shadow-sm));width:min(980px, 100%);max-height:90%;overflow:auto;padding:18px 22px 22px;}header.svelte-8ls7cr {display:flex;gap:14px;align-items:baseline;margin-bottom:12px;}h2.svelte-8ls7cr {margin:0;font-size:1.15em;}.faint.svelte-8ls7cr {color:var(--text-faint);font-size:0.9em;}.x.svelte-8ls7cr {all:unset;cursor:pointer;margin-left:auto;font-size:1.4em;color:var(--text-muted);padding:0 6px;}.cols.svelte-8ls7cr {columns:3 260px;column-gap:28px;}section.svelte-8ls7cr {break-inside:avoid;margin-bottom:16px;}h3.svelte-8ls7cr {margin:0 0 6px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.line.svelte-8ls7cr {display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:0.92em;}.keys.svelte-8ls7cr {display:flex;gap:4px;align-items:center;flex:none;}.or.svelte-8ls7cr {color:var(--text-faint);font-size:0.8em;}kbd.svelte-8ls7cr {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:5px;border:1px solid var(--border-strong);border-bottom-width:2px;background:var(--bg);}"
};
function Dn(e, t) {
	M(t, !0), g(e, En);
	let r = [...new Set(gn.map((e) => e.group))];
	var i = Tn(), a = N(i), o = N(a), s = Y(N(o), 2);
	q(o);
	var u = Y(o, 2);
	l(u, 20, () => r, (e) => e, (e, t) => {
		var r = wn(), i = N(r), a = G(i, !0), o = Y(i, 2);
		l(o, 17, () => gn.filter((e) => e.group === t && e.keys), (e) => e.id, (e, t) => {
			var r = Cn(), i = N(r), a = G(i, !0), o = Y(i);
			l(o, 22, () => bn(T(t).keys), (e) => e, (e, t, r) => {
				var i = Sn(), a = Z(i), o = (e) => {
					var t = xn();
					c(e, t);
				};
				v(a, (e) => {
					T(r) && e(o);
				});
				var s = Y(a), l = G(s, !0);
				E(() => n(l, t)), c(e, i);
			}), q(o), q(r), E(() => n(a, T(t).title)), c(e, r);
		}), q(r), E(() => n(a, t)), c(e, r);
	}), q(u), q(a), q(i), J("click", i, function(...e) {
		t.onclose?.apply(this, e);
	}), J("keydown", i, (e) => e.key === "Escape" && t.onclose()), J("click", a, (e) => e.stopPropagation()), J("keydown", a, () => {}), J("click", s, function(...e) {
		t.onclose?.apply(this, e);
	}), c(e, i), ce();
}
d(["click", "keydown"]);
//#endregion
//#region plugins/stable/email/ui/src/store.svelte.ts
var On = 100, kn = class {
	atlas;
	#e = K(z([]));
	get accounts() {
		return T(this.#e);
	}
	set accounts(e) {
		O(this.#e, e, !0);
	}
	#t = K(z([]));
	get own() {
		return T(this.#t);
	}
	set own(e) {
		O(this.#t, e, !0);
	}
	#n = K(z([]));
	get folders() {
		return T(this.#n);
	}
	set folders(e) {
		O(this.#n, e, !0);
	}
	#r = K(z({}));
	get counts() {
		return T(this.#r);
	}
	set counts(e) {
		O(this.#r, e, !0);
	}
	#i = K(z({
		name: "inbox",
		account: null,
		folder: null,
		label: "Inbox"
	}));
	get view() {
		return T(this.#i);
	}
	set view(e) {
		O(this.#i, e, !0);
	}
	#a = K("");
	get query() {
		return T(this.#a);
	}
	set query(e) {
		O(this.#a, e, !0);
	}
	#o = K("");
	get quick() {
		return T(this.#o);
	}
	set quick(e) {
		O(this.#o, e, !0);
	}
	#s = K("");
	get kind() {
		return T(this.#s);
	}
	set kind(e) {
		O(this.#s, e, !0);
	}
	#c = K(z([]));
	get rows() {
		return T(this.#c);
	}
	set rows(e) {
		O(this.#c, e, !0);
	}
	#l = K(0);
	get total() {
		return T(this.#l);
	}
	set total(e) {
		O(this.#l, e, !0);
	}
	#u = K(0);
	get unread() {
		return T(this.#u);
	}
	set unread(e) {
		O(this.#u, e, !0);
	}
	#d = K(z([]));
	get chips() {
		return T(this.#d);
	}
	set chips(e) {
		O(this.#d, e, !0);
	}
	#f = K(!1);
	get loading() {
		return T(this.#f);
	}
	set loading(e) {
		O(this.#f, e, !0);
	}
	#p = K("");
	get error() {
		return T(this.#p);
	}
	set error(e) {
		O(this.#p, e, !0);
	}
	#m = K(null);
	get cursor() {
		return T(this.#m);
	}
	set cursor(e) {
		O(this.#m, e, !0);
	}
	#h = K(z([]));
	get checked() {
		return T(this.#h);
	}
	set checked(e) {
		O(this.#h, e, !0);
	}
	#g = K(null);
	get open() {
		return T(this.#g);
	}
	set open(e) {
		O(this.#g, e, !0);
	}
	#_ = K(null);
	get openId() {
		return T(this.#_);
	}
	set openId(e) {
		O(this.#_, e, !0);
	}
	#v = K(!1);
	get reading() {
		return T(this.#v);
	}
	set reading(e) {
		O(this.#v, e, !0);
	}
	#y = K("");
	get readError() {
		return T(this.#y);
	}
	set readError(e) {
		O(this.#y, e, !0);
	}
	#b = K(z([]));
	get composers() {
		return T(this.#b);
	}
	set composers(e) {
		O(this.#b, e, !0);
	}
	#x = K(z([]));
	get toasts() {
		return T(this.#x);
	}
	set toasts(e) {
		O(this.#x, e, !0);
	}
	undos = [];
	seq = 1;
	loadSeq = 0;
	ended = !1;
	fetchingMore = !1;
	asking = /* @__PURE__ */ new Set();
	timer;
	constructor(e) {
		this.atlas = e;
	}
	call(e, t = {}, n = 120) {
		return H(this.atlas, e, t, n);
	}
	get split() {
		return I(this.atlas, "split_inbox", !1) && this.view.name === "inbox";
	}
	async start() {
		try {
			let e = await this.call("watch");
			this.accounts = e.accounts, this.own = e.own;
		} catch (e) {
			this.error = e.message;
		}
		await Promise.all([this.loadFolders(), this.load()]), this.loadCounts();
	}
	async loadAccounts() {
		try {
			let e = await this.call("accounts");
			this.accounts = e.accounts, this.own = e.own;
		} catch {}
	}
	async loadFolders() {
		try {
			this.folders = (await this.call("folders")).folders;
		} catch {}
	}
	async loadCounts() {
		try {
			this.counts = await this.call("count");
		} catch {}
	}
	params(e = {}) {
		let t = this.view;
		return {
			view: t.name === "folder" ? "" : t.name,
			account: t.account ?? "",
			folder: t.folder ?? "",
			query: this.query,
			quick: this.quick,
			kind: this.split ? this.kind || "person" : "",
			pin: this.pinning,
			...e
		};
	}
	get pinning() {
		return this.view.name === "inbox" && !this.query && !this.quick;
	}
	async load(e = !1) {
		let t = ++this.loadSeq;
		this.loading = !0;
		try {
			let n = e ? Math.max(On, this.rows.length) : On, r = await this.call("list", this.params({ limit: n }));
			if (t !== this.loadSeq) return;
			this.rows = r.rows, this.ended = r.rows.length < n, this.total = r.total, this.unread = r.unread, this.chips = r.chips, this.error = "", (this.cursor === null || !this.rows.some((e) => e.id === this.cursor)) && (this.cursor = this.rows[0]?.id ?? null), this.checked = this.checked.filter((e) => this.rows.some((t) => t.thread === e)), this.fillSnippets();
		} catch (e) {
			t === this.loadSeq && (this.error = e.message);
		} finally {
			t === this.loadSeq && (this.loading = !1);
		}
	}
	async more() {
		if (this.loading || this.fetchingMore || this.ended || this.rows.length >= this.total) return;
		this.fetchingMore = !0;
		let e = this.loadSeq;
		try {
			let t = await this.call("list", this.params({
				limit: On,
				offset: this.rows.length
			}));
			if (e !== this.loadSeq) return;
			let n = new Set(this.rows.map((e) => e.thread)), r = t.rows.filter((e) => !n.has(e.thread));
			(t.rows.length < On || !r.length) && (this.ended = !0), r.length && (this.rows = [...this.rows, ...r], this.fillSnippets());
		} finally {
			this.fetchingMore = !1;
		}
	}
	async fillSnippets(e = this.rows) {
		let t = e.filter((e) => e.snippet_missing && !this.asking.has(e.id)).slice(0, 40).map((e) => e.id);
		if (t.length) {
			for (let e of t) this.asking.add(e);
			try {
				let e = await this.call("snippets", { ids: t });
				for (let t of this.rows) {
					let n = e[String(t.id)];
					n && (t.snippet = n.snippet, t.has_attachments = n.has_attachments, t.snippet_missing = !1);
				}
			} catch {} finally {
				for (let e of t) this.asking.delete(e);
			}
		}
	}
	later(e = "all") {
		clearTimeout(this.timer), this.timer = setTimeout(() => {
			this.load(!0), this.loadCounts(), e === "all" && (this.loadFolders(), this.loadAccounts());
		}, 250);
	}
	go(e) {
		this.view = e, this.query = "", this.quick = "", this.kind = "", this.checked = [], this.cursor = null, this.load();
	}
	search(e) {
		this.query = e, this.load();
	}
	index(e = this.cursor) {
		return this.rows.findIndex((t) => t.id === e);
	}
	get current() {
		return this.rows.find((e) => e.id === this.cursor) ?? null;
	}
	move(e) {
		if (!this.rows.length) return;
		let t = Math.max(0, Math.min(this.rows.length - 1, this.index() + e));
		this.cursor = this.rows[t].id, t > this.rows.length - 10 && this.more();
	}
	async read(e) {
		this.cursor = e, this.openId = e, this.reading = !0, this.readError = "";
		let t = this.rows.find((t) => t.id === e);
		t && t.unread && (t.unread = 0, this.unread = Math.max(0, this.unread - 1));
		try {
			let t = await this.call("thread", {
				id: e,
				read: !0
			});
			this.openId === e && (this.open = t);
		} catch (t) {
			this.openId === e && (this.readError = t.message, this.open = null);
		} finally {
			this.openId === e && (this.reading = !1);
		}
	}
	close() {
		this.openId = null, this.open = null;
	}
	targets() {
		if (this.checked.length) return this.rows.filter((e) => this.checked.includes(e.thread));
		let e = this.openId ?? this.cursor, t = this.rows.find((t) => t.id === e);
		return t ? [t] : this.open ? [{
			id: this.open.messages.at(-1).id,
			thread: this.open.thread
		}] : [];
	}
	toggle(e) {
		this.checked = this.checked.includes(e) ? this.checked.filter((t) => t !== e) : [...this.checked, e];
	}
	extend(e) {
		let t = this.index(), n = this.rows.findIndex((t) => t.id === e);
		if (t < 0 || n < 0) return;
		let [r, i] = t < n ? [t, n] : [n, t], a = this.rows.slice(r, i + 1).map((e) => e.thread);
		this.checked = [.../* @__PURE__ */ new Set([...this.checked, ...a])], this.cursor = e;
	}
	selectWhere(e) {
		let t = {
			all: () => !0,
			none: () => !1,
			read: (e) => !e.unread,
			unread: (e) => e.unread > 0,
			starred: (e) => e.flagged
		}[e];
		this.checked = this.rows.filter(t).map((e) => e.thread);
	}
	toast(e, t = "info", n = {}) {
		let r = {
			id: this.seq++,
			text: e,
			kind: t,
			until: Date.now() + (t === "error" ? 9e3 : 6e3),
			...n
		};
		return this.toasts = [...this.toasts.slice(-3), r], setTimeout(() => this.toasts = this.toasts.filter((e) => e.id !== r.id), r.until - Date.now()), r;
	}
	dismiss(e) {
		this.toasts = this.toasts.filter((t) => t.id !== e);
	}
	async undo() {
		let e = this.undos.pop();
		if (!e) {
			this.toast("Nothing to undo");
			return;
		}
		try {
			await e.run(), this.toast(`Undone: ${e.label}`, "success");
		} catch (e) {
			this.toast(`Could not undo: ${e.message}`, "error");
		}
		this.later();
	}
	async leave(e, t, n) {
		if (!e.length) return;
		let r = e.map((e) => e.id), i = new Set(e.map((e) => e.thread)), a = this.rows, o = Math.max(0, this.index(e[0].id)), s = this.openId !== null && e.some((e) => e.id === this.openId || e.thread === this.open?.thread);
		this.rows = this.rows.filter((e) => !i.has(e.thread)), this.total = Math.max(0, this.total - e.length), this.checked = [];
		let c = this.rows[Math.min(o, this.rows.length - 1)] ?? null;
		this.cursor = c?.id ?? null, s && (c && I(this.atlas, "after_action", "next") === "next" ? this.read(c.id) : this.close());
		try {
			let i = (await n(r)).moved ?? [], a = e.length, o = async () => {
				await this.call("undo", { moved: i });
			};
			i.length && this.undos.push({
				label: `${t} ${a === 1 ? "conversation" : `${a} conversations`}`,
				run: o
			}), this.toast(`${t} ${a === 1 ? "1 conversation" : `${a} conversations`}`, "info", i.length ? { undo: async () => {
				this.undos = this.undos.filter((e) => e.run !== o), await o(), this.later();
			} } : {}), this.loadCounts();
		} catch (e) {
			this.rows = a, this.toast(`${t} failed: ${e.message}`, "error");
		}
	}
	archive(e = this.targets()) {
		return this.leave(e, "Archived", (e) => this.call("archive", { ids: e }));
	}
	async trash(e = this.targets()) {
		let t = e.every((e) => e.folder_role === "trash");
		if (!t || await A(this.atlas, `Delete ${e.length === 1 ? "this conversation" : `${e.length} conversations`} for good? This cannot be undone.`, {
			ok: "Delete for good",
			danger: !0
		})) return this.leave(e, t ? "Deleted" : "Moved to Trash", (e) => this.call("trash", { ids: e }));
	}
	spam(e = this.targets()) {
		let t = e.every((e) => e.folder_role === "junk");
		return this.leave(e, t ? "Not spam:" : "Spam:", (e) => this.call(t ? "not_spam" : "spam", { ids: e }));
	}
	moveTo(e, t, n = this.targets()) {
		return this.leave(n, `Moved to ${t}:`, (t) => this.call("move", {
			ids: t,
			to: e
		}));
	}
	moveRole(e, t, n = this.targets()) {
		return this.leave(n, `Moved to ${t}:`, (t) => this.call("move", {
			ids: t,
			role: e
		}));
	}
	snooze(e, t = this.targets()) {
		let n = (/* @__PURE__ */ new Date(e * 1e3)).toLocaleString(void 0, {
			weekday: "short",
			day: "numeric",
			month: "short",
			hour: "2-digit",
			hourCycle: "h23",
			minute: "2-digit"
		});
		return this.leave(t, `Snoozed until ${n}:`, (t) => this.call("snooze", {
			ids: t,
			until: e
		}));
	}
	unsnooze(e = this.targets()) {
		return this.leave(e, "Back in the inbox:", (e) => this.call("unsnooze", { ids: e }));
	}
	snoozeDefault() {
		return this.snooze(le()[0].at);
	}
	async mark(e, t, n = this.targets()) {
		if (!n.length) return;
		let r = n.map((e) => ({
			r: e,
			unread: e.unread,
			flagged: e.flagged
		}));
		for (let r of n) e === "read" ? r.unread = t ? 0 : Math.max(1, r.unread) : r.flagged = t;
		if (this.open && n.some((e) => e.thread === this.open.thread)) {
			let n = this.open.messages.at(-1);
			for (let r of this.open.messages) e === "read" ? r.seen = t : (!t || r === n) && (r.flagged = t);
		}
		try {
			await this.call("mark", {
				ids: n.map((e) => e.id),
				[e]: t
			});
			let r = e === "read" ? t ? "Marked read" : "Marked unread" : t ? "Starred" : "Unstarred";
			this.undos.push({
				label: r,
				run: async () => {
					await this.call("mark", {
						ids: n.map((e) => e.id),
						[e]: !t
					});
				}
			}), this.loadCounts();
		} catch (e) {
			for (let e of r) e.r.unread = e.unread, e.r.flagged = e.flagged;
			this.toast(`Could not change it: ${e.message}`, "error");
		}
	}
	toggleRead(e = this.targets()) {
		return this.mark("read", e.some((e) => e.unread > 0), e);
	}
	toggleStar(e = this.targets()) {
		return this.mark("starred", !e.some((e) => e.flagged), e);
	}
	async label(e, t, n = this.targets()) {
		try {
			await this.call("label", {
				ids: n.map((e) => e.id),
				add: e,
				remove: t
			});
			for (let r of n) r.labels = [.../* @__PURE__ */ new Set([...r.labels.filter((e) => !t.includes(e)), ...e])].sort();
			this.undos.push({
				label: "Labels",
				run: async () => {
					await this.call("label", {
						ids: n.map((e) => e.id),
						add: t,
						remove: e
					});
				}
			});
		} catch (e) {
			this.toast(`Could not label: ${e.message}`, "error");
		}
	}
	async importance(e, t = this.targets()) {
		for (let n of t) try {
			await this.call("set_importance", {
				id: n.id,
				account: n.account,
				important: !!e,
				clear: e === null
			});
		} catch (e) {
			this.toast(`Could not mark it: ${e.message}`, "error");
			return;
		}
		this.toast(e ? "Marked important" : e === null ? "Importance cleared" : "Moved to Not important"), this.later();
	}
	async saveNote(e = this.open?.thread ?? this.targets()[0]?.thread) {
		if (e !== void 0) try {
			let t = await this.call("save_note", { thread: e });
			this.open?.thread === e && (this.open.saved = t.path);
			let n = this.rows.find((t) => t.thread === e);
			n && (n.saved = t.path), this.toast("Saved as a note", "success", { action: {
				label: "Open",
				run: () => this.atlas.open(t.path, void 0, { beside: !0 })
			} });
		} catch (e) {
			this.toast(`Could not save it: ${e.message}`, "error");
		}
	}
	compose(e = {}, t = !1) {
		let n = {
			account: e.account ?? this.view.account ?? this.accounts.find((e) => e.main)?.name ?? this.accounts[0]?.name ?? "",
			from: "",
			to: "",
			cc: "",
			bcc: "",
			subject: "",
			body: "",
			reply_to: null,
			forward: null,
			files: [],
			draft: null,
			send_at: null,
			...e
		};
		t && (this.composers = this.composers.filter((e) => !e.inline));
		let r = {
			key: this.seq++,
			draft: n,
			inline: t,
			saving: !1,
			savedAt: null,
			sending: !1,
			error: "",
			dirty: !1
		};
		return this.composers = [...this.composers, r], r;
	}
	async reply(e, t = this.open?.messages.at(-1)?.id ?? this.cursor, n = !0) {
		if (t) try {
			let r = await this.call("compose_for", {
				id: t,
				mode: e
			});
			this.compose(r, n);
		} catch (t) {
			this.toast(`Cannot ${e === "forward" ? "forward" : "reply"}: ${t.message}`, "error");
		}
	}
	async editDraft(e) {
		try {
			let t = await this.call("open_draft", { id: e });
			this.compose(t, !1);
		} catch (e) {
			this.toast(`Cannot open the draft: ${e.message}`, "error");
		}
	}
	closeComposer(e) {
		this.composers = this.composers.filter((t) => t.key !== e);
	}
}, An = C("<div class=\"grip v svelte-7si10b\" role=\"separator\" aria-orientation=\"vertical\" aria-label=\"Resize the folders\"></div>"), jn = C("<aside class=\"side svelte-7si10b\" aria-label=\"Folders\"><!> <!></aside>"), Mn = C("<button class=\"tool svelte-7si10b\" title=\"Folders\"><!></button>"), Nn = C("<button class=\"tool svelte-7si10b\" aria-label=\"Clear the search\"><!></button>"), Pn = C("<span class=\"chip svelte-7si10b\"><b class=\"svelte-7si10b\"> </b> </span>"), Fn = C("<button class=\"link svelte-7si10b\">Search the servers too ↵</button>"), In = C("<div class=\"chips svelte-7si10b\"><!><!></div>"), Ln = C("<div class=\"selbar svelte-7si10b\" role=\"toolbar\" aria-label=\"Checked conversations\"><button class=\"tool svelte-7si10b\" title=\"Uncheck all (Esc)\"><!></button> <b> </b> <span class=\"grow svelte-7si10b\"></span> <button class=\"tool svelte-7si10b\" title=\"Archive (e)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Delete (#)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Mark read (⇧I)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Mark unread (⇧U)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Star (s)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Snooze (h)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Move (v)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Label (l)\"><!></button></div>"), Rn = C("<span class=\"n svelte-7si10b\"> </span>"), zn = C("<button role=\"tab\"><!> <!></button>"), Bn = C("<div class=\"tabs svelte-7si10b\" role=\"tablist\"></div>"), Vn = C("<div class=\"row2 svelte-7si10b\"><h1 class=\"svelte-7si10b\"> </h1> <span class=\"faint svelte-7si10b\"> </span> <span class=\"grow svelte-7si10b\"></span> <div class=\"seg svelte-7si10b\" role=\"group\" aria-label=\"Show only\"><button>Unread</button> <button>Starred</button> <button>Files</button> <button title=\"Mail where I am on To\">To me</button></div></div> <!>", 1), Hn = C("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), Un = C("<p class=\"svelte-7si10b\">Nothing in the index matches.</p><button class=\"atlas-btn\">Search the servers too</button>", 1), Wn = C("<p class=\"svelte-7si10b\">No mail account yet.</p><button class=\"atlas-btn\">Add an account…</button>", 1), Gn = C("<p class=\"zero svelte-7si10b\">Inbox zero.</p><p class=\"faint svelte-7si10b\">Nothing to answer. c writes a new message.</p>", 1), Kn = C("<p class=\"faint svelte-7si10b\"> </p>"), qn = C("<div class=\"empty svelte-7si10b\"><!></div>"), Jn = C("<section class=\"listpane svelte-7si10b\"><header class=\"lhead svelte-7si10b\"><div class=\"row1 svelte-7si10b\"><!> <div class=\"search svelte-7si10b\"><!> <input placeholder=\"Search mail…\" aria-label=\"Search mail\" title=\"Words, or from: to: subject: has:attachment is:unread before: after:\" class=\"svelte-7si10b\"/> <!></div> <button class=\"tool svelte-7si10b\" title=\"Check for new mail (⇧G)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Layout and density\"><!></button> <button class=\"tool svelte-7si10b\" title=\"All commands (Ctrl+K)\"><!></button></div> <!> <!></header> <!></section>"), Yn = C("<div role=\"separator\" aria-label=\"Resize the list\"></div>"), Xn = C("<div class=\"readerpane svelte-7si10b\"><!></div>"), Zn = C("<div><!> <!> <!></div>"), Qn = C("<div class=\"win svelte-7si10b\"><!></div>"), $n = C("<div></div>"), er = C("<div class=\"pending svelte-7si10b\"> </div>"), tr = C("<div><!> <!> <!> <!> <!> <!></div>"), nr = {
	hash: "svelte-7si10b",
	code: ".mail.svelte-7si10b {position:relative;height:100%;display:flex;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.side.svelte-7si10b {position:relative;flex:none;width:var(--side-w);border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.narrow.svelte-7si10b .side:where(.svelte-7si10b) {width:100%;}.work.svelte-7si10b {flex:1;min-width:0;display:flex;min-height:0;}.work.below.svelte-7si10b {flex-direction:column;}.listpane.svelte-7si10b {flex:none;width:var(--list-w);display:flex;flex-direction:column;min-height:0;min-width:0;border-right:1px solid var(--border);}.below.svelte-7si10b .listpane:where(.svelte-7si10b) {width:auto;height:var(--list-h);border-right:0;border-bottom:1px solid var(--border);}.full.svelte-7si10b .listpane:where(.svelte-7si10b) {flex:1;width:auto;border-right:0;}.readerpane.svelte-7si10b {flex:1;min-width:0;min-height:0;container-type:inline-size;}.grip.svelte-7si10b {flex:none;background:transparent;position:relative;z-index:3;}.grip.v.svelte-7si10b {width:5px;margin:0 -3px;cursor:col-resize;}.grip.h.svelte-7si10b {height:5px;margin:-3px 0;cursor:row-resize;}.side.svelte-7si10b .grip.v:where(.svelte-7si10b) {position:absolute;top:0;bottom:0;right:-3px;margin:0;}.grip.svelte-7si10b:hover {background:var(--accent-soft);}.lhead.svelte-7si10b {flex:none;padding:8px 10px 6px;display:grid;gap:6px;border-bottom:1px solid var(--border);}.row1.svelte-7si10b, .row2.svelte-7si10b, .selbar.svelte-7si10b, .chips.svelte-7si10b {display:flex;align-items:center;gap:6px;min-width:0;}.search.svelte-7si10b {flex:1;min-width:0;display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 6px 0 10px;color:var(--text-faint);}.search.svelte-7si10b:focus-within {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-7si10b input:where(.svelte-7si10b) {all:unset;flex:1;min-width:0;padding:7px 0;color:var(--text);}.search.svelte-7si10b input:where(.svelte-7si10b)::placeholder {color:var(--text-faint);}h1.svelte-7si10b {margin:0;font-size:1.05em;font-weight:650;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:4.5em;}.row2.svelte-7si10b {flex-wrap:wrap;row-gap:4px;}.faint.svelte-7si10b {color:var(--text-faint);font-size:0.86em;white-space:nowrap;}.grow.svelte-7si10b {flex:1;}.seg.svelte-7si10b {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-7si10b button:where(.svelte-7si10b) {all:unset;cursor:pointer;padding:3px 8px;font-size:0.82em;color:var(--text-muted);}.seg.svelte-7si10b button:where(.svelte-7si10b) + button:where(.svelte-7si10b) {border-left:1px solid var(--border);}.seg.svelte-7si10b button:where(.svelte-7si10b):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-7si10b button.on:where(.svelte-7si10b) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.seg.svelte-7si10b button:where(.svelte-7si10b):focus-visible, .tabs.svelte-7si10b button:where(.svelte-7si10b):focus-visible, .tool.svelte-7si10b:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.tabs.svelte-7si10b {display:flex;gap:2px;margin-bottom:-7px;}.tabs.svelte-7si10b button:where(.svelte-7si10b) {all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px 7px;color:var(--text-muted);border-bottom:2px solid transparent;font-size:0.92em;}.tabs.svelte-7si10b button:where(.svelte-7si10b):hover {color:var(--text);}.tabs.svelte-7si10b button.on:where(.svelte-7si10b) {color:var(--accent-strong);border-bottom-color:var(--accent);font-weight:600;}.n.svelte-7si10b {font-size:0.8em;padding:0 6px;border-radius:999px;background:var(--accent);color:var(--accent-fg);}.chips.svelte-7si10b {flex-wrap:wrap;}.chip.svelte-7si10b {font-size:0.82em;padding:1px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent-strong);}.chip.svelte-7si10b b:where(.svelte-7si10b) {font-weight:600;margin-right:2px;}.link.svelte-7si10b {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;}.selbar.svelte-7si10b {background:var(--accent-soft);border-radius:var(--radius-sm);padding:2px 4px;}.tool.svelte-7si10b {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-7si10b:hover {background:var(--bg-hover);color:var(--text);}.empty.svelte-7si10b {flex:1;display:grid;align-content:center;justify-items:center;gap:8px;padding:30px;text-align:center;color:var(--text-muted);}.empty.svelte-7si10b p:where(.svelte-7si10b) {margin:0;}.zero.svelte-7si10b {font-size:1.3em;font-weight:600;color:var(--heading);}.windows.svelte-7si10b {position:absolute;right:16px;bottom:0;z-index:40;display:flex;gap:12px;align-items:flex-end;max-width:calc(100% - 32px);}.win.svelte-7si10b {width:min(560px, calc(100vw - 32px));max-height:85%;overflow:auto;border-radius:var(--radius) var(--radius) 0 0;box-shadow:var(--shadow-md, 0 8px 30px rgba(0, 0, 0, 0.3));}.windows.big.svelte-7si10b {inset:12px;right:12px;bottom:12px;}.windows.big.svelte-7si10b .win:where(.svelte-7si10b) {width:100%;height:100%;max-height:none;border-radius:var(--radius);}.pending.svelte-7si10b {position:absolute;right:16px;top:12px;z-index:30;font:600 0.9em var(--font-mono);padding:4px 10px;border-radius:var(--radius-sm);background:var(--bg-elev);border:1px solid var(--border-strong);}\n  @container (max-width: 900px) {.seg.svelte-7si10b {display:none;} }"
};
function rr(t, r) {
	M(r, !0), g(t, nr);
	let o = new kn(r.atlas), s = (e, t) => {
		try {
			return localStorage.getItem(`atlas-email-${e}`) ?? t;
		} catch {
			return t;
		}
	}, d = (e, t) => {
		try {
			localStorage.setItem(`atlas-email-${e}`, t);
		} catch {}
	}, f = K(z(s("layout", String(r.atlas.plugin.settings.layout ?? "three")))), _ = K(s("density", String(r.atlas.plugin.settings.density ?? "comfortable")) === "compact"), x = K(z(Number(s("side-w", "232")))), S = K(z(Number(s("list-w", "420")))), C = K(z(Number(s("list-h", "320")))), w = K(1200), D = K("list"), k = K(!1), A = K(document.documentElement.dataset.theme !== "light"), j = K(void 0), P = K(void 0), I = K(""), L = K(!1), R = X(() => T(w) < 700), B = X(() => !T(R) && T(w) < 1100), V = X(() => T(w) - (T(B) ? 56 : T(x)) - T(S) >= 460), H = X(() => T(R) || T(f) === "three" && !T(V) ? "full" : T(f)), te = X(() => T(H) !== "full" || o.openId !== null || o.reading), ne = X(() => o.composers.filter((e) => !e.inline));
	function re() {
		if (T(k)) {
			O(k, !1);
			return;
		}
		if (o.checked.length) {
			o.checked = [];
			return;
		}
		if (o.openId !== null) {
			o.close(), O(D, "list");
			return;
		}
		if (o.query) {
			O(I, ""), o.search("");
			return;
		}
	}
	function ie(e) {
		if (e.draft && e.count === 1) {
			o.editDraft(e.id);
			return;
		}
		o.read(e.id), T(R) && O(D, "reader");
	}
	let oe = () => o.targets()[0]?.account ?? o.view.account ?? o.accounts[0]?.name;
	function se(e) {
		if (e === "snooze") r.atlas.pick({
			placeholder: "Snooze until… (tomorrow 9, mon 14:00, 3h, 2026-11-02 08:00)",
			tag: "Snooze",
			items: le().map((e) => ({
				value: String(e.at),
				title: e.label
			})),
			typed: (e) => {
				let t = U(e);
				return t ? `Until ${(/* @__PURE__ */ new Date(t * 1e3)).toLocaleString(void 0, {
					weekday: "short",
					day: "numeric",
					month: "short",
					hour: "2-digit",
					hourCycle: "h23",
					minute: "2-digit"
				})}` : "Type a time: tomorrow 9, mon 14:00, 3h";
			},
			onpick: (e, t) => {
				let n = t ? U(e) : Number(e);
				n && o.snooze(n);
			}
		});
		else if (e === "move" || e === "go") {
			let t = e === "move" ? oe() : null, n = o.folders.filter((e) => (!t || e.account === t) && e.role !== "other" && e.role !== "view" && e.role !== "all");
			r.atlas.pick({
				placeholder: e === "move" ? "Move to which folder?" : "Go to which folder?",
				tag: e === "move" ? "Move" : "Go to",
				items: n.map((e) => ({
					value: `${e.account}\u0000${e.path}`,
					title: e.label,
					detail: o.accounts.length > 1 ? e.account : e.role ?? void 0,
					section: o.accounts.length > 1 ? e.account : void 0
				})),
				typed: e === "move" ? (e) => `New folder “${e}”` : void 0,
				onpick: async (n, r) => {
					if (r && e === "move") {
						try {
							let e = await o.call("folder_create", {
								account: t,
								name: n
							});
							await o.loadFolders(), o.moveTo(e.path, n);
						} catch (e) {
							o.toast(`No folder made: ${e.message}`, "error");
						}
						return;
					}
					let [i, a] = n.split("\0"), s = o.folders.find((e) => e.account === i && e.path === a);
					e === "move" ? o.moveTo(a, s?.label ?? a) : o.go({
						name: "folder",
						account: i,
						folder: a,
						label: s?.label ?? a
					});
				}
			});
		} else if (e === "label") {
			let e = new Set(o.rows.flatMap((e) => e.labels)), t = new Set(o.targets().flatMap((e) => e.labels));
			r.atlas.pick({
				placeholder: "Label… (a label it has is taken off)",
				tag: "Label",
				items: [...e].sort().map((e) => ({
					value: e,
					title: e.replace(/^\$/, ""),
					detail: t.has(e) ? "on it — pick to take it off" : void 0
				})),
				typed: (e) => `New label “${e}”`,
				onpick: (e) => t.has(e) ? o.label([], [e]) : o.label([e], [])
			});
		} else r.atlas.pick({
			placeholder: "Write from a template… (notes in mail/templates/)",
			tag: "Template",
			items: async () => (await o.call("templates")).templates.map((e) => ({
				value: JSON.stringify(e),
				title: e.name,
				detail: e.subject
			})),
			onpick: (e) => {
				let t = JSON.parse(e);
				o.compose({
					subject: t.subject ?? "",
					to: t.to ?? "",
					cc: t.cc ?? "",
					body: t.body
				});
			}
		});
	}
	function de() {
		r.atlas.pick({
			placeholder: "Do what? (every command of the Email pane)",
			tag: "Email",
			items: gn.filter((e) => e.id !== "palette" && (!e.when || e.when(o))).map((e) => ({
				value: e.id,
				title: e.title,
				detail: bn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => gn.find((t) => t.id === e)?.run(o, pe)
		});
	}
	function fe() {
		r.atlas.pick({
			placeholder: "Layout of the Email pane",
			tag: "Layout",
			items: [
				{
					value: "three",
					title: "Three panes",
					detail: "folders, list, reader side by side"
				},
				{
					value: "below",
					title: "Reader below the list",
					detail: "the list on top, the message under it"
				},
				{
					value: "full",
					title: "List, then message",
					detail: "the message opens over the list; u goes back"
				},
				{
					value: T(_) ? "comfortable" : "compact",
					title: T(_) ? "Comfortable rows" : "Compact rows",
					detail: T(_) ? "two lines with a preview" : "one line each, more on screen"
				}
			],
			onpick: (e) => {
				e === "compact" || e === "comfortable" ? (O(_, e === "compact"), d("density", e)) : (O(f, e, !0), d("layout", e));
			}
		});
	}
	let pe = {
		pick: se,
		palette: de,
		back: re,
		focusSearch: () => {
			T(j)?.focus(), T(j)?.select();
		},
		help: () => O(k, !T(k)),
		expandAll: (e) => T(P)?.expandAll(e),
		rules: () => typeof r.atlas.openDialog == "function" ? void r.atlas.openDialog(W, {
			title: "Rules",
			width: 860,
			height: 640
		}) : r.atlas.openView(W, {
			title: "Email rules",
			icon: "mail"
		}),
		layout: fe
	}, $ = K(""), me;
	function he(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog] input")) {
			e.key === "Escape" && t === T(j) && T(j)?.blur();
			return;
		}
		if (!T(Se)?.contains(t) && t !== document.body) return;
		let n = _n(e);
		if ([
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let r = T($) ? `${T($)} ${n}` : n;
		if (clearTimeout(me), !T($) && yn.has(n)) {
			O($, n, !0), me = setTimeout(() => O($, ""), 1200), e.preventDefault();
			return;
		}
		O($, "");
		let i = vn.get(r);
		!i || i.when && !i.when(o) || (e.preventDefault(), e.stopPropagation(), i.run(o, pe));
	}
	let ge;
	function _e() {
		clearTimeout(ge), ge = setTimeout(() => o.search(T(I)), 140);
	}
	async function ve() {
		if (o.search(T(I)), T(I).trim()) try {
			let e = await o.call("search_server", { query: T(I) }, 300);
			e.added && (o.toast(`${e.added} more from the server`), o.load());
		} catch (e) {
			o.toast(`The server search failed: ${e.message}`, "error");
		}
	}
	function ye(e) {
		o.quick = o.quick === e ? "" : e, o.load();
	}
	function be(e) {
		o.kind = e, o.load();
	}
	function xe(e, t) {
		e.preventDefault();
		let n = e.clientX, r = e.clientY, i = T(x), a = T(S), o = T(C), s = (e) => {
			t === "side" ? O(x, Math.max(170, Math.min(420, i + e.clientX - n)), !0) : t === "list" ? O(S, Math.max(300, Math.min(900, a + e.clientX - n)), !0) : O(C, Math.max(160, Math.min(900, o + e.clientY - r)), !0);
		}, c = () => {
			window.removeEventListener("pointermove", s), window.removeEventListener("pointerup", c), d("side-w", String(T(x))), d("list-w", String(T(S))), d("list-h", String(T(C))), document.body.style.userSelect = "";
		};
		document.body.style.userSelect = "none", window.addEventListener("pointermove", s), window.addEventListener("pointerup", c);
	}
	let Se = K(void 0);
	y(() => {
		o.start();
		let e = [
			r.atlas.helper.on("changed", () => o.later()),
			r.atlas.helper.on("bodies", () => o.later("list")),
			r.atlas.helper.on("status", (e) => {
				let t = e, n = o.accounts.find((e) => e.name === t.account);
				n && (n.status = t, n.syncing = t.state === "syncing");
			}),
			r.atlas.helper.on("woke", () => {
				o.toast("Snoozed mail is back in the inbox"), o.later();
			}),
			r.atlas.helper.on("rule", (e) => {
				let t = e;
				o.toast(`Rule “${t.rule}”: ${t.count} message${t.count === 1 ? "" : "s"}`);
			})
		], t = new MutationObserver(() => O(A, document.documentElement.dataset.theme !== "light"));
		t.observe(document.documentElement, {
			attributes: !0,
			attributeFilter: ["data-theme"]
		});
		let n = async (e) => {
			let t = e.detail, n = await ae(o.atlas, `A new folder in ${t}:`);
			if (n) try {
				await o.call("folder_create", {
					account: t,
					name: n
				}), await o.loadFolders(), o.toast(`Folder “${n}” made`, "success");
			} catch (e) {
				o.toast(`No folder made: ${e.message}`, "error");
			}
		}, i = () => {
			o.loadAccounts(), o.later();
		};
		window.addEventListener("atlas-email:new-folder", n), window.addEventListener("atlas-email:signed-in", i);
		let a = (e) => {
			let t = e.detail ?? {};
			(t.account || t.view === "inbox") && o.go({
				name: "inbox",
				account: t.account ?? null,
				folder: null,
				label: "Inbox"
			}), t.kind && (o.split ? (o.kind = t.kind, o.load()) : o.search(`in:inbox is:${t.kind}`)), t.search && (O(I, t.search, !0), o.search(t.search)), t.id && (o.read(t.id), T(R) && O(D, "reader")), t.compose && o.compose(t.compose), t.reply && o.reply(t.reply.mode, t.reply.id, !1);
		};
		window.addEventListener("atlas-email:open", a);
		let s = window.__atlasEmailOpen;
		return s && (a(new CustomEvent("x", { detail: s })), window.__atlasEmailOpen = void 0), () => {
			e.forEach((e) => e()), t.disconnect(), window.removeEventListener("atlas-email:new-folder", n), window.removeEventListener("atlas-email:signed-in", i), window.removeEventListener("atlas-email:open", a);
		};
	});
	let Ce = X(() => o.query ? "Search" : o.view.label), we = [
		[
			"person",
			"People",
			"person"
		],
		[
			"newsletter",
			"Newsletters",
			"news"
		],
		[
			"notification",
			"Notifications",
			"bell"
		]
	];
	var Te = tr();
	u("keydown", e, he);
	let Ee, De;
	var Oe = N(Te), ke = (e) => {
		var t = jn(), n = N(t);
		Me(n, {
			get mail() {
				return o;
			},
			get rail() {
				return T(B);
			},
			onpicked: () => {
				T(R) && O(D, "list");
			}
		});
		var r = Y(n, 2), i = (e) => {
			var t = An();
			J("pointerdown", t, (e) => xe(e, "side")), c(e, t);
		};
		v(r, (e) => {
			!T(B) && !T(R) && e(i);
		}), q(t), c(e, t);
	};
	v(Oe, (e) => {
		(!T(R) || T(D) === "side") && e(ke);
	});
	var Ae = Y(Oe, 2), je = (e) => {
		var t = Zn();
		let s;
		var u = N(t), d = (e) => {
			var t = Jn(), s = N(t), u = N(s), d = N(u), f = (e) => {
				var t = Mn(), n = N(t);
				Q(n, { name: "menu" }), q(t), J("click", t, () => O(D, "side")), c(e, t);
			};
			v(d, (e) => {
				T(R) && e(f);
			});
			var p = Y(d, 2), g = N(p);
			Q(g, {
				name: "search",
				size: 15
			});
			var y = Y(g, 2);
			i(y), ue(y, (e) => O(j, e), () => T(j));
			var b = Y(y, 2), x = (e) => {
				var t = Nn(), n = N(t);
				Q(n, {
					name: "x",
					size: 14
				}), q(t), J("click", t, () => {
					O(I, ""), o.search("");
				}), c(e, t);
			};
			v(b, (e) => {
				T(I) && e(x);
			}), q(p);
			var S = Y(p, 2), C = N(S);
			Q(C, { name: "refresh" }), q(S);
			var w = Y(S, 2), k = N(w);
			Q(k, { name: "layout" }), q(w);
			var A = Y(w, 2), M = N(A);
			Q(M, { name: "keyboard" }), q(A), q(u);
			var P = Y(u, 2), L = (e) => {
				var t = In(), r = N(t);
				l(r, 17, () => o.chips, ([e, t]) => e + t, (e, t) => {
					var r = X(() => ee(T(t), 2));
					let i = () => T(r)[0], a = () => T(r)[1];
					var o = Pn(), s = N(o), l = G(s), u = Y(s, 1, !0);
					q(o), E(() => {
						n(l, `${i() ?? ""}:`), n(u, a());
					}), c(e, o);
				});
				var i = Y(r), a = (e) => {
					var t = Fn();
					J("click", t, ve), c(e, t);
				};
				v(i, (e) => {
					o.query && e(a);
				}), q(t), c(e, t);
			};
			v(P, (e) => {
				o.chips.length && e(L);
			});
			var z = Y(P, 2), B = (e) => {
				var t = Ln(), r = N(t), i = N(r);
				Q(i, { name: "x" }), q(r);
				var a = Y(r, 2), s = G(a), l = Y(a, 4), u = N(l);
				Q(u, { name: "archive" }), q(l);
				var d = Y(l, 2), f = N(d);
				Q(f, { name: "trash" }), q(d);
				var p = Y(d, 2), m = N(p);
				Q(m, { name: "read" }), q(p);
				var h = Y(p, 2), g = N(h);
				Q(g, { name: "unread" }), q(h);
				var _ = Y(h, 2), v = N(_);
				Q(v, { name: "star" }), q(_);
				var y = Y(_, 2), b = N(y);
				Q(b, { name: "clock" }), q(y);
				var x = Y(y, 2), S = N(x);
				Q(S, { name: "folder" }), q(x);
				var C = Y(x, 2), w = N(C);
				Q(w, { name: "label" }), q(C), q(t), E(() => n(s, `${o.checked.length ?? ""} checked`)), J("click", r, () => o.selectWhere("none")), J("click", l, () => o.archive()), J("click", d, () => o.trash()), J("click", p, () => o.mark("read", !0)), J("click", h, () => o.mark("read", !1)), J("click", _, () => o.toggleStar()), J("click", y, () => se("snooze")), J("click", x, () => se("move")), J("click", C, () => se("label")), c(e, t);
			}, V = (e) => {
				var t = Vn(), r = Z(t), i = N(r), a = G(i, !0), s = Y(i, 2), u = G(s), d = Y(s, 4), f = N(d);
				let p;
				var g = Y(f, 2);
				let _;
				var y = Y(g, 2);
				let b;
				var x = Y(y, 2);
				let S;
				q(d), q(r);
				var C = Y(r, 2), w = (e) => {
					var t = Bn();
					l(t, 21, () => we, ([e, t, n]) => e, (e, t) => {
						var r = X(() => ee(T(t), 3));
						let i = () => T(r)[0], a = () => T(r)[1], s = () => T(r)[2], l = X(() => o.counts[i()]);
						var u = zn();
						let d;
						var f = N(u);
						Q(f, {
							get name() {
								return s();
							},
							size: 14
						});
						var p = Y(f, 1, !0), g = Y(p), _ = (e) => {
							var t = Rn(), r = G(t, !0);
							E(() => n(r, T(l).unread)), c(e, t);
						};
						v(g, (e) => {
							T(l)?.unread && e(_);
						}), q(u), E(() => {
							h(u, "aria-selected", (o.kind || "person") === i()), d = m(u, 1, "svelte-7si10b", null, d, { on: (o.kind || "person") === i() }), n(p, a());
						}), J("click", u, () => be(i())), c(e, u);
					}), q(t), c(e, t);
				};
				v(C, (e) => {
					o.split && !o.query && e(w);
				}), E(() => {
					n(a, T(Ce)), n(u, `${o.total ? `${o.total} conversation${o.total === 1 ? "" : "s"}` : ""}${o.unread ? ` · ${o.unread} unread` : ""}`), p = m(f, 1, "svelte-7si10b", null, p, { on: o.quick === "unread" }), _ = m(g, 1, "svelte-7si10b", null, _, { on: o.quick === "starred" }), b = m(y, 1, "svelte-7si10b", null, b, { on: o.quick === "attachments" }), S = m(x, 1, "svelte-7si10b", null, S, { on: o.quick === "mentions" });
				}), J("click", f, () => ye("unread")), J("click", g, () => ye("starred")), J("click", y, () => ye("attachments")), J("click", x, () => ye("mentions")), c(e, t);
			};
			v(z, (e) => {
				o.checked.length ? e(B) : e(V, -1);
			}), q(s);
			var H = Y(s, 2), te = (e) => {
				var t = Hn(), i = N(t, !0), a = Y(i), s = N(a), l = Y(s);
				q(a), q(t), E(() => n(i, o.error)), J("click", s, () => o.load()), J("click", l, () => r.atlas.plugin.openSettings()), c(e, t);
			}, U = (e) => {
				var t = qn(), i = N(t), a = (e) => {
					var t = Un(), n = Y(Z(t));
					J("click", n, ve), c(e, t);
				}, s = (e) => {
					var t = Wn(), n = Y(Z(t));
					J("click", n, () => r.atlas.plugin.openSettings()), c(e, t);
				}, l = (e) => {
					var t = Gn();
					F(), c(e, t);
				}, u = (e) => {
					var t = Kn(), r = G(t);
					E(() => n(r, `Nothing here${o.quick ? " with that filter" : ""}.`)), c(e, t);
				};
				v(i, (e) => {
					o.query ? e(a) : o.accounts.length ? o.view.name === "inbox" && !o.quick ? e(l, 2) : e(u, -1) : e(s, 1);
				}), q(t), c(e, t);
			}, W = (e) => {
				Ye(e, {
					get mail() {
						return o;
					},
					get compact() {
						return T(_);
					},
					onopen: ie
				});
			};
			v(H, (e) => {
				o.error ? e(te) : !o.loading && !o.rows.length ? e(U, 1) : e(W, -1);
			}), q(t), E(() => h(t, "aria-label", T(Ce))), J("input", y, _e), J("keydown", y, (e) => {
				e.key === "Enter" ? (e.preventDefault(), ve()) : e.key === "Escape" ? (O(I, ""), o.search(""), T(j)?.blur()) : e.key === "ArrowDown" && T(j)?.blur();
			}), a(y, () => T(I), (e) => O(I, e)), J("click", S, () => gn.find((e) => e.id === "refresh")?.run(o, pe)), J("click", w, fe), J("click", A, de), c(e, t);
		};
		v(u, (e) => {
			(T(H) !== "full" || !T(te) || T(R) && T(D) !== "reader") && e(d);
		});
		var f = Y(u, 2), p = (e) => {
			var t = Yn();
			let n;
			E(() => n = m(t, 1, "grip svelte-7si10b", null, n, {
				h: T(H) === "below",
				v: T(H) === "three"
			})), J("pointerdown", t, (e) => xe(e, T(H) === "below" ? "listH" : "list")), c(e, t);
		};
		v(f, (e) => {
			T(H) !== "full" && e(p);
		});
		var g = Y(f, 2), y = (e) => {
			var t = Xn(), n = N(t);
			{
				let e = X(() => T(H) === "full");
				ue(cn(n, {
					get mail() {
						return o;
					},
					get dark() {
						return T(A);
					},
					get narrow() {
						return T(e);
					},
					onback: () => {
						o.close(), O(D, "list");
					},
					onpick: se
				}), (e) => O(P, e, !0), () => T(P));
			}
			q(t), c(e, t);
		};
		v(g, (e) => {
			T(te) && (!T(R) || T(D) === "reader") && e(y);
		}), q(t), E(() => s = m(t, 1, "work svelte-7si10b", null, s, {
			below: T(H) === "below",
			full: T(H) === "full"
		})), c(e, t);
	};
	v(Ae, (e) => {
		(!T(R) || T(D) !== "side") && e(je);
	});
	var Ne = Y(Ae, 2), Pe = (e) => {
		var t = $n();
		let n;
		l(t, 21, () => T(ne), (e) => e.key, (e, t) => {
			var n = Qn();
			Nt(N(n), {
				get mail() {
					return o;
				},
				get c() {
					return T(t);
				},
				get big() {
					return T(L);
				},
				set big(e) {
					O(L, e, !0);
				}
			}), q(n), c(e, n);
		}), q(t), E(() => n = m(t, 1, "windows svelte-7si10b", null, n, { big: T(L) || T(R) })), c(e, t);
	};
	v(Ne, (e) => {
		T(ne).length && e(Pe);
	});
	var Fe = Y(Ne, 2), Ie = (e) => {
		Dn(e, { onclose: () => O(k, !1) });
	};
	v(Fe, (e) => {
		T(k) && e(Ie);
	});
	var Le = Y(Fe, 2);
	mn(Le, { get mail() {
		return o;
	} });
	var Re = Y(Le, 2), ze = (e) => {
		var t = er(), r = G(t);
		E(() => n(r, `${T($) ?? ""} …`)), c(e, t);
	};
	v(Re, (e) => {
		T($) && e(ze);
	}), q(Te), ue(Te, (e) => O(Se, e), () => T(Se)), E(() => {
		Ee = m(Te, 1, "mail svelte-7si10b", null, Ee, {
			narrow: T(R),
			dark: T(A)
		}), De = p(Te, "", De, {
			"--side-w": `${(T(B) ? 56 : T(x)) ?? ""}px`,
			"--list-w": `${T(S) ?? ""}px`,
			"--list-h": `${T(C) ?? ""}px`
		});
	}), b(Te, "clientWidth", (e) => O(w, e)), c(t, Te), ce();
}
d([
	"pointerdown",
	"click",
	"input",
	"keydown"
]);
//#endregion
//#region plugins/stable/email/ui/src/Thunderbird.svelte
var ir = C("<p class=\"err svelte-h2hvl1\"> </p>"), ar = C("<p class=\"hint svelte-h2hvl1\">Reading Thunderbird's profiles…</p>"), or = C("<p class=\"hint svelte-h2hvl1\">No account found in a Thunderbird profile.</p>"), sr = C("<small> </small>"), cr = C("<button class=\"svelte-h2hvl1\">Open its card</button>"), lr = C("<button> </button>"), ur = C("<li class=\"svelte-h2hvl1\"><div class=\"who svelte-h2hvl1\"><b> </b><small class=\"svelte-h2hvl1\"> </small> <!></div> <!></li>"), dr = C("<ul class=\"svelte-h2hvl1\"></ul>"), fr = C("<p class=\"hint svelte-h2hvl1\">Add the account above first.</p>"), pr = C("<option> </option>"), mr = C("<p class=\"hint svelte-h2hvl1\"> </p>"), hr = C("<li class=\"svelte-h2hvl1\"><span> </span><span> </span></li>"), gr = C("<p class=\"svelte-h2hvl1\"> </p> <ul class=\"counts svelte-h2hvl1\"></ul> <div class=\"row svelte-h2hvl1\"><button class=\"primary svelte-h2hvl1\">Write them as notes</button></div>", 1), _r = C("<p> </p>"), vr = C("<div class=\"row svelte-h2hvl1\"><select aria-label=\"Account\" class=\"svelte-h2hvl1\"></select> <button class=\"svelte-h2hvl1\">Check</button></div> <!>", 1), yr = C("<div class=\"tb svelte-h2hvl1\"><section><h3 class=\"svelte-h2hvl1\">Accounts in Thunderbird</h3> <p class=\"hint svelte-h2hvl1\">Each becomes a card in Email's settings; its password or sign-in is given there.</p> <!></section> <section><h3 class=\"svelte-h2hvl1\">Local mail</h3> <p class=\"hint svelte-h2hvl1\">What Thunderbird keeps on this computer only (a POP account's mail, gone from the server), kept as notes.</p> <!></section> <div class=\"go svelte-h2hvl1\"><button class=\"svelte-h2hvl1\">Close</button></div></div>"), br = {
	hash: "svelte-h2hvl1",
	code: ".tb.svelte-h2hvl1 {display:flex;flex-direction:column;gap:18px;height:100%;min-height:0;overflow:auto;padding:16px;box-sizing:border-box;background:var(--bg);color:var(--text);}h3.svelte-h2hvl1 {margin:0 0 2px;font-size:1em;}p.svelte-h2hvl1 {margin:4px 0;}.hint.svelte-h2hvl1, small.svelte-h2hvl1 {color:var(--text-muted);font-size:.9em;}.err.svelte-h2hvl1 {color:var(--danger, #c33);}ul.svelte-h2hvl1 {margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;}li.svelte-h2hvl1 {display:flex;align-items:center;gap:10px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;}.who.svelte-h2hvl1 {flex:1;min-width:0;display:flex;flex-direction:column;overflow-wrap:anywhere;}.counts.svelte-h2hvl1 li:where(.svelte-h2hvl1) {justify-content:space-between;padding:3px 8px;font-size:.9em;}.row.svelte-h2hvl1 {display:flex;gap:8px;margin-top:6px;}select.svelte-h2hvl1 {flex:1;min-width:0;font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:5px 7px;}button.svelte-h2hvl1 {padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;white-space:nowrap;font:inherit;}button.primary.svelte-h2hvl1 {background:var(--accent);border-color:var(--accent);color:var(--accent-text, #fff);}button.svelte-h2hvl1:disabled {opacity:.5;cursor:default;}.go.svelte-h2hvl1 {display:flex;justify-content:flex-end;margin-top:auto;}"
};
function xr(e, r) {
	M(r, !0), g(e, br);
	let i = K(z(w(() => (r.atlas.plugin.settings.accounts ?? []).filter((e) => e?.name)))), a = K(null), o = K(""), s = z({});
	w(() => H(r.atlas, "thunderbird")).then((e) => O(a, e.accounts, !0), (e) => O(o, String(e.message ?? e), !0));
	let u = (e) => T(i).some((t) => t.name === e.record.name || t.user && t.user === e.record.user);
	async function d(e, t) {
		try {
			O(i, [...T(i), t.record], !0), await r.atlas.plugin.saveSettings({ accounts: T(i) }), s[e] = t.record.auth === "outlook" ? "Added: now “Sign in to Outlook” on its card." : "Added: now type its password on its card (an app password for Gmail).";
		} catch (n) {
			O(i, T(i).filter((e) => e !== t.record), !0), s[e] = `Not added: ${n.message ?? n}`;
		}
	}
	let p = K(z(w(() => T(i)[0]?.name ?? ""))), h = K(z({ kind: "idle" }));
	async function _() {
		O(h, {
			kind: "busy",
			text: `Comparing ${T(p)}'s local mail with its notes…`
		}, !0);
		try {
			let e = await H(r.atlas, "thunderbird_mail", {
				account: T(p),
				dry: !0
			}, 600), t = Object.entries(e.missing ?? {}), n = t.reduce((e, [, t]) => e + t, 0);
			O(h, n ? {
				kind: "missing",
				n,
				by: t
			} : {
				kind: "done",
				text: e.note ?? "Every local message is already a note."
			}, !0);
		} catch (e) {
			O(h, {
				kind: "done",
				text: String(e.message ?? e),
				error: !0
			}, !0);
		}
	}
	async function y(e) {
		O(h, {
			kind: "busy",
			text: `Writing ${e} messages as notes…`
		}, !0);
		try {
			let e = await H(r.atlas, "thunderbird_mail", {
				account: T(p),
				dry: !1
			}, 1800);
			O(h, {
				kind: "done",
				text: `${e.saved.length} kept as notes${e.failed.length ? `; ${e.failed.length} failed: ${e.failed.slice(0, 3).join("; ")}` : "."}`,
				error: e.failed.length > 0
			}, !0);
		} catch (e) {
			O(h, {
				kind: "done",
				text: String(e.message ?? e),
				error: !0
			}, !0);
		}
	}
	var b = yr(), x = N(b), S = Y(N(x), 4), C = (e) => {
		var t = ir(), r = G(t, !0);
		E(() => n(r, T(o))), c(e, t);
	}, D = (e) => {
		var t = ar();
		c(e, t);
	}, k = (e) => {
		var t = or();
		c(e, t);
	}, A = (e) => {
		var t = dr();
		l(t, 21, () => T(a), f, (e, t, i) => {
			var a = ur(), o = N(a), l = N(o), f = G(l, !0), p = Y(l), h = G(p), g = Y(p, 2), _ = (e) => {
				var t = sr();
				let r;
				var a = G(t, !0);
				E((e) => {
					r = m(t, 1, "svelte-h2hvl1", null, r, { err: e }), n(a, s[i]);
				}, [() => s[i].startsWith("Not")]), c(e, t);
			};
			v(g, (e) => {
				s[i] && e(_);
			}), q(o);
			var y = Y(o, 2), b = (e) => {
				var t = cr();
				J("click", t, () => r.atlas.plugin.openSettings()), c(e, t);
			}, x = X(() => s[i] && !s[i].startsWith("Not")), S = (e) => {
				var r = lr();
				let a;
				var o = G(r, !0);
				E((e, t, i) => {
					r.disabled = e, a = m(r, 1, "svelte-h2hvl1", null, a, { primary: t }), n(o, i);
				}, [
					() => u(T(t)),
					() => !u(T(t)),
					() => u(T(t)) ? "Already a card" : "Add"
				]), J("click", r, () => d(i, T(t))), c(e, r);
			};
			v(y, (e) => {
				T(x) ? e(b) : e(S, -1);
			}), q(a), E(() => {
				n(f, T(t).user || T(t).name), n(h, `${T(t).imap_host ?? ""} · ${T(t).auth ?? ""} · ${T(t).profile ?? ""}`);
			}), c(e, a);
		}), q(t), c(e, t);
	};
	v(S, (e) => {
		T(o) ? e(C) : T(a) ? T(a).length ? e(A, -1) : e(k, 2) : e(D, 1);
	}), q(x);
	var j = Y(x, 2), P = Y(N(j), 4), F = (e) => {
		var t = fr();
		c(e, t);
	}, I = (e) => {
		var r = vr(), a = Z(r), o = N(a);
		l(o, 21, () => T(i), (e) => e.name, (e, t) => {
			var r = pr(), i = G(r), a = {};
			E(() => {
				n(i, `${T(t).name ?? ""}${T(t).user ? ` — ${T(t).user}` : ""}`), a !== (a = T(t).name) && (r.value = (r.__value = a) ?? "");
			}), c(e, r);
		}), q(o), t(o);
		var s = Y(o, 2);
		q(a);
		var u = Y(a, 2), d = (e) => {
			var t = mr(), r = G(t, !0);
			E(() => n(r, T(h).text)), c(e, t);
		}, f = (e) => {
			let t = X(() => T(h).n);
			var r = gr(), i = Z(r), a = G(i), o = Y(i, 2);
			l(o, 21, () => T(h).by, ([e, t]) => e, (e, t) => {
				var r = X(() => ee(T(t), 2));
				let i = () => T(r)[0], a = () => T(r)[1];
				var o = hr(), s = N(o), l = G(s, !0), u = Y(s), d = G(u, !0);
				q(o), E(() => {
					n(l, i()), n(d, a());
				}), c(e, o);
			}), q(o);
			var s = Y(o, 2), u = G(s);
			E(() => n(a, `${T(t) ?? ""} message${T(t) === 1 ? "" : "s"} Thunderbird keeps for ${T(p) ?? ""} ${T(t) === 1 ? "is" : "are"} in no note:`)), J("click", u, () => y(T(t))), c(e, r);
		}, g = (e) => {
			var t = _r();
			let r;
			var i = G(t, !0);
			E(() => {
				r = m(t, 1, "svelte-h2hvl1", null, r, { err: T(h).error }), n(i, T(h).text);
			}), c(e, t);
		};
		v(u, (e) => {
			T(h).kind === "busy" ? e(d) : T(h).kind === "missing" ? e(f, 1) : T(h).kind === "done" && e(g, 2);
		}), E(() => {
			o.disabled = T(h).kind === "busy", s.disabled = !T(p) || T(h).kind === "busy";
		}), J("change", o, () => O(h, { kind: "idle" }, !0)), V(o, () => T(p), (e) => O(p, e)), J("click", s, _), c(e, r);
	};
	v(P, (e) => {
		T(i).length ? e(I, -1) : e(F);
	}), q(j);
	var L = Y(j, 2), R = G(L);
	q(b), J("click", R, function(...e) {
		r.onclose?.apply(this, e);
	}), c(e, b), ce();
}
d(["click", "change"]);
//#endregion
//#region plugins/stable/email/ui/src/SignIn.svelte
var Sr = C("<p class=\"svelte-1gsd9hw\">No account signs in with Outlook: set one's Sign-in to <b class=\"svelte-1gsd9hw\">outlook</b> in Email's settings.</p> <div class=\"go svelte-1gsd9hw\"><button class=\"svelte-1gsd9hw\">Open Email's settings</button></div>", 1), Cr = C("<small class=\"svelte-1gsd9hw\"> </small>"), wr = C("<li class=\"svelte-1gsd9hw\"><button class=\"pick svelte-1gsd9hw\"><b class=\"svelte-1gsd9hw\"> </b><!></button></li>"), Tr = C("<p class=\"svelte-1gsd9hw\">Which account?</p> <ul class=\"svelte-1gsd9hw\"></ul>", 1), Er = C("<p class=\"hint svelte-1gsd9hw\"> </p>"), Dr = C("<p class=\"svelte-1gsd9hw\">On the Microsoft page, type this code and sign in as <b class=\"svelte-1gsd9hw\"> </b>:</p> <div class=\"code svelte-1gsd9hw\"><span class=\"svelte-1gsd9hw\"> </span><button class=\"svelte-1gsd9hw\"> </button></div>", 1), Or = C("<p class=\"svelte-1gsd9hw\">Sign in as <b class=\"svelte-1gsd9hw\"> </b> on the Microsoft page in your browser.</p>"), kr = C("<p class=\"svelte-1gsd9hw\">Sign in as <b class=\"svelte-1gsd9hw\"> </b> in the window that opened.</p>"), Ar = C("<form class=\"row svelte-1gsd9hw\"><input aria-label=\"Return address\" placeholder=\"If it ends on a page that does not load: its https://localhost/… address\" class=\"svelte-1gsd9hw\"/> <button type=\"submit\" class=\"svelte-1gsd9hw\">Finish</button></form>"), jr = C("<p class=\"hint svelte-1gsd9hw\"><span class=\"dot svelte-1gsd9hw\"></span>Atlas finishes by itself when Microsoft sends you back.</p> <div class=\"go svelte-1gsd9hw\"><button class=\"svelte-1gsd9hw\">Open the Microsoft page again</button></div>", 1), Mr = C("<!> <!>", 1), Nr = C("<p class=\"ok svelte-1gsd9hw\"> </p>"), Pr = C("<p class=\"err svelte-1gsd9hw\"> </p> <div class=\"go svelte-1gsd9hw\"><button class=\"primary svelte-1gsd9hw\">Try again</button></div>", 1), Fr = C("<div class=\"si svelte-1gsd9hw\"><!> <div class=\"go end svelte-1gsd9hw\"><button> </button></div></div>"), Ir = {
	hash: "svelte-1gsd9hw",
	code: ".si.svelte-1gsd9hw {display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;overflow:auto;padding:16px;box-sizing:border-box;background:var(--bg);color:var(--text);}p.svelte-1gsd9hw {margin:0;}.hint.svelte-1gsd9hw, small.svelte-1gsd9hw {color:var(--text-muted);font-size:.9em;}.ok.svelte-1gsd9hw {color:var(--success, #2a7);}.err.svelte-1gsd9hw {color:var(--danger, #c33);overflow-wrap:anywhere;}ul.svelte-1gsd9hw {margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;}.pick.svelte-1gsd9hw {width:100%;display:flex;flex-direction:column;align-items:flex-start;text-align:left;}.code.svelte-1gsd9hw {display:flex;align-items:center;gap:12px;}.code.svelte-1gsd9hw span:where(.svelte-1gsd9hw) {font:600 1.6em var(--font-mono, monospace);letter-spacing:.12em;padding:6px 12px;border:1px solid var(--border);border-radius:8px;user-select:all;}.row.svelte-1gsd9hw {display:flex;gap:8px;}input.svelte-1gsd9hw {flex:1;min-width:0;font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:5px 7px;}.go.svelte-1gsd9hw {display:flex;gap:8px;}.go.end.svelte-1gsd9hw {justify-content:flex-end;margin-top:auto;}button.svelte-1gsd9hw {padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font:inherit;}button.primary.svelte-1gsd9hw {background:var(--accent);border-color:var(--accent);color:var(--accent-text, #fff);}button.svelte-1gsd9hw:disabled {opacity:.5;cursor:default;}.dot.svelte-1gsd9hw {display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:50%;background:var(--accent); animation: svelte-1gsd9hw-pulse 1.2s ease-in-out infinite;}\n  @keyframes svelte-1gsd9hw-pulse { 50% { opacity: .25; } }"
};
function Lr(e, t) {
	M(t, !0), g(e, Ir);
	let r = w(() => (t.atlas.plugin.settings.accounts ?? []).filter((e) => e?.name && e.auth === "outlook")), o = K(z(w(() => t.account ?? t.record?.name ?? (r.length === 1 ? r[0].name : "")))), s = K(z(w(() => T(o) ? { kind: "starting" } : { kind: "choose" }))), d = K(""), f = !1, p = (e) => void H(t.atlas, "signin_reopen", { url: e }).catch(() => window.open(e, "_blank")), h = () => {
		f || (O(s, { kind: "done" }, !0), window.dispatchEvent(new CustomEvent("atlas-email:signed-in", { detail: { account: T(o) } })), H(t.atlas, "watch", {}, 30).catch(() => {}));
	}, y = (e) => {
		f || O(s, {
			kind: "failed",
			why: String(e?.message ?? e)
		}, !0);
	}, b = !1;
	function S(e) {
		!b && e.trim() && (b = !0, H(t.atlas, "signin_finish", {
			redirect: e.trim(),
			account: T(o)
		}, 60).then(h, (e) => {
			b = !1, y(e);
		}));
	}
	async function C() {
		O(s, { kind: "starting" }, !0), b = !1;
		try {
			let e = await H(t.atlas, "signin_start", t.record && t.record.name === T(o) ? { record: t.record } : { account: T(o) }, 60);
			if (f) return;
			if (e.flow === "automatic" || e.flow === "code") {
				let n = !1;
				return e.code && (n = await navigator.clipboard?.writeText(e.code).then(() => !0, () => !1) ?? !1), e.opened || p(e.url), O(s, {
					kind: "waiting",
					flow: e.flow,
					url: e.url,
					code: e.code,
					copied: n
				}, !0), await H(t.atlas, "signin_finish", { account: T(o) }, e.flow === "code" ? 900 : 660), h();
			}
			O(s, {
				kind: "waiting",
				flow: "window",
				url: e.url
			}, !0), (t.atlas.signIn ? t.atlas.signIn(e.url, e.redirect ?? "https://localhost") : (window.open(e.url, "_blank"), null))?.then(S, () => {});
		} catch (e) {
			y(e);
		}
	}
	w(() => T(s).kind === "starting") && C(), _(() => () => {
		f = !0;
	});
	let D = (e) => navigator.clipboard?.writeText(e).then(() => {
		T(s).kind === "waiting" && O(s, {
			...T(s),
			copied: !0
		}, !0);
	}, () => {});
	var k = Fr(), A = N(k), j = (e) => {
		var i = x(), a = Z(i), s = (e) => {
			var n = Sr(), r = Y(Z(n), 2), i = G(r);
			J("click", i, () => t.atlas.plugin.openSettings()), c(e, n);
		}, u = (e) => {
			var t = Tr(), i = Y(Z(t), 2);
			l(i, 21, () => r, (e) => e.name, (e, t) => {
				var r = wr(), i = N(r), a = N(i), s = G(a, !0), l = Y(a), u = (e) => {
					var r = Cr(), i = G(r, !0);
					E(() => n(i, T(t).user)), c(e, r);
				};
				v(l, (e) => {
					T(t).user && e(u);
				}), q(i), q(r), E(() => n(s, T(t).name)), J("click", i, () => {
					O(o, T(t).name, !0), C();
				}), c(e, r);
			}), q(i), c(e, t);
		};
		v(a, (e) => {
			r.length ? e(u, -1) : e(s);
		}), c(e, i);
	}, P = (e) => {
		var t = Er(), r = G(t);
		E(() => n(r, `Asking Microsoft for a sign-in for ${T(o) ?? ""}…`)), c(e, t);
	}, I = (e) => {
		var t = Mr(), r = Z(t), l = (e) => {
			var t = Dr(), r = Z(t), i = Y(N(r)), a = G(i, !0);
			F(), q(r);
			var l = Y(r, 2), u = N(l), d = G(u, !0), f = Y(u), p = G(f, !0);
			q(l), E(() => {
				n(a, T(o)), n(d, T(s).code), n(p, T(s).copied ? "Copied" : "Copy");
			}), J("click", f, () => D(T(s).kind === "waiting" ? T(s).code ?? "" : "")), c(e, t);
		}, f = (e) => {
			var t = Or(), r = Y(N(t)), i = G(r, !0);
			F(), q(t), E(() => n(i, T(o))), c(e, t);
		}, m = (e) => {
			var t = kr(), r = Y(N(t)), i = G(r, !0);
			F(), q(t), E(() => n(i, T(o))), c(e, t);
		};
		v(r, (e) => {
			T(s).flow === "code" ? e(l) : T(s).flow === "automatic" ? e(f, 1) : e(m, -1);
		});
		var h = Y(r, 2), g = (e) => {
			var t = Ar(), n = N(t);
			i(n);
			var r = Y(n, 2);
			q(t), E((e) => r.disabled = e, [() => !T(d).trim()]), u("submit", t, (e) => {
				e.preventDefault(), S(T(d));
			}), a(n, () => T(d), (e) => O(d, e)), c(e, t);
		}, _ = (e) => {
			var t = jr(), n = Y(Z(t), 2), r = G(n);
			J("click", r, () => T(s).kind === "waiting" && p(T(s).url)), c(e, t);
		};
		v(h, (e) => {
			T(s).flow === "window" ? e(g) : e(_, -1);
		}), c(e, t);
	}, L = (e) => {
		var t = Nr(), r = G(t);
		E(() => n(r, `Signed in: ${T(o) ?? ""}'s mail can be read now.`)), c(e, t);
	}, ee = (e) => {
		var t = Pr(), r = Z(t), i = G(r, !0), a = Y(r, 2), o = G(a);
		E(() => n(i, T(s).why)), J("click", o, C), c(e, t);
	};
	v(A, (e) => {
		T(s).kind === "choose" ? e(j) : T(s).kind === "starting" ? e(P, 1) : T(s).kind === "waiting" ? e(I, 2) : T(s).kind === "done" ? e(L, 3) : e(ee, -1);
	});
	var R = Y(A, 2), B = N(R);
	let V;
	var te = G(B, !0);
	q(R), q(k), E(() => {
		V = m(B, 1, "svelte-1gsd9hw", null, V, { primary: T(s).kind === "done" }), n(te, T(s).kind === "done" ? "Done" : "Close");
	}), J("click", B, function(...e) {
		t.onclose?.apply(this, e);
	}), c(e, k), ce();
}
d(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/view.ts
function Rr(e, t) {
	if (t.arg === W) {
		let n = fe(oe, {
			target: e,
			props: {
				frame: "dialog",
				mail: R(t),
				onclose: () => t.pane?.close?.()
			}
		});
		return () => S(n);
	}
	let n = (() => {
		try {
			return JSON.parse(String(t.arg ?? ""));
		} catch {
			return {};
		}
	})();
	if (n.dialog === "signin") {
		let r = fe(Lr, {
			target: e,
			props: {
				atlas: t,
				account: n.account,
				record: n.record,
				onclose: () => t.pane?.close?.()
			}
		});
		return () => S(r);
	}
	if (t.arg === ie) {
		let n = fe(xr, {
			target: e,
			props: {
				atlas: t,
				onclose: () => t.pane?.close?.()
			}
		});
		return () => S(n);
	}
	e.style.height = "100%";
	let r = fe(rr, {
		target: e,
		props: { atlas: t }
	});
	return () => S(r);
}
//#endregion
export { Rr as default };
