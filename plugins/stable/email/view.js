import { $ as e, A as t, B as n, C as r, D as i, E as a, F as o, G as s, H as c, I as l, J as u, K as d, L as f, M as p, N as m, O as h, P as g, Q as _, R as v, S as y, T as b, U as x, V as S, W as C, X as w, Y as T, Z as E, _ as D, a as O, at as k, b as A, c as j, ct as M, d as N, et as P, f as F, g as I, h as L, i as R, it as z, j as B, k as V, l as ee, m as te, n as H, nt as U, o as W, ot as ne, p as G, q as K, r as q, s as J, st as re, t as Y, tt as X, u as ie, ut as ae, v as oe, w as Z, x as se, y as ce, z as Q } from "./ui-lib/Rules.js";
//#region plugins/stable/email/ui/src/Sidebar.svelte
var le = Q("<span>New message</span>"), ue = Q("<span class=\"name svelte-t2e5ba\"> </span>"), de = Q("<span> </span>"), fe = Q("<button><!> <!> <!></button>"), pe = Q("<span></span>"), me = Q("<span class=\"spin svelte-t2e5ba\" title=\"Checking for mail…\"></span>"), he = Q("<span class=\"faint svelte-t2e5ba\">offline</span>"), ge = Q("<!> <span class=\"acct svelte-t2e5ba\"> </span> <!> <!>", 1), _e = Q("<button class=\"link svelte-t2e5ba\">Sign in…</button>"), ve = Q("<div class=\"err svelte-t2e5ba\" role=\"alert\"><span class=\"svelte-t2e5ba\"> </span> <!> <button class=\"link svelte-t2e5ba\">Settings…</button></div>"), ye = Q("<button class=\"twist svelte-t2e5ba\"><!></button>"), be = Q("<div class=\"frow svelte-t2e5ba\"><button><!> <!> <!></button> <!></div>"), xe = Q("<button><!><span class=\"name svelte-t2e5ba\"> </span></button>"), $ = Q("<button class=\"row faint svelte-t2e5ba\"><!><span class=\"name svelte-t2e5ba\"> </span></button> <!>", 1), Se = Q("<button class=\"row faint add svelte-t2e5ba\"><!><span class=\"name svelte-t2e5ba\">New folder…</span></button>"), Ce = Q("<!> <!> <!>", 1), we = Q("<div class=\"group svelte-t2e5ba\"><button class=\"head svelte-t2e5ba\"><!></button> <!> <!></div>"), Te = Q("<div class=\"empty svelte-t2e5ba\"><p class=\"svelte-t2e5ba\">No mail account yet.</p> <button class=\"atlas-btn\">Add an account…</button></div>"), Ee = Q("<nav aria-label=\"Mail folders\"><button class=\"compose svelte-t2e5ba\" title=\"New message (c)\"><!><!></button> <div class=\"group svelte-t2e5ba\"></div> <!></nav>"), De = {
	hash: "svelte-t2e5ba",
	code: ".side.svelte-t2e5ba {display:flex;flex-direction:column;gap:10px;padding:10px 8px 16px;overflow-y:auto;height:100%;box-sizing:border-box;font-size:0.95em;}.compose.svelte-t2e5ba {all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 14px;border-radius:var(--radius);background:var(--accent);color:var(--accent-fg);font-weight:600;box-shadow:var(--shadow-sm);}.compose.svelte-t2e5ba:hover {filter:brightness(1.06);}.compose.svelte-t2e5ba:focus-visible {outline:2px solid var(--accent-strong);outline-offset:2px;}.rail.svelte-t2e5ba .compose:where(.svelte-t2e5ba) {justify-content:center;padding:9px;}.group.svelte-t2e5ba {display:flex;flex-direction:column;gap:1px;}.row.svelte-t2e5ba {all:unset;box-sizing:border-box;display:flex;align-items:center;gap:9px;cursor:pointer;padding:5px 8px 5px calc(8px + var(--depth, 0) * 14px);border-radius:var(--radius-sm);color:var(--text-muted);min-height:28px;flex:1;min-width:0;}.row.svelte-t2e5ba:hover {background:var(--bg-hover);color:var(--text);}.row.on.svelte-t2e5ba {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.row.over.svelte-t2e5ba {outline:2px dashed var(--accent);background:var(--accent-soft);}.row.svelte-t2e5ba:focus-visible, .head.svelte-t2e5ba:focus-visible, .twist.svelte-t2e5ba:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.rail.svelte-t2e5ba .row:where(.svelte-t2e5ba) {justify-content:center;padding:6px;}.frow.svelte-t2e5ba {display:flex;align-items:center;}.twist.svelte-t2e5ba {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-faint);}.twist.svelte-t2e5ba:hover {background:var(--bg-hover);color:var(--text);}.name.svelte-t2e5ba {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.n.svelte-t2e5ba {font-size:0.85em;color:var(--text-faint);font-variant-numeric:tabular-nums;}.n.strong.svelte-t2e5ba {color:var(--text);font-weight:600;}.rail.svelte-t2e5ba .n:where(.svelte-t2e5ba) {display:none;}.head.svelte-t2e5ba {all:unset;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 8px 4px;color:var(--text-faint);font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;min-width:0;}.head.svelte-t2e5ba:hover {color:var(--text-muted);}.rail.svelte-t2e5ba .head:where(.svelte-t2e5ba) {justify-content:center;padding:8px 0 4px;}.acct.svelte-t2e5ba {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:none;letter-spacing:0;font-size:1.15em;}.faint.svelte-t2e5ba {color:var(--text-faint);font-weight:400;}.add.svelte-t2e5ba {font-size:0.9em;}.dot.svelte-t2e5ba {width:8px;height:8px;border-radius:50%;background:var(--text-faint);}.dot.busy.svelte-t2e5ba {background:var(--accent);}.dot.bad.svelte-t2e5ba {background:var(--red);}.spin.svelte-t2e5ba {width:9px;height:9px;border-radius:50%;border:2px solid var(--accent);border-right-color:transparent; animation: svelte-t2e5ba-spin 0.8s linear infinite;}\n  @keyframes svelte-t2e5ba-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-t2e5ba { animation: none;} }.err.svelte-t2e5ba {margin:2px 6px 6px;padding:8px 10px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--red) 12%, transparent);color:var(--text);font-size:0.88em;display:flex;flex-wrap:wrap;gap:6px 10px;}.err.svelte-t2e5ba span:where(.svelte-t2e5ba) {flex-basis:100%;overflow-wrap:anywhere;}.link.svelte-t2e5ba {all:unset;cursor:pointer;color:var(--accent);}.empty.svelte-t2e5ba {padding:14px 8px;color:var(--text-muted);display:grid;gap:8px;justify-items:start;}.empty.svelte-t2e5ba p:where(.svelte-t2e5ba) {margin:0;}"
};
function Oe(t, n) {
	ne(n, !0), V(t, De);
	let r = ce(n, "rail", 3, !1), a = [
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
	], s = {
		inbox: "inbox",
		sent: "send",
		drafts: "draft",
		archive: "archive",
		junk: "spam",
		trash: "trash",
		snoozed: "clock",
		unimportant: "down",
		all: "all"
	}, l = {
		inbox: 0,
		unimportant: 1,
		snoozed: 2,
		drafts: 3,
		sent: 4,
		archive: 5,
		junk: 6,
		trash: 7,
		all: 8
	}, u = U(() => n.mail.accounts.filter((e) => !e.error).length > 1), p = X(e(y())), g = X(null);
	function y() {
		try {
			return JSON.parse(localStorage.getItem("atlas-email-folded") ?? "{}");
		} catch {
			return {};
		}
	}
	function b(e) {
		P(p, {
			...C(p),
			[e]: !C(p)[e]
		}, !0);
		try {
			localStorage.setItem("atlas-email-folded", JSON.stringify(C(p)));
		} catch {}
	}
	function S(e) {
		let t = n.mail.folders.filter((t) => t.account === e), r = t.filter((e) => e.role === "other" || e.role === "view"), i = t.filter((e) => e.role !== "other" && e.role !== "view"), a = i.filter((e) => e.role && l[e.role] !== void 0).sort((e, t) => l[e.role] - l[t.role]), o = i.filter((e) => !a.includes(e)).sort((e, t) => e.label.localeCompare(t.label)), s = a.map((e) => ({
			f: e,
			depth: 0,
			children: 0
		})), c = (e) => e.label.split(e.delimiter ?? "/");
		for (let t of o) {
			let n = c(t).length - 1, r = o.filter((e) => e !== t && e.label.startsWith(t.label + (t.delimiter ?? "/"))).length;
			o.some((n) => n !== t && t.label.startsWith(n.label + (n.delimiter ?? "/")) && C(p)[`${e}:${n.path}`]) || s.push({
				f: t,
				depth: n,
				children: r
			});
		}
		return {
			main: s,
			other: r
		};
	}
	let O = (e) => e.label.split(e.delimiter ?? "/").at(-1) ?? e.label;
	function A(e) {
		n.mail.go(e), n.onpicked?.();
	}
	let j = (e, t = null) => n.mail.view.name === e && n.mail.view.account === t, N = (e) => n.mail.view.name === "folder" && n.mail.view.account === e.account && n.mail.view.folder === e.path, F = (e) => [
		"inbox",
		"snoozed",
		"drafts",
		"scheduled",
		"unimportant"
	].includes(e) ? n.mail.counts[e] : void 0;
	function I(e, t) {
		e.preventDefault(), P(g, null);
		let r = JSON.parse(e.dataTransfer?.getData("application/x-atlas-mail") || "[]"), i = n.mail.rows.filter((e) => r.includes(e.id) && e.account === t.account);
		i.length ? n.mail.moveTo(t.path, t.label, i) : r.length && n.mail.toast("Mail moves within its own account", "error");
	}
	var L = Ee();
	let R;
	var z = T(L), ee = T(z);
	D(ee, {
		name: "pen",
		size: 17
	});
	var te = _(ee), H = (e) => {
		var t = le();
		f(e, t);
	};
	m(te, (e) => {
		r() || e(H);
	}), M(z);
	var W = _(z, 2);
	B(W, 21, () => a, ([e, t, n]) => e, (e, t) => {
		var n = U(() => ae(C(t), 3));
		let i = () => C(n)[0], a = () => C(n)[1], s = () => C(n)[2], l = U(() => F(i()));
		var p = v(), g = w(p), y = (e) => {
			var t = fe();
			let n;
			var p = T(t);
			D(p, { get name() {
				return s();
			} });
			var g = _(p, 2), v = (e) => {
				var t = ue(), n = E(t, !0);
				d(() => o(n, C(u) && i() === "inbox" ? "All inboxes" : a())), f(e, t);
			};
			m(g, (e) => {
				r() || e(v);
			});
			var y = _(g, 2), b = (e) => {
				var t = de();
				let n;
				var r = E(t, !0);
				d(() => {
					n = h(t, 1, "n svelte-t2e5ba", null, n, { strong: i() === "inbox" }), o(r, i() === "inbox" ? C(l).unread : C(l).total);
				}), f(e, t);
			};
			m(y, (e) => {
				C(l) && (i() === "inbox" ? C(l).unread : C(l).total) && e(b);
			}), M(t), d((e) => {
				n = h(t, 1, "row svelte-t2e5ba", null, n, { on: e }), Z(t, "title", a());
			}, [() => j(i())]), c("click", t, () => A({
				name: i(),
				account: null,
				folder: null,
				label: C(u) && i() === "inbox" ? "All inboxes" : a()
			})), f(e, t);
		};
		m(g, (e) => {
			(i() !== "scheduled" && i() !== "unimportant" || (C(l)?.total ?? 0) > 0) && e(y);
		}), f(e, p);
	}), M(W);
	var G = _(W, 2);
	B(G, 17, () => n.mail.accounts, (e) => e.name, (e, t) => {
		let a = U(() => `acct:${C(t).name}`), l = U(() => S(C(t).name));
		var u = we(), y = T(u), k = T(y), j = (e) => {
			var n = pe();
			let r;
			d(() => r = h(n, 1, "dot svelte-t2e5ba", null, r, {
				busy: C(t).syncing,
				bad: C(t).error || C(t).status?.state === "error"
			})), f(e, n);
		}, F = (e) => {
			var n = ge(), r = w(n);
			{
				let e = U(() => C(p)[C(a)] ? "right" : "down");
				D(r, {
					get name() {
						return C(e);
					},
					size: 12
				});
			}
			var i = _(r, 2), s = E(i, !0), c = _(i, 2), l = (e) => {
				var t = me();
				f(e, t);
			};
			m(c, (e) => {
				(C(t).syncing || C(t).status?.state === "syncing") && e(l);
			});
			var u = _(c, 2), h = (e) => {
				var n = he();
				d(() => Z(n, "title", C(t).status.error)), f(e, n);
			};
			m(u, (e) => {
				C(t).status?.state === "offline" && e(h);
			}), d(() => o(s, C(t).name)), f(e, n);
		};
		m(k, (e) => {
			r() ? e(j) : e(F, -1);
		}), M(y);
		var L = _(y, 2), R = (e) => {
			var r = ve(), i = T(r), a = E(i, !0), s = _(i, 2), l = (e) => {
				var n = _e();
				c("click", n, () => window.dispatchEvent(new CustomEvent("atlas-email:signin", { detail: C(t).name }))), f(e, n);
			};
			m(s, (e) => {
				C(t).outlook && e(l);
			});
			var u = _(s, 2);
			M(r), d(() => o(a, C(t).error ?? C(t).status?.error)), c("click", u, () => n.mail.atlas.plugin.openSettings()), f(e, r);
		};
		m(L, (e) => {
			(C(t).error || C(t).status?.state === "error") && e(R);
		});
		var z = _(L, 2), V = (e) => {
			var n = Ce(), u = w(n);
			B(u, 17, () => C(l).main, ({ f: e, depth: t, children: n }) => e.path, (e, n) => {
				let a = () => C(n).f, l = () => C(n).depth, u = () => C(n).children;
				var v = be();
				let y;
				var S = T(v);
				let w;
				var k = T(S);
				{
					let e = U(() => s[a().role ?? ""] ?? "folder");
					D(k, { get name() {
						return C(e);
					} });
				}
				var j = _(k, 2), F = (e) => {
					var t = ue(), n = E(t, !0);
					d((e) => o(n, e), [() => O(a())]), f(e, t);
				};
				m(j, (e) => {
					r() || e(F);
				});
				var L = _(j, 2), R = (e) => {
					var t = de();
					let n;
					var r = E(t, !0);
					d(() => {
						n = h(t, 1, "n svelte-t2e5ba", null, n, { strong: a().role === "inbox" }), o(r, a().unread);
					}), f(e, t);
				};
				m(L, (e) => {
					a().unread && a().role !== "sent" && a().role !== "trash" && a().role !== "junk" && a().role !== "drafts" && e(R);
				}), M(S);
				var z = _(S, 2), B = (e) => {
					var n = ye(), r = T(n);
					{
						let e = U(() => C(p)[`${C(t).name}:${a().path}`] ? "right" : "down");
						D(r, {
							get name() {
								return C(e);
							},
							size: 12
						});
					}
					M(n), d(() => Z(n, "aria-label", C(p)[`${C(t).name}:${a().path}`] ? "Show the folders in it" : "Hide the folders in it")), c("click", n, () => b(`${C(t).name}:${a().path}`)), f(e, n);
				};
				m(z, (e) => {
					u() && !r() && e(B);
				}), M(v), d((e) => {
					y = i(v, "", y, { "--depth": r() ? 0 : l() }), w = h(S, 1, "row svelte-t2e5ba", null, w, {
						on: e,
						over: C(g) === `${C(t).name}:${a().path}`
					}), Z(S, "title", a().label);
				}, [() => N(a())]), c("click", S, () => A({
					name: "folder",
					account: C(t).name,
					folder: a().path,
					label: a().label
				})), x("dragover", S, (e) => {
					e.preventDefault(), P(g, `${C(t).name}:${a().path}`);
				}), x("dragleave", S, () => P(g, null)), x("drop", S, (e) => I(e, a())), f(e, v);
			});
			var y = _(u, 2), S = (e) => {
				var n = $(), r = w(n), s = T(r);
				{
					let e = U(() => C(p)[`${C(a)}:other`] ? "down" : "right");
					D(s, {
						get name() {
							return C(e);
						},
						size: 12
					});
				}
				var u = _(s), g = E(u);
				M(r);
				var y = _(r, 2), x = (e) => {
					var n = v(), r = w(n);
					B(r, 17, () => C(l).other, (e) => e.path, (e, n) => {
						var r = xe();
						let a;
						i(r, "", {}, { "--depth": 1 });
						var s = T(r);
						D(s, { name: "folder" });
						var l = _(s), u = E(l, !0);
						M(r), d((e) => {
							a = h(r, 1, "row svelte-t2e5ba", null, a, { on: e }), o(u, C(n).label);
						}, [() => N(C(n))]), c("click", r, () => A({
							name: "folder",
							account: C(t).name,
							folder: C(n).path,
							label: C(n).label
						})), f(e, r);
					}), f(e, n);
				};
				m(y, (e) => {
					C(p)[`${C(a)}:other`] && e(x);
				}), d(() => o(g, `More (${C(l).other.length ?? ""})`)), c("click", r, () => b(`${C(a)}:other`)), f(e, n);
			};
			m(y, (e) => {
				C(l).other.length && !r() && e(S);
			});
			var k = _(y, 2), j = (e) => {
				var n = Se(), r = T(n);
				D(r, {
					name: "plus",
					size: 14
				}), re(), M(n), c("click", n, () => window.dispatchEvent(new CustomEvent("atlas-email:new-folder", { detail: C(t).name }))), f(e, n);
			};
			m(k, (e) => {
				r() || e(j);
			}), f(e, n);
		};
		m(z, (e) => {
			!C(p)[C(a)] && !C(t).error && e(V);
		}), M(u), d(() => {
			Z(y, "aria-expanded", !C(p)[C(a)]), Z(y, "title", C(t).user ?? C(t).name);
		}), c("click", y, () => b(C(a))), f(e, u);
	}, (e) => {
		var t = v(), i = w(t), a = (e) => {
			var t = Te(), r = _(T(t), 2);
			M(t), c("click", r, () => n.mail.atlas.plugin.openSettings()), f(e, t);
		};
		m(i, (e) => {
			r() || e(a);
		}), f(e, t);
	}), M(L), d(() => R = h(L, 1, "side svelte-t2e5ba", null, R, { rail: r() })), c("click", z, () => n.mail.compose()), f(t, L), k();
}
S(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/MessageList.svelte
var ke = Q("<div class=\"sect svelte-g4my5v\">Everything else</div>"), Ae = Q("<div class=\"sect svelte-g4my5v\"><!> Important<span class=\"faint svelte-g4my5v\"> </span></div> <!>", 1), je = Q("<div> </div>"), Me = Q("<span></span>"), Ne = Q("<span class=\"udot svelte-g4my5v\" aria-label=\"unread\"></span>"), Pe = Q("<span class=\"count svelte-g4my5v\"> </span>"), Fe = Q("<span class=\"draftmark svelte-g4my5v\">· Draft</span>"), Ie = Q("<span class=\"subject svelte-g4my5v\"> <span class=\"snip svelte-g4my5v\"> </span></span>"), Le = Q("<span class=\"star svelte-g4my5v\"><!></span>"), Re = Q("<span class=\"chip acct svelte-g4my5v\"> </span>"), ze = Q("<span class=\"chip svelte-g4my5v\"> </span>"), Be = Q("<div class=\"line2 svelte-g4my5v\"><span class=\"subject svelte-g4my5v\"> </span></div> <div class=\"line3 svelte-g4my5v\"><!> <!> <span class=\"snip svelte-g4my5v\"> </span></div>", 1), Ve = Q("<div role=\"option\" tabindex=\"-1\" draggable=\"true\"><!> <button class=\"avatar svelte-g4my5v\"><!></button> <div class=\"main svelte-g4my5v\"><div class=\"line1 svelte-g4my5v\"><!> <span class=\"who svelte-g4my5v\"> <!><!></span> <!> <span class=\"marks svelte-g4my5v\"><!> <!> <!></span> <time class=\"date svelte-g4my5v\"> </time></div> <!></div> <div class=\"hover svelte-g4my5v\" role=\"toolbar\" aria-label=\"Actions\"><button title=\"Archive (e)\" class=\"svelte-g4my5v\"><!></button> <button title=\"Delete (#)\" class=\"svelte-g4my5v\"><!></button> <button class=\"svelte-g4my5v\"><!></button> <button title=\"Snooze (h for when)\" class=\"svelte-g4my5v\"><!></button></div></div>"), He = Q("<div class=\"ghost svelte-g4my5v\"><span class=\"svelte-g4my5v\"></span><span class=\"svelte-g4my5v\"></span></div>"), Ue = Q("<div role=\"listbox\" aria-label=\"Conversations\" aria-multiselectable=\"true\" tabindex=\"-1\"><div class=\"pad svelte-g4my5v\"><!> <!></div> <!></div>"), We = {
	hash: "svelte-g4my5v",
	code: ".list.svelte-g4my5v {position:relative;overflow-y:auto;height:100%;outline:none;contain:strict;}.pad.svelte-g4my5v {position:relative;}.row.svelte-g4my5v {position:absolute;left:0;right:0;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:0 12px 0 10px;border-bottom:1px solid var(--border);cursor:default;user-select:none;transition:transform 120ms var(--ease);}.row.svelte-g4my5v:hover {background:var(--bg-hover);}.row.cursor.svelte-g4my5v {box-shadow:inset 3px 0 0 var(--accent);}.row.open.svelte-g4my5v {background:var(--accent-soft);}.row.checked.svelte-g4my5v {background:var(--accent-sel);}.avatar.svelte-g4my5v {all:unset;flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);cursor:pointer;}.compact.svelte-g4my5v .avatar:where(.svelte-g4my5v) {width:20px;height:20px;background:transparent;color:var(--text-faint);}.checked.svelte-g4my5v .avatar:where(.svelte-g4my5v) {background:var(--accent);color:var(--accent-fg);}.avatar.svelte-g4my5v:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.dotonly.svelte-g4my5v {width:8px;height:8px;border-radius:50%;}.dotonly.on.svelte-g4my5v {background:var(--accent);}.main.svelte-g4my5v {flex:1;min-width:0;display:grid;gap:2px;}.line1.svelte-g4my5v, .line2.svelte-g4my5v, .line3.svelte-g4my5v {display:flex;align-items:center;gap:6px;min-width:0;}.udot.svelte-g4my5v {width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none;}.who.svelte-g4my5v {flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.compact.svelte-g4my5v .who:where(.svelte-g4my5v) {flex:0 0 28%;}.unread.svelte-g4my5v .who:where(.svelte-g4my5v), .unread.svelte-g4my5v .subject:where(.svelte-g4my5v) {font-weight:650;color:var(--heading);}.count.svelte-g4my5v {margin-left:5px;color:var(--text-faint);font-size:0.86em;font-weight:400;}.draftmark.svelte-g4my5v {color:var(--red);font-weight:400;}.marks.svelte-g4my5v {margin-left:auto;display:flex;gap:4px;align-items:center;color:var(--text-faint);}.star.svelte-g4my5v {color:var(--yellow);}.date.svelte-g4my5v {flex:none;color:var(--text-muted);font-size:0.85em;font-variant-numeric:tabular-nums;}.unread.svelte-g4my5v .date:where(.svelte-g4my5v) {color:var(--text);font-weight:600;}.subject.svelte-g4my5v {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.compact.svelte-g4my5v .subject:where(.svelte-g4my5v) {flex:1;}.snip.svelte-g4my5v {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.92em;}.chip.svelte-g4my5v {flex:none;font-size:0.78em;padding:0 6px;border-radius:999px;background:hsl(var(--h, 220) 60% 50% / 0.16);color:var(--text);line-height:1.6;}.chip.acct.svelte-g4my5v {background:var(--bg-active);color:var(--text-muted);}\n  /* over the date's line (hidden on hover), not over the subject; centred in a one-line compact row */.hover.svelte-g4my5v {position:absolute;right:8px;top:5px;display:none;gap:0;background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 1px;box-shadow:var(--shadow-sm);}.row.svelte-g4my5v:hover .hover:where(.svelte-g4my5v) {display:flex;}.compact.svelte-g4my5v .hover:where(.svelte-g4my5v) {top:50%;transform:translateY(-50%);}.row.svelte-g4my5v:hover .date:where(.svelte-g4my5v), .row.svelte-g4my5v:hover .marks:where(.svelte-g4my5v) {visibility:hidden;}.hover.svelte-g4my5v button:where(.svelte-g4my5v) {all:unset;cursor:pointer;padding:2px 5px;border-radius:var(--radius-sm);color:var(--text-muted);min-width:22px;min-height:20px;display:grid;place-items:center;}.hover.svelte-g4my5v button:where(.svelte-g4my5v):hover {background:var(--bg-hover);color:var(--text);}.swipe.svelte-g4my5v {position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-start;padding:0 20px;color:#fff;background:var(--green);font-weight:600;z-index:-1;}.swipe.left.svelte-g4my5v {justify-content:flex-end;background:var(--accent);}.ghost.svelte-g4my5v {position:absolute;left:0;right:0;padding:14px 16px 0 54px;display:grid;gap:8px;border-bottom:1px solid var(--border);}.ghost.svelte-g4my5v span:where(.svelte-g4my5v) {height:10px;border-radius:4px;background:var(--bg-hover);width:40%;}.ghost.svelte-g4my5v span:where(.svelte-g4my5v) + span:where(.svelte-g4my5v) {width:75%;}\n  @media (prefers-reduced-motion: reduce) {.row.svelte-g4my5v {transition:none;} }.sect.svelte-g4my5v {position:absolute;left:0;right:0;height:28px;display:flex;align-items:center;gap:6px;padding:0 14px;font-size:0.78em;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted);background:var(--bg-secondary, var(--bg));border-bottom:1px solid var(--border);}.sect.svelte-g4my5v .faint:where(.svelte-g4my5v) {font-weight:400;margin-left:2px;}\n  @media (hover: none) {.hover.svelte-g4my5v {display:none !important;} }"
};
function Ge(e, t) {
	ne(t, !0), V(e, We);
	let r = ce(t, "mail", 7), a = ce(t, "compact", 3, !1), l = U(() => a() ? 34 : 76), u = U(() => {
		if (!r().pinning) return 0;
		let e = r().rows.findIndex((e) => !e.flagged);
		return e < 0 ? r().rows.length : e;
	}), g = (e) => e * C(l) + (C(u) ? e < C(u) ? 28 : 56 : 0), y = X(void 0), b = X(0), S = X(600), O = U(() => Math.max(0, Math.floor(C(b) / C(l)) - 8)), F = U(() => Math.min(r().rows.length, Math.ceil((C(b) + C(S)) / C(l)) + 8)), I = U(() => r().rows.slice(C(O), C(F)));
	K(() => {
		r().cursor;
		let e = s(() => r().index());
		if (!C(y) || e < 0) return;
		let t = s(() => g(e));
		t < C(y).scrollTop ? C(y).scrollTop = Math.max(0, t - (e === 0 || e === C(u) ? 28 : 0)) : t + C(l) > C(y).scrollTop + C(y).clientHeight && (C(y).scrollTop = t + C(l) - C(y).clientHeight);
	});
	let R;
	K(() => {
		let e = C(I);
		return clearTimeout(R), R = setTimeout(() => s(() => r().fillSnippets(e)), 250), () => clearTimeout(R);
	});
	function z() {
		C(y) && (P(b, C(y).scrollTop, !0), C(y).scrollTop + C(y).clientHeight > C(y).scrollHeight - C(l) * 10 && r().more());
	}
	function H(e, n) {
		if (e.shiftKey) {
			r().extend(n.id);
			return;
		}
		if (e.ctrlKey || e.metaKey) {
			r().toggle(n.thread), r().cursor = n.id;
			return;
		}
		t.onopen(n);
	}
	function W(e, t) {
		let n = r().checked.includes(t.thread) ? r().rows.filter((e) => r().checked.includes(e.thread)).map((e) => e.id) : [t.id];
		e.dataTransfer?.setData("application/x-atlas-mail", JSON.stringify(n)), e.dataTransfer?.setData("text/plain", `${n.length} conversation${n.length === 1 ? "" : "s"}`), e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
	}
	let G = X(null);
	function q(e, t) {
		e.pointerType === "touch" && P(G, {
			id: t.id,
			x0: e.clientX,
			dx: 0
		}, !0);
	}
	function J(e) {
		C(G) && (C(G).dx = e.clientX - C(G).x0);
	}
	function re(e, t) {
		if (!C(G) || C(G).id !== t.id) return;
		let n = e.currentTarget.clientWidth, i = C(G).dx;
		P(G, null), i < -n / 3 ? r().archive([t]) : i > n / 3 && r().toggleRead([t]);
	}
	let Y = (e) => j(e);
	var ie = Ue();
	let ae;
	var oe = T(ie);
	let Q;
	var le = T(oe), ue = (e) => {
		var t = Ae(), n = w(t);
		i(n, "", {}, { top: "0" });
		var a = T(n);
		D(a, {
			name: "star",
			size: 13,
			filled: !0
		});
		var s = _(a, 2), c = E(s, !0);
		M(n);
		var p = _(n, 2), h = (e) => {
			var t = ke();
			let n;
			d(() => n = i(t, "", n, { top: `${C(u) * C(l) + 28}px` })), f(e, t);
		};
		m(p, (e) => {
			C(u) < r().rows.length && e(h);
		}), d(() => o(c, C(u))), f(e, t);
	};
	m(le, (e) => {
		C(u) && e(ue);
	});
	var de = _(le, 2);
	B(de, 19, () => C(I), (e) => e.thread, (e, t, s) => {
		let u = U(() => C(O) + C(s)), p = U(() => r().checked.includes(C(t).thread)), v = U(() => C(G)?.id === C(t).id ? C(G).dx : 0);
		var y = Ve();
		let b, S;
		var k = T(y), A = (e) => {
			var n = je();
			let r;
			var i = E(n, !0);
			d(() => {
				r = h(n, 1, "swipe svelte-g4my5v", null, r, { left: C(v) < 0 }), o(i, C(v) < 0 ? "Archive" : C(t).unread ? "Read" : "Unread");
			}), f(e, n);
		};
		m(k, (e) => {
			C(v) && e(A);
		});
		var F = _(k, 2);
		let I;
		var R = T(F), z = (e) => {
			D(e, {
				name: "check",
				size: 15
			});
		}, V = (e) => {
			var n = Me();
			let r;
			d(() => r = h(n, 1, "dotonly svelte-g4my5v", null, r, { on: C(t).unread > 0 })), f(e, n);
		}, ne = (e) => {
			var r = n();
			d((e) => o(r, e), [() => ee(C(t).from.at(-1))]), f(e, r);
		};
		m(R, (e) => {
			C(p) ? e(z) : a() ? e(V, 1) : e(ne, -1);
		}), M(F);
		var K = _(F, 2), X = T(K), ie = T(X), ae = (e) => {
			var t = Ne();
			f(e, t);
		};
		m(ie, (e) => {
			C(t).unread > 0 && !a() && e(ae);
		});
		var oe = _(ie, 2), se = T(oe, !0), ce = _(se), Q = (e) => {
			var n = Pe(), r = E(n, !0);
			d(() => o(r, C(t).count)), f(e, n);
		};
		m(ce, (e) => {
			C(t).count > 1 && e(Q);
		});
		var le = _(ce), ue = (e) => {
			var t = Fe();
			f(e, t);
		};
		m(le, (e) => {
			C(t).draft && C(t).count > 1 && e(ue);
		}), M(oe);
		var de = _(oe, 2), fe = (e) => {
			var n = Ie(), r = T(n, !0), i = _(r), a = E(i);
			M(n), d(() => {
				o(r, C(t).subject || "(no subject)"), o(a, `— ${C(t).snippet ?? ""}`);
			}), f(e, n);
		};
		m(de, (e) => {
			a() && e(fe);
		});
		var pe = _(de, 2), me = T(pe), he = (e) => {
			D(e, {
				name: "attach",
				size: 13,
				title: "has files"
			});
		};
		m(me, (e) => {
			C(t).has_attachments && e(he);
		});
		var ge = _(me, 2), _e = (e) => {
			D(e, {
				name: "note",
				size: 13,
				title: "saved as a note"
			});
		};
		m(ge, (e) => {
			C(t).saved && e(_e);
		});
		var ve = _(ge, 2), ye = (e) => {
			var t = Le(), n = T(t);
			D(n, {
				name: "star",
				size: 14,
				filled: !0,
				title: "starred"
			}), M(t), f(e, t);
		};
		m(ve, (e) => {
			C(t).flagged && e(ye);
		}), M(pe);
		var be = _(pe, 2), xe = E(be, !0);
		M(X);
		var $ = _(X, 2), Se = (e) => {
			var n = Be(), a = w(n), s = T(a), c = E(s, !0);
			M(a);
			var l = _(a, 2), u = T(l), p = (e) => {
				var n = Re(), r = E(n, !0);
				d(() => o(r, C(t).account)), f(e, n);
			};
			m(u, (e) => {
				r().view.name !== "folder" && r().view.account === null && r().accounts.length > 1 && e(p);
			});
			var h = _(u, 2);
			B(h, 16, () => C(t).labels.slice(0, 3), (e) => e, (e, t) => {
				var n = ze();
				let r;
				var a = E(n, !0);
				d((e, t) => {
					r = i(n, "", r, { "--h": e }), o(a, t);
				}, [() => Y(t), () => t.replace(/^\$/, "")]), f(e, n);
			});
			var g = _(h, 2), v = E(g, !0);
			M(l), d(() => {
				o(c, C(t).subject || "(no subject)"), o(v, C(t).snippet_missing ? "…" : C(t).snippet);
			}), f(e, n);
		};
		m($, (e) => {
			a() || e(Se);
		}), M(K);
		var Ce = _(K, 2), we = T(Ce), Te = T(we);
		D(Te, { name: "archive" }), M(we);
		var Ee = _(we, 2), De = T(Ee);
		D(De, { name: "trash" }), M(Ee);
		var Oe = _(Ee, 2), ke = T(Oe);
		{
			let e = U(() => C(t).unread ? "read" : "unread");
			D(ke, { get name() {
				return C(e);
			} });
		}
		M(Oe);
		var Ae = _(Oe, 2), He = T(Ae);
		D(He, { name: "clock" }), M(Ae), M(Ce), M(y), d((e, n, a, s, c) => {
			b = h(y, 1, "row svelte-g4my5v", null, b, {
				unread: C(t).unread > 0,
				cursor: r().cursor === C(t).id,
				open: r().openId === C(t).id,
				checked: C(p)
			}), Z(y, "aria-selected", C(p) || r().openId === C(t).id), S = i(y, "", S, {
				top: e,
				height: `${C(l) ?? ""}px`,
				transform: C(v) ? `translateX(${C(v)}px)` : void 0
			}), Z(F, "aria-label", C(p) ? "Uncheck" : "Check"), Z(F, "aria-pressed", C(p)), I = i(F, "", I, { "--h": n }), o(se, a), Z(be, "datetime", s), o(xe, c), Z(Oe, "title", C(t).unread ? "Mark read" : "Mark unread");
		}, [
			() => `${g(C(u)) ?? ""}px`,
			() => j(C(t).from.at(-1)?.addr ?? C(t).subject),
			() => C(t).draft && C(t).count === 1 ? "Draft" : N(C(t).from, r().own),
			() => (/* @__PURE__ */ new Date(C(t).date * 1e3)).toISOString(),
			() => L(C(t).date)
		]), c("click", y, (e) => H(e, C(t))), c("keydown", y, () => {}), x("dragstart", y, (e) => W(e, C(t))), c("pointerdown", y, (e) => q(e, C(t))), c("pointermove", y, J), c("pointerup", y, (e) => re(e, C(t))), x("pointercancel", y, () => P(G, null)), c("click", F, (e) => {
			e.stopPropagation(), r().toggle(C(t).thread);
		}), c("click", we, (e) => {
			e.stopPropagation(), r().archive([C(t)]);
		}), c("click", Ee, (e) => {
			e.stopPropagation(), r().trash([C(t)]);
		}), c("click", Oe, (e) => {
			e.stopPropagation(), r().toggleRead([C(t)]);
		}), c("click", Ae, (e) => {
			e.stopPropagation(), r().snooze(te()[0].at, [C(t)]);
		}), f(e, y);
	}), M(oe);
	var fe = _(oe, 2), pe = (e) => {
		var t = v(), n = w(t);
		B(n, 16, () => Array(8), p, (e, t, n) => {
			var r = He();
			let a;
			d(() => a = i(r, "", a, {
				top: `${n * C(l)}px`,
				height: `${C(l) ?? ""}px`
			})), f(e, r);
		}), f(e, t);
	};
	m(fe, (e) => {
		r().loading && !r().rows.length && e(pe);
	}), M(ie), A(ie, (e) => P(y, e), () => C(y)), d(() => {
		ae = h(ie, 1, "list svelte-g4my5v", null, ae, { compact: a() }), Q = i(oe, "", Q, { height: `${r().rows.length * C(l) + (C(u) ? 56 : 0)}px` });
	}), x("scroll", ie, z), se(ie, "clientHeight", (e) => P(S, e)), f(e, ie), k();
}
S([
	"click",
	"keydown",
	"pointerdown",
	"pointermove",
	"pointerup"
]);
//#endregion
//#region plugins/stable/email/ui/src/InviteCard.svelte
var Ke = Q("<span class=\"faint svelte-720w0p\"> </span>"), qe = Q("<span> </span>"), Je = Q("<span class=\"ok svelte-720w0p\"><!> In your calendar</span>"), Ye = Q("<span class=\"clash svelte-720w0p\"> </span>"), Xe = Q("<span class=\"state svelte-720w0p\"><!> <!></span>"), Ze = Q("<span class=\"given svelte-720w0p\"> </span>"), Qe = Q("<div class=\"answer svelte-720w0p\" role=\"group\" aria-label=\"Answer the invitation\"><!> <button>Accept</button> <button>Maybe</button> <button>Decline</button></div>"), $e = Q("<div><!> <div class=\"what svelte-720w0p\"><b class=\"svelte-720w0p\"> </b> <span> <!></span> <!> <!> <!> <!></div> <!></div>"), et = {
	hash: "svelte-720w0p",
	code: ".invite.svelte-720w0p {display:flex;flex-wrap:wrap;gap:10px 12px;align-items:flex-start;padding:10px 12px;margin-bottom:10px;border-radius:var(--radius);border:1px solid var(--border-strong);background:var(--accent-soft);}.invite.cancelled.svelte-720w0p b:where(.svelte-720w0p) {text-decoration:line-through;}.what.svelte-720w0p {display:grid;gap:2px;flex:1 1 220px;min-width:0;}.faint.svelte-720w0p {color:var(--text-muted);}.state.svelte-720w0p {display:flex;flex-wrap:wrap;gap:4px 10px;font-size:0.9em;margin-top:2px;}.ok.svelte-720w0p {display:inline-flex;align-items:center;gap:4px;color:var(--success, var(--text));}.clash.svelte-720w0p {color:var(--warning, var(--text-muted));}.answer.svelte-720w0p {display:flex;align-items:center;gap:6px;flex-wrap:wrap;}.given.svelte-720w0p {color:var(--text-muted);font-size:0.9em;margin-right:4px;}.answer.svelte-720w0p button:where(.svelte-720w0p) {padding:4px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);cursor:pointer;}.answer.svelte-720w0p button:where(.svelte-720w0p):hover:not(:disabled) {border-color:var(--accent);}.answer.svelte-720w0p button.on:where(.svelte-720w0p) {background:var(--accent);color:var(--accent-fg);border-color:transparent;}.answer.svelte-720w0p button:where(.svelte-720w0p):disabled {opacity:0.6;cursor:default;}"
};
function tt(e, t) {
	ne(t, !0), V(e, et);
	let n = X(null), r = X(null), i = X(!1), a = U(() => C(r) ?? t.invite.answer);
	K(() => {
		let e = t.id;
		P(n, null), t.mail.call("invite_status", { id: e }).then((r) => {
			e === t.id && P(n, r, !0);
		}).catch(() => {});
	});
	let s = (e) => /* @__PURE__ */ new Date(`${e}T00:00:00`), l = (e) => e.length > 10 ? new Date(e) : s(e), u = (e) => e.toLocaleDateString(void 0, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: e.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() ? void 0 : "numeric"
	}), p = (e, t) => e.toLocaleTimeString(void 0, {
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit",
		timeZone: t
	}), g = (e, t) => e.toDateString() === t.toDateString(), v = U(() => {
		if (!t.invite.start) return "";
		let e = l(t.invite.start), n = t.invite.end ? l(t.invite.end) : null;
		if (t.invite.all_day) {
			let t = n ? /* @__PURE__ */ new Date(n.getTime() - 864e5) : e;
			return g(e, t) ? `${u(e)} · all day` : `${u(e)} – ${u(t)}`;
		}
		let r = n ? g(e, n) ? `${p(e)} – ${p(n)}` : `${p(e)} – ${u(n)} ${p(n)}` : p(e);
		return `${u(e)} · ${r}`;
	}), y = U(() => {
		if (!t.invite.zone || t.invite.all_day || !t.invite.start) return "";
		try {
			let e = t.invite.zone.split("/").pop().replace(/_/g, " ");
			return `${p(l(t.invite.start), t.invite.zone)} in ${e}`;
		} catch {
			return "";
		}
	}), b = U(() => {
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
	})[e] ?? "", S = U(() => t.invite.method === "REQUEST" && !t.invite.mine);
	async function w(e) {
		P(i, !0);
		try {
			let i = await t.mail.call("answer_invite", {
				id: t.id,
				partstat: e
			});
			P(r, e, !0);
			let a = i.calendar ? " · in your calendar" : i.calendar_error && e !== "DECLINED" ? " · not filed in a calendar" : "";
			t.mail.toast(`${x(e)}${a}`, "success"), i.calendar && P(n, {
				...C(n) ?? { conflicts: [] },
				in_calendar: !0
			}, !0);
		} catch (e) {
			t.mail.toast(`Could not answer: ${e.message}`, "error");
		} finally {
			P(i, !1);
		}
	}
	var O = $e();
	let A;
	var j = T(O);
	D(j, {
		name: "calendar",
		size: 22
	});
	var N = _(j, 2), F = T(N), I = E(F), L = _(F, 2), R = T(L, !0), z = _(R), ee = (e) => {
		var t = Ke(), n = E(t);
		d(() => o(n, `· ${C(b) ?? ""}`)), f(e, t);
	};
	m(z, (e) => {
		C(b) && e(ee);
	}), M(L);
	var te = _(L, 2), H = (e) => {
		var t = Ke(), n = E(t, !0);
		d(() => o(n, C(y))), f(e, t);
	};
	m(te, (e) => {
		C(y) && e(H);
	});
	var W = _(te, 2), G = (e) => {
		var n = qe(), r = E(n, !0);
		d(() => o(r, t.invite.location)), f(e, n);
	};
	m(W, (e) => {
		t.invite.location && e(G);
	});
	var q = _(W, 2), J = (e) => {
		var n = Ke(), r = E(n);
		d(() => o(r, `from ${t.invite.organizer ?? ""}${t.invite.attendees.length > 1 ? ` · ${t.invite.attendees.length} invited` : ""}`)), f(e, n);
	};
	m(q, (e) => {
		t.invite.organizer && e(J);
	});
	var Y = _(q, 2), ie = (e) => {
		var t = Xe(), r = T(t), i = (e) => {
			var t = Je(), n = T(t);
			D(n, {
				name: "check",
				size: 13
			}), re(), M(t), f(e, t);
		};
		m(r, (e) => {
			C(n).in_calendar && e(i);
		});
		var a = _(r, 2);
		B(a, 17, () => C(n).conflicts.slice(0, 2), (e) => e.summary + e.start, (e, t) => {
			var n = Ye(), r = E(n);
			d((e) => o(r, `Overlaps ${C(t).summary ?? ""} (${e ?? ""})`), [() => p(l(C(t).start))]), f(e, n);
		}), M(t), f(e, t);
	};
	m(Y, (e) => {
		C(n) && e(ie);
	}), M(N);
	var ae = _(N, 2), oe = (e) => {
		var t = Qe(), n = T(t), r = (e) => {
			var t = Ze(), n = E(t, !0);
			d((e) => o(n, e), [() => x(C(a))]), f(e, t);
		};
		m(n, (e) => {
			C(a) && e(r);
		});
		var s = _(n, 2);
		let l;
		var u = _(s, 2);
		let p;
		var g = _(u, 2);
		let v;
		M(t), d(() => {
			s.disabled = C(i), l = h(s, 1, "svelte-720w0p", null, l, { on: C(a) === "ACCEPTED" }), u.disabled = C(i), p = h(u, 1, "svelte-720w0p", null, p, { on: C(a) === "TENTATIVE" }), g.disabled = C(i), v = h(g, 1, "svelte-720w0p", null, v, { on: C(a) === "DECLINED" });
		}), c("click", s, () => w("ACCEPTED")), c("click", u, () => w("TENTATIVE")), c("click", g, () => w("DECLINED")), f(e, t);
	};
	m(ae, (e) => {
		C(S) && e(oe);
	}), M(O), d(() => {
		A = h(O, 1, "invite svelte-720w0p", null, A, { cancelled: t.invite.method === "CANCEL" }), o(I, `${t.invite.method === "CANCEL" ? "Cancelled: " : ""}${(t.invite.summary || "An invitation") ?? ""}`), o(R, C(v));
	}), f(e, O), k();
}
S(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/AddressField.svelte
var nt = Q("<span><span class=\"svelte-1y6wl7m\"> </span> <button class=\"svelte-1y6wl7m\">×</button></span>"), rt = Q("<span class=\"svelte-1y6wl7m\"> </span>"), it = Q("<li role=\"option\"><button><b> </b><!></button></li>"), at = Q("<ul class=\"offers svelte-1y6wl7m\" role=\"listbox\"></ul>"), ot = Q("<div class=\"field svelte-1y6wl7m\"><span class=\"label svelte-1y6wl7m\"> </span> <div class=\"box svelte-1y6wl7m\" role=\"presentation\"><!> <input autocomplete=\"off\" spellcheck=\"false\" class=\"svelte-1y6wl7m\"/></div> <!></div>"), st = {
	hash: "svelte-1y6wl7m",
	code: ".field.svelte-1y6wl7m {position:relative;display:flex;align-items:flex-start;gap:8px;border-bottom:1px solid var(--border);padding:4px 0;}.label.svelte-1y6wl7m {flex:none;width:3.2em;color:var(--text-faint);padding-top:5px;font-size:0.9em;}.box.svelte-1y6wl7m {flex:1;display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:28px;cursor:text;min-width:0;}.chip.svelte-1y6wl7m {display:inline-flex;align-items:center;gap:2px;padding:1px 2px 1px 8px;border-radius:999px;background:hsl(var(--h) 55% 50% / 0.16);max-width:100%;}.chip.svelte-1y6wl7m span:where(.svelte-1y6wl7m) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.chip.bad.svelte-1y6wl7m {background:color-mix(in srgb, var(--red) 18%, transparent);outline:1px solid var(--red);}.chip.svelte-1y6wl7m button:where(.svelte-1y6wl7m) {all:unset;cursor:pointer;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;color:var(--text-muted);}.chip.svelte-1y6wl7m button:where(.svelte-1y6wl7m):hover {background:var(--bg-active);color:var(--text);}input.svelte-1y6wl7m {all:unset;flex:1;min-width:8em;padding:4px 0;}.offers.svelte-1y6wl7m {position:absolute;z-index:10;left:3.6em;right:0;top:100%;margin:2px 0 0;padding:4px;list-style:none;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));}.offers.svelte-1y6wl7m button:where(.svelte-1y6wl7m) {all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:baseline;padding:6px 10px;border-radius:var(--radius-sm);cursor:pointer;}.offers.svelte-1y6wl7m button.on:where(.svelte-1y6wl7m), .offers.svelte-1y6wl7m button:where(.svelte-1y6wl7m):hover {background:var(--accent-soft);}.offers.svelte-1y6wl7m span:where(.svelte-1y6wl7m) {color:var(--text-muted);font-size:0.9em;overflow:hidden;text-overflow:ellipsis;}"
};
function ct(t, n) {
	ne(n, !0), V(t, st);
	let a = ce(n, "value", 15), s = ce(n, "autofocus", 3, !1), l = X(""), u = X(e([])), p = X(0), g = X(void 0), v;
	function b(e) {
		let t = [], n = "", r = !1, i = !1;
		for (let a of e) a === "\"" && (r = !r), a === "<" && (i = !0), a === ">" && (i = !1), (a === "," || a === ";") && !r && !i ? (n.trim() && t.push(n.trim()), n = "") : n += a;
		return n.trim() && t.push(n.trim()), t;
	}
	let S = U(() => b(a())), w = (e) => (e.match(/<([^>]+)>/)?.[1] ?? e).trim(), D = (e) => e.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || w(e), N = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w(e));
	function F(e) {
		let t = e.trim().replace(/,$/, "");
		t && (a([...C(S).filter((e) => w(e).toLowerCase() !== w(t).toLowerCase()), t].join(", ")), P(l, ""), P(u, [], !0));
	}
	function I(e) {
		a(C(S).filter((t, n) => n !== e).join(", "));
	}
	function L() {
		if (/[,;]/.test(C(l))) {
			for (let e of b(C(l))) F(e);
			return;
		}
		clearTimeout(v);
		let e = C(l).trim();
		if (!e) {
			P(u, [], !0);
			return;
		}
		v = setTimeout(async () => {
			try {
				let t = await O(n.atlas, "contacts", {
					q: e,
					limit: 7
				}, 10);
				C(l).trim() === e && (P(u, t.contacts.filter((e) => !C(S).some((t) => w(t).toLowerCase() === e.addr)), !0), P(p, 0));
			} catch {
				P(u, [], !0);
			}
		}, 90);
	}
	let R = (e) => e.name ? `${/[,"<>]/.test(e.name) ? `"${e.name.replace(/"/g, "")}"` : e.name} <${e.addr}>` : e.addr;
	function z(e) {
		C(u).length && (e.key === "ArrowDown" || e.key === "ArrowUp") ? (e.preventDefault(), P(p, (C(p) + (e.key === "ArrowDown" ? 1 : C(u).length - 1)) % C(u).length)) : e.key === "Enter" || e.key === "Tab" && C(l).trim() ? C(u).length ? (e.preventDefault(), F(R(C(u)[C(p)]))) : C(l).trim() && (e.preventDefault(), F(C(l))) : e.key === "Backspace" && !C(l) && C(S).length ? (e.preventDefault(), P(l, C(S).at(-1), !0), I(C(S).length - 1)) : e.key === "Escape" && C(u).length && (e.stopPropagation(), P(u, [], !0));
	}
	K(() => {
		s() && C(g)?.focus();
	});
	var ee = ot(), te = T(ee), H = E(te, !0), W = _(te, 2), G = T(W);
	B(G, 19, () => C(S), (e, t) => e + t, (e, t, n) => {
		var r = nt();
		let a, s;
		var l = T(r), u = E(l, !0), p = _(l, 2);
		M(r), d((e, n, c, l) => {
			a = h(r, 1, "chip svelte-1y6wl7m", null, a, { bad: e }), Z(r, "title", C(t)), s = i(r, "", s, { "--h": n }), o(u, c), Z(p, "aria-label", l);
		}, [
			() => !N(C(t)),
			() => j(w(C(t))),
			() => D(C(t)),
			() => `Remove ${w(C(t))}`
		]), c("click", p, (e) => {
			e.stopPropagation(), I(C(n));
		}), f(e, r);
	});
	var q = _(G, 2);
	r(q), A(q, (e) => P(g, e), () => C(g)), M(W);
	var J = _(W, 2), re = (e) => {
		var t = at();
		B(t, 23, () => C(u), (e) => e.addr, (e, t, n) => {
			var r = it(), i = T(r);
			let a;
			var s = T(i), l = E(s, !0), u = _(s), g = (e) => {
				var n = rt(), r = E(n, !0);
				d(() => o(r, C(t).addr)), f(e, n);
			};
			m(u, (e) => {
				C(t).name && e(g);
			}), M(i), M(r), d(() => {
				Z(r, "aria-selected", C(n) === C(p)), a = h(i, 1, "svelte-1y6wl7m", null, a, { on: C(n) === C(p) }), o(l, C(t).name || C(t).addr);
			}), c("mousedown", i, (e) => {
				e.preventDefault(), F(R(C(t)));
			}), f(e, r);
		}), M(t), f(e, t);
	};
	m(J, (e) => {
		C(u).length && e(re);
	}), M(ee), d(() => {
		o(H, n.label), Z(q, "aria-label", n.label);
	}), c("click", W, () => C(g)?.focus()), c("input", q, L), c("keydown", q, z), x("blur", q, () => {
		C(l).trim() && F(C(l)), P(u, [], !0);
	}), y(q, () => C(l), (e) => P(l, e)), f(t, ee), k();
}
S([
	"click",
	"input",
	"keydown",
	"mousedown"
]);
//#endregion
//#region plugins/stable/email/ui/src/Composer.svelte
var lt = Q("<header class=\"bar svelte-zp5xms\"><b class=\"svelte-zp5xms\"> </b> <span class=\"grow svelte-zp5xms\"></span> <button class=\"tool svelte-zp5xms\"><!></button> <button class=\"tool svelte-zp5xms\" title=\"Close (kept in Drafts)\"><!></button></header>"), ut = Q("<option> </option>"), dt = Q("<div class=\"from svelte-zp5xms\"><span class=\"label svelte-zp5xms\">From</span> <select class=\"svelte-zp5xms\"></select></div>"), ft = Q("<button class=\"link svelte-zp5xms\">Cc</button>"), pt = Q("<button class=\"link svelte-zp5xms\">Bcc</button>"), mt = Q("<input class=\"subject svelte-zp5xms\" placeholder=\"Subject\" aria-label=\"Subject\"/>"), ht = Q("<div class=\"preview svelte-zp5xms\"></div>"), gt = Q("<textarea aria-label=\"The message\" spellcheck=\"true\" class=\"svelte-zp5xms\"></textarea>"), _t = Q("<span class=\"faint svelte-zp5xms\"> </span>"), vt = Q("<span class=\"faint svelte-zp5xms\">(forwarded)</span>"), yt = Q("<span class=\"file svelte-zp5xms\"><!><span class=\"svelte-zp5xms\"> </span><!><!><button class=\"svelte-zp5xms\">×</button></span>"), bt = Q("<span class=\"warn svelte-zp5xms\"> </span>"), xt = Q("<div class=\"files svelte-zp5xms\"><!> <!></div>"), St = Q("<div class=\"error svelte-zp5xms\" role=\"alert\"> </div>"), Ct = Q("<div class=\"drop svelte-zp5xms\">Drop to attach</div>"), wt = Q("<button class=\"svelte-zp5xms\"> <span class=\"faint svelte-zp5xms\"> </span></button>"), Tt = Q("<div class=\"later svelte-zp5xms\" role=\"dialog\" aria-label=\"Send later\"><!> <div class=\"custom svelte-zp5xms\"><input placeholder=\"tomorrow 9, mon 14:00, 3h…\" class=\"svelte-zp5xms\"/><button class=\"atlas-btn svelte-zp5xms\">Schedule</button></div></div>"), Et = Q("<button class=\"tool svelte-zp5xms\" title=\"Pop out\"><!></button>"), Dt = Q("<div role=\"form\"><!> <div class=\"fields svelte-zp5xms\"><!> <div class=\"torow svelte-zp5xms\"><div class=\"grow svelte-zp5xms\"><!></div> <!> <!></div> <!> <!> <!></div> <div class=\"tb svelte-zp5xms\" role=\"toolbar\" aria-label=\"Formatting\"><button title=\"Bold (Ctrl+B)\" class=\"svelte-zp5xms\"><b>B</b></button> <button title=\"Italic (Ctrl+I)\" class=\"svelte-zp5xms\"><i>I</i></button> <button title=\"Strikethrough\" class=\"svelte-zp5xms\"><s>S</s></button> <button title=\"Link (Ctrl+K)\" class=\"svelte-zp5xms\"><!></button> <button title=\"List\" class=\"svelte-zp5xms\">•</button> <button title=\"Numbered list\" class=\"svelte-zp5xms\">1.</button> <button title=\"Quote\" class=\"svelte-zp5xms\">”</button> <button title=\"Code\" class=\"svelte-zp5xms\"><code></code></button> <span class=\"grow svelte-zp5xms\"></span> <button title=\"How it will look\"> </button></div> <!> <!> <!> <!> <footer class=\"foot svelte-zp5xms\"><div class=\"send svelte-zp5xms\"><button class=\"atlas-btn primary svelte-zp5xms\" title=\"Send (Ctrl+Enter)\">Send</button> <button class=\"atlas-btn primary more svelte-zp5xms\" title=\"Send later…\"><!></button> <!></div> <button class=\"tool svelte-zp5xms\" title=\"Attach files\"><!></button> <button class=\"tool svelte-zp5xms\" title=\"Attach a file of the vault…\"><!></button> <input type=\"file\" multiple=\"\" hidden=\"\"/> <span class=\"status faint svelte-zp5xms\"> </span> <span class=\"grow svelte-zp5xms\"></span> <!> <button class=\"tool svelte-zp5xms\" title=\"Discard\"><!></button></footer></div>"), Ot = {
	hash: "svelte-zp5xms",
	code: ".composer.svelte-zp5xms {position:relative;display:flex;flex-direction:column;gap:6px;background:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius);padding:0 14px 10px;box-shadow:var(--shadow-sm);min-width:0;}.composer.inline.svelte-zp5xms {margin-left:38px;padding-top:6px;}.composer.over.svelte-zp5xms {outline:2px dashed var(--accent);}.bar.svelte-zp5xms {display:flex;align-items:center;gap:6px;margin:0 -14px;padding:8px 10px 8px 14px;background:var(--bg-alt);border-bottom:1px solid var(--border);border-radius:var(--radius) var(--radius) 0 0;}.bar.svelte-zp5xms b:where(.svelte-zp5xms) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.grow.svelte-zp5xms {flex:1;min-width:0;}.fields.svelte-zp5xms {display:grid;}.from.svelte-zp5xms {display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border);padding:4px 0;}.from.svelte-zp5xms select:where(.svelte-zp5xms) {flex:1;min-width:0;background:transparent;color:var(--text);border:0;padding:4px 0;font:inherit;}.label.svelte-zp5xms {flex:none;width:3.2em;color:var(--text-faint);font-size:0.9em;}.torow.svelte-zp5xms {display:flex;align-items:flex-start;gap:8px;}.torow.svelte-zp5xms .link:where(.svelte-zp5xms) {margin-top:9px;}.link.svelte-zp5xms {all:unset;cursor:pointer;color:var(--text-muted);font-size:0.9em;}.link.svelte-zp5xms:hover {color:var(--accent);}.subject.svelte-zp5xms {all:unset;padding:8px 0;border-bottom:1px solid var(--border);font-weight:600;}.tb.svelte-zp5xms {display:flex;gap:2px;align-items:center;padding-top:2px;}.tb.svelte-zp5xms button:where(.svelte-zp5xms) {all:unset;cursor:pointer;min-width:26px;height:26px;display:grid;place-items:center;border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.92em;padding:0 4px;}.tb.svelte-zp5xms button:where(.svelte-zp5xms):hover, .tb.svelte-zp5xms button.on:where(.svelte-zp5xms) {background:var(--bg-hover);color:var(--text);}textarea.svelte-zp5xms {all:unset;box-sizing:border-box;width:100%;min-height:120px;resize:none;white-space:pre-wrap;line-height:1.55;font-size:15px;font-family:var(--font-prose, var(--font-ui));overflow-y:auto;}.preview.svelte-zp5xms {min-height:120px;padding:4px 0;line-height:1.55;overflow-wrap:anywhere;}.preview.svelte-zp5xms blockquote {margin:0.4em 0;padding-left:0.9em;border-left:3px solid var(--border-strong);color:var(--text-muted);}.files.svelte-zp5xms {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.file.svelte-zp5xms {display:inline-flex;gap:6px;align-items:center;padding:3px 4px 3px 8px;border-radius:var(--radius-sm);background:var(--bg-alt);border:1px solid var(--border);font-size:0.9em;max-width:260px;}.file.svelte-zp5xms span:where(.svelte-zp5xms):not(.faint) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.file.svelte-zp5xms button:where(.svelte-zp5xms) {all:unset;cursor:pointer;width:18px;height:18px;display:grid;place-items:center;border-radius:50%;color:var(--text-muted);}.file.svelte-zp5xms button:where(.svelte-zp5xms):hover {background:var(--bg-hover);}.warn.svelte-zp5xms {color:var(--orange);font-size:0.86em;}.faint.svelte-zp5xms {color:var(--text-faint);}.error.svelte-zp5xms {color:var(--red);font-size:0.9em;}.drop.svelte-zp5xms {position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb, var(--accent) 12%, var(--bg));border-radius:var(--radius);font-weight:600;color:var(--accent-strong);pointer-events:none;}.foot.svelte-zp5xms {display:flex;align-items:center;gap:6px;padding-top:4px;}.send.svelte-zp5xms {position:relative;display:flex;}.send.svelte-zp5xms .atlas-btn.primary:where(.svelte-zp5xms) {background:var(--accent);color:var(--accent-fg);border-color:transparent;font-weight:600;}.send.svelte-zp5xms .atlas-btn:where(.svelte-zp5xms):first-child {border-radius:var(--radius-sm) 0 0 var(--radius-sm);padding-inline:18px;}.send.svelte-zp5xms .more:where(.svelte-zp5xms) {border-radius:0 var(--radius-sm) var(--radius-sm) 0;border-left:1px solid color-mix(in srgb, var(--accent-fg) 25%, transparent) !important;padding-inline:6px;display:grid;place-items:center;}.later.svelte-zp5xms {position:absolute;bottom:110%;left:0;z-index:10;width:280px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));padding:6px;display:grid;gap:2px;}.later.svelte-zp5xms > button:where(.svelte-zp5xms) {all:unset;cursor:pointer;display:flex;justify-content:space-between;padding:7px 10px;border-radius:var(--radius-sm);}.later.svelte-zp5xms > button:where(.svelte-zp5xms):hover {background:var(--bg-hover);}.custom.svelte-zp5xms {display:flex;gap:6px;padding:6px 4px 2px;border-top:1px solid var(--border);margin-top:4px;}.custom.svelte-zp5xms input:where(.svelte-zp5xms) {flex:1;min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 8px;font:inherit;}.tool.svelte-zp5xms {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;}.tool.svelte-zp5xms:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-zp5xms:focus-visible, .tb.svelte-zp5xms button:where(.svelte-zp5xms):focus-visible, .link.svelte-zp5xms:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.status.svelte-zp5xms {font-size:0.85em;}\n  @container (max-width: 560px) {.composer.inline.svelte-zp5xms {margin-left:0;} }"
};
function kt(e, n) {
	ne(n, !0), V(e, Ot);
	let i = ce(n, "c", 7), s = ce(n, "inline", 3, !1), l = ce(n, "big", 15, !1), u = U(() => i().draft), p = X(!!C(u).cc), g = X(!!C(u).bcc), S = X(null), O = X(void 0), j = X(!1), N = X(""), I = X(!1), L = X(void 0), ee, te = U(() => n.mail.accounts.find((e) => e.name === C(u).account)), H = U(() => C(te)?.identities?.filter(Boolean) ?? []), W = U(() => n.mail.accounts.filter((e) => !e.error));
	K(() => {
		C(u).to && C(O)?.focus();
	});
	function J() {
		i().dirty = !0, clearTimeout(ee), ee = setTimeout(re, 2e3);
	}
	async function re() {
		if (i().dirty && !i().sending && (C(u).body.trim() || C(u).subject.trim() || C(u).to.trim())) {
			i().saving = !0;
			try {
				let e = await n.mail.call("save_draft", { ...C(u) });
				C(u).draft = e.id, i().savedAt = Date.now(), i().dirty = !1, i().error = "";
			} catch (e) {
				i().error = `Not saved: ${e.message}`;
			} finally {
				i().saving = !1;
			}
		}
	}
	function Y(e, t = e, n = "text") {
		if (!C(O)) return;
		let { selectionStart: r, selectionEnd: i, value: a } = C(O), o = a.slice(r, i) || n;
		C(u).body = a.slice(0, r) + e + o + t + a.slice(i), J(), requestAnimationFrame(() => {
			C(O).focus(), C(O).setSelectionRange(r + e.length, r + e.length + o.length);
		});
	}
	function ae(e) {
		if (!C(O)) return;
		let { selectionStart: t, selectionEnd: n, value: r } = C(O), i = r.lastIndexOf("\n", t - 1) + 1, a = r.slice(i, n).split("\n").map((t) => e + t).join("\n");
		C(u).body = r.slice(0, i) + a + r.slice(n), J();
	}
	async function oe() {
		let e = await q(n.mail.atlas, "Link to (address):", "https://");
		e && Y("[", `](${e})`, "link text");
	}
	async function se() {
		if (C(S) !== null) {
			P(S, null);
			return;
		}
		try {
			P(S, (await n.mail.call("preview", { body: C(u).body })).html, !0);
		} catch (e) {
			i().error = e.message;
		}
	}
	async function Q(e) {
		for (let t of Array.from(e)) {
			let e = await new Promise((e, n) => {
				let r = new FileReader();
				r.onload = () => e(String(r.result).replace(/^data:[^,]*,/, "")), r.onerror = () => n(r.error), r.readAsDataURL(t);
			});
			C(u).files = [...C(u).files, {
				name: t.name,
				mime: t.type,
				size: t.size,
				data: e
			}];
		}
		J();
	}
	function le() {
		n.mail.atlas.pick({
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
				C(u).files = [...C(u).files, {
					name: e.split("/").at(-1) ?? e,
					path: e
				}], J();
			}
		});
	}
	function ue(e) {
		e.preventDefault(), P(I, !1);
		let t = e.dataTransfer?.getData("text/x-atlas-path") || "";
		if (t) {
			C(u).files = [...C(u).files, {
				name: t.split("/").at(-1) ?? t,
				path: t
			}], J();
			return;
		}
		e.dataTransfer?.files.length && Q(e.dataTransfer.files);
	}
	let de = (e) => {
		C(u).files = C(u).files.filter((t) => t !== e), J();
	}, fe = U(() => C(u).files.reduce((e, t) => e + (t.size ?? 0), 0)), pe = /\b(attached|attachment|attaching|enclosed|ci-joint|pi[eè]ce jointe|adjunto|te adjunto|anexo|allegato|anhang|angeh[aä]ngt)\b/i;
	async function me() {
		if (!C(u).to.trim() && !C(u).cc.trim() && !C(u).bcc.trim()) return i().error = "Who is it for? Fill in To.", !1;
		if (!C(u).subject.trim() && !await R(n.mail.atlas, "Send it without a subject?", { ok: "Send" })) return !1;
		let e = C(u).body.split(/\n\s*>|\nOn .* wrote:/)[0];
		return !(pe.test(e) && !C(u).files.length && !C(u).forward && !await R(n.mail.atlas, "The text mentions an attachment, but nothing is attached. Send anyway?", { ok: "Send anyway" }));
	}
	async function he(e = null) {
		if (!await me()) return;
		clearTimeout(ee), i().sending = !0;
		let t = {
			...C(u),
			send_at: e
		};
		if (n.mail.closeComposer(i().key), e) {
			try {
				await n.mail.call("send", t), n.mail.toast(`Will be sent ${(/* @__PURE__ */ new Date(e * 1e3)).toLocaleString(void 0, {
					weekday: "short",
					day: "numeric",
					month: "short",
					hour: "2-digit",
					hourCycle: "h23",
					minute: "2-digit"
				})}`, "success"), n.mail.later();
			} catch (e) {
				ge(e);
			}
			return;
		}
		let r = Number(F(n.mail.atlas, "undo_send", 10)) * 1e3, a = !1, o = setTimeout(async () => {
			if (!a) try {
				let e = await n.mail.call("send", t, 300);
				e.refused?.length ? n.mail.toast(`Sent, but refused for ${e.refused.map((e) => e.address).join(", ")}`, "error") : n.mail.toast("Sent", "success"), n.mail.later();
			} catch (e) {
				ge(e);
			}
		}, r);
		n.mail.toast("Sending…", "info", {
			until: Date.now() + r,
			undo: async () => {
				a = !0, clearTimeout(o), n.mail.compose({ ...t }, i().inline);
			}
		});
	}
	function ge(e) {
		let t = n.mail.compose({ ...C(u) }, i().inline);
		t.error = `Not sent: ${e.message}`, n.mail.toast(`Not sent: ${e.message}`, "error");
	}
	function _e() {
		let e = ie(C(N));
		if (!e || e * 1e3 < Date.now()) {
			i().error = "When? e.g. tomorrow 8, mon 14:00, 2026-11-02 09:00, 3h";
			return;
		}
		P(j, !1), he(e);
	}
	let ve = () => {
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
	async function ye() {
		if ((!i().dirty && !C(u).draft || !C(u).body.trim() && !C(u).subject.trim() || await R(n.mail.atlas, "Discard this message?", {
			ok: "Discard",
			danger: !0
		})) && (clearTimeout(ee), n.mail.closeComposer(i().key), C(u).draft)) try {
			await n.mail.call("discard_draft", { id: C(u).draft }), n.mail.later();
		} catch {}
	}
	function be(e) {
		e.stopPropagation();
		let t = e.ctrlKey || e.metaKey;
		t && e.key === "Enter" ? (e.preventDefault(), he()) : t && e.key.toLowerCase() === "s" ? (e.preventDefault(), i().dirty = !0, re()) : t && e.key.toLowerCase() === "b" && e.target === C(O) ? (e.preventDefault(), Y("**")) : t && e.key.toLowerCase() === "i" && e.target === C(O) ? (e.preventDefault(), Y("*")) : t && e.key.toLowerCase() === "k" && e.target === C(O) ? (e.preventDefault(), oe()) : t && e.shiftKey && e.key.toLowerCase() === "c" ? (e.preventDefault(), P(p, !0)) : t && e.shiftKey && e.key.toLowerCase() === "b" ? (e.preventDefault(), P(g, !0)) : e.key === "Escape" && !s() && (e.preventDefault(), re(), n.mail.closeComposer(i().key));
	}
	function xe() {
		C(O) && (C(O).style.height = "auto", C(O).style.height = `${Math.min(Math.max(C(O).scrollHeight, s() ? 120 : 220), l() ? 2e3 : 520)}px`);
	}
	K(() => {
		C(u).body, xe();
	});
	var $ = Dt();
	let Se;
	var Ce = T($), we = (e) => {
		var t = lt(), r = T(t), a = E(r, !0), s = _(r, 4), p = T(s);
		D(p, {
			name: "layout",
			size: 15
		}), M(s);
		var m = _(s, 2), h = T(m);
		D(h, {
			name: "x",
			size: 15
		}), M(m), M(t), d(() => {
			o(a, C(u).subject || (C(u).reply_to ? "Reply" : C(u).forward ? "Forward" : "New message")), Z(s, "title", l() ? "Smaller" : "Full size");
		}), c("click", s, () => l(!l())), c("click", m, () => {
			re(), n.mail.closeComposer(i().key);
		}), f(e, t);
	};
	m(Ce, (e) => {
		s() || e(we);
	});
	var Te = _(Ce, 2), Ee = T(Te), De = (e) => {
		var t = dt(), n = _(T(t), 2);
		B(n, 21, () => C(W), (e) => e.name, (e, t) => {
			var n = v(), r = w(n);
			B(r, 16, () => C(t).identities?.length ? C(t).identities : [C(t).from ?? C(t).user ?? C(t).name], (e) => e, (e, n) => {
				var r = ut(), i = E(r), a = {};
				d(() => {
					o(i, `${n ?? ""}${C(W).length > 1 ? ` · ${C(t).name}` : ""}`), a !== (a = `${C(t).name}\u0000${n === C(t).from ? "" : n}`) && (r.value = r.__value = a);
				}), f(e, r);
			}), f(e, n);
		}), M(n);
		var r;
		b(n), M(t), d(() => {
			r !== (r = `${C(u).account}\u0000${C(u).from}`) && (n.value = n.__value = r, a(n, r));
		}), c("change", n, (e) => {
			let [t, n] = e.currentTarget.value.split("\0");
			C(u).account = t, C(u).from = n, J();
		}), f(e, t);
	};
	m(Ee, (e) => {
		(C(W).length > 1 || C(H).length > 1) && e(De);
	});
	var Oe = _(Ee, 2), ke = T(Oe), Ae = T(ke);
	{
		let e = U(() => !C(u).to && !s());
		ct(Ae, {
			get atlas() {
				return n.mail.atlas;
			},
			label: "To",
			get autofocus() {
				return C(e);
			},
			get value() {
				return C(u).to;
			},
			set value(e) {
				C(u).to = e;
			}
		});
	}
	M(ke);
	var je = _(ke, 2), Me = (e) => {
		var t = ft();
		c("click", t, () => P(p, !0)), f(e, t);
	};
	m(je, (e) => {
		C(p) || e(Me);
	});
	var Ne = _(je, 2), Pe = (e) => {
		var t = pt();
		c("click", t, () => P(g, !0)), f(e, t);
	};
	m(Ne, (e) => {
		C(g) || e(Pe);
	}), M(Oe);
	var Fe = _(Oe, 2), Ie = (e) => {
		ct(e, {
			get atlas() {
				return n.mail.atlas;
			},
			label: "Cc",
			get value() {
				return C(u).cc;
			},
			set value(e) {
				C(u).cc = e;
			}
		});
	};
	m(Fe, (e) => {
		C(p) && e(Ie);
	});
	var Le = _(Fe, 2), Re = (e) => {
		ct(e, {
			get atlas() {
				return n.mail.atlas;
			},
			label: "Bcc",
			get value() {
				return C(u).bcc;
			},
			set value(e) {
				C(u).bcc = e;
			}
		});
	};
	m(Le, (e) => {
		C(g) && e(Re);
	});
	var ze = _(Le, 2), Be = (e) => {
		var t = mt();
		r(t), c("input", t, J), y(t, () => C(u).subject, (e) => C(u).subject = e), f(e, t);
	};
	m(ze, (e) => {
		(!s() || !C(u).reply_to) && e(Be);
	}), M(Te);
	var Ve = _(Te, 2), He = T(Ve), Ue = _(He, 2), We = _(Ue, 2), Ge = _(We, 2), Ke = T(Ge);
	D(Ke, {
		name: "open",
		size: 14
	}), M(Ge);
	var qe = _(Ge, 2), Je = _(qe, 2), Ye = _(Je, 2), Xe = _(Ye, 2), Ze = T(Xe);
	Ze.textContent = "<>", M(Xe);
	var Qe = _(Xe, 4);
	let $e;
	var et = E(Qe, !0);
	M(Ve);
	var tt = _(Ve, 2), nt = (e) => {
		var n = ht();
		t(n, () => C(S), !0), M(n), f(e, n);
	}, rt = (e) => {
		var t = gt();
		z(t), A(t, (e) => P(O, e), () => C(O)), d(() => Z(t, "placeholder", C(u).reply_to ? "Your reply…" : "Write… (Markdown: **bold**, *italic*, - lists, > quotes)")), c("input", t, J), y(t, () => C(u).body, (e) => C(u).body = e), f(e, t);
	};
	m(tt, (e) => {
		C(S) === null ? e(rt, -1) : e(nt);
	});
	var it = _(tt, 2), at = (e) => {
		var t = xt(), n = T(t);
		B(n, 17, () => C(u).files, (e) => e.name + (e.path ?? "") + (e.from?.join() ?? ""), (e, t) => {
			var n = yt(), r = T(n);
			D(r, {
				name: "attach",
				size: 13
			});
			var i = _(r), a = E(i, !0), s = _(i), l = (e) => {
				var n = _t(), r = E(n, !0);
				d((e) => o(r, e), [() => G(C(t).size)]), f(e, n);
			};
			m(s, (e) => {
				C(t).size && e(l);
			});
			var u = _(s), p = (e) => {
				var t = vt();
				f(e, t);
			};
			m(u, (e) => {
				C(t).from && e(p);
			});
			var h = _(u);
			M(n), d(() => {
				o(a, C(t).name), Z(h, "aria-label", `Remove ${C(t).name}`);
			}), c("click", h, () => de(C(t))), f(e, n);
		});
		var r = _(n, 2), i = (e) => {
			var t = bt(), n = E(t);
			d((e) => o(n, `${e ?? ""}: most servers take about 25 MB`), [() => G(C(fe))]), f(e, t);
		};
		m(r, (e) => {
			C(fe) > 20971520 && e(i);
		}), M(t), f(e, t);
	};
	m(it, (e) => {
		C(u).files.length && e(at);
	});
	var ot = _(it, 2), st = (e) => {
		var t = St(), n = E(t, !0);
		d(() => o(n, i().error)), f(e, t);
	};
	m(ot, (e) => {
		i().error && e(st);
	});
	var kt = _(ot, 2), At = (e) => {
		var t = Ct();
		f(e, t);
	};
	m(kt, (e) => {
		C(I) && e(At);
	});
	var jt = _(kt, 2), Mt = T(jt), Nt = T(Mt), Pt = _(Nt, 2), Ft = T(Pt);
	D(Ft, {
		name: "down",
		size: 14
	}), M(Pt);
	var It = _(Pt, 2), Lt = (e) => {
		var t = Tt(), n = T(t);
		B(n, 17, ve, (e) => e.label, (e, t) => {
			var n = wt(), r = T(n, !0), i = _(r), a = E(i, !0);
			M(n), d((e) => {
				o(r, C(t).label), o(a, e);
			}, [() => (/* @__PURE__ */ new Date(C(t).at * 1e3)).toLocaleString(void 0, {
				weekday: "short",
				hour: "2-digit",
				hourCycle: "h23",
				minute: "2-digit"
			})]), c("click", n, () => {
				P(j, !1), he(C(t).at);
			}), f(e, n);
		});
		var i = _(n, 2), a = T(i);
		r(a);
		var s = _(a);
		M(i), M(t), c("keydown", a, (e) => {
			e.key === "Enter" && (e.preventDefault(), _e());
		}), y(a, () => C(N), (e) => P(N, e)), c("click", s, _e), f(e, t);
	};
	m(It, (e) => {
		C(j) && e(Lt);
	}), M(Mt);
	var Rt = _(Mt, 2), zt = T(Rt);
	D(zt, { name: "attach" }), M(Rt);
	var Bt = _(Rt, 2), Vt = T(Bt);
	D(Vt, { name: "note" }), M(Bt);
	var Ht = _(Bt, 2);
	A(Ht, (e) => P(L, e), () => C(L));
	var Ut = _(Ht, 2), Wt = E(Ut, !0), Gt = _(Ut, 4), Kt = (e) => {
		var t = Et(), n = T(t);
		D(n, {
			name: "open",
			size: 15
		}), M(t), c("click", t, () => {
			i().inline = !1;
		}), f(e, t);
	};
	m(Gt, (e) => {
		s() && e(Kt);
	});
	var qt = _(Gt, 2), Jt = T(qt);
	D(Jt, { name: "trash" }), M(qt), M(jt), M($), d((e) => {
		Se = h($, 1, "composer svelte-zp5xms", null, Se, {
			inline: s(),
			over: C(I)
		}), Z($, "aria-label", C(u).reply_to ? "Reply" : C(u).forward ? "Forward" : "New message"), $e = h(Qe, 1, "svelte-zp5xms", null, $e, { on: C(S) !== null }), o(et, C(S) === null ? "Preview" : "Edit"), Nt.disabled = i().sending, Z(Pt, "aria-expanded", C(j)), o(Wt, e);
	}, [() => i().saving ? "Saving…" : i().savedAt ? `Draft saved ${new Date(i().savedAt).toLocaleTimeString(void 0, {
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	})}` : ""]), c("keydown", $, be), x("dragover", $, (e) => {
		e.preventDefault(), P(I, !0);
	}), x("dragleave", $, (e) => {
		e.currentTarget === e.target && P(I, !1);
	}), x("drop", $, ue), c("click", He, () => Y("**")), c("click", Ue, () => Y("*")), c("click", We, () => Y("~~")), c("click", Ge, oe), c("click", qe, () => ae("- ")), c("click", Je, () => ae("1. ")), c("click", Ye, () => ae("> ")), c("click", Xe, () => Y("`")), c("click", Qe, se), c("click", Nt, () => he()), c("click", Pt, () => P(j, !C(j))), c("click", Rt, () => C(L)?.click()), c("click", Bt, le), c("change", Ht, (e) => {
		e.currentTarget.files && Q(e.currentTarget.files), e.currentTarget.value = "";
	}), c("click", qt, ye), f(e, $), k();
}
S([
	"keydown",
	"click",
	"change",
	"input"
]);
//#endregion
//#region plugins/stable/email/ui/src/Reader.svelte
var At = Q("<div class=\"loading svelte-j5oobt\"><div class=\"bar svelte-j5oobt\"></div><div class=\"bar short svelte-j5oobt\"></div><div class=\"bar svelte-j5oobt\"></div></div>"), jt = Q("<div class=\"atlas-empty\"><p> </p><button class=\"atlas-btn\">Try again</button></div>"), Mt = Q("<button class=\"tool svelte-j5oobt\" title=\"Back to the list (u)\"><!></button>"), Nt = Q("<button role=\"menuitem\" class=\"svelte-j5oobt\">Open the note</button>"), Pt = Q("<button role=\"menuitem\" class=\"svelte-j5oobt\">Unsubscribe</button>"), Ft = Q("<div class=\"menu svelte-j5oobt\" role=\"menu\" tabindex=\"-1\"><!> <button role=\"menuitem\" class=\"svelte-j5oobt\">Mark important</button> <button role=\"menuitem\" class=\"svelte-j5oobt\">Not important…</button> <!> <button role=\"menuitem\" class=\"svelte-j5oobt\">Make a task</button> <button role=\"menuitem\" class=\"svelte-j5oobt\">Expand all (;)</button></div>"), It = Q("<span class=\"chip svelte-j5oobt\"> </span>"), Lt = Q("<button class=\"link svelte-j5oobt\">Unsubscribe</button>"), Rt = Q("<span class=\"addr svelte-j5oobt\"> </span>"), zt = Q("<span class=\"snip svelte-j5oobt\"> </span>"), Bt = Q("<span> </span>"), Vt = Q("<button class=\"atlas-btn\">Edit the draft</button>"), Ht = Q("<button class=\"mini svelte-j5oobt\" title=\"Reply (r)\"><!></button> <button class=\"mini svelte-j5oobt\" title=\"Reply all (a)\"><!></button> <button class=\"mini svelte-j5oobt\" title=\"Forward (f)\"><!></button>", 1), Ut = Q("<div class=\"atlas-notice error\"> </div>"), Wt = Q("<div class=\"remote svelte-j5oobt\" role=\"status\"><!> <span> </span> <button class=\"link svelte-j5oobt\">Show</button> <button class=\"link svelte-j5oobt\"> </button></div>"), Gt = Q("<div class=\"fwd svelte-j5oobt\"><div class=\"fwdhead svelte-j5oobt\"><b>Forwarded:</b> </div> <!></div>"), Kt = Q("<div class=\"file svelte-j5oobt\"><button class=\"fopen svelte-j5oobt\" title=\"Open in Atlas\"><!><span class=\"fname svelte-j5oobt\"> </span><span class=\"faint svelte-j5oobt\"> </span></button> <button class=\"mini svelte-j5oobt\" title=\"Save into the vault…\"><!></button></div>"), qt = Q("<div class=\"files svelte-j5oobt\"></div>"), Jt = Q("<!> <!> <!> <!> <!>", 1), Yt = Q("<div class=\"loading svelte-j5oobt\"><div class=\"bar svelte-j5oobt\"></div></div>"), Xt = Q("<div class=\"detail svelte-j5oobt\"><div class=\"to svelte-j5oobt\" role=\"presentation\"><!> <!> <span class=\"faint svelte-j5oobt\"> </span> <span class=\"grow svelte-j5oobt\"></span> <!></div> <!></div>"), Zt = Q("<article><button class=\"head svelte-j5oobt\"><span class=\"avatar svelte-j5oobt\"> </span> <span class=\"from svelte-j5oobt\"><b class=\"svelte-j5oobt\"> </b><!></span> <!> <span class=\"when svelte-j5oobt\"><!> </span></button> <!></article>"), Qt = Q("<div class=\"quick svelte-j5oobt\"><button class=\"atlas-btn svelte-j5oobt\"><!> Reply</button> <button class=\"atlas-btn svelte-j5oobt\"><!> Reply all</button> <button class=\"atlas-btn svelte-j5oobt\"><!> Forward</button></div>"), $t = Q("<header class=\"top svelte-j5oobt\"><div class=\"tools svelte-j5oobt\" role=\"toolbar\" aria-label=\"Conversation actions\"><!> <button class=\"tool svelte-j5oobt\" title=\"Archive (e)\"><!></button> <button class=\"tool svelte-j5oobt\"><!></button> <button class=\"tool svelte-j5oobt\"><!></button> <span class=\"sep svelte-j5oobt\"></span> <button class=\"tool svelte-j5oobt\" title=\"Mark unread (⇧U)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Snooze (h)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Move to (v)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Label (l)\"><!></button> <span class=\"grow svelte-j5oobt\"></span> <button><!></button> <div class=\"menu-wrap svelte-j5oobt\"><button class=\"tool svelte-j5oobt\" title=\"More\"><!></button> <!></div></div> <h2 class=\"subject svelte-j5oobt\"> <button><!></button></h2> <div class=\"meta svelte-j5oobt\"><!> <span class=\"faint svelte-j5oobt\"> </span> <!></div></header> <div class=\"cards svelte-j5oobt\"></div> <div class=\"answer svelte-j5oobt\"><!></div>", 1), en = Q("<div class=\"atlas-empty nothing svelte-j5oobt\"><!> <p class=\"svelte-j5oobt\"> </p> <p class=\"faint svelte-j5oobt\">j / k to move, Enter to open, c to write, ? for every key.</p></div>"), tn = Q("<section class=\"reader svelte-j5oobt\" aria-label=\"The conversation\"><!></section>"), nn = {
	hash: "svelte-j5oobt",
	code: ".reader.svelte-j5oobt {height:100%;overflow-y:auto;display:flex;flex-direction:column;box-sizing:border-box;}.top.svelte-j5oobt {position:sticky;top:0;z-index:2;background:var(--bg);padding:8px 20px 10px;border-bottom:1px solid var(--border);display:grid;gap:6px;}.tools.svelte-j5oobt {display:flex;align-items:center;gap:2px;margin-left:-6px;}.tool.svelte-j5oobt {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);min-width:24px;min-height:24px;display:grid;place-items:center;}.tool.svelte-j5oobt:hover {background:var(--bg-hover);color:var(--text);}.tool.on.svelte-j5oobt {color:var(--accent);}.tool.svelte-j5oobt:focus-visible, .head.svelte-j5oobt:focus-visible, .mini.svelte-j5oobt:focus-visible, .fopen.svelte-j5oobt:focus-visible, .star.svelte-j5oobt:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.sep.svelte-j5oobt {width:1px;height:18px;background:var(--border-strong);margin:0 4px;}.grow.svelte-j5oobt {flex:1;}.subject.svelte-j5oobt {margin:0;font-size:1.32em;line-height:1.3;font-weight:600;color:var(--heading);display:flex;gap:8px;align-items:flex-start;overflow-wrap:anywhere;}.star.svelte-j5oobt {all:unset;cursor:pointer;color:var(--text-faint);padding:3px;border-radius:var(--radius-sm);margin-top:1px;}.star.on.svelte-j5oobt {color:var(--yellow);}.meta.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:0.88em;}.chip.svelte-j5oobt {font-size:0.9em;padding:0 7px;border-radius:999px;background:hsl(var(--h) 60% 50% / 0.16);}.faint.svelte-j5oobt {color:var(--text-faint);}.link.svelte-j5oobt {all:unset;cursor:pointer;color:var(--accent);}.link.svelte-j5oobt:hover {text-decoration:underline;}.menu-wrap.svelte-j5oobt {position:relative;}.menu.svelte-j5oobt {position:absolute;right:0;top:100%;z-index:5;min-width:200px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));padding:4px;display:grid;}.menu.svelte-j5oobt button:where(.svelte-j5oobt) {all:unset;cursor:pointer;padding:7px 10px;border-radius:var(--radius-sm);}.menu.svelte-j5oobt button:where(.svelte-j5oobt):hover {background:var(--bg-hover);}.cards.svelte-j5oobt {padding:12px 16px;display:grid;gap:8px;}.card.svelte-j5oobt {border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-alt);overflow:hidden;}.card.open.svelte-j5oobt {background:var(--bg);box-shadow:var(--shadow-sm);}.card.draft.svelte-j5oobt {border-color:color-mix(in srgb, var(--red) 40%, transparent);}.head.svelte-j5oobt {all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;min-width:0;}.head.svelte-j5oobt:hover {background:var(--bg-hover);}.avatar.svelte-j5oobt {flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);}.from.svelte-j5oobt {display:flex;gap:8px;align-items:baseline;min-width:0;flex:0 1 auto;white-space:nowrap;}.unread.svelte-j5oobt .from:where(.svelte-j5oobt) b:where(.svelte-j5oobt) {color:var(--heading);}.addr.svelte-j5oobt {color:var(--text-faint);font-size:0.86em;overflow:hidden;text-overflow:ellipsis;}.snip.svelte-j5oobt {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);}.when.svelte-j5oobt {margin-left:auto;flex:none;color:var(--text-muted);font-size:0.85em;display:flex;gap:5px;align-items:center;}.detail.svelte-j5oobt {padding:0 16px 14px 54px;display:grid;gap:10px;}.to.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;font-size:0.86em;color:var(--text-muted);}.mini.svelte-j5oobt {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;}.mini.svelte-j5oobt:hover {background:var(--bg-hover);color:var(--text);}.remote.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:7px 10px;border-radius:var(--radius-sm);background:var(--bg-hover);font-size:0.86em;color:var(--text-muted);}.fwd.svelte-j5oobt {border-left:3px solid var(--border-strong);padding-left:12px;display:grid;gap:6px;}.fwdhead.svelte-j5oobt {font-size:0.86em;color:var(--text-muted);}.files.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:8px;}.file.svelte-j5oobt {display:flex;align-items:center;border:1px solid var(--border-strong);border-radius:var(--radius);background:var(--bg-alt);}.fopen.svelte-j5oobt {all:unset;cursor:pointer;display:flex;gap:8px;align-items:center;padding:7px 10px;max-width:280px;}.fopen.svelte-j5oobt:hover {color:var(--accent);}.fname.svelte-j5oobt {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}.fopen.svelte-j5oobt .faint:where(.svelte-j5oobt) {white-space:nowrap;flex:none;font-size:0.86em;}.answer.svelte-j5oobt {padding:4px 16px 24px 16px;}.quick.svelte-j5oobt {display:flex;gap:8px;flex-wrap:wrap;padding-left:38px;}.quick.svelte-j5oobt .atlas-btn:where(.svelte-j5oobt) {display:inline-flex;gap:6px;align-items:center;}.nothing.svelte-j5oobt {margin:auto;display:grid;justify-items:center;gap:6px;color:var(--text-faint);text-align:center;padding:40px;}.nothing.svelte-j5oobt p:where(.svelte-j5oobt) {margin:0;}.loading.svelte-j5oobt {padding:24px;display:grid;gap:12px;}.bar.svelte-j5oobt {height:12px;border-radius:4px;background:var(--bg-hover);}.bar.short.svelte-j5oobt {width:40%;}\n  @container (max-width: 560px) {.detail.svelte-j5oobt {padding-left:14px;}.quick.svelte-j5oobt {padding-left:0;}.top.svelte-j5oobt {padding:6px 12px 8px;}.cards.svelte-j5oobt {padding:8px;} }"
};
function rn(t, n) {
	ne(n, !0), V(t, nn);
	let r = ce(n, "narrow", 3, !1), a = U(() => n.mail.open), s = X(e([])), l = X(e([])), u = X(!1), g = -1;
	K(() => {
		if (!C(a) || C(a).thread === g) return;
		g = C(a).thread;
		let e = C(a).messages.at(-1);
		P(s, C(a).messages.filter((t) => !t.seen || t.draft || t === e).map((e) => e.id), !0), P(l, [], !0);
	});
	function y(e) {
		C(a) && P(s, e ? C(a).messages.map((e) => e.id) : [C(a).messages.at(-1).id], !0);
	}
	let b = (e) => P(s, C(s).includes(e) ? C(s).filter((t) => t !== e) : [...C(s), e], !0), S = U(() => n.mail.own), O = (e) => e.map((e) => C(S).includes(e.addr.toLowerCase()) ? "me" : e.name || e.addr).join(", "), A = X(e([]));
	function N(e, t, n) {
		let r = `${t}:${n}`;
		return e.length <= 4 || C(A).includes(r) ? O(e) : `${O(e.slice(0, 3))} and ${e.length - 3} more`;
	}
	let F = U(() => n.mail.composers.find((e) => e.inline)), z = U(() => C(a) ? n.mail.rows.find((e) => e.thread === C(a).thread) : void 0), te = U(() => !!C(a)?.messages.some((e) => e.flagged)), Y = U(() => C(a)?.messages.findLast((e) => e.unsubscribe)?.unsubscribe ? C(a)?.messages.findLast((e) => e.unsubscribe) : void 0), ie = U(() => C(a)?.messages.at(-1)?.folder_role ?? null);
	async function ae(e, t, r = !0) {
		try {
			let i = await n.mail.call("attachment", {
				id: e.id,
				part: t.part,
				name: t.name
			});
			n.mail.atlas.open(i.path, void 0, { beside: r });
		} catch (e) {
			n.mail.toast(`Cannot open ${t.name}: ${e.message}`, "error");
		}
	}
	async function oe(e, t) {
		let r = await q(n.mail.atlas, `Save ${t.name} into which vault folder?`, "attachments");
		if (r) try {
			let i = await n.mail.call("attachment", {
				id: e.id,
				part: t.part,
				name: t.name,
				to: r
			});
			n.mail.toast(`Saved ${i.path}`, "success", { action: {
				label: "Open",
				run: () => n.mail.atlas.open(i.path, void 0, { beside: !0 })
			} });
		} catch (e) {
			n.mail.toast(`Cannot save ${t.name}: ${e.message}`, "error");
		}
	}
	async function se(e) {
		let t = e.from[0]?.addr;
		t && (await n.mail.call("allow_remote", { sender: t }), P(l, [...C(l), ...C(a).messages.filter((e) => e.from[0]?.addr === t).map((e) => e.id)], !0), n.mail.toast(`Pictures from ${t} are shown from now on`));
	}
	async function Q() {
		if (C(Y) && await R(n.mail.atlas, `Unsubscribe from ${C(Y).from[0]?.name || C(Y).from[0]?.addr}?`, { ok: "Unsubscribe" })) try {
			let e = await n.mail.call("unsubscribe", { id: C(Y).id });
			e.open ? window.open(e.open, "_blank") : n.mail.toast(e.done === "mail" ? "Unsubscribe mail sent" : "Unsubscribed", "success");
		} catch (e) {
			n.mail.toast(`Could not unsubscribe: ${e.message}`, "error");
		}
	}
	let le = (e) => e.startsWith("image/") ? "image" : e === "text/calendar" ? "calendar" : "attach";
	var ue = { expandAll: y }, de = tn(), fe = T(de), pe = (e) => {
		var t = At();
		f(e, t);
	}, me = (e) => {
		var t = jt(), r = T(t), i = E(r, !0), a = _(r);
		M(t), d(() => o(i, n.mail.readError)), c("click", a, () => n.mail.openId && n.mail.read(n.mail.openId)), f(e, t);
	}, he = (e) => {
		var t = $t(), g = w(t), O = T(g), k = T(O), R = (e) => {
			var t = Mt(), r = T(t);
			D(r, { name: "back" }), M(t), c("click", t, function(...e) {
				n.onback?.apply(this, e);
			}), f(e, t);
		};
		m(k, (e) => {
			r() && e(R);
		});
		var V = _(k, 2), ne = T(V);
		D(ne, { name: "archive" }), M(V);
		var K = _(V, 2), q = T(K);
		D(q, { name: "trash" }), M(K);
		var X = _(K, 2), ce = T(X);
		D(ce, { name: "spam" }), M(X);
		var ue = _(X, 4), de = T(ue);
		D(de, { name: "unread" }), M(ue);
		var fe = _(ue, 2), pe = T(fe);
		D(pe, { name: "clock" }), M(fe);
		var me = _(fe, 2), he = T(me);
		D(he, { name: "folder" }), M(me);
		var ge = _(me, 2), _e = T(ge);
		D(_e, { name: "label" }), M(ge);
		var ve = _(ge, 4);
		let ye;
		var be = T(ve);
		D(be, { name: "note" }), M(ve);
		var xe = _(ve, 2), $ = T(xe), Se = T($);
		D(Se, { name: "more" }), M($);
		var Ce = _($, 2), we = (e) => {
			var t = Ft(), r = T(t), i = (e) => {
				var t = Nt();
				c("click", t, () => {
					P(u, !1), n.mail.atlas.open(C(a).saved, void 0, { beside: !0 });
				}), f(e, t);
			};
			m(r, (e) => {
				C(a).saved && e(i);
			});
			var o = _(r, 2), s = _(o, 2), l = _(s, 2), d = (e) => {
				var t = Pt();
				c("click", t, () => {
					P(u, !1), Q();
				}), f(e, t);
			};
			m(l, (e) => {
				C(Y) && e(d);
			});
			var p = _(l, 2), h = _(p, 2);
			M(t), x("mouseleave", t, () => P(u, !1)), c("click", o, () => {
				P(u, !1), n.mail.importance(!0);
			}), c("click", s, () => {
				P(u, !1), n.mail.importance(!1);
			}), c("click", p, () => {
				P(u, !1), n.mail.atlas.capture(`- [ ] ${C(a).subject} (mail from ${I(C(a).messages.at(-1)?.from[0], C(S))})`), n.mail.toast("Added a task to today's log");
			}), c("click", h, () => {
				P(u, !1), y(!0);
			}), f(e, t);
		};
		m(Ce, (e) => {
			C(u) && e(we);
		}), M(xe), M(O);
		var Te = _(O, 2), Ee = T(Te), De = _(Ee);
		let Oe;
		var ke = T(De);
		D(ke, {
			name: "star",
			size: 18,
			get filled() {
				return C(te);
			}
		}), M(De), M(Te);
		var Ae = _(Te, 2), je = T(Ae), Me = (e) => {
			var t = v(), n = w(t);
			B(n, 16, () => C(z).labels, (e) => e, (e, t) => {
				var n = It();
				let r;
				var a = E(n, !0);
				d((e, t) => {
					r = i(n, "", r, { "--h": e }), o(a, t);
				}, [() => j(t), () => t.replace(/^\$/, "")]), f(e, n);
			}), f(e, t);
		};
		m(je, (e) => {
			C(z) && e(Me);
		});
		var Ne = _(je, 2), Pe = E(Ne, !0), Fe = _(Ne, 2), Ie = (e) => {
			var t = Lt();
			c("click", t, Q), f(e, t);
		};
		m(Fe, (e) => {
			C(Y) && e(Ie);
		}), M(Ae), M(g);
		var Le = _(g, 2);
		B(Le, 21, () => C(a).messages, (e) => e.id, (e, t) => {
			let r = U(() => C(s).includes(C(t).id)), a = U(() => !!C(t).body?.remote_allowed || C(l).includes(C(t).id));
			var u = Zt();
			let g;
			var v = T(u), y = T(v);
			let x;
			var O = E(y, !0), k = _(y, 2), F = T(k), R = E(F, !0), z = _(F), V = (e) => {
				var n = Rt(), r = E(n, !0);
				d(() => o(r, C(t).from[0]?.addr)), f(e, n);
			};
			m(z, (e) => {
				C(r) && !C(t).draft && e(V);
			}), M(k);
			var te = _(k, 2), ne = (e) => {
				var n = zt(), r = E(n, !0);
				d((e) => o(r, e), [() => C(t).snippet || C(t).body?.text?.slice(0, 160)]), f(e, n);
			};
			m(te, (e) => {
				C(r) || e(ne);
			});
			var K = _(te, 2), q = T(K), re = (e) => {
				D(e, {
					name: "attach",
					size: 13
				});
			};
			m(q, (e) => {
				C(t).has_attachments && e(re);
			});
			var Y = _(q, 1, !0);
			M(K), M(v);
			var X = _(v, 2), ie = (e) => {
				var r = Xt(), i = T(r), s = T(i), u = (e) => {
					var n = Bt(), r = E(n);
					d((e) => o(r, `to ${e ?? ""}`), [() => N(C(t).to, C(t).id, "to")]), f(e, n);
				};
				m(s, (e) => {
					C(t).to.length && e(u);
				});
				var h = _(s, 2), g = (e) => {
					var n = Bt(), r = E(n);
					d((e) => o(r, `cc ${e ?? ""}`), [() => N(C(t).cc, C(t).id, "cc")]), f(e, n);
				};
				m(h, (e) => {
					C(t).cc.length && e(g);
				});
				var v = _(h, 2), y = E(v, !0), b = _(v, 4), x = (e) => {
					var r = Vt();
					c("click", r, () => n.mail.editDraft(C(t).id)), f(e, r);
				}, S = (e) => {
					var r = Ht(), i = w(r), a = T(i);
					D(a, {
						name: "reply",
						size: 15
					}), M(i);
					var o = _(i, 2), s = T(o);
					D(s, {
						name: "replyall",
						size: 15
					}), M(o);
					var l = _(o, 2), u = T(l);
					D(u, {
						name: "forward",
						size: 15
					}), M(l), c("click", i, () => n.mail.reply("reply", C(t).id)), c("click", o, () => n.mail.reply("all", C(t).id)), c("click", l, () => n.mail.reply("forward", C(t).id)), f(e, r);
				};
				m(b, (e) => {
					C(t).draft ? e(x) : e(S, -1);
				}), M(i);
				var O = _(i, 2), k = (e) => {
					var n = Ut(), r = E(n, !0);
					d(() => o(r, C(t).error)), f(e, n);
				}, j = (e) => {
					var r = Jt(), i = w(r), s = (e) => {
						var n = Wt(), r = T(n);
						D(r, {
							name: "lock",
							size: 14
						});
						var i = _(r, 2), a = E(i), s = _(i, 2), u = _(s, 2), p = E(u);
						M(n), d(() => {
							o(a, `${C(t).body.remote ?? ""} remote picture${C(t).body.remote === 1 ? "" : "s"} blocked (they can tell the sender you read it).`), o(p, `Always from ${C(t).from[0]?.addr ?? ""}`);
						}), c("click", s, () => P(l, [...C(l), C(t).id], !0)), c("click", u, () => se(C(t))), f(e, n);
					};
					m(i, (e) => {
						C(t).body.remote && !C(a) && e(s);
					});
					var u = _(i, 2), h = (e) => {
						tt(e, {
							get mail() {
								return n.mail;
							},
							get id() {
								return C(t).id;
							},
							get invite() {
								return C(t).body.invite;
							}
						});
					};
					m(u, (e) => {
						C(t).body.invite && e(h);
					});
					var g = _(u, 2);
					H(g, {
						get html() {
							return C(t).body.html;
						},
						get plain() {
							return C(t).body.plain;
						},
						get remote() {
							return C(a);
						},
						get dark() {
							return n.dark;
						}
					});
					var v = _(g, 2);
					B(v, 17, () => C(t).body.forwarded, p, (e, t) => {
						var r = Gt(), i = T(r), s = _(T(i));
						M(i);
						var c = _(i, 2);
						H(c, {
							get html() {
								return C(t).html;
							},
							get plain() {
								return C(t).plain;
							},
							get remote() {
								return C(a);
							},
							get dark() {
								return n.dark;
							}
						}), M(r), d((e, n) => o(s, ` ${C(t).subject ?? ""} · ${e ?? ""} · ${n ?? ""}`), [() => C(t).from.map(W).join(", "), () => L(C(t).date)]), f(e, r);
					});
					var y = _(v, 2), b = (e) => {
						var n = qt();
						B(n, 21, () => C(t).body.attachments, (e) => e.part, (e, n) => {
							var r = Kt(), i = T(r), a = T(i);
							{
								let e = U(() => le(C(n).mime));
								D(a, { get name() {
									return C(e);
								} });
							}
							var s = _(a), l = E(s, !0), u = _(s), p = E(u, !0);
							M(i);
							var m = _(i, 2), h = T(m);
							D(h, {
								name: "save",
								size: 14
							}), M(m), M(r), d((e) => {
								o(l, C(n).name), o(p, e);
							}, [() => G(C(n).size)]), c("click", i, () => ae(C(t), C(n))), c("click", m, () => oe(C(t), C(n))), f(e, r);
						}), M(n), f(e, n);
					};
					m(y, (e) => {
						C(t).body.attachments.length && e(b);
					}), f(e, r);
				}, F = (e) => {
					var t = Yt();
					f(e, t);
				};
				m(O, (e) => {
					C(t).error ? e(k) : C(t).body ? e(j, 1) : e(F, -1);
				}), M(r), d((e) => o(y, e), [() => J(C(t).date)]), c("click", i, () => P(A, [
					...C(A),
					`${C(t).id}:to`,
					`${C(t).id}:cc`
				], !0)), f(e, r);
			};
			m(X, (e) => {
				C(r) && e(ie);
			}), M(u), d((e, n, a, s, c) => {
				g = h(u, 1, "card svelte-j5oobt", null, g, {
					open: C(r),
					unread: !C(t).seen,
					draft: C(t).draft
				}), Z(v, "aria-expanded", C(r)), x = i(y, "", x, { "--h": e }), o(O, n), o(R, a), Z(K, "title", s), o(Y, c);
			}, [
				() => j(C(t).from[0]?.addr ?? ""),
				() => ee(C(t).from[0]),
				() => C(t).draft ? "Draft" : I(C(t).from[0], C(S)),
				() => J(C(t).date),
				() => L(C(t).date)
			]), c("click", v, () => b(C(t).id)), f(e, u);
		}), M(Le);
		var Re = _(Le, 2), ze = T(Re), Be = (e) => {
			kt(e, {
				get mail() {
					return n.mail;
				},
				get c() {
					return C(F);
				},
				inline: !0
			});
		}, Ve = (e) => {
			var t = Qt(), r = T(t), i = T(r);
			D(i, {
				name: "reply",
				size: 15
			}), re(), M(r);
			var a = _(r, 2), o = T(a);
			D(o, {
				name: "replyall",
				size: 15
			}), re(), M(a);
			var s = _(a, 2), l = T(s);
			D(l, {
				name: "forward",
				size: 15
			}), re(), M(s), M(t), c("click", r, () => n.mail.reply("reply")), c("click", a, () => n.mail.reply("all")), c("click", s, () => n.mail.reply("forward")), f(e, t);
		};
		m(ze, (e) => {
			C(F) ? e(Be) : e(Ve, -1);
		}), M(Re), d((e) => {
			Z(K, "title", C(ie) === "trash" ? "Delete for good" : "Delete (#)"), Z(X, "title", C(ie) === "junk" ? "Not spam" : "Spam (!)"), ye = h(ve, 1, "tool svelte-j5oobt", null, ye, { on: !!C(a).saved }), Z(ve, "title", C(a).saved ? `Saved as ${C(a).saved} — save again to add new messages` : "Save as note (⇧N)"), Z($, "aria-expanded", C(u)), o(Ee, `${(C(a).subject || "(no subject)") ?? ""} `), Oe = h(De, 1, "star svelte-j5oobt", null, Oe, { on: C(te) }), Z(De, "title", C(te) ? "Unstar (s)" : "Star (s)"), Z(De, "aria-pressed", C(te)), o(Pe, e);
		}, [() => `${C(a).messages.length} message${C(a).messages.length === 1 ? "" : "s"}${C(a).messages.at(-1)?.folder_label ? ` · ${C(a).messages.at(-1)?.folder_label}` : ""}`]), c("click", V, () => n.mail.archive()), c("click", K, () => n.mail.trash()), c("click", X, () => n.mail.spam()), c("click", ue, () => n.mail.toggleRead()), c("click", fe, () => n.onpick("snooze")), c("click", me, () => n.onpick("move")), c("click", ge, () => n.onpick("label")), c("click", ve, () => n.mail.saveNote()), c("click", $, () => P(u, !C(u))), c("click", De, () => n.mail.toggleStar()), f(e, t);
	}, ge = (e) => {
		var t = en(), r = T(t);
		D(r, {
			name: "inbox",
			size: 40
		});
		var i = _(r, 2), a = E(i, !0);
		re(2), M(t), d(() => o(a, n.mail.rows.length ? "Choose a conversation to read it." : "Nothing here.")), f(e, t);
	};
	return m(fe, (e) => {
		n.mail.reading && !C(a) ? e(pe) : n.mail.readError ? e(me, 1) : C(a) ? e(he, 2) : e(ge, -1);
	}), M(de), f(t, de), k(ue);
}
S(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/Toasts.svelte
var an = Q("<button class=\"svelte-1rm31ba\">Undo</button>"), on = Q("<button class=\"svelte-1rm31ba\"> </button>"), sn = Q("<div><span class=\"text svelte-1rm31ba\"> </span> <!> <!> <button class=\"x svelte-1rm31ba\" aria-label=\"Close\">×</button></div>"), cn = Q("<div class=\"toasts svelte-1rm31ba\" aria-live=\"polite\"></div>"), ln = {
	hash: "svelte-1rm31ba",
	code: ".toasts.svelte-1rm31ba {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-1rm31ba {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-1rm31ba-in 120ms var(--ease);}.toast.error.svelte-1rm31ba {background:var(--red);color:#fff;}.text.svelte-1rm31ba {min-width:0;overflow-wrap:anywhere;}button.svelte-1rm31ba {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-1rm31ba button:where(.svelte-1rm31ba) {color:#fff;text-decoration:underline;}button.svelte-1rm31ba:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-1rm31ba:focus-visible {outline:2px solid currentColor;}.x.svelte-1rm31ba {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-1rm31ba-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-1rm31ba { animation: none;} }"
};
function un(e, t) {
	ne(t, !0), V(e, ln);
	var n = cn();
	B(n, 21, () => t.mail.toasts, (e) => e.id, (e, n) => {
		var r = sn();
		let i;
		var a = T(r), s = E(a, !0), l = _(a, 2), u = (e) => {
			var r = an();
			c("click", r, async () => {
				t.mail.dismiss(C(n).id), await C(n).undo?.();
			}), f(e, r);
		};
		m(l, (e) => {
			C(n).undo && e(u);
		});
		var p = _(l, 2), g = (e) => {
			var r = on(), i = E(r, !0);
			d(() => o(i, C(n).action.label)), c("click", r, () => {
				t.mail.dismiss(C(n).id), C(n).action?.run();
			}), f(e, r);
		};
		m(p, (e) => {
			C(n).action && e(g);
		});
		var v = _(p, 2);
		M(r), d(() => {
			i = h(r, 1, "toast svelte-1rm31ba", null, i, {
				error: C(n).kind === "error",
				success: C(n).kind === "success"
			}), Z(r, "role", C(n).kind === "error" ? "alert" : "status"), o(s, C(n).text);
		}), c("click", v, () => t.mail.dismiss(C(n).id)), f(e, r);
	}), M(n), f(e, n), k();
}
S(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/keys.ts
var dn = (e) => e.targets().length > 0, fn = [
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
		when: dn,
		run: (e) => e.archive()
	},
	{
		id: "trash",
		title: "Delete (to Trash)",
		group: "Act",
		keys: "#, delete",
		when: dn,
		run: (e) => e.trash()
	},
	{
		id: "spam",
		title: "Spam / not spam",
		group: "Act",
		keys: "!",
		when: dn,
		run: (e) => e.spam()
	},
	{
		id: "star",
		title: "Star / unstar",
		group: "Act",
		keys: "s",
		when: dn,
		run: (e) => e.toggleStar()
	},
	{
		id: "read",
		title: "Mark read",
		group: "Act",
		keys: "shift+i",
		when: dn,
		run: (e) => e.mark("read", !0)
	},
	{
		id: "unread",
		title: "Mark unread",
		group: "Act",
		keys: "shift+u",
		when: dn,
		run: (e) => e.mark("read", !1)
	},
	{
		id: "toggle-read",
		title: "Read / unread",
		group: "Act",
		keys: "m",
		when: dn,
		run: (e) => e.toggleRead()
	},
	{
		id: "snooze",
		title: "Snooze…",
		group: "Act",
		keys: "h, b",
		when: dn,
		run: (e, t) => t.pick("snooze")
	},
	{
		id: "unsnooze",
		title: "Back to the inbox now (unsnooze)",
		group: "Act",
		when: (e) => e.view.name === "snoozed" && dn(e),
		run: (e) => e.unsnooze()
	},
	{
		id: "move",
		title: "Move to…",
		group: "Act",
		keys: "v",
		when: dn,
		run: (e, t) => t.pick("move")
	},
	{
		id: "label",
		title: "Label…",
		group: "Act",
		keys: "l",
		when: dn,
		run: (e, t) => t.pick("label")
	},
	{
		id: "important",
		title: "Important",
		group: "Act",
		keys: "i",
		when: dn,
		run: (e) => e.importance(!0)
	},
	{
		id: "not-important",
		title: "Not important (moves it out of the inbox)",
		group: "Act",
		keys: "n",
		when: dn,
		run: (e) => e.importance(!1)
	},
	{
		id: "note",
		title: "Save as note",
		group: "Act",
		keys: "shift+n",
		when: dn,
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
function pn(e) {
	let t = (e.key.length, e.key.toLowerCase()), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var mn = new Map(fn.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e]))), hn = new Set([...mn.keys()].filter((e) => e.includes(" ")).map((e) => e.split(" ")[0]));
function gn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.split(" ").map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowdown", "↓").replace("arrowup", "↑").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("home", "Home").replace("end", "End").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)).join(" then ")) : [];
}
//#endregion
//#region plugins/stable/email/ui/src/Shortcuts.svelte
var _n = Q("<span class=\"or svelte-8ls7cr\">or</span>"), vn = Q("<!><kbd class=\"svelte-8ls7cr\"> </kbd>", 1), yn = Q("<div class=\"line svelte-8ls7cr\"><span> </span><span class=\"keys svelte-8ls7cr\"></span></div>"), bn = Q("<section class=\"svelte-8ls7cr\"><h3 class=\"svelte-8ls7cr\"> </h3> <!></section>"), xn = Q("<div class=\"scrim svelte-8ls7cr\" role=\"presentation\"><div class=\"sheet svelte-8ls7cr\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Keyboard shortcuts\" tabindex=\"-1\"><header class=\"svelte-8ls7cr\"><h2 class=\"svelte-8ls7cr\">Keyboard shortcuts</h2><span class=\"faint svelte-8ls7cr\">Ctrl+K finds any command by name</span><button class=\"x svelte-8ls7cr\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-8ls7cr\"></div></div></div>"), Sn = {
	hash: "svelte-8ls7cr",
	code: ".scrim.svelte-8ls7cr {position:absolute;inset:0;z-index:60;background:rgba(0, 0, 0, 0.35);display:grid;place-items:center;padding:16px;}.sheet.svelte-8ls7cr {background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-lg);box-shadow:var(--shadow-md, var(--shadow-sm));width:min(980px, 100%);max-height:90%;overflow:auto;padding:18px 22px 22px;}header.svelte-8ls7cr {display:flex;gap:14px;align-items:baseline;margin-bottom:12px;}h2.svelte-8ls7cr {margin:0;font-size:1.15em;}.faint.svelte-8ls7cr {color:var(--text-faint);font-size:0.9em;}.x.svelte-8ls7cr {all:unset;cursor:pointer;margin-left:auto;font-size:1.4em;color:var(--text-muted);padding:0 6px;}.cols.svelte-8ls7cr {columns:3 260px;column-gap:28px;}section.svelte-8ls7cr {break-inside:avoid;margin-bottom:16px;}h3.svelte-8ls7cr {margin:0 0 6px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.line.svelte-8ls7cr {display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:0.92em;}.keys.svelte-8ls7cr {display:flex;gap:4px;align-items:center;flex:none;}.or.svelte-8ls7cr {color:var(--text-faint);font-size:0.8em;}kbd.svelte-8ls7cr {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:5px;border:1px solid var(--border-strong);border-bottom-width:2px;background:var(--bg);}"
};
function Cn(e, t) {
	ne(t, !0), V(e, Sn);
	let n = [...new Set(fn.map((e) => e.group))];
	var r = xn(), i = T(r), a = T(i), s = _(T(a), 2);
	M(a);
	var l = _(a, 2);
	B(l, 20, () => n, (e) => e, (e, t) => {
		var n = bn(), r = T(n), i = E(r, !0), a = _(r, 2);
		B(a, 17, () => fn.filter((e) => e.group === t && e.keys), (e) => e.id, (e, t) => {
			var n = yn(), r = T(n), i = E(r, !0), a = _(r);
			B(a, 22, () => gn(C(t).keys), (e) => e, (e, t, n) => {
				var r = vn(), i = w(r), a = (e) => {
					var t = _n();
					f(e, t);
				};
				m(i, (e) => {
					C(n) && e(a);
				});
				var s = _(i), c = E(s, !0);
				d(() => o(c, t)), f(e, r);
			}), M(a), M(n), d(() => o(i, C(t).title)), f(e, n);
		}), M(n), d(() => o(i, t)), f(e, n);
	}), M(l), M(i), M(r), c("click", r, function(...e) {
		t.onclose?.apply(this, e);
	}), c("keydown", r, (e) => e.key === "Escape" && t.onclose()), c("click", i, (e) => e.stopPropagation()), c("keydown", i, () => {}), c("click", s, function(...e) {
		t.onclose?.apply(this, e);
	}), f(e, r), k();
}
S(["click", "keydown"]);
//#endregion
//#region plugins/stable/email/ui/src/store.svelte.ts
var wn = 100, Tn = class {
	atlas;
	#e = X(e([]));
	get accounts() {
		return C(this.#e);
	}
	set accounts(e) {
		P(this.#e, e, !0);
	}
	#t = X(e([]));
	get own() {
		return C(this.#t);
	}
	set own(e) {
		P(this.#t, e, !0);
	}
	#n = X(e([]));
	get folders() {
		return C(this.#n);
	}
	set folders(e) {
		P(this.#n, e, !0);
	}
	#r = X(e({}));
	get counts() {
		return C(this.#r);
	}
	set counts(e) {
		P(this.#r, e, !0);
	}
	#i = X(e({
		name: "inbox",
		account: null,
		folder: null,
		label: "Inbox"
	}));
	get view() {
		return C(this.#i);
	}
	set view(e) {
		P(this.#i, e, !0);
	}
	#a = X("");
	get query() {
		return C(this.#a);
	}
	set query(e) {
		P(this.#a, e, !0);
	}
	#o = X("");
	get quick() {
		return C(this.#o);
	}
	set quick(e) {
		P(this.#o, e, !0);
	}
	#s = X("");
	get kind() {
		return C(this.#s);
	}
	set kind(e) {
		P(this.#s, e, !0);
	}
	#c = X(e([]));
	get rows() {
		return C(this.#c);
	}
	set rows(e) {
		P(this.#c, e, !0);
	}
	#l = X(0);
	get total() {
		return C(this.#l);
	}
	set total(e) {
		P(this.#l, e, !0);
	}
	#u = X(0);
	get unread() {
		return C(this.#u);
	}
	set unread(e) {
		P(this.#u, e, !0);
	}
	#d = X(e([]));
	get chips() {
		return C(this.#d);
	}
	set chips(e) {
		P(this.#d, e, !0);
	}
	#f = X(!1);
	get loading() {
		return C(this.#f);
	}
	set loading(e) {
		P(this.#f, e, !0);
	}
	#p = X("");
	get error() {
		return C(this.#p);
	}
	set error(e) {
		P(this.#p, e, !0);
	}
	#m = X(null);
	get cursor() {
		return C(this.#m);
	}
	set cursor(e) {
		P(this.#m, e, !0);
	}
	#h = X(e([]));
	get checked() {
		return C(this.#h);
	}
	set checked(e) {
		P(this.#h, e, !0);
	}
	#g = X(null);
	get open() {
		return C(this.#g);
	}
	set open(e) {
		P(this.#g, e, !0);
	}
	#_ = X(null);
	get openId() {
		return C(this.#_);
	}
	set openId(e) {
		P(this.#_, e, !0);
	}
	#v = X(!1);
	get reading() {
		return C(this.#v);
	}
	set reading(e) {
		P(this.#v, e, !0);
	}
	#y = X("");
	get readError() {
		return C(this.#y);
	}
	set readError(e) {
		P(this.#y, e, !0);
	}
	#b = X(e([]));
	get composers() {
		return C(this.#b);
	}
	set composers(e) {
		P(this.#b, e, !0);
	}
	#x = X(e([]));
	get toasts() {
		return C(this.#x);
	}
	set toasts(e) {
		P(this.#x, e, !0);
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
		return O(this.atlas, e, t, n);
	}
	get split() {
		return F(this.atlas, "split_inbox", !1) && this.view.name === "inbox";
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
			let n = e ? Math.max(wn, this.rows.length) : wn, r = await this.call("list", this.params({ limit: n }));
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
				limit: wn,
				offset: this.rows.length
			}));
			if (e !== this.loadSeq) return;
			let n = new Set(this.rows.map((e) => e.thread)), r = t.rows.filter((e) => !n.has(e.thread));
			(t.rows.length < wn || !r.length) && (this.ended = !0), r.length && (this.rows = [...this.rows, ...r], this.fillSnippets());
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
		this.cursor = c?.id ?? null, s && (c && F(this.atlas, "after_action", "next") === "next" ? this.read(c.id) : this.close());
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
		if (!t || await R(this.atlas, `Delete ${e.length === 1 ? "this conversation" : `${e.length} conversations`} for good? This cannot be undone.`, {
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
		return this.snooze(te()[0].at);
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
}, En = Q("<div class=\"grip v svelte-7si10b\" role=\"separator\" aria-orientation=\"vertical\" aria-label=\"Resize the folders\"></div>"), Dn = Q("<aside class=\"side svelte-7si10b\" aria-label=\"Folders\"><!> <!></aside>"), On = Q("<button class=\"tool svelte-7si10b\" title=\"Folders\"><!></button>"), kn = Q("<button class=\"tool svelte-7si10b\" aria-label=\"Clear the search\"><!></button>"), An = Q("<span class=\"chip svelte-7si10b\"><b class=\"svelte-7si10b\"> </b> </span>"), jn = Q("<button class=\"link svelte-7si10b\">Search the servers too ↵</button>"), Mn = Q("<div class=\"chips svelte-7si10b\"><!><!></div>"), Nn = Q("<div class=\"selbar svelte-7si10b\" role=\"toolbar\" aria-label=\"Checked conversations\"><button class=\"tool svelte-7si10b\" title=\"Uncheck all (Esc)\"><!></button> <b> </b> <span class=\"grow svelte-7si10b\"></span> <button class=\"tool svelte-7si10b\" title=\"Archive (e)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Delete (#)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Mark read (⇧I)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Mark unread (⇧U)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Star (s)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Snooze (h)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Move (v)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Label (l)\"><!></button></div>"), Pn = Q("<span class=\"n svelte-7si10b\"> </span>"), Fn = Q("<button role=\"tab\"><!> <!></button>"), In = Q("<div class=\"tabs svelte-7si10b\" role=\"tablist\"></div>"), Ln = Q("<div class=\"row2 svelte-7si10b\"><h1 class=\"svelte-7si10b\"> </h1> <span class=\"faint svelte-7si10b\"> </span> <span class=\"grow svelte-7si10b\"></span> <div class=\"seg svelte-7si10b\" role=\"group\" aria-label=\"Show only\"><button>Unread</button> <button>Starred</button> <button>Files</button> <button title=\"Mail where I am on To\">To me</button></div></div> <!>", 1), Rn = Q("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), zn = Q("<p class=\"svelte-7si10b\">Nothing in the index matches.</p><button class=\"atlas-btn\">Search the servers too</button>", 1), Bn = Q("<p class=\"svelte-7si10b\">No mail account yet.</p><button class=\"atlas-btn\">Add an account…</button>", 1), Vn = Q("<p class=\"zero svelte-7si10b\">Inbox zero.</p><p class=\"faint svelte-7si10b\">Nothing to answer. c writes a new message.</p>", 1), Hn = Q("<p class=\"faint svelte-7si10b\"> </p>"), Un = Q("<div class=\"empty svelte-7si10b\"><!></div>"), Wn = Q("<section class=\"listpane svelte-7si10b\"><header class=\"lhead svelte-7si10b\"><div class=\"row1 svelte-7si10b\"><!> <div class=\"search svelte-7si10b\"><!> <input placeholder=\"Search mail…\" aria-label=\"Search mail\" title=\"Words, or from: to: subject: has:attachment is:unread before: after:\" class=\"svelte-7si10b\"/> <!></div> <button class=\"tool svelte-7si10b\" title=\"Check for new mail (⇧G)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Layout and density\"><!></button> <button class=\"tool svelte-7si10b\" title=\"All commands (Ctrl+K)\"><!></button></div> <!> <!></header> <!></section>"), Gn = Q("<div role=\"separator\" aria-label=\"Resize the list\"></div>"), Kn = Q("<div class=\"readerpane svelte-7si10b\"><!></div>"), qn = Q("<div><!> <!> <!></div>"), Jn = Q("<div class=\"win svelte-7si10b\"><!></div>"), Yn = Q("<div></div>"), Xn = Q("<div class=\"pending svelte-7si10b\"> </div>"), Zn = Q("<div><!> <!> <!> <!> <!> <!> <!></div>"), Qn = {
	hash: "svelte-7si10b",
	code: ".mail.svelte-7si10b {position:relative;height:100%;display:flex;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.side.svelte-7si10b {position:relative;flex:none;width:var(--side-w);border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.narrow.svelte-7si10b .side:where(.svelte-7si10b) {width:100%;}.work.svelte-7si10b {flex:1;min-width:0;display:flex;min-height:0;}.work.below.svelte-7si10b {flex-direction:column;}.listpane.svelte-7si10b {flex:none;width:var(--list-w);display:flex;flex-direction:column;min-height:0;min-width:0;border-right:1px solid var(--border);}.below.svelte-7si10b .listpane:where(.svelte-7si10b) {width:auto;height:var(--list-h);border-right:0;border-bottom:1px solid var(--border);}.full.svelte-7si10b .listpane:where(.svelte-7si10b) {flex:1;width:auto;border-right:0;}.readerpane.svelte-7si10b {flex:1;min-width:0;min-height:0;container-type:inline-size;}.grip.svelte-7si10b {flex:none;background:transparent;position:relative;z-index:3;}.grip.v.svelte-7si10b {width:5px;margin:0 -3px;cursor:col-resize;}.grip.h.svelte-7si10b {height:5px;margin:-3px 0;cursor:row-resize;}.side.svelte-7si10b .grip.v:where(.svelte-7si10b) {position:absolute;top:0;bottom:0;right:-3px;margin:0;}.grip.svelte-7si10b:hover {background:var(--accent-soft);}.lhead.svelte-7si10b {flex:none;padding:8px 10px 6px;display:grid;gap:6px;border-bottom:1px solid var(--border);}.row1.svelte-7si10b, .row2.svelte-7si10b, .selbar.svelte-7si10b, .chips.svelte-7si10b {display:flex;align-items:center;gap:6px;min-width:0;}.search.svelte-7si10b {flex:1;min-width:0;display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 6px 0 10px;color:var(--text-faint);}.search.svelte-7si10b:focus-within {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-7si10b input:where(.svelte-7si10b) {all:unset;flex:1;min-width:0;padding:7px 0;color:var(--text);}.search.svelte-7si10b input:where(.svelte-7si10b)::placeholder {color:var(--text-faint);}h1.svelte-7si10b {margin:0;font-size:1.05em;font-weight:650;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:4.5em;}.row2.svelte-7si10b {flex-wrap:wrap;row-gap:4px;}.faint.svelte-7si10b {color:var(--text-faint);font-size:0.86em;white-space:nowrap;}.grow.svelte-7si10b {flex:1;}.seg.svelte-7si10b {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-7si10b button:where(.svelte-7si10b) {all:unset;cursor:pointer;padding:3px 8px;font-size:0.82em;color:var(--text-muted);}.seg.svelte-7si10b button:where(.svelte-7si10b) + button:where(.svelte-7si10b) {border-left:1px solid var(--border);}.seg.svelte-7si10b button:where(.svelte-7si10b):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-7si10b button.on:where(.svelte-7si10b) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.seg.svelte-7si10b button:where(.svelte-7si10b):focus-visible, .tabs.svelte-7si10b button:where(.svelte-7si10b):focus-visible, .tool.svelte-7si10b:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.tabs.svelte-7si10b {display:flex;gap:2px;margin-bottom:-7px;}.tabs.svelte-7si10b button:where(.svelte-7si10b) {all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px 7px;color:var(--text-muted);border-bottom:2px solid transparent;font-size:0.92em;}.tabs.svelte-7si10b button:where(.svelte-7si10b):hover {color:var(--text);}.tabs.svelte-7si10b button.on:where(.svelte-7si10b) {color:var(--accent-strong);border-bottom-color:var(--accent);font-weight:600;}.n.svelte-7si10b {font-size:0.8em;padding:0 6px;border-radius:999px;background:var(--accent);color:var(--accent-fg);}.chips.svelte-7si10b {flex-wrap:wrap;}.chip.svelte-7si10b {font-size:0.82em;padding:1px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent-strong);}.chip.svelte-7si10b b:where(.svelte-7si10b) {font-weight:600;margin-right:2px;}.link.svelte-7si10b {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;}.selbar.svelte-7si10b {background:var(--accent-soft);border-radius:var(--radius-sm);padding:2px 4px;}.tool.svelte-7si10b {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-7si10b:hover {background:var(--bg-hover);color:var(--text);}.empty.svelte-7si10b {flex:1;display:grid;align-content:center;justify-items:center;gap:8px;padding:30px;text-align:center;color:var(--text-muted);}.empty.svelte-7si10b p:where(.svelte-7si10b) {margin:0;}.zero.svelte-7si10b {font-size:1.3em;font-weight:600;color:var(--heading);}.windows.svelte-7si10b {position:absolute;right:16px;bottom:0;z-index:40;display:flex;gap:12px;align-items:flex-end;max-width:calc(100% - 32px);}.win.svelte-7si10b {width:min(560px, calc(100vw - 32px));max-height:85%;overflow:auto;border-radius:var(--radius) var(--radius) 0 0;box-shadow:var(--shadow-md, 0 8px 30px rgba(0, 0, 0, 0.3));}.windows.big.svelte-7si10b {inset:12px;right:12px;bottom:12px;}.windows.big.svelte-7si10b .win:where(.svelte-7si10b) {width:100%;height:100%;max-height:none;border-radius:var(--radius);}.pending.svelte-7si10b {position:absolute;right:16px;top:12px;z-index:30;font:600 0.9em var(--font-mono);padding:4px 10px;border-radius:var(--radius-sm);background:var(--bg-elev);border:1px solid var(--border-strong);}\n  @container (max-width: 900px) {.seg.svelte-7si10b {display:none;} }"
};
function $n(t, n) {
	ne(n, !0), V(t, Qn);
	let a = new Tn(n.atlas), s = (e, t) => {
		try {
			return localStorage.getItem(`atlas-email-${e}`) ?? t;
		} catch {
			return t;
		}
	}, l = (e, t) => {
		try {
			localStorage.setItem(`atlas-email-${e}`, t);
		} catch {}
	}, p = X(e(s("layout", String(n.atlas.plugin.settings.layout ?? "three")))), g = X(s("density", String(n.atlas.plugin.settings.density ?? "comfortable")) === "compact"), v = X(e(Number(s("side-w", "232")))), b = X(e(Number(s("list-w", "420")))), S = X(e(Number(s("list-h", "320")))), O = X(1200), j = X("list"), N = X(!1), F = X(!1), I = X(document.documentElement.dataset.theme !== "light"), L = X(void 0), R = X(void 0), z = X(""), ee = X(!1), H = U(() => C(O) < 700), W = U(() => !C(H) && C(O) < 1100), G = U(() => C(O) - (C(W) ? 56 : C(v)) - C(b) >= 460), K = U(() => C(H) || C(p) === "three" && !C(G) ? "full" : C(p)), J = U(() => C(K) !== "full" || a.openId !== null || a.reading), ce = U(() => a.composers.filter((e) => !e.inline));
	function Q() {
		if (C(N) || C(F)) {
			P(N, P(F, !1), !0);
			return;
		}
		if (a.checked.length) {
			a.checked = [];
			return;
		}
		if (a.openId !== null) {
			a.close(), P(j, "list");
			return;
		}
		if (a.query) {
			P(z, ""), a.search("");
			return;
		}
	}
	function le(e) {
		if (e.draft && e.count === 1) {
			a.editDraft(e.id);
			return;
		}
		a.read(e.id), C(H) && P(j, "reader");
	}
	let ue = () => a.targets()[0]?.account ?? a.view.account ?? a.accounts[0]?.name;
	function de(e) {
		if (e === "snooze") n.atlas.pick({
			placeholder: "Snooze until… (tomorrow 9, mon 14:00, 3h, 2026-11-02 08:00)",
			tag: "Snooze",
			items: te().map((e) => ({
				value: String(e.at),
				title: e.label
			})),
			typed: (e) => {
				let t = ie(e);
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
				let n = t ? ie(e) : Number(e);
				n && a.snooze(n);
			}
		});
		else if (e === "move" || e === "go") {
			let t = e === "move" ? ue() : null, r = a.folders.filter((e) => (!t || e.account === t) && e.role !== "other" && e.role !== "view" && e.role !== "all");
			n.atlas.pick({
				placeholder: e === "move" ? "Move to which folder?" : "Go to which folder?",
				tag: e === "move" ? "Move" : "Go to",
				items: r.map((e) => ({
					value: `${e.account}\u0000${e.path}`,
					title: e.label,
					detail: a.accounts.length > 1 ? e.account : e.role ?? void 0,
					section: a.accounts.length > 1 ? e.account : void 0
				})),
				typed: e === "move" ? (e) => `New folder “${e}”` : void 0,
				onpick: async (n, r) => {
					if (r && e === "move") {
						try {
							let e = await a.call("folder_create", {
								account: t,
								name: n
							});
							await a.loadFolders(), a.moveTo(e.path, n);
						} catch (e) {
							a.toast(`No folder made: ${e.message}`, "error");
						}
						return;
					}
					let [i, o] = n.split("\0"), s = a.folders.find((e) => e.account === i && e.path === o);
					e === "move" ? a.moveTo(o, s?.label ?? o) : a.go({
						name: "folder",
						account: i,
						folder: o,
						label: s?.label ?? o
					});
				}
			});
		} else if (e === "label") {
			let e = new Set(a.rows.flatMap((e) => e.labels)), t = new Set(a.targets().flatMap((e) => e.labels));
			n.atlas.pick({
				placeholder: "Label… (a label it has is taken off)",
				tag: "Label",
				items: [...e].sort().map((e) => ({
					value: e,
					title: e.replace(/^\$/, ""),
					detail: t.has(e) ? "on it — pick to take it off" : void 0
				})),
				typed: (e) => `New label “${e}”`,
				onpick: (e) => t.has(e) ? a.label([], [e]) : a.label([e], [])
			});
		} else n.atlas.pick({
			placeholder: "Write from a template… (notes in mail/templates/)",
			tag: "Template",
			items: async () => (await a.call("templates")).templates.map((e) => ({
				value: JSON.stringify(e),
				title: e.name,
				detail: e.subject
			})),
			onpick: (e) => {
				let t = JSON.parse(e);
				a.compose({
					subject: t.subject ?? "",
					to: t.to ?? "",
					cc: t.cc ?? "",
					body: t.body
				});
			}
		});
	}
	function fe() {
		n.atlas.pick({
			placeholder: "Do what? (every command of the Email pane)",
			tag: "Email",
			items: fn.filter((e) => e.id !== "palette" && (!e.when || e.when(a))).map((e) => ({
				value: e.id,
				title: e.title,
				detail: gn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => fn.find((t) => t.id === e)?.run(a, me)
		});
	}
	function pe() {
		n.atlas.pick({
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
					value: C(g) ? "comfortable" : "compact",
					title: C(g) ? "Comfortable rows" : "Compact rows",
					detail: C(g) ? "two lines with a preview" : "one line each, more on screen"
				}
			],
			onpick: (e) => {
				e === "compact" || e === "comfortable" ? (P(g, e === "compact"), l("density", e)) : (P(p, e, !0), l("layout", e));
			}
		});
	}
	let me = {
		pick: de,
		palette: fe,
		back: Q,
		focusSearch: () => {
			C(L)?.focus(), C(L)?.select();
		},
		help: () => P(N, !C(N)),
		expandAll: (e) => C(R)?.expandAll(e),
		rules: () => P(F, !0),
		layout: pe
	}, he = X(""), ge;
	function _e(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog] input")) {
			e.key === "Escape" && t === C(L) && C(L)?.blur();
			return;
		}
		if (!C(Ce)?.contains(t) && t !== document.body) return;
		let n = pn(e);
		if ([
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let r = C(he) ? `${C(he)} ${n}` : n;
		if (clearTimeout(ge), !C(he) && hn.has(n)) {
			P(he, n, !0), ge = setTimeout(() => P(he, ""), 1200), e.preventDefault();
			return;
		}
		P(he, "");
		let i = mn.get(r);
		!i || i.when && !i.when(a) || (e.preventDefault(), e.stopPropagation(), i.run(a, me));
	}
	let ve;
	function ye() {
		clearTimeout(ve), ve = setTimeout(() => a.search(C(z)), 140);
	}
	async function be() {
		if (a.search(C(z)), C(z).trim()) try {
			let e = await a.call("search_server", { query: C(z) }, 300);
			e.added && (a.toast(`${e.added} more from the server`), a.load());
		} catch (e) {
			a.toast(`The server search failed: ${e.message}`, "error");
		}
	}
	function xe(e) {
		a.quick = a.quick === e ? "" : e, a.load();
	}
	function $(e) {
		a.kind = e, a.load();
	}
	function Se(e, t) {
		e.preventDefault();
		let n = e.clientX, r = e.clientY, i = C(v), a = C(b), o = C(S), s = (e) => {
			t === "side" ? P(v, Math.max(170, Math.min(420, i + e.clientX - n)), !0) : t === "list" ? P(b, Math.max(300, Math.min(900, a + e.clientX - n)), !0) : P(S, Math.max(160, Math.min(900, o + e.clientY - r)), !0);
		}, c = () => {
			window.removeEventListener("pointermove", s), window.removeEventListener("pointerup", c), l("side-w", String(C(v))), l("list-w", String(C(b))), l("list-h", String(C(S))), document.body.style.userSelect = "";
		};
		document.body.style.userSelect = "none", window.addEventListener("pointermove", s), window.addEventListener("pointerup", c);
	}
	let Ce = X(void 0);
	oe(() => {
		a.start();
		let e = [
			n.atlas.helper.on("changed", () => a.later()),
			n.atlas.helper.on("bodies", () => a.later("list")),
			n.atlas.helper.on("status", (e) => {
				let t = e, n = a.accounts.find((e) => e.name === t.account);
				n && (n.status = t, n.syncing = t.state === "syncing");
			}),
			n.atlas.helper.on("woke", () => {
				a.toast("Snoozed mail is back in the inbox"), a.later();
			}),
			n.atlas.helper.on("rule", (e) => {
				let t = e;
				a.toast(`Rule “${t.rule}”: ${t.count} message${t.count === 1 ? "" : "s"}`);
			})
		], t = new MutationObserver(() => P(I, document.documentElement.dataset.theme !== "light"));
		t.observe(document.documentElement, {
			attributes: !0,
			attributeFilter: ["data-theme"]
		});
		let r = async (e) => {
			let t = e.detail, n = await q(a.atlas, `A new folder in ${t}:`);
			if (n) try {
				await a.call("folder_create", {
					account: t,
					name: n
				}), await a.loadFolders(), a.toast(`Folder “${n}” made`, "success");
			} catch (e) {
				a.toast(`No folder made: ${e.message}`, "error");
			}
		}, i = () => {
			a.loadAccounts(), a.later();
		};
		window.addEventListener("atlas-email:new-folder", r), window.addEventListener("atlas-email:signed-in", i);
		let o = (e) => {
			let t = e.detail ?? {};
			(t.account || t.view === "inbox") && a.go({
				name: "inbox",
				account: t.account ?? null,
				folder: null,
				label: "Inbox"
			}), t.kind && (a.split ? (a.kind = t.kind, a.load()) : a.search(`in:inbox is:${t.kind}`)), t.search && (P(z, t.search, !0), a.search(t.search)), t.id && (a.read(t.id), C(H) && P(j, "reader")), t.compose && a.compose(t.compose), t.reply && a.reply(t.reply.mode, t.reply.id, !1);
		};
		window.addEventListener("atlas-email:open", o);
		let s = window.__atlasEmailOpen;
		return s && (o(new CustomEvent("x", { detail: s })), window.__atlasEmailOpen = void 0), () => {
			e.forEach((e) => e()), t.disconnect(), window.removeEventListener("atlas-email:new-folder", r), window.removeEventListener("atlas-email:signed-in", i), window.removeEventListener("atlas-email:open", o);
		};
	});
	let we = U(() => a.query ? "Search" : a.view.label), Te = [
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
	var Ee = Zn();
	x("keydown", u, _e);
	let De, ke;
	var Ae = T(Ee), je = (e) => {
		var t = Dn(), n = T(t);
		Oe(n, {
			get mail() {
				return a;
			},
			get rail() {
				return C(W);
			},
			onpicked: () => {
				C(H) && P(j, "list");
			}
		});
		var r = _(n, 2), i = (e) => {
			var t = En();
			c("pointerdown", t, (e) => Se(e, "side")), f(e, t);
		};
		m(r, (e) => {
			!C(W) && !C(H) && e(i);
		}), M(t), f(e, t);
	};
	m(Ae, (e) => {
		(!C(H) || C(j) === "side") && e(je);
	});
	var Me = _(Ae, 2), Ne = (e) => {
		var t = qn();
		let i;
		var s = T(t), l = (e) => {
			var t = Wn(), i = T(t), s = T(i), l = T(s), u = (e) => {
				var t = On(), n = T(t);
				D(n, { name: "menu" }), M(t), c("click", t, () => P(j, "side")), f(e, t);
			};
			m(l, (e) => {
				C(H) && e(u);
			});
			var p = _(l, 2), v = T(p);
			D(v, {
				name: "search",
				size: 15
			});
			var b = _(v, 2);
			r(b), A(b, (e) => P(L, e), () => C(L));
			var x = _(b, 2), S = (e) => {
				var t = kn(), n = T(t);
				D(n, {
					name: "x",
					size: 14
				}), M(t), c("click", t, () => {
					P(z, ""), a.search("");
				}), f(e, t);
			};
			m(x, (e) => {
				C(z) && e(S);
			}), M(p);
			var O = _(p, 2), k = T(O);
			D(k, { name: "refresh" }), M(O);
			var N = _(O, 2), F = T(N);
			D(F, { name: "layout" }), M(N);
			var I = _(N, 2), R = T(I);
			D(R, { name: "keyboard" }), M(I), M(s);
			var V = _(s, 2), ee = (e) => {
				var t = Mn(), n = T(t);
				B(n, 17, () => a.chips, ([e, t]) => e + t, (e, t) => {
					var n = U(() => ae(C(t), 2));
					let r = () => C(n)[0], i = () => C(n)[1];
					var a = An(), s = T(a), c = E(s), l = _(s, 1, !0);
					M(a), d(() => {
						o(c, `${r() ?? ""}:`), o(l, i());
					}), f(e, a);
				});
				var r = _(n), i = (e) => {
					var t = jn();
					c("click", t, be), f(e, t);
				};
				m(r, (e) => {
					a.query && e(i);
				}), M(t), f(e, t);
			};
			m(V, (e) => {
				a.chips.length && e(ee);
			});
			var te = _(V, 2), W = (e) => {
				var t = Nn(), n = T(t), r = T(n);
				D(r, { name: "x" }), M(n);
				var i = _(n, 2), s = E(i), l = _(i, 4), u = T(l);
				D(u, { name: "archive" }), M(l);
				var p = _(l, 2), m = T(p);
				D(m, { name: "trash" }), M(p);
				var h = _(p, 2), g = T(h);
				D(g, { name: "read" }), M(h);
				var v = _(h, 2), y = T(v);
				D(y, { name: "unread" }), M(v);
				var b = _(v, 2), x = T(b);
				D(x, { name: "star" }), M(b);
				var S = _(b, 2), C = T(S);
				D(C, { name: "clock" }), M(S);
				var w = _(S, 2), O = T(w);
				D(O, { name: "folder" }), M(w);
				var k = _(w, 2), A = T(k);
				D(A, { name: "label" }), M(k), M(t), d(() => o(s, `${a.checked.length ?? ""} checked`)), c("click", n, () => a.selectWhere("none")), c("click", l, () => a.archive()), c("click", p, () => a.trash()), c("click", h, () => a.mark("read", !0)), c("click", v, () => a.mark("read", !1)), c("click", b, () => a.toggleStar()), c("click", S, () => de("snooze")), c("click", w, () => de("move")), c("click", k, () => de("label")), f(e, t);
			}, ne = (e) => {
				var t = Ln(), n = w(t), r = T(n), i = E(r, !0), s = _(r, 2), l = E(s), u = _(s, 4), p = T(u);
				let g;
				var v = _(p, 2);
				let y;
				var b = _(v, 2);
				let x;
				var S = _(b, 2);
				let O;
				M(u), M(n);
				var k = _(n, 2), A = (e) => {
					var t = In();
					B(t, 21, () => Te, ([e, t, n]) => e, (e, t) => {
						var n = U(() => ae(C(t), 3));
						let r = () => C(n)[0], i = () => C(n)[1], s = () => C(n)[2], l = U(() => a.counts[r()]);
						var u = Fn();
						let p;
						var g = T(u);
						D(g, {
							get name() {
								return s();
							},
							size: 14
						});
						var v = _(g, 1, !0), y = _(v), b = (e) => {
							var t = Pn(), n = E(t, !0);
							d(() => o(n, C(l).unread)), f(e, t);
						};
						m(y, (e) => {
							C(l)?.unread && e(b);
						}), M(u), d(() => {
							Z(u, "aria-selected", (a.kind || "person") === r()), p = h(u, 1, "svelte-7si10b", null, p, { on: (a.kind || "person") === r() }), o(v, i());
						}), c("click", u, () => $(r())), f(e, u);
					}), M(t), f(e, t);
				};
				m(k, (e) => {
					a.split && !a.query && e(A);
				}), d(() => {
					o(i, C(we)), o(l, `${a.total ? `${a.total} conversation${a.total === 1 ? "" : "s"}` : ""}${a.unread ? ` · ${a.unread} unread` : ""}`), g = h(p, 1, "svelte-7si10b", null, g, { on: a.quick === "unread" }), y = h(v, 1, "svelte-7si10b", null, y, { on: a.quick === "starred" }), x = h(b, 1, "svelte-7si10b", null, x, { on: a.quick === "attachments" }), O = h(S, 1, "svelte-7si10b", null, O, { on: a.quick === "mentions" });
				}), c("click", p, () => xe("unread")), c("click", v, () => xe("starred")), c("click", b, () => xe("attachments")), c("click", S, () => xe("mentions")), f(e, t);
			};
			m(te, (e) => {
				a.checked.length ? e(W) : e(ne, -1);
			}), M(i);
			var G = _(i, 2), K = (e) => {
				var t = Rn(), r = T(t, !0), i = _(r), s = T(i), l = _(s);
				M(i), M(t), d(() => o(r, a.error)), c("click", s, () => a.load()), c("click", l, () => n.atlas.plugin.openSettings()), f(e, t);
			}, q = (e) => {
				var t = Un(), r = T(t), i = (e) => {
					var t = zn(), n = _(w(t));
					c("click", n, be), f(e, t);
				}, s = (e) => {
					var t = Bn(), r = _(w(t));
					c("click", r, () => n.atlas.plugin.openSettings()), f(e, t);
				}, l = (e) => {
					var t = Vn();
					re(), f(e, t);
				}, u = (e) => {
					var t = Hn(), n = E(t);
					d(() => o(n, `Nothing here${a.quick ? " with that filter" : ""}.`)), f(e, t);
				};
				m(r, (e) => {
					a.query ? e(i) : a.accounts.length ? a.view.name === "inbox" && !a.quick ? e(l, 2) : e(u, -1) : e(s, 1);
				}), M(t), f(e, t);
			}, J = (e) => {
				Ge(e, {
					get mail() {
						return a;
					},
					get compact() {
						return C(g);
					},
					onopen: le
				});
			};
			m(G, (e) => {
				a.error ? e(K) : !a.loading && !a.rows.length ? e(q, 1) : e(J, -1);
			}), M(t), d(() => Z(t, "aria-label", C(we))), c("input", b, ye), c("keydown", b, (e) => {
				e.key === "Enter" ? (e.preventDefault(), be()) : e.key === "Escape" ? (P(z, ""), a.search(""), C(L)?.blur()) : e.key === "ArrowDown" && C(L)?.blur();
			}), y(b, () => C(z), (e) => P(z, e)), c("click", O, () => fn.find((e) => e.id === "refresh")?.run(a, me)), c("click", N, pe), c("click", I, fe), f(e, t);
		};
		m(s, (e) => {
			(C(K) !== "full" || !C(J) || C(H) && C(j) !== "reader") && e(l);
		});
		var u = _(s, 2), p = (e) => {
			var t = Gn();
			let n;
			d(() => n = h(t, 1, "grip svelte-7si10b", null, n, {
				h: C(K) === "below",
				v: C(K) === "three"
			})), c("pointerdown", t, (e) => Se(e, C(K) === "below" ? "listH" : "list")), f(e, t);
		};
		m(u, (e) => {
			C(K) !== "full" && e(p);
		});
		var v = _(u, 2), b = (e) => {
			var t = Kn(), n = T(t);
			{
				let e = U(() => C(K) === "full");
				A(rn(n, {
					get mail() {
						return a;
					},
					get dark() {
						return C(I);
					},
					get narrow() {
						return C(e);
					},
					onback: () => {
						a.close(), P(j, "list");
					},
					onpick: de
				}), (e) => P(R, e, !0), () => C(R));
			}
			M(t), f(e, t);
		};
		m(v, (e) => {
			C(J) && (!C(H) || C(j) === "reader") && e(b);
		}), M(t), d(() => i = h(t, 1, "work svelte-7si10b", null, i, {
			below: C(K) === "below",
			full: C(K) === "full"
		})), f(e, t);
	};
	m(Me, (e) => {
		(!C(H) || C(j) !== "side") && e(Ne);
	});
	var Pe = _(Me, 2), Fe = (e) => {
		var t = Yn();
		let n;
		B(t, 21, () => C(ce), (e) => e.key, (e, t) => {
			var n = Jn();
			kt(T(n), {
				get mail() {
					return a;
				},
				get c() {
					return C(t);
				},
				get big() {
					return C(ee);
				},
				set big(e) {
					P(ee, e, !0);
				}
			}), M(n), f(e, n);
		}), M(t), d(() => n = h(t, 1, "windows svelte-7si10b", null, n, { big: C(ee) || C(H) })), f(e, t);
	};
	m(Pe, (e) => {
		C(ce).length && e(Fe);
	});
	var Ie = _(Pe, 2), Le = (e) => {
		Cn(e, { onclose: () => P(N, !1) });
	};
	m(Ie, (e) => {
		C(N) && e(Le);
	});
	var Re = _(Ie, 2), ze = (e) => {
		Y(e, {
			get mail() {
				return a;
			},
			onclose: () => P(F, !1)
		});
	};
	m(Re, (e) => {
		C(F) && e(ze);
	});
	var Be = _(Re, 2);
	un(Be, { get mail() {
		return a;
	} });
	var Ve = _(Be, 2), He = (e) => {
		var t = Xn(), n = E(t);
		d(() => o(n, `${C(he) ?? ""} …`)), f(e, t);
	};
	m(Ve, (e) => {
		C(he) && e(He);
	}), M(Ee), A(Ee, (e) => P(Ce, e), () => C(Ce)), d(() => {
		De = h(Ee, 1, "mail svelte-7si10b", null, De, {
			narrow: C(H),
			dark: C(I)
		}), ke = i(Ee, "", ke, {
			"--side-w": `${(C(W) ? 56 : C(v)) ?? ""}px`,
			"--list-w": `${C(b) ?? ""}px`,
			"--list-h": `${C(S) ?? ""}px`
		});
	}), se(Ee, "clientWidth", (e) => P(O, e)), f(t, Ee), k();
}
S([
	"pointerdown",
	"click",
	"input",
	"keydown"
]);
//#endregion
//#region plugins/stable/email/ui/src/view.ts
function er(e, t) {
	e.style.height = "100%";
	let n = g($n, {
		target: e,
		props: { atlas: t }
	});
	return () => l(n);
}
//#endregion
export { er as default };
