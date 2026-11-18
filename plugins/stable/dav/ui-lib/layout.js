//#region ui/node_modules/svelte/src/internal/shared/utils.js
var e = Array.isArray, t = Array.prototype.indexOf, n = Array.prototype.includes, r = Array.from, i = Object.defineProperty, a = Object.getOwnPropertyDescriptor, o = Object.getOwnPropertyDescriptors, s = Object.prototype, c = Array.prototype, l = Object.getPrototypeOf, u = Object.isExtensible, d = () => {};
function f(e) {
	for (var t = 0; t < e.length; t++) e[t]();
}
function p() {
	var e, t;
	return {
		promise: new Promise((n, r) => {
			e = n, t = r;
		}),
		resolve: e,
		reject: t
	};
}
function m(e, t) {
	if (Array.isArray(e)) return e;
	if (t === void 0 || !(Symbol.iterator in e)) return Array.from(e);
	let n = [];
	for (let r of e) if (n.push(r), n.length === t) break;
	return n;
}
var h = 1024, g = 2048, _ = 4096, v = 8192, y = 16384, b = 32768, x = 1 << 25, S = 65536, ee = 1 << 19, te = 1 << 20, ne = 1 << 25, re = 1 << 21, ie = 1 << 22, ae = 1 << 23, oe = Symbol("$state"), se = Symbol("component"), ce = Symbol("legacy props"), le = Symbol(""), ue = Symbol("attributes"), de = Symbol("class"), fe = Symbol("style"), pe = Symbol("text"), me = Symbol("form reset"), he = new class extends Error {
	name = "StaleReactionError";
	message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
}(), ge = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml"), _e = {}, C = Symbol("uninitialized"), ve = "http://www.w3.org/1999/xhtml";
function ye() {
	console.warn("https://svelte.dev/e/derived_inert");
}
function be(e) {
	console.warn("https://svelte.dev/e/hydration_mismatch");
}
function xe() {
	console.warn("https://svelte.dev/e/select_multiple_invalid_value");
}
function Se() {
	console.warn("https://svelte.dev/e/svelte_boundary_reset_noop");
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/hydration.js
var w = !1;
function Ce(e) {
	w = e;
}
var T;
function E(e) {
	if (e === null) throw be(), _e;
	return T = e;
}
function we() {
	return E(/* @__PURE__ */ R(T));
}
function Te(e) {
	if (w) {
		if (/* @__PURE__ */ R(T) !== null) throw be(), _e;
		T = e;
	}
}
function Ee(e = 1) {
	if (w) {
		for (var t = e, n = T; t--;) n = /* @__PURE__ */ R(n);
		T = n;
	}
}
function De(e = !0) {
	for (var t = 0, n = T;;) {
		if (n.nodeType === 8) {
			var r = n.data;
			if (r === "]") {
				if (t === 0) return n;
				--t;
			} else (r === "[" || r === "[!" || r[0] === "[" && !isNaN(Number(r.slice(1)))) && (t += 1);
		}
		var i = /* @__PURE__ */ R(n);
		e && n.remove(), n = i;
	}
}
function Oe(e) {
	if (!e || e.nodeType !== 8) throw be(), _e;
	return e.data;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/equality.js
function ke(e) {
	return e === this.v;
}
function Ae(e, t) {
	return e == e ? e !== t || typeof e == "object" && !!e || typeof e == "function" : t == t;
}
function je(e) {
	return !Ae(e, this.v);
}
function Me(e) {
	throw Error("https://svelte.dev/e/lifecycle_outside_component");
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/errors.js
function Ne() {
	throw Error("https://svelte.dev/e/async_derived_orphan");
}
function Pe(e, t, n) {
	throw Error("https://svelte.dev/e/each_key_duplicate");
}
function Fe(e) {
	throw Error("https://svelte.dev/e/effect_in_teardown");
}
function Ie() {
	throw Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function Le(e) {
	throw Error("https://svelte.dev/e/effect_orphan");
}
function Re() {
	throw Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function ze(e) {
	throw Error("https://svelte.dev/e/props_invalid_value");
}
function Be() {
	throw Error("https://svelte.dev/e/state_descriptors_fixed");
}
function Ve() {
	throw Error("https://svelte.dev/e/state_prototype_fixed");
}
function He() {
	throw Error("https://svelte.dev/e/state_unsafe_mutation");
}
function Ue() {
	throw Error("https://svelte.dev/e/svelte_boundary_reset_onerror");
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/context.js
var D = null;
function We(e) {
	D = e;
}
function Ge(e, t = !1, n) {
	D = {
		p: D,
		i: !1,
		c: null,
		e: null,
		s: e,
		x: null,
		r: G,
		l: null
	};
}
function Ke(e) {
	var t = D, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) gn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, D = t.p, qe(e);
}
function qe(e = {}) {
	return i(e, se, { value: !0 }), e;
}
function Je() {
	return !0;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/task.js
var Ye = [];
function Xe() {
	var e = Ye;
	Ye = [], f(e);
}
function O(e) {
	if (Ye.length === 0 && !Ct) {
		var t = Ye;
		queueMicrotask(() => {
			t === Ye && Xe();
		});
	}
	Ye.push(e);
}
function Ze() {
	for (; Ye.length > 0;) Xe();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/status.js
var Qe = ~(g | _ | h);
function k(e, t) {
	e.f = e.f & Qe | t;
}
function $e(e) {
	e.f & 512 || e.deps === null ? k(e, h) : k(e, _);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/utils.js
function et(e, t, n) {
	e.f & 2048 ? t.add(e) : e.f & 4096 && n.add(e), k(e, h);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/misc.js
function tt(e) {
	w && /* @__PURE__ */ L(e) !== null && an(e);
}
var nt = !1;
function rt() {
	nt || (nt = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[me]?.();
		});
	}, { capture: !0 }));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function it(e) {
	var t = H, n = G;
	W(null), K(null);
	try {
		return e();
	} finally {
		W(t), K(n);
	}
}
function at(e, t, n, r = n) {
	e.addEventListener(t, () => it(n));
	let i = e[me];
	e[me] = i ? () => {
		i(), r(!0);
	} : () => r(!0), rt();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/async.js
function ot(e, t, n, r) {
	let i = Je() ? ut : mt;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = G, c = st(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
	function u(e) {
		if (!(s.f & 16384)) {
			c();
			try {
				r([...o, ...e]);
			} catch (e) {
				z(e, s);
			}
			ct();
		}
	}
	var d = lt();
	if (n.length === 0) {
		l.then(() => u([])).finally(d);
		return;
	}
	function f() {
		Promise.all(n.map((e) => /* @__PURE__ */ ft(e))).then(u).catch((e) => z(e, s)).finally(d);
	}
	l ? l.then(() => {
		c(), f(), ct();
	}) : f();
}
function st() {
	var e = G, t = H, n = D, r = A;
	return function(i = !0) {
		K(e), W(t), We(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function ct(e = !0) {
	K(null), W(null), We(null), e && A?.deactivate();
}
function lt() {
	var e = G, t = e.b, n = A, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function ut(e) {
	var t = 2 | g;
	return G !== null && (G.f |= ee), {
		ctx: D,
		deps: null,
		effects: null,
		equals: ke,
		f: t,
		fn: e,
		reactions: null,
		rv: 0,
		v: C,
		wv: 0,
		parent: G,
		ac: null
	};
}
var dt = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function ft(e, t, n) {
	let r = G;
	r === null && Ne();
	var i = void 0, a = Rt(C), o = !H, s = /* @__PURE__ */ new Set();
	return yn(() => {
		var t = G, n = p();
		i = n.promise;
		try {
			Promise.resolve(e()).then(n.resolve, (e) => {
				e !== he && n.reject(e);
			}).finally(ct);
		} catch (e) {
			n.reject(e), ct();
		}
		var c = A;
		if (o) {
			if (t.f & 32768) var l = lt();
			if (r.b?.is_rendered()) c.async_deriveds.get(t)?.reject(dt);
			else for (let e of s.values()) e.reject(dt);
			s.add(n), c.async_deriveds.set(t, n);
		}
		let u = (e, t = void 0) => {
			l?.(), s.delete(n), t !== dt && (c.activate(), t ? (a.f |= ae, Ht(a, t)) : (a.f & 8388608 && (a.f ^= ae), Ht(a, e)), c.deactivate());
		};
		n.promise.then(u, (e) => u(null, e || "unknown"));
	}), mn(() => {
		for (let e of s) e.reject(dt);
	}), new Promise((e) => {
		function t(n) {
			function r() {
				n === i ? e(a) : t(i);
			}
			n.then(r, r);
		}
		t(i);
	});
}
/*#__NO_SIDE_EFFECTS__*/
function pt(e) {
	let t = /* @__PURE__ */ ut(e);
	return Ln(t), t;
}
/*#__NO_SIDE_EFFECTS__*/
function mt(e) {
	let t = /* @__PURE__ */ ut(e);
	return t.equals = je, t;
}
function ht(e) {
	var t = e.effects;
	if (t !== null) {
		e.effects = null;
		for (var n = 0; n < t.length; n += 1) V(t[n]);
	}
}
function gt(e) {
	var t, n = G, r = e.parent;
	if (!Fn && r !== null && e.v !== C && r.f & 24576) return ye(), e.v;
	K(r);
	try {
		ht(e), t = Kn(e);
	} finally {
		K(n);
	}
	return t;
}
function _t(e) {
	var t = gt(e);
	if (!e.equals(t) && (e.wv = Un(), (!A?.is_fork || e.deps === null) && (A === null ? e.v = t : (A.capture(e, t, !0), xt?.capture(e, t, !0)), e.deps === null))) {
		k(e, h);
		return;
	}
	Fn || (j === null ? $e(e) : (pn() || A?.is_fork) && j.set(e, t));
}
function vt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && it(() => {
		t.ac.abort(he), t.ac = null;
	}), t.fn !== null && (t.teardown = d), Yn(t, 0), wn(t));
}
function yt(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && Xn(t);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/batch.js
var bt = null, A = null, xt = null, j = null, St = null, Ct = !1, wt = !1, Tt = null, Et = null, Dt = 0, Ot = 1, kt = class e {
	id = Ot++;
	#e = !1;
	linked = !0;
	#t = null;
	#n = null;
	async_deriveds = /* @__PURE__ */ new Map();
	current = /* @__PURE__ */ new Map();
	previous = /* @__PURE__ */ new Map();
	#r = /* @__PURE__ */ new Set();
	#i = /* @__PURE__ */ new Set();
	#a = 0;
	#o = /* @__PURE__ */ new Map();
	#s = null;
	#c = [];
	#l = [];
	#u = /* @__PURE__ */ new Set();
	#d = /* @__PURE__ */ new Set();
	#f = /* @__PURE__ */ new Map();
	#p = /* @__PURE__ */ new Set();
	is_fork = !1;
	#m = !1;
	constructor() {
		bt === null ? bt = this : (bt.#n = this, this.#t = bt), bt = this;
	}
	#h() {
		if (this.is_fork) return !0;
		for (let n of this.#o.keys()) {
			for (var e = n, t = !1; e.parent !== null;) {
				if (this.#f.has(e)) {
					t = !0;
					break;
				}
				e = e.parent;
			}
			if (!t) return !0;
		}
		return !1;
	}
	skip_effect(e) {
		this.#f.has(e) || this.#f.set(e, {
			d: [],
			m: []
		}), this.#p.delete(e);
	}
	unskip_effect(e, t = (e) => this.schedule(e)) {
		var n = this.#f.get(e);
		if (n) {
			this.#f.delete(e);
			for (var r of n.d) k(r, g), t(r);
			for (r of n.m) k(r, _), t(r);
		}
		this.#p.add(e);
	}
	#g() {
		var e = [];
		for (let i of this.#c) if (!(i.f & 16384 || !(i.f & 6144))) {
			for (var t = i, n = !1; t.parent !== null;) {
				t = t.parent;
				var r = t.f;
				if (r & 96) {
					if (!(r & 1024)) {
						n = !0;
						break;
					}
					t.f ^= h;
				}
			}
			n || e.push(t);
		}
		return this.#c = [], e;
	}
	#_() {
		this.#e = !0;
		for (let e of this.#u) this.#d.delete(e), k(e, g), this.schedule(e);
		for (let e of this.#d) k(e, _), this.schedule(e);
		this.apply();
		for (var t = Tt = [], n = [], r = Et = []; this.#c.length > 0;) {
			Dt++ > 1e3 && (this.#S(), jt());
			for (let e of this.#g()) try {
				this.#v(e, t, n);
			} catch (t) {
				throw Ft(e), this.#h() || this.discard(), t;
			}
		}
		if (A = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (Tt = null, Et = null, this.#h()) {
			this.#x(n), this.#x(t);
			for (let [e, t] of this.#f) Pt(e, t);
			r.length > 0 && A.#_();
			return;
		}
		let a = this.#y();
		if (a) {
			this.#x(n), this.#x(t), a.#b(this);
			return;
		}
		this.#u.clear(), this.#d.clear();
		for (let e of this.#r) e(this);
		this.#r.clear(), xt = this, Mt(n), Mt(t), xt = null, this.#s?.resolve();
		var o = A;
		if (this.#a === 0 && (this.#c.length === 0 || o !== null) && this.#S(), this.#c.length > 0) {
			if (o !== null) {
				for (let e of this.#c) o.#c.push(e);
				this.#c = [];
			} else o = this;
		}
		o !== null && (N.clear(), o.#_());
	}
	#v(e, t, n) {
		e.f ^= h;
		for (var r = e.first; r !== null;) {
			var i = r.f, a = !!(i & 96);
			if (!(a && i & 1024 || i & 8192 || this.#f.has(r)) && r.fn !== null) {
				a ? r.f ^= h : i & 4 ? t.push(r) : Wn(r) && (i & 16 && this.#d.add(r), Xn(r));
				var o = r.first;
				if (o !== null) {
					r = o;
					continue;
				}
			}
			for (; r !== null;) {
				var s = r.next;
				if (s !== null) {
					r = s;
					break;
				}
				r = r.parent;
			}
		}
	}
	#y() {
		for (var e = this.#t; e !== null;) {
			if (!e.is_fork) {
				for (let [t, [, n]] of this.current) if (e.current.has(t) && !n) return e;
			}
			e = e.#t;
		}
		return null;
	}
	#b(e) {
		for (let [t, n] of e.current) !this.previous.has(t) && e.previous.has(t) && this.previous.set(t, e.previous.get(t)), this.current.set(t, n);
		for (let [t, n] of e.async_deriveds) {
			let e = this.async_deriveds.get(t);
			e && n.promise.then(e.resolve).catch(e.reject);
		}
		e.async_deriveds.clear(), this.transfer_effects(e.#u, e.#d);
		let t = (e) => {
			var n = e.reactions;
			if (n !== null && !(e.f & 2 && !(e.f & 6144))) for (let e of n) {
				var r = e.f;
				if (r & 2) t(e);
				else {
					var i = e;
					r & 4194320 && !this.async_deriveds.has(i) && (this.#d.delete(i), k(i, g), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#S(), A = this, this.#_();
	}
	#x(e) {
		for (var t = 0; t < e.length; t += 1) et(e[t], this.#u, this.#d);
	}
	capture(e, t, n = !1) {
		e.v !== C && !this.previous.has(e) && this.previous.set(e, e.v), e.f & 8388608 || (this.current.set(e, [t, n]), j?.set(e, t)), this.is_fork || (e.v = t);
	}
	activate() {
		A = this;
	}
	deactivate() {
		A = null, j = null;
	}
	flush() {
		try {
			wt = !0, A = this, this.#_();
		} finally {
			Dt = 0, St = null, Tt = null, Et = null, wt = !1, A = null, j = null, N.clear();
		}
	}
	discard() {
		for (let e of this.#i) e(this);
		this.#i.clear();
		for (let e of this.async_deriveds.values()) e.reject(dt);
		this.#S(), this.#s?.resolve();
	}
	register_created_effect(e) {
		this.#l.push(e);
	}
	increment(e, t) {
		if (this.#a += 1, e) {
			let e = this.#o.get(t) ?? 0;
			this.#o.set(t, e + 1);
		}
	}
	decrement(e, t) {
		if (--this.#a, e) {
			let e = this.#o.get(t) ?? 0;
			e === 1 ? this.#o.delete(t) : this.#o.set(t, e - 1);
		}
		this.#m || (this.#m = !0, O(() => {
			this.#m = !1, this.linked && this.flush();
		}));
	}
	transfer_effects(e, t) {
		for (let t of e) this.#u.add(t);
		for (let e of t) this.#d.add(e);
		e.clear(), t.clear();
	}
	oncommit(e) {
		this.#r.add(e);
	}
	ondiscard(e) {
		this.#i.add(e);
	}
	settled() {
		return (this.#s ??= p()).promise;
	}
	static ensure() {
		if (A === null) {
			let t = A = new e();
			!wt && !Ct && O(() => {
				t.#e || t.flush();
			});
		}
		return A;
	}
	apply() {
		j = null;
	}
	schedule(e) {
		if (St = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768)) {
			e.b.defer_effect(e);
			return;
		}
		this.#c.push(e);
	}
	#S() {
		if (this.linked) {
			var e = this.#t, t = this.#n;
			e === null || (e.#n = t), t === null ? bt = e : t.#t = e, this.linked = !1;
		}
	}
};
function At(e) {
	var t = Ct;
	Ct = !0;
	try {
		var n;
		for (e && (A !== null && !A.is_fork && A.flush(), n = e());;) {
			if (Ze(), A === null) return n;
			A.flush();
		}
	} finally {
		Ct = t;
	}
}
function jt() {
	try {
		Re();
	} catch (e) {
		z(e, St);
	}
}
var M = null;
function Mt(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && Wn(r) && (M = /* @__PURE__ */ new Set(), Xn(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && Dn(r), M?.size > 0)) {
				N.clear();
				for (let e of M) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) M.has(n) && (M.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || Xn(n);
					}
				}
				M.clear();
			}
		}
		M = null;
	}
}
function Nt(e) {
	A.schedule(e);
}
function Pt(e, t) {
	if (!(e.f & 32 && e.f & 1024)) {
		e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), k(e, h);
		for (var n = e.first; n !== null;) Pt(n, t), n = n.next;
	}
}
function Ft(e) {
	k(e, h);
	for (var t = e.first; t !== null;) Ft(t), t = t.next;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/sources.js
var It = /* @__PURE__ */ new Set(), N = /* @__PURE__ */ new Map(), Lt = !1;
function Rt(e, t) {
	return {
		f: 0,
		v: e,
		reactions: null,
		equals: ke,
		rv: 0,
		wv: 0
	};
}
/*#__NO_SIDE_EFFECTS__*/
function P(e, t) {
	let n = Rt(e, t);
	return Ln(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function zt(e, t = !1, n = !0) {
	let r = Rt(e);
	return t || (r.equals = je), r;
}
function F(e, t, n = !1) {
	return H !== null && (!U || H.f & 131072) && Je() && H.f & 4325394 && (q === null || !q.has(e)) && He(), Ht(e, n ? Kt(t) : t, Et);
}
var Bt = null, Vt = 0;
function Ht(e, t, n = null) {
	if (!e.equals(t)) {
		Fn ? N.set(e, t) : N.has(e) || N.set(e, e.v);
		var r = kt.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && gt(t), j === null && $e(t);
		}
		e.wv = Un(), Bt = null, Vt = 0, Gt(e, g, n), Bt = null, Je() && G !== null && G.f & 1024 && !(G.f & 96) && (X === null ? Rn([e]) : X.push(e)), !r.is_fork && It.size > 0 && !Lt && Ut();
	}
	return t;
}
function Ut() {
	Lt = !1;
	for (let e of It) {
		e.f & 1024 && k(e, _);
		let t;
		try {
			t = Wn(e);
		} catch {
			t = !0;
		}
		t && Xn(e);
	}
	It.clear();
}
function Wt(e) {
	F(e, e.v + 1);
}
function Gt(e, t, n) {
	var r = e.reactions;
	if (r !== null) {
		var i = Je(), a = r.length;
		if (Vt += a, Vt > 1e5 && Bt === null && (Bt = /* @__PURE__ */ new Set()), Bt !== null) {
			if (Bt.has(e)) return;
			Bt.add(e);
		}
		for (var o = 0; o < a; o++) {
			var s = r[o], c = s.f;
			if (i || s !== G) {
				var l = (c & g) === 0;
				if (l && k(s, t), c & 131072) It.add(s);
				else if (c & 2) {
					var u = s;
					j?.delete(u), Gt(u, _, n);
				} else if (l) {
					var d = s;
					c & 16 && M !== null && M.add(d), n === null ? Nt(d) : n.push(d);
				}
			}
		}
	}
}
function Kt(t) {
	if (typeof t != "object" || !t || oe in t || se in t) return t;
	let n = l(t);
	if (n !== s && n !== c) return t;
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ P(0), u = null, d = Vn, f = (e) => {
		if (Vn === d) return e();
		var t = H, n = Vn;
		W(null), Hn(d);
		var r = e();
		return W(t), Hn(n), r;
	};
	return i && r.set("length", /* @__PURE__ */ P(t.length, u)), new Proxy(t, {
		defineProperty(e, t, n) {
			(!("value" in n) || n.configurable === !1 || n.enumerable === !1 || n.writable === !1) && Be();
			var i = r.get(t);
			return i === void 0 ? f(() => {
				var e = /* @__PURE__ */ P(n.value, u);
				return r.set(t, e), e;
			}) : F(i, n.value, !0), !0;
		},
		deleteProperty(e, t) {
			var n = r.get(t);
			if (n === void 0) {
				if (t in e) {
					let e = f(() => /* @__PURE__ */ P(C, u));
					r.set(t, e), Wt(o);
				}
			} else F(n, C), Wt(o);
			return !0;
		},
		get(e, n, i) {
			if (n === oe) return t;
			var o = r.get(n), s = n in e;
			if (o === void 0 && (!s || a(e, n)?.writable) && (o = f(() => /* @__PURE__ */ P(Kt(s ? e[n] : C), u)), r.set(n, o)), o !== void 0) {
				var c = Z(o);
				return c === C ? void 0 : c;
			}
			return Reflect.get(e, n, i);
		},
		getOwnPropertyDescriptor(e, t) {
			this.has?.(e, t);
			var n = Reflect.getOwnPropertyDescriptor(e, t), i = r.get(t);
			if (i !== void 0) {
				var a = Z(i);
				if (a === C) return;
				if (n && "value" in n) n.value = a;
				else return {
					enumerable: !0,
					configurable: !0,
					value: a,
					writable: !0
				};
			}
			return n;
		},
		has(e, t) {
			if (t === oe) return !0;
			var n = r.get(t), i = n !== void 0 && n.v !== C || Reflect.has(e, t);
			return (n !== void 0 || G !== null && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ P(i ? Kt(e[t]) : C, u)), r.set(t, n)), Z(n) === C) ? !1 : i;
		},
		set(e, t, n, s) {
			var c = r.get(t), l = t in e;
			if (i && t === "length") for (var d = n; d < c.v; d += 1) {
				var p = r.get(d + "");
				p === void 0 ? d in e && (p = f(() => /* @__PURE__ */ P(C, u)), r.set(d + "", p)) : F(p, C);
			}
			if (c === void 0) (!l || a(e, t)?.writable) && (c = f(() => /* @__PURE__ */ P(void 0, u)), F(c, Kt(n)), r.set(t, c));
			else {
				l = c.v !== C;
				var m = f(() => Kt(n));
				F(c, m);
			}
			var h = Reflect.getOwnPropertyDescriptor(e, t);
			if (h?.set && h.set.call(s, n), !l) {
				if (i && typeof t == "string") {
					var g = r.get("length"), _ = Number(t);
					Number.isInteger(_) && _ >= g.v && F(g, _ + 1);
				}
				Wt(o);
			}
			return !0;
		},
		ownKeys(e) {
			Z(o);
			var t = Reflect.ownKeys(e).filter((e) => {
				var t = r.get(e);
				return t === void 0 || t.v !== C;
			});
			for (var [n, i] of r) i.v !== C && !(n in e) && t.push(n);
			return t;
		},
		setPrototypeOf() {
			Ve();
		}
	});
}
function qt(e) {
	try {
		if (typeof e == "object" && e && oe in e) return e[oe];
	} catch {}
	return e;
}
function Jt(e, t) {
	return Object.is(qt(e), qt(t));
}
var Yt, Xt, Zt, Qt;
function $t() {
	if (Yt === void 0) {
		Yt = window, Xt = /Firefox/.test(navigator.userAgent);
		var e = Element.prototype, t = Node.prototype, n = Text.prototype;
		Zt = a(t, "firstChild").get, Qt = a(t, "nextSibling").get, u(e) && (e[de] = void 0, e[ue] = null, e[fe] = void 0, e.__e = void 0), u(n) && (n[pe] = void 0);
	}
}
function I(e = "") {
	return document.createTextNode(e);
}
/*@__NO_SIDE_EFFECTS__*/
function L(e) {
	return Zt.call(e);
}
/*@__NO_SIDE_EFFECTS__*/
function R(e) {
	return Qt.call(e);
}
function en(e, t) {
	if (!w) return /* @__PURE__ */ L(e);
	var n = /* @__PURE__ */ L(T);
	if (n === null) n = T.appendChild(I());
	else if (t && n.nodeType !== 3) {
		var r = I();
		return n?.before(r), E(r), r;
	}
	return t && cn(n), E(n), n;
}
function tn(e, t = !1) {
	if (!w) {
		var n = /* @__PURE__ */ L(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ R(n) : n;
	}
	if (t) {
		if (T?.nodeType !== 3) {
			var r = I();
			return T?.before(r), E(r), r;
		}
		cn(T);
	}
	return T;
}
function nn(e, t = !1) {
	if (!w) return /* @__PURE__ */ L(e);
	var n = en(e, t);
	return Te(e), n;
}
function rn(e, t = 1, n = !1) {
	let r = w ? T : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ R(r);
	if (!w) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = I();
			return r === null ? i?.after(a) : r.before(a), E(a), a;
		}
		cn(r);
	}
	return E(r), r;
}
function an(e) {
	e.textContent = "";
}
function on() {
	return !1;
}
function sn(e, t, n) {
	return t == null || t === "http://www.w3.org/1999/xhtml" ? n ? document.createElement(e, { is: n }) : document.createElement(e) : n ? document.createElementNS(t, e, { is: n }) : document.createElementNS(t, e);
}
function cn(e) {
	if (e.nodeValue.length < 65536) return;
	let t = e.nextSibling;
	for (; t !== null && t.nodeType === 3;) t.remove(), e.nodeValue += t.nodeValue, t = e.nextSibling;
}
function ln(e) {
	var t = G;
	if (t === null) return H.f |= ae, e;
	if (!(t.f & 32768) && !(t.f & 4)) throw e;
	z(e, t);
}
function z(e, t) {
	if (!(t !== null && t.f & 16384)) {
		for (; t !== null;) {
			if (t.f & 128 && !(t.f & 33570816)) {
				if (!(t.f & 32768)) throw e;
				try {
					t.b.error(e);
					return;
				} catch (t) {
					e = t;
				}
			}
			t = t.parent;
		}
		throw e;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/effects.js
function un(e) {
	G === null && (H === null && Le(e), Ie()), Fn && Fe(e);
}
function dn(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function fn(e, t) {
	var n = G;
	n !== null && n.f & 8192 && (e |= v);
	var r = {
		ctx: D,
		deps: null,
		nodes: null,
		f: e | g | 512,
		first: null,
		fn: t,
		last: null,
		next: null,
		parent: n,
		b: n && n.b,
		prev: null,
		teardown: null,
		wv: 0,
		ac: null
	};
	A?.register_created_effect(r);
	var i = r;
	if (e & 4) Tt === null ? kt.ensure().schedule(r) : Tt.push(r);
	else if (t !== null) {
		try {
			Xn(r);
		} catch (e) {
			throw V(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= S));
	}
	if (i !== null && (i.parent = n, n !== null && dn(i, n), H !== null && H.f & 2 && !(e & 64))) {
		var a = H;
		(a.effects ??= []).push(i);
	}
	return r;
}
function pn() {
	return H !== null && !U;
}
function mn(e) {
	let t = fn(8, null);
	return k(t, h), t.teardown = e, t;
}
function hn(e) {
	un("$effect");
	var t = G.f;
	if (!H && t & 32 && D !== null && !D.i) {
		var n = D;
		(n.e ??= []).push(e);
	} else return gn(e);
}
function gn(e) {
	return fn(4 | te, e);
}
function _n(e) {
	kt.ensure();
	let t = fn(64 | ee, e);
	return (e = {}) => new Promise((n) => {
		e.outro ? On(t, () => {
			V(t), n(void 0);
		}) : (V(t), n(void 0));
	});
}
function vn(e) {
	return fn(4, e);
}
function yn(e) {
	return fn(ie | ee, e);
}
function bn(e, t = 0) {
	return fn(8 | t, e);
}
function xn(e, t = [], n = [], r = []) {
	ot(r, t, n, (t) => {
		fn(8, () => {
			e(...t.map(Z));
		});
	});
}
function Sn(e, t = 0) {
	return fn(16 | t, e);
}
function B(e) {
	return fn(32 | ee, e);
}
function Cn(e) {
	var t = e.teardown;
	if (t !== null) {
		let n = Fn, r = H;
		In(!0), W(null);
		try {
			t.call(null);
		} catch (t) {
			z(t, e.parent);
		} finally {
			In(n), W(r);
		}
	}
}
function wn(e, t = !1) {
	var n = e.first;
	for (e.first = e.last = null; n !== null;) {
		let e = n.ac;
		e !== null && it(() => {
			e.abort(he);
		});
		var r = n.next;
		n.f & 64 ? n.parent = null : V(n, t), n = r;
	}
}
function Tn(e) {
	for (var t = e.first; t !== null;) {
		var n = t.next;
		t.f & 32 || V(t), t = n;
	}
}
function V(e, t = !0) {
	var n = !1;
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (En(e.nodes.start, e.nodes.end), n = !0), e.f |= x, wn(e, t && !n), Yn(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	Cn(e), e.f ^= x, e.f |= y;
	var i = e.parent;
	i !== null && i.first !== null && Dn(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function En(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ R(e);
		e.remove(), e = n;
	}
}
function Dn(e) {
	var t = e.parent, n = e.prev, r = e.next;
	n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n));
}
function On(e, t, n = !0) {
	var r = [];
	e.f |= 256, kn(e, r, !0);
	var i = () => {
		n && V(e), t && t();
	}, a = r.length;
	if (a > 0) {
		var o = () => --a || i();
		for (var s of r) s.out(o);
	} else i();
}
function kn(e, t, n) {
	if (!(e.f & 8192)) {
		e.f ^= v;
		var r = e.nodes && e.nodes.t;
		if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
		for (var i = e.first; i !== null;) {
			var a = i.next;
			if (!(i.f & 64)) {
				var o = !!(i.f & 65536) || !!(i.f & 32) && !!(e.f & 16);
				kn(i, t, o ? n : !1);
			}
			i = a;
		}
	}
}
function An(e) {
	e.f &= -257, jn(e, !0);
}
function jn(e, t) {
	if (!(e.f & 256) && e.f & 8192) {
		e.f ^= v, e.f & 1024 || (k(e, g), kt.ensure().schedule(e));
		for (var n = e.first; n !== null;) {
			var r = n.next, i = !!(n.f & 65536) || !!(n.f & 32);
			jn(n, i ? t : !1), n = r;
		}
		var a = e.nodes && e.nodes.t;
		if (a !== null) for (let e of a) (e.is_global || t) && e.in();
	}
}
function Mn(e, t) {
	if (e.nodes) for (var n = e.nodes.start, r = e.nodes.end; n !== null;) {
		var i = n === r ? null : /* @__PURE__ */ R(n);
		t.append(n), n = i;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/legacy.js
var Nn = null, Pn = !1, Fn = !1;
function In(e) {
	Fn = e;
}
var H = null, U = !1;
function W(e) {
	H = e;
}
var G = null;
function K(e) {
	G = e;
}
var q = null;
function Ln(e) {
	H !== null && (H.f & 2097152 || H.f & 2) && (q ??= /* @__PURE__ */ new Set()).add(e);
}
var J = null, Y = 0, X = null;
function Rn(e) {
	X = e;
}
var zn = 1, Bn = 0, Vn = Bn;
function Hn(e) {
	Vn = e;
}
function Un() {
	return ++zn;
}
function Wn(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (Wn(a) && _t(a), a.wv > e.wv) return !0;
		}
		t & 512 && j === null && k(e, h);
	}
	return !1;
}
function Gn(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(q !== null && q.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? Gn(a, t, !1) : t === a && (n ? k(a, g) : a.f & 1024 && k(a, _), Nt(a));
	}
}
function Kn(e) {
	var t = J, n = Y, r = X, i = H, a = q, o = D, s = U, c = Vn, l = e.f;
	J = null, Y = 0, X = null, H = l & 96 ? null : e, q = null, We(e.ctx), U = !1, Vn = ++Bn, e.ac !== null && (it(() => {
		e.ac.abort(he);
	}), e.ac = null);
	try {
		e.f |= re;
		var u = e.fn, d = u();
		e.f |= b;
		var f = qn(e);
		if (Je() && X !== null && !U && f !== null && !(e.f & 6146)) for (var p = 0; p < X.length; p++) Gn(X[p], e);
		if (i !== null && i !== e) {
			if (Bn++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = Bn;
			if (t !== null) for (let e of t) e.rv = Bn;
			X !== null && (r === null ? r = X : r.push(...X));
		}
		return e.f & 8388608 && (e.f ^= ae), d;
	} catch (t) {
		return qn(e), ln(t);
	} finally {
		e.f ^= re, J = t, Y = n, X = r, H = i, q = a, We(o), U = s, Vn = c;
	}
}
function qn(e) {
	var t = e.deps, n = A?.is_fork;
	if (J !== null) {
		var r;
		if (n || Yn(e, Y), t !== null && Y > 0) for (t.length = Y + J.length, r = 0; r < J.length; r++) t[Y + r] = J[r];
		else e.deps = t = J;
		if (pn() && e.f & 512) for (r = Y; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && Y < t.length && (Yn(e, Y), t.length = Y);
	return t;
}
function Jn(e, r) {
	let i = r.reactions;
	if (i !== null) {
		var a = t.call(i, e);
		if (a !== -1) {
			var o = i.length - 1;
			o === 0 ? i = r.reactions = null : (i[a] = i[o], i.pop());
		}
	}
	if (i === null && r.f & 2 && (J === null || !n.call(J, r))) {
		var s = r;
		s.f & 512 && (s.f ^= 512), s.v !== C && $e(s), s.ac !== null && it(() => {
			s.ac.abort(he), s.ac = null, k(s, g);
		}), vt(s), Yn(s, 0);
	}
}
function Yn(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) Jn(e, n[r]);
}
function Xn(e) {
	var t = e.f;
	if (!(t & 16384)) {
		k(e, h);
		var n = G, r = Pn;
		G = e, Pn = !(t & 96);
		try {
			t & 16777232 ? Tn(e) : wn(e), Cn(e);
			var i = Kn(e);
			e.teardown = typeof i == "function" ? i : null, e.wv = zn;
		} finally {
			Pn = r, G = n;
		}
	}
}
async function Zn() {
	await Promise.resolve(), At();
}
function Z(e) {
	var t = !!(e.f & 2);
	if (Nn?.add(e), H !== null && !U && !(G !== null && G.f & 16384) && (q === null || !q.has(e))) {
		var r = H.deps;
		if (H.f & 2097152) e.rv < Bn && (e.rv = Bn, J === null && r !== null && r[Y] === e ? Y++ : J === null ? J = [e] : J.push(e));
		else {
			H.deps ??= [], n.call(H.deps, e) || H.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [H] : n.call(i, H) || i.push(H);
		}
	}
	if (Fn && N.has(e)) return N.get(e);
	if (t) {
		var a = e;
		if (Fn) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || $n(a)) && (o = gt(a)), N.set(a, o), o;
		}
		var s = !(a.f & 512) && !U && H !== null && (Pn || !!(H.f & 512)), c = (a.f & b) === 0;
		Wn(a) && (s && (a.f |= 512), _t(a)), s && !c && (yt(a), Qn(a));
	}
	if (j?.has(e)) return j.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function Qn(e) {
	if (e.f |= 512, e.deps !== null) for (let t of e.deps) (t.reactions ??= []).push(e), t.f & 2 && !(t.f & 512) && (yt(t), Qn(t));
}
function $n(e) {
	if (e.v === C) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (N.has(t) || t.f & 2 && $n(t)) return !0;
	return !1;
}
function er(e) {
	var t = U;
	try {
		return U = !0, e();
	} finally {
		U = t;
	}
}
[.../* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split(".")];
var tr = ["touchstart", "touchmove"];
function nr(e) {
	return tr.includes(e);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dev/css.js
var rr = Symbol("events"), ir = /* @__PURE__ */ new Set(), ar = /* @__PURE__ */ new Set();
function or(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || fr.call(t, e), !e.cancelBubble) return it(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, O(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function sr(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = or(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && mn(() => {
		o.__removed = !0, t.removeEventListener(e, o, a);
	});
}
function cr(e, t, n) {
	(t[rr] ??= {})[e] = n;
}
function lr(e) {
	for (var t = 0; t < e.length; t++) ir.add(e[t]);
	for (var n of ar) n(e);
}
var ur = null, dr = !1;
function fr(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	ur = e, dr || (dr = !0, setTimeout(() => {
		dr = !1, ur = null;
	}));
	var s = 0, c = ur === e && e[rr];
	if (c) {
		var l = a.indexOf(c);
		if (l !== -1 && (t === document || t === window)) {
			e[rr] = t;
			return;
		}
		var u = a.indexOf(t);
		if (u === -1) return;
		l <= u && (s = l);
	}
	if (o = a[s] || e.target, o !== t) {
		i(e, "currentTarget", {
			configurable: !0,
			get() {
				return o || n;
			}
		});
		var d = H, f = G;
		W(null), K(null);
		try {
			for (var p, m = []; o !== null && o !== t;) {
				try {
					var h = o[rr]?.[r];
					h != null && (!o.disabled || e.target === o) && h.call(o, e);
				} catch (e) {
					p ? m.push(e) : p = e;
				}
				if (e.cancelBubble) break;
				s++, o = s < a.length ? a[s] : null;
			}
			if (p) {
				for (let e of m) queueMicrotask(() => {
					throw e;
				});
				throw p;
			}
		} finally {
			e[rr] = t, delete e.currentTarget, W(d), K(f);
		}
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/reconciler.js
var pr = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function mr(e) {
	return pr?.createHTML(e) ?? e;
}
function hr(e) {
	var t = sn("template");
	return t.innerHTML = mr(e.replaceAll("<!>", "<!---->")), t.content;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/template.js
function Q(e, t) {
	var n = G;
	n.nodes === null && (n.nodes = {
		start: e,
		end: t,
		a: null,
		t: null
	});
}
/*#__NO_SIDE_EFFECTS__*/
function gr(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (w) return Q(T, null), T;
		i === void 0 && (i = hr(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ L(i)));
		var t = r || Xt ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ L(t), s = t.lastChild;
			Q(o, s);
		} else Q(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function _r(e, t, n = "svg") {
	var r = !e.startsWith("<!>"), i = !!(t & 1), a = `<${n}>${r ? e : "<!>" + e}</${n}>`, o;
	return () => {
		if (w) return Q(T, null), T;
		if (!o) {
			var e = /* @__PURE__ */ L(hr(a));
			if (i) for (o = document.createDocumentFragment(); /* @__PURE__ */ L(e);) o.appendChild(/* @__PURE__ */ L(e));
			else o = /* @__PURE__ */ L(e);
		}
		var t = o.cloneNode(!0);
		if (i) {
			var n = /* @__PURE__ */ L(t), r = t.lastChild;
			Q(n, r);
		} else Q(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function vr(e, t) {
	return /* @__PURE__ */ _r(e, t, "svg");
}
function yr(e = "") {
	if (!w) {
		var t = I(e + "");
		return Q(t, t), t;
	}
	var n = T;
	return n.nodeType === 3 ? cn(n) : (n.before(n = I()), E(n)), Q(n, n), n;
}
function br() {
	if (w) return Q(T, null), T;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = I();
	return e.append(t, n), Q(t, n), e;
}
function xr(e, t) {
	if (w) {
		var n = G;
		(!(n.f & 32768) || n.nodes.end === null) && (n.nodes.end = T), we();
		return;
	}
	e !== null && e.before(t);
}
//#endregion
//#region ui/node_modules/svelte/src/reactivity/create-subscriber.js
function Sr(e) {
	let t = 0, n = Rt(0), r;
	return () => {
		pn() && (Z(n), bn(() => (t === 0 && (r = er(() => e(() => Wt(n)))), t += 1, () => {
			O(() => {
				--t, t === 0 && (r?.(), r = void 0, Wt(n));
			});
		})));
	};
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var Cr = S | ee;
function wr(e, t, n, r) {
	new Tr(e, t, n, r);
}
var Tr = class {
	parent;
	is_pending = !1;
	transform_error;
	#e;
	#t = w ? T : null;
	#n;
	#r;
	#i;
	#a = null;
	#o = null;
	#s = null;
	#c = null;
	#l = 0;
	#u = 0;
	#d = !1;
	#f = /* @__PURE__ */ new Set();
	#p = /* @__PURE__ */ new Set();
	#m = null;
	#h = Sr(() => (this.#m = Rt(this.#l), () => {
		this.#m = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = G;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = G.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = Sn(() => {
			if (w) {
				let e = this.#t;
				we();
				let t = e.data === "[!";
				if (e.data.startsWith("[?")) {
					let t = JSON.parse(e.data.slice(2));
					this.#_(t);
				} else t ? this.#y() : this.#g();
			} else this.#b();
		}, Cr), w && (this.#e = T);
	}
	#g() {
		try {
			this.#a = B(() => this.#r(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#_(e) {
		let t = this.#n.failed, { reset: n, invoke_onerror: r } = this.#v(e);
		O(r), t && (this.#s = B(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#v(e) {
		var t = !1, n = !1;
		let r = () => {
			if (t) {
				Se();
				return;
			}
			t = !0, n && Ue(), this.#s !== null && On(this.#s, () => {
				this.#s = null;
			}), this.#S(() => {
				this.#b();
			});
		};
		return {
			reset: r,
			invoke_onerror: () => {
				try {
					n = !0, this.#n.onerror?.(e, r), n = !1;
				} catch (e) {
					z(e, this.#i && this.#i.parent);
				}
			}
		};
	}
	#y() {
		let e = this.#n.pending;
		e && (this.is_pending = !0, this.#o = B(() => e(this.#e)), O(() => {
			var e = this.#c = document.createDocumentFragment(), t = I(), n = !1;
			if (e.append(t), this.#a = this.#S(() => {
				try {
					return B(() => this.#r(t));
				} catch (e) {
					try {
						this.error(e), n = !0;
					} catch (e) {
						z(e, this.#i.parent);
					}
					return null;
				}
			}), this.#a === null) {
				this.#c = null, n && this.#x(A);
				return;
			}
			this.#u === 0 && (this.#e.before(e), this.#c = null, On(this.#o, () => {
				this.#o = null;
			}), this.#x(A));
		}));
	}
	#b() {
		try {
			if (this.is_pending = this.has_pending_snippet(), this.#u = 0, this.#l = 0, this.#a = B(() => {
				this.#r(this.#e);
			}), this.#u > 0) {
				var e = this.#c = document.createDocumentFragment();
				Mn(this.#a, e);
				let t = this.#n.pending;
				this.#o = B(() => t(this.#e));
			} else this.#x(A);
		} catch (e) {
			this.error(e);
		}
	}
	#x(e) {
		this.is_pending = !1, e.transfer_effects(this.#f, this.#p);
	}
	defer_effect(e) {
		et(e, this.#f, this.#p);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#n.pending;
	}
	#S(e) {
		var t = G, n = H, r = D;
		K(this.#i), W(this.#i), We(this.#i.ctx);
		try {
			return kt.ensure(), e();
		} finally {
			K(t), W(n), We(r);
		}
	}
	#C(e, t) {
		if (!this.has_pending_snippet()) {
			this.parent && this.parent.#C(e, t);
			return;
		}
		this.#u += e, this.#u === 0 && (this.#x(t), this.#o && On(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null));
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !(!this.#m || this.#d) && (this.#d = !0, O(() => {
			this.#d = !1, this.#m && Ht(this.#m, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#h(), Z(this.#m);
	}
	error(e) {
		if (!this.#n.onerror && !this.#n.failed) throw e;
		A?.is_fork ? (this.#a && A.skip_effect(this.#a), this.#o && A.skip_effect(this.#o), this.#s && A.skip_effect(this.#s), A.oncommit(() => {
			this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (V(this.#a), null), this.#o &&= (V(this.#o), null), this.#s &&= (V(this.#s), null), w && (E(this.#t), Ee(), E(De()));
		let t = this.#n.failed, n = (e) => {
			let { reset: n, invoke_onerror: r } = this.#v(e);
			r(), t && (this.#s = this.#S(() => {
				try {
					return B(() => {
						var r = G;
						r.b = this, r.f |= 128, t(this.#e, () => e, () => n);
					});
				} catch (e) {
					return z(e, this.#i.parent), null;
				}
			}));
		};
		O(() => {
			var t;
			try {
				t = this.transform_error(e);
			} catch (e) {
				z(e, this.#i && this.#i.parent);
				return;
			}
			typeof t == "object" && t && typeof t.then == "function" ? t.then(n, (e) => z(e, this.#i && this.#i.parent)) : n(t);
		});
	}
};
function Er(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[pe] ??= e.nodeValue) && (e[pe] = n, e.nodeValue = `${n}`);
}
function Dr(e, t) {
	return kr(e, t);
}
var Or = /* @__PURE__ */ new Map();
function kr(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	$t();
	var l = void 0, u = _n(() => {
		var s = n ?? t.appendChild(I());
		wr(s, { pending: () => {} }, (t) => {
			Ge({});
			var n = D;
			if (o && (n.c = o), a && (i.$$events = a), w && Q(t, null), l = e(t, i) || qe(), w && (G.nodes.end = T, T === null || T.nodeType !== 8 || T.data !== "]")) throw be(), _e;
			Ke();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = nr(r);
					for (let e of [t, document]) {
						var a = Or.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), Or.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, fr, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(ir)), ar.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = Or.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, fr), r.delete(e), r.size === 0 && Or.delete(n)) : r.set(e, i);
			}
			ar.delete(d), s !== n && s.parentNode?.removeChild(s);
		};
	});
	return Ar.set(l, u), l;
}
var Ar = /* @__PURE__ */ new WeakMap();
function jr(e, t) {
	let n = Ar.get(e);
	return n ? (Ar.delete(e), n(t)) : Promise.resolve();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/branches.js
var Mr = class {
	anchor;
	#e = /* @__PURE__ */ new Map();
	#t = /* @__PURE__ */ new Map();
	#n = /* @__PURE__ */ new Map();
	#r = /* @__PURE__ */ new Set();
	#i = !0;
	constructor(e, t = !0) {
		this.anchor = e, this.#i = t;
	}
	#a = (e) => {
		if (this.#e.has(e)) {
			var t = this.#e.get(e), n = this.#t.get(t);
			if (n) An(n), this.#r.delete(t);
			else {
				var r = this.#n.get(t);
				r && (An(r.effect), this.#t.set(t, r.effect), this.#n.delete(t), r.fragment.lastChild.remove(), this.anchor.before(r.fragment), n = r.effect);
			}
			for (let [t, n] of this.#e) {
				if (this.#e.delete(t), t === e) break;
				let r = this.#n.get(n);
				r && (V(r.effect), this.#n.delete(n));
			}
			for (let [e, r] of this.#t) {
				if (e === t || this.#r.has(e)) continue;
				let i = () => {
					if (Array.from(this.#e.values()).includes(e)) {
						var t = document.createDocumentFragment();
						Mn(r, t), t.append(I()), this.#n.set(e, {
							effect: r,
							fragment: t
						});
					} else V(r);
					this.#r.delete(e), this.#t.delete(e);
				};
				this.#i || !n ? (this.#r.add(e), On(r, i, !1)) : i();
			}
		}
	};
	#o = (e) => {
		this.#e.delete(e);
		let t = Array.from(this.#e.values());
		for (let [e, n] of this.#n) t.includes(e) || (V(n.effect), this.#n.delete(e));
	};
	ensure(e, t) {
		var n = A, r = on();
		if (t && !this.#t.has(e) && !this.#n.has(e)) {
			if (r) {
				var i = document.createDocumentFragment(), a = I();
				i.append(a), this.#n.set(e, {
					effect: B(() => t(a)),
					fragment: i
				});
			} else this.#t.set(e, B(() => t(this.anchor)));
		}
		if (this.#e.set(n, e), r) {
			for (let [t, r] of this.#t) t === e ? n.unskip_effect(r) : n.skip_effect(r);
			for (let [t, r] of this.#n) t === e ? n.unskip_effect(r.effect) : n.skip_effect(r.effect);
			n.oncommit(this.#a), n.ondiscard(this.#o);
		} else w && (this.anchor = T), this.#a(n);
	}
};
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/if.js
function Nr(e, t, n = !1) {
	var r;
	w && (r = T, we());
	var i = new Mr(e), a = n ? S : 0;
	function o(e, t) {
		if (w) {
			var n = Oe(r);
			if (e !== parseInt(n.substring(1))) {
				var a = De();
				E(a), i.anchor = a, Ce(!1), i.ensure(e, t), Ce(!0);
				return;
			}
		}
		i.ensure(e, t);
	}
	Sn(() => {
		var e = !1;
		t((t, n = 0) => {
			e = !0, o(n, t);
		}), e || o(-1, null);
	}, a);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/key.js
var Pr = Symbol("NaN");
function Fr(e, t, n) {
	w && we();
	var r = new Mr(e), i = !Je();
	Sn(() => {
		var e = t();
		e !== e && (e = Pr), i && typeof e == "object" && e && (e = {}), r.ensure(e, n);
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/each.js
function Ir(e, t) {
	return t;
}
function Lr(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		On(n, () => {
			if (o) {
				if (o.pending.delete(n), o.done.add(n), o.pending.size === 0) {
					var t = e.outrogroups;
					Rr(e, r(o.done)), t.delete(o), t.size === 0 && (e.outrogroups = null);
				}
			} else --s;
		}, !1);
	}
	if (s === 0) {
		var l = i.length === 0 && n !== null && e.pending.size === 0;
		if (l) {
			var u = n, d = u.parentNode;
			an(d), d.append(u), e.items.clear();
		}
		Rr(e, t, !l);
	} else o = {
		pending: new Set(t),
		done: /* @__PURE__ */ new Set()
	}, (e.outrogroups ??= /* @__PURE__ */ new Set()).add(o);
}
function Rr(e, t, n = !0) {
	var r;
	if (e.pending.size > 0) {
		r = /* @__PURE__ */ new Set();
		for (let t of e.pending.values()) for (let n of t) r.add(e.items.get(n).e);
	}
	for (var i = 0; i < t.length; i++) {
		var a = t[i];
		r?.has(a) ? (a.f |= ne, Mn(a, document.createDocumentFragment())) : V(t[i], n);
	}
}
var zr;
function Br(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = w ? E(/* @__PURE__ */ L(u)) : u.appendChild(I());
	}
	w && we();
	var d = null, f = /* @__PURE__ */ mt(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p, m = /* @__PURE__ */ new Map(), h = !0;
	function g(e) {
		v.effect.f & 16384 || (v.pending.delete(e), v.fallback = d, Hr(v, p, c, n, a), d !== null && (p.length === 0 ? d.f & 33554432 ? (d.f ^= ne, Wr(d, null, c)) : An(d) : On(d, () => {
			d = null;
		})));
	}
	function _(e) {
		v.pending.delete(e);
	}
	var v = {
		effect: Sn(() => {
			p = Z(f);
			var e = p.length;
			let t = !1;
			w && Oe(c) === "[!" != (e === 0) && (c = De(), E(c), Ce(!1), t = !0);
			for (var r = /* @__PURE__ */ new Set(), u = A, v = on(), y = 0; y < e; y += 1) {
				w && T.nodeType === 8 && T.data === "]" && (c = T, t = !0, Ce(!1));
				var b = p[y], x = a(b, y), S = h ? null : l.get(x);
				S ? (S.v && Ht(S.v, b), S.i && Ht(S.i, y), v && u.unskip_effect(S.e)) : (S = Ur(l, h ? c : zr ??= I(), b, x, y, o, n, i), h || (S.e.f |= ne), l.set(x, S)), r.add(x);
			}
			if (e === 0 && s && !d && (h ? d = B(() => s(c)) : (d = B(() => s(zr ??= I())), d.f |= ne)), e > r.size && Pe("", "", ""), w && e > 0 && E(De()), !h) {
				if (m.set(u, r), v) {
					for (let [e, t] of l) r.has(e) || u.skip_effect(t.e);
					u.oncommit(g), u.ondiscard(_);
				} else g(u);
			}
			t && Ce(!0), Z(f);
		}),
		flags: n,
		items: l,
		pending: m,
		outrogroups: null,
		fallback: d
	};
	h = !1, w && (c = T);
}
function Vr(e) {
	for (; e !== null && !(e.f & 32);) e = e.next;
	return e;
}
function Hr(e, t, n, i, a) {
	var o = !!(i & 8), s = t.length, c = e.items, l = Vr(e.effect.first), u, d = null, f, p = [], m = [], h, g, _, v;
	if (o) for (v = 0; v < s; v += 1) h = t[v], g = a(h, v), _ = c.get(g).e, _.f & 33554432 || (_.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(_));
	for (v = 0; v < s; v += 1) {
		if (h = t[v], g = a(h, v), _ = c.get(g).e, e.outrogroups !== null) for (let t of e.outrogroups) t.pending.delete(_), t.done.delete(_);
		if (_.f & 8192 && (An(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= ne, _ === l) Wr(_, null, n);
			else {
				var y = d ? d.next : l;
				_ === e.effect.last && (e.effect.last = _.prev), _.prev && (_.prev.next = _.next), _.next && (_.next.prev = _.prev), Gr(e, d, _), Gr(e, _, y), Wr(_, y, n), d = _, p = [], m = [], l = Vr(d.next);
				continue;
			}
		}
		if (_ !== l) {
			if (u !== void 0 && u.has(_)) {
				if (p.length < m.length) {
					var b = m[0], x;
					d = b.prev;
					var S = p[0], ee = p[p.length - 1];
					for (x = 0; x < p.length; x += 1) Wr(p[x], b, n);
					for (x = 0; x < m.length; x += 1) u.delete(m[x]);
					Gr(e, S.prev, ee.next), Gr(e, d, S), Gr(e, ee, b), l = b, d = ee, --v, p = [], m = [];
				} else u.delete(_), Wr(_, l, n), Gr(e, _.prev, _.next), Gr(e, _, d === null ? e.effect.first : d.next), Gr(e, d, _), d = _;
				continue;
			}
			for (p = [], m = []; l !== null && l !== _;) (u ??= /* @__PURE__ */ new Set()).add(l), m.push(l), l = Vr(l.next);
			if (l === null) continue;
		}
		_.f & 33554432 || p.push(_), d = _, l = Vr(_.next);
	}
	if (e.outrogroups !== null) {
		for (let t of e.outrogroups) t.pending.size === 0 && (Rr(e, r(t.done)), e.outrogroups?.delete(t));
		e.outrogroups.size === 0 && (e.outrogroups = null);
	}
	if (l !== null || u !== void 0) {
		var te = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || te.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && te.push(l), l = Vr(l.next);
		var re = te.length;
		if (re > 0) {
			var ie = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.measure();
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.fix();
			}
			Lr(e, te, ie);
		}
	}
	o && O(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function Ur(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? Rt(n) : /* @__PURE__ */ zt(n, !1, !1) : null, l = o & 2 ? Rt(i) : null;
	return {
		v: c,
		i: l,
		e: B(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function Wr(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ R(r);
		if (a.before(r), r === i) return;
		r = o;
	}
}
function Gr(e, t, n) {
	t === null ? e.effect.first = n : t.next = n, n === null ? e.effect.last = t : n.prev = t;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/css.js
function Kr(e, t) {
	vn(() => {
		e = G?.parent?.nodes?.start ?? e;
		var n = e.getRootNode(), r = n.host ? n : n.head ?? n.ownerDocument.head;
		if (!r.querySelector("#" + t.hash)) {
			let e = sn("style");
			e.id = t.hash, e.textContent = t.code, r.appendChild(e);
		}
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/shared/attributes.js
var qr = [..." 	\n\r\f\xA0\v﻿"];
function Jr(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || qr.includes(r[o - 1])) && (s === r.length || qr.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function Yr(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function Xr(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function Zr(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map(Xr)), i && c.push(...Object.keys(i).map(Xr));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = Xr(e.substring(l, u).trim());
							if (!c.includes(p)) {
								f !== ";" && d++;
								var m = e.substring(l, d).trim();
								n += " " + m + ";";
							}
						}
						l = d + 1, u = -1;
					}
				}
			}
		}
		return r && (n += Yr(r)), i && (n += Yr(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/class.js
function Qr(e, t, n, r, i, a) {
	var o = e[de];
	if (w || o !== n || o === void 0) {
		var s = Jr(n, r, a);
		(!w || s !== e.getAttribute("class")) && (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[de] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/style.js
function $r(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function ei(e, t, n, r) {
	var i = e[fe];
	if (w || i !== t) {
		var a = Zr(t, r);
		(!w || a !== e.getAttribute("style")) && (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[fe] = t;
	} else r && (Array.isArray(r) ? ($r(e, n?.[0], r[0]), $r(e, n?.[1], r[1], "important")) : $r(e, n, r));
	return r;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
function ti(e, t) {
	t ? e.hasAttribute("selected") || e.setAttribute("selected", "") : e.removeAttribute("selected");
}
function ni(t, n) {
	var r = t.__defaultValue, i = t.multiple, a = i ? r ?? [] : null;
	if (!i || e(a)) {
		var o = t.selectedIndex, s = n && i ? new Set(t.selectedOptions) : null;
		for (var c of t.options) {
			var l = oi(c);
			ti(c, i ? a.includes(l) : Jt(l, r));
		}
		if (n) {
			if (s !== null) for (c of t.options) {
				var u = s.has(c);
				c.selected !== u && (c.selected = u);
			}
			else t.selectedIndex !== o && (t.selectedIndex = o);
		}
	}
}
function ri(t, n, r = !1) {
	if (t.multiple) {
		if (n == null) return;
		if (!e(n)) return xe();
		for (var i of t.options) i.selected = n.includes(oi(i));
		return;
	}
	for (i of t.options) if (Jt(oi(i), n)) {
		i.selected = !0;
		return;
	}
	(!r || n !== void 0) && (t.selectedIndex = -1);
}
function ii(e) {
	var t = new MutationObserver((t) => {
		t.every(si) || ("__defaultValue" in e && ni(e, !1), "__value" in e && ri(e, e.__value));
	});
	t.observe(e, {
		childList: !0,
		subtree: !0,
		attributes: !0,
		attributeFilter: ["value"]
	}), mn(() => {
		t.disconnect();
	});
}
function ai(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet(), i = !0;
	at(e, "change", (t) => {
		var i = t ? "[selected]" : ":checked", a;
		if (e.multiple) a = [].map.call(e.querySelectorAll(i), oi);
		else {
			var o = e.querySelector(i) ?? e.querySelector("option:not([disabled])");
			a = o && oi(o);
		}
		n(a), e.__value = a, A !== null && r.add(A);
	}), vn(() => {
		var a = t();
		if (e === document.activeElement) {
			var o = A;
			if (r.has(o)) return;
		}
		if (ri(e, a, i), i && a === void 0) {
			var s = e.querySelector(":checked");
			s !== null && (a = oi(s), n(a));
		}
		e.__value = a, i = !1;
	});
}
function oi(e) {
	return "__value" in e ? e.__value : e.value;
}
function si(e) {
	if (e.target.closest("selectedcontent") !== null) return !0;
	if (e.type === "childList") {
		var t = [...e.addedNodes, ...e.removedNodes];
		return t.length > 0 && t.every((e) => e.nodeName === "SELECTEDCONTENT");
	}
	return !1;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/attributes.js
var ci = Symbol("is custom element"), li = Symbol("is html"), ui = ge ? "link" : "LINK";
function di(e) {
	if (w) {
		var t = !1, n = () => {
			if (!t) {
				if (t = !0, e.hasAttribute("value")) {
					var n = e.value;
					pi(e, "value", null), e.value = n;
				}
				if (e.hasAttribute("checked")) {
					var r = e.checked;
					pi(e, "checked", null), e.checked = r;
				}
			}
		};
		e[me] = n, O(n), rt();
	}
}
function fi(e, t) {
	var n = mi(e);
	n.checked !== (n.checked = t ?? void 0) && (e.checked = t);
}
function pi(e, t, n, r) {
	var i = mi(e);
	w && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === ui) || i[t] !== (i[t] = n) && (t === "loading" && (e[le] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && gi(e).has(t) ? e[t] = n : e.setAttribute(t, n));
}
function mi(e) {
	return e[ue] ??= {
		[ci]: e.nodeName.includes("-"),
		[li]: e.namespaceURI === ve
	};
}
var hi = /* @__PURE__ */ new Map();
function gi(e) {
	var t = e.getAttribute("is") || e.nodeName, n = hi.get(t);
	if (n) return n;
	hi.set(t, n = /* @__PURE__ */ new Set());
	for (var r, i = e, a = Element.prototype; a !== i;) {
		for (var s in r = o(i), r) r[s].set && s !== "innerHTML" && s !== "textContent" && s !== "innerText" && n.add(s);
		i = l(i);
	}
	return n;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function _i(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet();
	at(e, "input", async (i) => {
		var a = i ? e.defaultValue : e.value;
		if (a = yi(e) ? bi(a) : a, n(a), A !== null && r.add(A), await Zn(), a !== (a = t())) {
			var o = e.selectionStart, s = e.selectionEnd, c = e.value.length;
			if (e.value = a ?? "", s !== null) {
				var l = e.value.length;
				o === s && s === c && l > c ? (e.selectionStart = l, e.selectionEnd = l) : (e.selectionStart = o, e.selectionEnd = Math.min(s, l));
			}
		}
	}), (w && e.defaultValue !== e.value || er(t) == null && e.value) && (n(yi(e) ? bi(e.value) : e.value), A !== null && r.add(A)), bn(() => {
		var n = t();
		if (e === document.activeElement) {
			var i = A;
			if (r.has(i)) return;
		}
		yi(e) && n === bi(e.value) || (e.type !== "date" || n || e.value) && n !== e.value && (e.value = n ?? "");
	});
}
function vi(e, t, n = t) {
	at(e, "change", (t) => {
		n(t ? e.defaultChecked : e.checked);
	}), (w && e.defaultChecked !== e.checked || er(t) == null) && n(e.checked), bn(() => {
		e.checked = !!t();
	});
}
function yi(e) {
	var t = e.type;
	return t === "number" || t === "range";
}
function bi(e) {
	return e === "" ? null : +e;
}
var xi = /* @__PURE__ */ new class e {
	#e = /* @__PURE__ */ new WeakMap();
	#t;
	#n;
	static entries = /* @__PURE__ */ new WeakMap();
	constructor(e) {
		this.#n = e;
	}
	observe(e, t) {
		var n = this.#e.get(e) || /* @__PURE__ */ new Set();
		return n.add(t), this.#e.set(e, n), this.#r().observe(e, this.#n), () => {
			var n = this.#e.get(e);
			n.delete(t), n.size === 0 && (this.#e.delete(e), this.#t.unobserve(e));
		};
	}
	#r() {
		return this.#t ??= new ResizeObserver((t) => {
			for (var n of t) {
				e.entries.set(n.target, n);
				for (var r of this.#e.get(n.target) || []) r(n);
			}
		});
	}
}({ box: "border-box" });
function Si(e, t, n) {
	var r = xi.observe(e, () => n(e[t]));
	vn(() => (er(() => n(e[t])), r));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function Ci(e, t) {
	return e === t || e?.[oe] === t;
}
function wi(e = qe(), t, n, r) {
	var i = D.r, a = G;
	return vn(() => {
		var o, s;
		return bn(() => {
			o = s, s = r?.() || [], er(() => {
				Ci(n(...s), e) || (t(e, ...s), o && Ci(n(...o), e) && t(null, ...o));
			});
		}), () => {
			let r = a;
			for (; r !== i && r.parent !== null && r.parent.f & 33554432;) r = r.parent;
			let o = () => {
				s && Ci(n(...s), e) && t(null, ...s);
			}, c = r.teardown;
			r.teardown = () => {
				o(), c?.();
			};
		};
	}), e;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/store.js
var Ti = !1;
function Ei(e) {
	var t = Ti;
	try {
		return Ti = !1, [e(), Ti];
	} finally {
		Ti = t;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/props.js
function Di(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ ut(r), Z(u)) : (l && (l = !1, c = s ? er(r) : r), c);
	let f;
	if (o) {
		var p = oe in e || ce in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = Ei(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && ze(t), f(m)));
	var g = i ? () => {
		var n = e[t];
		return n === void 0 ? d() : (l = !0, n);
	} : () => {
		var n = e[t];
		return n !== void 0 && (c = void 0), n === void 0 ? c : n;
	};
	if (i && !(n & 4)) return g;
	if (f) {
		var _ = e.$$legacy;
		return (function(e, t) {
			return arguments.length > 0 ? ((!i || !t || _ || h) && f(t ? g() : e), e) : g();
		});
	}
	var v = !1, y = (n & 1 ? ut : mt)(() => (v = !1, g()));
	o && Z(y);
	var b = G;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? Z(y) : i && o ? Kt(e) : e;
			return F(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return Fn && v || b.f & 16384 ? y.v : Z(y);
	});
}
function Oi(e) {
	D === null && Me("onMount"), hn(() => {
		let t = er(e);
		if (typeof t == "function") return t;
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
//#endregion
//#region plugins/stable/dav/ui/src/api.ts
var ki = "tasks", Ai = /https:\/\/(?:teams\.microsoft\.com\/(?:l\/meetup-join|meet)\/|teams\.live\.com\/meet\/|[\w.-]*zoom\.us\/(?:j|my|w)\/|meet\.google\.com\/[a-z]|[\w.-]*webex\.com\/(?:meet|join|[\w.-]+\/j\.php)|meet\.jit\.si\/)[^\s<>"')\]]*/i;
function ji(e) {
	for (let t of [
		e.location,
		e.url,
		e.description
	]) {
		let e = t?.match(Ai);
		if (e) return e[0].replace(/[.,;]+$/, "");
	}
	return null;
}
var Mi = Intl.DateTimeFormat().resolvedOptions().timeZone;
async function Ni(e, t, n = {}, r = 120) {
	try {
		return await e.helper.call(t, {
			tz: Mi,
			...n,
			settings: e.plugin.settings
		}, { timeout: r });
	} catch (e) {
		throw Error(String(e?.message ?? e).replace(/^.*?plugin [\w-]+: \w+: /s, "").replace(/^.*?(method|error): /i, ""));
	}
}
var Pi = 864e5, $ = (e) => new Date(e.getFullYear(), e.getMonth(), e.getDate()), Fi = (e, t) => new Date(e.getFullYear(), e.getMonth(), e.getDate() + t, e.getHours(), e.getMinutes()), Ii = (e, t) => new Date(e.getFullYear(), e.getMonth() + t, Math.min(e.getDate(), 28)), Li = (e, t) => e.getFullYear() === t.getFullYear() && e.getMonth() === t.getMonth() && e.getDate() === t.getDate(), Ri = (e) => String(e).padStart(2, "0"), zi = (e) => `${e.getFullYear()}-${Ri(e.getMonth() + 1)}-${Ri(e.getDate())}`, Bi = (e) => `${zi(e)}T${Ri(e.getHours())}:${Ri(e.getMinutes())}`;
function Vi(e) {
	if (e.length === 10) {
		let [t, n, r] = e.split("-").map(Number);
		return new Date(t, n - 1, r);
	}
	return new Date(e);
}
var Hi = (e) => Vi(e.start), Ui = (e) => Vi(e.end), Wi = (e) => e.all_day || Ui(e).getTime() - Hi(e).getTime() >= 864e5;
function Gi(e) {
	let t = {
		sunday: 0,
		monday: 1,
		saturday: 6
	};
	if (typeof e == "string" && e in t) return t[e];
	try {
		let e = new Intl.Locale(navigator.language), t = e.getWeekInfo?.().firstDay ?? e.weekInfo?.firstDay;
		if (t) return t % 7;
	} catch {}
	return 1;
}
function Ki(e, t) {
	let n = $(e);
	return Fi(n, -((n.getDay() - t + 7) % 7));
}
var qi = [
	["day", "Day"],
	["3days", "3 days"],
	["week", "Week"],
	["60days", "60 days"]
], Ji = (e) => qi.some(([t]) => t === e);
function Yi(e, t, n) {
	if (e === "week") {
		let e = Ki(t, n);
		return {
			from: e,
			to: Fi(e, 6)
		};
	}
	return {
		from: t,
		to: Fi(t, e === "day" ? 0 : e === "3days" ? 2 : 59)
	};
}
var Xi = (e) => e === "day" ? 1 : e === "3days" ? 3 : e === "week" ? 7 : 30;
function Zi(e) {
	return e === "12h";
}
var Qi = (e) => e ? { hour12: !0 } : { hourCycle: "h23" };
function $i(e, t) {
	return e.toLocaleTimeString(void 0, {
		hour: "2-digit",
		minute: "2-digit",
		...Qi(t)
	});
}
function ea(e, t) {
	let n = Hi(e), r = Ui(e), i = (e) => e.toLocaleDateString(void 0, {
		weekday: "short",
		day: "numeric",
		month: "short"
	});
	if (e.all_day) {
		let e = Fi(r, -1);
		return Li(n, e) ? `${i(n)} · all day` : `${i(n)} – ${i(e)}`;
	}
	return Li(n, r) || r.getHours() === 0 && r.getMinutes() === 0 && r.getTime() - n.getTime() < 864e5 ? `${i(n)} · ${$i(n, t)} – ${$i(r, t)}` : `${i(n)} ${$i(n, t)} – ${i(r)} ${$i(r, t)}`;
}
function ta(e) {
	let t = 0;
	for (let n of e) t = (t * 31 + n.charCodeAt(0)) % 360;
	return `hsl(${t} 62% 52%)`;
}
var na = (e) => e.source && !e.source.includes("@") && /\.md$/i.test(e.source) ? e.source : null;
function ra(e) {
	let t = [
		"SU",
		"MO",
		"TU",
		"WE",
		"TH",
		"FR",
		"SA"
	][e.getDay()], n = e.toLocaleDateString(void 0, { weekday: "long" });
	return [
		{
			value: "",
			label: "Does not repeat"
		},
		{
			value: "FREQ=DAILY",
			label: "Every day"
		},
		{
			value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
			label: "Every weekday (Mon–Fri)"
		},
		{
			value: `FREQ=WEEKLY;BYDAY=${t}`,
			label: `Every week on ${n}`
		},
		{
			value: "FREQ=MONTHLY",
			label: `Every month on the ${e.getDate()}`
		},
		{
			value: "FREQ=YEARLY",
			label: `Every year on ${e.toLocaleDateString(void 0, {
				day: "numeric",
				month: "long"
			})}`
		}
	];
}
function ia(e) {
	if (!e) return "";
	let t = Object.fromEntries(e.split(";").map((e) => e.split("="))), n = {
		DAILY: "day",
		WEEKLY: "week",
		MONTHLY: "month",
		YEARLY: "year"
	}[t.FREQ] ?? t.FREQ?.toLowerCase(), r = Number(t.INTERVAL ?? 1), i = r > 1 ? `Every ${r} ${n}s` : `Every ${n}`;
	return t.BYDAY && (i += ` on ${t.BYDAY.split(",").map((e) => e.slice(-2)).join(", ")}`), t.COUNT && (i += `, ${t.COUNT} times`), t.UNTIL && (i += `, until ${t.UNTIL.slice(0, 4)}-${t.UNTIL.slice(4, 6)}-${t.UNTIL.slice(6, 8)}`), i;
}
var aa = JSON.stringify({ dialog: "new-event" }), oa = (e = {}) => JSON.stringify({
	dialog: "new-event",
	...e
});
function sa(e) {
	try {
		let t = typeof e == "string" ? JSON.parse(e) : null;
		return t?.dialog === "new-event" ? {
			title: t.title,
			guests: t.guests,
			description: t.description
		} : null;
	} catch {
		return null;
	}
}
//#endregion
//#region plugins/stable/dav/ui/src/Icon.svelte
var ca = {
	calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
	back: "M15 18l-6-6 6-6",
	right: "M9 6l6 6-6 6",
	search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5",
	plus: "M12 5v14M5 12h14",
	x: "M6 6l12 12M18 6L6 18",
	refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
	menu: "M4 6h16M4 12h16M4 18h16",
	keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
	clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
	pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
	note: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
	repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
	trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
	pen: "M4 20h4L19 9l-4-4L4 16z",
	video: "M3 7h12v10H3zM15 10.5l6-3.5v10l-6-3.5",
	people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-5-6",
	text: "M4 6h16M4 12h16M4 18h10",
	gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z",
	rss: "M5 19h.01M5 12a7 7 0 0 1 7 7M5 5a14 14 0 0 1 14 14",
	mail: "M4 6h16v12H4zM4 7l8 6 8-6",
	link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
	backlink: "M21 3L11 13M11 7v6h6M19 14v6H4V5h6",
	sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"
}, la = /* @__PURE__ */ vr("<svg class=\"icon svelte-16m1c18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg>"), ua = {
	hash: "svelte-16m1c18",
	code: ".icon.svelte-16m1c18 {flex:none;display:block;}"
};
function da(e, t) {
	Kr(e, ua);
	let n = Di(t, "size", 3, 16), r = Di(t, "title", 3, "");
	var i = la(), a = nn(i);
	xn(() => {
		pi(i, "width", n()), pi(i, "height", n()), pi(i, "aria-hidden", r() ? void 0 : "true"), pi(i, "role", r() ? "img" : void 0), pi(i, "aria-label", r() || void 0), pi(a, "d", ca[t.name] ?? ca.calendar);
	}), xr(e, i);
}
function fa(e, t, n = 30, r = 14) {
	let i = $(t).getTime(), a = Fi($(t), 1).getTime(), o = new ma(), s = e.filter((e) => !Wi(e)).map((e) => ({
		e,
		s: Hi(e).getTime(),
		t: Math.max(Ui(e).getTime(), Hi(e).getTime() + 9e5)
	})).filter((e) => e.s < a && e.t > i).map((e) => ({
		e: e.e,
		top: (Math.max(e.s, i) - i) / 6e4,
		bottom: (Math.min(e.t, a) - i) / 6e4,
		startsBefore: e.s < i,
		endsAfter: e.t > a,
		depth: 0,
		host: null,
		col: 0,
		span: 1,
		cols: 1,
		box: pa,
		among: o,
		over: new ma()
	})).sort((e, t) => e.top - t.top || t.bottom - e.bottom), c = [];
	for (let e of s) {
		c = c.filter((t) => t.bottom > e.top);
		let t = null, r = null;
		for (let i of c) i.top <= e.top - n ? (!t || i.depth >= t.depth) && (t = i) : (!r || i.depth >= r.depth) && (r = i);
		t && t.among.hasFree(e.top) ? t = t.host : !t && r && (t = r.host), e.host = t, e.depth = t ? t.depth + 1 : 0, e.among = t ? t.over : o, e.among.add(e), c.push(e);
	}
	o.finish();
	for (let e of s) e.over.finish();
	for (let e of s) {
		let t = e.host ? {
			x: e.host.box.x,
			xpx: e.host.box.xpx + r,
			w: e.host.box.w,
			wpx: e.host.box.wpx - r
		} : pa, n = e.col / e.cols, i = e.span / e.cols;
		e.box = {
			x: t.x + n * t.w,
			xpx: t.xpx + n * t.wpx,
			w: i * t.w,
			wpx: i * t.wpx
		};
	}
	return s.map((e) => ({
		e: e.e,
		top: e.top,
		bottom: e.bottom,
		depth: e.depth,
		box: e.box,
		startsBefore: e.startsBefore,
		endsAfter: e.endsAfter
	}));
}
var pa = {
	x: 0,
	xpx: 0,
	w: 1,
	wpx: 0
}, ma = class {
	cluster = [];
	ends = [];
	end = -Infinity;
	hasFree(e) {
		return e < this.end && this.ends.length > 1 && this.ends.some((t) => t <= e);
	}
	add(e) {
		e.top >= this.end && this.finish();
		let t = this.ends.findIndex((t) => t <= e.top);
		t < 0 ? (t = this.ends.length, this.ends.push(e.bottom)) : this.ends[t] = e.bottom, e.col = t, this.cluster.push(e), this.end = Math.max(this.end, e.bottom);
	}
	finish() {
		let e = this.ends.length, t = this.ends.map(() => []);
		for (let e of this.cluster) t[e.col].push(e);
		for (let n of this.cluster) {
			n.cols = e;
			let r = n.col + 1;
			for (; r < e && !ha(t[r], n);) r++;
			n.span = r - n.col;
		}
		this.cluster = [], this.ends = [], this.end = -Infinity;
	}
};
function ha(e, t) {
	let n = 0, r = e.length;
	for (; n < r;) {
		let i = n + r >> 1;
		e[i].bottom <= t.top ? n = i + 1 : r = i;
	}
	return n < e.length && e[n].top < t.bottom;
}
function ga(e, t) {
	if (!t.length) return [];
	let n = $(t[0]).getTime(), r = (e) => Math.round((e - n) / Pi), i = e.filter(Wi).map((e) => {
		let t = Hi(e).getTime(), n = Ui(e).getTime() - 1;
		return {
			e,
			a: r($(new Date(t)).getTime()),
			b: r($(new Date(Math.max(t, n))).getTime())
		};
	}).filter((e) => e.b >= 0 && e.a < t.length).sort((e, t) => e.a - t.a || t.b - t.a - (e.b - e.a)), a = [];
	return i.map((e) => {
		let n = Math.max(0, e.a), r = Math.min(t.length - 1, e.b), i = a.findIndex((e) => e < n);
		return i < 0 ? (i = a.length, a.push(r)) : a[i] = r, {
			e: e.e,
			from: n,
			to: r,
			row: i,
			clippedStart: e.a < 0,
			clippedEnd: e.b > t.length - 1
		};
	});
}
function _a(e, t) {
	let n = $(t).getTime(), r = Fi($(t), 1).getTime();
	return e.filter((e) => {
		let t = Hi(e).getTime(), i = Math.max(Ui(e).getTime(), t + 1);
		return t < r && i > n;
	});
}
//#endregion
export { Er as $, Bi as A, pi as B, ra as C, Ke as Ct, $ as D, m as Dt, ea as E, Te as Et, wi as F, ei as G, ai as H, Si as I, Br as J, Qr as K, vi as L, zi as M, Oi as N, Ki as O, Di as P, Dr as Q, _i as R, na as S, tt as St, Li as T, Ee as Tt, ii as U, fi as V, ri as W, Fr as X, Ir as Y, Nr as Z, Ji as _, rn as _t, aa as a, yr as at, oa as b, P as bt, Fi as c, sr as ct, Xi as d, xn as dt, jr as et, Ni as f, hn as ft, ta as g, nn as gt, Zi as h, tn as ht, da as i, vr as it, Gi as j, $i as k, Ii as l, Z as lt, Hi as m, en as mt, ga as n, br as nt, qi as o, lr as ot, Ui as p, Yt as pt, Kr as q, _a as r, gr as rt, ki as s, cr as st, fa as t, xr as tt, Yi as u, er as ut, Wi as v, Kt as vt, ia as w, Ge as wt, sa as x, pt as xt, ji as y, F as yt, di as z };
