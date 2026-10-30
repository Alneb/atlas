import { $ as e, A as t, B as n, C as r, D as i, E as a, F as o, G as s, H as c, I as l, J as u, K as d, L as f, M as p, N as m, O as h, P as g, Q as _, R as v, S as y, T as b, U as x, V as S, W as C, X as w, Y as T, Z as E, _ as D, a as O, at as k, b as A, c as j, ct as M, d as N, dt as P, et as F, f as I, g as L, h as R, it as z, j as B, k as V, l as H, lt as U, m as W, n as G, nt as K, o as ee, p as q, pt as te, q as J, r as Y, rt as X, s as Z, st as ne, t as re, tt as Q, u as ie, ut as ae, v as oe, w as se, x as ce, y as le, z as ue } from "./ui-lib/Rules.js";
//#region plugins/stable/email/ui/src/Sidebar.svelte
var de = c("<span>New message</span>"), fe = c("<span class=\"name svelte-t2e5ba\"> </span>"), pe = c("<span> </span>"), me = c("<button><!> <!> <!></button>"), he = c("<span></span>"), ge = c("<span class=\"spin svelte-t2e5ba\" title=\"Checking for mail…\"></span>"), _e = c("<span class=\"faint svelte-t2e5ba\">offline</span>"), ve = c("<!> <span class=\"acct svelte-t2e5ba\"> </span> <!> <!>", 1), ye = c("<button class=\"link svelte-t2e5ba\">Sign in…</button>"), be = c("<div class=\"err svelte-t2e5ba\" role=\"alert\"><span class=\"svelte-t2e5ba\"> </span> <!> <button class=\"link svelte-t2e5ba\">Settings…</button></div>"), xe = c("<button class=\"twist svelte-t2e5ba\"><!></button>"), $ = c("<div class=\"frow svelte-t2e5ba\"><button><!> <!> <!></button> <!></div>"), Se = c("<button><!><span class=\"name svelte-t2e5ba\"> </span></button>"), Ce = c("<button class=\"row faint svelte-t2e5ba\"><!><span class=\"name svelte-t2e5ba\"> </span></button> <!>", 1), we = c("<button class=\"row faint add svelte-t2e5ba\"><!><span class=\"name svelte-t2e5ba\">New folder…</span></button>"), Te = c("<!> <!> <!>", 1), Ee = c("<div class=\"group svelte-t2e5ba\"><button class=\"head svelte-t2e5ba\"><!></button> <!> <!></div>"), De = c("<div class=\"empty svelte-t2e5ba\"><p class=\"svelte-t2e5ba\">No mail account yet.</p> <button class=\"atlas-btn\">Add an account…</button></div>"), Oe = c("<nav aria-label=\"Mail folders\"><button class=\"compose svelte-t2e5ba\" title=\"New message (c)\"><!><!></button> <div class=\"group svelte-t2e5ba\"></div> <!></nav>"), ke = {
	hash: "svelte-t2e5ba",
	code: ".side.svelte-t2e5ba {display:flex;flex-direction:column;gap:10px;padding:10px 8px 16px;overflow-y:auto;height:100%;box-sizing:border-box;font-size:0.95em;}.compose.svelte-t2e5ba {all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 14px;border-radius:var(--radius);background:var(--accent);color:var(--accent-fg);font-weight:600;box-shadow:var(--shadow-sm);}.compose.svelte-t2e5ba:hover {filter:brightness(1.06);}.compose.svelte-t2e5ba:focus-visible {outline:2px solid var(--accent-strong);outline-offset:2px;}.rail.svelte-t2e5ba .compose:where(.svelte-t2e5ba) {justify-content:center;padding:9px;}.group.svelte-t2e5ba {display:flex;flex-direction:column;gap:1px;}.row.svelte-t2e5ba {all:unset;box-sizing:border-box;display:flex;align-items:center;gap:9px;cursor:pointer;padding:5px 8px 5px calc(8px + var(--depth, 0) * 14px);border-radius:var(--radius-sm);color:var(--text-muted);min-height:28px;flex:1;min-width:0;}.row.svelte-t2e5ba:hover {background:var(--bg-hover);color:var(--text);}.row.on.svelte-t2e5ba {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.row.over.svelte-t2e5ba {outline:2px dashed var(--accent);background:var(--accent-soft);}.row.svelte-t2e5ba:focus-visible, .head.svelte-t2e5ba:focus-visible, .twist.svelte-t2e5ba:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.rail.svelte-t2e5ba .row:where(.svelte-t2e5ba) {justify-content:center;padding:6px;}.frow.svelte-t2e5ba {display:flex;align-items:center;}.twist.svelte-t2e5ba {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-faint);}.twist.svelte-t2e5ba:hover {background:var(--bg-hover);color:var(--text);}.name.svelte-t2e5ba {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.n.svelte-t2e5ba {font-size:0.85em;color:var(--text-faint);font-variant-numeric:tabular-nums;}.n.strong.svelte-t2e5ba {color:var(--text);font-weight:600;}.rail.svelte-t2e5ba .n:where(.svelte-t2e5ba) {display:none;}.head.svelte-t2e5ba {all:unset;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 8px 4px;color:var(--text-faint);font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;min-width:0;}.head.svelte-t2e5ba:hover {color:var(--text-muted);}.rail.svelte-t2e5ba .head:where(.svelte-t2e5ba) {justify-content:center;padding:8px 0 4px;}.acct.svelte-t2e5ba {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:none;letter-spacing:0;font-size:1.15em;}.faint.svelte-t2e5ba {color:var(--text-faint);font-weight:400;}.add.svelte-t2e5ba {font-size:0.9em;}.dot.svelte-t2e5ba {width:8px;height:8px;border-radius:50%;background:var(--text-faint);}.dot.busy.svelte-t2e5ba {background:var(--accent);}.dot.bad.svelte-t2e5ba {background:var(--red);}.spin.svelte-t2e5ba {width:9px;height:9px;border-radius:50%;border:2px solid var(--accent);border-right-color:transparent; animation: svelte-t2e5ba-spin 0.8s linear infinite;}\n  @keyframes svelte-t2e5ba-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-t2e5ba { animation: none;} }.err.svelte-t2e5ba {margin:2px 6px 6px;padding:8px 10px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--red) 12%, transparent);color:var(--text);font-size:0.88em;display:flex;flex-wrap:wrap;gap:6px 10px;}.err.svelte-t2e5ba span:where(.svelte-t2e5ba) {flex-basis:100%;overflow-wrap:anywhere;}.link.svelte-t2e5ba {all:unset;cursor:pointer;color:var(--accent);}.empty.svelte-t2e5ba {padding:14px 8px;color:var(--text-muted);display:grid;gap:8px;justify-items:start;}.empty.svelte-t2e5ba p:where(.svelte-t2e5ba) {margin:0;}"
};
function Ae(r, a) {
	U(a, !0), p(r, ke);
	let o = y(a, "rail", 3, !1), c = [
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
	], u = {
		inbox: "inbox",
		sent: "send",
		drafts: "draft",
		archive: "archive",
		junk: "spam",
		trash: "trash",
		snoozed: "clock",
		unimportant: "down",
		all: "all"
	}, f = {
		inbox: 0,
		unimportant: 1,
		snoozed: 2,
		drafts: 3,
		sent: 4,
		archive: 5,
		junk: 6,
		trash: 7,
		all: 8
	}, m = k(() => a.mail.accounts.filter((e) => !e.error).length > 1), h = z(K(x())), b = z(null);
	function x() {
		try {
			return JSON.parse(localStorage.getItem("atlas-email-folded") ?? "{}");
		} catch {
			return {};
		}
	}
	function C(e) {
		X(h, {
			...J(h),
			[e]: !J(h)[e]
		}, !0);
		try {
			localStorage.setItem("atlas-email-folded", JSON.stringify(J(h)));
		} catch {}
	}
	function w(e) {
		let t = a.mail.folders.filter((t) => t.account === e), n = t.filter((e) => e.role === "other" || e.role === "view"), r = t.filter((e) => e.role !== "other" && e.role !== "view"), i = r.filter((e) => e.role && f[e.role] !== void 0).sort((e, t) => f[e.role] - f[t.role]), o = r.filter((e) => !i.includes(e)).sort((e, t) => e.label.localeCompare(t.label)), s = i.map((e) => ({
			f: e,
			depth: 0,
			children: 0
		})), c = (e) => e.label.split(e.delimiter ?? "/");
		for (let t of o) {
			let n = c(t).length - 1, r = o.filter((e) => e !== t && e.label.startsWith(t.label + (t.delimiter ?? "/"))).length;
			o.some((n) => n !== t && t.label.startsWith(n.label + (n.delimiter ?? "/")) && J(h)[`${e}:${n.path}`]) || s.push({
				f: t,
				depth: n,
				children: r
			});
		}
		return {
			main: s,
			other: n
		};
	}
	let E = (e) => e.label.split(e.delimiter ?? "/").at(-1) ?? e.label;
	function D(e) {
		a.mail.go(e), a.onpicked?.();
	}
	let O = (e, t = null) => a.mail.view.name === e && a.mail.view.account === t, j = (e) => a.mail.view.name === "folder" && a.mail.view.account === e.account && a.mail.view.folder === e.path, N = (e) => [
		"inbox",
		"snoozed",
		"drafts",
		"scheduled",
		"unimportant"
	].includes(e) ? a.mail.counts[e] : void 0;
	function I(e, t) {
		e.preventDefault(), X(b, null);
		let n = JSON.parse(e.dataTransfer?.getData("application/x-atlas-mail") || "[]"), r = a.mail.rows.filter((e) => n.includes(e.id) && e.account === t.account);
		r.length ? a.mail.moveTo(t.path, t.label, r) : n.length && a.mail.toast("Mail moves within its own account", "error");
	}
	var L = Oe();
	let R;
	var V = _(L), H = _(V);
	A(H, {
		name: "pen",
		size: 17
	});
	var W = Q(H), G = (e) => {
		var t = de();
		n(e, t);
	};
	l(W, (e) => {
		o() || e(G);
	}), P(V);
	var ee = Q(V, 2);
	g(ee, 21, () => c, ([e, t, n]) => e, (t, r) => {
		var a = k(() => te(J(r), 3));
		let c = () => J(a)[0], u = () => J(a)[1], d = () => J(a)[2], f = k(() => N(c()));
		var p = S(), h = e(p), g = (e) => {
			var t = me();
			let r;
			var a = _(t);
			A(a, { get name() {
				return d();
			} });
			var p = Q(a, 2), h = (e) => {
				var t = fe(), r = F(t, !0);
				T(() => v(r, J(m) && c() === "inbox" ? "All inboxes" : u())), n(e, t);
			};
			l(p, (e) => {
				o() || e(h);
			});
			var g = Q(p, 2), y = (e) => {
				var t = pe();
				let r;
				var i = F(t, !0);
				T(() => {
					r = B(t, 1, "n svelte-t2e5ba", null, r, { strong: c() === "inbox" }), v(i, c() === "inbox" ? J(f).unread : J(f).total);
				}), n(e, t);
			};
			l(g, (e) => {
				J(f) && (c() === "inbox" ? J(f).unread : J(f).total) && e(y);
			}), P(t), T((e) => {
				r = B(t, 1, "row svelte-t2e5ba", null, r, { on: e }), i(t, "title", u());
			}, [() => O(c())]), s("click", t, () => D({
				name: c(),
				account: null,
				folder: null,
				label: J(m) && c() === "inbox" ? "All inboxes" : u()
			})), n(e, t);
		};
		l(h, (e) => {
			(c() !== "scheduled" && c() !== "unimportant" || (J(f)?.total ?? 0) > 0) && e(g);
		}), n(t, p);
	}), P(ee);
	var q = Q(ee, 2);
	g(q, 17, () => a.mail.accounts, (e) => e.name, (r, c) => {
		let f = k(() => `acct:${J(c).name}`), p = k(() => w(J(c).name));
		var m = Ee(), y = _(m), x = _(y), O = (e) => {
			var t = he();
			let r;
			T(() => r = B(t, 1, "dot svelte-t2e5ba", null, r, {
				busy: J(c).syncing,
				bad: J(c).error || J(c).status?.state === "error"
			})), n(e, t);
		}, M = (t) => {
			var r = ve(), a = e(r);
			{
				let e = k(() => J(h)[J(f)] ? "right" : "down");
				A(a, {
					get name() {
						return J(e);
					},
					size: 12
				});
			}
			var o = Q(a, 2), s = F(o, !0), u = Q(o, 2), d = (e) => {
				var t = ge();
				n(e, t);
			};
			l(u, (e) => {
				(J(c).syncing || J(c).status?.state === "syncing") && e(d);
			});
			var p = Q(u, 2), m = (e) => {
				var t = _e();
				T(() => i(t, "title", J(c).status.error)), n(e, t);
			};
			l(p, (e) => {
				J(c).status?.state === "offline" && e(m);
			}), T(() => v(s, J(c).name)), n(t, r);
		};
		l(x, (e) => {
			o() ? e(O) : e(M, -1);
		}), P(y);
		var N = Q(y, 2), L = (e) => {
			var t = be(), r = _(t), i = F(r, !0), o = Q(r, 2), u = (e) => {
				var t = ye();
				s("click", t, () => window.dispatchEvent(new CustomEvent("atlas-email:signin", { detail: J(c).name }))), n(e, t);
			};
			l(o, (e) => {
				J(c).outlook && e(u);
			});
			var d = Q(o, 2);
			P(t), T(() => v(i, J(c).error ?? J(c).status?.error)), s("click", d, () => a.mail.atlas.plugin.openSettings()), n(e, t);
		};
		l(N, (e) => {
			(J(c).error || J(c).status?.state === "error") && e(L);
		});
		var R = Q(N, 2), z = (r) => {
			var a = Te(), m = e(a);
			g(m, 17, () => J(p).main, ({ f: e, depth: t, children: n }) => e.path, (e, r) => {
				let a = () => J(r).f, f = () => J(r).depth, p = () => J(r).children;
				var m = $();
				let g;
				var y = _(m);
				let x;
				var S = _(y);
				{
					let e = k(() => u[a().role ?? ""] ?? "folder");
					A(S, { get name() {
						return J(e);
					} });
				}
				var w = Q(S, 2), O = (e) => {
					var t = fe(), r = F(t, !0);
					T((e) => v(r, e), [() => E(a())]), n(e, t);
				};
				l(w, (e) => {
					o() || e(O);
				});
				var M = Q(w, 2), N = (e) => {
					var t = pe();
					let r;
					var i = F(t, !0);
					T(() => {
						r = B(t, 1, "n svelte-t2e5ba", null, r, { strong: a().role === "inbox" }), v(i, a().unread);
					}), n(e, t);
				};
				l(M, (e) => {
					a().unread && a().role !== "sent" && a().role !== "trash" && a().role !== "junk" && a().role !== "drafts" && e(N);
				}), P(y);
				var L = Q(y, 2), R = (e) => {
					var t = xe(), r = _(t);
					{
						let e = k(() => J(h)[`${J(c).name}:${a().path}`] ? "right" : "down");
						A(r, {
							get name() {
								return J(e);
							},
							size: 12
						});
					}
					P(t), T(() => i(t, "aria-label", J(h)[`${J(c).name}:${a().path}`] ? "Show the folders in it" : "Hide the folders in it")), s("click", t, () => C(`${J(c).name}:${a().path}`)), n(e, t);
				};
				l(L, (e) => {
					p() && !o() && e(R);
				}), P(m), T((e) => {
					g = t(m, "", g, { "--depth": o() ? 0 : f() }), x = B(y, 1, "row svelte-t2e5ba", null, x, {
						on: e,
						over: J(b) === `${J(c).name}:${a().path}`
					}), i(y, "title", a().label);
				}, [() => j(a())]), s("click", y, () => D({
					name: "folder",
					account: J(c).name,
					folder: a().path,
					label: a().label
				})), d("dragover", y, (e) => {
					e.preventDefault(), X(b, `${J(c).name}:${a().path}`);
				}), d("dragleave", y, () => X(b, null)), d("drop", y, (e) => I(e, a())), n(e, m);
			});
			var y = Q(m, 2), x = (r) => {
				var i = Ce(), a = e(i), o = _(a);
				{
					let e = k(() => J(h)[`${J(f)}:other`] ? "down" : "right");
					A(o, {
						get name() {
							return J(e);
						},
						size: 12
					});
				}
				var u = Q(o), d = F(u);
				P(a);
				var m = Q(a, 2), y = (r) => {
					var i = S(), a = e(i);
					g(a, 17, () => J(p).other, (e) => e.path, (e, r) => {
						var i = Se();
						let a;
						t(i, "", {}, { "--depth": 1 });
						var o = _(i);
						A(o, { name: "folder" });
						var l = Q(o), u = F(l, !0);
						P(i), T((e) => {
							a = B(i, 1, "row svelte-t2e5ba", null, a, { on: e }), v(u, J(r).label);
						}, [() => j(J(r))]), s("click", i, () => D({
							name: "folder",
							account: J(c).name,
							folder: J(r).path,
							label: J(r).label
						})), n(e, i);
					}), n(r, i);
				};
				l(m, (e) => {
					J(h)[`${J(f)}:other`] && e(y);
				}), T(() => v(d, `More (${J(p).other.length ?? ""})`)), s("click", a, () => C(`${J(f)}:other`)), n(r, i);
			};
			l(y, (e) => {
				J(p).other.length && !o() && e(x);
			});
			var w = Q(y, 2), O = (e) => {
				var t = we(), r = _(t);
				A(r, {
					name: "plus",
					size: 14
				}), ae(), P(t), s("click", t, () => window.dispatchEvent(new CustomEvent("atlas-email:new-folder", { detail: J(c).name }))), n(e, t);
			};
			l(w, (e) => {
				o() || e(O);
			}), n(r, a);
		};
		l(R, (e) => {
			!J(h)[J(f)] && !J(c).error && e(z);
		}), P(m), T(() => {
			i(y, "aria-expanded", !J(h)[J(f)]), i(y, "title", J(c).user ?? J(c).name);
		}), s("click", y, () => C(J(f))), n(r, m);
	}, (t) => {
		var r = S(), i = e(r), c = (e) => {
			var t = De(), r = Q(_(t), 2);
			P(t), s("click", r, () => a.mail.atlas.plugin.openSettings()), n(e, t);
		};
		l(i, (e) => {
			o() || e(c);
		}), n(t, r);
	}), P(L), T(() => R = B(L, 1, "side svelte-t2e5ba", null, R, { rail: o() })), s("click", V, () => a.mail.compose()), n(r, L), M();
}
C(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/MessageList.svelte
var je = c("<div class=\"sect svelte-g4my5v\">Everything else</div>"), Me = c("<div class=\"sect svelte-g4my5v\"><!> Important<span class=\"faint svelte-g4my5v\"> </span></div> <!>", 1), Ne = c("<div> </div>"), Pe = c("<span></span>"), Fe = c("<span class=\"udot svelte-g4my5v\" aria-label=\"unread\"></span>"), Ie = c("<span class=\"count svelte-g4my5v\"> </span>"), Le = c("<span class=\"draftmark svelte-g4my5v\">· Draft</span>"), Re = c("<span class=\"subject svelte-g4my5v\"> <span class=\"snip svelte-g4my5v\"> </span></span>"), ze = c("<span class=\"star svelte-g4my5v\"><!></span>"), Be = c("<span class=\"chip acct svelte-g4my5v\"> </span>"), Ve = c("<span class=\"chip svelte-g4my5v\"> </span>"), He = c("<div class=\"line2 svelte-g4my5v\"><span class=\"subject svelte-g4my5v\"> </span></div> <div class=\"line3 svelte-g4my5v\"><!> <!> <span class=\"snip svelte-g4my5v\"> </span></div>", 1), Ue = c("<div role=\"option\" tabindex=\"-1\" draggable=\"true\"><!> <button class=\"avatar svelte-g4my5v\"><!></button> <div class=\"main svelte-g4my5v\"><div class=\"line1 svelte-g4my5v\"><!> <span class=\"who svelte-g4my5v\"> <!><!></span> <!> <span class=\"marks svelte-g4my5v\"><!> <!> <!></span> <time class=\"date svelte-g4my5v\"> </time></div> <!></div> <div class=\"hover svelte-g4my5v\" role=\"toolbar\" aria-label=\"Actions\"><button title=\"Archive (e)\" class=\"svelte-g4my5v\"><!></button> <button title=\"Delete (#)\" class=\"svelte-g4my5v\"><!></button> <button class=\"svelte-g4my5v\"><!></button> <button title=\"Snooze (h for when)\" class=\"svelte-g4my5v\"><!></button></div></div>"), We = c("<div class=\"ghost svelte-g4my5v\"><span class=\"svelte-g4my5v\"></span><span class=\"svelte-g4my5v\"></span></div>"), Ge = c("<div role=\"listbox\" aria-label=\"Conversations\" aria-multiselectable=\"true\" tabindex=\"-1\"><div class=\"pad svelte-g4my5v\"><!> <!></div> <!></div>"), Ke = {
	hash: "svelte-g4my5v",
	code: ".list.svelte-g4my5v {position:relative;overflow-y:auto;height:100%;outline:none;contain:strict;}.pad.svelte-g4my5v {position:relative;}.row.svelte-g4my5v {position:absolute;left:0;right:0;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:0 12px 0 10px;border-bottom:1px solid var(--border);cursor:default;user-select:none;transition:transform 120ms var(--ease);}.row.svelte-g4my5v:hover {background:var(--bg-hover);}.row.cursor.svelte-g4my5v {box-shadow:inset 3px 0 0 var(--accent);}.row.open.svelte-g4my5v {background:var(--accent-soft);}.row.checked.svelte-g4my5v {background:var(--accent-sel);}.avatar.svelte-g4my5v {all:unset;flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);cursor:pointer;}.compact.svelte-g4my5v .avatar:where(.svelte-g4my5v) {width:20px;height:20px;background:transparent;color:var(--text-faint);}.checked.svelte-g4my5v .avatar:where(.svelte-g4my5v) {background:var(--accent);color:var(--accent-fg);}.avatar.svelte-g4my5v:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.dotonly.svelte-g4my5v {width:8px;height:8px;border-radius:50%;}.dotonly.on.svelte-g4my5v {background:var(--accent);}.main.svelte-g4my5v {flex:1;min-width:0;display:grid;gap:2px;}.line1.svelte-g4my5v, .line2.svelte-g4my5v, .line3.svelte-g4my5v {display:flex;align-items:center;gap:6px;min-width:0;}.udot.svelte-g4my5v {width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none;}.who.svelte-g4my5v {flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.compact.svelte-g4my5v .who:where(.svelte-g4my5v) {flex:0 0 28%;}.unread.svelte-g4my5v .who:where(.svelte-g4my5v), .unread.svelte-g4my5v .subject:where(.svelte-g4my5v) {font-weight:650;color:var(--heading);}.count.svelte-g4my5v {margin-left:5px;color:var(--text-faint);font-size:0.86em;font-weight:400;}.draftmark.svelte-g4my5v {color:var(--red);font-weight:400;}.marks.svelte-g4my5v {margin-left:auto;display:flex;gap:4px;align-items:center;color:var(--text-faint);}.star.svelte-g4my5v {color:var(--yellow);}.date.svelte-g4my5v {flex:none;color:var(--text-muted);font-size:0.85em;font-variant-numeric:tabular-nums;}.unread.svelte-g4my5v .date:where(.svelte-g4my5v) {color:var(--text);font-weight:600;}.subject.svelte-g4my5v {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.compact.svelte-g4my5v .subject:where(.svelte-g4my5v) {flex:1;}.snip.svelte-g4my5v {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.92em;}.chip.svelte-g4my5v {flex:none;font-size:0.78em;padding:0 6px;border-radius:999px;background:hsl(var(--h, 220) 60% 50% / 0.16);color:var(--text);line-height:1.6;}.chip.acct.svelte-g4my5v {background:var(--bg-active);color:var(--text-muted);}\n  /* over the date's line (hidden on hover), not over the subject; centred in a one-line compact row */.hover.svelte-g4my5v {position:absolute;right:8px;top:5px;display:none;gap:0;background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 1px;box-shadow:var(--shadow-sm);}.row.svelte-g4my5v:hover .hover:where(.svelte-g4my5v) {display:flex;}.compact.svelte-g4my5v .hover:where(.svelte-g4my5v) {top:50%;transform:translateY(-50%);}.row.svelte-g4my5v:hover .date:where(.svelte-g4my5v), .row.svelte-g4my5v:hover .marks:where(.svelte-g4my5v) {visibility:hidden;}.hover.svelte-g4my5v button:where(.svelte-g4my5v) {all:unset;cursor:pointer;padding:2px 5px;border-radius:var(--radius-sm);color:var(--text-muted);min-width:22px;min-height:20px;display:grid;place-items:center;}.hover.svelte-g4my5v button:where(.svelte-g4my5v):hover {background:var(--bg-hover);color:var(--text);}.swipe.svelte-g4my5v {position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-start;padding:0 20px;color:#fff;background:var(--green);font-weight:600;z-index:-1;}.swipe.left.svelte-g4my5v {justify-content:flex-end;background:var(--accent);}.ghost.svelte-g4my5v {position:absolute;left:0;right:0;padding:14px 16px 0 54px;display:grid;gap:8px;border-bottom:1px solid var(--border);}.ghost.svelte-g4my5v span:where(.svelte-g4my5v) {height:10px;border-radius:4px;background:var(--bg-hover);width:40%;}.ghost.svelte-g4my5v span:where(.svelte-g4my5v) + span:where(.svelte-g4my5v) {width:75%;}\n  @media (prefers-reduced-motion: reduce) {.row.svelte-g4my5v {transition:none;} }.sect.svelte-g4my5v {position:absolute;left:0;right:0;height:28px;display:flex;align-items:center;gap:6px;padding:0 14px;font-size:0.78em;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted);background:var(--bg-secondary, var(--bg));border-bottom:1px solid var(--border);}.sect.svelte-g4my5v .faint:where(.svelte-g4my5v) {font-weight:400;margin-left:2px;}\n  @media (hover: none) {.hover.svelte-g4my5v {display:none !important;} }"
};
function qe(a, c) {
	U(c, !0), p(a, Ke);
	let f = y(c, "mail", 7), m = y(c, "compact", 3, !1), h = k(() => m() ? 34 : 76), b = k(() => {
		if (!f().pinning) return 0;
		let e = f().rows.findIndex((e) => !e.flagged);
		return e < 0 ? f().rows.length : e;
	}), C = (e) => e * J(h) + (J(b) ? e < J(b) ? 28 : 56 : 0), E = z(void 0), O = z(0), j = z(600), L = k(() => Math.max(0, Math.floor(J(O) / J(h)) - 8)), R = k(() => Math.min(f().rows.length, Math.ceil((J(O) + J(j)) / J(h)) + 8)), V = k(() => f().rows.slice(J(L), J(R)));
	w(() => {
		f().cursor;
		let e = u(() => f().index());
		if (!J(E) || e < 0) return;
		let t = u(() => C(e));
		t < J(E).scrollTop ? J(E).scrollTop = Math.max(0, t - (e === 0 || e === J(b) ? 28 : 0)) : t + J(h) > J(E).scrollTop + J(E).clientHeight && (J(E).scrollTop = t + J(h) - J(E).clientHeight);
	});
	let H;
	w(() => {
		let e = J(V);
		return clearTimeout(H), H = setTimeout(() => u(() => f().fillSnippets(e)), 250), () => clearTimeout(H);
	});
	function G() {
		J(E) && (X(O, J(E).scrollTop, !0), J(E).scrollTop + J(E).clientHeight > J(E).scrollHeight - J(h) * 10 && f().more());
	}
	function K(e, t) {
		if (e.shiftKey) {
			f().extend(t.id);
			return;
		}
		if (e.ctrlKey || e.metaKey) {
			f().toggle(t.thread), f().cursor = t.id;
			return;
		}
		c.onopen(t);
	}
	function ee(e, t) {
		let n = f().checked.includes(t.thread) ? f().rows.filter((e) => f().checked.includes(e.thread)).map((e) => e.id) : [t.id];
		e.dataTransfer?.setData("application/x-atlas-mail", JSON.stringify(n)), e.dataTransfer?.setData("text/plain", `${n.length} conversation${n.length === 1 ? "" : "s"}`), e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
	}
	let q = z(null);
	function te(e, t) {
		e.pointerType === "touch" && X(q, {
			id: t.id,
			x0: e.clientX,
			dx: 0
		}, !0);
	}
	function Y(e) {
		J(q) && (J(q).dx = e.clientX - J(q).x0);
	}
	function Z(e, t) {
		if (!J(q) || J(q).id !== t.id) return;
		let n = e.currentTarget.clientWidth, r = J(q).dx;
		X(q, null), r < -n / 3 ? f().archive([t]) : r > n / 3 && f().toggleRead([t]);
	}
	let ne = (e) => N(e);
	var re = Ge();
	let ie;
	var ae = _(re);
	let ce;
	var le = _(ae), ue = (r) => {
		var i = Me(), a = e(i);
		t(a, "", {}, { top: "0" });
		var o = _(a);
		A(o, {
			name: "star",
			size: 13,
			filled: !0
		});
		var s = Q(o, 2), c = F(s, !0);
		P(a);
		var u = Q(a, 2), d = (e) => {
			var r = je();
			let i;
			T(() => i = t(r, "", i, { top: `${J(b) * J(h) + 28}px` })), n(e, r);
		};
		l(u, (e) => {
			J(b) < f().rows.length && e(d);
		}), T(() => v(c, J(b))), n(r, i);
	};
	l(le, (e) => {
		J(b) && e(ue);
	});
	var de = Q(le, 2);
	g(de, 19, () => J(V), (e) => e.thread, (r, a, o) => {
		let c = k(() => J(L) + J(o)), u = k(() => f().checked.includes(J(a).thread)), p = k(() => J(q)?.id === J(a).id ? J(q).dx : 0);
		var y = Ue();
		let b, S;
		var w = _(y), E = (e) => {
			var t = Ne();
			let r;
			var i = F(t, !0);
			T(() => {
				r = B(t, 1, "swipe svelte-g4my5v", null, r, { left: J(p) < 0 }), v(i, J(p) < 0 ? "Archive" : J(a).unread ? "Read" : "Unread");
			}), n(e, t);
		};
		l(w, (e) => {
			J(p) && e(E);
		});
		var O = Q(w, 2);
		let j;
		var M = _(O), R = (e) => {
			A(e, {
				name: "check",
				size: 15
			});
		}, z = (e) => {
			var t = Pe();
			let r;
			T(() => r = B(t, 1, "dotonly svelte-g4my5v", null, r, { on: J(a).unread > 0 })), n(e, t);
		}, V = (e) => {
			var t = x();
			T((e) => v(t, e), [() => I(J(a).from.at(-1))]), n(e, t);
		};
		l(M, (e) => {
			J(u) ? e(R) : m() ? e(z, 1) : e(V, -1);
		}), P(O);
		var H = Q(O, 2), U = _(H), G = _(U), re = (e) => {
			var t = Fe();
			n(e, t);
		};
		l(G, (e) => {
			J(a).unread > 0 && !m() && e(re);
		});
		var ie = Q(G, 2), ae = _(ie, !0), se = Q(ae), ce = (e) => {
			var t = Ie(), r = F(t, !0);
			T(() => v(r, J(a).count)), n(e, t);
		};
		l(se, (e) => {
			J(a).count > 1 && e(ce);
		});
		var le = Q(se), ue = (e) => {
			var t = Le();
			n(e, t);
		};
		l(le, (e) => {
			J(a).draft && J(a).count > 1 && e(ue);
		}), P(ie);
		var de = Q(ie, 2), fe = (e) => {
			var t = Re(), r = _(t, !0), i = Q(r), o = F(i);
			P(t), T(() => {
				v(r, J(a).subject || "(no subject)"), v(o, `— ${J(a).snippet ?? ""}`);
			}), n(e, t);
		};
		l(de, (e) => {
			m() && e(fe);
		});
		var pe = Q(de, 2), me = _(pe), he = (e) => {
			A(e, {
				name: "attach",
				size: 13,
				title: "has files"
			});
		};
		l(me, (e) => {
			J(a).has_attachments && e(he);
		});
		var ge = Q(me, 2), _e = (e) => {
			A(e, {
				name: "note",
				size: 13,
				title: "saved as a note"
			});
		};
		l(ge, (e) => {
			J(a).saved && e(_e);
		});
		var ve = Q(ge, 2), ye = (e) => {
			var t = ze(), r = _(t);
			A(r, {
				name: "star",
				size: 14,
				filled: !0,
				title: "starred"
			}), P(t), n(e, t);
		};
		l(ve, (e) => {
			J(a).flagged && e(ye);
		}), P(pe);
		var be = Q(pe, 2), xe = F(be, !0);
		P(U);
		var $ = Q(U, 2), Se = (r) => {
			var i = He(), o = e(i), s = _(o), c = F(s, !0);
			P(o);
			var u = Q(o, 2), d = _(u), p = (e) => {
				var t = Be(), r = F(t, !0);
				T(() => v(r, J(a).account)), n(e, t);
			};
			l(d, (e) => {
				f().view.name !== "folder" && f().view.account === null && f().accounts.length > 1 && e(p);
			});
			var m = Q(d, 2);
			g(m, 16, () => J(a).labels.slice(0, 3), (e) => e, (e, r) => {
				var i = Ve();
				let a;
				var o = F(i, !0);
				T((e, n) => {
					a = t(i, "", a, { "--h": e }), v(o, n);
				}, [() => ne(r), () => r.replace(/^\$/, "")]), n(e, i);
			});
			var h = Q(m, 2), y = F(h, !0);
			P(u), T(() => {
				v(c, J(a).subject || "(no subject)"), v(y, J(a).snippet_missing ? "…" : J(a).snippet);
			}), n(r, i);
		};
		l($, (e) => {
			m() || e(Se);
		}), P(H);
		var Ce = Q(H, 2), we = _(Ce), Te = _(we);
		A(Te, { name: "archive" }), P(we);
		var Ee = Q(we, 2), De = _(Ee);
		A(De, { name: "trash" }), P(Ee);
		var Oe = Q(Ee, 2), ke = _(Oe);
		{
			let e = k(() => J(a).unread ? "read" : "unread");
			A(ke, { get name() {
				return J(e);
			} });
		}
		P(Oe);
		var Ae = Q(Oe, 2), je = _(Ae);
		A(je, { name: "clock" }), P(Ae), P(Ce), P(y), T((e, n, r, o, s) => {
			b = B(y, 1, "row svelte-g4my5v", null, b, {
				unread: J(a).unread > 0,
				cursor: f().cursor === J(a).id,
				open: f().openId === J(a).id,
				checked: J(u)
			}), i(y, "aria-selected", J(u) || f().openId === J(a).id), S = t(y, "", S, {
				top: e,
				height: `${J(h) ?? ""}px`,
				transform: J(p) ? `translateX(${J(p)}px)` : void 0
			}), i(O, "aria-label", J(u) ? "Uncheck" : "Check"), i(O, "aria-pressed", J(u)), j = t(O, "", j, { "--h": n }), v(ae, r), i(be, "datetime", o), v(xe, s), i(Oe, "title", J(a).unread ? "Mark read" : "Mark unread");
		}, [
			() => `${C(J(c)) ?? ""}px`,
			() => N(J(a).from.at(-1)?.addr ?? J(a).subject),
			() => J(a).draft && J(a).count === 1 ? "Draft" : W(J(a).from, f().own),
			() => (/* @__PURE__ */ new Date(J(a).date * 1e3)).toISOString(),
			() => oe(J(a).date)
		]), s("click", y, (e) => K(e, J(a))), s("keydown", y, () => {}), d("dragstart", y, (e) => ee(e, J(a))), s("pointerdown", y, (e) => te(e, J(a))), s("pointermove", y, Y), s("pointerup", y, (e) => Z(e, J(a))), d("pointercancel", y, () => X(q, null)), s("click", O, (e) => {
			e.stopPropagation(), f().toggle(J(a).thread);
		}), s("click", we, (e) => {
			e.stopPropagation(), f().archive([J(a)]);
		}), s("click", Ee, (e) => {
			e.stopPropagation(), f().trash([J(a)]);
		}), s("click", Oe, (e) => {
			e.stopPropagation(), f().toggleRead([J(a)]);
		}), s("click", Ae, (e) => {
			e.stopPropagation(), f().snooze(D()[0].at, [J(a)]);
		}), n(r, y);
	}), P(ae);
	var fe = Q(ae, 2), pe = (r) => {
		var i = S(), a = e(i);
		g(a, 16, () => Array(8), o, (e, r, i) => {
			var a = We();
			let o;
			T(() => o = t(a, "", o, {
				top: `${i * J(h)}px`,
				height: `${J(h) ?? ""}px`
			})), n(e, a);
		}), n(r, i);
	};
	l(fe, (e) => {
		f().loading && !f().rows.length && e(pe);
	}), P(re), r(re, (e) => X(E, e), () => J(E)), T(() => {
		ie = B(re, 1, "list svelte-g4my5v", null, ie, { compact: m() }), ce = t(ae, "", ce, { height: `${f().rows.length * J(h) + (J(b) ? 56 : 0)}px` });
	}), d("scroll", re, G), se(re, "clientHeight", (e) => X(j, e)), n(a, re), M();
}
C([
	"click",
	"keydown",
	"pointerdown",
	"pointermove",
	"pointerup"
]);
//#endregion
//#region plugins/stable/email/ui/src/InviteCard.svelte
var Je = c("<span class=\"faint svelte-720w0p\"> </span>"), Ye = c("<span> </span>"), Xe = c("<span class=\"ok svelte-720w0p\"><!> In your calendar</span>"), Ze = c("<span class=\"clash svelte-720w0p\"> </span>"), Qe = c("<span class=\"state svelte-720w0p\"><!> <!></span>"), $e = c("<span class=\"given svelte-720w0p\"> </span>"), et = c("<div class=\"answer svelte-720w0p\" role=\"group\" aria-label=\"Answer the invitation\"><!> <button>Accept</button> <button>Maybe</button> <button>Decline</button></div>"), tt = c("<div><!> <div class=\"what svelte-720w0p\"><b class=\"svelte-720w0p\"> </b> <span> <!></span> <!> <!> <!> <!></div> <!></div>"), nt = {
	hash: "svelte-720w0p",
	code: ".invite.svelte-720w0p {display:flex;flex-wrap:wrap;gap:10px 12px;align-items:flex-start;padding:10px 12px;margin-bottom:10px;border-radius:var(--radius);border:1px solid var(--border-strong);background:var(--accent-soft);}.invite.cancelled.svelte-720w0p b:where(.svelte-720w0p) {text-decoration:line-through;}.what.svelte-720w0p {display:grid;gap:2px;flex:1 1 220px;min-width:0;}.faint.svelte-720w0p {color:var(--text-muted);}.state.svelte-720w0p {display:flex;flex-wrap:wrap;gap:4px 10px;font-size:0.9em;margin-top:2px;}.ok.svelte-720w0p {display:inline-flex;align-items:center;gap:4px;color:var(--success, var(--text));}.clash.svelte-720w0p {color:var(--warning, var(--text-muted));}.answer.svelte-720w0p {display:flex;align-items:center;gap:6px;flex-wrap:wrap;}.given.svelte-720w0p {color:var(--text-muted);font-size:0.9em;margin-right:4px;}.answer.svelte-720w0p button:where(.svelte-720w0p) {padding:4px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);cursor:pointer;}.answer.svelte-720w0p button:where(.svelte-720w0p):hover:not(:disabled) {border-color:var(--accent);}.answer.svelte-720w0p button.on:where(.svelte-720w0p) {background:var(--accent);color:var(--accent-fg);border-color:transparent;}.answer.svelte-720w0p button:where(.svelte-720w0p):disabled {opacity:0.6;cursor:default;}"
};
function rt(e, t) {
	U(t, !0), p(e, nt);
	let r = z(null), i = z(null), a = z(!1), o = k(() => J(i) ?? t.invite.answer);
	w(() => {
		let e = t.id;
		X(r, null), t.mail.call("invite_status", { id: e }).then((n) => {
			e === t.id && X(r, n, !0);
		}).catch(() => {});
	});
	let c = (e) => /* @__PURE__ */ new Date(`${e}T00:00:00`), u = (e) => e.length > 10 ? new Date(e) : c(e), d = (e) => e.toLocaleDateString(void 0, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: e.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() ? void 0 : "numeric"
	}), f = (e, t) => e.toLocaleTimeString(void 0, {
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit",
		timeZone: t
	}), m = (e, t) => e.toDateString() === t.toDateString(), h = k(() => {
		if (!t.invite.start) return "";
		let e = u(t.invite.start), n = t.invite.end ? u(t.invite.end) : null;
		if (t.invite.all_day) {
			let t = n ? /* @__PURE__ */ new Date(n.getTime() - 864e5) : e;
			return m(e, t) ? `${d(e)} · all day` : `${d(e)} – ${d(t)}`;
		}
		let r = n ? m(e, n) ? `${f(e)} – ${f(n)}` : `${f(e)} – ${d(n)} ${f(n)}` : f(e);
		return `${d(e)} · ${r}`;
	}), y = k(() => {
		if (!t.invite.zone || t.invite.all_day || !t.invite.start) return "";
		try {
			let e = t.invite.zone.split("/").pop().replace(/_/g, " ");
			return `${f(u(t.invite.start), t.invite.zone)} in ${e}`;
		} catch {
			return "";
		}
	}), b = k(() => {
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
	})[e] ?? "", S = k(() => t.invite.method === "REQUEST" && !t.invite.mine);
	async function C(e) {
		X(a, !0);
		try {
			let n = await t.mail.call("answer_invite", {
				id: t.id,
				partstat: e
			});
			X(i, e, !0);
			let a = n.calendar ? " · in your calendar" : n.calendar_error && e !== "DECLINED" ? " · not filed in a calendar" : "";
			t.mail.toast(`${x(e)}${a}`, "success"), n.calendar && X(r, {
				...J(r) ?? { conflicts: [] },
				in_calendar: !0
			}, !0);
		} catch (e) {
			t.mail.toast(`Could not answer: ${e.message}`, "error");
		} finally {
			X(a, !1);
		}
	}
	var E = tt();
	let D;
	var O = _(E);
	A(O, {
		name: "calendar",
		size: 22
	});
	var j = Q(O, 2), N = _(j), I = F(N), L = Q(N, 2), R = _(L, !0), V = Q(R), H = (e) => {
		var t = Je(), r = F(t);
		T(() => v(r, `· ${J(b) ?? ""}`)), n(e, t);
	};
	l(V, (e) => {
		J(b) && e(H);
	}), P(L);
	var W = Q(L, 2), G = (e) => {
		var t = Je(), r = F(t, !0);
		T(() => v(r, J(y))), n(e, t);
	};
	l(W, (e) => {
		J(y) && e(G);
	});
	var K = Q(W, 2), ee = (e) => {
		var r = Ye(), i = F(r, !0);
		T(() => v(i, t.invite.location)), n(e, r);
	};
	l(K, (e) => {
		t.invite.location && e(ee);
	});
	var q = Q(K, 2), te = (e) => {
		var r = Je(), i = F(r);
		T(() => v(i, `from ${t.invite.organizer ?? ""}${t.invite.attendees.length > 1 ? ` · ${t.invite.attendees.length} invited` : ""}`)), n(e, r);
	};
	l(q, (e) => {
		t.invite.organizer && e(te);
	});
	var Y = Q(q, 2), Z = (e) => {
		var t = Qe(), i = _(t), a = (e) => {
			var t = Xe(), r = _(t);
			A(r, {
				name: "check",
				size: 13
			}), ae(), P(t), n(e, t);
		};
		l(i, (e) => {
			J(r).in_calendar && e(a);
		});
		var o = Q(i, 2);
		g(o, 17, () => J(r).conflicts.slice(0, 2), (e) => e.summary + e.start, (e, t) => {
			var r = Ze(), i = F(r);
			T((e) => v(i, `Overlaps ${J(t).summary ?? ""} (${e ?? ""})`), [() => f(u(J(t).start))]), n(e, r);
		}), P(t), n(e, t);
	};
	l(Y, (e) => {
		J(r) && e(Z);
	}), P(j);
	var ne = Q(j, 2), re = (e) => {
		var t = et(), r = _(t), i = (e) => {
			var t = $e(), r = F(t, !0);
			T((e) => v(r, e), [() => x(J(o))]), n(e, t);
		};
		l(r, (e) => {
			J(o) && e(i);
		});
		var c = Q(r, 2);
		let u;
		var d = Q(c, 2);
		let f;
		var p = Q(d, 2);
		let m;
		P(t), T(() => {
			c.disabled = J(a), u = B(c, 1, "svelte-720w0p", null, u, { on: J(o) === "ACCEPTED" }), d.disabled = J(a), f = B(d, 1, "svelte-720w0p", null, f, { on: J(o) === "TENTATIVE" }), p.disabled = J(a), m = B(p, 1, "svelte-720w0p", null, m, { on: J(o) === "DECLINED" });
		}), s("click", c, () => C("ACCEPTED")), s("click", d, () => C("TENTATIVE")), s("click", p, () => C("DECLINED")), n(e, t);
	};
	l(ne, (e) => {
		J(S) && e(re);
	}), P(E), T(() => {
		D = B(E, 1, "invite svelte-720w0p", null, D, { cancelled: t.invite.method === "CANCEL" }), v(I, `${t.invite.method === "CANCEL" ? "Cancelled: " : ""}${(t.invite.summary || "An invitation") ?? ""}`), v(R, J(h));
	}), n(e, E), M();
}
C(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/AddressField.svelte
var it = c("<span><span class=\"svelte-1y6wl7m\"> </span> <button class=\"svelte-1y6wl7m\">×</button></span>"), at = c("<span class=\"svelte-1y6wl7m\"> </span>"), ot = c("<li role=\"option\"><button><b> </b><!></button></li>"), st = c("<ul class=\"offers svelte-1y6wl7m\" role=\"listbox\"></ul>"), ct = c("<div class=\"field svelte-1y6wl7m\"><span class=\"label svelte-1y6wl7m\"> </span> <div class=\"box svelte-1y6wl7m\" role=\"presentation\"><!> <input autocomplete=\"off\" spellcheck=\"false\" class=\"svelte-1y6wl7m\"/></div> <!></div>"), lt = {
	hash: "svelte-1y6wl7m",
	code: ".field.svelte-1y6wl7m {position:relative;display:flex;align-items:flex-start;gap:8px;border-bottom:1px solid var(--border);padding:4px 0;}.label.svelte-1y6wl7m {flex:none;width:3.2em;color:var(--text-faint);padding-top:5px;font-size:0.9em;}.box.svelte-1y6wl7m {flex:1;display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:28px;cursor:text;min-width:0;}.chip.svelte-1y6wl7m {display:inline-flex;align-items:center;gap:2px;padding:1px 2px 1px 8px;border-radius:999px;background:hsl(var(--h) 55% 50% / 0.16);max-width:100%;}.chip.svelte-1y6wl7m span:where(.svelte-1y6wl7m) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.chip.bad.svelte-1y6wl7m {background:color-mix(in srgb, var(--red) 18%, transparent);outline:1px solid var(--red);}.chip.svelte-1y6wl7m button:where(.svelte-1y6wl7m) {all:unset;cursor:pointer;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;color:var(--text-muted);}.chip.svelte-1y6wl7m button:where(.svelte-1y6wl7m):hover {background:var(--bg-active);color:var(--text);}input.svelte-1y6wl7m {all:unset;flex:1;min-width:8em;padding:4px 0;}.offers.svelte-1y6wl7m {position:absolute;z-index:10;left:3.6em;right:0;top:100%;margin:2px 0 0;padding:4px;list-style:none;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));}.offers.svelte-1y6wl7m button:where(.svelte-1y6wl7m) {all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:baseline;padding:6px 10px;border-radius:var(--radius-sm);cursor:pointer;}.offers.svelte-1y6wl7m button.on:where(.svelte-1y6wl7m), .offers.svelte-1y6wl7m button:where(.svelte-1y6wl7m):hover {background:var(--accent-soft);}.offers.svelte-1y6wl7m span:where(.svelte-1y6wl7m) {color:var(--text-muted);font-size:0.9em;overflow:hidden;text-overflow:ellipsis;}"
};
function ut(e, o) {
	U(o, !0), p(e, lt);
	let c = y(o, "value", 15), u = y(o, "autofocus", 3, !1), f = z(""), m = z(K([])), h = z(0), x = z(void 0), S;
	function C(e) {
		let t = [], n = "", r = !1, i = !1;
		for (let a of e) a === "\"" && (r = !r), a === "<" && (i = !0), a === ">" && (i = !1), (a === "," || a === ";") && !r && !i ? (n.trim() && t.push(n.trim()), n = "") : n += a;
		return n.trim() && t.push(n.trim()), t;
	}
	let E = k(() => C(c())), D = (e) => (e.match(/<([^>]+)>/)?.[1] ?? e).trim(), O = (e) => e.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || D(e), A = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(D(e));
	function I(e) {
		let t = e.trim().replace(/,$/, "");
		t && (c([...J(E).filter((e) => D(e).toLowerCase() !== D(t).toLowerCase()), t].join(", ")), X(f, ""), X(m, [], !0));
	}
	function L(e) {
		c(J(E).filter((t, n) => n !== e).join(", "));
	}
	function R() {
		if (/[,;]/.test(J(f))) {
			for (let e of C(J(f))) I(e);
			return;
		}
		clearTimeout(S);
		let e = J(f).trim();
		if (!e) {
			X(m, [], !0);
			return;
		}
		S = setTimeout(async () => {
			try {
				let t = await j(o.atlas, "contacts", {
					q: e,
					limit: 7
				}, 10);
				J(f).trim() === e && (X(m, t.contacts.filter((e) => !J(E).some((t) => D(t).toLowerCase() === e.addr)), !0), X(h, 0));
			} catch {
				X(m, [], !0);
			}
		}, 90);
	}
	let V = (e) => e.name ? `${/[,"<>]/.test(e.name) ? `"${e.name.replace(/"/g, "")}"` : e.name} <${e.addr}>` : e.addr;
	function H(e) {
		J(m).length && (e.key === "ArrowDown" || e.key === "ArrowUp") ? (e.preventDefault(), X(h, (J(h) + (e.key === "ArrowDown" ? 1 : J(m).length - 1)) % J(m).length)) : e.key === "Enter" || e.key === "Tab" && J(f).trim() ? J(m).length ? (e.preventDefault(), I(V(J(m)[J(h)]))) : J(f).trim() && (e.preventDefault(), I(J(f))) : e.key === "Backspace" && !J(f) && J(E).length ? (e.preventDefault(), X(f, J(E).at(-1), !0), L(J(E).length - 1)) : e.key === "Escape" && J(m).length && (e.stopPropagation(), X(m, [], !0));
	}
	w(() => {
		u() && J(x)?.focus();
	});
	var W = ct(), G = _(W), ee = F(G, !0), q = Q(G, 2), te = _(q);
	g(te, 19, () => J(E), (e, t) => e + t, (e, r, a) => {
		var o = it();
		let c, l;
		var u = _(o), d = F(u, !0), f = Q(u, 2);
		P(o), T((e, n, a, s) => {
			c = B(o, 1, "chip svelte-1y6wl7m", null, c, { bad: e }), i(o, "title", J(r)), l = t(o, "", l, { "--h": n }), v(d, a), i(f, "aria-label", s);
		}, [
			() => !A(J(r)),
			() => N(D(J(r))),
			() => O(J(r)),
			() => `Remove ${D(J(r))}`
		]), s("click", f, (e) => {
			e.stopPropagation(), L(J(a));
		}), n(e, o);
	});
	var Y = Q(te, 2);
	a(Y), r(Y, (e) => X(x, e), () => J(x)), P(q);
	var Z = Q(q, 2), ne = (e) => {
		var t = st();
		g(t, 23, () => J(m), (e) => e.addr, (e, t, r) => {
			var a = ot(), o = _(a);
			let c;
			var u = _(o), d = F(u, !0), f = Q(u), p = (e) => {
				var r = at(), i = F(r, !0);
				T(() => v(i, J(t).addr)), n(e, r);
			};
			l(f, (e) => {
				J(t).name && e(p);
			}), P(o), P(a), T(() => {
				i(a, "aria-selected", J(r) === J(h)), c = B(o, 1, "svelte-1y6wl7m", null, c, { on: J(r) === J(h) }), v(d, J(t).name || J(t).addr);
			}), s("mousedown", o, (e) => {
				e.preventDefault(), I(V(J(t)));
			}), n(e, a);
		}), P(t), n(e, t);
	};
	l(Z, (e) => {
		J(m).length && e(ne);
	}), P(W), T(() => {
		v(ee, o.label), i(Y, "aria-label", o.label);
	}), s("click", q, () => J(x)?.focus()), s("input", Y, R), s("keydown", Y, H), d("blur", Y, () => {
		J(f).trim() && I(J(f)), X(m, [], !0);
	}), b(Y, () => J(f), (e) => X(f, e)), n(e, W), M();
}
C([
	"click",
	"input",
	"keydown",
	"mousedown"
]);
//#endregion
//#region plugins/stable/email/ui/src/Composer.svelte
var dt = c("<header class=\"bar svelte-zp5xms\"><b class=\"svelte-zp5xms\"> </b> <span class=\"grow svelte-zp5xms\"></span> <button class=\"tool svelte-zp5xms\"><!></button> <button class=\"tool svelte-zp5xms\" title=\"Close (kept in Drafts)\"><!></button></header>"), ft = c("<option> </option>"), pt = c("<div class=\"from svelte-zp5xms\"><span class=\"label svelte-zp5xms\">From</span> <select class=\"svelte-zp5xms\"></select></div>"), mt = c("<button class=\"link svelte-zp5xms\">Cc</button>"), ht = c("<button class=\"link svelte-zp5xms\">Bcc</button>"), gt = c("<input class=\"subject svelte-zp5xms\" placeholder=\"Subject\" aria-label=\"Subject\"/>"), _t = c("<div class=\"preview svelte-zp5xms\"></div>"), vt = c("<textarea aria-label=\"The message\" spellcheck=\"true\" class=\"svelte-zp5xms\"></textarea>"), yt = c("<span class=\"faint svelte-zp5xms\"> </span>"), bt = c("<span class=\"faint svelte-zp5xms\">(forwarded)</span>"), xt = c("<span class=\"file svelte-zp5xms\"><!><span class=\"svelte-zp5xms\"> </span><!><!><button class=\"svelte-zp5xms\">×</button></span>"), St = c("<span class=\"warn svelte-zp5xms\"> </span>"), Ct = c("<div class=\"files svelte-zp5xms\"><!> <!></div>"), wt = c("<div class=\"error svelte-zp5xms\" role=\"alert\"> </div>"), Tt = c("<div class=\"drop svelte-zp5xms\">Drop to attach</div>"), Et = c("<button class=\"svelte-zp5xms\"> <span class=\"faint svelte-zp5xms\"> </span></button>"), Dt = c("<div class=\"later svelte-zp5xms\" role=\"dialog\" aria-label=\"Send later\"><!> <div class=\"custom svelte-zp5xms\"><input placeholder=\"tomorrow 9, mon 14:00, 3h…\" class=\"svelte-zp5xms\"/><button class=\"atlas-btn svelte-zp5xms\">Schedule</button></div></div>"), Ot = c("<button class=\"tool svelte-zp5xms\" title=\"Pop out\"><!></button>"), kt = c("<div role=\"form\"><!> <div class=\"fields svelte-zp5xms\"><!> <div class=\"torow svelte-zp5xms\"><div class=\"grow svelte-zp5xms\"><!></div> <!> <!></div> <!> <!> <!></div> <div class=\"tb svelte-zp5xms\" role=\"toolbar\" aria-label=\"Formatting\"><button title=\"Bold (Ctrl+B)\" class=\"svelte-zp5xms\"><b>B</b></button> <button title=\"Italic (Ctrl+I)\" class=\"svelte-zp5xms\"><i>I</i></button> <button title=\"Strikethrough\" class=\"svelte-zp5xms\"><s>S</s></button> <button title=\"Link (Ctrl+K)\" class=\"svelte-zp5xms\"><!></button> <button title=\"List\" class=\"svelte-zp5xms\">•</button> <button title=\"Numbered list\" class=\"svelte-zp5xms\">1.</button> <button title=\"Quote\" class=\"svelte-zp5xms\">”</button> <button title=\"Code\" class=\"svelte-zp5xms\"><code></code></button> <span class=\"grow svelte-zp5xms\"></span> <button title=\"How it will look\"> </button></div> <!> <!> <!> <!> <footer class=\"foot svelte-zp5xms\"><div class=\"send svelte-zp5xms\"><button class=\"atlas-btn primary svelte-zp5xms\" title=\"Send (Ctrl+Enter)\">Send</button> <button class=\"atlas-btn primary more svelte-zp5xms\" title=\"Send later…\"><!></button> <!></div> <button class=\"tool svelte-zp5xms\" title=\"Attach files\"><!></button> <button class=\"tool svelte-zp5xms\" title=\"Attach a file of the vault…\"><!></button> <input type=\"file\" multiple=\"\" hidden=\"\"/> <span class=\"status faint svelte-zp5xms\"> </span> <span class=\"grow svelte-zp5xms\"></span> <!> <button class=\"tool svelte-zp5xms\" title=\"Discard\"><!></button></footer></div>"), At = {
	hash: "svelte-zp5xms",
	code: ".composer.svelte-zp5xms {position:relative;display:flex;flex-direction:column;gap:6px;background:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius);padding:0 14px 10px;box-shadow:var(--shadow-sm);min-width:0;}.composer.inline.svelte-zp5xms {margin-left:38px;padding-top:6px;}.composer.over.svelte-zp5xms {outline:2px dashed var(--accent);}.bar.svelte-zp5xms {display:flex;align-items:center;gap:6px;margin:0 -14px;padding:8px 10px 8px 14px;background:var(--bg-alt);border-bottom:1px solid var(--border);border-radius:var(--radius) var(--radius) 0 0;}.bar.svelte-zp5xms b:where(.svelte-zp5xms) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.grow.svelte-zp5xms {flex:1;min-width:0;}.fields.svelte-zp5xms {display:grid;}.from.svelte-zp5xms {display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border);padding:4px 0;}.from.svelte-zp5xms select:where(.svelte-zp5xms) {flex:1;min-width:0;background:transparent;color:var(--text);border:0;padding:4px 0;font:inherit;}.label.svelte-zp5xms {flex:none;width:3.2em;color:var(--text-faint);font-size:0.9em;}.torow.svelte-zp5xms {display:flex;align-items:flex-start;gap:8px;}.torow.svelte-zp5xms .link:where(.svelte-zp5xms) {margin-top:9px;}.link.svelte-zp5xms {all:unset;cursor:pointer;color:var(--text-muted);font-size:0.9em;}.link.svelte-zp5xms:hover {color:var(--accent);}.subject.svelte-zp5xms {all:unset;padding:8px 0;border-bottom:1px solid var(--border);font-weight:600;}.tb.svelte-zp5xms {display:flex;gap:2px;align-items:center;padding-top:2px;}.tb.svelte-zp5xms button:where(.svelte-zp5xms) {all:unset;cursor:pointer;min-width:26px;height:26px;display:grid;place-items:center;border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.92em;padding:0 4px;}.tb.svelte-zp5xms button:where(.svelte-zp5xms):hover, .tb.svelte-zp5xms button.on:where(.svelte-zp5xms) {background:var(--bg-hover);color:var(--text);}textarea.svelte-zp5xms {all:unset;box-sizing:border-box;width:100%;min-height:120px;resize:none;white-space:pre-wrap;line-height:1.55;font-size:15px;font-family:var(--font-prose, var(--font-ui));overflow-y:auto;}.preview.svelte-zp5xms {min-height:120px;padding:4px 0;line-height:1.55;overflow-wrap:anywhere;}.preview.svelte-zp5xms blockquote {margin:0.4em 0;padding-left:0.9em;border-left:3px solid var(--border-strong);color:var(--text-muted);}.files.svelte-zp5xms {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.file.svelte-zp5xms {display:inline-flex;gap:6px;align-items:center;padding:3px 4px 3px 8px;border-radius:var(--radius-sm);background:var(--bg-alt);border:1px solid var(--border);font-size:0.9em;max-width:260px;}.file.svelte-zp5xms span:where(.svelte-zp5xms):not(.faint) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.file.svelte-zp5xms button:where(.svelte-zp5xms) {all:unset;cursor:pointer;width:18px;height:18px;display:grid;place-items:center;border-radius:50%;color:var(--text-muted);}.file.svelte-zp5xms button:where(.svelte-zp5xms):hover {background:var(--bg-hover);}.warn.svelte-zp5xms {color:var(--orange);font-size:0.86em;}.faint.svelte-zp5xms {color:var(--text-faint);}.error.svelte-zp5xms {color:var(--red);font-size:0.9em;}.drop.svelte-zp5xms {position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb, var(--accent) 12%, var(--bg));border-radius:var(--radius);font-weight:600;color:var(--accent-strong);pointer-events:none;}.foot.svelte-zp5xms {display:flex;align-items:center;gap:6px;padding-top:4px;}.send.svelte-zp5xms {position:relative;display:flex;}.send.svelte-zp5xms .atlas-btn.primary:where(.svelte-zp5xms) {background:var(--accent);color:var(--accent-fg);border-color:transparent;font-weight:600;}.send.svelte-zp5xms .atlas-btn:where(.svelte-zp5xms):first-child {border-radius:var(--radius-sm) 0 0 var(--radius-sm);padding-inline:18px;}.send.svelte-zp5xms .more:where(.svelte-zp5xms) {border-radius:0 var(--radius-sm) var(--radius-sm) 0;border-left:1px solid color-mix(in srgb, var(--accent-fg) 25%, transparent) !important;padding-inline:6px;display:grid;place-items:center;}.later.svelte-zp5xms {position:absolute;bottom:110%;left:0;z-index:10;width:280px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));padding:6px;display:grid;gap:2px;}.later.svelte-zp5xms > button:where(.svelte-zp5xms) {all:unset;cursor:pointer;display:flex;justify-content:space-between;padding:7px 10px;border-radius:var(--radius-sm);}.later.svelte-zp5xms > button:where(.svelte-zp5xms):hover {background:var(--bg-hover);}.custom.svelte-zp5xms {display:flex;gap:6px;padding:6px 4px 2px;border-top:1px solid var(--border);margin-top:4px;}.custom.svelte-zp5xms input:where(.svelte-zp5xms) {flex:1;min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 8px;font:inherit;}.tool.svelte-zp5xms {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;}.tool.svelte-zp5xms:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-zp5xms:focus-visible, .tb.svelte-zp5xms button:where(.svelte-zp5xms):focus-visible, .link.svelte-zp5xms:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.status.svelte-zp5xms {font-size:0.85em;}\n  @container (max-width: 560px) {.composer.inline.svelte-zp5xms {margin-left:0;} }"
};
function jt(t, o) {
	U(o, !0), p(t, At);
	let c = y(o, "c", 7), u = y(o, "inline", 3, !1), f = y(o, "big", 15, !1), x = k(() => c().draft), C = z(!!J(x).cc), E = z(!!J(x).bcc), D = z(null), O = z(void 0), j = z(!1), N = z(""), I = z(!1), H = z(void 0), W, G = k(() => o.mail.accounts.find((e) => e.name === J(x).account)), K = k(() => J(G)?.identities?.filter(Boolean) ?? []), te = k(() => o.mail.accounts.filter((e) => !e.error));
	w(() => {
		J(x).to && J(O)?.focus();
	});
	function Y() {
		c().dirty = !0, clearTimeout(W), W = setTimeout(re, 2e3);
	}
	async function re() {
		if (c().dirty && !c().sending && (J(x).body.trim() || J(x).subject.trim() || J(x).to.trim())) {
			c().saving = !0;
			try {
				let e = await o.mail.call("save_draft", { ...J(x) });
				J(x).draft = e.id, c().savedAt = Date.now(), c().dirty = !1, c().error = "";
			} catch (e) {
				c().error = `Not saved: ${e.message}`;
			} finally {
				c().saving = !1;
			}
		}
	}
	function ie(e, t = e, n = "text") {
		if (!J(O)) return;
		let { selectionStart: r, selectionEnd: i, value: a } = J(O), o = a.slice(r, i) || n;
		J(x).body = a.slice(0, r) + e + o + t + a.slice(i), Y(), requestAnimationFrame(() => {
			J(O).focus(), J(O).setSelectionRange(r + e.length, r + e.length + o.length);
		});
	}
	function ae(e) {
		if (!J(O)) return;
		let { selectionStart: t, selectionEnd: n, value: r } = J(O), i = r.lastIndexOf("\n", t - 1) + 1, a = r.slice(i, n).split("\n").map((t) => e + t).join("\n");
		J(x).body = r.slice(0, i) + a + r.slice(n), Y();
	}
	async function oe() {
		let e = await ee(o.mail.atlas, "Link to (address):", "https://");
		e && ie("[", `](${e})`, "link text");
	}
	async function se() {
		if (J(D) !== null) {
			X(D, null);
			return;
		}
		try {
			X(D, (await o.mail.call("preview", { body: J(x).body })).html, !0);
		} catch (e) {
			c().error = e.message;
		}
	}
	async function ce(e) {
		for (let t of Array.from(e)) {
			let e = await new Promise((e, n) => {
				let r = new FileReader();
				r.onload = () => e(String(r.result).replace(/^data:[^,]*,/, "")), r.onerror = () => n(r.error), r.readAsDataURL(t);
			});
			J(x).files = [...J(x).files, {
				name: t.name,
				mime: t.type,
				size: t.size,
				data: e
			}];
		}
		Y();
	}
	function le() {
		o.mail.atlas.pick({
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
				J(x).files = [...J(x).files, {
					name: e.split("/").at(-1) ?? e,
					path: e
				}], Y();
			}
		});
	}
	function ue(e) {
		e.preventDefault(), X(I, !1);
		let t = e.dataTransfer?.getData("text/x-atlas-path") || "";
		if (t) {
			J(x).files = [...J(x).files, {
				name: t.split("/").at(-1) ?? t,
				path: t
			}], Y();
			return;
		}
		e.dataTransfer?.files.length && ce(e.dataTransfer.files);
	}
	let de = (e) => {
		J(x).files = J(x).files.filter((t) => t !== e), Y();
	}, fe = k(() => J(x).files.reduce((e, t) => e + (t.size ?? 0), 0)), pe = /\b(attached|attachment|attaching|enclosed|ci-joint|pi[eè]ce jointe|adjunto|te adjunto|anexo|allegato|anhang|angeh[aä]ngt)\b/i;
	async function me() {
		if (!J(x).to.trim() && !J(x).cc.trim() && !J(x).bcc.trim()) return c().error = "Who is it for? Fill in To.", !1;
		if (!J(x).subject.trim() && !await Z(o.mail.atlas, "Send it without a subject?", { ok: "Send" })) return !1;
		let e = J(x).body.split(/\n\s*>|\nOn .* wrote:/)[0];
		return !(pe.test(e) && !J(x).files.length && !J(x).forward && !await Z(o.mail.atlas, "The text mentions an attachment, but nothing is attached. Send anyway?", { ok: "Send anyway" }));
	}
	async function he(e = null) {
		if (!await me()) return;
		clearTimeout(W), c().sending = !0;
		let t = {
			...J(x),
			send_at: e
		};
		if (o.mail.closeComposer(c().key), e) {
			try {
				await o.mail.call("send", t), o.mail.toast(`Will be sent ${(/* @__PURE__ */ new Date(e * 1e3)).toLocaleString(void 0, {
					weekday: "short",
					day: "numeric",
					month: "short",
					hour: "2-digit",
					hourCycle: "h23",
					minute: "2-digit"
				})}`, "success"), o.mail.later();
			} catch (e) {
				ge(e);
			}
			return;
		}
		let n = Number(R(o.mail.atlas, "undo_send", 10)) * 1e3, r = !1, i = setTimeout(async () => {
			if (!r) try {
				let e = await o.mail.call("send", t, 300);
				e.refused?.length ? o.mail.toast(`Sent, but refused for ${e.refused.map((e) => e.address).join(", ")}`, "error") : o.mail.toast("Sent", "success"), o.mail.later();
			} catch (e) {
				ge(e);
			}
		}, n);
		o.mail.toast("Sending…", "info", {
			until: Date.now() + n,
			undo: async () => {
				r = !0, clearTimeout(i), o.mail.compose({ ...t }, c().inline);
			}
		});
	}
	function ge(e) {
		let t = o.mail.compose({ ...J(x) }, c().inline);
		t.error = `Not sent: ${e.message}`, o.mail.toast(`Not sent: ${e.message}`, "error");
	}
	function _e() {
		let e = q(J(N));
		if (!e || e * 1e3 < Date.now()) {
			c().error = "When? e.g. tomorrow 8, mon 14:00, 2026-11-02 09:00, 3h";
			return;
		}
		X(j, !1), he(e);
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
		if ((!c().dirty && !J(x).draft || !J(x).body.trim() && !J(x).subject.trim() || await Z(o.mail.atlas, "Discard this message?", {
			ok: "Discard",
			danger: !0
		})) && (clearTimeout(W), o.mail.closeComposer(c().key), J(x).draft)) try {
			await o.mail.call("discard_draft", { id: J(x).draft }), o.mail.later();
		} catch {}
	}
	function be(e) {
		e.stopPropagation();
		let t = e.ctrlKey || e.metaKey;
		t && e.key === "Enter" ? (e.preventDefault(), he()) : t && e.key.toLowerCase() === "s" ? (e.preventDefault(), c().dirty = !0, re()) : t && e.key.toLowerCase() === "b" && e.target === J(O) ? (e.preventDefault(), ie("**")) : t && e.key.toLowerCase() === "i" && e.target === J(O) ? (e.preventDefault(), ie("*")) : t && e.key.toLowerCase() === "k" && e.target === J(O) ? (e.preventDefault(), oe()) : t && e.shiftKey && e.key.toLowerCase() === "c" ? (e.preventDefault(), X(C, !0)) : t && e.shiftKey && e.key.toLowerCase() === "b" ? (e.preventDefault(), X(E, !0)) : e.key === "Escape" && !u() && (e.preventDefault(), re(), o.mail.closeComposer(c().key));
	}
	function xe() {
		J(O) && (J(O).style.height = "auto", J(O).style.height = `${Math.min(Math.max(J(O).scrollHeight, u() ? 120 : 220), f() ? 2e3 : 520)}px`);
	}
	w(() => {
		J(x).body, xe();
	});
	var $ = kt();
	let Se;
	var Ce = _($), we = (e) => {
		var t = dt(), r = _(t), a = F(r, !0), l = Q(r, 4), u = _(l);
		A(u, {
			name: "layout",
			size: 15
		}), P(l);
		var d = Q(l, 2), p = _(d);
		A(p, {
			name: "x",
			size: 15
		}), P(d), P(t), T(() => {
			v(a, J(x).subject || (J(x).reply_to ? "Reply" : J(x).forward ? "Forward" : "New message")), i(l, "title", f() ? "Smaller" : "Full size");
		}), s("click", l, () => f(!f())), s("click", d, () => {
			re(), o.mail.closeComposer(c().key);
		}), n(e, t);
	};
	l(Ce, (e) => {
		u() || e(we);
	});
	var Te = Q(Ce, 2), Ee = _(Te), De = (t) => {
		var r = pt(), i = Q(_(r), 2);
		g(i, 21, () => J(te), (e) => e.name, (t, r) => {
			var i = S(), a = e(i);
			g(a, 16, () => J(r).identities?.length ? J(r).identities : [J(r).from ?? J(r).user ?? J(r).name], (e) => e, (e, t) => {
				var i = ft(), a = F(i), o = {};
				T(() => {
					v(a, `${t ?? ""}${J(te).length > 1 ? ` · ${J(r).name}` : ""}`), o !== (o = `${J(r).name}\u0000${t === J(r).from ? "" : t}`) && (i.value = i.__value = o);
				}), n(e, i);
			}), n(t, i);
		}), P(i);
		var a;
		h(i), P(r), T(() => {
			a !== (a = `${J(x).account}\u0000${J(x).from}`) && (i.value = i.__value = a, V(i, a));
		}), s("change", i, (e) => {
			let [t, n] = e.currentTarget.value.split("\0");
			J(x).account = t, J(x).from = n, Y();
		}), n(t, r);
	};
	l(Ee, (e) => {
		(J(te).length > 1 || J(K).length > 1) && e(De);
	});
	var Oe = Q(Ee, 2), ke = _(Oe), Ae = _(ke);
	{
		let e = k(() => !J(x).to && !u());
		ut(Ae, {
			get atlas() {
				return o.mail.atlas;
			},
			label: "To",
			get autofocus() {
				return J(e);
			},
			get value() {
				return J(x).to;
			},
			set value(e) {
				J(x).to = e;
			}
		});
	}
	P(ke);
	var je = Q(ke, 2), Me = (e) => {
		var t = mt();
		s("click", t, () => X(C, !0)), n(e, t);
	};
	l(je, (e) => {
		J(C) || e(Me);
	});
	var Ne = Q(je, 2), Pe = (e) => {
		var t = ht();
		s("click", t, () => X(E, !0)), n(e, t);
	};
	l(Ne, (e) => {
		J(E) || e(Pe);
	}), P(Oe);
	var Fe = Q(Oe, 2), Ie = (e) => {
		ut(e, {
			get atlas() {
				return o.mail.atlas;
			},
			label: "Cc",
			get value() {
				return J(x).cc;
			},
			set value(e) {
				J(x).cc = e;
			}
		});
	};
	l(Fe, (e) => {
		J(C) && e(Ie);
	});
	var Le = Q(Fe, 2), Re = (e) => {
		ut(e, {
			get atlas() {
				return o.mail.atlas;
			},
			label: "Bcc",
			get value() {
				return J(x).bcc;
			},
			set value(e) {
				J(x).bcc = e;
			}
		});
	};
	l(Le, (e) => {
		J(E) && e(Re);
	});
	var ze = Q(Le, 2), Be = (e) => {
		var t = gt();
		a(t), s("input", t, Y), b(t, () => J(x).subject, (e) => J(x).subject = e), n(e, t);
	};
	l(ze, (e) => {
		(!u() || !J(x).reply_to) && e(Be);
	}), P(Te);
	var Ve = Q(Te, 2), He = _(Ve), Ue = Q(He, 2), We = Q(Ue, 2), Ge = Q(We, 2), Ke = _(Ge);
	A(Ke, {
		name: "open",
		size: 14
	}), P(Ge);
	var qe = Q(Ge, 2), Je = Q(qe, 2), Ye = Q(Je, 2), Xe = Q(Ye, 2), Ze = _(Xe);
	Ze.textContent = "<>", P(Xe);
	var Qe = Q(Xe, 4);
	let $e;
	var et = F(Qe, !0);
	P(Ve);
	var tt = Q(Ve, 2), nt = (e) => {
		var t = _t();
		m(t, () => J(D), !0), P(t), n(e, t);
	}, rt = (e) => {
		var t = vt();
		ne(t), r(t, (e) => X(O, e), () => J(O)), T(() => i(t, "placeholder", J(x).reply_to ? "Your reply…" : "Write… (Markdown: **bold**, *italic*, - lists, > quotes)")), s("input", t, Y), b(t, () => J(x).body, (e) => J(x).body = e), n(e, t);
	};
	l(tt, (e) => {
		J(D) === null ? e(rt, -1) : e(nt);
	});
	var it = Q(tt, 2), at = (e) => {
		var t = Ct(), r = _(t);
		g(r, 17, () => J(x).files, (e) => e.name + (e.path ?? "") + (e.from?.join() ?? ""), (e, t) => {
			var r = xt(), a = _(r);
			A(a, {
				name: "attach",
				size: 13
			});
			var o = Q(a), c = F(o, !0), u = Q(o), d = (e) => {
				var r = yt(), i = F(r, !0);
				T((e) => v(i, e), [() => L(J(t).size)]), n(e, r);
			};
			l(u, (e) => {
				J(t).size && e(d);
			});
			var f = Q(u), p = (e) => {
				var t = bt();
				n(e, t);
			};
			l(f, (e) => {
				J(t).from && e(p);
			});
			var m = Q(f);
			P(r), T(() => {
				v(c, J(t).name), i(m, "aria-label", `Remove ${J(t).name}`);
			}), s("click", m, () => de(J(t))), n(e, r);
		});
		var a = Q(r, 2), o = (e) => {
			var t = St(), r = F(t);
			T((e) => v(r, `${e ?? ""}: most servers take about 25 MB`), [() => L(J(fe))]), n(e, t);
		};
		l(a, (e) => {
			J(fe) > 20971520 && e(o);
		}), P(t), n(e, t);
	};
	l(it, (e) => {
		J(x).files.length && e(at);
	});
	var ot = Q(it, 2), st = (e) => {
		var t = wt(), r = F(t, !0);
		T(() => v(r, c().error)), n(e, t);
	};
	l(ot, (e) => {
		c().error && e(st);
	});
	var ct = Q(ot, 2), lt = (e) => {
		var t = Tt();
		n(e, t);
	};
	l(ct, (e) => {
		J(I) && e(lt);
	});
	var jt = Q(ct, 2), Mt = _(jt), Nt = _(Mt), Pt = Q(Nt, 2), Ft = _(Pt);
	A(Ft, {
		name: "down",
		size: 14
	}), P(Pt);
	var It = Q(Pt, 2), Lt = (e) => {
		var t = Dt(), r = _(t);
		g(r, 17, ve, (e) => e.label, (e, t) => {
			var r = Et(), i = _(r, !0), a = Q(i), o = F(a, !0);
			P(r), T((e) => {
				v(i, J(t).label), v(o, e);
			}, [() => (/* @__PURE__ */ new Date(J(t).at * 1e3)).toLocaleString(void 0, {
				weekday: "short",
				hour: "2-digit",
				hourCycle: "h23",
				minute: "2-digit"
			})]), s("click", r, () => {
				X(j, !1), he(J(t).at);
			}), n(e, r);
		});
		var i = Q(r, 2), o = _(i);
		a(o);
		var c = Q(o);
		P(i), P(t), s("keydown", o, (e) => {
			e.key === "Enter" && (e.preventDefault(), _e());
		}), b(o, () => J(N), (e) => X(N, e)), s("click", c, _e), n(e, t);
	};
	l(It, (e) => {
		J(j) && e(Lt);
	}), P(Mt);
	var Rt = Q(Mt, 2), zt = _(Rt);
	A(zt, { name: "attach" }), P(Rt);
	var Bt = Q(Rt, 2), Vt = _(Bt);
	A(Vt, { name: "note" }), P(Bt);
	var Ht = Q(Bt, 2);
	r(Ht, (e) => X(H, e), () => J(H));
	var Ut = Q(Ht, 2), Wt = F(Ut, !0), Gt = Q(Ut, 4), Kt = (e) => {
		var t = Ot(), r = _(t);
		A(r, {
			name: "open",
			size: 15
		}), P(t), s("click", t, () => {
			c().inline = !1;
		}), n(e, t);
	};
	l(Gt, (e) => {
		u() && e(Kt);
	});
	var qt = Q(Gt, 2), Jt = _(qt);
	A(Jt, { name: "trash" }), P(qt), P(jt), P($), T((e) => {
		Se = B($, 1, "composer svelte-zp5xms", null, Se, {
			inline: u(),
			over: J(I)
		}), i($, "aria-label", J(x).reply_to ? "Reply" : J(x).forward ? "Forward" : "New message"), $e = B(Qe, 1, "svelte-zp5xms", null, $e, { on: J(D) !== null }), v(et, J(D) === null ? "Preview" : "Edit"), Nt.disabled = c().sending, i(Pt, "aria-expanded", J(j)), v(Wt, e);
	}, [() => c().saving ? "Saving…" : c().savedAt ? `Draft saved ${new Date(c().savedAt).toLocaleTimeString(void 0, {
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	})}` : ""]), s("keydown", $, be), d("dragover", $, (e) => {
		e.preventDefault(), X(I, !0);
	}), d("dragleave", $, (e) => {
		e.currentTarget === e.target && X(I, !1);
	}), d("drop", $, ue), s("click", He, () => ie("**")), s("click", Ue, () => ie("*")), s("click", We, () => ie("~~")), s("click", Ge, oe), s("click", qe, () => ae("- ")), s("click", Je, () => ae("1. ")), s("click", Ye, () => ae("> ")), s("click", Xe, () => ie("`")), s("click", Qe, se), s("click", Nt, () => he()), s("click", Pt, () => X(j, !J(j))), s("click", Rt, () => J(H)?.click()), s("click", Bt, le), s("change", Ht, (e) => {
		e.currentTarget.files && ce(e.currentTarget.files), e.currentTarget.value = "";
	}), s("click", qt, ye), n(t, $), M();
}
C([
	"keydown",
	"click",
	"change",
	"input"
]);
//#endregion
//#region plugins/stable/email/ui/src/Reader.svelte
var Mt = c("<div class=\"loading svelte-j5oobt\"><div class=\"bar svelte-j5oobt\"></div><div class=\"bar short svelte-j5oobt\"></div><div class=\"bar svelte-j5oobt\"></div></div>"), Nt = c("<div class=\"atlas-empty\"><p> </p><button class=\"atlas-btn\">Try again</button></div>"), Pt = c("<button class=\"tool svelte-j5oobt\" title=\"Back to the list (u)\"><!></button>"), Ft = c("<button role=\"menuitem\" class=\"svelte-j5oobt\">Open the note</button>"), It = c("<button role=\"menuitem\" class=\"svelte-j5oobt\">Unsubscribe</button>"), Lt = c("<div class=\"menu svelte-j5oobt\" role=\"menu\" tabindex=\"-1\"><!> <button role=\"menuitem\" class=\"svelte-j5oobt\">Mark important</button> <button role=\"menuitem\" class=\"svelte-j5oobt\">Not important…</button> <!> <button role=\"menuitem\" class=\"svelte-j5oobt\">Make a task</button> <button role=\"menuitem\" class=\"svelte-j5oobt\">Expand all (;)</button></div>"), Rt = c("<span class=\"chip svelte-j5oobt\"> </span>"), zt = c("<button class=\"link svelte-j5oobt\">Unsubscribe</button>"), Bt = c("<span class=\"addr svelte-j5oobt\"> </span>"), Vt = c("<span class=\"snip svelte-j5oobt\"> </span>"), Ht = c("<span> </span>"), Ut = c("<button class=\"atlas-btn\">Edit the draft</button>"), Wt = c("<button class=\"mini svelte-j5oobt\" title=\"Reply (r)\"><!></button> <button class=\"mini svelte-j5oobt\" title=\"Reply all (a)\"><!></button> <button class=\"mini svelte-j5oobt\" title=\"Forward (f)\"><!></button>", 1), Gt = c("<div class=\"atlas-notice error\"> </div>"), Kt = c("<div class=\"remote svelte-j5oobt\" role=\"status\"><!> <span> </span> <button class=\"link svelte-j5oobt\">Show</button> <button class=\"link svelte-j5oobt\"> </button></div>"), qt = c("<div class=\"fwd svelte-j5oobt\"><div class=\"fwdhead svelte-j5oobt\"><b>Forwarded:</b> </div> <!></div>"), Jt = c("<div class=\"file svelte-j5oobt\"><button class=\"fopen svelte-j5oobt\" title=\"Open in Atlas\"><!><span class=\"fname svelte-j5oobt\"> </span><span class=\"faint svelte-j5oobt\"> </span></button> <button class=\"mini svelte-j5oobt\" title=\"Save into the vault…\"><!></button></div>"), Yt = c("<div class=\"files svelte-j5oobt\"></div>"), Xt = c("<!> <!> <!> <!> <!>", 1), Zt = c("<div class=\"loading svelte-j5oobt\"><div class=\"bar svelte-j5oobt\"></div></div>"), Qt = c("<div class=\"detail svelte-j5oobt\"><div class=\"to svelte-j5oobt\" role=\"presentation\"><!> <!> <span class=\"faint svelte-j5oobt\"> </span> <span class=\"grow svelte-j5oobt\"></span> <!></div> <!></div>"), $t = c("<article><button class=\"head svelte-j5oobt\"><span class=\"avatar svelte-j5oobt\"> </span> <span class=\"from svelte-j5oobt\"><b class=\"svelte-j5oobt\"> </b><!></span> <!> <span class=\"when svelte-j5oobt\"><!> </span></button> <!></article>"), en = c("<div class=\"quick svelte-j5oobt\"><button class=\"atlas-btn svelte-j5oobt\"><!> Reply</button> <button class=\"atlas-btn svelte-j5oobt\"><!> Reply all</button> <button class=\"atlas-btn svelte-j5oobt\"><!> Forward</button></div>"), tn = c("<header class=\"top svelte-j5oobt\"><div class=\"tools svelte-j5oobt\" role=\"toolbar\" aria-label=\"Conversation actions\"><!> <button class=\"tool svelte-j5oobt\" title=\"Archive (e)\"><!></button> <button class=\"tool svelte-j5oobt\"><!></button> <button class=\"tool svelte-j5oobt\"><!></button> <span class=\"sep svelte-j5oobt\"></span> <button class=\"tool svelte-j5oobt\" title=\"Mark unread (⇧U)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Snooze (h)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Move to (v)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Label (l)\"><!></button> <span class=\"grow svelte-j5oobt\"></span> <button><!></button> <div class=\"menu-wrap svelte-j5oobt\"><button class=\"tool svelte-j5oobt\" title=\"More\"><!></button> <!></div></div> <h2 class=\"subject svelte-j5oobt\"> <button><!></button></h2> <div class=\"meta svelte-j5oobt\"><!> <span class=\"faint svelte-j5oobt\"> </span> <!></div></header> <div class=\"cards svelte-j5oobt\"></div> <div class=\"answer svelte-j5oobt\"><!></div>", 1), nn = c("<div class=\"atlas-empty nothing svelte-j5oobt\"><!> <p class=\"svelte-j5oobt\"> </p> <p class=\"faint svelte-j5oobt\">j / k to move, Enter to open, c to write, ? for every key.</p></div>"), rn = c("<section class=\"reader svelte-j5oobt\" aria-label=\"The conversation\"><!></section>"), an = {
	hash: "svelte-j5oobt",
	code: ".reader.svelte-j5oobt {height:100%;overflow-y:auto;display:flex;flex-direction:column;box-sizing:border-box;}.top.svelte-j5oobt {position:sticky;top:0;z-index:2;background:var(--bg);padding:8px 20px 10px;border-bottom:1px solid var(--border);display:grid;gap:6px;}.tools.svelte-j5oobt {display:flex;align-items:center;gap:2px;margin-left:-6px;}.tool.svelte-j5oobt {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);min-width:24px;min-height:24px;display:grid;place-items:center;}.tool.svelte-j5oobt:hover {background:var(--bg-hover);color:var(--text);}.tool.on.svelte-j5oobt {color:var(--accent);}.tool.svelte-j5oobt:focus-visible, .head.svelte-j5oobt:focus-visible, .mini.svelte-j5oobt:focus-visible, .fopen.svelte-j5oobt:focus-visible, .star.svelte-j5oobt:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.sep.svelte-j5oobt {width:1px;height:18px;background:var(--border-strong);margin:0 4px;}.grow.svelte-j5oobt {flex:1;}.subject.svelte-j5oobt {margin:0;font-size:1.32em;line-height:1.3;font-weight:600;color:var(--heading);display:flex;gap:8px;align-items:flex-start;overflow-wrap:anywhere;}.star.svelte-j5oobt {all:unset;cursor:pointer;color:var(--text-faint);padding:3px;border-radius:var(--radius-sm);margin-top:1px;}.star.on.svelte-j5oobt {color:var(--yellow);}.meta.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:0.88em;}.chip.svelte-j5oobt {font-size:0.9em;padding:0 7px;border-radius:999px;background:hsl(var(--h) 60% 50% / 0.16);}.faint.svelte-j5oobt {color:var(--text-faint);}.link.svelte-j5oobt {all:unset;cursor:pointer;color:var(--accent);}.link.svelte-j5oobt:hover {text-decoration:underline;}.menu-wrap.svelte-j5oobt {position:relative;}.menu.svelte-j5oobt {position:absolute;right:0;top:100%;z-index:5;min-width:200px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));padding:4px;display:grid;}.menu.svelte-j5oobt button:where(.svelte-j5oobt) {all:unset;cursor:pointer;padding:7px 10px;border-radius:var(--radius-sm);}.menu.svelte-j5oobt button:where(.svelte-j5oobt):hover {background:var(--bg-hover);}.cards.svelte-j5oobt {padding:12px 16px;display:grid;gap:8px;}.card.svelte-j5oobt {border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-alt);overflow:hidden;}.card.open.svelte-j5oobt {background:var(--bg);box-shadow:var(--shadow-sm);}.card.draft.svelte-j5oobt {border-color:color-mix(in srgb, var(--red) 40%, transparent);}.head.svelte-j5oobt {all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;min-width:0;}.head.svelte-j5oobt:hover {background:var(--bg-hover);}.avatar.svelte-j5oobt {flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);}.from.svelte-j5oobt {display:flex;gap:8px;align-items:baseline;min-width:0;flex:0 1 auto;white-space:nowrap;}.unread.svelte-j5oobt .from:where(.svelte-j5oobt) b:where(.svelte-j5oobt) {color:var(--heading);}.addr.svelte-j5oobt {color:var(--text-faint);font-size:0.86em;overflow:hidden;text-overflow:ellipsis;}.snip.svelte-j5oobt {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);}.when.svelte-j5oobt {margin-left:auto;flex:none;color:var(--text-muted);font-size:0.85em;display:flex;gap:5px;align-items:center;}.detail.svelte-j5oobt {padding:0 16px 14px 54px;display:grid;gap:10px;}.to.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;font-size:0.86em;color:var(--text-muted);}.mini.svelte-j5oobt {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;}.mini.svelte-j5oobt:hover {background:var(--bg-hover);color:var(--text);}.remote.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:7px 10px;border-radius:var(--radius-sm);background:var(--bg-hover);font-size:0.86em;color:var(--text-muted);}.fwd.svelte-j5oobt {border-left:3px solid var(--border-strong);padding-left:12px;display:grid;gap:6px;}.fwdhead.svelte-j5oobt {font-size:0.86em;color:var(--text-muted);}.files.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:8px;}.file.svelte-j5oobt {display:flex;align-items:center;border:1px solid var(--border-strong);border-radius:var(--radius);background:var(--bg-alt);}.fopen.svelte-j5oobt {all:unset;cursor:pointer;display:flex;gap:8px;align-items:center;padding:7px 10px;max-width:280px;}.fopen.svelte-j5oobt:hover {color:var(--accent);}.fname.svelte-j5oobt {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}.fopen.svelte-j5oobt .faint:where(.svelte-j5oobt) {white-space:nowrap;flex:none;font-size:0.86em;}.answer.svelte-j5oobt {padding:4px 16px 24px 16px;}.quick.svelte-j5oobt {display:flex;gap:8px;flex-wrap:wrap;padding-left:38px;}.quick.svelte-j5oobt .atlas-btn:where(.svelte-j5oobt) {display:inline-flex;gap:6px;align-items:center;}.nothing.svelte-j5oobt {margin:auto;display:grid;justify-items:center;gap:6px;color:var(--text-faint);text-align:center;padding:40px;}.nothing.svelte-j5oobt p:where(.svelte-j5oobt) {margin:0;}.loading.svelte-j5oobt {padding:24px;display:grid;gap:12px;}.bar.svelte-j5oobt {height:12px;border-radius:4px;background:var(--bg-hover);}.bar.short.svelte-j5oobt {width:40%;}\n  @container (max-width: 560px) {.detail.svelte-j5oobt {padding-left:14px;}.quick.svelte-j5oobt {padding-left:0;}.top.svelte-j5oobt {padding:6px 12px 8px;}.cards.svelte-j5oobt {padding:8px;} }"
};
function on(r, a) {
	U(a, !0), p(r, an);
	let c = y(a, "narrow", 3, !1), u = k(() => a.mail.open), f = z(K([])), m = z(K([])), h = z(!1), b = -1;
	w(() => {
		if (!J(u) || J(u).thread === b) return;
		b = J(u).thread;
		let e = J(u).messages.at(-1);
		X(f, J(u).messages.filter((t) => !t.seen || t.draft || t === e).map((e) => e.id), !0), X(m, [], !0);
	});
	function x(e) {
		J(u) && X(f, e ? J(u).messages.map((e) => e.id) : [J(u).messages.at(-1).id], !0);
	}
	let C = (e) => X(f, J(f).includes(e) ? J(f).filter((t) => t !== e) : [...J(f), e], !0), E = k(() => a.mail.own), D = (e) => e.map((e) => J(E).includes(e.addr.toLowerCase()) ? "me" : e.name || e.addr).join(", "), j = z(K([]));
	function R(e, t, n) {
		let r = `${t}:${n}`;
		return e.length <= 4 || J(j).includes(r) ? D(e) : `${D(e.slice(0, 3))} and ${e.length - 3} more`;
	}
	let V = k(() => a.mail.composers.find((e) => e.inline)), W = k(() => J(u) ? a.mail.rows.find((e) => e.thread === J(u).thread) : void 0), G = k(() => !!J(u)?.messages.some((e) => e.flagged)), q = k(() => J(u)?.messages.findLast((e) => e.unsubscribe)?.unsubscribe ? J(u)?.messages.findLast((e) => e.unsubscribe) : void 0), te = k(() => J(u)?.messages.at(-1)?.folder_role ?? null);
	async function Y(e, t, n = !0) {
		try {
			let r = await a.mail.call("attachment", {
				id: e.id,
				part: t.part,
				name: t.name
			});
			a.mail.atlas.open(r.path, void 0, { beside: n });
		} catch (e) {
			a.mail.toast(`Cannot open ${t.name}: ${e.message}`, "error");
		}
	}
	async function ne(e, t) {
		let n = await ee(a.mail.atlas, `Save ${t.name} into which vault folder?`, "attachments");
		if (n) try {
			let r = await a.mail.call("attachment", {
				id: e.id,
				part: t.part,
				name: t.name,
				to: n
			});
			a.mail.toast(`Saved ${r.path}`, "success", { action: {
				label: "Open",
				run: () => a.mail.atlas.open(r.path, void 0, { beside: !0 })
			} });
		} catch (e) {
			a.mail.toast(`Cannot save ${t.name}: ${e.message}`, "error");
		}
	}
	async function re(e) {
		let t = e.from[0]?.addr;
		t && (await a.mail.call("allow_remote", { sender: t }), X(m, [...J(m), ...J(u).messages.filter((e) => e.from[0]?.addr === t).map((e) => e.id)], !0), a.mail.toast(`Pictures from ${t} are shown from now on`));
	}
	async function se() {
		if (J(q) && await Z(a.mail.atlas, `Unsubscribe from ${J(q).from[0]?.name || J(q).from[0]?.addr}?`, { ok: "Unsubscribe" })) try {
			let e = await a.mail.call("unsubscribe", { id: J(q).id });
			e.open ? window.open(e.open, "_blank") : a.mail.toast(e.done === "mail" ? "Unsubscribe mail sent" : "Unsubscribed", "success");
		} catch (e) {
			a.mail.toast(`Could not unsubscribe: ${e.message}`, "error");
		}
	}
	let ce = (e) => e.startsWith("image/") ? "image" : e === "text/calendar" ? "calendar" : "attach";
	var ue = { expandAll: x }, de = rn(), fe = _(de), pe = (e) => {
		var t = Mt();
		n(e, t);
	}, me = (e) => {
		var t = Nt(), r = _(t), i = F(r, !0), o = Q(r);
		P(t), T(() => v(i, a.mail.readError)), s("click", o, () => a.mail.openId && a.mail.read(a.mail.openId)), n(e, t);
	}, he = (r) => {
		var p = tn(), y = e(p), b = _(y), w = _(b), D = (e) => {
			var t = Pt(), r = _(t);
			A(r, { name: "back" }), P(t), s("click", t, function(...e) {
				a.onback?.apply(this, e);
			}), n(e, t);
		};
		l(w, (e) => {
			c() && e(D);
		});
		var M = Q(w, 2), z = _(M);
		A(z, { name: "archive" }), P(M);
		var U = Q(M, 2), K = _(U);
		A(K, { name: "trash" }), P(U);
		var ee = Q(U, 2), Z = _(ee);
		A(Z, { name: "spam" }), P(ee);
		var ue = Q(ee, 4), de = _(ue);
		A(de, { name: "unread" }), P(ue);
		var fe = Q(ue, 2), pe = _(fe);
		A(pe, { name: "clock" }), P(fe);
		var me = Q(fe, 2), he = _(me);
		A(he, { name: "folder" }), P(me);
		var ge = Q(me, 2), _e = _(ge);
		A(_e, { name: "label" }), P(ge);
		var ve = Q(ge, 4);
		let ye;
		var be = _(ve);
		A(be, { name: "note" }), P(ve);
		var xe = Q(ve, 2), $ = _(xe), Se = _($);
		A(Se, { name: "more" }), P($);
		var Ce = Q($, 2), we = (e) => {
			var t = Lt(), r = _(t), i = (e) => {
				var t = Ft();
				s("click", t, () => {
					X(h, !1), a.mail.atlas.open(J(u).saved, void 0, { beside: !0 });
				}), n(e, t);
			};
			l(r, (e) => {
				J(u).saved && e(i);
			});
			var o = Q(r, 2), c = Q(o, 2), f = Q(c, 2), p = (e) => {
				var t = It();
				s("click", t, () => {
					X(h, !1), se();
				}), n(e, t);
			};
			l(f, (e) => {
				J(q) && e(p);
			});
			var m = Q(f, 2), g = Q(m, 2);
			P(t), d("mouseleave", t, () => X(h, !1)), s("click", o, () => {
				X(h, !1), a.mail.importance(!0);
			}), s("click", c, () => {
				X(h, !1), a.mail.importance(!1);
			}), s("click", m, () => {
				X(h, !1), a.mail.atlas.capture(`- [ ] ${J(u).subject} (mail from ${le(J(u).messages.at(-1)?.from[0], J(E))})`), a.mail.toast("Added a task to today's log");
			}), s("click", g, () => {
				X(h, !1), x(!0);
			}), n(e, t);
		};
		l(Ce, (e) => {
			J(h) && e(we);
		}), P(xe), P(b);
		var Te = Q(b, 2), Ee = _(Te), De = Q(Ee);
		let Oe;
		var ke = _(De);
		A(ke, {
			name: "star",
			size: 18,
			get filled() {
				return J(G);
			}
		}), P(De), P(Te);
		var Ae = Q(Te, 2), je = _(Ae), Me = (r) => {
			var i = S(), a = e(i);
			g(a, 16, () => J(W).labels, (e) => e, (e, r) => {
				var i = Rt();
				let a;
				var o = F(i, !0);
				T((e, n) => {
					a = t(i, "", a, { "--h": e }), v(o, n);
				}, [() => N(r), () => r.replace(/^\$/, "")]), n(e, i);
			}), n(r, i);
		};
		l(je, (e) => {
			J(W) && e(Me);
		});
		var Ne = Q(je, 2), Pe = F(Ne, !0), Fe = Q(Ne, 2), Ie = (e) => {
			var t = zt();
			s("click", t, se), n(e, t);
		};
		l(Fe, (e) => {
			J(q) && e(Ie);
		}), P(Ae), P(y);
		var Le = Q(y, 2);
		g(Le, 21, () => J(u).messages, (e) => e.id, (r, c) => {
			let u = k(() => J(f).includes(J(c).id)), d = k(() => !!J(c).body?.remote_allowed || J(m).includes(J(c).id));
			var p = $t();
			let h;
			var y = _(p), b = _(y);
			let x;
			var S = F(b, !0), w = Q(b, 2), D = _(w), M = F(D, !0), z = Q(D), V = (e) => {
				var t = Bt(), r = F(t, !0);
				T(() => v(r, J(c).from[0]?.addr)), n(e, t);
			};
			l(z, (e) => {
				J(u) && !J(c).draft && e(V);
			}), P(w);
			var U = Q(w, 2), W = (e) => {
				var t = Vt(), r = F(t, !0);
				T((e) => v(r, e), [() => J(c).snippet || J(c).body?.text?.slice(0, 160)]), n(e, t);
			};
			l(U, (e) => {
				J(u) || e(W);
			});
			var G = Q(U, 2), K = _(G), ee = (e) => {
				A(e, {
					name: "attach",
					size: 13
				});
			};
			l(K, (e) => {
				J(c).has_attachments && e(ee);
			});
			var q = Q(K, 1, !0);
			P(G), P(y);
			var te = Q(y, 2), Z = (t) => {
				var r = Qt(), i = _(r), u = _(i), f = (e) => {
					var t = Ht(), r = F(t);
					T((e) => v(r, `to ${e ?? ""}`), [() => R(J(c).to, J(c).id, "to")]), n(e, t);
				};
				l(u, (e) => {
					J(c).to.length && e(f);
				});
				var p = Q(u, 2), h = (e) => {
					var t = Ht(), r = F(t);
					T((e) => v(r, `cc ${e ?? ""}`), [() => R(J(c).cc, J(c).id, "cc")]), n(e, t);
				};
				l(p, (e) => {
					J(c).cc.length && e(h);
				});
				var y = Q(p, 2), b = F(y, !0), x = Q(y, 4), S = (e) => {
					var t = Ut();
					s("click", t, () => a.mail.editDraft(J(c).id)), n(e, t);
				}, C = (t) => {
					var r = Wt(), i = e(r), o = _(i);
					A(o, {
						name: "reply",
						size: 15
					}), P(i);
					var l = Q(i, 2), u = _(l);
					A(u, {
						name: "replyall",
						size: 15
					}), P(l);
					var d = Q(l, 2), f = _(d);
					A(f, {
						name: "forward",
						size: 15
					}), P(d), s("click", i, () => a.mail.reply("reply", J(c).id)), s("click", l, () => a.mail.reply("all", J(c).id)), s("click", d, () => a.mail.reply("forward", J(c).id)), n(t, r);
				};
				l(x, (e) => {
					J(c).draft ? e(S) : e(C, -1);
				}), P(i);
				var w = Q(i, 2), E = (e) => {
					var t = Gt(), r = F(t, !0);
					T(() => v(r, J(c).error)), n(e, t);
				}, D = (t) => {
					var r = Xt(), i = e(r), u = (e) => {
						var t = Kt(), r = _(t);
						A(r, {
							name: "lock",
							size: 14
						});
						var i = Q(r, 2), a = F(i), o = Q(i, 2), l = Q(o, 2), u = F(l);
						P(t), T(() => {
							v(a, `${J(c).body.remote ?? ""} remote picture${J(c).body.remote === 1 ? "" : "s"} blocked (they can tell the sender you read it).`), v(u, `Always from ${J(c).from[0]?.addr ?? ""}`);
						}), s("click", o, () => X(m, [...J(m), J(c).id], !0)), s("click", l, () => re(J(c))), n(e, t);
					};
					l(i, (e) => {
						J(c).body.remote && !J(d) && e(u);
					});
					var f = Q(i, 2), p = (e) => {
						rt(e, {
							get mail() {
								return a.mail;
							},
							get id() {
								return J(c).id;
							},
							get invite() {
								return J(c).body.invite;
							}
						});
					};
					l(f, (e) => {
						J(c).body.invite && e(p);
					});
					var h = Q(f, 2);
					O(h, {
						get html() {
							return J(c).body.html;
						},
						get plain() {
							return J(c).body.plain;
						},
						get remote() {
							return J(d);
						},
						get dark() {
							return a.dark;
						}
					});
					var y = Q(h, 2);
					g(y, 17, () => J(c).body.forwarded, o, (e, t) => {
						var r = qt(), i = _(r), o = Q(_(i));
						P(i);
						var s = Q(i, 2);
						O(s, {
							get html() {
								return J(t).html;
							},
							get plain() {
								return J(t).plain;
							},
							get remote() {
								return J(d);
							},
							get dark() {
								return a.dark;
							}
						}), P(r), T((e, n) => v(o, ` ${J(t).subject ?? ""} · ${e ?? ""} · ${n ?? ""}`), [() => J(t).from.map(H).join(", "), () => oe(J(t).date)]), n(e, r);
					});
					var b = Q(y, 2), x = (e) => {
						var t = Yt();
						g(t, 21, () => J(c).body.attachments, (e) => e.part, (e, t) => {
							var r = Jt(), i = _(r), a = _(i);
							{
								let e = k(() => ce(J(t).mime));
								A(a, { get name() {
									return J(e);
								} });
							}
							var o = Q(a), l = F(o, !0), u = Q(o), d = F(u, !0);
							P(i);
							var f = Q(i, 2), p = _(f);
							A(p, {
								name: "save",
								size: 14
							}), P(f), P(r), T((e) => {
								v(l, J(t).name), v(d, e);
							}, [() => L(J(t).size)]), s("click", i, () => Y(J(c), J(t))), s("click", f, () => ne(J(c), J(t))), n(e, r);
						}), P(t), n(e, t);
					};
					l(b, (e) => {
						J(c).body.attachments.length && e(x);
					}), n(t, r);
				}, M = (e) => {
					var t = Zt();
					n(e, t);
				};
				l(w, (e) => {
					J(c).error ? e(E) : J(c).body ? e(D, 1) : e(M, -1);
				}), P(r), T((e) => v(b, e), [() => ie(J(c).date)]), s("click", i, () => X(j, [
					...J(j),
					`${J(c).id}:to`,
					`${J(c).id}:cc`
				], !0)), n(t, r);
			};
			l(te, (e) => {
				J(u) && e(Z);
			}), P(p), T((e, n, r, a, o) => {
				h = B(p, 1, "card svelte-j5oobt", null, h, {
					open: J(u),
					unread: !J(c).seen,
					draft: J(c).draft
				}), i(y, "aria-expanded", J(u)), x = t(b, "", x, { "--h": e }), v(S, n), v(M, r), i(G, "title", a), v(q, o);
			}, [
				() => N(J(c).from[0]?.addr ?? ""),
				() => I(J(c).from[0]),
				() => J(c).draft ? "Draft" : le(J(c).from[0], J(E)),
				() => ie(J(c).date),
				() => oe(J(c).date)
			]), s("click", y, () => C(J(c).id)), n(r, p);
		}), P(Le);
		var Re = Q(Le, 2), ze = _(Re), Be = (e) => {
			jt(e, {
				get mail() {
					return a.mail;
				},
				get c() {
					return J(V);
				},
				inline: !0
			});
		}, Ve = (e) => {
			var t = en(), r = _(t), i = _(r);
			A(i, {
				name: "reply",
				size: 15
			}), ae(), P(r);
			var o = Q(r, 2), c = _(o);
			A(c, {
				name: "replyall",
				size: 15
			}), ae(), P(o);
			var l = Q(o, 2), u = _(l);
			A(u, {
				name: "forward",
				size: 15
			}), ae(), P(l), P(t), s("click", r, () => a.mail.reply("reply")), s("click", o, () => a.mail.reply("all")), s("click", l, () => a.mail.reply("forward")), n(e, t);
		};
		l(ze, (e) => {
			J(V) ? e(Be) : e(Ve, -1);
		}), P(Re), T((e) => {
			i(U, "title", J(te) === "trash" ? "Delete for good" : "Delete (#)"), i(ee, "title", J(te) === "junk" ? "Not spam" : "Spam (!)"), ye = B(ve, 1, "tool svelte-j5oobt", null, ye, { on: !!J(u).saved }), i(ve, "title", J(u).saved ? `Saved as ${J(u).saved} — save again to add new messages` : "Save as note (⇧N)"), i($, "aria-expanded", J(h)), v(Ee, `${(J(u).subject || "(no subject)") ?? ""} `), Oe = B(De, 1, "star svelte-j5oobt", null, Oe, { on: J(G) }), i(De, "title", J(G) ? "Unstar (s)" : "Star (s)"), i(De, "aria-pressed", J(G)), v(Pe, e);
		}, [() => `${J(u).messages.length} message${J(u).messages.length === 1 ? "" : "s"}${J(u).messages.at(-1)?.folder_label ? ` · ${J(u).messages.at(-1)?.folder_label}` : ""}`]), s("click", M, () => a.mail.archive()), s("click", U, () => a.mail.trash()), s("click", ee, () => a.mail.spam()), s("click", ue, () => a.mail.toggleRead()), s("click", fe, () => a.onpick("snooze")), s("click", me, () => a.onpick("move")), s("click", ge, () => a.onpick("label")), s("click", ve, () => a.mail.saveNote()), s("click", $, () => X(h, !J(h))), s("click", De, () => a.mail.toggleStar()), n(r, p);
	}, ge = (e) => {
		var t = nn(), r = _(t);
		A(r, {
			name: "inbox",
			size: 40
		});
		var i = Q(r, 2), o = F(i, !0);
		ae(2), P(t), T(() => v(o, a.mail.rows.length ? "Choose a conversation to read it." : "Nothing here.")), n(e, t);
	};
	return l(fe, (e) => {
		a.mail.reading && !J(u) ? e(pe) : a.mail.readError ? e(me, 1) : J(u) ? e(he, 2) : e(ge, -1);
	}), P(de), n(r, de), M(ue);
}
C(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/Toasts.svelte
var sn = c("<button class=\"svelte-1rm31ba\">Undo</button>"), cn = c("<button class=\"svelte-1rm31ba\"> </button>"), ln = c("<div><span class=\"text svelte-1rm31ba\"> </span> <!> <!> <button class=\"x svelte-1rm31ba\" aria-label=\"Close\">×</button></div>"), un = c("<div class=\"toasts svelte-1rm31ba\" aria-live=\"polite\"></div>"), dn = {
	hash: "svelte-1rm31ba",
	code: ".toasts.svelte-1rm31ba {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-1rm31ba {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-1rm31ba-in 120ms var(--ease);}.toast.error.svelte-1rm31ba {background:var(--red);color:#fff;}.text.svelte-1rm31ba {min-width:0;overflow-wrap:anywhere;}button.svelte-1rm31ba {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-1rm31ba button:where(.svelte-1rm31ba) {color:#fff;text-decoration:underline;}button.svelte-1rm31ba:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-1rm31ba:focus-visible {outline:2px solid currentColor;}.x.svelte-1rm31ba {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-1rm31ba-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-1rm31ba { animation: none;} }"
};
function fn(e, t) {
	U(t, !0), p(e, dn);
	var r = un();
	g(r, 21, () => t.mail.toasts, (e) => e.id, (e, r) => {
		var a = ln();
		let o;
		var c = _(a), u = F(c, !0), d = Q(c, 2), f = (e) => {
			var i = sn();
			s("click", i, async () => {
				t.mail.dismiss(J(r).id), await J(r).undo?.();
			}), n(e, i);
		};
		l(d, (e) => {
			J(r).undo && e(f);
		});
		var p = Q(d, 2), m = (e) => {
			var i = cn(), a = F(i, !0);
			T(() => v(a, J(r).action.label)), s("click", i, () => {
				t.mail.dismiss(J(r).id), J(r).action?.run();
			}), n(e, i);
		};
		l(p, (e) => {
			J(r).action && e(m);
		});
		var h = Q(p, 2);
		P(a), T(() => {
			o = B(a, 1, "toast svelte-1rm31ba", null, o, {
				error: J(r).kind === "error",
				success: J(r).kind === "success"
			}), i(a, "role", J(r).kind === "error" ? "alert" : "status"), v(u, J(r).text);
		}), s("click", h, () => t.mail.dismiss(J(r).id)), n(e, a);
	}), P(r), n(e, r), M();
}
C(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/keys.ts
var pn = (e) => e.targets().length > 0, mn = [
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
		when: pn,
		run: (e) => e.archive()
	},
	{
		id: "trash",
		title: "Delete (to Trash)",
		group: "Act",
		keys: "#, delete",
		when: pn,
		run: (e) => e.trash()
	},
	{
		id: "spam",
		title: "Spam / not spam",
		group: "Act",
		keys: "!",
		when: pn,
		run: (e) => e.spam()
	},
	{
		id: "star",
		title: "Star / unstar",
		group: "Act",
		keys: "s",
		when: pn,
		run: (e) => e.toggleStar()
	},
	{
		id: "read",
		title: "Mark read",
		group: "Act",
		keys: "shift+i",
		when: pn,
		run: (e) => e.mark("read", !0)
	},
	{
		id: "unread",
		title: "Mark unread",
		group: "Act",
		keys: "shift+u",
		when: pn,
		run: (e) => e.mark("read", !1)
	},
	{
		id: "toggle-read",
		title: "Read / unread",
		group: "Act",
		keys: "m",
		when: pn,
		run: (e) => e.toggleRead()
	},
	{
		id: "snooze",
		title: "Snooze…",
		group: "Act",
		keys: "h, b",
		when: pn,
		run: (e, t) => t.pick("snooze")
	},
	{
		id: "unsnooze",
		title: "Back to the inbox now (unsnooze)",
		group: "Act",
		when: (e) => e.view.name === "snoozed" && pn(e),
		run: (e) => e.unsnooze()
	},
	{
		id: "move",
		title: "Move to…",
		group: "Act",
		keys: "v",
		when: pn,
		run: (e, t) => t.pick("move")
	},
	{
		id: "label",
		title: "Label…",
		group: "Act",
		keys: "l",
		when: pn,
		run: (e, t) => t.pick("label")
	},
	{
		id: "important",
		title: "Important",
		group: "Act",
		keys: "i",
		when: pn,
		run: (e) => e.importance(!0)
	},
	{
		id: "not-important",
		title: "Not important (moves it out of the inbox)",
		group: "Act",
		keys: "n",
		when: pn,
		run: (e) => e.importance(!1)
	},
	{
		id: "note",
		title: "Save as note",
		group: "Act",
		keys: "shift+n",
		when: pn,
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
function hn(e) {
	let t = (e.key.length, e.key.toLowerCase()), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var gn = new Map(mn.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e]))), _n = new Set([...gn.keys()].filter((e) => e.includes(" ")).map((e) => e.split(" ")[0]));
function vn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.split(" ").map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowdown", "↓").replace("arrowup", "↑").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("home", "Home").replace("end", "End").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)).join(" then ")) : [];
}
//#endregion
//#region plugins/stable/email/ui/src/Shortcuts.svelte
var yn = c("<span class=\"or svelte-8ls7cr\">or</span>"), bn = c("<!><kbd class=\"svelte-8ls7cr\"> </kbd>", 1), xn = c("<div class=\"line svelte-8ls7cr\"><span> </span><span class=\"keys svelte-8ls7cr\"></span></div>"), Sn = c("<section class=\"svelte-8ls7cr\"><h3 class=\"svelte-8ls7cr\"> </h3> <!></section>"), Cn = c("<div class=\"scrim svelte-8ls7cr\" role=\"presentation\"><div class=\"sheet svelte-8ls7cr\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Keyboard shortcuts\" tabindex=\"-1\"><header class=\"svelte-8ls7cr\"><h2 class=\"svelte-8ls7cr\">Keyboard shortcuts</h2><span class=\"faint svelte-8ls7cr\">Ctrl+K finds any command by name</span><button class=\"x svelte-8ls7cr\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-8ls7cr\"></div></div></div>"), wn = {
	hash: "svelte-8ls7cr",
	code: ".scrim.svelte-8ls7cr {position:absolute;inset:0;z-index:60;background:rgba(0, 0, 0, 0.35);display:grid;place-items:center;padding:16px;}.sheet.svelte-8ls7cr {background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-lg);box-shadow:var(--shadow-md, var(--shadow-sm));width:min(980px, 100%);max-height:90%;overflow:auto;padding:18px 22px 22px;}header.svelte-8ls7cr {display:flex;gap:14px;align-items:baseline;margin-bottom:12px;}h2.svelte-8ls7cr {margin:0;font-size:1.15em;}.faint.svelte-8ls7cr {color:var(--text-faint);font-size:0.9em;}.x.svelte-8ls7cr {all:unset;cursor:pointer;margin-left:auto;font-size:1.4em;color:var(--text-muted);padding:0 6px;}.cols.svelte-8ls7cr {columns:3 260px;column-gap:28px;}section.svelte-8ls7cr {break-inside:avoid;margin-bottom:16px;}h3.svelte-8ls7cr {margin:0 0 6px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.line.svelte-8ls7cr {display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:0.92em;}.keys.svelte-8ls7cr {display:flex;gap:4px;align-items:center;flex:none;}.or.svelte-8ls7cr {color:var(--text-faint);font-size:0.8em;}kbd.svelte-8ls7cr {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:5px;border:1px solid var(--border-strong);border-bottom-width:2px;background:var(--bg);}"
};
function Tn(t, r) {
	U(r, !0), p(t, wn);
	let i = [...new Set(mn.map((e) => e.group))];
	var a = Cn(), o = _(a), c = _(o), u = Q(_(c), 2);
	P(c);
	var d = Q(c, 2);
	g(d, 20, () => i, (e) => e, (t, r) => {
		var i = Sn(), a = _(i), o = F(a, !0), s = Q(a, 2);
		g(s, 17, () => mn.filter((e) => e.group === r && e.keys), (e) => e.id, (t, r) => {
			var i = xn(), a = _(i), o = F(a, !0), s = Q(a);
			g(s, 22, () => vn(J(r).keys), (e) => e, (t, r, i) => {
				var a = bn(), o = e(a), s = (e) => {
					var t = yn();
					n(e, t);
				};
				l(o, (e) => {
					J(i) && e(s);
				});
				var c = Q(o), u = F(c, !0);
				T(() => v(u, r)), n(t, a);
			}), P(s), P(i), T(() => v(o, J(r).title)), n(t, i);
		}), P(i), T(() => v(o, r)), n(t, i);
	}), P(d), P(o), P(a), s("click", a, function(...e) {
		r.onclose?.apply(this, e);
	}), s("keydown", a, (e) => e.key === "Escape" && r.onclose()), s("click", o, (e) => e.stopPropagation()), s("keydown", o, () => {}), s("click", u, function(...e) {
		r.onclose?.apply(this, e);
	}), n(t, a), M();
}
C(["click", "keydown"]);
//#endregion
//#region plugins/stable/email/ui/src/store.svelte.ts
var En = 100, Dn = class {
	atlas;
	#e = z(K([]));
	get accounts() {
		return J(this.#e);
	}
	set accounts(e) {
		X(this.#e, e, !0);
	}
	#t = z(K([]));
	get own() {
		return J(this.#t);
	}
	set own(e) {
		X(this.#t, e, !0);
	}
	#n = z(K([]));
	get folders() {
		return J(this.#n);
	}
	set folders(e) {
		X(this.#n, e, !0);
	}
	#r = z(K({}));
	get counts() {
		return J(this.#r);
	}
	set counts(e) {
		X(this.#r, e, !0);
	}
	#i = z(K({
		name: "inbox",
		account: null,
		folder: null,
		label: "Inbox"
	}));
	get view() {
		return J(this.#i);
	}
	set view(e) {
		X(this.#i, e, !0);
	}
	#a = z("");
	get query() {
		return J(this.#a);
	}
	set query(e) {
		X(this.#a, e, !0);
	}
	#o = z("");
	get quick() {
		return J(this.#o);
	}
	set quick(e) {
		X(this.#o, e, !0);
	}
	#s = z("");
	get kind() {
		return J(this.#s);
	}
	set kind(e) {
		X(this.#s, e, !0);
	}
	#c = z(K([]));
	get rows() {
		return J(this.#c);
	}
	set rows(e) {
		X(this.#c, e, !0);
	}
	#l = z(0);
	get total() {
		return J(this.#l);
	}
	set total(e) {
		X(this.#l, e, !0);
	}
	#u = z(0);
	get unread() {
		return J(this.#u);
	}
	set unread(e) {
		X(this.#u, e, !0);
	}
	#d = z(K([]));
	get chips() {
		return J(this.#d);
	}
	set chips(e) {
		X(this.#d, e, !0);
	}
	#f = z(!1);
	get loading() {
		return J(this.#f);
	}
	set loading(e) {
		X(this.#f, e, !0);
	}
	#p = z("");
	get error() {
		return J(this.#p);
	}
	set error(e) {
		X(this.#p, e, !0);
	}
	#m = z(null);
	get cursor() {
		return J(this.#m);
	}
	set cursor(e) {
		X(this.#m, e, !0);
	}
	#h = z(K([]));
	get checked() {
		return J(this.#h);
	}
	set checked(e) {
		X(this.#h, e, !0);
	}
	#g = z(null);
	get open() {
		return J(this.#g);
	}
	set open(e) {
		X(this.#g, e, !0);
	}
	#_ = z(null);
	get openId() {
		return J(this.#_);
	}
	set openId(e) {
		X(this.#_, e, !0);
	}
	#v = z(!1);
	get reading() {
		return J(this.#v);
	}
	set reading(e) {
		X(this.#v, e, !0);
	}
	#y = z("");
	get readError() {
		return J(this.#y);
	}
	set readError(e) {
		X(this.#y, e, !0);
	}
	#b = z(K([]));
	get composers() {
		return J(this.#b);
	}
	set composers(e) {
		X(this.#b, e, !0);
	}
	#x = z(K([]));
	get toasts() {
		return J(this.#x);
	}
	set toasts(e) {
		X(this.#x, e, !0);
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
		return j(this.atlas, e, t, n);
	}
	get split() {
		return R(this.atlas, "split_inbox", !1) && this.view.name === "inbox";
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
			let n = e ? Math.max(En, this.rows.length) : En, r = await this.call("list", this.params({ limit: n }));
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
				limit: En,
				offset: this.rows.length
			}));
			if (e !== this.loadSeq) return;
			let n = new Set(this.rows.map((e) => e.thread)), r = t.rows.filter((e) => !n.has(e.thread));
			(t.rows.length < En || !r.length) && (this.ended = !0), r.length && (this.rows = [...this.rows, ...r], this.fillSnippets());
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
		this.cursor = c?.id ?? null, s && (c && R(this.atlas, "after_action", "next") === "next" ? this.read(c.id) : this.close());
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
		if (!t || await Z(this.atlas, `Delete ${e.length === 1 ? "this conversation" : `${e.length} conversations`} for good? This cannot be undone.`, {
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
		return this.snooze(D()[0].at);
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
}, On = c("<div class=\"grip v svelte-7si10b\" role=\"separator\" aria-orientation=\"vertical\" aria-label=\"Resize the folders\"></div>"), kn = c("<aside class=\"side svelte-7si10b\" aria-label=\"Folders\"><!> <!></aside>"), An = c("<button class=\"tool svelte-7si10b\" title=\"Folders\"><!></button>"), jn = c("<button class=\"tool svelte-7si10b\" aria-label=\"Clear the search\"><!></button>"), Mn = c("<span class=\"chip svelte-7si10b\"><b class=\"svelte-7si10b\"> </b> </span>"), Nn = c("<button class=\"link svelte-7si10b\">Search the servers too ↵</button>"), Pn = c("<div class=\"chips svelte-7si10b\"><!><!></div>"), Fn = c("<div class=\"selbar svelte-7si10b\" role=\"toolbar\" aria-label=\"Checked conversations\"><button class=\"tool svelte-7si10b\" title=\"Uncheck all (Esc)\"><!></button> <b> </b> <span class=\"grow svelte-7si10b\"></span> <button class=\"tool svelte-7si10b\" title=\"Archive (e)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Delete (#)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Mark read (⇧I)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Mark unread (⇧U)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Star (s)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Snooze (h)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Move (v)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Label (l)\"><!></button></div>"), In = c("<span class=\"n svelte-7si10b\"> </span>"), Ln = c("<button role=\"tab\"><!> <!></button>"), Rn = c("<div class=\"tabs svelte-7si10b\" role=\"tablist\"></div>"), zn = c("<div class=\"row2 svelte-7si10b\"><h1 class=\"svelte-7si10b\"> </h1> <span class=\"faint svelte-7si10b\"> </span> <span class=\"grow svelte-7si10b\"></span> <div class=\"seg svelte-7si10b\" role=\"group\" aria-label=\"Show only\"><button>Unread</button> <button>Starred</button> <button>Files</button> <button title=\"Mail where I am on To\">To me</button></div></div> <!>", 1), Bn = c("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), Vn = c("<p class=\"svelte-7si10b\">Nothing in the index matches.</p><button class=\"atlas-btn\">Search the servers too</button>", 1), Hn = c("<p class=\"svelte-7si10b\">No mail account yet.</p><button class=\"atlas-btn\">Add an account…</button>", 1), Un = c("<p class=\"zero svelte-7si10b\">Inbox zero.</p><p class=\"faint svelte-7si10b\">Nothing to answer. c writes a new message.</p>", 1), Wn = c("<p class=\"faint svelte-7si10b\"> </p>"), Gn = c("<div class=\"empty svelte-7si10b\"><!></div>"), Kn = c("<section class=\"listpane svelte-7si10b\"><header class=\"lhead svelte-7si10b\"><div class=\"row1 svelte-7si10b\"><!> <div class=\"search svelte-7si10b\"><!> <input placeholder=\"Search mail…\" aria-label=\"Search mail\" title=\"Words, or from: to: subject: has:attachment is:unread before: after:\" class=\"svelte-7si10b\"/> <!></div> <button class=\"tool svelte-7si10b\" title=\"Check for new mail (⇧G)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Layout and density\"><!></button> <button class=\"tool svelte-7si10b\" title=\"All commands (Ctrl+K)\"><!></button></div> <!> <!></header> <!></section>"), qn = c("<div role=\"separator\" aria-label=\"Resize the list\"></div>"), Jn = c("<div class=\"readerpane svelte-7si10b\"><!></div>"), Yn = c("<div><!> <!> <!></div>"), Xn = c("<div class=\"win svelte-7si10b\"><!></div>"), Zn = c("<div></div>"), Qn = c("<div class=\"pending svelte-7si10b\"> </div>"), $n = c("<div><!> <!> <!> <!> <!> <!></div>"), er = {
	hash: "svelte-7si10b",
	code: ".mail.svelte-7si10b {position:relative;height:100%;display:flex;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.side.svelte-7si10b {position:relative;flex:none;width:var(--side-w);border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.narrow.svelte-7si10b .side:where(.svelte-7si10b) {width:100%;}.work.svelte-7si10b {flex:1;min-width:0;display:flex;min-height:0;}.work.below.svelte-7si10b {flex-direction:column;}.listpane.svelte-7si10b {flex:none;width:var(--list-w);display:flex;flex-direction:column;min-height:0;min-width:0;border-right:1px solid var(--border);}.below.svelte-7si10b .listpane:where(.svelte-7si10b) {width:auto;height:var(--list-h);border-right:0;border-bottom:1px solid var(--border);}.full.svelte-7si10b .listpane:where(.svelte-7si10b) {flex:1;width:auto;border-right:0;}.readerpane.svelte-7si10b {flex:1;min-width:0;min-height:0;container-type:inline-size;}.grip.svelte-7si10b {flex:none;background:transparent;position:relative;z-index:3;}.grip.v.svelte-7si10b {width:5px;margin:0 -3px;cursor:col-resize;}.grip.h.svelte-7si10b {height:5px;margin:-3px 0;cursor:row-resize;}.side.svelte-7si10b .grip.v:where(.svelte-7si10b) {position:absolute;top:0;bottom:0;right:-3px;margin:0;}.grip.svelte-7si10b:hover {background:var(--accent-soft);}.lhead.svelte-7si10b {flex:none;padding:8px 10px 6px;display:grid;gap:6px;border-bottom:1px solid var(--border);}.row1.svelte-7si10b, .row2.svelte-7si10b, .selbar.svelte-7si10b, .chips.svelte-7si10b {display:flex;align-items:center;gap:6px;min-width:0;}.search.svelte-7si10b {flex:1;min-width:0;display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 6px 0 10px;color:var(--text-faint);}.search.svelte-7si10b:focus-within {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-7si10b input:where(.svelte-7si10b) {all:unset;flex:1;min-width:0;padding:7px 0;color:var(--text);}.search.svelte-7si10b input:where(.svelte-7si10b)::placeholder {color:var(--text-faint);}h1.svelte-7si10b {margin:0;font-size:1.05em;font-weight:650;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:4.5em;}.row2.svelte-7si10b {flex-wrap:wrap;row-gap:4px;}.faint.svelte-7si10b {color:var(--text-faint);font-size:0.86em;white-space:nowrap;}.grow.svelte-7si10b {flex:1;}.seg.svelte-7si10b {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-7si10b button:where(.svelte-7si10b) {all:unset;cursor:pointer;padding:3px 8px;font-size:0.82em;color:var(--text-muted);}.seg.svelte-7si10b button:where(.svelte-7si10b) + button:where(.svelte-7si10b) {border-left:1px solid var(--border);}.seg.svelte-7si10b button:where(.svelte-7si10b):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-7si10b button.on:where(.svelte-7si10b) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.seg.svelte-7si10b button:where(.svelte-7si10b):focus-visible, .tabs.svelte-7si10b button:where(.svelte-7si10b):focus-visible, .tool.svelte-7si10b:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.tabs.svelte-7si10b {display:flex;gap:2px;margin-bottom:-7px;}.tabs.svelte-7si10b button:where(.svelte-7si10b) {all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px 7px;color:var(--text-muted);border-bottom:2px solid transparent;font-size:0.92em;}.tabs.svelte-7si10b button:where(.svelte-7si10b):hover {color:var(--text);}.tabs.svelte-7si10b button.on:where(.svelte-7si10b) {color:var(--accent-strong);border-bottom-color:var(--accent);font-weight:600;}.n.svelte-7si10b {font-size:0.8em;padding:0 6px;border-radius:999px;background:var(--accent);color:var(--accent-fg);}.chips.svelte-7si10b {flex-wrap:wrap;}.chip.svelte-7si10b {font-size:0.82em;padding:1px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent-strong);}.chip.svelte-7si10b b:where(.svelte-7si10b) {font-weight:600;margin-right:2px;}.link.svelte-7si10b {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;}.selbar.svelte-7si10b {background:var(--accent-soft);border-radius:var(--radius-sm);padding:2px 4px;}.tool.svelte-7si10b {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-7si10b:hover {background:var(--bg-hover);color:var(--text);}.empty.svelte-7si10b {flex:1;display:grid;align-content:center;justify-items:center;gap:8px;padding:30px;text-align:center;color:var(--text-muted);}.empty.svelte-7si10b p:where(.svelte-7si10b) {margin:0;}.zero.svelte-7si10b {font-size:1.3em;font-weight:600;color:var(--heading);}.windows.svelte-7si10b {position:absolute;right:16px;bottom:0;z-index:40;display:flex;gap:12px;align-items:flex-end;max-width:calc(100% - 32px);}.win.svelte-7si10b {width:min(560px, calc(100vw - 32px));max-height:85%;overflow:auto;border-radius:var(--radius) var(--radius) 0 0;box-shadow:var(--shadow-md, 0 8px 30px rgba(0, 0, 0, 0.3));}.windows.big.svelte-7si10b {inset:12px;right:12px;bottom:12px;}.windows.big.svelte-7si10b .win:where(.svelte-7si10b) {width:100%;height:100%;max-height:none;border-radius:var(--radius);}.pending.svelte-7si10b {position:absolute;right:16px;top:12px;z-index:30;font:600 0.9em var(--font-mono);padding:4px 10px;border-radius:var(--radius-sm);background:var(--bg-elev);border:1px solid var(--border-strong);}\n  @container (max-width: 900px) {.seg.svelte-7si10b {display:none;} }"
};
function tr(o, c) {
	U(c, !0), p(o, er);
	let u = new Dn(c.atlas), f = (e, t) => {
		try {
			return localStorage.getItem(`atlas-email-${e}`) ?? t;
		} catch {
			return t;
		}
	}, m = (e, t) => {
		try {
			localStorage.setItem(`atlas-email-${e}`, t);
		} catch {}
	}, h = z(K(f("layout", String(c.atlas.plugin.settings.layout ?? "three")))), y = z(f("density", String(c.atlas.plugin.settings.density ?? "comfortable")) === "compact"), x = z(K(Number(f("side-w", "232")))), S = z(K(Number(f("list-w", "420")))), C = z(K(Number(f("list-h", "320")))), w = z(1200), O = z("list"), j = z(!1), N = z(document.documentElement.dataset.theme !== "light"), I = z(void 0), L = z(void 0), R = z(""), V = z(!1), H = k(() => J(w) < 700), W = k(() => !J(H) && J(w) < 1100), Y = k(() => J(w) - (J(W) ? 56 : J(x)) - J(S) >= 460), Z = k(() => J(H) || J(h) === "three" && !J(Y) ? "full" : J(h)), ne = k(() => J(Z) !== "full" || u.openId !== null || u.reading), re = k(() => u.composers.filter((e) => !e.inline));
	function ie() {
		if (J(j)) {
			X(j, !1);
			return;
		}
		if (u.checked.length) {
			u.checked = [];
			return;
		}
		if (u.openId !== null) {
			u.close(), X(O, "list");
			return;
		}
		if (u.query) {
			X(R, ""), u.search("");
			return;
		}
	}
	function oe(e) {
		if (e.draft && e.count === 1) {
			u.editDraft(e.id);
			return;
		}
		u.read(e.id), J(H) && X(O, "reader");
	}
	let le = () => u.targets()[0]?.account ?? u.view.account ?? u.accounts[0]?.name;
	function ue(e) {
		if (e === "snooze") c.atlas.pick({
			placeholder: "Snooze until… (tomorrow 9, mon 14:00, 3h, 2026-11-02 08:00)",
			tag: "Snooze",
			items: D().map((e) => ({
				value: String(e.at),
				title: e.label
			})),
			typed: (e) => {
				let t = q(e);
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
				let n = t ? q(e) : Number(e);
				n && u.snooze(n);
			}
		});
		else if (e === "move" || e === "go") {
			let t = e === "move" ? le() : null, n = u.folders.filter((e) => (!t || e.account === t) && e.role !== "other" && e.role !== "view" && e.role !== "all");
			c.atlas.pick({
				placeholder: e === "move" ? "Move to which folder?" : "Go to which folder?",
				tag: e === "move" ? "Move" : "Go to",
				items: n.map((e) => ({
					value: `${e.account}\u0000${e.path}`,
					title: e.label,
					detail: u.accounts.length > 1 ? e.account : e.role ?? void 0,
					section: u.accounts.length > 1 ? e.account : void 0
				})),
				typed: e === "move" ? (e) => `New folder “${e}”` : void 0,
				onpick: async (n, r) => {
					if (r && e === "move") {
						try {
							let e = await u.call("folder_create", {
								account: t,
								name: n
							});
							await u.loadFolders(), u.moveTo(e.path, n);
						} catch (e) {
							u.toast(`No folder made: ${e.message}`, "error");
						}
						return;
					}
					let [i, a] = n.split("\0"), o = u.folders.find((e) => e.account === i && e.path === a);
					e === "move" ? u.moveTo(a, o?.label ?? a) : u.go({
						name: "folder",
						account: i,
						folder: a,
						label: o?.label ?? a
					});
				}
			});
		} else if (e === "label") {
			let e = new Set(u.rows.flatMap((e) => e.labels)), t = new Set(u.targets().flatMap((e) => e.labels));
			c.atlas.pick({
				placeholder: "Label… (a label it has is taken off)",
				tag: "Label",
				items: [...e].sort().map((e) => ({
					value: e,
					title: e.replace(/^\$/, ""),
					detail: t.has(e) ? "on it — pick to take it off" : void 0
				})),
				typed: (e) => `New label “${e}”`,
				onpick: (e) => t.has(e) ? u.label([], [e]) : u.label([e], [])
			});
		} else c.atlas.pick({
			placeholder: "Write from a template… (notes in mail/templates/)",
			tag: "Template",
			items: async () => (await u.call("templates")).templates.map((e) => ({
				value: JSON.stringify(e),
				title: e.name,
				detail: e.subject
			})),
			onpick: (e) => {
				let t = JSON.parse(e);
				u.compose({
					subject: t.subject ?? "",
					to: t.to ?? "",
					cc: t.cc ?? "",
					body: t.body
				});
			}
		});
	}
	function de() {
		c.atlas.pick({
			placeholder: "Do what? (every command of the Email pane)",
			tag: "Email",
			items: mn.filter((e) => e.id !== "palette" && (!e.when || e.when(u))).map((e) => ({
				value: e.id,
				title: e.title,
				detail: vn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => mn.find((t) => t.id === e)?.run(u, pe)
		});
	}
	function fe() {
		c.atlas.pick({
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
					value: J(y) ? "comfortable" : "compact",
					title: J(y) ? "Comfortable rows" : "Compact rows",
					detail: J(y) ? "two lines with a preview" : "one line each, more on screen"
				}
			],
			onpick: (e) => {
				e === "compact" || e === "comfortable" ? (X(y, e === "compact"), m("density", e)) : (X(h, e, !0), m("layout", e));
			}
		});
	}
	let pe = {
		pick: ue,
		palette: de,
		back: ie,
		focusSearch: () => {
			J(I)?.focus(), J(I)?.select();
		},
		help: () => X(j, !J(j)),
		expandAll: (e) => J(L)?.expandAll(e),
		rules: () => typeof c.atlas.openDialog == "function" ? void c.atlas.openDialog(G, {
			title: "Rules",
			width: 860,
			height: 640
		}) : c.atlas.openView(G, {
			title: "Email rules",
			icon: "mail"
		}),
		layout: fe
	}, me = z(""), he;
	function ge(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog] input")) {
			e.key === "Escape" && t === J(I) && J(I)?.blur();
			return;
		}
		if (!J(Se)?.contains(t) && t !== document.body) return;
		let n = hn(e);
		if ([
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let r = J(me) ? `${J(me)} ${n}` : n;
		if (clearTimeout(he), !J(me) && _n.has(n)) {
			X(me, n, !0), he = setTimeout(() => X(me, ""), 1200), e.preventDefault();
			return;
		}
		X(me, "");
		let i = gn.get(r);
		!i || i.when && !i.when(u) || (e.preventDefault(), e.stopPropagation(), i.run(u, pe));
	}
	let _e;
	function ve() {
		clearTimeout(_e), _e = setTimeout(() => u.search(J(R)), 140);
	}
	async function ye() {
		if (u.search(J(R)), J(R).trim()) try {
			let e = await u.call("search_server", { query: J(R) }, 300);
			e.added && (u.toast(`${e.added} more from the server`), u.load());
		} catch (e) {
			u.toast(`The server search failed: ${e.message}`, "error");
		}
	}
	function be(e) {
		u.quick = u.quick === e ? "" : e, u.load();
	}
	function xe(e) {
		u.kind = e, u.load();
	}
	function $(e, t) {
		e.preventDefault();
		let n = e.clientX, r = e.clientY, i = J(x), a = J(S), o = J(C), s = (e) => {
			t === "side" ? X(x, Math.max(170, Math.min(420, i + e.clientX - n)), !0) : t === "list" ? X(S, Math.max(300, Math.min(900, a + e.clientX - n)), !0) : X(C, Math.max(160, Math.min(900, o + e.clientY - r)), !0);
		}, c = () => {
			window.removeEventListener("pointermove", s), window.removeEventListener("pointerup", c), m("side-w", String(J(x))), m("list-w", String(J(S))), m("list-h", String(J(C))), document.body.style.userSelect = "";
		};
		document.body.style.userSelect = "none", window.addEventListener("pointermove", s), window.addEventListener("pointerup", c);
	}
	let Se = z(void 0);
	ce(() => {
		u.start();
		let e = [
			c.atlas.helper.on("changed", () => u.later()),
			c.atlas.helper.on("bodies", () => u.later("list")),
			c.atlas.helper.on("status", (e) => {
				let t = e, n = u.accounts.find((e) => e.name === t.account);
				n && (n.status = t, n.syncing = t.state === "syncing");
			}),
			c.atlas.helper.on("woke", () => {
				u.toast("Snoozed mail is back in the inbox"), u.later();
			}),
			c.atlas.helper.on("rule", (e) => {
				let t = e;
				u.toast(`Rule “${t.rule}”: ${t.count} message${t.count === 1 ? "" : "s"}`);
			})
		], t = new MutationObserver(() => X(N, document.documentElement.dataset.theme !== "light"));
		t.observe(document.documentElement, {
			attributes: !0,
			attributeFilter: ["data-theme"]
		});
		let n = async (e) => {
			let t = e.detail, n = await ee(u.atlas, `A new folder in ${t}:`);
			if (n) try {
				await u.call("folder_create", {
					account: t,
					name: n
				}), await u.loadFolders(), u.toast(`Folder “${n}” made`, "success");
			} catch (e) {
				u.toast(`No folder made: ${e.message}`, "error");
			}
		}, r = () => {
			u.loadAccounts(), u.later();
		};
		window.addEventListener("atlas-email:new-folder", n), window.addEventListener("atlas-email:signed-in", r);
		let i = (e) => {
			let t = e.detail ?? {};
			(t.account || t.view === "inbox") && u.go({
				name: "inbox",
				account: t.account ?? null,
				folder: null,
				label: "Inbox"
			}), t.kind && (u.split ? (u.kind = t.kind, u.load()) : u.search(`in:inbox is:${t.kind}`)), t.search && (X(R, t.search, !0), u.search(t.search)), t.id && (u.read(t.id), J(H) && X(O, "reader")), t.compose && u.compose(t.compose), t.reply && u.reply(t.reply.mode, t.reply.id, !1);
		};
		window.addEventListener("atlas-email:open", i);
		let a = window.__atlasEmailOpen;
		return a && (i(new CustomEvent("x", { detail: a })), window.__atlasEmailOpen = void 0), () => {
			e.forEach((e) => e()), t.disconnect(), window.removeEventListener("atlas-email:new-folder", n), window.removeEventListener("atlas-email:signed-in", r), window.removeEventListener("atlas-email:open", i);
		};
	});
	let Ce = k(() => u.query ? "Search" : u.view.label), we = [
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
	var Te = $n();
	d("keydown", E, ge);
	let Ee, De;
	var Oe = _(Te), ke = (e) => {
		var t = kn(), r = _(t);
		Ae(r, {
			get mail() {
				return u;
			},
			get rail() {
				return J(W);
			},
			onpicked: () => {
				J(H) && X(O, "list");
			}
		});
		var i = Q(r, 2), a = (e) => {
			var t = On();
			s("pointerdown", t, (e) => $(e, "side")), n(e, t);
		};
		l(i, (e) => {
			!J(W) && !J(H) && e(a);
		}), P(t), n(e, t);
	};
	l(Oe, (e) => {
		(!J(H) || J(O) === "side") && e(ke);
	});
	var je = Q(Oe, 2), Me = (t) => {
		var o = Yn();
		let d;
		var f = _(o), p = (t) => {
			var o = Kn(), d = _(o), f = _(d), p = _(f), m = (e) => {
				var t = An(), r = _(t);
				A(r, { name: "menu" }), P(t), s("click", t, () => X(O, "side")), n(e, t);
			};
			l(p, (e) => {
				J(H) && e(m);
			});
			var h = Q(p, 2), x = _(h);
			A(x, {
				name: "search",
				size: 15
			});
			var S = Q(x, 2);
			a(S), r(S, (e) => X(I, e), () => J(I));
			var C = Q(S, 2), w = (e) => {
				var t = jn(), r = _(t);
				A(r, {
					name: "x",
					size: 14
				}), P(t), s("click", t, () => {
					X(R, ""), u.search("");
				}), n(e, t);
			};
			l(C, (e) => {
				J(R) && e(w);
			}), P(h);
			var E = Q(h, 2), D = _(E);
			A(D, { name: "refresh" }), P(E);
			var j = Q(E, 2), M = _(j);
			A(M, { name: "layout" }), P(j);
			var N = Q(j, 2), L = _(N);
			A(L, { name: "keyboard" }), P(N), P(f);
			var z = Q(f, 2), V = (e) => {
				var t = Pn(), r = _(t);
				g(r, 17, () => u.chips, ([e, t]) => e + t, (e, t) => {
					var r = k(() => te(J(t), 2));
					let i = () => J(r)[0], a = () => J(r)[1];
					var o = Mn(), s = _(o), c = F(s), l = Q(s, 1, !0);
					P(o), T(() => {
						v(c, `${i() ?? ""}:`), v(l, a());
					}), n(e, o);
				});
				var i = Q(r), a = (e) => {
					var t = Nn();
					s("click", t, ye), n(e, t);
				};
				l(i, (e) => {
					u.query && e(a);
				}), P(t), n(e, t);
			};
			l(z, (e) => {
				u.chips.length && e(V);
			});
			var U = Q(z, 2), W = (e) => {
				var t = Fn(), r = _(t), i = _(r);
				A(i, { name: "x" }), P(r);
				var a = Q(r, 2), o = F(a), c = Q(a, 4), l = _(c);
				A(l, { name: "archive" }), P(c);
				var d = Q(c, 2), f = _(d);
				A(f, { name: "trash" }), P(d);
				var p = Q(d, 2), m = _(p);
				A(m, { name: "read" }), P(p);
				var h = Q(p, 2), g = _(h);
				A(g, { name: "unread" }), P(h);
				var y = Q(h, 2), b = _(y);
				A(b, { name: "star" }), P(y);
				var x = Q(y, 2), S = _(x);
				A(S, { name: "clock" }), P(x);
				var C = Q(x, 2), w = _(C);
				A(w, { name: "folder" }), P(C);
				var E = Q(C, 2), D = _(E);
				A(D, { name: "label" }), P(E), P(t), T(() => v(o, `${u.checked.length ?? ""} checked`)), s("click", r, () => u.selectWhere("none")), s("click", c, () => u.archive()), s("click", d, () => u.trash()), s("click", p, () => u.mark("read", !0)), s("click", h, () => u.mark("read", !1)), s("click", y, () => u.toggleStar()), s("click", x, () => ue("snooze")), s("click", C, () => ue("move")), s("click", E, () => ue("label")), n(e, t);
			}, G = (t) => {
				var r = zn(), a = e(r), o = _(a), c = F(o, !0), d = Q(o, 2), f = F(d), p = Q(d, 4), m = _(p);
				let h;
				var y = Q(m, 2);
				let b;
				var x = Q(y, 2);
				let S;
				var C = Q(x, 2);
				let w;
				P(p), P(a);
				var E = Q(a, 2), D = (e) => {
					var t = Rn();
					g(t, 21, () => we, ([e, t, n]) => e, (e, t) => {
						var r = k(() => te(J(t), 3));
						let a = () => J(r)[0], o = () => J(r)[1], c = () => J(r)[2], d = k(() => u.counts[a()]);
						var f = Ln();
						let p;
						var m = _(f);
						A(m, {
							get name() {
								return c();
							},
							size: 14
						});
						var h = Q(m, 1, !0), g = Q(h), y = (e) => {
							var t = In(), r = F(t, !0);
							T(() => v(r, J(d).unread)), n(e, t);
						};
						l(g, (e) => {
							J(d)?.unread && e(y);
						}), P(f), T(() => {
							i(f, "aria-selected", (u.kind || "person") === a()), p = B(f, 1, "svelte-7si10b", null, p, { on: (u.kind || "person") === a() }), v(h, o());
						}), s("click", f, () => xe(a())), n(e, f);
					}), P(t), n(e, t);
				};
				l(E, (e) => {
					u.split && !u.query && e(D);
				}), T(() => {
					v(c, J(Ce)), v(f, `${u.total ? `${u.total} conversation${u.total === 1 ? "" : "s"}` : ""}${u.unread ? ` · ${u.unread} unread` : ""}`), h = B(m, 1, "svelte-7si10b", null, h, { on: u.quick === "unread" }), b = B(y, 1, "svelte-7si10b", null, b, { on: u.quick === "starred" }), S = B(x, 1, "svelte-7si10b", null, S, { on: u.quick === "attachments" }), w = B(C, 1, "svelte-7si10b", null, w, { on: u.quick === "mentions" });
				}), s("click", m, () => be("unread")), s("click", y, () => be("starred")), s("click", x, () => be("attachments")), s("click", C, () => be("mentions")), n(t, r);
			};
			l(U, (e) => {
				u.checked.length ? e(W) : e(G, -1);
			}), P(d);
			var K = Q(d, 2), ee = (e) => {
				var t = Bn(), r = _(t, !0), i = Q(r), a = _(i), o = Q(a);
				P(i), P(t), T(() => v(r, u.error)), s("click", a, () => u.load()), s("click", o, () => c.atlas.plugin.openSettings()), n(e, t);
			}, q = (t) => {
				var r = Gn(), i = _(r), a = (t) => {
					var r = Vn(), i = Q(e(r));
					s("click", i, ye), n(t, r);
				}, o = (t) => {
					var r = Hn(), i = Q(e(r));
					s("click", i, () => c.atlas.plugin.openSettings()), n(t, r);
				}, d = (e) => {
					var t = Un();
					ae(), n(e, t);
				}, f = (e) => {
					var t = Wn(), r = F(t);
					T(() => v(r, `Nothing here${u.quick ? " with that filter" : ""}.`)), n(e, t);
				};
				l(i, (e) => {
					u.query ? e(a) : u.accounts.length ? u.view.name === "inbox" && !u.quick ? e(d, 2) : e(f, -1) : e(o, 1);
				}), P(r), n(t, r);
			}, Y = (e) => {
				qe(e, {
					get mail() {
						return u;
					},
					get compact() {
						return J(y);
					},
					onopen: oe
				});
			};
			l(K, (e) => {
				u.error ? e(ee) : !u.loading && !u.rows.length ? e(q, 1) : e(Y, -1);
			}), P(o), T(() => i(o, "aria-label", J(Ce))), s("input", S, ve), s("keydown", S, (e) => {
				e.key === "Enter" ? (e.preventDefault(), ye()) : e.key === "Escape" ? (X(R, ""), u.search(""), J(I)?.blur()) : e.key === "ArrowDown" && J(I)?.blur();
			}), b(S, () => J(R), (e) => X(R, e)), s("click", E, () => mn.find((e) => e.id === "refresh")?.run(u, pe)), s("click", j, fe), s("click", N, de), n(t, o);
		};
		l(f, (e) => {
			(J(Z) !== "full" || !J(ne) || J(H) && J(O) !== "reader") && e(p);
		});
		var m = Q(f, 2), h = (e) => {
			var t = qn();
			let r;
			T(() => r = B(t, 1, "grip svelte-7si10b", null, r, {
				h: J(Z) === "below",
				v: J(Z) === "three"
			})), s("pointerdown", t, (e) => $(e, J(Z) === "below" ? "listH" : "list")), n(e, t);
		};
		l(m, (e) => {
			J(Z) !== "full" && e(h);
		});
		var x = Q(m, 2), S = (e) => {
			var t = Jn(), i = _(t);
			{
				let e = k(() => J(Z) === "full");
				r(on(i, {
					get mail() {
						return u;
					},
					get dark() {
						return J(N);
					},
					get narrow() {
						return J(e);
					},
					onback: () => {
						u.close(), X(O, "list");
					},
					onpick: ue
				}), (e) => X(L, e, !0), () => J(L));
			}
			P(t), n(e, t);
		};
		l(x, (e) => {
			J(ne) && (!J(H) || J(O) === "reader") && e(S);
		}), P(o), T(() => d = B(o, 1, "work svelte-7si10b", null, d, {
			below: J(Z) === "below",
			full: J(Z) === "full"
		})), n(t, o);
	};
	l(je, (e) => {
		(!J(H) || J(O) !== "side") && e(Me);
	});
	var Ne = Q(je, 2), Pe = (e) => {
		var t = Zn();
		let r;
		g(t, 21, () => J(re), (e) => e.key, (e, t) => {
			var r = Xn();
			jt(_(r), {
				get mail() {
					return u;
				},
				get c() {
					return J(t);
				},
				get big() {
					return J(V);
				},
				set big(e) {
					X(V, e, !0);
				}
			}), P(r), n(e, r);
		}), P(t), T(() => r = B(t, 1, "windows svelte-7si10b", null, r, { big: J(V) || J(H) })), n(e, t);
	};
	l(Ne, (e) => {
		J(re).length && e(Pe);
	});
	var Fe = Q(Ne, 2), Ie = (e) => {
		Tn(e, { onclose: () => X(j, !1) });
	};
	l(Fe, (e) => {
		J(j) && e(Ie);
	});
	var Le = Q(Fe, 2);
	fn(Le, { get mail() {
		return u;
	} });
	var Re = Q(Le, 2), ze = (e) => {
		var t = Qn(), r = F(t);
		T(() => v(r, `${J(me) ?? ""} …`)), n(e, t);
	};
	l(Re, (e) => {
		J(me) && e(ze);
	}), P(Te), r(Te, (e) => X(Se, e), () => J(Se)), T(() => {
		Ee = B(Te, 1, "mail svelte-7si10b", null, Ee, {
			narrow: J(H),
			dark: J(N)
		}), De = t(Te, "", De, {
			"--side-w": `${(J(W) ? 56 : J(x)) ?? ""}px`,
			"--list-w": `${J(S) ?? ""}px`,
			"--list-h": `${J(C) ?? ""}px`
		});
	}), se(Te, "clientWidth", (e) => X(w, e)), n(o, Te), M();
}
C([
	"pointerdown",
	"click",
	"input",
	"keydown"
]);
//#endregion
//#region plugins/stable/email/ui/src/view.ts
function nr(e, t) {
	if (t.arg === G) {
		let n = f(re, {
			target: e,
			props: {
				frame: "dialog",
				mail: Y(t),
				onclose: () => t.pane?.close?.()
			}
		});
		return () => ue(n);
	}
	e.style.height = "100%";
	let n = f(tr, {
		target: e,
		props: { atlas: t }
	});
	return () => ue(n);
}
//#endregion
export { nr as default };
