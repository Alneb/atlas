import { $ as e, A as t, B as n, C as r, D as i, E as a, F as o, G as s, H as c, I as l, J as u, K as d, L as f, M as p, N as m, O as h, P as g, Q as _, R as v, S as y, T as b, U as x, V as S, W as C, X as w, Y as T, Z as E, _ as D, a as O, at as k, b as A, c as ee, ct as j, d as M, et as N, f as P, g as F, h as I, i as L, it as R, j as z, k as B, l as te, m as V, n as H, nt as U, o as W, ot as G, p as K, q, r as J, rt as Y, s as ne, t as re, u as X, v as ie, w as ae, x as oe, y as se, z as Z } from "./ui-lib/Rules.js";
//#region plugins/stable/email/ui/src/Sidebar.svelte
var ce = f("<span>New message</span>"), le = f("<span class=\"name svelte-t2e5ba\"> </span>"), ue = f("<span> </span>"), de = f("<button><!> <!> <!></button>"), fe = f("<span></span>"), pe = f("<span class=\"spin svelte-t2e5ba\" title=\"Checking for mail…\"></span>"), me = f("<span class=\"faint svelte-t2e5ba\">offline</span>"), Q = f("<!> <span class=\"acct svelte-t2e5ba\"> </span> <!> <!>", 1), he = f("<button class=\"link svelte-t2e5ba\">Sign in…</button>"), ge = f("<div class=\"err svelte-t2e5ba\" role=\"alert\"><span class=\"svelte-t2e5ba\"> </span> <!> <button class=\"link svelte-t2e5ba\">Settings…</button></div>"), _e = f("<button class=\"twist svelte-t2e5ba\"><!></button>"), ve = f("<div class=\"frow svelte-t2e5ba\"><button><!> <!> <!></button> <!></div>"), ye = f("<button><!><span class=\"name svelte-t2e5ba\"> </span></button>"), $ = f("<button class=\"row faint svelte-t2e5ba\"><!><span class=\"name svelte-t2e5ba\"> </span></button> <!>", 1), be = f("<button class=\"row faint add svelte-t2e5ba\"><!><span class=\"name svelte-t2e5ba\">New folder…</span></button>"), xe = f("<!> <!> <!>", 1), Se = f("<div class=\"group svelte-t2e5ba\"><button class=\"head svelte-t2e5ba\"><!></button> <!> <!></div>"), Ce = f("<div class=\"empty svelte-t2e5ba\"><p class=\"svelte-t2e5ba\">No mail account yet.</p> <button class=\"atlas-btn\">Add an account…</button></div>"), we = f("<nav aria-label=\"Mail folders\"><button class=\"compose svelte-t2e5ba\" title=\"New message (c)\"><!><!></button> <div class=\"group svelte-t2e5ba\"></div> <!></nav>"), Te = {
	hash: "svelte-t2e5ba",
	code: ".side.svelte-t2e5ba {display:flex;flex-direction:column;gap:10px;padding:10px 8px 16px;overflow-y:auto;height:100%;box-sizing:border-box;font-size:0.95em;}.compose.svelte-t2e5ba {all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 14px;border-radius:var(--radius);background:var(--accent);color:var(--accent-fg);font-weight:600;box-shadow:var(--shadow-sm);}.compose.svelte-t2e5ba:hover {filter:brightness(1.06);}.compose.svelte-t2e5ba:focus-visible {outline:2px solid var(--accent-strong);outline-offset:2px;}.rail.svelte-t2e5ba .compose:where(.svelte-t2e5ba) {justify-content:center;padding:9px;}.group.svelte-t2e5ba {display:flex;flex-direction:column;gap:1px;}.row.svelte-t2e5ba {all:unset;box-sizing:border-box;display:flex;align-items:center;gap:9px;cursor:pointer;padding:5px 8px 5px calc(8px + var(--depth, 0) * 14px);border-radius:var(--radius-sm);color:var(--text-muted);min-height:28px;flex:1;min-width:0;}.row.svelte-t2e5ba:hover {background:var(--bg-hover);color:var(--text);}.row.on.svelte-t2e5ba {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.row.over.svelte-t2e5ba {outline:2px dashed var(--accent);background:var(--accent-soft);}.row.svelte-t2e5ba:focus-visible, .head.svelte-t2e5ba:focus-visible, .twist.svelte-t2e5ba:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.rail.svelte-t2e5ba .row:where(.svelte-t2e5ba) {justify-content:center;padding:6px;}.frow.svelte-t2e5ba {display:flex;align-items:center;}.twist.svelte-t2e5ba {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-faint);}.twist.svelte-t2e5ba:hover {background:var(--bg-hover);color:var(--text);}.name.svelte-t2e5ba {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.n.svelte-t2e5ba {font-size:0.85em;color:var(--text-faint);font-variant-numeric:tabular-nums;}.n.strong.svelte-t2e5ba {color:var(--text);font-weight:600;}.rail.svelte-t2e5ba .n:where(.svelte-t2e5ba) {display:none;}.head.svelte-t2e5ba {all:unset;display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 8px 4px;color:var(--text-faint);font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;min-width:0;}.head.svelte-t2e5ba:hover {color:var(--text-muted);}.rail.svelte-t2e5ba .head:where(.svelte-t2e5ba) {justify-content:center;padding:8px 0 4px;}.acct.svelte-t2e5ba {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:none;letter-spacing:0;font-size:1.15em;}.faint.svelte-t2e5ba {color:var(--text-faint);font-weight:400;}.add.svelte-t2e5ba {font-size:0.9em;}.dot.svelte-t2e5ba {width:8px;height:8px;border-radius:50%;background:var(--text-faint);}.dot.busy.svelte-t2e5ba {background:var(--accent);}.dot.bad.svelte-t2e5ba {background:var(--red);}.spin.svelte-t2e5ba {width:9px;height:9px;border-radius:50%;border:2px solid var(--accent);border-right-color:transparent; animation: svelte-t2e5ba-spin 0.8s linear infinite;}\n  @keyframes svelte-t2e5ba-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-t2e5ba { animation: none;} }.err.svelte-t2e5ba {margin:2px 6px 6px;padding:8px 10px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--red) 12%, transparent);color:var(--text);font-size:0.88em;display:flex;flex-wrap:wrap;gap:6px 10px;}.err.svelte-t2e5ba span:where(.svelte-t2e5ba) {flex-basis:100%;overflow-wrap:anywhere;}.link.svelte-t2e5ba {all:unset;cursor:pointer;color:var(--accent);}.empty.svelte-t2e5ba {padding:14px 8px;color:var(--text-muted);display:grid;gap:8px;justify-items:start;}.empty.svelte-t2e5ba p:where(.svelte-t2e5ba) {margin:0;}"
};
function Ee(t, r) {
	R(r, !0), i(t, Te);
	let s = D(r, "rail", 3, !1), d = [
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
	], f = {
		inbox: "inbox",
		sent: "send",
		drafts: "draft",
		archive: "archive",
		junk: "spam",
		trash: "trash",
		snoozed: "clock",
		unimportant: "down",
		all: "all"
	}, p = {
		inbox: 0,
		unimportant: 1,
		snoozed: 2,
		drafts: 3,
		sent: 4,
		archive: 5,
		junk: 6,
		trash: 7,
		all: 8
	}, h = N(() => r.mail.accounts.filter((e) => !e.error).length > 1), g = e(E(x())), v = e(null);
	function x() {
		try {
			return JSON.parse(localStorage.getItem("atlas-email-folded") ?? "{}");
		} catch {
			return {};
		}
	}
	function O(e) {
		_(g, {
			...c(g),
			[e]: !c(g)[e]
		}, !0);
		try {
			localStorage.setItem("atlas-email-folded", JSON.stringify(c(g)));
		} catch {}
	}
	function A(e) {
		let t = r.mail.folders.filter((t) => t.account === e), n = t.filter((e) => e.role === "other" || e.role === "view"), i = t.filter((e) => e.role !== "other" && e.role !== "view"), a = i.filter((e) => e.role && p[e.role] !== void 0).sort((e, t) => p[e.role] - p[t.role]), o = i.filter((e) => !a.includes(e)).sort((e, t) => e.label.localeCompare(t.label)), s = a.map((e) => ({
			f: e,
			depth: 0,
			children: 0
		})), l = (e) => e.label.split(e.delimiter ?? "/");
		for (let t of o) {
			let n = l(t).length - 1, r = o.filter((e) => e !== t && e.label.startsWith(t.label + (t.delimiter ?? "/"))).length;
			o.some((n) => n !== t && t.label.startsWith(n.label + (n.delimiter ?? "/")) && c(g)[`${e}:${n.path}`]) || s.push({
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
	let ee = (e) => e.label.split(e.delimiter ?? "/").at(-1) ?? e.label;
	function M(e) {
		r.mail.go(e), r.onpicked?.();
	}
	let P = (e, t = null) => r.mail.view.name === e && r.mail.view.account === t, F = (e) => r.mail.view.name === "folder" && r.mail.view.account === e.account && r.mail.view.folder === e.path, L = (e) => [
		"inbox",
		"snoozed",
		"drafts",
		"scheduled",
		"unimportant"
	].includes(e) ? r.mail.counts[e] : void 0;
	function te(e, t) {
		e.preventDefault(), _(v, null);
		let n = JSON.parse(e.dataTransfer?.getData("application/x-atlas-mail") || "[]"), i = r.mail.rows.filter((e) => n.includes(e.id) && e.account === t.account);
		i.length ? r.mail.moveTo(t.path, t.label, i) : n.length && r.mail.toast("Mail moves within its own account", "error");
	}
	var V = we();
	let H;
	var U = q(V), W = q(U);
	I(W, {
		name: "pen",
		size: 17
	});
	var K = w(W), J = (e) => {
		var t = ce();
		o(e, t);
	};
	z(K, (e) => {
		s() || e(J);
	}), G(U);
	var ne = w(U, 2);
	B(ne, 21, () => d, ([e, t, n]) => e, (e, t) => {
		var r = N(() => j(c(t), 3));
		let i = () => c(r)[0], d = () => c(r)[1], f = () => c(r)[2], p = N(() => L(i()));
		var g = l(), _ = u(g), v = (e) => {
			var t = de();
			let r;
			var l = q(t);
			I(l, { get name() {
				return f();
			} });
			var u = w(l, 2), g = (e) => {
				var t = le(), n = T(t, !0);
				C(() => m(n, c(h) && i() === "inbox" ? "All inboxes" : d())), o(e, t);
			};
			z(u, (e) => {
				s() || e(g);
			});
			var _ = w(u, 2), v = (e) => {
				var t = ue();
				let n;
				var r = T(t, !0);
				C(() => {
					n = a(t, 1, "n svelte-t2e5ba", null, n, { strong: i() === "inbox" }), m(r, i() === "inbox" ? c(p).unread : c(p).total);
				}), o(e, t);
			};
			z(_, (e) => {
				c(p) && (i() === "inbox" ? c(p).unread : c(p).total) && e(v);
			}), G(t), C((e) => {
				r = a(t, 1, "row svelte-t2e5ba", null, r, { on: e }), y(t, "title", d());
			}, [() => P(i())]), n("click", t, () => M({
				name: i(),
				account: null,
				folder: null,
				label: c(h) && i() === "inbox" ? "All inboxes" : d()
			})), o(e, t);
		};
		z(_, (e) => {
			(i() !== "scheduled" && i() !== "unimportant" || (c(p)?.total ?? 0) > 0) && e(v);
		}), o(e, g);
	}), G(ne);
	var re = w(ne, 2);
	B(re, 17, () => r.mail.accounts, (e) => e.name, (e, t) => {
		let i = N(() => `acct:${c(t).name}`), d = N(() => A(c(t).name));
		var p = Se(), h = q(p), x = q(h), E = (e) => {
			var n = fe();
			let r;
			C(() => r = a(n, 1, "dot svelte-t2e5ba", null, r, {
				busy: c(t).syncing,
				bad: c(t).error || c(t).status?.state === "error"
			})), o(e, n);
		}, D = (e) => {
			var n = Q(), r = u(n);
			{
				let e = N(() => c(g)[c(i)] ? "right" : "down");
				I(r, {
					get name() {
						return c(e);
					},
					size: 12
				});
			}
			var a = w(r, 2), s = T(a, !0), l = w(a, 2), d = (e) => {
				var t = pe();
				o(e, t);
			};
			z(l, (e) => {
				(c(t).syncing || c(t).status?.state === "syncing") && e(d);
			});
			var f = w(l, 2), p = (e) => {
				var n = me();
				C(() => y(n, "title", c(t).status.error)), o(e, n);
			};
			z(f, (e) => {
				c(t).status?.state === "offline" && e(p);
			}), C(() => m(s, c(t).name)), o(e, n);
		};
		z(x, (e) => {
			s() ? e(E) : e(D, -1);
		}), G(h);
		var j = w(h, 2), P = (e) => {
			var i = ge(), a = q(i), s = T(a, !0), l = w(a, 2), u = (e) => {
				var r = he();
				n("click", r, () => window.dispatchEvent(new CustomEvent("atlas-email:signin", { detail: c(t).name }))), o(e, r);
			};
			z(l, (e) => {
				c(t).outlook && e(u);
			});
			var d = w(l, 2);
			G(i), C(() => m(s, c(t).error ?? c(t).status?.error)), n("click", d, () => r.mail.atlas.plugin.openSettings()), o(e, i);
		};
		z(j, (e) => {
			(c(t).error || c(t).status?.state === "error") && e(P);
		});
		var L = w(j, 2), R = (e) => {
			var r = xe(), p = u(r);
			B(p, 17, () => c(d).main, ({ f: e, depth: t, children: n }) => e.path, (e, r) => {
				let i = () => c(r).f, l = () => c(r).depth, u = () => c(r).children;
				var d = ve();
				let p;
				var h = q(d);
				let x;
				var E = q(h);
				{
					let e = N(() => f[i().role ?? ""] ?? "folder");
					I(E, { get name() {
						return c(e);
					} });
				}
				var D = w(E, 2), k = (e) => {
					var t = le(), n = T(t, !0);
					C((e) => m(n, e), [() => ee(i())]), o(e, t);
				};
				z(D, (e) => {
					s() || e(k);
				});
				var A = w(D, 2), j = (e) => {
					var t = ue();
					let n;
					var r = T(t, !0);
					C(() => {
						n = a(t, 1, "n svelte-t2e5ba", null, n, { strong: i().role === "inbox" }), m(r, i().unread);
					}), o(e, t);
				};
				z(A, (e) => {
					i().unread && i().role !== "sent" && i().role !== "trash" && i().role !== "junk" && i().role !== "drafts" && e(j);
				}), G(h);
				var P = w(h, 2), L = (e) => {
					var r = _e(), a = q(r);
					{
						let e = N(() => c(g)[`${c(t).name}:${i().path}`] ? "right" : "down");
						I(a, {
							get name() {
								return c(e);
							},
							size: 12
						});
					}
					G(r), C(() => y(r, "aria-label", c(g)[`${c(t).name}:${i().path}`] ? "Show the folders in it" : "Hide the folders in it")), n("click", r, () => O(`${c(t).name}:${i().path}`)), o(e, r);
				};
				z(P, (e) => {
					u() && !s() && e(L);
				}), G(d), C((e) => {
					p = b(d, "", p, { "--depth": s() ? 0 : l() }), x = a(h, 1, "row svelte-t2e5ba", null, x, {
						on: e,
						over: c(v) === `${c(t).name}:${i().path}`
					}), y(h, "title", i().label);
				}, [() => F(i())]), n("click", h, () => M({
					name: "folder",
					account: c(t).name,
					folder: i().path,
					label: i().label
				})), S("dragover", h, (e) => {
					e.preventDefault(), _(v, `${c(t).name}:${i().path}`);
				}), S("dragleave", h, () => _(v, null)), S("drop", h, (e) => te(e, i())), o(e, d);
			});
			var h = w(p, 2), x = (e) => {
				var r = $(), s = u(r), f = q(s);
				{
					let e = N(() => c(g)[`${c(i)}:other`] ? "down" : "right");
					I(f, {
						get name() {
							return c(e);
						},
						size: 12
					});
				}
				var p = w(f), h = T(p);
				G(s);
				var _ = w(s, 2), v = (e) => {
					var r = l(), i = u(r);
					B(i, 17, () => c(d).other, (e) => e.path, (e, r) => {
						var i = ye();
						let s;
						b(i, "", {}, { "--depth": 1 });
						var l = q(i);
						I(l, { name: "folder" });
						var u = w(l), d = T(u, !0);
						G(i), C((e) => {
							s = a(i, 1, "row svelte-t2e5ba", null, s, { on: e }), m(d, c(r).label);
						}, [() => F(c(r))]), n("click", i, () => M({
							name: "folder",
							account: c(t).name,
							folder: c(r).path,
							label: c(r).label
						})), o(e, i);
					}), o(e, r);
				};
				z(_, (e) => {
					c(g)[`${c(i)}:other`] && e(v);
				}), C(() => m(h, `More (${c(d).other.length ?? ""})`)), n("click", s, () => O(`${c(i)}:other`)), o(e, r);
			};
			z(h, (e) => {
				c(d).other.length && !s() && e(x);
			});
			var E = w(h, 2), D = (e) => {
				var r = be(), i = q(r);
				I(i, {
					name: "plus",
					size: 14
				}), k(), G(r), n("click", r, () => window.dispatchEvent(new CustomEvent("atlas-email:new-folder", { detail: c(t).name }))), o(e, r);
			};
			z(E, (e) => {
				s() || e(D);
			}), o(e, r);
		};
		z(L, (e) => {
			!c(g)[c(i)] && !c(t).error && e(R);
		}), G(p), C(() => {
			y(h, "aria-expanded", !c(g)[c(i)]), y(h, "title", c(t).user ?? c(t).name);
		}), n("click", h, () => O(c(i))), o(e, p);
	}, (e) => {
		var t = l(), i = u(t), a = (e) => {
			var t = Ce(), i = w(q(t), 2);
			G(t), n("click", i, () => r.mail.atlas.plugin.openSettings()), o(e, t);
		};
		z(i, (e) => {
			s() || e(a);
		}), o(e, t);
	}), G(V), C(() => H = a(V, 1, "side svelte-t2e5ba", null, H, { rail: s() })), n("click", U, () => r.mail.compose()), o(t, V), Y();
}
Z(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/MessageList.svelte
var De = f("<div class=\"sect svelte-g4my5v\">Everything else</div>"), Oe = f("<div class=\"sect svelte-g4my5v\"><!> Important<span class=\"faint svelte-g4my5v\"> </span></div> <!>", 1), ke = f("<div> </div>"), Ae = f("<span></span>"), je = f("<span class=\"udot svelte-g4my5v\" aria-label=\"unread\"></span>"), Me = f("<span class=\"count svelte-g4my5v\"> </span>"), Ne = f("<span class=\"draftmark svelte-g4my5v\">· Draft</span>"), Pe = f("<span class=\"subject svelte-g4my5v\"> <span class=\"snip svelte-g4my5v\"> </span></span>"), Fe = f("<span class=\"star svelte-g4my5v\"><!></span>"), Ie = f("<span class=\"chip acct svelte-g4my5v\"> </span>"), Le = f("<span class=\"chip svelte-g4my5v\"> </span>"), Re = f("<div class=\"line2 svelte-g4my5v\"><span class=\"subject svelte-g4my5v\"> </span></div> <div class=\"line3 svelte-g4my5v\"><!> <!> <span class=\"snip svelte-g4my5v\"> </span></div>", 1), ze = f("<div role=\"option\" tabindex=\"-1\" draggable=\"true\"><!> <button class=\"avatar svelte-g4my5v\"><!></button> <div class=\"main svelte-g4my5v\"><div class=\"line1 svelte-g4my5v\"><!> <span class=\"who svelte-g4my5v\"> <!><!></span> <!> <span class=\"marks svelte-g4my5v\"><!> <!> <!></span> <time class=\"date svelte-g4my5v\"> </time></div> <!></div> <div class=\"hover svelte-g4my5v\" role=\"toolbar\" aria-label=\"Actions\"><button title=\"Archive (e)\" class=\"svelte-g4my5v\"><!></button> <button title=\"Delete (#)\" class=\"svelte-g4my5v\"><!></button> <button class=\"svelte-g4my5v\"><!></button> <button title=\"Snooze (h for when)\" class=\"svelte-g4my5v\"><!></button></div></div>"), Be = f("<div class=\"ghost svelte-g4my5v\"><span class=\"svelte-g4my5v\"></span><span class=\"svelte-g4my5v\"></span></div>"), Ve = f("<div role=\"listbox\" aria-label=\"Conversations\" aria-multiselectable=\"true\" tabindex=\"-1\"><div class=\"pad svelte-g4my5v\"><!> <!></div> <!></div>"), He = {
	hash: "svelte-g4my5v",
	code: ".list.svelte-g4my5v {position:relative;overflow-y:auto;height:100%;outline:none;contain:strict;}.pad.svelte-g4my5v {position:relative;}.row.svelte-g4my5v {position:absolute;left:0;right:0;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:0 12px 0 10px;border-bottom:1px solid var(--border);cursor:default;user-select:none;transition:transform 120ms var(--ease);}.row.svelte-g4my5v:hover {background:var(--bg-hover);}.row.cursor.svelte-g4my5v {box-shadow:inset 3px 0 0 var(--accent);}.row.open.svelte-g4my5v {background:var(--accent-soft);}.row.checked.svelte-g4my5v {background:var(--accent-sel);}.avatar.svelte-g4my5v {all:unset;flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);cursor:pointer;}.compact.svelte-g4my5v .avatar:where(.svelte-g4my5v) {width:20px;height:20px;background:transparent;color:var(--text-faint);}.checked.svelte-g4my5v .avatar:where(.svelte-g4my5v) {background:var(--accent);color:var(--accent-fg);}.avatar.svelte-g4my5v:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.dotonly.svelte-g4my5v {width:8px;height:8px;border-radius:50%;}.dotonly.on.svelte-g4my5v {background:var(--accent);}.main.svelte-g4my5v {flex:1;min-width:0;display:grid;gap:2px;}.line1.svelte-g4my5v, .line2.svelte-g4my5v, .line3.svelte-g4my5v {display:flex;align-items:center;gap:6px;min-width:0;}.udot.svelte-g4my5v {width:7px;height:7px;border-radius:50%;background:var(--accent);flex:none;}.who.svelte-g4my5v {flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.compact.svelte-g4my5v .who:where(.svelte-g4my5v) {flex:0 0 28%;}.unread.svelte-g4my5v .who:where(.svelte-g4my5v), .unread.svelte-g4my5v .subject:where(.svelte-g4my5v) {font-weight:650;color:var(--heading);}.count.svelte-g4my5v {margin-left:5px;color:var(--text-faint);font-size:0.86em;font-weight:400;}.draftmark.svelte-g4my5v {color:var(--red);font-weight:400;}.marks.svelte-g4my5v {margin-left:auto;display:flex;gap:4px;align-items:center;color:var(--text-faint);}.star.svelte-g4my5v {color:var(--yellow);}.date.svelte-g4my5v {flex:none;color:var(--text-muted);font-size:0.85em;font-variant-numeric:tabular-nums;}.unread.svelte-g4my5v .date:where(.svelte-g4my5v) {color:var(--text);font-weight:600;}.subject.svelte-g4my5v {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.compact.svelte-g4my5v .subject:where(.svelte-g4my5v) {flex:1;}.snip.svelte-g4my5v {min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:0.92em;}.chip.svelte-g4my5v {flex:none;font-size:0.78em;padding:0 6px;border-radius:999px;background:hsl(var(--h, 220) 60% 50% / 0.16);color:var(--text);line-height:1.6;}.chip.acct.svelte-g4my5v {background:var(--bg-active);color:var(--text-muted);}\n  /* over the date's line (hidden on hover), not over the subject; centred in a one-line compact row */.hover.svelte-g4my5v {position:absolute;right:8px;top:5px;display:none;gap:0;background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0 1px;box-shadow:var(--shadow-sm);}.row.svelte-g4my5v:hover .hover:where(.svelte-g4my5v) {display:flex;}.compact.svelte-g4my5v .hover:where(.svelte-g4my5v) {top:50%;transform:translateY(-50%);}.row.svelte-g4my5v:hover .date:where(.svelte-g4my5v), .row.svelte-g4my5v:hover .marks:where(.svelte-g4my5v) {visibility:hidden;}.hover.svelte-g4my5v button:where(.svelte-g4my5v) {all:unset;cursor:pointer;padding:2px 5px;border-radius:var(--radius-sm);color:var(--text-muted);min-width:22px;min-height:20px;display:grid;place-items:center;}.hover.svelte-g4my5v button:where(.svelte-g4my5v):hover {background:var(--bg-hover);color:var(--text);}.swipe.svelte-g4my5v {position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-start;padding:0 20px;color:#fff;background:var(--green);font-weight:600;z-index:-1;}.swipe.left.svelte-g4my5v {justify-content:flex-end;background:var(--accent);}.ghost.svelte-g4my5v {position:absolute;left:0;right:0;padding:14px 16px 0 54px;display:grid;gap:8px;border-bottom:1px solid var(--border);}.ghost.svelte-g4my5v span:where(.svelte-g4my5v) {height:10px;border-radius:4px;background:var(--bg-hover);width:40%;}.ghost.svelte-g4my5v span:where(.svelte-g4my5v) + span:where(.svelte-g4my5v) {width:75%;}\n  @media (prefers-reduced-motion: reduce) {.row.svelte-g4my5v {transition:none;} }.sect.svelte-g4my5v {position:absolute;left:0;right:0;height:28px;display:flex;align-items:center;gap:6px;padding:0 14px;font-size:0.78em;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-muted);background:var(--bg-secondary, var(--bg));border-bottom:1px solid var(--border);}.sect.svelte-g4my5v .faint:where(.svelte-g4my5v) {font-weight:400;margin-left:2px;}\n  @media (hover: none) {.hover.svelte-g4my5v {display:none !important;} }"
};
function Ue(r, d) {
	R(d, !0), i(r, He);
	let f = D(d, "mail", 7), p = D(d, "compact", 3, !1), h = N(() => p() ? 34 : 76), g = N(() => {
		if (!f().pinning) return 0;
		let e = f().rows.findIndex((e) => !e.flagged);
		return e < 0 ? f().rows.length : e;
	}), E = (e) => e * c(h) + (c(g) ? e < c(g) ? 28 : 56 : 0), O = e(void 0), k = e(0), A = e(600), ee = N(() => Math.max(0, Math.floor(c(k) / c(h)) - 8)), j = N(() => Math.min(f().rows.length, Math.ceil((c(k) + c(A)) / c(h)) + 8)), M = N(() => f().rows.slice(c(ee), c(j)));
	s(() => {
		f().cursor;
		let e = x(() => f().index());
		if (!c(O) || e < 0) return;
		let t = x(() => E(e));
		t < c(O).scrollTop ? c(O).scrollTop = Math.max(0, t - (e === 0 || e === c(g) ? 28 : 0)) : t + c(h) > c(O).scrollTop + c(O).clientHeight && (c(O).scrollTop = t + c(h) - c(O).clientHeight);
	});
	let F;
	s(() => {
		let e = c(M);
		return clearTimeout(F), F = setTimeout(() => x(() => f().fillSnippets(e)), 250), () => clearTimeout(F);
	});
	function L() {
		c(O) && (_(k, c(O).scrollTop, !0), c(O).scrollTop + c(O).clientHeight > c(O).scrollHeight - c(h) * 10 && f().more());
	}
	function V(e, t) {
		if (e.shiftKey) {
			f().extend(t.id);
			return;
		}
		if (e.ctrlKey || e.metaKey) {
			f().toggle(t.thread), f().cursor = t.id;
			return;
		}
		d.onopen(t);
	}
	function H(e, t) {
		let n = f().checked.includes(t.thread) ? f().rows.filter((e) => f().checked.includes(e.thread)).map((e) => e.id) : [t.id];
		e.dataTransfer?.setData("application/x-atlas-mail", JSON.stringify(n)), e.dataTransfer?.setData("text/plain", `${n.length} conversation${n.length === 1 ? "" : "s"}`), e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
	}
	let U = e(null);
	function J(e, t) {
		e.pointerType === "touch" && _(U, {
			id: t.id,
			x0: e.clientX,
			dx: 0
		}, !0);
	}
	function re(e) {
		c(U) && (c(U).dx = e.clientX - c(U).x0);
	}
	function X(e, t) {
		if (!c(U) || c(U).id !== t.id) return;
		let n = e.currentTarget.clientWidth, r = c(U).dx;
		_(U, null), r < -n / 3 ? f().archive([t]) : r > n / 3 && f().toggleRead([t]);
	}
	let ae = (e) => W(e);
	var oe = Ve();
	let Z;
	var ce = q(oe);
	let le;
	var ue = q(ce), de = (e) => {
		var t = Oe(), n = u(t);
		b(n, "", {}, { top: "0" });
		var r = q(n);
		I(r, {
			name: "star",
			size: 13,
			filled: !0
		});
		var i = w(r, 2), a = T(i, !0);
		G(n);
		var s = w(n, 2), l = (e) => {
			var t = De();
			let n;
			C(() => n = b(t, "", n, { top: `${c(g) * c(h) + 28}px` })), o(e, t);
		};
		z(s, (e) => {
			c(g) < f().rows.length && e(l);
		}), C(() => m(a, c(g))), o(e, t);
	};
	z(ue, (e) => {
		c(g) && e(de);
	});
	var fe = w(ue, 2);
	B(fe, 19, () => c(M), (e) => e.thread, (e, t, r) => {
		let i = N(() => c(ee) + c(r)), s = N(() => f().checked.includes(c(t).thread)), l = N(() => c(U)?.id === c(t).id ? c(U).dx : 0);
		var d = ze();
		let g, x;
		var D = q(d), O = (e) => {
			var n = ke();
			let r;
			var i = T(n, !0);
			C(() => {
				r = a(n, 1, "swipe svelte-g4my5v", null, r, { left: c(l) < 0 }), m(i, c(l) < 0 ? "Archive" : c(t).unread ? "Read" : "Unread");
			}), o(e, n);
		};
		z(D, (e) => {
			c(l) && e(O);
		});
		var k = w(D, 2);
		let A;
		var j = q(k), M = (e) => {
			I(e, {
				name: "check",
				size: 15
			});
		}, F = (e) => {
			var n = Ae();
			let r;
			C(() => r = a(n, 1, "dotonly svelte-g4my5v", null, r, { on: c(t).unread > 0 })), o(e, n);
		}, L = (e) => {
			var n = v();
			C((e) => m(n, e), [() => ne(c(t).from.at(-1))]), o(e, n);
		};
		z(j, (e) => {
			c(s) ? e(M) : p() ? e(F, 1) : e(L, -1);
		}), G(k);
		var R = w(k, 2), Y = q(R), ie = q(Y), oe = (e) => {
			var t = je();
			o(e, t);
		};
		z(ie, (e) => {
			c(t).unread > 0 && !p() && e(oe);
		});
		var se = w(ie, 2), Z = q(se, !0), ce = w(Z), le = (e) => {
			var n = Me(), r = T(n, !0);
			C(() => m(r, c(t).count)), o(e, n);
		};
		z(ce, (e) => {
			c(t).count > 1 && e(le);
		});
		var ue = w(ce), de = (e) => {
			var t = Ne();
			o(e, t);
		};
		z(ue, (e) => {
			c(t).draft && c(t).count > 1 && e(de);
		}), G(se);
		var fe = w(se, 2), pe = (e) => {
			var n = Pe(), r = q(n, !0), i = w(r), a = T(i);
			G(n), C(() => {
				m(r, c(t).subject || "(no subject)"), m(a, `— ${c(t).snippet ?? ""}`);
			}), o(e, n);
		};
		z(fe, (e) => {
			p() && e(pe);
		});
		var me = w(fe, 2), Q = q(me), he = (e) => {
			I(e, {
				name: "attach",
				size: 13,
				title: "has files"
			});
		};
		z(Q, (e) => {
			c(t).has_attachments && e(he);
		});
		var ge = w(Q, 2), _e = (e) => {
			I(e, {
				name: "note",
				size: 13,
				title: "saved as a note"
			});
		};
		z(ge, (e) => {
			c(t).saved && e(_e);
		});
		var ve = w(ge, 2), ye = (e) => {
			var t = Fe(), n = q(t);
			I(n, {
				name: "star",
				size: 14,
				filled: !0,
				title: "starred"
			}), G(t), o(e, t);
		};
		z(ve, (e) => {
			c(t).flagged && e(ye);
		}), G(me);
		var $ = w(me, 2), be = T($, !0);
		G(Y);
		var xe = w(Y, 2), Se = (e) => {
			var n = Re(), r = u(n), i = q(r), a = T(i, !0);
			G(r);
			var s = w(r, 2), l = q(s), d = (e) => {
				var n = Ie(), r = T(n, !0);
				C(() => m(r, c(t).account)), o(e, n);
			};
			z(l, (e) => {
				f().view.name !== "folder" && f().view.account === null && f().accounts.length > 1 && e(d);
			});
			var p = w(l, 2);
			B(p, 16, () => c(t).labels.slice(0, 3), (e) => e, (e, t) => {
				var n = Le();
				let r;
				var i = T(n, !0);
				C((e, t) => {
					r = b(n, "", r, { "--h": e }), m(i, t);
				}, [() => ae(t), () => t.replace(/^\$/, "")]), o(e, n);
			});
			var h = w(p, 2), g = T(h, !0);
			G(s), C(() => {
				m(a, c(t).subject || "(no subject)"), m(g, c(t).snippet_missing ? "…" : c(t).snippet);
			}), o(e, n);
		};
		z(xe, (e) => {
			p() || e(Se);
		}), G(R);
		var Ce = w(R, 2), we = q(Ce), Te = q(we);
		I(Te, { name: "archive" }), G(we);
		var Ee = w(we, 2), De = q(Ee);
		I(De, { name: "trash" }), G(Ee);
		var Oe = w(Ee, 2), Be = q(Oe);
		{
			let e = N(() => c(t).unread ? "read" : "unread");
			I(Be, { get name() {
				return c(e);
			} });
		}
		G(Oe);
		var Ve = w(Oe, 2), He = q(Ve);
		I(He, { name: "clock" }), G(Ve), G(Ce), G(d), C((e, n, r, i, o) => {
			g = a(d, 1, "row svelte-g4my5v", null, g, {
				unread: c(t).unread > 0,
				cursor: f().cursor === c(t).id,
				open: f().openId === c(t).id,
				checked: c(s)
			}), y(d, "aria-selected", c(s) || f().openId === c(t).id), x = b(d, "", x, {
				top: e,
				height: `${c(h) ?? ""}px`,
				transform: c(l) ? `translateX(${c(l)}px)` : void 0
			}), y(k, "aria-label", c(s) ? "Uncheck" : "Check"), y(k, "aria-pressed", c(s)), A = b(k, "", A, { "--h": n }), m(Z, r), y($, "datetime", i), m(be, o), y(Oe, "title", c(t).unread ? "Mark read" : "Mark unread");
		}, [
			() => `${E(c(i)) ?? ""}px`,
			() => W(c(t).from.at(-1)?.addr ?? c(t).subject),
			() => c(t).draft && c(t).count === 1 ? "Draft" : te(c(t).from, f().own),
			() => (/* @__PURE__ */ new Date(c(t).date * 1e3)).toISOString(),
			() => K(c(t).date)
		]), n("click", d, (e) => V(e, c(t))), n("keydown", d, () => {}), S("dragstart", d, (e) => H(e, c(t))), n("pointerdown", d, (e) => J(e, c(t))), n("pointermove", d, re), n("pointerup", d, (e) => X(e, c(t))), S("pointercancel", d, () => _(U, null)), n("click", k, (e) => {
			e.stopPropagation(), f().toggle(c(t).thread);
		}), n("click", we, (e) => {
			e.stopPropagation(), f().archive([c(t)]);
		}), n("click", Ee, (e) => {
			e.stopPropagation(), f().trash([c(t)]);
		}), n("click", Oe, (e) => {
			e.stopPropagation(), f().toggleRead([c(t)]);
		}), n("click", Ve, (e) => {
			e.stopPropagation(), f().snooze(P()[0].at, [c(t)]);
		}), o(e, d);
	}), G(ce);
	var pe = w(ce, 2), me = (e) => {
		var n = l(), r = u(n);
		B(r, 16, () => Array(8), t, (e, t, n) => {
			var r = Be();
			let i;
			C(() => i = b(r, "", i, {
				top: `${n * c(h)}px`,
				height: `${c(h) ?? ""}px`
			})), o(e, r);
		}), o(e, n);
	};
	z(pe, (e) => {
		f().loading && !f().rows.length && e(me);
	}), G(oe), ie(oe, (e) => _(O, e), () => c(O)), C(() => {
		Z = a(oe, 1, "list svelte-g4my5v", null, Z, { compact: p() }), le = b(ce, "", le, { height: `${f().rows.length * c(h) + (c(g) ? 56 : 0)}px` });
	}), S("scroll", oe, L), se(oe, "clientHeight", (e) => _(A, e)), o(r, oe), Y();
}
Z([
	"click",
	"keydown",
	"pointerdown",
	"pointermove",
	"pointerup"
]);
//#endregion
//#region plugins/stable/email/ui/src/InviteCard.svelte
var We = f("<span class=\"faint svelte-720w0p\"> </span>"), Ge = f("<span> </span>"), Ke = f("<span class=\"ok svelte-720w0p\"><!> In your calendar</span>"), qe = f("<span class=\"clash svelte-720w0p\"> </span>"), Je = f("<span class=\"state svelte-720w0p\"><!> <!></span>"), Ye = f("<span class=\"given svelte-720w0p\"> </span>"), Xe = f("<div class=\"answer svelte-720w0p\" role=\"group\" aria-label=\"Answer the invitation\"><!> <button>Accept</button> <button>Maybe</button> <button>Decline</button></div>"), Ze = f("<div><!> <div class=\"what svelte-720w0p\"><b class=\"svelte-720w0p\"> </b> <span> <!></span> <!> <!> <!> <!></div> <!></div>"), Qe = {
	hash: "svelte-720w0p",
	code: ".invite.svelte-720w0p {display:flex;flex-wrap:wrap;gap:10px 12px;align-items:flex-start;padding:10px 12px;margin-bottom:10px;border-radius:var(--radius);border:1px solid var(--border-strong);background:var(--accent-soft);}.invite.cancelled.svelte-720w0p b:where(.svelte-720w0p) {text-decoration:line-through;}.what.svelte-720w0p {display:grid;gap:2px;flex:1 1 220px;min-width:0;}.faint.svelte-720w0p {color:var(--text-muted);}.state.svelte-720w0p {display:flex;flex-wrap:wrap;gap:4px 10px;font-size:0.9em;margin-top:2px;}.ok.svelte-720w0p {display:inline-flex;align-items:center;gap:4px;color:var(--success, var(--text));}.clash.svelte-720w0p {color:var(--warning, var(--text-muted));}.answer.svelte-720w0p {display:flex;align-items:center;gap:6px;flex-wrap:wrap;}.given.svelte-720w0p {color:var(--text-muted);font-size:0.9em;margin-right:4px;}.answer.svelte-720w0p button:where(.svelte-720w0p) {padding:4px 12px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);cursor:pointer;}.answer.svelte-720w0p button:where(.svelte-720w0p):hover:not(:disabled) {border-color:var(--accent);}.answer.svelte-720w0p button.on:where(.svelte-720w0p) {background:var(--accent);color:var(--accent-fg);border-color:transparent;}.answer.svelte-720w0p button:where(.svelte-720w0p):disabled {opacity:0.6;cursor:default;}"
};
function $e(t, r) {
	R(r, !0), i(t, Qe);
	let l = e(null), u = e(null), d = e(!1), f = N(() => c(u) ?? r.invite.answer);
	s(() => {
		let e = r.id;
		_(l, null), r.mail.call("invite_status", { id: e }).then((t) => {
			e === r.id && _(l, t, !0);
		}).catch(() => {});
	});
	let p = (e) => /* @__PURE__ */ new Date(`${e}T00:00:00`), h = (e) => e.length > 10 ? new Date(e) : p(e), g = (e) => e.toLocaleDateString(void 0, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: e.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() ? void 0 : "numeric"
	}), v = (e, t) => e.toLocaleTimeString(void 0, {
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit",
		timeZone: t
	}), y = (e, t) => e.toDateString() === t.toDateString(), b = N(() => {
		if (!r.invite.start) return "";
		let e = h(r.invite.start), t = r.invite.end ? h(r.invite.end) : null;
		if (r.invite.all_day) {
			let n = t ? /* @__PURE__ */ new Date(t.getTime() - 864e5) : e;
			return y(e, n) ? `${g(e)} · all day` : `${g(e)} – ${g(n)}`;
		}
		let n = t ? y(e, t) ? `${v(e)} – ${v(t)}` : `${v(e)} – ${g(t)} ${v(t)}` : v(e);
		return `${g(e)} · ${n}`;
	}), x = N(() => {
		if (!r.invite.zone || r.invite.all_day || !r.invite.start) return "";
		try {
			let e = r.invite.zone.split("/").pop().replace(/_/g, " ");
			return `${v(h(r.invite.start), r.invite.zone)} in ${e}`;
		} catch {
			return "";
		}
	}), S = N(() => {
		let e = /FREQ=(\w+)/.exec(r.invite.repeats)?.[1];
		return e ? {
			DAILY: "every day",
			WEEKLY: "every week",
			MONTHLY: "every month",
			YEARLY: "every year"
		}[e] ?? "repeats" : "";
	}), E = (e) => ({
		ACCEPTED: "You accepted",
		TENTATIVE: "You said maybe",
		DECLINED: "You declined"
	})[e] ?? "", D = N(() => r.invite.method === "REQUEST" && !r.invite.mine);
	async function O(e) {
		_(d, !0);
		try {
			let t = await r.mail.call("answer_invite", {
				id: r.id,
				partstat: e
			});
			_(u, e, !0);
			let n = t.calendar ? " · in your calendar" : t.calendar_error && e !== "DECLINED" ? " · not filed in a calendar" : "";
			r.mail.toast(`${E(e)}${n}`, "success"), t.calendar && _(l, {
				...c(l) ?? { conflicts: [] },
				in_calendar: !0
			}, !0);
		} catch (e) {
			r.mail.toast(`Could not answer: ${e.message}`, "error");
		} finally {
			_(d, !1);
		}
	}
	var A = Ze();
	let ee;
	var j = q(A);
	I(j, {
		name: "calendar",
		size: 22
	});
	var M = w(j, 2), P = q(M), F = T(P), L = w(P, 2), te = q(L, !0), V = w(te), H = (e) => {
		var t = We(), n = T(t);
		C(() => m(n, `· ${c(S) ?? ""}`)), o(e, t);
	};
	z(V, (e) => {
		c(S) && e(H);
	}), G(L);
	var U = w(L, 2), W = (e) => {
		var t = We(), n = T(t, !0);
		C(() => m(n, c(x))), o(e, t);
	};
	z(U, (e) => {
		c(x) && e(W);
	});
	var K = w(U, 2), J = (e) => {
		var t = Ge(), n = T(t, !0);
		C(() => m(n, r.invite.location)), o(e, t);
	};
	z(K, (e) => {
		r.invite.location && e(J);
	});
	var ne = w(K, 2), re = (e) => {
		var t = We(), n = T(t);
		C(() => m(n, `from ${r.invite.organizer ?? ""}${r.invite.attendees.length > 1 ? ` · ${r.invite.attendees.length} invited` : ""}`)), o(e, t);
	};
	z(ne, (e) => {
		r.invite.organizer && e(re);
	});
	var X = w(ne, 2), ie = (e) => {
		var t = Je(), n = q(t), r = (e) => {
			var t = Ke(), n = q(t);
			I(n, {
				name: "check",
				size: 13
			}), k(), G(t), o(e, t);
		};
		z(n, (e) => {
			c(l).in_calendar && e(r);
		});
		var i = w(n, 2);
		B(i, 17, () => c(l).conflicts.slice(0, 2), (e) => e.summary + e.start, (e, t) => {
			var n = qe(), r = T(n);
			C((e) => m(r, `Overlaps ${c(t).summary ?? ""} (${e ?? ""})`), [() => v(h(c(t).start))]), o(e, n);
		}), G(t), o(e, t);
	};
	z(X, (e) => {
		c(l) && e(ie);
	}), G(M);
	var ae = w(M, 2), oe = (e) => {
		var t = Xe(), r = q(t), i = (e) => {
			var t = Ye(), n = T(t, !0);
			C((e) => m(n, e), [() => E(c(f))]), o(e, t);
		};
		z(r, (e) => {
			c(f) && e(i);
		});
		var s = w(r, 2);
		let l;
		var u = w(s, 2);
		let p;
		var h = w(u, 2);
		let g;
		G(t), C(() => {
			s.disabled = c(d), l = a(s, 1, "svelte-720w0p", null, l, { on: c(f) === "ACCEPTED" }), u.disabled = c(d), p = a(u, 1, "svelte-720w0p", null, p, { on: c(f) === "TENTATIVE" }), h.disabled = c(d), g = a(h, 1, "svelte-720w0p", null, g, { on: c(f) === "DECLINED" });
		}), n("click", s, () => O("ACCEPTED")), n("click", u, () => O("TENTATIVE")), n("click", h, () => O("DECLINED")), o(e, t);
	};
	z(ae, (e) => {
		c(D) && e(oe);
	}), G(A), C(() => {
		ee = a(A, 1, "invite svelte-720w0p", null, ee, { cancelled: r.invite.method === "CANCEL" }), m(F, `${r.invite.method === "CANCEL" ? "Cancelled: " : ""}${(r.invite.summary || "An invitation") ?? ""}`), m(te, c(b));
	}), o(t, A), Y();
}
Z(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/AddressField.svelte
var et = f("<span><span class=\"svelte-1y6wl7m\"> </span> <button class=\"svelte-1y6wl7m\">×</button></span>"), tt = f("<span class=\"svelte-1y6wl7m\"> </span>"), nt = f("<li role=\"option\"><button><b> </b><!></button></li>"), rt = f("<ul class=\"offers svelte-1y6wl7m\" role=\"listbox\"></ul>"), it = f("<div class=\"field svelte-1y6wl7m\"><span class=\"label svelte-1y6wl7m\"> </span> <div class=\"box svelte-1y6wl7m\" role=\"presentation\"><!> <input autocomplete=\"off\" spellcheck=\"false\" class=\"svelte-1y6wl7m\"/></div> <!></div>"), at = {
	hash: "svelte-1y6wl7m",
	code: ".field.svelte-1y6wl7m {position:relative;display:flex;align-items:flex-start;gap:8px;border-bottom:1px solid var(--border);padding:4px 0;}.label.svelte-1y6wl7m {flex:none;width:3.2em;color:var(--text-faint);padding-top:5px;font-size:0.9em;}.box.svelte-1y6wl7m {flex:1;display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:28px;cursor:text;min-width:0;}.chip.svelte-1y6wl7m {display:inline-flex;align-items:center;gap:2px;padding:1px 2px 1px 8px;border-radius:999px;background:hsl(var(--h) 55% 50% / 0.16);max-width:100%;}.chip.svelte-1y6wl7m span:where(.svelte-1y6wl7m) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.chip.bad.svelte-1y6wl7m {background:color-mix(in srgb, var(--red) 18%, transparent);outline:1px solid var(--red);}.chip.svelte-1y6wl7m button:where(.svelte-1y6wl7m) {all:unset;cursor:pointer;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;color:var(--text-muted);}.chip.svelte-1y6wl7m button:where(.svelte-1y6wl7m):hover {background:var(--bg-active);color:var(--text);}input.svelte-1y6wl7m {all:unset;flex:1;min-width:8em;padding:4px 0;}.offers.svelte-1y6wl7m {position:absolute;z-index:10;left:3.6em;right:0;top:100%;margin:2px 0 0;padding:4px;list-style:none;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));}.offers.svelte-1y6wl7m button:where(.svelte-1y6wl7m) {all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:baseline;padding:6px 10px;border-radius:var(--radius-sm);cursor:pointer;}.offers.svelte-1y6wl7m button.on:where(.svelte-1y6wl7m), .offers.svelte-1y6wl7m button:where(.svelte-1y6wl7m):hover {background:var(--accent-soft);}.offers.svelte-1y6wl7m span:where(.svelte-1y6wl7m) {color:var(--text-muted);font-size:0.9em;overflow:hidden;text-overflow:ellipsis;}"
};
function ot(t, r) {
	R(r, !0), i(t, at);
	let l = D(r, "value", 15), u = D(r, "autofocus", 3, !1), d = e(""), f = e(E([])), p = e(0), h = e(void 0), g;
	function v(e) {
		let t = [], n = "", r = !1, i = !1;
		for (let a of e) a === "\"" && (r = !r), a === "<" && (i = !0), a === ">" && (i = !1), (a === "," || a === ";") && !r && !i ? (n.trim() && t.push(n.trim()), n = "") : n += a;
		return n.trim() && t.push(n.trim()), t;
	}
	let x = N(() => v(l())), O = (e) => (e.match(/<([^>]+)>/)?.[1] ?? e).trim(), k = (e) => e.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || O(e), ee = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(O(e));
	function j(e) {
		let t = e.trim().replace(/,$/, "");
		t && (l([...c(x).filter((e) => O(e).toLowerCase() !== O(t).toLowerCase()), t].join(", ")), _(d, ""), _(f, [], !0));
	}
	function M(e) {
		l(c(x).filter((t, n) => n !== e).join(", "));
	}
	function P() {
		if (/[,;]/.test(c(d))) {
			for (let e of v(c(d))) j(e);
			return;
		}
		clearTimeout(g);
		let e = c(d).trim();
		if (!e) {
			_(f, [], !0);
			return;
		}
		g = setTimeout(async () => {
			try {
				let t = await J(r.atlas, "contacts", {
					q: e,
					limit: 7
				}, 10);
				c(d).trim() === e && (_(f, t.contacts.filter((e) => !c(x).some((t) => O(t).toLowerCase() === e.addr)), !0), _(p, 0));
			} catch {
				_(f, [], !0);
			}
		}, 90);
	}
	let F = (e) => e.name ? `${/[,"<>]/.test(e.name) ? `"${e.name.replace(/"/g, "")}"` : e.name} <${e.addr}>` : e.addr;
	function I(e) {
		c(f).length && (e.key === "ArrowDown" || e.key === "ArrowUp") ? (e.preventDefault(), _(p, (c(p) + (e.key === "ArrowDown" ? 1 : c(f).length - 1)) % c(f).length)) : e.key === "Enter" || e.key === "Tab" && c(d).trim() ? c(f).length ? (e.preventDefault(), j(F(c(f)[c(p)]))) : c(d).trim() && (e.preventDefault(), j(c(d))) : e.key === "Backspace" && !c(d) && c(x).length ? (e.preventDefault(), _(d, c(x).at(-1), !0), M(c(x).length - 1)) : e.key === "Escape" && c(f).length && (e.stopPropagation(), _(f, [], !0));
	}
	s(() => {
		u() && c(h)?.focus();
	});
	var L = it(), te = q(L), V = T(te, !0), H = w(te, 2), U = q(H);
	B(U, 19, () => c(x), (e, t) => e + t, (e, t, r) => {
		var i = et();
		let s, l;
		var u = q(i), d = T(u, !0), f = w(u, 2);
		G(i), C((e, n, r, o) => {
			s = a(i, 1, "chip svelte-1y6wl7m", null, s, { bad: e }), y(i, "title", c(t)), l = b(i, "", l, { "--h": n }), m(d, r), y(f, "aria-label", o);
		}, [
			() => !ee(c(t)),
			() => W(O(c(t))),
			() => k(c(t)),
			() => `Remove ${O(c(t))}`
		]), n("click", f, (e) => {
			e.stopPropagation(), M(c(r));
		}), o(e, i);
	});
	var K = w(U, 2);
	oe(K), ie(K, (e) => _(h, e), () => c(h)), G(H);
	var ne = w(H, 2), re = (e) => {
		var t = rt();
		B(t, 23, () => c(f), (e) => e.addr, (e, t, r) => {
			var i = nt(), s = q(i);
			let l;
			var u = q(s), d = T(u, !0), f = w(u), h = (e) => {
				var n = tt(), r = T(n, !0);
				C(() => m(r, c(t).addr)), o(e, n);
			};
			z(f, (e) => {
				c(t).name && e(h);
			}), G(s), G(i), C(() => {
				y(i, "aria-selected", c(r) === c(p)), l = a(s, 1, "svelte-1y6wl7m", null, l, { on: c(r) === c(p) }), m(d, c(t).name || c(t).addr);
			}), n("mousedown", s, (e) => {
				e.preventDefault(), j(F(c(t)));
			}), o(e, i);
		}), G(t), o(e, t);
	};
	z(ne, (e) => {
		c(f).length && e(re);
	}), G(L), C(() => {
		m(V, r.label), y(K, "aria-label", r.label);
	}), n("click", H, () => c(h)?.focus()), n("input", K, P), n("keydown", K, I), S("blur", K, () => {
		c(d).trim() && j(c(d)), _(f, [], !0);
	}), A(K, () => c(d), (e) => _(d, e)), o(t, L), Y();
}
Z([
	"click",
	"input",
	"keydown",
	"mousedown"
]);
//#endregion
//#region plugins/stable/email/ui/src/Composer.svelte
var st = f("<header class=\"bar svelte-zp5xms\"><b class=\"svelte-zp5xms\"> </b> <span class=\"grow svelte-zp5xms\"></span> <button class=\"tool svelte-zp5xms\"><!></button> <button class=\"tool svelte-zp5xms\" title=\"Close (kept in Drafts)\"><!></button></header>"), ct = f("<option> </option>"), lt = f("<div class=\"from svelte-zp5xms\"><span class=\"label svelte-zp5xms\">From</span> <select class=\"svelte-zp5xms\"></select></div>"), ut = f("<button class=\"link svelte-zp5xms\">Cc</button>"), dt = f("<button class=\"link svelte-zp5xms\">Bcc</button>"), ft = f("<input class=\"subject svelte-zp5xms\" placeholder=\"Subject\" aria-label=\"Subject\"/>"), pt = f("<div class=\"preview svelte-zp5xms\"></div>"), mt = f("<textarea aria-label=\"The message\" spellcheck=\"true\" class=\"svelte-zp5xms\"></textarea>"), ht = f("<span class=\"faint svelte-zp5xms\"> </span>"), gt = f("<span class=\"faint svelte-zp5xms\">(forwarded)</span>"), _t = f("<span class=\"file svelte-zp5xms\"><!><span class=\"svelte-zp5xms\"> </span><!><!><button class=\"svelte-zp5xms\">×</button></span>"), vt = f("<span class=\"warn svelte-zp5xms\"> </span>"), yt = f("<div class=\"files svelte-zp5xms\"><!> <!></div>"), bt = f("<div class=\"error svelte-zp5xms\" role=\"alert\"> </div>"), xt = f("<div class=\"drop svelte-zp5xms\">Drop to attach</div>"), St = f("<button class=\"svelte-zp5xms\"> <span class=\"faint svelte-zp5xms\"> </span></button>"), Ct = f("<div class=\"later svelte-zp5xms\" role=\"dialog\" aria-label=\"Send later\"><!> <div class=\"custom svelte-zp5xms\"><input placeholder=\"tomorrow 9, mon 14:00, 3h…\" class=\"svelte-zp5xms\"/><button class=\"atlas-btn svelte-zp5xms\">Schedule</button></div></div>"), wt = f("<button class=\"tool svelte-zp5xms\" title=\"Pop out\"><!></button>"), Tt = f("<div role=\"form\"><!> <div class=\"fields svelte-zp5xms\"><!> <div class=\"torow svelte-zp5xms\"><div class=\"grow svelte-zp5xms\"><!></div> <!> <!></div> <!> <!> <!></div> <div class=\"tb svelte-zp5xms\" role=\"toolbar\" aria-label=\"Formatting\"><button title=\"Bold (Ctrl+B)\" class=\"svelte-zp5xms\"><b>B</b></button> <button title=\"Italic (Ctrl+I)\" class=\"svelte-zp5xms\"><i>I</i></button> <button title=\"Strikethrough\" class=\"svelte-zp5xms\"><s>S</s></button> <button title=\"Link (Ctrl+K)\" class=\"svelte-zp5xms\"><!></button> <button title=\"List\" class=\"svelte-zp5xms\">•</button> <button title=\"Numbered list\" class=\"svelte-zp5xms\">1.</button> <button title=\"Quote\" class=\"svelte-zp5xms\">”</button> <button title=\"Code\" class=\"svelte-zp5xms\"><code></code></button> <span class=\"grow svelte-zp5xms\"></span> <button title=\"How it will look\"> </button></div> <!> <!> <!> <!> <footer class=\"foot svelte-zp5xms\"><div class=\"send svelte-zp5xms\"><button class=\"atlas-btn primary svelte-zp5xms\" title=\"Send (Ctrl+Enter)\">Send</button> <button class=\"atlas-btn primary more svelte-zp5xms\" title=\"Send later…\"><!></button> <!></div> <button class=\"tool svelte-zp5xms\" title=\"Attach files\"><!></button> <button class=\"tool svelte-zp5xms\" title=\"Attach a file of the vault…\"><!></button> <input type=\"file\" multiple=\"\" hidden=\"\"/> <span class=\"status faint svelte-zp5xms\"> </span> <span class=\"grow svelte-zp5xms\"></span> <!> <button class=\"tool svelte-zp5xms\" title=\"Discard\"><!></button></footer></div>"), Et = {
	hash: "svelte-zp5xms",
	code: ".composer.svelte-zp5xms {position:relative;display:flex;flex-direction:column;gap:6px;background:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius);padding:0 14px 10px;box-shadow:var(--shadow-sm);min-width:0;}.composer.inline.svelte-zp5xms {margin-left:38px;padding-top:6px;}.composer.over.svelte-zp5xms {outline:2px dashed var(--accent);}.bar.svelte-zp5xms {display:flex;align-items:center;gap:6px;margin:0 -14px;padding:8px 10px 8px 14px;background:var(--bg-alt);border-bottom:1px solid var(--border);border-radius:var(--radius) var(--radius) 0 0;}.bar.svelte-zp5xms b:where(.svelte-zp5xms) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.grow.svelte-zp5xms {flex:1;min-width:0;}.fields.svelte-zp5xms {display:grid;}.from.svelte-zp5xms {display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--border);padding:4px 0;}.from.svelte-zp5xms select:where(.svelte-zp5xms) {flex:1;min-width:0;background:transparent;color:var(--text);border:0;padding:4px 0;font:inherit;}.label.svelte-zp5xms {flex:none;width:3.2em;color:var(--text-faint);font-size:0.9em;}.torow.svelte-zp5xms {display:flex;align-items:flex-start;gap:8px;}.torow.svelte-zp5xms .link:where(.svelte-zp5xms) {margin-top:9px;}.link.svelte-zp5xms {all:unset;cursor:pointer;color:var(--text-muted);font-size:0.9em;}.link.svelte-zp5xms:hover {color:var(--accent);}.subject.svelte-zp5xms {all:unset;padding:8px 0;border-bottom:1px solid var(--border);font-weight:600;}.tb.svelte-zp5xms {display:flex;gap:2px;align-items:center;padding-top:2px;}.tb.svelte-zp5xms button:where(.svelte-zp5xms) {all:unset;cursor:pointer;min-width:26px;height:26px;display:grid;place-items:center;border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.92em;padding:0 4px;}.tb.svelte-zp5xms button:where(.svelte-zp5xms):hover, .tb.svelte-zp5xms button.on:where(.svelte-zp5xms) {background:var(--bg-hover);color:var(--text);}textarea.svelte-zp5xms {all:unset;box-sizing:border-box;width:100%;min-height:120px;resize:none;white-space:pre-wrap;line-height:1.55;font-size:15px;font-family:var(--font-prose, var(--font-ui));overflow-y:auto;}.preview.svelte-zp5xms {min-height:120px;padding:4px 0;line-height:1.55;overflow-wrap:anywhere;}.preview.svelte-zp5xms blockquote {margin:0.4em 0;padding-left:0.9em;border-left:3px solid var(--border-strong);color:var(--text-muted);}.files.svelte-zp5xms {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.file.svelte-zp5xms {display:inline-flex;gap:6px;align-items:center;padding:3px 4px 3px 8px;border-radius:var(--radius-sm);background:var(--bg-alt);border:1px solid var(--border);font-size:0.9em;max-width:260px;}.file.svelte-zp5xms span:where(.svelte-zp5xms):not(.faint) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.file.svelte-zp5xms button:where(.svelte-zp5xms) {all:unset;cursor:pointer;width:18px;height:18px;display:grid;place-items:center;border-radius:50%;color:var(--text-muted);}.file.svelte-zp5xms button:where(.svelte-zp5xms):hover {background:var(--bg-hover);}.warn.svelte-zp5xms {color:var(--orange);font-size:0.86em;}.faint.svelte-zp5xms {color:var(--text-faint);}.error.svelte-zp5xms {color:var(--red);font-size:0.9em;}.drop.svelte-zp5xms {position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb, var(--accent) 12%, var(--bg));border-radius:var(--radius);font-weight:600;color:var(--accent-strong);pointer-events:none;}.foot.svelte-zp5xms {display:flex;align-items:center;gap:6px;padding-top:4px;}.send.svelte-zp5xms {position:relative;display:flex;}.send.svelte-zp5xms .atlas-btn.primary:where(.svelte-zp5xms) {background:var(--accent);color:var(--accent-fg);border-color:transparent;font-weight:600;}.send.svelte-zp5xms .atlas-btn:where(.svelte-zp5xms):first-child {border-radius:var(--radius-sm) 0 0 var(--radius-sm);padding-inline:18px;}.send.svelte-zp5xms .more:where(.svelte-zp5xms) {border-radius:0 var(--radius-sm) var(--radius-sm) 0;border-left:1px solid color-mix(in srgb, var(--accent-fg) 25%, transparent) !important;padding-inline:6px;display:grid;place-items:center;}.later.svelte-zp5xms {position:absolute;bottom:110%;left:0;z-index:10;width:280px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));padding:6px;display:grid;gap:2px;}.later.svelte-zp5xms > button:where(.svelte-zp5xms) {all:unset;cursor:pointer;display:flex;justify-content:space-between;padding:7px 10px;border-radius:var(--radius-sm);}.later.svelte-zp5xms > button:where(.svelte-zp5xms):hover {background:var(--bg-hover);}.custom.svelte-zp5xms {display:flex;gap:6px;padding:6px 4px 2px;border-top:1px solid var(--border);margin-top:4px;}.custom.svelte-zp5xms input:where(.svelte-zp5xms) {flex:1;min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 8px;font:inherit;}.tool.svelte-zp5xms {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;}.tool.svelte-zp5xms:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-zp5xms:focus-visible, .tb.svelte-zp5xms button:where(.svelte-zp5xms):focus-visible, .link.svelte-zp5xms:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.status.svelte-zp5xms {font-size:0.85em;}\n  @container (max-width: 560px) {.composer.inline.svelte-zp5xms {margin-left:0;} }"
};
function Dt(t, d) {
	R(d, !0), i(t, Et);
	let f = D(d, "c", 7), p = D(d, "inline", 3, !1), g = D(d, "big", 15, !1), v = N(() => f().draft), b = e(!!c(v).cc), x = e(!!c(v).bcc), E = e(null), O = e(void 0), k = e(!1), j = e(""), P = e(!1), F = e(void 0), L, te = N(() => d.mail.accounts.find((e) => e.name === c(v).account)), V = N(() => c(te)?.identities?.filter(Boolean) ?? []), H = N(() => d.mail.accounts.filter((e) => !e.error));
	s(() => {
		c(v).to && c(O)?.focus();
	});
	function W() {
		f().dirty = !0, clearTimeout(L), L = setTimeout(K, 2e3);
	}
	async function K() {
		if (f().dirty && !f().sending && (c(v).body.trim() || c(v).subject.trim() || c(v).to.trim())) {
			f().saving = !0;
			try {
				let e = await d.mail.call("save_draft", { ...c(v) });
				c(v).draft = e.id, f().savedAt = Date.now(), f().dirty = !1, f().error = "";
			} catch (e) {
				f().error = `Not saved: ${e.message}`;
			} finally {
				f().saving = !1;
			}
		}
	}
	function J(e, t = e, n = "text") {
		if (!c(O)) return;
		let { selectionStart: r, selectionEnd: i, value: a } = c(O), o = a.slice(r, i) || n;
		c(v).body = a.slice(0, r) + e + o + t + a.slice(i), W(), requestAnimationFrame(() => {
			c(O).focus(), c(O).setSelectionRange(r + e.length, r + e.length + o.length);
		});
	}
	function ne(e) {
		if (!c(O)) return;
		let { selectionStart: t, selectionEnd: n, value: r } = c(O), i = r.lastIndexOf("\n", t - 1) + 1, a = r.slice(i, n).split("\n").map((t) => e + t).join("\n");
		c(v).body = r.slice(0, i) + a + r.slice(n), W();
	}
	function re() {
		let e = prompt("Link to (address):", "https://");
		e && J("[", `](${e})`, "link text");
	}
	async function se() {
		if (c(E) !== null) {
			_(E, null);
			return;
		}
		try {
			_(E, (await d.mail.call("preview", { body: c(v).body })).html, !0);
		} catch (e) {
			f().error = e.message;
		}
	}
	async function Z(e) {
		for (let t of Array.from(e)) {
			let e = await new Promise((e, n) => {
				let r = new FileReader();
				r.onload = () => e(String(r.result).replace(/^data:[^,]*,/, "")), r.onerror = () => n(r.error), r.readAsDataURL(t);
			});
			c(v).files = [...c(v).files, {
				name: t.name,
				mime: t.type,
				size: t.size,
				data: e
			}];
		}
		W();
	}
	function ce() {
		d.mail.atlas.pick({
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
				c(v).files = [...c(v).files, {
					name: e.split("/").at(-1) ?? e,
					path: e
				}], W();
			}
		});
	}
	function le(e) {
		e.preventDefault(), _(P, !1);
		let t = e.dataTransfer?.getData("text/x-atlas-path") || "";
		if (t) {
			c(v).files = [...c(v).files, {
				name: t.split("/").at(-1) ?? t,
				path: t
			}], W();
			return;
		}
		e.dataTransfer?.files.length && Z(e.dataTransfer.files);
	}
	let ue = (e) => {
		c(v).files = c(v).files.filter((t) => t !== e), W();
	}, de = N(() => c(v).files.reduce((e, t) => e + (t.size ?? 0), 0)), fe = /\b(attached|attachment|attaching|enclosed|ci-joint|pi[eè]ce jointe|adjunto|te adjunto|anexo|allegato|anhang|angeh[aä]ngt)\b/i;
	function pe() {
		if (!c(v).to.trim() && !c(v).cc.trim() && !c(v).bcc.trim()) return f().error = "Who is it for? Fill in To.", !1;
		if (!c(v).subject.trim() && !confirm("Send it without a subject?")) return !1;
		let e = c(v).body.split(/\n\s*>|\nOn .* wrote:/)[0];
		return !(fe.test(e) && !c(v).files.length && !c(v).forward && !confirm("The text mentions an attachment, but nothing is attached. Send anyway?"));
	}
	async function me(e = null) {
		if (!pe()) return;
		clearTimeout(L), f().sending = !0;
		let t = {
			...c(v),
			send_at: e
		};
		if (d.mail.closeComposer(f().key), e) {
			try {
				await d.mail.call("send", t), d.mail.toast(`Will be sent ${(/* @__PURE__ */ new Date(e * 1e3)).toLocaleString(void 0, {
					weekday: "short",
					day: "numeric",
					month: "short",
					hour: "2-digit",
					hourCycle: "h23",
					minute: "2-digit"
				})}`, "success"), d.mail.later();
			} catch (e) {
				Q(e);
			}
			return;
		}
		let n = Number(X(d.mail.atlas, "undo_send", 10)) * 1e3, r = !1, i = setTimeout(async () => {
			if (!r) try {
				let e = await d.mail.call("send", t, 300);
				e.refused?.length ? d.mail.toast(`Sent, but refused for ${e.refused.map((e) => e.address).join(", ")}`, "error") : d.mail.toast("Sent", "success"), d.mail.later();
			} catch (e) {
				Q(e);
			}
		}, n);
		d.mail.toast("Sending…", "info", {
			until: Date.now() + n,
			undo: async () => {
				r = !0, clearTimeout(i), d.mail.compose({ ...t }, f().inline);
			}
		});
	}
	function Q(e) {
		let t = d.mail.compose({ ...c(v) }, f().inline);
		t.error = `Not sent: ${e.message}`, d.mail.toast(`Not sent: ${e.message}`, "error");
	}
	function he() {
		let e = ee(c(j));
		if (!e || e * 1e3 < Date.now()) {
			f().error = "When? e.g. tomorrow 8, mon 14:00, 2026-11-02 09:00, 3h";
			return;
		}
		_(k, !1), me(e);
	}
	let ge = () => {
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
	async function _e() {
		if ((!f().dirty && !c(v).draft || !c(v).body.trim() && !c(v).subject.trim() || confirm("Discard this message?")) && (clearTimeout(L), d.mail.closeComposer(f().key), c(v).draft)) try {
			await d.mail.call("discard_draft", { id: c(v).draft }), d.mail.later();
		} catch {}
	}
	function ve(e) {
		e.stopPropagation();
		let t = e.ctrlKey || e.metaKey;
		t && e.key === "Enter" ? (e.preventDefault(), me()) : t && e.key.toLowerCase() === "s" ? (e.preventDefault(), f().dirty = !0, K()) : t && e.key.toLowerCase() === "b" && e.target === c(O) ? (e.preventDefault(), J("**")) : t && e.key.toLowerCase() === "i" && e.target === c(O) ? (e.preventDefault(), J("*")) : t && e.key.toLowerCase() === "k" && e.target === c(O) ? (e.preventDefault(), re()) : t && e.shiftKey && e.key.toLowerCase() === "c" ? (e.preventDefault(), _(b, !0)) : t && e.shiftKey && e.key.toLowerCase() === "b" ? (e.preventDefault(), _(x, !0)) : e.key === "Escape" && !p() && (e.preventDefault(), K(), d.mail.closeComposer(f().key));
	}
	function ye() {
		c(O) && (c(O).style.height = "auto", c(O).style.height = `${Math.min(Math.max(c(O).scrollHeight, p() ? 120 : 220), g() ? 2e3 : 520)}px`);
	}
	s(() => {
		c(v).body, ye();
	});
	var $ = Tt();
	let be;
	var xe = q($), Se = (e) => {
		var t = st(), r = q(t), i = T(r, !0), a = w(r, 4), s = q(a);
		I(s, {
			name: "layout",
			size: 15
		}), G(a);
		var l = w(a, 2), u = q(l);
		I(u, {
			name: "x",
			size: 15
		}), G(l), G(t), C(() => {
			m(i, c(v).subject || (c(v).reply_to ? "Reply" : c(v).forward ? "Forward" : "New message")), y(a, "title", g() ? "Smaller" : "Full size");
		}), n("click", a, () => g(!g())), n("click", l, () => {
			K(), d.mail.closeComposer(f().key);
		}), o(e, t);
	};
	z(xe, (e) => {
		p() || e(Se);
	});
	var Ce = w(xe, 2), we = q(Ce), Te = (e) => {
		var t = lt(), i = w(q(t), 2);
		B(i, 21, () => c(H), (e) => e.name, (e, t) => {
			var n = l(), r = u(n);
			B(r, 16, () => c(t).identities?.length ? c(t).identities : [c(t).from ?? c(t).user ?? c(t).name], (e) => e, (e, n) => {
				var r = ct(), i = T(r), a = {};
				C(() => {
					m(i, `${n ?? ""}${c(H).length > 1 ? ` · ${c(t).name}` : ""}`), a !== (a = `${c(t).name}\u0000${n === c(t).from ? "" : n}`) && (r.value = r.__value = a);
				}), o(e, r);
			}), o(e, n);
		}), G(i);
		var a;
		r(i), G(t), C(() => {
			a !== (a = `${c(v).account}\u0000${c(v).from}`) && (i.value = i.__value = a, ae(i, a));
		}), n("change", i, (e) => {
			let [t, n] = e.currentTarget.value.split("\0");
			c(v).account = t, c(v).from = n, W();
		}), o(e, t);
	};
	z(we, (e) => {
		(c(H).length > 1 || c(V).length > 1) && e(Te);
	});
	var Ee = w(we, 2), De = q(Ee), Oe = q(De);
	{
		let e = N(() => !c(v).to && !p());
		ot(Oe, {
			get atlas() {
				return d.mail.atlas;
			},
			label: "To",
			get autofocus() {
				return c(e);
			},
			get value() {
				return c(v).to;
			},
			set value(e) {
				c(v).to = e;
			}
		});
	}
	G(De);
	var ke = w(De, 2), Ae = (e) => {
		var t = ut();
		n("click", t, () => _(b, !0)), o(e, t);
	};
	z(ke, (e) => {
		c(b) || e(Ae);
	});
	var je = w(ke, 2), Me = (e) => {
		var t = dt();
		n("click", t, () => _(x, !0)), o(e, t);
	};
	z(je, (e) => {
		c(x) || e(Me);
	}), G(Ee);
	var Ne = w(Ee, 2), Pe = (e) => {
		ot(e, {
			get atlas() {
				return d.mail.atlas;
			},
			label: "Cc",
			get value() {
				return c(v).cc;
			},
			set value(e) {
				c(v).cc = e;
			}
		});
	};
	z(Ne, (e) => {
		c(b) && e(Pe);
	});
	var Fe = w(Ne, 2), Ie = (e) => {
		ot(e, {
			get atlas() {
				return d.mail.atlas;
			},
			label: "Bcc",
			get value() {
				return c(v).bcc;
			},
			set value(e) {
				c(v).bcc = e;
			}
		});
	};
	z(Fe, (e) => {
		c(x) && e(Ie);
	});
	var Le = w(Fe, 2), Re = (e) => {
		var t = ft();
		oe(t), n("input", t, W), A(t, () => c(v).subject, (e) => c(v).subject = e), o(e, t);
	};
	z(Le, (e) => {
		(!p() || !c(v).reply_to) && e(Re);
	}), G(Ce);
	var ze = w(Ce, 2), Be = q(ze), Ve = w(Be, 2), He = w(Ve, 2), Ue = w(He, 2), We = q(Ue);
	I(We, {
		name: "open",
		size: 14
	}), G(Ue);
	var Ge = w(Ue, 2), Ke = w(Ge, 2), qe = w(Ke, 2), Je = w(qe, 2), Ye = q(Je);
	Ye.textContent = "<>", G(Je);
	var Xe = w(Je, 4);
	let Ze;
	var Qe = T(Xe, !0);
	G(ze);
	var $e = w(ze, 2), et = (e) => {
		var t = pt();
		h(t, () => c(E), !0), G(t), o(e, t);
	}, tt = (e) => {
		var t = mt();
		U(t), ie(t, (e) => _(O, e), () => c(O)), C(() => y(t, "placeholder", c(v).reply_to ? "Your reply…" : "Write… (Markdown: **bold**, *italic*, - lists, > quotes)")), n("input", t, W), A(t, () => c(v).body, (e) => c(v).body = e), o(e, t);
	};
	z($e, (e) => {
		c(E) === null ? e(tt, -1) : e(et);
	});
	var nt = w($e, 2), rt = (e) => {
		var t = yt(), r = q(t);
		B(r, 17, () => c(v).files, (e) => e.name + (e.path ?? "") + (e.from?.join() ?? ""), (e, t) => {
			var r = _t(), i = q(r);
			I(i, {
				name: "attach",
				size: 13
			});
			var a = w(i), s = T(a, !0), l = w(a), u = (e) => {
				var n = ht(), r = T(n, !0);
				C((e) => m(r, e), [() => M(c(t).size)]), o(e, n);
			};
			z(l, (e) => {
				c(t).size && e(u);
			});
			var d = w(l), f = (e) => {
				var t = gt();
				o(e, t);
			};
			z(d, (e) => {
				c(t).from && e(f);
			});
			var p = w(d);
			G(r), C(() => {
				m(s, c(t).name), y(p, "aria-label", `Remove ${c(t).name}`);
			}), n("click", p, () => ue(c(t))), o(e, r);
		});
		var i = w(r, 2), a = (e) => {
			var t = vt(), n = T(t);
			C((e) => m(n, `${e ?? ""}: most servers take about 25 MB`), [() => M(c(de))]), o(e, t);
		};
		z(i, (e) => {
			c(de) > 20971520 && e(a);
		}), G(t), o(e, t);
	};
	z(nt, (e) => {
		c(v).files.length && e(rt);
	});
	var it = w(nt, 2), at = (e) => {
		var t = bt(), n = T(t, !0);
		C(() => m(n, f().error)), o(e, t);
	};
	z(it, (e) => {
		f().error && e(at);
	});
	var Dt = w(it, 2), Ot = (e) => {
		var t = xt();
		o(e, t);
	};
	z(Dt, (e) => {
		c(P) && e(Ot);
	});
	var kt = w(Dt, 2), At = q(kt), jt = q(At), Mt = w(jt, 2), Nt = q(Mt);
	I(Nt, {
		name: "down",
		size: 14
	}), G(Mt);
	var Pt = w(Mt, 2), Ft = (e) => {
		var t = Ct(), r = q(t);
		B(r, 17, ge, (e) => e.label, (e, t) => {
			var r = St(), i = q(r, !0), a = w(i), s = T(a, !0);
			G(r), C((e) => {
				m(i, c(t).label), m(s, e);
			}, [() => (/* @__PURE__ */ new Date(c(t).at * 1e3)).toLocaleString(void 0, {
				weekday: "short",
				hour: "2-digit",
				hourCycle: "h23",
				minute: "2-digit"
			})]), n("click", r, () => {
				_(k, !1), me(c(t).at);
			}), o(e, r);
		});
		var i = w(r, 2), a = q(i);
		oe(a);
		var s = w(a);
		G(i), G(t), n("keydown", a, (e) => {
			e.key === "Enter" && (e.preventDefault(), he());
		}), A(a, () => c(j), (e) => _(j, e)), n("click", s, he), o(e, t);
	};
	z(Pt, (e) => {
		c(k) && e(Ft);
	}), G(At);
	var It = w(At, 2), Lt = q(It);
	I(Lt, { name: "attach" }), G(It);
	var Rt = w(It, 2), zt = q(Rt);
	I(zt, { name: "note" }), G(Rt);
	var Bt = w(Rt, 2);
	ie(Bt, (e) => _(F, e), () => c(F));
	var Vt = w(Bt, 2), Ht = T(Vt, !0), Ut = w(Vt, 4), Wt = (e) => {
		var t = wt(), r = q(t);
		I(r, {
			name: "open",
			size: 15
		}), G(t), n("click", t, () => {
			f().inline = !1;
		}), o(e, t);
	};
	z(Ut, (e) => {
		p() && e(Wt);
	});
	var Gt = w(Ut, 2), Kt = q(Gt);
	I(Kt, { name: "trash" }), G(Gt), G(kt), G($), C((e) => {
		be = a($, 1, "composer svelte-zp5xms", null, be, {
			inline: p(),
			over: c(P)
		}), y($, "aria-label", c(v).reply_to ? "Reply" : c(v).forward ? "Forward" : "New message"), Ze = a(Xe, 1, "svelte-zp5xms", null, Ze, { on: c(E) !== null }), m(Qe, c(E) === null ? "Preview" : "Edit"), jt.disabled = f().sending, y(Mt, "aria-expanded", c(k)), m(Ht, e);
	}, [() => f().saving ? "Saving…" : f().savedAt ? `Draft saved ${new Date(f().savedAt).toLocaleTimeString(void 0, {
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	})}` : ""]), n("keydown", $, ve), S("dragover", $, (e) => {
		e.preventDefault(), _(P, !0);
	}), S("dragleave", $, (e) => {
		e.currentTarget === e.target && _(P, !1);
	}), S("drop", $, le), n("click", Be, () => J("**")), n("click", Ve, () => J("*")), n("click", He, () => J("~~")), n("click", Ue, re), n("click", Ge, () => ne("- ")), n("click", Ke, () => ne("1. ")), n("click", qe, () => ne("> ")), n("click", Je, () => J("`")), n("click", Xe, se), n("click", jt, () => me()), n("click", Mt, () => _(k, !c(k))), n("click", It, () => c(F)?.click()), n("click", Rt, ce), n("change", Bt, (e) => {
		e.currentTarget.files && Z(e.currentTarget.files), e.currentTarget.value = "";
	}), n("click", Gt, _e), o(t, $), Y();
}
Z([
	"keydown",
	"click",
	"change",
	"input"
]);
//#endregion
//#region plugins/stable/email/ui/src/Reader.svelte
var Ot = f("<div class=\"loading svelte-j5oobt\"><div class=\"bar svelte-j5oobt\"></div><div class=\"bar short svelte-j5oobt\"></div><div class=\"bar svelte-j5oobt\"></div></div>"), kt = f("<div class=\"atlas-empty\"><p> </p><button class=\"atlas-btn\">Try again</button></div>"), At = f("<button class=\"tool svelte-j5oobt\" title=\"Back to the list (u)\"><!></button>"), jt = f("<button role=\"menuitem\" class=\"svelte-j5oobt\">Open the note</button>"), Mt = f("<button role=\"menuitem\" class=\"svelte-j5oobt\">Unsubscribe</button>"), Nt = f("<div class=\"menu svelte-j5oobt\" role=\"menu\" tabindex=\"-1\"><!> <button role=\"menuitem\" class=\"svelte-j5oobt\">Mark important</button> <button role=\"menuitem\" class=\"svelte-j5oobt\">Not important…</button> <!> <button role=\"menuitem\" class=\"svelte-j5oobt\">Make a task</button> <button role=\"menuitem\" class=\"svelte-j5oobt\">Expand all (;)</button></div>"), Pt = f("<span class=\"chip svelte-j5oobt\"> </span>"), Ft = f("<button class=\"link svelte-j5oobt\">Unsubscribe</button>"), It = f("<span class=\"addr svelte-j5oobt\"> </span>"), Lt = f("<span class=\"snip svelte-j5oobt\"> </span>"), Rt = f("<span> </span>"), zt = f("<button class=\"atlas-btn\">Edit the draft</button>"), Bt = f("<button class=\"mini svelte-j5oobt\" title=\"Reply (r)\"><!></button> <button class=\"mini svelte-j5oobt\" title=\"Reply all (a)\"><!></button> <button class=\"mini svelte-j5oobt\" title=\"Forward (f)\"><!></button>", 1), Vt = f("<div class=\"atlas-notice error\"> </div>"), Ht = f("<div class=\"remote svelte-j5oobt\" role=\"status\"><!> <span> </span> <button class=\"link svelte-j5oobt\">Show</button> <button class=\"link svelte-j5oobt\"> </button></div>"), Ut = f("<div class=\"fwd svelte-j5oobt\"><div class=\"fwdhead svelte-j5oobt\"><b>Forwarded:</b> </div> <!></div>"), Wt = f("<div class=\"file svelte-j5oobt\"><button class=\"fopen svelte-j5oobt\" title=\"Open in Atlas\"><!><span class=\"fname svelte-j5oobt\"> </span><span class=\"faint svelte-j5oobt\"> </span></button> <button class=\"mini svelte-j5oobt\" title=\"Save into the vault…\"><!></button></div>"), Gt = f("<div class=\"files svelte-j5oobt\"></div>"), Kt = f("<!> <!> <!> <!> <!>", 1), qt = f("<div class=\"loading svelte-j5oobt\"><div class=\"bar svelte-j5oobt\"></div></div>"), Jt = f("<div class=\"detail svelte-j5oobt\"><div class=\"to svelte-j5oobt\" role=\"presentation\"><!> <!> <span class=\"faint svelte-j5oobt\"> </span> <span class=\"grow svelte-j5oobt\"></span> <!></div> <!></div>"), Yt = f("<article><button class=\"head svelte-j5oobt\"><span class=\"avatar svelte-j5oobt\"> </span> <span class=\"from svelte-j5oobt\"><b class=\"svelte-j5oobt\"> </b><!></span> <!> <span class=\"when svelte-j5oobt\"><!> </span></button> <!></article>"), Xt = f("<div class=\"quick svelte-j5oobt\"><button class=\"atlas-btn svelte-j5oobt\"><!> Reply</button> <button class=\"atlas-btn svelte-j5oobt\"><!> Reply all</button> <button class=\"atlas-btn svelte-j5oobt\"><!> Forward</button></div>"), Zt = f("<header class=\"top svelte-j5oobt\"><div class=\"tools svelte-j5oobt\" role=\"toolbar\" aria-label=\"Conversation actions\"><!> <button class=\"tool svelte-j5oobt\" title=\"Archive (e)\"><!></button> <button class=\"tool svelte-j5oobt\"><!></button> <button class=\"tool svelte-j5oobt\"><!></button> <span class=\"sep svelte-j5oobt\"></span> <button class=\"tool svelte-j5oobt\" title=\"Mark unread (⇧U)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Snooze (h)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Move to (v)\"><!></button> <button class=\"tool svelte-j5oobt\" title=\"Label (l)\"><!></button> <span class=\"grow svelte-j5oobt\"></span> <button><!></button> <div class=\"menu-wrap svelte-j5oobt\"><button class=\"tool svelte-j5oobt\" title=\"More\"><!></button> <!></div></div> <h2 class=\"subject svelte-j5oobt\"> <button><!></button></h2> <div class=\"meta svelte-j5oobt\"><!> <span class=\"faint svelte-j5oobt\"> </span> <!></div></header> <div class=\"cards svelte-j5oobt\"></div> <div class=\"answer svelte-j5oobt\"><!></div>", 1), Qt = f("<div class=\"atlas-empty nothing svelte-j5oobt\"><!> <p class=\"svelte-j5oobt\"> </p> <p class=\"faint svelte-j5oobt\">j / k to move, Enter to open, c to write, ? for every key.</p></div>"), $t = f("<section class=\"reader svelte-j5oobt\" aria-label=\"The conversation\"><!></section>"), en = {
	hash: "svelte-j5oobt",
	code: ".reader.svelte-j5oobt {height:100%;overflow-y:auto;display:flex;flex-direction:column;box-sizing:border-box;}.top.svelte-j5oobt {position:sticky;top:0;z-index:2;background:var(--bg);padding:8px 20px 10px;border-bottom:1px solid var(--border);display:grid;gap:6px;}.tools.svelte-j5oobt {display:flex;align-items:center;gap:2px;margin-left:-6px;}.tool.svelte-j5oobt {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);min-width:24px;min-height:24px;display:grid;place-items:center;}.tool.svelte-j5oobt:hover {background:var(--bg-hover);color:var(--text);}.tool.on.svelte-j5oobt {color:var(--accent);}.tool.svelte-j5oobt:focus-visible, .head.svelte-j5oobt:focus-visible, .mini.svelte-j5oobt:focus-visible, .fopen.svelte-j5oobt:focus-visible, .star.svelte-j5oobt:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.sep.svelte-j5oobt {width:1px;height:18px;background:var(--border-strong);margin:0 4px;}.grow.svelte-j5oobt {flex:1;}.subject.svelte-j5oobt {margin:0;font-size:1.32em;line-height:1.3;font-weight:600;color:var(--heading);display:flex;gap:8px;align-items:flex-start;overflow-wrap:anywhere;}.star.svelte-j5oobt {all:unset;cursor:pointer;color:var(--text-faint);padding:3px;border-radius:var(--radius-sm);margin-top:1px;}.star.on.svelte-j5oobt {color:var(--yellow);}.meta.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:0.88em;}.chip.svelte-j5oobt {font-size:0.9em;padding:0 7px;border-radius:999px;background:hsl(var(--h) 60% 50% / 0.16);}.faint.svelte-j5oobt {color:var(--text-faint);}.link.svelte-j5oobt {all:unset;cursor:pointer;color:var(--accent);}.link.svelte-j5oobt:hover {text-decoration:underline;}.menu-wrap.svelte-j5oobt {position:relative;}.menu.svelte-j5oobt {position:absolute;right:0;top:100%;z-index:5;min-width:200px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, var(--shadow-sm));padding:4px;display:grid;}.menu.svelte-j5oobt button:where(.svelte-j5oobt) {all:unset;cursor:pointer;padding:7px 10px;border-radius:var(--radius-sm);}.menu.svelte-j5oobt button:where(.svelte-j5oobt):hover {background:var(--bg-hover);}.cards.svelte-j5oobt {padding:12px 16px;display:grid;gap:8px;}.card.svelte-j5oobt {border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-alt);overflow:hidden;}.card.open.svelte-j5oobt {background:var(--bg);box-shadow:var(--shadow-sm);}.card.draft.svelte-j5oobt {border-color:color-mix(in srgb, var(--red) 40%, transparent);}.head.svelte-j5oobt {all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;min-width:0;}.head.svelte-j5oobt:hover {background:var(--bg-hover);}.avatar.svelte-j5oobt {flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);}.from.svelte-j5oobt {display:flex;gap:8px;align-items:baseline;min-width:0;flex:0 1 auto;white-space:nowrap;}.unread.svelte-j5oobt .from:where(.svelte-j5oobt) b:where(.svelte-j5oobt) {color:var(--heading);}.addr.svelte-j5oobt {color:var(--text-faint);font-size:0.86em;overflow:hidden;text-overflow:ellipsis;}.snip.svelte-j5oobt {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);}.when.svelte-j5oobt {margin-left:auto;flex:none;color:var(--text-muted);font-size:0.85em;display:flex;gap:5px;align-items:center;}.detail.svelte-j5oobt {padding:0 16px 14px 54px;display:grid;gap:10px;}.to.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;font-size:0.86em;color:var(--text-muted);}.mini.svelte-j5oobt {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;}.mini.svelte-j5oobt:hover {background:var(--bg-hover);color:var(--text);}.remote.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;padding:7px 10px;border-radius:var(--radius-sm);background:var(--bg-hover);font-size:0.86em;color:var(--text-muted);}.fwd.svelte-j5oobt {border-left:3px solid var(--border-strong);padding-left:12px;display:grid;gap:6px;}.fwdhead.svelte-j5oobt {font-size:0.86em;color:var(--text-muted);}.files.svelte-j5oobt {display:flex;flex-wrap:wrap;gap:8px;}.file.svelte-j5oobt {display:flex;align-items:center;border:1px solid var(--border-strong);border-radius:var(--radius);background:var(--bg-alt);}.fopen.svelte-j5oobt {all:unset;cursor:pointer;display:flex;gap:8px;align-items:center;padding:7px 10px;max-width:280px;}.fopen.svelte-j5oobt:hover {color:var(--accent);}.fname.svelte-j5oobt {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}.fopen.svelte-j5oobt .faint:where(.svelte-j5oobt) {white-space:nowrap;flex:none;font-size:0.86em;}.answer.svelte-j5oobt {padding:4px 16px 24px 16px;}.quick.svelte-j5oobt {display:flex;gap:8px;flex-wrap:wrap;padding-left:38px;}.quick.svelte-j5oobt .atlas-btn:where(.svelte-j5oobt) {display:inline-flex;gap:6px;align-items:center;}.nothing.svelte-j5oobt {margin:auto;display:grid;justify-items:center;gap:6px;color:var(--text-faint);text-align:center;padding:40px;}.nothing.svelte-j5oobt p:where(.svelte-j5oobt) {margin:0;}.loading.svelte-j5oobt {padding:24px;display:grid;gap:12px;}.bar.svelte-j5oobt {height:12px;border-radius:4px;background:var(--bg-hover);}.bar.short.svelte-j5oobt {width:40%;}\n  @container (max-width: 560px) {.detail.svelte-j5oobt {padding-left:14px;}.quick.svelte-j5oobt {padding-left:0;}.top.svelte-j5oobt {padding:6px 12px 8px;}.cards.svelte-j5oobt {padding:8px;} }"
};
function tn(r, d) {
	R(d, !0), i(r, en);
	let f = D(d, "narrow", 3, !1), p = N(() => d.mail.open), h = e(E([])), g = e(E([])), v = e(!1), x = -1;
	s(() => {
		if (!c(p) || c(p).thread === x) return;
		x = c(p).thread;
		let e = c(p).messages.at(-1);
		_(h, c(p).messages.filter((t) => !t.seen || t.draft || t === e).map((e) => e.id), !0), _(g, [], !0);
	});
	function A(e) {
		c(p) && _(h, e ? c(p).messages.map((e) => e.id) : [c(p).messages.at(-1).id], !0);
	}
	let ee = (e) => _(h, c(h).includes(e) ? c(h).filter((t) => t !== e) : [...c(h), e], !0), j = N(() => d.mail.own), P = (e) => e.map((e) => c(j).includes(e.addr.toLowerCase()) ? "me" : e.name || e.addr).join(", "), F = e(E([]));
	function te(e, t, n) {
		let r = `${t}:${n}`;
		return e.length <= 4 || c(F).includes(r) ? P(e) : `${P(e.slice(0, 3))} and ${e.length - 3} more`;
	}
	let U = N(() => d.mail.composers.find((e) => e.inline)), J = N(() => c(p) ? d.mail.rows.find((e) => e.thread === c(p).thread) : void 0), re = N(() => !!c(p)?.messages.some((e) => e.flagged)), X = N(() => c(p)?.messages.findLast((e) => e.unsubscribe)?.unsubscribe ? c(p)?.messages.findLast((e) => e.unsubscribe) : void 0), ie = N(() => c(p)?.messages.at(-1)?.folder_role ?? null);
	async function ae(e, t, n = !0) {
		try {
			let r = await d.mail.call("attachment", {
				id: e.id,
				part: t.part,
				name: t.name
			});
			d.mail.atlas.open(r.path, void 0, { beside: n });
		} catch (e) {
			d.mail.toast(`Cannot open ${t.name}: ${e.message}`, "error");
		}
	}
	async function oe(e, t) {
		let n = prompt(`Save ${t.name} into which vault folder?`, "attachments");
		if (n) try {
			let r = await d.mail.call("attachment", {
				id: e.id,
				part: t.part,
				name: t.name,
				to: n
			});
			d.mail.toast(`Saved ${r.path}`, "success", { action: {
				label: "Open",
				run: () => d.mail.atlas.open(r.path, void 0, { beside: !0 })
			} });
		} catch (e) {
			d.mail.toast(`Cannot save ${t.name}: ${e.message}`, "error");
		}
	}
	async function se(e) {
		let t = e.from[0]?.addr;
		t && (await d.mail.call("allow_remote", { sender: t }), _(g, [...c(g), ...c(p).messages.filter((e) => e.from[0]?.addr === t).map((e) => e.id)], !0), d.mail.toast(`Pictures from ${t} are shown from now on`));
	}
	async function Z() {
		if (c(X) && confirm(`Unsubscribe from ${c(X).from[0]?.name || c(X).from[0]?.addr}?`)) try {
			let e = await d.mail.call("unsubscribe", { id: c(X).id });
			e.open ? window.open(e.open, "_blank") : d.mail.toast(e.done === "mail" ? "Unsubscribe mail sent" : "Unsubscribed", "success");
		} catch (e) {
			d.mail.toast(`Could not unsubscribe: ${e.message}`, "error");
		}
	}
	let ce = (e) => e.startsWith("image/") ? "image" : e === "text/calendar" ? "calendar" : "attach";
	var le = { expandAll: A }, ue = $t(), de = q(ue), fe = (e) => {
		var t = Ot();
		o(e, t);
	}, pe = (e) => {
		var t = kt(), r = q(t), i = T(r, !0), a = w(r);
		G(t), C(() => m(i, d.mail.readError)), n("click", a, () => d.mail.openId && d.mail.read(d.mail.openId)), o(e, t);
	}, me = (e) => {
		var r = Zt(), i = u(r), s = q(i), x = q(s), E = (e) => {
			var t = At(), r = q(t);
			I(r, { name: "back" }), G(t), n("click", t, function(...e) {
				d.onback?.apply(this, e);
			}), o(e, t);
		};
		z(x, (e) => {
			f() && e(E);
		});
		var D = w(x, 2), P = q(D);
		I(P, { name: "archive" }), G(D);
		var R = w(D, 2), Y = q(R);
		I(Y, { name: "trash" }), G(R);
		var le = w(R, 2), ue = q(le);
		I(ue, { name: "spam" }), G(le);
		var de = w(le, 4), fe = q(de);
		I(fe, { name: "unread" }), G(de);
		var pe = w(de, 2), me = q(pe);
		I(me, { name: "clock" }), G(pe);
		var Q = w(pe, 2), he = q(Q);
		I(he, { name: "folder" }), G(Q);
		var ge = w(Q, 2), _e = q(ge);
		I(_e, { name: "label" }), G(ge);
		var ve = w(ge, 4);
		let ye;
		var $ = q(ve);
		I($, { name: "note" }), G(ve);
		var be = w(ve, 2), xe = q(be), Se = q(xe);
		I(Se, { name: "more" }), G(xe);
		var Ce = w(xe, 2), we = (e) => {
			var t = Nt(), r = q(t), i = (e) => {
				var t = jt();
				n("click", t, () => {
					_(v, !1), d.mail.atlas.open(c(p).saved, void 0, { beside: !0 });
				}), o(e, t);
			};
			z(r, (e) => {
				c(p).saved && e(i);
			});
			var a = w(r, 2), s = w(a, 2), l = w(s, 2), u = (e) => {
				var t = Mt();
				n("click", t, () => {
					_(v, !1), Z();
				}), o(e, t);
			};
			z(l, (e) => {
				c(X) && e(u);
			});
			var f = w(l, 2), m = w(f, 2);
			G(t), S("mouseleave", t, () => _(v, !1)), n("click", a, () => {
				_(v, !1), d.mail.importance(!0);
			}), n("click", s, () => {
				_(v, !1), d.mail.importance(!1);
			}), n("click", f, () => {
				_(v, !1), d.mail.atlas.capture(`- [ ] ${c(p).subject} (mail from ${V(c(p).messages.at(-1)?.from[0], c(j))})`), d.mail.toast("Added a task to today's log");
			}), n("click", m, () => {
				_(v, !1), A(!0);
			}), o(e, t);
		};
		z(Ce, (e) => {
			c(v) && e(we);
		}), G(be), G(s);
		var Te = w(s, 2), Ee = q(Te), De = w(Ee);
		let Oe;
		var ke = q(De);
		I(ke, {
			name: "star",
			size: 18,
			get filled() {
				return c(re);
			}
		}), G(De), G(Te);
		var Ae = w(Te, 2), je = q(Ae), Me = (e) => {
			var t = l(), n = u(t);
			B(n, 16, () => c(J).labels, (e) => e, (e, t) => {
				var n = Pt();
				let r;
				var i = T(n, !0);
				C((e, t) => {
					r = b(n, "", r, { "--h": e }), m(i, t);
				}, [() => W(t), () => t.replace(/^\$/, "")]), o(e, n);
			}), o(e, t);
		};
		z(je, (e) => {
			c(J) && e(Me);
		});
		var Ne = w(je, 2), Pe = T(Ne, !0), Fe = w(Ne, 2), Ie = (e) => {
			var t = Ft();
			n("click", t, Z), o(e, t);
		};
		z(Fe, (e) => {
			c(X) && e(Ie);
		}), G(Ae), G(i);
		var Le = w(i, 2);
		B(Le, 21, () => c(p).messages, (e) => e.id, (e, r) => {
			let i = N(() => c(h).includes(c(r).id)), s = N(() => !!c(r).body?.remote_allowed || c(g).includes(c(r).id));
			var l = Yt();
			let f;
			var p = q(l), v = q(p);
			let x;
			var S = T(v, !0), E = w(v, 2), D = q(E), k = T(D, !0), A = w(D), P = (e) => {
				var t = It(), n = T(t, !0);
				C(() => m(n, c(r).from[0]?.addr)), o(e, t);
			};
			z(A, (e) => {
				c(i) && !c(r).draft && e(P);
			}), G(E);
			var R = w(E, 2), U = (e) => {
				var t = Lt(), n = T(t, !0);
				C((e) => m(n, e), [() => c(r).snippet || c(r).body?.text?.slice(0, 160)]), o(e, t);
			};
			z(R, (e) => {
				c(i) || e(U);
			});
			var J = w(R, 2), Y = q(J), re = (e) => {
				I(e, {
					name: "attach",
					size: 13
				});
			};
			z(Y, (e) => {
				c(r).has_attachments && e(re);
			});
			var X = w(Y, 1, !0);
			G(J), G(p);
			var ie = w(p, 2), Z = (e) => {
				var i = Jt(), a = q(i), l = q(a), f = (e) => {
					var t = Rt(), n = T(t);
					C((e) => m(n, `to ${e ?? ""}`), [() => te(c(r).to, c(r).id, "to")]), o(e, t);
				};
				z(l, (e) => {
					c(r).to.length && e(f);
				});
				var p = w(l, 2), h = (e) => {
					var t = Rt(), n = T(t);
					C((e) => m(n, `cc ${e ?? ""}`), [() => te(c(r).cc, c(r).id, "cc")]), o(e, t);
				};
				z(p, (e) => {
					c(r).cc.length && e(h);
				});
				var v = w(p, 2), y = T(v, !0), b = w(v, 4), x = (e) => {
					var t = zt();
					n("click", t, () => d.mail.editDraft(c(r).id)), o(e, t);
				}, S = (e) => {
					var t = Bt(), i = u(t), a = q(i);
					I(a, {
						name: "reply",
						size: 15
					}), G(i);
					var s = w(i, 2), l = q(s);
					I(l, {
						name: "replyall",
						size: 15
					}), G(s);
					var f = w(s, 2), p = q(f);
					I(p, {
						name: "forward",
						size: 15
					}), G(f), n("click", i, () => d.mail.reply("reply", c(r).id)), n("click", s, () => d.mail.reply("all", c(r).id)), n("click", f, () => d.mail.reply("forward", c(r).id)), o(e, t);
				};
				z(b, (e) => {
					c(r).draft ? e(x) : e(S, -1);
				}), G(a);
				var E = w(a, 2), D = (e) => {
					var t = Vt(), n = T(t, !0);
					C(() => m(n, c(r).error)), o(e, t);
				}, k = (e) => {
					var i = Kt(), a = u(i), l = (e) => {
						var t = Ht(), i = q(t);
						I(i, {
							name: "lock",
							size: 14
						});
						var a = w(i, 2), s = T(a), l = w(a, 2), u = w(l, 2), d = T(u);
						G(t), C(() => {
							m(s, `${c(r).body.remote ?? ""} remote picture${c(r).body.remote === 1 ? "" : "s"} blocked (they can tell the sender you read it).`), m(d, `Always from ${c(r).from[0]?.addr ?? ""}`);
						}), n("click", l, () => _(g, [...c(g), c(r).id], !0)), n("click", u, () => se(c(r))), o(e, t);
					};
					z(a, (e) => {
						c(r).body.remote && !c(s) && e(l);
					});
					var f = w(a, 2), p = (e) => {
						$e(e, {
							get mail() {
								return d.mail;
							},
							get id() {
								return c(r).id;
							},
							get invite() {
								return c(r).body.invite;
							}
						});
					};
					z(f, (e) => {
						c(r).body.invite && e(p);
					});
					var h = w(f, 2);
					H(h, {
						get html() {
							return c(r).body.html;
						},
						get plain() {
							return c(r).body.plain;
						},
						get remote() {
							return c(s);
						},
						get dark() {
							return d.dark;
						}
					});
					var v = w(h, 2);
					B(v, 17, () => c(r).body.forwarded, t, (e, t) => {
						var n = Ut(), r = q(n), i = w(q(r));
						G(r);
						var a = w(r, 2);
						H(a, {
							get html() {
								return c(t).html;
							},
							get plain() {
								return c(t).plain;
							},
							get remote() {
								return c(s);
							},
							get dark() {
								return d.dark;
							}
						}), G(n), C((e, n) => m(i, ` ${c(t).subject ?? ""} · ${e ?? ""} · ${n ?? ""}`), [() => c(t).from.map(L).join(", "), () => K(c(t).date)]), o(e, n);
					});
					var y = w(v, 2), b = (e) => {
						var t = Gt();
						B(t, 21, () => c(r).body.attachments, (e) => e.part, (e, t) => {
							var i = Wt(), a = q(i), s = q(a);
							{
								let e = N(() => ce(c(t).mime));
								I(s, { get name() {
									return c(e);
								} });
							}
							var l = w(s), u = T(l, !0), d = w(l), f = T(d, !0);
							G(a);
							var p = w(a, 2), h = q(p);
							I(h, {
								name: "save",
								size: 14
							}), G(p), G(i), C((e) => {
								m(u, c(t).name), m(f, e);
							}, [() => M(c(t).size)]), n("click", a, () => ae(c(r), c(t))), n("click", p, () => oe(c(r), c(t))), o(e, i);
						}), G(t), o(e, t);
					};
					z(y, (e) => {
						c(r).body.attachments.length && e(b);
					}), o(e, i);
				}, A = (e) => {
					var t = qt();
					o(e, t);
				};
				z(E, (e) => {
					c(r).error ? e(D) : c(r).body ? e(k, 1) : e(A, -1);
				}), G(i), C((e) => m(y, e), [() => O(c(r).date)]), n("click", a, () => _(F, [
					...c(F),
					`${c(r).id}:to`,
					`${c(r).id}:cc`
				], !0)), o(e, i);
			};
			z(ie, (e) => {
				c(i) && e(Z);
			}), G(l), C((e, t, n, o, s) => {
				f = a(l, 1, "card svelte-j5oobt", null, f, {
					open: c(i),
					unread: !c(r).seen,
					draft: c(r).draft
				}), y(p, "aria-expanded", c(i)), x = b(v, "", x, { "--h": e }), m(S, t), m(k, n), y(J, "title", o), m(X, s);
			}, [
				() => W(c(r).from[0]?.addr ?? ""),
				() => ne(c(r).from[0]),
				() => c(r).draft ? "Draft" : V(c(r).from[0], c(j)),
				() => O(c(r).date),
				() => K(c(r).date)
			]), n("click", p, () => ee(c(r).id)), o(e, l);
		}), G(Le);
		var Re = w(Le, 2), ze = q(Re), Be = (e) => {
			Dt(e, {
				get mail() {
					return d.mail;
				},
				get c() {
					return c(U);
				},
				inline: !0
			});
		}, Ve = (e) => {
			var t = Xt(), r = q(t), i = q(r);
			I(i, {
				name: "reply",
				size: 15
			}), k(), G(r);
			var a = w(r, 2), s = q(a);
			I(s, {
				name: "replyall",
				size: 15
			}), k(), G(a);
			var c = w(a, 2), l = q(c);
			I(l, {
				name: "forward",
				size: 15
			}), k(), G(c), G(t), n("click", r, () => d.mail.reply("reply")), n("click", a, () => d.mail.reply("all")), n("click", c, () => d.mail.reply("forward")), o(e, t);
		};
		z(ze, (e) => {
			c(U) ? e(Be) : e(Ve, -1);
		}), G(Re), C((e) => {
			y(R, "title", c(ie) === "trash" ? "Delete for good" : "Delete (#)"), y(le, "title", c(ie) === "junk" ? "Not spam" : "Spam (!)"), ye = a(ve, 1, "tool svelte-j5oobt", null, ye, { on: !!c(p).saved }), y(ve, "title", c(p).saved ? `Saved as ${c(p).saved} — save again to add new messages` : "Save as note (⇧N)"), y(xe, "aria-expanded", c(v)), m(Ee, `${(c(p).subject || "(no subject)") ?? ""} `), Oe = a(De, 1, "star svelte-j5oobt", null, Oe, { on: c(re) }), y(De, "title", c(re) ? "Unstar (s)" : "Star (s)"), y(De, "aria-pressed", c(re)), m(Pe, e);
		}, [() => `${c(p).messages.length} message${c(p).messages.length === 1 ? "" : "s"}${c(p).messages.at(-1)?.folder_label ? ` · ${c(p).messages.at(-1)?.folder_label}` : ""}`]), n("click", D, () => d.mail.archive()), n("click", R, () => d.mail.trash()), n("click", le, () => d.mail.spam()), n("click", de, () => d.mail.toggleRead()), n("click", pe, () => d.onpick("snooze")), n("click", Q, () => d.onpick("move")), n("click", ge, () => d.onpick("label")), n("click", ve, () => d.mail.saveNote()), n("click", xe, () => _(v, !c(v))), n("click", De, () => d.mail.toggleStar()), o(e, r);
	}, Q = (e) => {
		var t = Qt(), n = q(t);
		I(n, {
			name: "inbox",
			size: 40
		});
		var r = w(n, 2), i = T(r, !0);
		k(2), G(t), C(() => m(i, d.mail.rows.length ? "Choose a conversation to read it." : "Nothing here.")), o(e, t);
	};
	return z(de, (e) => {
		d.mail.reading && !c(p) ? e(fe) : d.mail.readError ? e(pe, 1) : c(p) ? e(me, 2) : e(Q, -1);
	}), G(ue), o(r, ue), Y(le);
}
Z(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/Toasts.svelte
var nn = f("<button class=\"svelte-1rm31ba\">Undo</button>"), rn = f("<button class=\"svelte-1rm31ba\"> </button>"), an = f("<div><span class=\"text svelte-1rm31ba\"> </span> <!> <!> <button class=\"x svelte-1rm31ba\" aria-label=\"Close\">×</button></div>"), on = f("<div class=\"toasts svelte-1rm31ba\" aria-live=\"polite\"></div>"), sn = {
	hash: "svelte-1rm31ba",
	code: ".toasts.svelte-1rm31ba {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:50;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-1rm31ba {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-1rm31ba-in 120ms var(--ease);}.toast.error.svelte-1rm31ba {background:var(--red);color:#fff;}.text.svelte-1rm31ba {min-width:0;overflow-wrap:anywhere;}button.svelte-1rm31ba {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-1rm31ba button:where(.svelte-1rm31ba) {color:#fff;text-decoration:underline;}button.svelte-1rm31ba:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-1rm31ba:focus-visible {outline:2px solid currentColor;}.x.svelte-1rm31ba {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-1rm31ba-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-1rm31ba { animation: none;} }"
};
function cn(e, t) {
	R(t, !0), i(e, sn);
	var r = on();
	B(r, 21, () => t.mail.toasts, (e) => e.id, (e, r) => {
		var i = an();
		let s;
		var l = q(i), u = T(l, !0), d = w(l, 2), f = (e) => {
			var i = nn();
			n("click", i, async () => {
				t.mail.dismiss(c(r).id), await c(r).undo?.();
			}), o(e, i);
		};
		z(d, (e) => {
			c(r).undo && e(f);
		});
		var p = w(d, 2), h = (e) => {
			var i = rn(), a = T(i, !0);
			C(() => m(a, c(r).action.label)), n("click", i, () => {
				t.mail.dismiss(c(r).id), c(r).action?.run();
			}), o(e, i);
		};
		z(p, (e) => {
			c(r).action && e(h);
		});
		var g = w(p, 2);
		G(i), C(() => {
			s = a(i, 1, "toast svelte-1rm31ba", null, s, {
				error: c(r).kind === "error",
				success: c(r).kind === "success"
			}), y(i, "role", c(r).kind === "error" ? "alert" : "status"), m(u, c(r).text);
		}), n("click", g, () => t.mail.dismiss(c(r).id)), o(e, i);
	}), G(r), o(e, r), Y();
}
Z(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/keys.ts
var ln = (e) => e.targets().length > 0, un = [
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
		when: ln,
		run: (e) => e.archive()
	},
	{
		id: "trash",
		title: "Delete (to Trash)",
		group: "Act",
		keys: "#, delete",
		when: ln,
		run: (e) => e.trash()
	},
	{
		id: "spam",
		title: "Spam / not spam",
		group: "Act",
		keys: "!",
		when: ln,
		run: (e) => e.spam()
	},
	{
		id: "star",
		title: "Star / unstar",
		group: "Act",
		keys: "s",
		when: ln,
		run: (e) => e.toggleStar()
	},
	{
		id: "read",
		title: "Mark read",
		group: "Act",
		keys: "shift+i",
		when: ln,
		run: (e) => e.mark("read", !0)
	},
	{
		id: "unread",
		title: "Mark unread",
		group: "Act",
		keys: "shift+u",
		when: ln,
		run: (e) => e.mark("read", !1)
	},
	{
		id: "toggle-read",
		title: "Read / unread",
		group: "Act",
		keys: "m",
		when: ln,
		run: (e) => e.toggleRead()
	},
	{
		id: "snooze",
		title: "Snooze…",
		group: "Act",
		keys: "h, b",
		when: ln,
		run: (e, t) => t.pick("snooze")
	},
	{
		id: "unsnooze",
		title: "Back to the inbox now (unsnooze)",
		group: "Act",
		when: (e) => e.view.name === "snoozed" && ln(e),
		run: (e) => e.unsnooze()
	},
	{
		id: "move",
		title: "Move to…",
		group: "Act",
		keys: "v",
		when: ln,
		run: (e, t) => t.pick("move")
	},
	{
		id: "label",
		title: "Label…",
		group: "Act",
		keys: "l",
		when: ln,
		run: (e, t) => t.pick("label")
	},
	{
		id: "important",
		title: "Important",
		group: "Act",
		keys: "i",
		when: ln,
		run: (e) => e.importance(!0)
	},
	{
		id: "not-important",
		title: "Not important (moves it out of the inbox)",
		group: "Act",
		keys: "n",
		when: ln,
		run: (e) => e.importance(!1)
	},
	{
		id: "note",
		title: "Save as note",
		group: "Act",
		keys: "shift+n",
		when: ln,
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
function dn(e) {
	let t = (e.key.length, e.key.toLowerCase()), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var fn = new Map(un.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e]))), pn = new Set([...fn.keys()].filter((e) => e.includes(" ")).map((e) => e.split(" ")[0]));
function mn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.split(" ").map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowdown", "↓").replace("arrowup", "↑").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("home", "Home").replace("end", "End").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)).join(" then ")) : [];
}
//#endregion
//#region plugins/stable/email/ui/src/Shortcuts.svelte
var hn = f("<span class=\"or svelte-8ls7cr\">or</span>"), gn = f("<!><kbd class=\"svelte-8ls7cr\"> </kbd>", 1), _n = f("<div class=\"line svelte-8ls7cr\"><span> </span><span class=\"keys svelte-8ls7cr\"></span></div>"), vn = f("<section class=\"svelte-8ls7cr\"><h3 class=\"svelte-8ls7cr\"> </h3> <!></section>"), yn = f("<div class=\"scrim svelte-8ls7cr\" role=\"presentation\"><div class=\"sheet svelte-8ls7cr\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Keyboard shortcuts\" tabindex=\"-1\"><header class=\"svelte-8ls7cr\"><h2 class=\"svelte-8ls7cr\">Keyboard shortcuts</h2><span class=\"faint svelte-8ls7cr\">Ctrl+K finds any command by name</span><button class=\"x svelte-8ls7cr\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-8ls7cr\"></div></div></div>"), bn = {
	hash: "svelte-8ls7cr",
	code: ".scrim.svelte-8ls7cr {position:absolute;inset:0;z-index:60;background:rgba(0, 0, 0, 0.35);display:grid;place-items:center;padding:16px;}.sheet.svelte-8ls7cr {background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-lg);box-shadow:var(--shadow-md, var(--shadow-sm));width:min(980px, 100%);max-height:90%;overflow:auto;padding:18px 22px 22px;}header.svelte-8ls7cr {display:flex;gap:14px;align-items:baseline;margin-bottom:12px;}h2.svelte-8ls7cr {margin:0;font-size:1.15em;}.faint.svelte-8ls7cr {color:var(--text-faint);font-size:0.9em;}.x.svelte-8ls7cr {all:unset;cursor:pointer;margin-left:auto;font-size:1.4em;color:var(--text-muted);padding:0 6px;}.cols.svelte-8ls7cr {columns:3 260px;column-gap:28px;}section.svelte-8ls7cr {break-inside:avoid;margin-bottom:16px;}h3.svelte-8ls7cr {margin:0 0 6px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.line.svelte-8ls7cr {display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:0.92em;}.keys.svelte-8ls7cr {display:flex;gap:4px;align-items:center;flex:none;}.or.svelte-8ls7cr {color:var(--text-faint);font-size:0.8em;}kbd.svelte-8ls7cr {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:5px;border:1px solid var(--border-strong);border-bottom-width:2px;background:var(--bg);}"
};
function xn(e, t) {
	R(t, !0), i(e, bn);
	let r = [...new Set(un.map((e) => e.group))];
	var a = yn(), s = q(a), l = q(s), d = w(q(l), 2);
	G(l);
	var f = w(l, 2);
	B(f, 20, () => r, (e) => e, (e, t) => {
		var n = vn(), r = q(n), i = T(r, !0), a = w(r, 2);
		B(a, 17, () => un.filter((e) => e.group === t && e.keys), (e) => e.id, (e, t) => {
			var n = _n(), r = q(n), i = T(r, !0), a = w(r);
			B(a, 22, () => mn(c(t).keys), (e) => e, (e, t, n) => {
				var r = gn(), i = u(r), a = (e) => {
					var t = hn();
					o(e, t);
				};
				z(i, (e) => {
					c(n) && e(a);
				});
				var s = w(i), l = T(s, !0);
				C(() => m(l, t)), o(e, r);
			}), G(a), G(n), C(() => m(i, c(t).title)), o(e, n);
		}), G(n), C(() => m(i, t)), o(e, n);
	}), G(f), G(s), G(a), n("click", a, function(...e) {
		t.onclose?.apply(this, e);
	}), n("keydown", a, (e) => e.key === "Escape" && t.onclose()), n("click", s, (e) => e.stopPropagation()), n("keydown", s, () => {}), n("click", d, function(...e) {
		t.onclose?.apply(this, e);
	}), o(e, a), Y();
}
Z(["click", "keydown"]);
//#endregion
//#region plugins/stable/email/ui/src/store.svelte.ts
var Sn = 100, Cn = class {
	atlas;
	#e = e(E([]));
	get accounts() {
		return c(this.#e);
	}
	set accounts(e) {
		_(this.#e, e, !0);
	}
	#t = e(E([]));
	get own() {
		return c(this.#t);
	}
	set own(e) {
		_(this.#t, e, !0);
	}
	#n = e(E([]));
	get folders() {
		return c(this.#n);
	}
	set folders(e) {
		_(this.#n, e, !0);
	}
	#r = e(E({}));
	get counts() {
		return c(this.#r);
	}
	set counts(e) {
		_(this.#r, e, !0);
	}
	#i = e(E({
		name: "inbox",
		account: null,
		folder: null,
		label: "Inbox"
	}));
	get view() {
		return c(this.#i);
	}
	set view(e) {
		_(this.#i, e, !0);
	}
	#a = e("");
	get query() {
		return c(this.#a);
	}
	set query(e) {
		_(this.#a, e, !0);
	}
	#o = e("");
	get quick() {
		return c(this.#o);
	}
	set quick(e) {
		_(this.#o, e, !0);
	}
	#s = e("");
	get kind() {
		return c(this.#s);
	}
	set kind(e) {
		_(this.#s, e, !0);
	}
	#c = e(E([]));
	get rows() {
		return c(this.#c);
	}
	set rows(e) {
		_(this.#c, e, !0);
	}
	#l = e(0);
	get total() {
		return c(this.#l);
	}
	set total(e) {
		_(this.#l, e, !0);
	}
	#u = e(0);
	get unread() {
		return c(this.#u);
	}
	set unread(e) {
		_(this.#u, e, !0);
	}
	#d = e(E([]));
	get chips() {
		return c(this.#d);
	}
	set chips(e) {
		_(this.#d, e, !0);
	}
	#f = e(!1);
	get loading() {
		return c(this.#f);
	}
	set loading(e) {
		_(this.#f, e, !0);
	}
	#p = e("");
	get error() {
		return c(this.#p);
	}
	set error(e) {
		_(this.#p, e, !0);
	}
	#m = e(null);
	get cursor() {
		return c(this.#m);
	}
	set cursor(e) {
		_(this.#m, e, !0);
	}
	#h = e(E([]));
	get checked() {
		return c(this.#h);
	}
	set checked(e) {
		_(this.#h, e, !0);
	}
	#g = e(null);
	get open() {
		return c(this.#g);
	}
	set open(e) {
		_(this.#g, e, !0);
	}
	#_ = e(null);
	get openId() {
		return c(this.#_);
	}
	set openId(e) {
		_(this.#_, e, !0);
	}
	#v = e(!1);
	get reading() {
		return c(this.#v);
	}
	set reading(e) {
		_(this.#v, e, !0);
	}
	#y = e("");
	get readError() {
		return c(this.#y);
	}
	set readError(e) {
		_(this.#y, e, !0);
	}
	#b = e(E([]));
	get composers() {
		return c(this.#b);
	}
	set composers(e) {
		_(this.#b, e, !0);
	}
	#x = e(E([]));
	get toasts() {
		return c(this.#x);
	}
	set toasts(e) {
		_(this.#x, e, !0);
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
		return J(this.atlas, e, t, n);
	}
	get split() {
		return X(this.atlas, "split_inbox", !1) && this.view.name === "inbox";
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
			let n = e ? Math.max(Sn, this.rows.length) : Sn, r = await this.call("list", this.params({ limit: n }));
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
				limit: Sn,
				offset: this.rows.length
			}));
			if (e !== this.loadSeq) return;
			let n = new Set(this.rows.map((e) => e.thread)), r = t.rows.filter((e) => !n.has(e.thread));
			(t.rows.length < Sn || !r.length) && (this.ended = !0), r.length && (this.rows = [...this.rows, ...r], this.fillSnippets());
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
		this.cursor = c?.id ?? null, s && (c && X(this.atlas, "after_action", "next") === "next" ? this.read(c.id) : this.close());
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
	trash(e = this.targets()) {
		let t = e.every((e) => e.folder_role === "trash");
		if (!t || confirm(`Delete ${e.length === 1 ? "this conversation" : `${e.length} conversations`} for good? This cannot be undone.`)) return this.leave(e, t ? "Deleted" : "Moved to Trash", (e) => this.call("trash", { ids: e }));
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
		return this.snooze(P()[0].at);
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
}, wn = f("<div class=\"grip v svelte-7si10b\" role=\"separator\" aria-orientation=\"vertical\" aria-label=\"Resize the folders\"></div>"), Tn = f("<aside class=\"side svelte-7si10b\" aria-label=\"Folders\"><!> <!></aside>"), En = f("<button class=\"tool svelte-7si10b\" title=\"Folders\"><!></button>"), Dn = f("<button class=\"tool svelte-7si10b\" aria-label=\"Clear the search\"><!></button>"), On = f("<span class=\"chip svelte-7si10b\"><b class=\"svelte-7si10b\"> </b> </span>"), kn = f("<button class=\"link svelte-7si10b\">Search the servers too ↵</button>"), An = f("<div class=\"chips svelte-7si10b\"><!><!></div>"), jn = f("<div class=\"selbar svelte-7si10b\" role=\"toolbar\" aria-label=\"Checked conversations\"><button class=\"tool svelte-7si10b\" title=\"Uncheck all (Esc)\"><!></button> <b> </b> <span class=\"grow svelte-7si10b\"></span> <button class=\"tool svelte-7si10b\" title=\"Archive (e)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Delete (#)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Mark read (⇧I)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Mark unread (⇧U)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Star (s)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Snooze (h)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Move (v)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Label (l)\"><!></button></div>"), Mn = f("<span class=\"n svelte-7si10b\"> </span>"), Nn = f("<button role=\"tab\"><!> <!></button>"), Pn = f("<div class=\"tabs svelte-7si10b\" role=\"tablist\"></div>"), Fn = f("<div class=\"row2 svelte-7si10b\"><h1 class=\"svelte-7si10b\"> </h1> <span class=\"faint svelte-7si10b\"> </span> <span class=\"grow svelte-7si10b\"></span> <div class=\"seg svelte-7si10b\" role=\"group\" aria-label=\"Show only\"><button>Unread</button> <button>Starred</button> <button>Files</button> <button title=\"Mail where I am on To\">To me</button></div></div> <!>", 1), In = f("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), Ln = f("<p class=\"svelte-7si10b\">Nothing in the index matches.</p><button class=\"atlas-btn\">Search the servers too</button>", 1), Rn = f("<p class=\"svelte-7si10b\">No mail account yet.</p><button class=\"atlas-btn\">Add an account…</button>", 1), zn = f("<p class=\"zero svelte-7si10b\">Inbox zero.</p><p class=\"faint svelte-7si10b\">Nothing to answer. c writes a new message.</p>", 1), Bn = f("<p class=\"faint svelte-7si10b\"> </p>"), Vn = f("<div class=\"empty svelte-7si10b\"><!></div>"), Hn = f("<section class=\"listpane svelte-7si10b\"><header class=\"lhead svelte-7si10b\"><div class=\"row1 svelte-7si10b\"><!> <div class=\"search svelte-7si10b\"><!> <input placeholder=\"Search mail…\" aria-label=\"Search mail\" title=\"Words, or from: to: subject: has:attachment is:unread before: after:\" class=\"svelte-7si10b\"/> <!></div> <button class=\"tool svelte-7si10b\" title=\"Check for new mail (⇧G)\"><!></button> <button class=\"tool svelte-7si10b\" title=\"Layout and density\"><!></button> <button class=\"tool svelte-7si10b\" title=\"All commands (Ctrl+K)\"><!></button></div> <!> <!></header> <!></section>"), Un = f("<div role=\"separator\" aria-label=\"Resize the list\"></div>"), Wn = f("<div class=\"readerpane svelte-7si10b\"><!></div>"), Gn = f("<div><!> <!> <!></div>"), Kn = f("<div class=\"win svelte-7si10b\"><!></div>"), qn = f("<div></div>"), Jn = f("<div class=\"pending svelte-7si10b\"> </div>"), Yn = f("<div><!> <!> <!> <!> <!> <!> <!></div>"), Xn = {
	hash: "svelte-7si10b",
	code: ".mail.svelte-7si10b {position:relative;height:100%;display:flex;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.side.svelte-7si10b {position:relative;flex:none;width:var(--side-w);border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.narrow.svelte-7si10b .side:where(.svelte-7si10b) {width:100%;}.work.svelte-7si10b {flex:1;min-width:0;display:flex;min-height:0;}.work.below.svelte-7si10b {flex-direction:column;}.listpane.svelte-7si10b {flex:none;width:var(--list-w);display:flex;flex-direction:column;min-height:0;min-width:0;border-right:1px solid var(--border);}.below.svelte-7si10b .listpane:where(.svelte-7si10b) {width:auto;height:var(--list-h);border-right:0;border-bottom:1px solid var(--border);}.full.svelte-7si10b .listpane:where(.svelte-7si10b) {flex:1;width:auto;border-right:0;}.readerpane.svelte-7si10b {flex:1;min-width:0;min-height:0;container-type:inline-size;}.grip.svelte-7si10b {flex:none;background:transparent;position:relative;z-index:3;}.grip.v.svelte-7si10b {width:5px;margin:0 -3px;cursor:col-resize;}.grip.h.svelte-7si10b {height:5px;margin:-3px 0;cursor:row-resize;}.side.svelte-7si10b .grip.v:where(.svelte-7si10b) {position:absolute;top:0;bottom:0;right:-3px;margin:0;}.grip.svelte-7si10b:hover {background:var(--accent-soft);}.lhead.svelte-7si10b {flex:none;padding:8px 10px 6px;display:grid;gap:6px;border-bottom:1px solid var(--border);}.row1.svelte-7si10b, .row2.svelte-7si10b, .selbar.svelte-7si10b, .chips.svelte-7si10b {display:flex;align-items:center;gap:6px;min-width:0;}.search.svelte-7si10b {flex:1;min-width:0;display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 6px 0 10px;color:var(--text-faint);}.search.svelte-7si10b:focus-within {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-7si10b input:where(.svelte-7si10b) {all:unset;flex:1;min-width:0;padding:7px 0;color:var(--text);}.search.svelte-7si10b input:where(.svelte-7si10b)::placeholder {color:var(--text-faint);}h1.svelte-7si10b {margin:0;font-size:1.05em;font-weight:650;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:4.5em;}.row2.svelte-7si10b {flex-wrap:wrap;row-gap:4px;}.faint.svelte-7si10b {color:var(--text-faint);font-size:0.86em;white-space:nowrap;}.grow.svelte-7si10b {flex:1;}.seg.svelte-7si10b {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-7si10b button:where(.svelte-7si10b) {all:unset;cursor:pointer;padding:3px 8px;font-size:0.82em;color:var(--text-muted);}.seg.svelte-7si10b button:where(.svelte-7si10b) + button:where(.svelte-7si10b) {border-left:1px solid var(--border);}.seg.svelte-7si10b button:where(.svelte-7si10b):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-7si10b button.on:where(.svelte-7si10b) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.seg.svelte-7si10b button:where(.svelte-7si10b):focus-visible, .tabs.svelte-7si10b button:where(.svelte-7si10b):focus-visible, .tool.svelte-7si10b:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.tabs.svelte-7si10b {display:flex;gap:2px;margin-bottom:-7px;}.tabs.svelte-7si10b button:where(.svelte-7si10b) {all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 12px 7px;color:var(--text-muted);border-bottom:2px solid transparent;font-size:0.92em;}.tabs.svelte-7si10b button:where(.svelte-7si10b):hover {color:var(--text);}.tabs.svelte-7si10b button.on:where(.svelte-7si10b) {color:var(--accent-strong);border-bottom-color:var(--accent);font-weight:600;}.n.svelte-7si10b {font-size:0.8em;padding:0 6px;border-radius:999px;background:var(--accent);color:var(--accent-fg);}.chips.svelte-7si10b {flex-wrap:wrap;}.chip.svelte-7si10b {font-size:0.82em;padding:1px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent-strong);}.chip.svelte-7si10b b:where(.svelte-7si10b) {font-weight:600;margin-right:2px;}.link.svelte-7si10b {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;}.selbar.svelte-7si10b {background:var(--accent-soft);border-radius:var(--radius-sm);padding:2px 4px;}.tool.svelte-7si10b {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-7si10b:hover {background:var(--bg-hover);color:var(--text);}.empty.svelte-7si10b {flex:1;display:grid;align-content:center;justify-items:center;gap:8px;padding:30px;text-align:center;color:var(--text-muted);}.empty.svelte-7si10b p:where(.svelte-7si10b) {margin:0;}.zero.svelte-7si10b {font-size:1.3em;font-weight:600;color:var(--heading);}.windows.svelte-7si10b {position:absolute;right:16px;bottom:0;z-index:40;display:flex;gap:12px;align-items:flex-end;max-width:calc(100% - 32px);}.win.svelte-7si10b {width:min(560px, calc(100vw - 32px));max-height:85%;overflow:auto;border-radius:var(--radius) var(--radius) 0 0;box-shadow:var(--shadow-md, 0 8px 30px rgba(0, 0, 0, 0.3));}.windows.big.svelte-7si10b {inset:12px;right:12px;bottom:12px;}.windows.big.svelte-7si10b .win:where(.svelte-7si10b) {width:100%;height:100%;max-height:none;border-radius:var(--radius);}.pending.svelte-7si10b {position:absolute;right:16px;top:12px;z-index:30;font:600 0.9em var(--font-mono);padding:4px 10px;border-radius:var(--radius-sm);background:var(--bg-elev);border:1px solid var(--border-strong);}\n  @container (max-width: 900px) {.seg.svelte-7si10b {display:none;} }"
};
function Zn(t, r) {
	R(r, !0), i(t, Xn);
	let s = new Cn(r.atlas), l = (e, t) => {
		try {
			return localStorage.getItem(`atlas-email-${e}`) ?? t;
		} catch {
			return t;
		}
	}, f = (e, t) => {
		try {
			localStorage.setItem(`atlas-email-${e}`, t);
		} catch {}
	}, p = e(E(l("layout", String(r.atlas.plugin.settings.layout ?? "three")))), h = e(l("density", String(r.atlas.plugin.settings.density ?? "comfortable")) === "compact"), g = e(E(Number(l("side-w", "232")))), v = e(E(Number(l("list-w", "420")))), x = e(E(Number(l("list-h", "320")))), D = e(1200), O = e("list"), M = e(!1), L = e(!1), te = e(document.documentElement.dataset.theme !== "light"), V = e(void 0), H = e(void 0), U = e(""), W = e(!1), K = N(() => c(D) < 700), J = N(() => !c(K) && c(D) < 1100), ne = N(() => c(D) - (c(J) ? 56 : c(g)) - c(v) >= 460), X = N(() => c(K) || c(p) === "three" && !c(ne) ? "full" : c(p)), ae = N(() => c(X) !== "full" || s.openId !== null || s.reading), Z = N(() => s.composers.filter((e) => !e.inline));
	function ce() {
		if (c(M) || c(L)) {
			_(M, _(L, !1), !0);
			return;
		}
		if (s.checked.length) {
			s.checked = [];
			return;
		}
		if (s.openId !== null) {
			s.close(), _(O, "list");
			return;
		}
		if (s.query) {
			_(U, ""), s.search("");
			return;
		}
	}
	function le(e) {
		if (e.draft && e.count === 1) {
			s.editDraft(e.id);
			return;
		}
		s.read(e.id), c(K) && _(O, "reader");
	}
	let ue = () => s.targets()[0]?.account ?? s.view.account ?? s.accounts[0]?.name;
	function de(e) {
		if (e === "snooze") r.atlas.pick({
			placeholder: "Snooze until… (tomorrow 9, mon 14:00, 3h, 2026-11-02 08:00)",
			tag: "Snooze",
			items: P().map((e) => ({
				value: String(e.at),
				title: e.label
			})),
			typed: (e) => {
				let t = ee(e);
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
				let n = t ? ee(e) : Number(e);
				n && s.snooze(n);
			}
		});
		else if (e === "move" || e === "go") {
			let t = e === "move" ? ue() : null, n = s.folders.filter((e) => (!t || e.account === t) && e.role !== "other" && e.role !== "view" && e.role !== "all");
			r.atlas.pick({
				placeholder: e === "move" ? "Move to which folder?" : "Go to which folder?",
				tag: e === "move" ? "Move" : "Go to",
				items: n.map((e) => ({
					value: `${e.account}\u0000${e.path}`,
					title: e.label,
					detail: s.accounts.length > 1 ? e.account : e.role ?? void 0,
					section: s.accounts.length > 1 ? e.account : void 0
				})),
				typed: e === "move" ? (e) => `New folder “${e}”` : void 0,
				onpick: async (n, r) => {
					if (r && e === "move") {
						try {
							let e = await s.call("folder_create", {
								account: t,
								name: n
							});
							await s.loadFolders(), s.moveTo(e.path, n);
						} catch (e) {
							s.toast(`No folder made: ${e.message}`, "error");
						}
						return;
					}
					let [i, a] = n.split("\0"), o = s.folders.find((e) => e.account === i && e.path === a);
					e === "move" ? s.moveTo(a, o?.label ?? a) : s.go({
						name: "folder",
						account: i,
						folder: a,
						label: o?.label ?? a
					});
				}
			});
		} else if (e === "label") {
			let e = new Set(s.rows.flatMap((e) => e.labels)), t = new Set(s.targets().flatMap((e) => e.labels));
			r.atlas.pick({
				placeholder: "Label… (a label it has is taken off)",
				tag: "Label",
				items: [...e].sort().map((e) => ({
					value: e,
					title: e.replace(/^\$/, ""),
					detail: t.has(e) ? "on it — pick to take it off" : void 0
				})),
				typed: (e) => `New label “${e}”`,
				onpick: (e) => t.has(e) ? s.label([], [e]) : s.label([e], [])
			});
		} else r.atlas.pick({
			placeholder: "Write from a template… (notes in mail/templates/)",
			tag: "Template",
			items: async () => (await s.call("templates")).templates.map((e) => ({
				value: JSON.stringify(e),
				title: e.name,
				detail: e.subject
			})),
			onpick: (e) => {
				let t = JSON.parse(e);
				s.compose({
					subject: t.subject ?? "",
					to: t.to ?? "",
					cc: t.cc ?? "",
					body: t.body
				});
			}
		});
	}
	function fe() {
		r.atlas.pick({
			placeholder: "Do what? (every command of the Email pane)",
			tag: "Email",
			items: un.filter((e) => e.id !== "palette" && (!e.when || e.when(s))).map((e) => ({
				value: e.id,
				title: e.title,
				detail: mn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => un.find((t) => t.id === e)?.run(s, me)
		});
	}
	function pe() {
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
					value: c(h) ? "comfortable" : "compact",
					title: c(h) ? "Comfortable rows" : "Compact rows",
					detail: c(h) ? "two lines with a preview" : "one line each, more on screen"
				}
			],
			onpick: (e) => {
				e === "compact" || e === "comfortable" ? (_(h, e === "compact"), f("density", e)) : (_(p, e, !0), f("layout", e));
			}
		});
	}
	let me = {
		pick: de,
		palette: fe,
		back: ce,
		focusSearch: () => {
			c(V)?.focus(), c(V)?.select();
		},
		help: () => _(M, !c(M)),
		expandAll: (e) => c(H)?.expandAll(e),
		rules: () => _(L, !0),
		layout: pe
	}, Q = e(""), he;
	function ge(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog] input")) {
			e.key === "Escape" && t === c(V) && c(V)?.blur();
			return;
		}
		if (!c(Se)?.contains(t) && t !== document.body) return;
		let n = dn(e);
		if ([
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let r = c(Q) ? `${c(Q)} ${n}` : n;
		if (clearTimeout(he), !c(Q) && pn.has(n)) {
			_(Q, n, !0), he = setTimeout(() => _(Q, ""), 1200), e.preventDefault();
			return;
		}
		_(Q, "");
		let i = fn.get(r);
		!i || i.when && !i.when(s) || (e.preventDefault(), e.stopPropagation(), i.run(s, me));
	}
	let _e;
	function ve() {
		clearTimeout(_e), _e = setTimeout(() => s.search(c(U)), 140);
	}
	async function ye() {
		if (s.search(c(U)), c(U).trim()) try {
			let e = await s.call("search_server", { query: c(U) }, 300);
			e.added && (s.toast(`${e.added} more from the server`), s.load());
		} catch (e) {
			s.toast(`The server search failed: ${e.message}`, "error");
		}
	}
	function $(e) {
		s.quick = s.quick === e ? "" : e, s.load();
	}
	function be(e) {
		s.kind = e, s.load();
	}
	function xe(e, t) {
		e.preventDefault();
		let n = e.clientX, r = e.clientY, i = c(g), a = c(v), o = c(x), s = (e) => {
			t === "side" ? _(g, Math.max(170, Math.min(420, i + e.clientX - n)), !0) : t === "list" ? _(v, Math.max(300, Math.min(900, a + e.clientX - n)), !0) : _(x, Math.max(160, Math.min(900, o + e.clientY - r)), !0);
		}, l = () => {
			window.removeEventListener("pointermove", s), window.removeEventListener("pointerup", l), f("side-w", String(c(g))), f("list-w", String(c(v))), f("list-h", String(c(x))), document.body.style.userSelect = "";
		};
		document.body.style.userSelect = "none", window.addEventListener("pointermove", s), window.addEventListener("pointerup", l);
	}
	let Se = e(void 0);
	F(() => {
		s.start();
		let e = [
			r.atlas.helper.on("changed", () => s.later()),
			r.atlas.helper.on("bodies", () => s.later("list")),
			r.atlas.helper.on("status", (e) => {
				let t = e, n = s.accounts.find((e) => e.name === t.account);
				n && (n.status = t, n.syncing = t.state === "syncing");
			}),
			r.atlas.helper.on("woke", () => {
				s.toast("Snoozed mail is back in the inbox"), s.later();
			}),
			r.atlas.helper.on("rule", (e) => {
				let t = e;
				s.toast(`Rule “${t.rule}”: ${t.count} message${t.count === 1 ? "" : "s"}`);
			})
		], t = new MutationObserver(() => _(te, document.documentElement.dataset.theme !== "light"));
		t.observe(document.documentElement, {
			attributes: !0,
			attributeFilter: ["data-theme"]
		});
		let n = async (e) => {
			let t = e.detail, n = prompt(`A new folder in ${t}:`);
			if (n) try {
				await s.call("folder_create", {
					account: t,
					name: n
				}), await s.loadFolders(), s.toast(`Folder “${n}” made`, "success");
			} catch (e) {
				s.toast(`No folder made: ${e.message}`, "error");
			}
		}, i = () => {
			s.loadAccounts(), s.later();
		};
		window.addEventListener("atlas-email:new-folder", n), window.addEventListener("atlas-email:signed-in", i);
		let a = (e) => {
			let t = e.detail ?? {};
			(t.account || t.view === "inbox") && s.go({
				name: "inbox",
				account: t.account ?? null,
				folder: null,
				label: "Inbox"
			}), t.kind && (s.split ? (s.kind = t.kind, s.load()) : s.search(`in:inbox is:${t.kind}`)), t.search && (_(U, t.search, !0), s.search(t.search)), t.id && (s.read(t.id), c(K) && _(O, "reader")), t.compose && s.compose(t.compose), t.reply && s.reply(t.reply.mode, t.reply.id, !1);
		};
		window.addEventListener("atlas-email:open", a);
		let o = window.__atlasEmailOpen;
		return o && (a(new CustomEvent("x", { detail: o })), window.__atlasEmailOpen = void 0), () => {
			e.forEach((e) => e()), t.disconnect(), window.removeEventListener("atlas-email:new-folder", n), window.removeEventListener("atlas-email:signed-in", i), window.removeEventListener("atlas-email:open", a);
		};
	});
	let Ce = N(() => s.query ? "Search" : s.view.label), we = [
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
	var Te = Yn();
	S("keydown", d, ge);
	let De, Oe;
	var ke = q(Te), Ae = (e) => {
		var t = Tn(), r = q(t);
		Ee(r, {
			get mail() {
				return s;
			},
			get rail() {
				return c(J);
			},
			onpicked: () => {
				c(K) && _(O, "list");
			}
		});
		var i = w(r, 2), a = (e) => {
			var t = wn();
			n("pointerdown", t, (e) => xe(e, "side")), o(e, t);
		};
		z(i, (e) => {
			!c(J) && !c(K) && e(a);
		}), G(t), o(e, t);
	};
	z(ke, (e) => {
		(!c(K) || c(O) === "side") && e(Ae);
	});
	var je = w(ke, 2), Me = (e) => {
		var t = Gn();
		let i;
		var l = q(t), d = (e) => {
			var t = Hn(), i = q(t), l = q(i), d = q(l), f = (e) => {
				var t = En(), r = q(t);
				I(r, { name: "menu" }), G(t), n("click", t, () => _(O, "side")), o(e, t);
			};
			z(d, (e) => {
				c(K) && e(f);
			});
			var p = w(d, 2), g = q(p);
			I(g, {
				name: "search",
				size: 15
			});
			var v = w(g, 2);
			oe(v), ie(v, (e) => _(V, e), () => c(V));
			var b = w(v, 2), x = (e) => {
				var t = Dn(), r = q(t);
				I(r, {
					name: "x",
					size: 14
				}), G(t), n("click", t, () => {
					_(U, ""), s.search("");
				}), o(e, t);
			};
			z(b, (e) => {
				c(U) && e(x);
			}), G(p);
			var S = w(p, 2), E = q(S);
			I(E, { name: "refresh" }), G(S);
			var D = w(S, 2), ee = q(D);
			I(ee, { name: "layout" }), G(D);
			var M = w(D, 2), P = q(M);
			I(P, { name: "keyboard" }), G(M), G(l);
			var F = w(l, 2), L = (e) => {
				var t = An(), r = q(t);
				B(r, 17, () => s.chips, ([e, t]) => e + t, (e, t) => {
					var n = N(() => j(c(t), 2));
					let r = () => c(n)[0], i = () => c(n)[1];
					var a = On(), s = q(a), l = T(s), u = w(s, 1, !0);
					G(a), C(() => {
						m(l, `${r() ?? ""}:`), m(u, i());
					}), o(e, a);
				});
				var i = w(r), a = (e) => {
					var t = kn();
					n("click", t, ye), o(e, t);
				};
				z(i, (e) => {
					s.query && e(a);
				}), G(t), o(e, t);
			};
			z(F, (e) => {
				s.chips.length && e(L);
			});
			var R = w(F, 2), te = (e) => {
				var t = jn(), r = q(t), i = q(r);
				I(i, { name: "x" }), G(r);
				var a = w(r, 2), c = T(a), l = w(a, 4), u = q(l);
				I(u, { name: "archive" }), G(l);
				var d = w(l, 2), f = q(d);
				I(f, { name: "trash" }), G(d);
				var p = w(d, 2), h = q(p);
				I(h, { name: "read" }), G(p);
				var g = w(p, 2), _ = q(g);
				I(_, { name: "unread" }), G(g);
				var v = w(g, 2), y = q(v);
				I(y, { name: "star" }), G(v);
				var b = w(v, 2), x = q(b);
				I(x, { name: "clock" }), G(b);
				var S = w(b, 2), E = q(S);
				I(E, { name: "folder" }), G(S);
				var D = w(S, 2), O = q(D);
				I(O, { name: "label" }), G(D), G(t), C(() => m(c, `${s.checked.length ?? ""} checked`)), n("click", r, () => s.selectWhere("none")), n("click", l, () => s.archive()), n("click", d, () => s.trash()), n("click", p, () => s.mark("read", !0)), n("click", g, () => s.mark("read", !1)), n("click", v, () => s.toggleStar()), n("click", b, () => de("snooze")), n("click", S, () => de("move")), n("click", D, () => de("label")), o(e, t);
			}, H = (e) => {
				var t = Fn(), r = u(t), i = q(r), l = T(i, !0), d = w(i, 2), f = T(d), p = w(d, 4), h = q(p);
				let g;
				var _ = w(h, 2);
				let v;
				var b = w(_, 2);
				let x;
				var S = w(b, 2);
				let E;
				G(p), G(r);
				var D = w(r, 2), O = (e) => {
					var t = Pn();
					B(t, 21, () => we, ([e, t, n]) => e, (e, t) => {
						var r = N(() => j(c(t), 3));
						let i = () => c(r)[0], l = () => c(r)[1], u = () => c(r)[2], d = N(() => s.counts[i()]);
						var f = Nn();
						let p;
						var h = q(f);
						I(h, {
							get name() {
								return u();
							},
							size: 14
						});
						var g = w(h, 1, !0), _ = w(g), v = (e) => {
							var t = Mn(), n = T(t, !0);
							C(() => m(n, c(d).unread)), o(e, t);
						};
						z(_, (e) => {
							c(d)?.unread && e(v);
						}), G(f), C(() => {
							y(f, "aria-selected", (s.kind || "person") === i()), p = a(f, 1, "svelte-7si10b", null, p, { on: (s.kind || "person") === i() }), m(g, l());
						}), n("click", f, () => be(i())), o(e, f);
					}), G(t), o(e, t);
				};
				z(D, (e) => {
					s.split && !s.query && e(O);
				}), C(() => {
					m(l, c(Ce)), m(f, `${s.total ? `${s.total} conversation${s.total === 1 ? "" : "s"}` : ""}${s.unread ? ` · ${s.unread} unread` : ""}`), g = a(h, 1, "svelte-7si10b", null, g, { on: s.quick === "unread" }), v = a(_, 1, "svelte-7si10b", null, v, { on: s.quick === "starred" }), x = a(b, 1, "svelte-7si10b", null, x, { on: s.quick === "attachments" }), E = a(S, 1, "svelte-7si10b", null, E, { on: s.quick === "mentions" });
				}), n("click", h, () => $("unread")), n("click", _, () => $("starred")), n("click", b, () => $("attachments")), n("click", S, () => $("mentions")), o(e, t);
			};
			z(R, (e) => {
				s.checked.length ? e(te) : e(H, -1);
			}), G(i);
			var W = w(i, 2), J = (e) => {
				var t = In(), i = q(t, !0), a = w(i), c = q(a), l = w(c);
				G(a), G(t), C(() => m(i, s.error)), n("click", c, () => s.load()), n("click", l, () => r.atlas.plugin.openSettings()), o(e, t);
			}, Y = (e) => {
				var t = Vn(), i = q(t), a = (e) => {
					var t = Ln(), r = w(u(t));
					n("click", r, ye), o(e, t);
				}, c = (e) => {
					var t = Rn(), i = w(u(t));
					n("click", i, () => r.atlas.plugin.openSettings()), o(e, t);
				}, l = (e) => {
					var t = zn();
					k(), o(e, t);
				}, d = (e) => {
					var t = Bn(), n = T(t);
					C(() => m(n, `Nothing here${s.quick ? " with that filter" : ""}.`)), o(e, t);
				};
				z(i, (e) => {
					s.query ? e(a) : s.accounts.length ? s.view.name === "inbox" && !s.quick ? e(l, 2) : e(d, -1) : e(c, 1);
				}), G(t), o(e, t);
			}, ne = (e) => {
				Ue(e, {
					get mail() {
						return s;
					},
					get compact() {
						return c(h);
					},
					onopen: le
				});
			};
			z(W, (e) => {
				s.error ? e(J) : !s.loading && !s.rows.length ? e(Y, 1) : e(ne, -1);
			}), G(t), C(() => y(t, "aria-label", c(Ce))), n("input", v, ve), n("keydown", v, (e) => {
				e.key === "Enter" ? (e.preventDefault(), ye()) : e.key === "Escape" ? (_(U, ""), s.search(""), c(V)?.blur()) : e.key === "ArrowDown" && c(V)?.blur();
			}), A(v, () => c(U), (e) => _(U, e)), n("click", S, () => un.find((e) => e.id === "refresh")?.run(s, me)), n("click", D, pe), n("click", M, fe), o(e, t);
		};
		z(l, (e) => {
			(c(X) !== "full" || !c(ae) || c(K) && c(O) !== "reader") && e(d);
		});
		var f = w(l, 2), p = (e) => {
			var t = Un();
			let r;
			C(() => r = a(t, 1, "grip svelte-7si10b", null, r, {
				h: c(X) === "below",
				v: c(X) === "three"
			})), n("pointerdown", t, (e) => xe(e, c(X) === "below" ? "listH" : "list")), o(e, t);
		};
		z(f, (e) => {
			c(X) !== "full" && e(p);
		});
		var g = w(f, 2), v = (e) => {
			var t = Wn(), n = q(t);
			{
				let e = N(() => c(X) === "full");
				ie(tn(n, {
					get mail() {
						return s;
					},
					get dark() {
						return c(te);
					},
					get narrow() {
						return c(e);
					},
					onback: () => {
						s.close(), _(O, "list");
					},
					onpick: de
				}), (e) => _(H, e, !0), () => c(H));
			}
			G(t), o(e, t);
		};
		z(g, (e) => {
			c(ae) && (!c(K) || c(O) === "reader") && e(v);
		}), G(t), C(() => i = a(t, 1, "work svelte-7si10b", null, i, {
			below: c(X) === "below",
			full: c(X) === "full"
		})), o(e, t);
	};
	z(je, (e) => {
		(!c(K) || c(O) !== "side") && e(Me);
	});
	var Ne = w(je, 2), Pe = (e) => {
		var t = qn();
		let n;
		B(t, 21, () => c(Z), (e) => e.key, (e, t) => {
			var n = Kn();
			Dt(q(n), {
				get mail() {
					return s;
				},
				get c() {
					return c(t);
				},
				get big() {
					return c(W);
				},
				set big(e) {
					_(W, e, !0);
				}
			}), G(n), o(e, n);
		}), G(t), C(() => n = a(t, 1, "windows svelte-7si10b", null, n, { big: c(W) || c(K) })), o(e, t);
	};
	z(Ne, (e) => {
		c(Z).length && e(Pe);
	});
	var Fe = w(Ne, 2), Ie = (e) => {
		xn(e, { onclose: () => _(M, !1) });
	};
	z(Fe, (e) => {
		c(M) && e(Ie);
	});
	var Le = w(Fe, 2), Re = (e) => {
		re(e, {
			get mail() {
				return s;
			},
			onclose: () => _(L, !1)
		});
	};
	z(Le, (e) => {
		c(L) && e(Re);
	});
	var ze = w(Le, 2);
	cn(ze, { get mail() {
		return s;
	} });
	var Be = w(ze, 2), Ve = (e) => {
		var t = Jn(), n = T(t);
		C(() => m(n, `${c(Q) ?? ""} …`)), o(e, t);
	};
	z(Be, (e) => {
		c(Q) && e(Ve);
	}), G(Te), ie(Te, (e) => _(Se, e), () => c(Se)), C(() => {
		De = a(Te, 1, "mail svelte-7si10b", null, De, {
			narrow: c(K),
			dark: c(te)
		}), Oe = b(Te, "", Oe, {
			"--side-w": `${(c(J) ? 56 : c(g)) ?? ""}px`,
			"--list-w": `${c(v) ?? ""}px`,
			"--list-h": `${c(x) ?? ""}px`
		});
	}), se(Te, "clientWidth", (e) => _(D, e)), o(t, Te), Y();
}
Z([
	"pointerdown",
	"click",
	"input",
	"keydown"
]);
//#endregion
//#region plugins/stable/email/ui/src/view.ts
function Qn(e, t) {
	e.style.height = "100%";
	let n = p(Zn, {
		target: e,
		props: { atlas: t }
	});
	return () => g(n);
}
//#endregion
export { Qn as default };
