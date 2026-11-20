// ui/node_modules/svelte/src/internal/shared/utils.js
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
// ui/node_modules/svelte/src/internal/client/dom/hydration.js
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
// ui/node_modules/svelte/src/internal/client/reactivity/equality.js
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
// ui/node_modules/svelte/src/internal/client/errors.js
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
// ui/node_modules/svelte/src/internal/client/context.js
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
		r: K,
		l: null
	};
}
function Ke(e) {
	var t = D, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) hn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, D = t.p, qe(e);
}
function qe(e = {}) {
	return i(e, se, { value: !0 }), e;
}
function Je() {
	return !0;
}
// ui/node_modules/svelte/src/internal/client/dom/task.js
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
// ui/node_modules/svelte/src/internal/client/reactivity/status.js
var Qe = ~(g | _ | h);
function k(e, t) {
	e.f = e.f & Qe | t;
}
function $e(e) {
	e.f & 512 || e.deps === null ? k(e, h) : k(e, _);
}
// ui/node_modules/svelte/src/internal/client/reactivity/utils.js
function et(e, t) {
	e.f & 2048 ? t.set(e, g) : e.f & 4096 && t.get(e) !== 2048 && t.set(e, _), k(e, h);
}
// ui/node_modules/svelte/src/internal/client/dom/elements/misc.js
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
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function it(e) {
	var t = U, n = K;
	G(null), q(null);
	try {
		return e();
	} finally {
		G(t), q(n);
	}
}
function at(e, t, n, r = n) {
	e.addEventListener(t, () => it(n));
	let i = e[me];
	e[me] = i ? () => {
		i(), r(!0);
	} : () => r(!0), rt();
}
// ui/node_modules/svelte/src/internal/client/reactivity/async.js
function ot(e, t, n, r) {
	let i = Je() ? ut : mt;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = K, c = st(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
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
		s.f & 16384 ? d() : (c(), f(), ct());
	}) : f();
}
function st() {
	var e = K, t = U, n = D, r = A;
	return function(i = !0) {
		q(e), G(t), We(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function ct(e = !0) {
	q(null), G(null), We(null), e && A?.deactivate();
}
function lt() {
	var e = K, t = e.b, n = A, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function ut(e) {
	var t = 2 | g;
	return K !== null && (K.f |= ee), {
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
		parent: K,
		ac: null
	};
}
var dt = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function ft(e, t, n) {
	let r = K;
	r === null && Ne();
	var i = void 0, a = Rt(C), o = !U, s = /* @__PURE__ */ new Set();
	return vn(() => {
		var t = K, n = p();
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
	}), pn(() => {
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
	return Fn(t), t;
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
		for (var n = 0; n < t.length; n += 1) H(t[n]);
	}
}
function gt(e) {
	var t, n = K, r = e.parent;
	if (!Nn && r !== null && e.v !== C && r.f & 24576) return ye(), e.v;
	q(r);
	try {
		ht(e), t = Wn(e);
	} finally {
		q(n);
	}
	return t;
}
function _t(e) {
	var t = gt(e);
	!e.equals(t) && (e.wv = Vn(), (!A?.is_fork || e.deps === null) && (A === null ? e.v = t : (A.capture(e, t, !0), xt?.capture(e, t, !0)), e.deps === null)) ? k(e, h) : Nn || (j === null ? $e(e) : (fn() || A?.is_fork) && j.set(e, t));
}
function vt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && it(() => {
		t.ac.abort(he), t.ac = null;
	}), t.fn !== null && (t.teardown = d), qn(t, 0), Cn(t));
}
function yt(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && Jn(t);
}
// ui/node_modules/svelte/src/internal/client/reactivity/batch.js
var bt = null, A = null, xt = null, j = null, St = null, Ct = !1, wt = !1, Tt = null, Et = null, Dt = 0, Ot = 1, kt = class e {
	id = Ot++;
	started = !1;
	linked = !0;
	prev = null;
	next = null;
	async_deriveds = /* @__PURE__ */ new Map();
	current = /* @__PURE__ */ new Map();
	previous = /* @__PURE__ */ new Map();
	#e = /* @__PURE__ */ new Set();
	#t = /* @__PURE__ */ new Set();
	#n = 0;
	#r = /* @__PURE__ */ new Map();
	#i = null;
	#a = [];
	#o = [];
	#s = /* @__PURE__ */ new Map();
	#c = /* @__PURE__ */ new Map();
	#l = /* @__PURE__ */ new Set();
	is_fork = !1;
	#u = !1;
	constructor() {
		bt === null ? bt = this : (bt.next = this, this.prev = bt), bt = this;
	}
	#d() {
		if (this.is_fork) return !0;
		for (let e of this.#r.keys()) if (!this.#f(e)) return !0;
		return !1;
	}
	#f(e) {
		for (var t = e; t !== null; t = t.parent) if (this.#c.has(t)) return !0;
		return !1;
	}
	skip_effect(e) {
		this.#c.has(e) || this.#c.set(e, {
			d: [],
			m: []
		}), this.#l.delete(e);
	}
	unskip_effect(e, t = (e) => this.schedule(e)) {
		var n = this.#c.get(e);
		if (n) {
			this.#c.delete(e);
			for (var r of n.d) k(r, g), t(r);
			for (r of n.m) k(r, _), t(r);
		}
		this.#l.add(e);
	}
	#p() {
		var e = [];
		for (let i of this.#a) if (!(i.f & 16384 || !(i.f & 6144))) {
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
		return this.#a = [], e;
	}
	#m() {
		this.started = !0;
		for (let [e, t] of this.#s) k(e, t), this.schedule(e);
		this.apply();
		for (var t = Tt = [], n = [], r = Et = []; this.#a.length > 0;) {
			Dt++ > 1e3 && (this.#b(), jt());
			for (let e of this.#p()) try {
				this.#h(e, t, n);
			} catch (t) {
				throw Ft(e), this.#d() || this.discard(), t;
			}
		}
		if (A = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (Tt = null, Et = null, this.#d()) {
			this.#y(n), this.#y(t);
			for (let [e, t] of this.#c) Pt(e, t);
			r.length > 0 && A.#m();
			return;
		}
		let a = this.#g();
		if (a) this.#y(n), this.#y(t), a.#v(this);
		else {
			this.#s.clear();
			for (let e of this.#e) e(this);
			this.#e.clear(), xt = this, Mt(n), Mt(t), xt = null, this.#i?.resolve();
			var o = A;
			this.#n === 0 && (this.#a.length === 0 || o !== null) && this.#b(), o !== null && (N.clear(), o.#m());
		}
	}
	#h(e, t, n) {
		e.f ^= h;
		for (var r = e.first; r !== null;) {
			var i = r.f, a = !!(i & 96);
			if (!(a && i & 1024 || i & 8192 || this.#c.has(r)) && r.fn !== null) {
				a ? r.f ^= h : i & 4 ? t.push(r) : Hn(r) && (i & 16 && this.add_dirty_reaction(r, _), Jn(r));
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
	#g() {
		for (var e = this.prev; e !== null; e = e.prev) if (!e.is_fork && this.#_(e)) return e;
		return null;
	}
	#_(e) {
		for (let [t, [, n]] of this.current) if (!n && e.current.has(t)) return !0;
		return !1;
	}
	#v(e) {
		for (let [t, n] of e.current) !this.previous.has(t) && e.previous.has(t) && this.previous.set(t, e.previous.get(t)), this.current.set(t, n);
		for (let [t, n] of e.async_deriveds) {
			let e = this.async_deriveds.get(t);
			e && n.promise.then(e.resolve).catch(e.reject);
		}
		e.async_deriveds.clear(), this.transfer_reactions(e.#s);
		let t = (e) => {
			var n = e.reactions;
			if (n !== null && !(e.f & 2 && !(e.f & 6144))) for (let e of n) {
				var r = e.f;
				if (r & 2) t(e);
				else {
					var i = e;
					r & 4194320 && !this.async_deriveds.has(i) && (this.#s.delete(i), k(i, g), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#b(), A = this, this.#m();
	}
	#y(e) {
		for (var t = 0; t < e.length; t += 1) et(e[t], this.#s);
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
			wt = !0, A = this, this.#m();
		} finally {
			Dt = 0, St = null, Tt = null, Et = null, wt = !1, A = null, j = null, N.clear();
		}
	}
	discard() {
		for (let e of this.#t) e(this);
		this.#t.clear();
		for (let e of this.async_deriveds.values()) e.reject(dt);
		this.#b(), this.#i?.resolve();
	}
	register_created_effect(e) {
		this.#o.push(e);
	}
	increment(e, t) {
		if (this.#n += 1, e) {
			let e = this.#r.get(t) ?? 0;
			this.#r.set(t, e + 1);
		}
	}
	decrement(e, t) {
		if (--this.#n, e) {
			let e = this.#r.get(t) ?? 0;
			e === 1 ? this.#r.delete(t) : this.#r.set(t, e - 1);
		}
		this.#u || (this.#u = !0, O(() => {
			this.#u = !1, this.linked && this.flush();
		}));
	}
	transfer_reactions(e) {
		for (let [t, n] of e) this.add_dirty_reaction(t, n);
		e.clear();
	}
	add_dirty_reaction(e, t) {
		(t === 2048 || this.#s.get(e) !== 2048) && this.#s.set(e, t);
	}
	oncommit(e) {
		this.#e.add(e);
	}
	ondiscard(e) {
		this.#t.add(e);
	}
	settled() {
		return (this.#i ??= p()).promise;
	}
	static ensure() {
		if (A === null) {
			let t = A = new e();
			!wt && !Ct && O(() => {
				t.started || t.flush();
			});
		}
		return A;
	}
	apply() {
		j = null;
	}
	schedule(e) {
		St = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768) ? e.b.defer_effect(e) : this.#a.push(e);
	}
	#b() {
		if (this.linked) {
			var e = this.prev, t = this.next;
			e === null || (e.next = t), t === null ? bt = e : t.prev = e, this.linked = !1;
		}
	}
};
function At(e) {
	var t = Ct, n = xt;
	xt = null, Ct = !0;
	try {
		var r;
		for (e && (At(), r = e());;) {
			if (Ze(), A === null) return r;
			A.flush();
		}
	} finally {
		Ct = t, xt = n;
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
			if (!(r.f & 24576) && Hn(r) && (M = /* @__PURE__ */ new Set(), Jn(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && En(r), M?.size > 0)) {
				N.clear();
				for (let e of M) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) M.has(n) && (M.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || Jn(n);
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
// ui/node_modules/svelte/src/internal/client/reactivity/sources.js
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
	return Fn(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function zt(e, t = !1, n = !0) {
	let r = Rt(e);
	return t || (r.equals = je), r;
}
function F(e, t, n = !1) {
	return U !== null && (!W || U.f & 131072) && Je() && U.f & 4325394 && (J === null || !J.has(e)) && He(), Ht(e, n ? Kt(t) : t, Et);
}
var Bt = null, Vt = 0;
function Ht(e, t, n = null) {
	if (!e.equals(t)) {
		Nn ? N.set(e, t) : N.has(e) || N.set(e, e.v);
		var r = kt.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && gt(t), j === null && $e(t);
		}
		e.wv = Vn(), Bt = null, Vt = 0, Gt(e, g, n), Bt = null, Je() && K !== null && K.f & 1024 && !(K.f & 96) && (Z === null ? In([e]) : Z.push(e)), !r.is_fork && It.size > 0 && !Lt && Ut();
	}
	return t;
}
function Ut() {
	Lt = !1;
	for (let e of It) {
		e.f & 1024 && k(e, _);
		let t;
		try {
			t = Hn(e);
		} catch {
			t = !0;
		}
		t && Jn(e);
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
			if (i || s !== K) {
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
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ P(0), u = null, d = zn, f = (e) => {
		if (zn === d) return e();
		var t = U, n = zn;
		G(null), Bn(d);
		var r = e();
		return G(t), Bn(n), r;
	};
	return i && r.set("length", /* @__PURE__ */ P(t.length, u)), new Proxy(t, {
		defineProperty(e, t, n) {
			"value" in n && n.configurable !== !1 && n.enumerable !== !1 && n.writable !== !1 || Be();
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
				var c = Q(o);
				return c === C ? void 0 : c;
			}
			return Reflect.get(e, n, i);
		},
		getOwnPropertyDescriptor(e, t) {
			this.has?.(e, t);
			var n = Reflect.getOwnPropertyDescriptor(e, t), i = r.get(t);
			if (i !== void 0) {
				var a = Q(i);
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
			return (n !== void 0 || (K !== null || U !== null) && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ P(i ? Kt(e[t]) : C, u)), r.set(t, n)), Q(n) === C) ? !1 : i;
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
			Q(o);
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
	var t = K;
	if (t === null) return U.f |= ae, e;
	if (!(t.f & 32768) && !(t.f & 4)) throw e;
	z(e, t);
}
function z(e, t) {
	if (e === _e) throw e;
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
// ui/node_modules/svelte/src/internal/client/reactivity/effects.js
function un(e) {
	K === null && (U === null && Le(e), Ie()), Nn && Fe(e);
}
function dn(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function B(e, t) {
	var n = K;
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
			Jn(r);
		} catch (e) {
			throw H(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= S));
	}
	if (i !== null && (i.parent = n, n !== null && dn(i, n), U !== null && U.f & 2 && !(e & 64))) {
		var a = U;
		(a.effects ??= []).push(i);
	}
	return r;
}
function fn() {
	return U !== null && !W;
}
function pn(e) {
	let t = B(8, null);
	return k(t, h), t.teardown = e, t;
}
function mn(e) {
	un("$effect");
	var t = K.f;
	if (!U && t & 32 && D !== null && !D.i) {
		var n = D;
		(n.e ??= []).push(e);
	} else return hn(e);
}
function hn(e) {
	return B(4 | te, e);
}
function gn(e) {
	kt.ensure();
	let t = B(64 | ee, e);
	return (e = {}) => new Promise((n) => {
		e.outro ? Dn(t, () => {
			H(t), n(void 0);
		}) : (H(t), n(void 0));
	});
}
function _n(e) {
	return B(4, e);
}
function vn(e) {
	return B(ie | ee, e);
}
function yn(e, t = 0) {
	return B(8 | t, e);
}
function bn(e, t = [], n = [], r = []) {
	ot(r, t, n, (t) => {
		B(8, () => {
			e(...t.map(Q));
		});
	});
}
function xn(e, t = 0) {
	return B(16 | t, e);
}
function V(e) {
	return B(32 | ee, e);
}
function Sn(e) {
	var t = e.teardown;
	if (t !== null) {
		let n = Nn, r = U;
		Pn(!0), G(null);
		try {
			t.call(null);
		} catch (t) {
			z(t, e.parent);
		} finally {
			Pn(n), G(r);
		}
	}
}
function Cn(e, t = !1) {
	var n = e.first;
	for (e.first = e.last = null; n !== null;) {
		let e = n.ac;
		e !== null && it(() => {
			e.abort(he);
		});
		var r = n.next;
		n.f & 64 ? n.parent = null : H(n, t), n = r;
	}
}
function wn(e) {
	for (var t = e.first; t !== null;) {
		var n = t.next;
		t.f & 32 || H(t), t = n;
	}
}
function H(e, t = !0) {
	var n = !1;
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (Tn(e.nodes.start, e.nodes.end), n = !0), e.f |= x, Cn(e, t && !n), qn(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	Sn(e), e.f ^= x, e.f |= y;
	var i = e.parent;
	i !== null && i.first !== null && En(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function Tn(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ R(e);
		e.remove(), e = n;
	}
}
function En(e) {
	var t = e.parent, n = e.prev, r = e.next;
	n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n));
}
function Dn(e, t, n = !0) {
	var r = [];
	e.f |= 256, On(e, r, !0);
	var i = () => {
		n && H(e), t && t();
	}, a = r.length;
	if (a > 0) {
		var o = () => --a || i();
		for (var s of r) s.out(o);
	} else i();
}
function On(e, t, n) {
	if (!(e.f & 8192)) {
		e.f ^= v;
		var r = e.nodes && e.nodes.t;
		if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
		for (var i = e.first; i !== null;) {
			var a = i.next;
			if (!(i.f & 64)) {
				var o = !!(i.f & 65536) || !!(i.f & 32) && !!(e.f & 16);
				On(i, t, o ? n : !1);
			}
			i = a;
		}
	}
}
function kn(e) {
	e.f &= -257, An(e, !0);
}
function An(e, t) {
	if (!(e.f & 256) && e.f & 8192) {
		e.f ^= v, e.f & 1024 || (k(e, g), kt.ensure().schedule(e));
		for (var n = e.first; n !== null;) {
			var r = n.next, i = !!(n.f & 65536) || !!(n.f & 32);
			An(n, i ? t : !1), n = r;
		}
		var a = e.nodes && e.nodes.t;
		if (a !== null) for (let e of a) (e.is_global || t) && e.in();
	}
}
function jn(e, t) {
	if (e.nodes) for (var n = e.nodes.start, r = e.nodes.end; n !== null;) {
		var i = n === r ? null : /* @__PURE__ */ R(n);
		t.append(n), n = i;
	}
}
// ui/node_modules/svelte/src/internal/client/legacy.js
var Mn = null, Nn = !1;
function Pn(e) {
	Nn = e;
}
var U = null, W = !1;
function G(e) {
	U = e;
}
var K = null;
function q(e) {
	K = e;
}
var J = null;
function Fn(e) {
	U !== null && (U.f & 2097152 || U.f & 2) && (J ??= /* @__PURE__ */ new Set()).add(e);
}
var Y = null, X = 0, Z = null;
function In(e) {
	Z = e;
}
var Ln = 1, Rn = 0, zn = Rn;
function Bn(e) {
	zn = e;
}
function Vn() {
	return ++Ln;
}
function Hn(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (Hn(a) && _t(a), a.wv > e.wv) return !0;
		}
		t & 512 && j === null && k(e, h);
	}
	return !1;
}
function Un(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(J !== null && J.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? Un(a, t, !1) : t === a && (n ? k(a, g) : a.f & 1024 && k(a, _), Nt(a));
	}
}
function Wn(e) {
	var t = Y, n = X, r = Z, i = U, a = J, o = D, s = W, c = zn, l = e.f;
	Y = null, X = 0, Z = null, U = l & 96 ? null : e, J = null, We(e.ctx), W = !1, zn = ++Rn, e.ac !== null && (it(() => {
		e.ac.abort(he);
	}), e.ac = null);
	try {
		e.f |= re;
		var u = e.fn, d = u();
		e.f |= b;
		var f = Gn(e);
		if (Je() && Z !== null && !W && f !== null && !(e.f & 6146)) for (var p = 0; p < Z.length; p++) Un(Z[p], e);
		if (i !== null && i !== e) {
			if (Rn++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = Rn;
			if (t !== null) for (let e of t) e.rv = Rn;
			Z !== null && (r === null ? r = Z : r.push(...Z));
		}
		return e.f & 8388608 && (e.f ^= ae), d;
	} catch (t) {
		return Gn(e), ln(t);
	} finally {
		e.f ^= re, Y = t, X = n, Z = r, U = i, J = a, We(o), W = s, zn = c;
	}
}
function Gn(e) {
	var t = e.deps, n = A?.is_fork;
	if (Y !== null) {
		var r;
		if (n || qn(e, X), t !== null && X > 0) for (t.length = X + Y.length, r = 0; r < Y.length; r++) t[X + r] = Y[r];
		else e.deps = t = Y;
		if (fn() && e.f & 512) for (r = X; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && X < t.length && (qn(e, X), t.length = X);
	return t;
}
function Kn(e, r) {
	let i = r.reactions;
	if (i !== null) {
		var a = t.call(i, e);
		if (a !== -1) {
			var o = i.length - 1;
			o === 0 ? i = r.reactions = null : (i[a] = i[o], i.pop());
		}
	}
	if (i === null && r.f & 2 && (Y === null || !n.call(Y, r))) {
		var s = r;
		s.f & 512 && (s.f ^= 512), s.v !== C && $e(s), s.ac !== null && it(() => {
			s.ac.abort(he), s.ac = null, k(s, g);
		}), vt(s), qn(s, 0);
	}
}
function qn(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) Kn(e, n[r]);
}
function Jn(e) {
	var t = e.f;
	if (!(t & 16384)) {
		k(e, h);
		var n = K;
		K = e;
		try {
			t & 16777232 ? wn(e) : Cn(e), Sn(e);
			var r = Wn(e);
			e.teardown = typeof r == "function" ? r : null, e.wv = Ln;
		} finally {
			K = n;
		}
	}
}
async function Yn() {
	await Promise.resolve(), At();
}
function Q(e) {
	var t = !!(e.f & 2);
	if (Mn?.add(e), U !== null && !W && !(K !== null && K.f & 16384) && (J === null || !J.has(e))) {
		var r = U.deps;
		if (U.f & 2097152) e.rv < Rn && (e.rv = Rn, Y === null && r !== null && r[X] === e ? X++ : Y === null ? Y = [e] : Y.push(e));
		else {
			U.deps ??= [], n.call(U.deps, e) || U.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [U] : n.call(i, U) || i.push(U);
		}
	}
	if (Nn && N.has(e)) return N.get(e);
	if (t) {
		var a = e;
		if (Nn) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || Zn(a)) && (o = gt(a)), N.set(a, o), o;
		}
		var s = !(a.f & 512) && !W && U !== null && !!(U.f & 512), c = (a.f & b) === 0;
		Hn(a) && (s && (a.f |= 512), _t(a)), s && !c && (yt(a), Xn(a));
	}
	if (j?.has(e)) return j.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function Xn(e) {
	if (e.f |= 512, e.deps !== null) for (let r of e.deps) {
		var t = r.reactions;
		t === null ? r.reactions = [e] : n.call(t, e) || t.push(e), r.f & 2 && !(r.f & 512) && (yt(r), Xn(r));
	}
}
function Zn(e) {
	if (e.v === C) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (N.has(t) || t.f & 2 && Zn(t)) return !0;
	return !1;
}
function Qn(e) {
	var t = W;
	try {
		return W = !0, e();
	} finally {
		W = t;
	}
}
[.../* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split(".")];
var $n = ["touchstart", "touchmove"];
function er(e) {
	return $n.includes(e);
}
// ui/node_modules/svelte/src/internal/client/dev/css.js
var tr = Symbol("events"), nr = /* @__PURE__ */ new Set(), rr = /* @__PURE__ */ new Set();
function ir(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || ur.call(t, e), !e.cancelBubble) return it(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, O(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function ar(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = ir(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && pn(() => {
		o.__removed = !0, t.removeEventListener(e, o, a);
	});
}
function or(e, t, n) {
	(t[tr] ??= {})[e] = n;
}
function sr(e) {
	for (var t = 0; t < e.length; t++) nr.add(e[t]);
	for (var n of rr) n(e);
}
var cr = null, lr = !1;
function ur(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	cr = e, lr || (lr = !0, setTimeout(() => {
		lr = !1, cr = null;
	}));
	var s = 0, c = cr === e && e[tr];
	if (c) {
		var l = a.indexOf(c);
		if (l !== -1 && (t === document || t === window)) {
			e[tr] = t;
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
		var d = U, f = K;
		G(null), q(null);
		try {
			for (var p, m = []; o !== null && o !== t;) {
				try {
					var h = o[tr]?.[r];
					h == null || o.disabled && e.target !== o || h.call(o, e);
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
			e[tr] = t, delete e.currentTarget, G(d), q(f);
		}
	}
}
// ui/node_modules/svelte/src/internal/client/dom/reconciler.js
var dr = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function fr(e) {
	return dr?.createHTML(e) ?? e;
}
function pr(e) {
	var t = sn("template");
	return t.innerHTML = fr(e.replaceAll("<!>", "<!---->")), t.content;
}
// ui/node_modules/svelte/src/internal/client/dom/template.js
function $(e, t) {
	var n = K;
	n.nodes === null && (n.nodes = {
		start: e,
		end: t,
		a: null,
		t: null
	});
}
/*#__NO_SIDE_EFFECTS__*/
function mr(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (w) return $(T, null), T;
		i === void 0 && (i = pr(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ L(i)));
		var t = r || Xt ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ L(t), s = t.lastChild;
			$(o, s);
		} else $(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function hr(e, t, n = "svg") {
	var r = !e.startsWith("<!>"), i = !!(t & 1), a = `<${n}>${r ? e : "<!>" + e}</${n}>`, o;
	return () => {
		if (w) return $(T, null), T;
		if (!o) {
			var e = /* @__PURE__ */ L(pr(a));
			if (i) for (o = document.createDocumentFragment(); /* @__PURE__ */ L(e);) o.appendChild(/* @__PURE__ */ L(e));
			else o = /* @__PURE__ */ L(e);
		}
		var t = o.cloneNode(!0);
		if (i) {
			var n = /* @__PURE__ */ L(t), r = t.lastChild;
			$(n, r);
		} else $(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function gr(e, t) {
	return /* @__PURE__ */ hr(e, t, "svg");
}
function _r(e = "") {
	if (!w) {
		var t = I(e + "");
		return $(t, t), t;
	}
	var n = T;
	return n.nodeType === 3 ? cn(n) : (n.before(n = I()), E(n)), $(n, n), n;
}
function vr() {
	if (w) return $(T, null), T;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = I();
	return e.append(t, n), $(t, n), e;
}
function yr(e, t) {
	if (w) {
		var n = K;
		n.f & 32768 && n.nodes.end !== null || (n.nodes.end = T), we();
	} else e !== null && e.before(t);
}
// ui/node_modules/svelte/src/reactivity/create-subscriber.js
function br(e) {
	let t = 0, n = Rt(0), r;
	return () => {
		fn() && (Q(n), yn(() => (t === 0 && (r = Qn(() => e(() => Wt(n)))), t += 1, () => {
			O(() => {
				--t, t === 0 && (r?.(), r = void 0, Wt(n));
			});
		})));
	};
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var xr = S | ee;
function Sr(e, t, n, r) {
	new Cr(e, t, n, r);
}
var Cr = class {
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
	#f = /* @__PURE__ */ new Map();
	#p = null;
	#m = br(() => (this.#p = Rt(this.#l), () => {
		this.#p = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = K;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = K.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = xn(() => {
			if (w) {
				let e = Oe(this.#t);
				we();
				let t = e === "[!";
				if (e.startsWith("[?")) {
					let t = JSON.parse(e.slice(2));
					this.#g(t);
				} else t ? this.#y() : this.#h();
			} else this.#b();
		}, xr), w && (this.#e = T);
	}
	#h() {
		try {
			this.#a = V(() => this.#r(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#g(e) {
		let t = this.#n.failed, { reset: n, invoke_onerror: r } = this.#_(e);
		O(r), t && (this.#s = V(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#_(e) {
		var t = !1, n = !1;
		let r = () => {
			this.#v() || (t ? Se() : (t = !0, n && Ue(), this.#s !== null && Dn(this.#s, () => {
				this.#s = null;
			}), this.#S(() => {
				this.#b();
			})));
		};
		return {
			reset: r,
			invoke_onerror: () => {
				if (!this.#v()) try {
					n = !0, this.#n.onerror?.(e, r), n = !1;
				} catch (e) {
					z(e, this.#i && this.#i.parent);
				}
			}
		};
	}
	#v() {
		return (this.#i.f & (y | x)) !== 0;
	}
	#y() {
		let e = this.#n.pending;
		e && (this.is_pending = !0, this.#o = V(() => e(this.#e)), O(() => {
			if (!this.#v()) {
				var e = this.#c = document.createDocumentFragment(), t = I(), n = !1;
				e.append(t), this.#a = this.#S(() => {
					try {
						return V(() => this.#r(t));
					} catch (e) {
						try {
							this.error(e), n = !0;
						} catch (e) {
							z(e, this.#i.parent);
						}
						return null;
					}
				}), this.#a === null ? (this.#c = null, n && this.#x(A)) : this.#u === 0 && (this.#e.before(e), this.#c = null, Dn(this.#o, () => {
					this.#o = null;
				}), this.#x(A));
			}
		}));
	}
	#b() {
		try {
			if (this.is_pending = this.has_pending_snippet(), this.#u = 0, this.#l = 0, this.#a = V(() => {
				this.#r(this.#e);
			}), this.#u > 0) {
				var e = this.#c = document.createDocumentFragment();
				jn(this.#a, e);
				let t = this.#n.pending;
				this.#o = V(() => t(this.#e));
			} else this.#x(A);
		} catch (e) {
			this.error(e);
		}
	}
	#x(e) {
		this.is_pending = !1, e.transfer_reactions(this.#f);
	}
	defer_effect(e) {
		et(e, this.#f);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#n.pending;
	}
	#S(e) {
		var t = K, n = U, r = D;
		q(this.#i), G(this.#i), We(this.#i.ctx);
		try {
			return kt.ensure(), e();
		} finally {
			q(t), G(n), We(r);
		}
	}
	#C(e, t) {
		this.has_pending_snippet() ? (this.#u += e, this.#u === 0 && (this.#x(t), this.#o && Dn(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null))) : this.parent && this.parent.#C(e, t);
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !this.#p || this.#d || (this.#d = !0, O(() => {
			this.#d = !1, this.#p && Ht(this.#p, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#m(), Q(this.#p);
	}
	error(e) {
		if (e === _e || !this.#n.onerror && !this.#n.failed) throw e;
		A?.is_fork ? (this.#a && A.skip_effect(this.#a), this.#o && A.skip_effect(this.#o), this.#s && A.skip_effect(this.#s), A.oncommit(() => {
			this.#v() || this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (H(this.#a), null), this.#o &&= (H(this.#o), null), this.#s &&= (H(this.#s), null), w && (E(this.#t), Ee(), E(De()));
		let t = this.#n.failed, n = (e) => {
			if (this.#v()) return;
			let { reset: n, invoke_onerror: r } = this.#_(e);
			r(), t && !this.#v() && (this.#s = this.#S(() => {
				try {
					return V(() => {
						var r = K;
						r.b = this, r.f |= 128, t(this.#e, () => e, () => n);
					});
				} catch (e) {
					return z(e, this.#i.parent), null;
				}
			}));
		};
		O(() => {
			if (!this.#v()) {
				var t;
				try {
					t = this.transform_error(e);
				} catch (e) {
					z(e, this.#i && this.#i.parent);
					return;
				}
				typeof t == "object" && t && typeof t.then == "function" ? t.then(n, (e) => z(e, this.#i && this.#i.parent)) : n(t);
			}
		});
	}
};
function wr(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[pe] ??= e.nodeValue) && (e[pe] = n, e.nodeValue = `${n}`);
}
function Tr(e, t) {
	return Dr(e, t);
}
var Er = /* @__PURE__ */ new Map();
function Dr(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	$t();
	var l = void 0, u = gn(() => {
		var s = n ?? t.appendChild(I());
		Sr(s, { pending: () => {} }, (t) => {
			Ge({});
			var n = D;
			if (o && (n.c = o), a && (i.$$events = a), w && $(t, null), l = e(t, i) || qe(), w && (K.nodes.end = T, T === null || T.nodeType !== 8 || T.data !== "]")) throw be(), _e;
			Ke();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = er(r);
					for (let e of [t, document]) {
						var a = Er.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), Er.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, ur, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(nr)), rr.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = Er.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, ur), r.delete(e), r.size === 0 && Er.delete(n)) : r.set(e, i);
			}
			rr.delete(d), s !== n && s.parentNode?.removeChild(s);
		};
	});
	return Or.set(l, u), l;
}
var Or = /* @__PURE__ */ new WeakMap();
function kr(e, t) {
	let n = Or.get(e);
	return n ? (Or.delete(e), n(t)) : Promise.resolve();
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/branches.js
var Ar = class {
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
			if (n) kn(n), this.#r.delete(t);
			else {
				var r = this.#n.get(t);
				r && (kn(r.effect), this.#t.set(t, r.effect), this.#n.delete(t), r.fragment.lastChild.remove(), this.anchor.before(r.fragment), n = r.effect);
			}
			for (let [t, n] of this.#e) {
				if (this.#e.delete(t), t === e) break;
				let r = this.#n.get(n);
				r && (H(r.effect), this.#n.delete(n));
			}
			for (let [e, r] of this.#t) {
				if (e === t || this.#r.has(e)) continue;
				let i = () => {
					if (Array.from(this.#e.values()).includes(e)) {
						var t = document.createDocumentFragment();
						jn(r, t), t.append(I()), this.#n.set(e, {
							effect: r,
							fragment: t
						});
					} else H(r);
					this.#r.delete(e), this.#t.delete(e);
				};
				this.#i || !n ? (this.#r.add(e), Dn(r, i, !1)) : i();
			}
		}
	};
	#o = (e) => {
		this.#e.delete(e);
		let t = Array.from(this.#e.values());
		for (let [e, n] of this.#n) t.includes(e) || (H(n.effect), this.#n.delete(e));
	};
	ensure(e, t) {
		var n = A, r = on();
		if (t && !this.#t.has(e) && !this.#n.has(e)) {
			if (r) {
				var i = document.createDocumentFragment(), a = I();
				i.append(a), this.#n.set(e, {
					effect: V(() => t(a)),
					fragment: i
				});
			} else this.#t.set(e, V(() => t(this.anchor)));
		}
		if (this.#e.set(n, e), r) {
			for (let [t, r] of this.#t) t === e ? n.unskip_effect(r) : n.skip_effect(r);
			for (let [t, r] of this.#n) t === e ? n.unskip_effect(r.effect) : n.skip_effect(r.effect);
			n.oncommit(this.#a), n.ondiscard(this.#o);
		} else w && (this.anchor = T), this.#a(n);
	}
};
// ui/node_modules/svelte/src/internal/client/dom/blocks/if.js
function jr(e, t, n = !1) {
	var r;
	w && (r = T, we());
	var i = new Ar(e), a = n ? S : 0;
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
	xn(() => {
		var e = !1;
		t((t, n = 0) => {
			e = !0, o(n, t);
		}), e || o(-1, null);
	}, a);
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/key.js
var Mr = Symbol("NaN");
function Nr(e, t, n) {
	w && we();
	var r = new Ar(e), i = !Je();
	xn(() => {
		var e = t();
		e !== e && (e = Mr), i && typeof e == "object" && e && (e = {}), r.ensure(e, n);
	});
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/each.js
function Pr(e, t) {
	return t;
}
function Fr(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		Dn(n, () => {
			if (o) {
				if (o.pending.delete(n), o.done.add(n), o.pending.size === 0) {
					var t = e.outrogroups;
					Ir(e, r(o.done)), t.delete(o), t.size === 0 && (e.outrogroups = null);
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
		Ir(e, t, !l);
	} else o = {
		pending: new Set(t),
		done: /* @__PURE__ */ new Set()
	}, (e.outrogroups ??= /* @__PURE__ */ new Set()).add(o);
}
function Ir(e, t, n = !0) {
	var r;
	if (e.pending.size > 0) {
		r = /* @__PURE__ */ new Set();
		for (let t of e.pending.values()) for (let n of t) r.add(e.items.get(n).e);
	}
	for (var i = 0; i < t.length; i++) {
		var a = t[i];
		r?.has(a) ? (a.f |= ne, jn(a, document.createDocumentFragment())) : H(t[i], n);
	}
}
var Lr;
function Rr(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = w ? E(/* @__PURE__ */ L(u)) : u.appendChild(I());
	}
	w && we();
	var d = null, f = /* @__PURE__ */ mt(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p = /* @__PURE__ */ new Map(), m = !0;
	function h(e) {
		if (!(_.effect.f & 16384)) {
			_.pending.delete(e);
			var t = Q(f);
			_.fallback = d, Br(_, t, c, n, a), d !== null && (t.length === 0 ? d.f & 33554432 ? (d.f ^= ne, Hr(d, null, c)) : kn(d) : Dn(d, () => {
				d = null;
			}));
		}
	}
	function g(e) {
		_.pending.delete(e);
	}
	var _ = {
		effect: xn(() => {
			var e = Q(f), t = e.length;
			let r = !1;
			w && Oe(c) === "[!" != (t === 0) && (c = De(), E(c), Ce(!1), r = !0);
			for (var u = /* @__PURE__ */ new Set(), _ = A, v = on(), y = 0; y < t; y += 1) {
				w && T.nodeType === 8 && T.data === "]" && (c = T, r = !0, Ce(!1));
				var b = e[y], x = a(b, y), S = m ? null : l.get(x);
				S ? (S.v && Ht(S.v, b), S.i && Ht(S.i, y), v && _.unskip_effect(S.e)) : (S = Vr(l, m ? c : Lr ??= I(), b, x, y, o, n, i), m || (S.e.f |= ne), l.set(x, S)), u.add(x);
			}
			if (t === 0 && s && !d && (m ? d = V(() => s(c)) : (d = V(() => s(Lr ??= I())), d.f |= ne)), t > u.size && Pe("", "", ""), w && t > 0 && E(De()), !m) {
				if (p.set(_, u), v) {
					for (let [e, t] of l) u.has(e) || _.skip_effect(t.e);
					_.oncommit(h), _.ondiscard(g);
				} else h(_);
			}
			r && Ce(!0), Q(f);
		}),
		flags: n,
		items: l,
		pending: p,
		outrogroups: null,
		fallback: d
	};
	m = !1, w && (c = T);
}
function zr(e) {
	for (; e !== null && !(e.f & 32);) e = e.next;
	return e;
}
function Br(e, t, n, i, a) {
	var o = !!(i & 8), s = t.length, c = e.items, l = zr(e.effect.first), u, d = null, f, p = [], m = [], h, g, _, v;
	if (o) for (v = 0; v < s; v += 1) h = t[v], g = a(h, v), _ = c.get(g).e, _.f & 33554432 || (_.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(_));
	for (v = 0; v < s; v += 1) {
		if (h = t[v], g = a(h, v), _ = c.get(g).e, e.outrogroups !== null) for (let t of e.outrogroups) t.pending.delete(_), t.done.delete(_);
		if (_.f & 8192 && (kn(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= ne, _ === l) Hr(_, null, n);
			else {
				var y = d ? d.next : l;
				_ === e.effect.last && (e.effect.last = _.prev), _.prev && (_.prev.next = _.next), _.next && (_.next.prev = _.prev), Ur(e, d, _), Ur(e, _, y), Hr(_, y, n), d = _, p = [], m = [], l = zr(d.next);
				continue;
			}
		}
		if (_ !== l) {
			if (u !== void 0 && u.has(_)) {
				if (p.length < m.length) {
					var b = m[0], x;
					d = b.prev;
					var S = p[0], ee = p[p.length - 1];
					for (x = 0; x < p.length; x += 1) Hr(p[x], b, n);
					for (x = 0; x < m.length; x += 1) u.delete(m[x]);
					Ur(e, S.prev, ee.next), Ur(e, d, S), Ur(e, ee, b), l = b, d = ee, --v, p = [], m = [];
				} else u.delete(_), Hr(_, l, n), Ur(e, _.prev, _.next), Ur(e, _, d === null ? e.effect.first : d.next), Ur(e, d, _), d = _;
				continue;
			}
			for (p = [], m = []; l !== null && l !== _;) (u ??= /* @__PURE__ */ new Set()).add(l), m.push(l), l = zr(l.next);
			if (l === null) continue;
		}
		_.f & 33554432 || p.push(_), d = _, l = zr(_.next);
	}
	if (e.outrogroups !== null) {
		for (let t of e.outrogroups) t.pending.size === 0 && (Ir(e, r(t.done)), e.outrogroups?.delete(t));
		e.outrogroups.size === 0 && (e.outrogroups = null);
	}
	if (l !== null || u !== void 0) {
		var te = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || te.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && te.push(l), l = zr(l.next);
		var re = te.length;
		if (re > 0) {
			var ie = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.measure();
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.fix();
			}
			Fr(e, te, ie);
		}
	}
	o && O(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function Vr(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? Rt(n) : /* @__PURE__ */ zt(n, !1, !1) : null, l = o & 2 ? Rt(i) : null;
	return {
		v: c,
		i: l,
		e: V(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function Hr(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ R(r);
		if (a.before(r), r === i) return;
		r = o;
	}
}
function Ur(e, t, n) {
	t === null ? e.effect.first = n : t.next = n, n === null ? e.effect.last = t : n.prev = t;
}
// ui/node_modules/svelte/src/internal/client/dom/css.js
function Wr(e, t) {
	_n(() => {
		e = K?.parent?.nodes?.start ?? e;
		var n = e.getRootNode(), r = n.host ? n : n.head ?? n.ownerDocument.head;
		if (!r.querySelector("#" + t.hash)) {
			let e = sn("style");
			e.id = t.hash, e.textContent = t.code, r.appendChild(e);
		}
	});
}
// ui/node_modules/svelte/src/internal/shared/attributes.js
var Gr = [..." 	\n\r\f\xA0\v﻿"];
function Kr(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || Gr.includes(r[o - 1])) && (s === r.length || Gr.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function qr(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function Jr(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function Yr(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map(Jr)), i && c.push(...Object.keys(i).map(Jr));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = Jr(e.substring(l, u).trim());
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
		return r && (n += qr(r)), i && (n += qr(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
// ui/node_modules/svelte/src/internal/client/dom/elements/class.js
function Xr(e, t, n, r, i, a) {
	var o = e[de];
	if (w || o !== n || o === void 0) {
		var s = Kr(n, r, a);
		w && s === e.getAttribute("class") || (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[de] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/style.js
function Zr(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function Qr(e, t, n, r) {
	var i = e[fe];
	if (w || i !== t) {
		var a = Yr(t, r);
		w && a === e.getAttribute("style") || (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[fe] = t;
	} else r && (Array.isArray(r) ? (Zr(e, n?.[0], r[0]), Zr(e, n?.[1], r[1], "important")) : Zr(e, n, r));
	return r;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
function $r(e, t) {
	t ? e.hasAttribute("selected") || e.setAttribute("selected", "") : e.removeAttribute("selected");
}
function ei(t, n) {
	var r = t.__defaultValue, i = t.multiple, a = i ? r ?? [] : null;
	if (!i || e(a)) {
		var o = t.selectedIndex, s = n && i ? new Set(t.selectedOptions) : null;
		for (var c of t.options) {
			var l = ii(c);
			$r(c, i ? a.includes(l) : Jt(l, r));
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
function ti(t, n, r = !1) {
	if (t.multiple) {
		if (n == null) return;
		if (!e(n)) return xe();
		for (var i of t.options) i.selected = n.includes(ii(i));
	} else {
		for (i of t.options) if (Jt(ii(i), n)) {
			i.selected = !0;
			return;
		}
		r && n === void 0 || (t.selectedIndex = -1);
	}
}
function ni(e) {
	var t = new MutationObserver((t) => {
		t.every(ai) || ("__defaultValue" in e && ei(e, !1), "__value" in e && ti(e, e.__value));
	});
	t.observe(e, {
		childList: !0,
		subtree: !0,
		attributes: !0,
		attributeFilter: ["value"]
	}), pn(() => {
		t.disconnect();
	});
}
function ri(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet(), i = !0;
	at(e, "change", (t) => {
		var i = t ? "[selected]" : ":checked", a;
		if (e.multiple) a = [].map.call(e.querySelectorAll(i), ii);
		else {
			var o = e.querySelector(i) ?? e.querySelector("option:not([disabled])");
			a = o && ii(o);
		}
		n(a), e.__value = a, A !== null && r.add(A);
	}), _n(() => {
		var a = t();
		if (e === document.activeElement) {
			var o = A;
			if (r.has(o)) return;
		}
		if (ti(e, a, i), i && a === void 0) {
			var s = e.querySelector(":checked");
			s !== null && (a = ii(s), n(a));
		}
		e.__value = a, i = !1;
	});
}
function ii(e) {
	return "__value" in e ? e.__value : e.value;
}
function ai(e) {
	if (e.target.closest("selectedcontent") !== null) return !0;
	if (e.type === "childList") {
		var t = [...e.addedNodes, ...e.removedNodes];
		return t.length > 0 && t.every((e) => e.nodeName === "SELECTEDCONTENT");
	}
	return !1;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/attributes.js
var oi = Symbol("is custom element"), si = Symbol("is html"), ci = ge ? "link" : "LINK";
function li(e) {
	if (w) {
		var t = !1, n = () => {
			if (!t) {
				if (t = !0, e.hasAttribute("value")) {
					var n = e.value;
					di(e, "value", null), e.value = n;
				}
				if (e.hasAttribute("checked")) {
					var r = e.checked;
					di(e, "checked", null), e.checked = r;
				}
			}
		};
		e[me] = n, O(n), rt();
	}
}
function ui(e, t) {
	var n = fi(e);
	n.checked !== (n.checked = t ?? void 0) && (e.checked = t);
}
function di(e, t, n, r) {
	var i = fi(e);
	if (!(w && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === ci))) {
		var a = i[t];
		a !== (i[t] = n) && (t === "loading" && (e[le] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && mi(e).has(t) ? e[t] = n : (!w || typeof n != "number" && typeof n != "boolean" || a !== String(n)) && e.setAttribute(t, n));
	}
}
function fi(e) {
	return e[ue] ??= {
		[oi]: e.nodeName.includes("-"),
		[si]: e.namespaceURI === ve
	};
}
var pi = /* @__PURE__ */ new Map();
function mi(e) {
	var t = e.getAttribute("is") || e.nodeName, n = pi.get(t);
	if (n) return n;
	pi.set(t, n = /* @__PURE__ */ new Set());
	for (var r, i = e, a = Element.prototype; a !== i;) {
		for (var s in r = o(i), r) r[s].set && s !== "innerHTML" && s !== "textContent" && s !== "innerText" && n.add(s);
		i = l(i);
	}
	return n;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function hi(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet();
	at(e, "input", async (i) => {
		var a = i ? e.defaultValue : e.value;
		if (a = _i(e) ? vi(a) : a, n(a), A !== null && r.add(A), await Yn(), a !== (a = t())) {
			var o = e.selectionStart, s = e.selectionEnd, c = e.value.length;
			if (e.value = a ?? "", s !== null) {
				var l = e.value.length;
				o === s && s === c && l > c ? (e.selectionStart = l, e.selectionEnd = l) : (e.selectionStart = o, e.selectionEnd = Math.min(s, l));
			}
		}
	}), (w && e.defaultValue !== e.value || Qn(t) == null && e.value) && (n(_i(e) ? vi(e.value) : e.value), A !== null && r.add(A)), yn(() => {
		var n = t();
		if (e === document.activeElement) {
			var i = A;
			if (r.has(i)) return;
		}
		_i(e) && n === vi(e.value) || (e.type !== "date" || n || e.value) && n !== e.value && (e.value = n ?? "");
	});
}
function gi(e, t, n = t) {
	at(e, "change", (t) => {
		n(t ? e.defaultChecked : e.checked);
	}), (w && e.defaultChecked !== e.checked || Qn(t) == null) && n(e.checked), yn(() => {
		e.checked = !!t();
	});
}
function _i(e) {
	var t = e.type;
	return t === "number" || t === "range";
}
function vi(e) {
	return e === "" ? null : +e;
}
var yi = /* @__PURE__ */ new class e {
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
function bi(e, t, n) {
	var r = yi.observe(e, () => n(e[t]));
	_n(() => (Qn(() => n(e[t])), r));
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function xi(e, t) {
	return e === t || e?.[oe] === t;
}
function Si(e = qe(), t, n, r) {
	var i = D.r, a = K;
	return _n(() => {
		var o, s;
		return yn(() => {
			o = s, s = r?.() || [], Qn(() => {
				xi(n(...s), e) || (t(e, ...s), o && xi(n(...o), e) && t(null, ...o));
			});
		}), () => {
			let r = a;
			for (; r !== i && r.parent !== null && r.parent.f & 33554432;) r = r.parent;
			let o = () => {
				s && xi(n(...s), e) && t(null, ...s);
			}, c = r.teardown;
			r.teardown = () => {
				o(), c?.();
			};
		};
	}), e;
}
// ui/node_modules/svelte/src/internal/client/reactivity/store.js
var Ci = !1;
function wi(e) {
	var t = Ci;
	try {
		return Ci = !1, [e(), Ci];
	} finally {
		Ci = t;
	}
}
// ui/node_modules/svelte/src/internal/client/reactivity/props.js
function Ti(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ ut(r), Q(u)) : (l && (l = !1, c = s ? Qn(r) : r), c);
	let f;
	if (o) {
		var p = oe in e || ce in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = wi(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && ze(t), f(m)));
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
	o && Q(y);
	var b = K;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? Q(y) : i && o ? Kt(e) : e;
			return F(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return Nn && v || b.f & 16384 ? y.v : Q(y);
	});
}
function Ei(e) {
	D === null && Me("onMount"), mn(() => {
		let t = Qn(e);
		if (typeof t == "function") return t;
	});
}
// ui/node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
// plugins/stable/dav/ui/src/api.ts
var Di = "tasks", Oi = /https:\/\/(?:teams\.microsoft\.com\/(?:l\/meetup-join|meet)\/|teams\.live\.com\/meet\/|[\w.-]*zoom\.us\/(?:j|my|w)\/|meet\.google\.com\/[a-z]|[\w.-]*webex\.com\/(?:meet|join|[\w.-]+\/j\.php)|meet\.jit\.si\/)[^\s<>"')\]]*/i;
function ki(e) {
	for (let t of [
		e.location,
		e.url,
		e.description
	]) {
		let e = t?.match(Oi);
		if (e) return e[0].replace(/[.,;]+$/, "");
	}
	return null;
}
var Ai = Intl.DateTimeFormat().resolvedOptions().timeZone;
async function ji(e, t, n = {}, r = 120) {
	try {
		return await e.helper.call(t, {
			tz: Ai,
			...n,
			settings: e.plugin.settings
		}, { timeout: r });
	} catch (e) {
		throw Error(String(e?.message ?? e).replace(/^.*?plugin [\w-]+: \w+: /s, "").replace(/^.*?(method|error): /i, ""));
	}
}
var Mi = 864e5, Ni = (e) => new Date(e.getFullYear(), e.getMonth(), e.getDate()), Pi = (e, t) => new Date(e.getFullYear(), e.getMonth(), e.getDate() + t, e.getHours(), e.getMinutes()), Fi = (e, t) => new Date(e.getFullYear(), e.getMonth() + t, Math.min(e.getDate(), 28)), Ii = (e, t) => e.getFullYear() === t.getFullYear() && e.getMonth() === t.getMonth() && e.getDate() === t.getDate(), Li = (e) => String(e).padStart(2, "0"), Ri = (e) => `${e.getFullYear()}-${Li(e.getMonth() + 1)}-${Li(e.getDate())}`, zi = (e) => `${Ri(e)}T${Li(e.getHours())}:${Li(e.getMinutes())}`;
function Bi(e) {
	if (e.length === 10) {
		let [t, n, r] = e.split("-").map(Number);
		return new Date(t, n - 1, r);
	}
	return new Date(e);
}
var Vi = (e) => Bi(e.start), Hi = (e) => Bi(e.end), Ui = (e) => e.all_day || Hi(e).getTime() - Vi(e).getTime() >= 864e5;
function Wi(e) {
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
function Gi(e, t) {
	let n = Ni(e);
	return Pi(n, -((n.getDay() - t + 7) % 7));
}
var Ki = [
	["day", "Day"],
	["3days", "3 days"],
	["week", "Week"],
	["60days", "60 days"]
], qi = (e) => Ki.some(([t]) => t === e);
function Ji(e, t, n) {
	if (e === "week") {
		let e = Gi(t, n);
		return {
			from: e,
			to: Pi(e, 6)
		};
	}
	return {
		from: t,
		to: Pi(t, e === "day" ? 0 : e === "3days" ? 2 : 59)
	};
}
var Yi = (e) => e === "day" ? 1 : e === "3days" ? 3 : e === "week" ? 7 : 30;
function Xi(e) {
	return e === "12h";
}
var Zi = (e) => e ? { hour12: !0 } : { hourCycle: "h23" };
function Qi(e, t) {
	return e.toLocaleTimeString(void 0, {
		hour: "2-digit",
		minute: "2-digit",
		...Zi(t)
	});
}
function $i(e, t) {
	let n = Vi(e), r = Hi(e), i = (e) => e.toLocaleDateString(void 0, {
		weekday: "short",
		day: "numeric",
		month: "short"
	});
	if (e.all_day) {
		let e = Pi(r, -1);
		return Ii(n, e) ? `${i(n)} · all day` : `${i(n)} – ${i(e)}`;
	}
	return Ii(n, r) || r.getHours() === 0 && r.getMinutes() === 0 && r.getTime() - n.getTime() < 864e5 ? `${i(n)} · ${Qi(n, t)} – ${Qi(r, t)}` : `${i(n)} ${Qi(n, t)} – ${i(r)} ${Qi(r, t)}`;
}
function ea(e) {
	let t = 0;
	for (let n of e) t = (t * 31 + n.charCodeAt(0)) % 360;
	return `hsl(${t} 62% 52%)`;
}
var ta = (e) => e.source && !e.source.includes("@") && /\.md$/i.test(e.source) ? e.source : null;
function na(e) {
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
function ra(e) {
	if (!e) return "";
	let t = Object.fromEntries(e.split(";").map((e) => e.split("="))), n = {
		DAILY: "day",
		WEEKLY: "week",
		MONTHLY: "month",
		YEARLY: "year"
	}[t.FREQ] ?? t.FREQ?.toLowerCase(), r = Number(t.INTERVAL ?? 1), i = r > 1 ? `Every ${r} ${n}s` : `Every ${n}`;
	return t.BYDAY && (i += ` on ${t.BYDAY.split(",").map((e) => e.slice(-2)).join(", ")}`), t.COUNT && (i += `, ${t.COUNT} times`), t.UNTIL && (i += `, until ${t.UNTIL.slice(0, 4)}-${t.UNTIL.slice(4, 6)}-${t.UNTIL.slice(6, 8)}`), i;
}
var ia = JSON.stringify({ dialog: "new-event" }), aa = (e = {}) => JSON.stringify({
	dialog: "new-event",
	...e
});
function oa(e) {
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
// plugins/stable/dav/ui/src/Icon.svelte
var sa = {
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
}, ca = /* @__PURE__ */ gr("<svg class=\"icon svelte-16m1c18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg>"), la = {
	hash: "svelte-16m1c18",
	code: ".icon.svelte-16m1c18 {flex:none;display:block;}"
};
function ua(e, t) {
	Wr(e, la);
	let n = Ti(t, "size", 3, 16), r = Ti(t, "title", 3, "");
	var i = ca(), a = nn(i);
	bn(() => {
		di(i, "width", n()), di(i, "height", n()), di(i, "aria-hidden", r() ? void 0 : "true"), di(i, "role", r() ? "img" : void 0), di(i, "aria-label", r() || void 0), di(a, "d", sa[t.name] ?? sa.calendar);
	}), yr(e, i);
}
function da(e, t, n = 30, r = 14) {
	let i = Ni(t).getTime(), a = Pi(Ni(t), 1).getTime(), o = new pa(), s = e.filter((e) => !Ui(e)).map((e) => ({
		e,
		s: Vi(e).getTime(),
		t: Math.max(Hi(e).getTime(), Vi(e).getTime() + 9e5)
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
		box: fa,
		among: o,
		over: new pa()
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
		} : fa, n = e.col / e.cols, i = e.span / e.cols;
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
var fa = {
	x: 0,
	xpx: 0,
	w: 1,
	wpx: 0
}, pa = class {
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
			for (; r < e && !ma(t[r], n);) r++;
			n.span = r - n.col;
		}
		this.cluster = [], this.ends = [], this.end = -Infinity;
	}
};
function ma(e, t) {
	let n = 0, r = e.length;
	for (; n < r;) {
		let i = n + r >> 1;
		e[i].bottom <= t.top ? n = i + 1 : r = i;
	}
	return n < e.length && e[n].top < t.bottom;
}
function ha(e, t) {
	if (!t.length) return [];
	let n = Ni(t[0]).getTime(), r = (e) => Math.round((e - n) / Mi), i = e.filter(Ui).map((e) => {
		let t = Vi(e).getTime(), n = Hi(e).getTime() - 1;
		return {
			e,
			a: r(Ni(new Date(t)).getTime()),
			b: r(Ni(new Date(Math.max(t, n))).getTime())
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
function ga(e, t) {
	let n = Ni(t).getTime(), r = Pi(Ni(t), 1).getTime();
	return e.filter((e) => {
		let t = Vi(e).getTime(), i = Math.max(Hi(e).getTime(), t + 1);
		return t < r && i > n;
	});
}
export { wr as $, zi as A, di as B, na as C, Ke as Ct, Ni as D, m as Dt, $i as E, Te as Et, Si as F, Qr as G, ri as H, bi as I, Rr as J, Xr as K, gi as L, Ri as M, Ei as N, Gi as O, Ti as P, Tr as Q, hi as R, ta as S, tt as St, Ii as T, Ee as Tt, ni as U, ui as V, ti as W, Nr as X, Pr as Y, jr as Z, qi as _, rn as _t, ia as a, _r as at, aa as b, P as bt, Pi as c, ar as ct, Yi as d, bn as dt, kr as et, ji as f, mn as ft, ea as g, nn as gt, Xi as h, tn as ht, ua as i, gr as it, Wi as j, Qi as k, Fi as l, Q as lt, Vi as m, en as mt, ha as n, vr as nt, Ki as o, sr as ot, Hi as p, Yt as pt, Wr as q, ga as r, mr as rt, Di as s, or as st, da as t, yr as tt, Ji as u, Qn as ut, Ui as v, Kt as vt, ra as w, Ge as wt, oa as x, pt as xt, ki as y, F as yt, li as z };
