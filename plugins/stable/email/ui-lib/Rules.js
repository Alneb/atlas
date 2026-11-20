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
}(), ge = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml"), _e = {}, C = Symbol("uninitialized"), ve = "http://www.w3.org/1999/xhtml", ye = "http://www.w3.org/2000/svg", be = "http://www.w3.org/1998/Math/MathML";
function xe() {
	console.warn("https://svelte.dev/e/derived_inert");
}
function Se(e) {
	console.warn("https://svelte.dev/e/hydration_mismatch");
}
function Ce() {
	console.warn("https://svelte.dev/e/select_multiple_invalid_value");
}
function we() {
	console.warn("https://svelte.dev/e/svelte_boundary_reset_noop");
}
// ui/node_modules/svelte/src/internal/client/dom/hydration.js
var w = !1;
function Te(e) {
	w = e;
}
var T;
function E(e) {
	if (e === null) throw Se(), _e;
	return T = e;
}
function Ee() {
	return E(/* @__PURE__ */ L(T));
}
function D(e) {
	if (w) {
		if (/* @__PURE__ */ L(T) !== null) throw Se(), _e;
		T = e;
	}
}
function De(e = 1) {
	if (w) {
		for (var t = e, n = T; t--;) n = /* @__PURE__ */ L(n);
		T = n;
	}
}
function Oe(e = !0) {
	for (var t = 0, n = T;;) {
		if (n.nodeType === 8) {
			var r = n.data;
			if (r === "]") {
				if (t === 0) return n;
				--t;
			} else (r === "[" || r === "[!" || r[0] === "[" && !isNaN(Number(r.slice(1)))) && (t += 1);
		}
		var i = /* @__PURE__ */ L(n);
		e && n.remove(), n = i;
	}
}
function ke(e) {
	if (!e || e.nodeType !== 8) throw Se(), _e;
	return e.data;
}
// ui/node_modules/svelte/src/internal/client/reactivity/equality.js
function Ae(e) {
	return e === this.v;
}
function je(e, t) {
	return e == e ? e !== t || typeof e == "object" && !!e || typeof e == "function" : t == t;
}
function Me(e) {
	return !je(e, this.v);
}
function Ne(e) {
	throw Error("https://svelte.dev/e/lifecycle_outside_component");
}
// ui/node_modules/svelte/src/internal/client/errors.js
function Pe() {
	throw Error("https://svelte.dev/e/async_derived_orphan");
}
function Fe(e, t, n) {
	throw Error("https://svelte.dev/e/each_key_duplicate");
}
function Ie(e) {
	throw Error("https://svelte.dev/e/effect_in_teardown");
}
function Le() {
	throw Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function Re(e) {
	throw Error("https://svelte.dev/e/effect_orphan");
}
function ze() {
	throw Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function Be(e) {
	throw Error("https://svelte.dev/e/props_invalid_value");
}
function Ve() {
	throw Error("https://svelte.dev/e/state_descriptors_fixed");
}
function He() {
	throw Error("https://svelte.dev/e/state_prototype_fixed");
}
function Ue() {
	throw Error("https://svelte.dev/e/state_unsafe_mutation");
}
function We() {
	throw Error("https://svelte.dev/e/svelte_boundary_reset_onerror");
}
// ui/node_modules/svelte/src/internal/client/context.js
var O = null;
function Ge(e) {
	O = e;
}
function Ke(e, t = !1, n) {
	O = {
		p: O,
		i: !1,
		c: null,
		e: null,
		s: e,
		x: null,
		r: G,
		l: null
	};
}
function qe(e) {
	var t = O, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) yn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, O = t.p, Je(e);
}
function Je(e = {}) {
	return i(e, se, { value: !0 }), e;
}
function Ye() {
	return !0;
}
// ui/node_modules/svelte/src/internal/client/dom/task.js
var Xe = [];
function Ze() {
	var e = Xe;
	Xe = [], f(e);
}
function k(e) {
	if (Xe.length === 0 && !Tt) {
		var t = Xe;
		queueMicrotask(() => {
			t === Xe && Ze();
		});
	}
	Xe.push(e);
}
function Qe() {
	for (; Xe.length > 0;) Ze();
}
// ui/node_modules/svelte/src/internal/client/reactivity/status.js
var $e = ~(g | _ | h);
function A(e, t) {
	e.f = e.f & $e | t;
}
function et(e) {
	e.f & 512 || e.deps === null ? A(e, h) : A(e, _);
}
// ui/node_modules/svelte/src/internal/client/reactivity/utils.js
function tt(e, t) {
	e.f & 2048 ? t.set(e, g) : e.f & 4096 && t.get(e) !== 2048 && t.set(e, _), A(e, h);
}
// ui/node_modules/svelte/src/internal/client/dom/elements/misc.js
function nt(e, t) {
	if (t) {
		let t = document.body;
		e.autofocus = !0, k(() => {
			document.activeElement === t && e.focus();
		});
	}
}
function rt(e) {
	w && /* @__PURE__ */ I(e) !== null && cn(e);
}
var it = !1;
function at() {
	it || (it = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[me]?.();
		});
	}, { capture: !0 }));
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function ot(e) {
	var t = H, n = G;
	W(null), K(null);
	try {
		return e();
	} finally {
		W(t), K(n);
	}
}
function st(e, t, n, r = n) {
	e.addEventListener(t, () => ot(n));
	let i = e[me];
	e[me] = i ? () => {
		i(), r(!0);
	} : () => r(!0), at();
}
// ui/node_modules/svelte/src/internal/client/reactivity/async.js
function ct(e, t, n, r) {
	let i = Ye() ? ft : gt;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = G, c = lt(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
	function u(e) {
		if (!(s.f & 16384)) {
			c();
			try {
				r([...o, ...e]);
			} catch (e) {
				z(e, s);
			}
			ut();
		}
	}
	var d = dt();
	if (n.length === 0) {
		l.then(() => u([])).finally(d);
		return;
	}
	function f() {
		Promise.all(n.map((e) => /* @__PURE__ */ mt(e))).then(u).catch((e) => z(e, s)).finally(d);
	}
	l ? l.then(() => {
		s.f & 16384 ? d() : (c(), f(), ut());
	}) : f();
}
function lt() {
	var e = G, t = H, n = O, r = j;
	return function(i = !0) {
		K(e), W(t), Ge(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function ut(e = !0) {
	K(null), W(null), Ge(null), e && j?.deactivate();
}
function dt() {
	var e = G, t = e.b, n = j, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function ft(e) {
	var t = 2 | g;
	return G !== null && (G.f |= ee), {
		ctx: O,
		deps: null,
		effects: null,
		equals: Ae,
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
var pt = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function mt(e, t, n) {
	let r = G;
	r === null && Pe();
	var i = void 0, a = Ht(C), o = !H, s = /* @__PURE__ */ new Set();
	return Sn(() => {
		var t = G, n = p();
		i = n.promise;
		try {
			Promise.resolve(e()).then(n.resolve, (e) => {
				e !== he && n.reject(e);
			}).finally(ut);
		} catch (e) {
			n.reject(e), ut();
		}
		var c = j;
		if (o) {
			if (t.f & 32768) var l = dt();
			if (r.b?.is_rendered()) c.async_deriveds.get(t)?.reject(pt);
			else for (let e of s.values()) e.reject(pt);
			s.add(n), c.async_deriveds.set(t, n);
		}
		let u = (e, t = void 0) => {
			l?.(), s.delete(n), t !== pt && (c.activate(), t ? (a.f |= ae, Kt(a, t)) : (a.f & 8388608 && (a.f ^= ae), Kt(a, e)), c.deactivate());
		};
		n.promise.then(u, (e) => u(null, e || "unknown"));
	}), _n(() => {
		for (let e of s) e.reject(pt);
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
function ht(e) {
	let t = /* @__PURE__ */ ft(e);
	return zn(t), t;
}
/*#__NO_SIDE_EFFECTS__*/
function gt(e) {
	let t = /* @__PURE__ */ ft(e);
	return t.equals = Me, t;
}
function _t(e) {
	var t = e.effects;
	if (t !== null) {
		e.effects = null;
		for (var n = 0; n < t.length; n += 1) V(t[n]);
	}
}
function vt(e) {
	var t, n = G, r = e.parent;
	if (!Ln && r !== null && e.v !== C && r.f & 24576) return xe(), e.v;
	K(r);
	try {
		_t(e), t = Jn(e);
	} finally {
		K(n);
	}
	return t;
}
function yt(e) {
	var t = vt(e);
	!e.equals(t) && (e.wv = Gn(), (!j?.is_fork || e.deps === null) && (j === null ? e.v = t : (j.capture(e, t, !0), Ct?.capture(e, t, !0)), e.deps === null)) ? A(e, h) : Ln || (M === null ? et(e) : (gn() || j?.is_fork) && M.set(e, t));
}
function bt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && ot(() => {
		t.ac.abort(he), t.ac = null;
	}), t.fn !== null && (t.teardown = d), Zn(t, 0), Dn(t));
}
function xt(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && Qn(t);
}
// ui/node_modules/svelte/src/internal/client/reactivity/batch.js
var St = null, j = null, Ct = null, M = null, wt = null, Tt = !1, Et = !1, Dt = null, Ot = null, kt = 0, At = 1, jt = class e {
	id = At++;
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
		St === null ? St = this : (St.next = this, this.prev = St), St = this;
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
			for (var r of n.d) A(r, g), t(r);
			for (r of n.m) A(r, _), t(r);
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
		for (let [e, t] of this.#s) A(e, t), this.schedule(e);
		this.apply();
		for (var t = Dt = [], n = [], r = Ot = []; this.#a.length > 0;) {
			kt++ > 1e3 && (this.#b(), Nt());
			for (let e of this.#p()) try {
				this.#h(e, t, n);
			} catch (t) {
				throw Rt(e), this.#d() || this.discard(), t;
			}
		}
		if (j = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (Dt = null, Ot = null, this.#d()) {
			this.#y(n), this.#y(t);
			for (let [e, t] of this.#c) Lt(e, t);
			r.length > 0 && j.#m();
			return;
		}
		let a = this.#g();
		if (a) this.#y(n), this.#y(t), a.#v(this);
		else {
			this.#s.clear();
			for (let e of this.#e) e(this);
			this.#e.clear(), Ct = this, Ft(n), Ft(t), Ct = null, this.#i?.resolve();
			var o = j;
			this.#n === 0 && (this.#a.length === 0 || o !== null) && this.#b(), o !== null && (Bt.clear(), o.#m());
		}
	}
	#h(e, t, n) {
		e.f ^= h;
		for (var r = e.first; r !== null;) {
			var i = r.f, a = !!(i & 96);
			if (!(a && i & 1024 || i & 8192 || this.#c.has(r)) && r.fn !== null) {
				a ? r.f ^= h : i & 4 ? t.push(r) : Kn(r) && (i & 16 && this.add_dirty_reaction(r, _), Qn(r));
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
					r & 4194320 && !this.async_deriveds.has(i) && (this.#s.delete(i), A(i, g), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#b(), j = this, this.#m();
	}
	#y(e) {
		for (var t = 0; t < e.length; t += 1) tt(e[t], this.#s);
	}
	capture(e, t, n = !1) {
		e.v !== C && !this.previous.has(e) && this.previous.set(e, e.v), e.f & 8388608 || (this.current.set(e, [t, n]), M?.set(e, t)), this.is_fork || (e.v = t);
	}
	activate() {
		j = this;
	}
	deactivate() {
		j = null, M = null;
	}
	flush() {
		try {
			Et = !0, j = this, this.#m();
		} finally {
			kt = 0, wt = null, Dt = null, Ot = null, Et = !1, j = null, M = null, Bt.clear();
		}
	}
	discard() {
		for (let e of this.#t) e(this);
		this.#t.clear();
		for (let e of this.async_deriveds.values()) e.reject(pt);
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
		this.#u || (this.#u = !0, k(() => {
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
		if (j === null) {
			let t = j = new e();
			!Et && !Tt && k(() => {
				t.started || t.flush();
			});
		}
		return j;
	}
	apply() {
		M = null;
	}
	schedule(e) {
		wt = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768) ? e.b.defer_effect(e) : this.#a.push(e);
	}
	#b() {
		if (this.linked) {
			var e = this.prev, t = this.next;
			e === null || (e.next = t), t === null ? St = e : t.prev = e, this.linked = !1;
		}
	}
};
function Mt(e) {
	var t = Tt, n = Ct;
	Ct = null, Tt = !0;
	try {
		var r;
		for (e && (Mt(), r = e());;) {
			if (Qe(), j === null) return r;
			j.flush();
		}
	} finally {
		Tt = t, Ct = n;
	}
}
function Nt() {
	try {
		ze();
	} catch (e) {
		z(e, wt);
	}
}
var Pt = null;
function Ft(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && Kn(r) && (Pt = /* @__PURE__ */ new Set(), Qn(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && An(r), Pt?.size > 0)) {
				Bt.clear();
				for (let e of Pt) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) Pt.has(n) && (Pt.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || Qn(n);
					}
				}
				Pt.clear();
			}
		}
		Pt = null;
	}
}
function It(e) {
	j.schedule(e);
}
function Lt(e, t) {
	if (!(e.f & 32 && e.f & 1024)) {
		e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), A(e, h);
		for (var n = e.first; n !== null;) Lt(n, t), n = n.next;
	}
}
function Rt(e) {
	A(e, h);
	for (var t = e.first; t !== null;) Rt(t), t = t.next;
}
// ui/node_modules/svelte/src/internal/client/reactivity/sources.js
var zt = /* @__PURE__ */ new Set(), Bt = /* @__PURE__ */ new Map(), Vt = !1;
function Ht(e, t) {
	return {
		f: 0,
		v: e,
		reactions: null,
		equals: Ae,
		rv: 0,
		wv: 0
	};
}
/*#__NO_SIDE_EFFECTS__*/
function N(e, t) {
	let n = Ht(e, t);
	return zn(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function Ut(e, t = !1, n = !0) {
	let r = Ht(e);
	return t || (r.equals = Me), r;
}
function P(e, t, n = !1) {
	return H !== null && (!U || H.f & 131072) && Ye() && H.f & 4325394 && (q === null || !q.has(e)) && Ue(), Kt(e, n ? Xt(t) : t, Ot);
}
var Wt = null, Gt = 0;
function Kt(e, t, n = null) {
	if (!e.equals(t)) {
		Ln ? Bt.set(e, t) : Bt.has(e) || Bt.set(e, e.v);
		var r = jt.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && vt(t), M === null && et(t);
		}
		e.wv = Gn(), Wt = null, Gt = 0, Yt(e, g, n), Wt = null, Ye() && G !== null && G.f & 1024 && !(G.f & 96) && (X === null ? Bn([e]) : X.push(e)), !r.is_fork && zt.size > 0 && !Vt && qt();
	}
	return t;
}
function qt() {
	Vt = !1;
	for (let e of zt) {
		e.f & 1024 && A(e, _);
		let t;
		try {
			t = Kn(e);
		} catch {
			t = !0;
		}
		t && Qn(e);
	}
	zt.clear();
}
function Jt(e) {
	P(e, e.v + 1);
}
function Yt(e, t, n) {
	var r = e.reactions;
	if (r !== null) {
		var i = Ye(), a = r.length;
		if (Gt += a, Gt > 1e5 && Wt === null && (Wt = /* @__PURE__ */ new Set()), Wt !== null) {
			if (Wt.has(e)) return;
			Wt.add(e);
		}
		for (var o = 0; o < a; o++) {
			var s = r[o], c = s.f;
			if (i || s !== G) {
				var l = (c & g) === 0;
				if (l && A(s, t), c & 131072) zt.add(s);
				else if (c & 2) {
					var u = s;
					M?.delete(u), Yt(u, _, n);
				} else if (l) {
					var d = s;
					c & 16 && Pt !== null && Pt.add(d), n === null ? It(d) : n.push(d);
				}
			}
		}
	}
}
function Xt(t) {
	if (typeof t != "object" || !t || oe in t || se in t) return t;
	let n = l(t);
	if (n !== s && n !== c) return t;
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ N(0), u = null, d = Un, f = (e) => {
		if (Un === d) return e();
		var t = H, n = Un;
		W(null), Wn(d);
		var r = e();
		return W(t), Wn(n), r;
	};
	return i && r.set("length", /* @__PURE__ */ N(t.length, u)), new Proxy(t, {
		defineProperty(e, t, n) {
			"value" in n && n.configurable !== !1 && n.enumerable !== !1 && n.writable !== !1 || Ve();
			var i = r.get(t);
			return i === void 0 ? f(() => {
				var e = /* @__PURE__ */ N(n.value, u);
				return r.set(t, e), e;
			}) : P(i, n.value, !0), !0;
		},
		deleteProperty(e, t) {
			var n = r.get(t);
			if (n === void 0) {
				if (t in e) {
					let e = f(() => /* @__PURE__ */ N(C, u));
					r.set(t, e), Jt(o);
				}
			} else P(n, C), Jt(o);
			return !0;
		},
		get(e, n, i) {
			if (n === oe) return t;
			var o = r.get(n), s = n in e;
			if (o === void 0 && (!s || a(e, n)?.writable) && (o = f(() => /* @__PURE__ */ N(Xt(s ? e[n] : C), u)), r.set(n, o)), o !== void 0) {
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
			return (n !== void 0 || (G !== null || H !== null) && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ N(i ? Xt(e[t]) : C, u)), r.set(t, n)), Z(n) === C) ? !1 : i;
		},
		set(e, t, n, s) {
			var c = r.get(t), l = t in e;
			if (i && t === "length") for (var d = n; d < c.v; d += 1) {
				var p = r.get(d + "");
				p === void 0 ? d in e && (p = f(() => /* @__PURE__ */ N(C, u)), r.set(d + "", p)) : P(p, C);
			}
			if (c === void 0) (!l || a(e, t)?.writable) && (c = f(() => /* @__PURE__ */ N(void 0, u)), P(c, Xt(n)), r.set(t, c));
			else {
				l = c.v !== C;
				var m = f(() => Xt(n));
				P(c, m);
			}
			var h = Reflect.getOwnPropertyDescriptor(e, t);
			if (h?.set && h.set.call(s, n), !l) {
				if (i && typeof t == "string") {
					var g = r.get("length"), _ = Number(t);
					Number.isInteger(_) && _ >= g.v && P(g, _ + 1);
				}
				Jt(o);
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
			He();
		}
	});
}
function Zt(e) {
	try {
		if (typeof e == "object" && e && oe in e) return e[oe];
	} catch {}
	return e;
}
function Qt(e, t) {
	return Object.is(Zt(e), Zt(t));
}
var $t, en, tn, nn;
function rn() {
	if ($t === void 0) {
		$t = window, en = /Firefox/.test(navigator.userAgent);
		var e = Element.prototype, t = Node.prototype, n = Text.prototype;
		tn = a(t, "firstChild").get, nn = a(t, "nextSibling").get, u(e) && (e[de] = void 0, e[ue] = null, e[fe] = void 0, e.__e = void 0), u(n) && (n[pe] = void 0);
	}
}
function F(e = "") {
	return document.createTextNode(e);
}
/*@__NO_SIDE_EFFECTS__*/
function I(e) {
	return tn.call(e);
}
/*@__NO_SIDE_EFFECTS__*/
function L(e) {
	return nn.call(e);
}
function an(e, t) {
	if (!w) return /* @__PURE__ */ I(e);
	var n = /* @__PURE__ */ I(T);
	if (n === null) n = T.appendChild(F());
	else if (t && n.nodeType !== 3) {
		var r = F();
		return n?.before(r), E(r), r;
	}
	return t && dn(n), E(n), n;
}
function on(e, t = !1) {
	if (!w) {
		var n = /* @__PURE__ */ I(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ L(n) : n;
	}
	if (t) {
		if (T?.nodeType !== 3) {
			var r = F();
			return T?.before(r), E(r), r;
		}
		dn(T);
	}
	return T;
}
function sn(e, t = !1) {
	if (!w) return /* @__PURE__ */ I(e);
	var n = an(e, t);
	return D(e), n;
}
function R(e, t = 1, n = !1) {
	let r = w ? T : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ L(r);
	if (!w) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = F();
			return r === null ? i?.after(a) : r.before(a), E(a), a;
		}
		dn(r);
	}
	return E(r), r;
}
function cn(e) {
	e.textContent = "";
}
function ln() {
	return !1;
}
function un(e, t, n) {
	return t == null || t === "http://www.w3.org/1999/xhtml" ? n ? document.createElement(e, { is: n }) : document.createElement(e) : n ? document.createElementNS(t, e, { is: n }) : document.createElementNS(t, e);
}
function dn(e) {
	if (e.nodeValue.length < 65536) return;
	let t = e.nextSibling;
	for (; t !== null && t.nodeType === 3;) t.remove(), e.nodeValue += t.nodeValue, t = e.nextSibling;
}
function fn(e) {
	var t = G;
	if (t === null) return H.f |= ae, e;
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
function pn(e) {
	G === null && (H === null && Re(e), Le()), Ln && Ie(e);
}
function mn(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function hn(e, t) {
	var n = G;
	n !== null && n.f & 8192 && (e |= v);
	var r = {
		ctx: O,
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
	j?.register_created_effect(r);
	var i = r;
	if (e & 4) Dt === null ? jt.ensure().schedule(r) : Dt.push(r);
	else if (t !== null) {
		try {
			Qn(r);
		} catch (e) {
			throw V(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= S));
	}
	if (i !== null && (i.parent = n, n !== null && mn(i, n), H !== null && H.f & 2 && !(e & 64))) {
		var a = H;
		(a.effects ??= []).push(i);
	}
	return r;
}
function gn() {
	return H !== null && !U;
}
function _n(e) {
	let t = hn(8, null);
	return A(t, h), t.teardown = e, t;
}
function vn(e) {
	pn("$effect");
	var t = G.f;
	if (!H && t & 32 && O !== null && !O.i) {
		var n = O;
		(n.e ??= []).push(e);
	} else return yn(e);
}
function yn(e) {
	return hn(4 | te, e);
}
function bn(e) {
	jt.ensure();
	let t = hn(64 | ee, e);
	return (e = {}) => new Promise((n) => {
		e.outro ? jn(t, () => {
			V(t), n(void 0);
		}) : (V(t), n(void 0));
	});
}
function xn(e) {
	return hn(4, e);
}
function Sn(e) {
	return hn(ie | ee, e);
}
function Cn(e, t = 0) {
	return hn(8 | t, e);
}
function wn(e, t = [], n = [], r = []) {
	ct(r, t, n, (t) => {
		hn(8, () => {
			e(...t.map(Z));
		});
	});
}
function Tn(e, t = 0) {
	return hn(16 | t, e);
}
function B(e) {
	return hn(32 | ee, e);
}
function En(e) {
	var t = e.teardown;
	if (t !== null) {
		let n = Ln, r = H;
		Rn(!0), W(null);
		try {
			t.call(null);
		} catch (t) {
			z(t, e.parent);
		} finally {
			Rn(n), W(r);
		}
	}
}
function Dn(e, t = !1) {
	var n = e.first;
	for (e.first = e.last = null; n !== null;) {
		let e = n.ac;
		e !== null && ot(() => {
			e.abort(he);
		});
		var r = n.next;
		n.f & 64 ? n.parent = null : V(n, t), n = r;
	}
}
function On(e) {
	for (var t = e.first; t !== null;) {
		var n = t.next;
		t.f & 32 || V(t), t = n;
	}
}
function V(e, t = !0) {
	var n = !1;
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (kn(e.nodes.start, e.nodes.end), n = !0), e.f |= x, Dn(e, t && !n), Zn(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	En(e), e.f ^= x, e.f |= y;
	var i = e.parent;
	i !== null && i.first !== null && An(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function kn(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ L(e);
		e.remove(), e = n;
	}
}
function An(e) {
	var t = e.parent, n = e.prev, r = e.next;
	n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n));
}
function jn(e, t, n = !0) {
	var r = [];
	e.f |= 256, Mn(e, r, !0);
	var i = () => {
		n && V(e), t && t();
	}, a = r.length;
	if (a > 0) {
		var o = () => --a || i();
		for (var s of r) s.out(o);
	} else i();
}
function Mn(e, t, n) {
	if (!(e.f & 8192)) {
		e.f ^= v;
		var r = e.nodes && e.nodes.t;
		if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
		for (var i = e.first; i !== null;) {
			var a = i.next;
			if (!(i.f & 64)) {
				var o = !!(i.f & 65536) || !!(i.f & 32) && !!(e.f & 16);
				Mn(i, t, o ? n : !1);
			}
			i = a;
		}
	}
}
function Nn(e) {
	e.f &= -257, Pn(e, !0);
}
function Pn(e, t) {
	if (!(e.f & 256) && e.f & 8192) {
		e.f ^= v, e.f & 1024 || (A(e, g), jt.ensure().schedule(e));
		for (var n = e.first; n !== null;) {
			var r = n.next, i = !!(n.f & 65536) || !!(n.f & 32);
			Pn(n, i ? t : !1), n = r;
		}
		var a = e.nodes && e.nodes.t;
		if (a !== null) for (let e of a) (e.is_global || t) && e.in();
	}
}
function Fn(e, t) {
	if (e.nodes) for (var n = e.nodes.start, r = e.nodes.end; n !== null;) {
		var i = n === r ? null : /* @__PURE__ */ L(n);
		t.append(n), n = i;
	}
}
// ui/node_modules/svelte/src/internal/client/legacy.js
var In = null, Ln = !1;
function Rn(e) {
	Ln = e;
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
function zn(e) {
	H !== null && (H.f & 2097152 || H.f & 2) && (q ??= /* @__PURE__ */ new Set()).add(e);
}
var J = null, Y = 0, X = null;
function Bn(e) {
	X = e;
}
var Vn = 1, Hn = 0, Un = Hn;
function Wn(e) {
	Un = e;
}
function Gn() {
	return ++Vn;
}
function Kn(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (Kn(a) && yt(a), a.wv > e.wv) return !0;
		}
		t & 512 && M === null && A(e, h);
	}
	return !1;
}
function qn(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(q !== null && q.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? qn(a, t, !1) : t === a && (n ? A(a, g) : a.f & 1024 && A(a, _), It(a));
	}
}
function Jn(e) {
	var t = J, n = Y, r = X, i = H, a = q, o = O, s = U, c = Un, l = e.f;
	J = null, Y = 0, X = null, H = l & 96 ? null : e, q = null, Ge(e.ctx), U = !1, Un = ++Hn, e.ac !== null && (ot(() => {
		e.ac.abort(he);
	}), e.ac = null);
	try {
		e.f |= re;
		var u = e.fn, d = u();
		e.f |= b;
		var f = Yn(e);
		if (Ye() && X !== null && !U && f !== null && !(e.f & 6146)) for (var p = 0; p < X.length; p++) qn(X[p], e);
		if (i !== null && i !== e) {
			if (Hn++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = Hn;
			if (t !== null) for (let e of t) e.rv = Hn;
			X !== null && (r === null ? r = X : r.push(...X));
		}
		return e.f & 8388608 && (e.f ^= ae), d;
	} catch (t) {
		return Yn(e), fn(t);
	} finally {
		e.f ^= re, J = t, Y = n, X = r, H = i, q = a, Ge(o), U = s, Un = c;
	}
}
function Yn(e) {
	var t = e.deps, n = j?.is_fork;
	if (J !== null) {
		var r;
		if (n || Zn(e, Y), t !== null && Y > 0) for (t.length = Y + J.length, r = 0; r < J.length; r++) t[Y + r] = J[r];
		else e.deps = t = J;
		if (gn() && e.f & 512) for (r = Y; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && Y < t.length && (Zn(e, Y), t.length = Y);
	return t;
}
function Xn(e, r) {
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
		s.f & 512 && (s.f ^= 512), s.v !== C && et(s), s.ac !== null && ot(() => {
			s.ac.abort(he), s.ac = null, A(s, g);
		}), bt(s), Zn(s, 0);
	}
}
function Zn(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) Xn(e, n[r]);
}
function Qn(e) {
	var t = e.f;
	if (!(t & 16384)) {
		A(e, h);
		var n = G;
		G = e;
		try {
			t & 16777232 ? On(e) : Dn(e), En(e);
			var r = Jn(e);
			e.teardown = typeof r == "function" ? r : null, e.wv = Vn;
		} finally {
			G = n;
		}
	}
}
async function $n() {
	await Promise.resolve(), Mt();
}
function Z(e) {
	var t = !!(e.f & 2);
	if (In?.add(e), H !== null && !U && !(G !== null && G.f & 16384) && (q === null || !q.has(e))) {
		var r = H.deps;
		if (H.f & 2097152) e.rv < Hn && (e.rv = Hn, J === null && r !== null && r[Y] === e ? Y++ : J === null ? J = [e] : J.push(e));
		else {
			H.deps ??= [], n.call(H.deps, e) || H.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [H] : n.call(i, H) || i.push(H);
		}
	}
	if (Ln && Bt.has(e)) return Bt.get(e);
	if (t) {
		var a = e;
		if (Ln) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || tr(a)) && (o = vt(a)), Bt.set(a, o), o;
		}
		var s = !(a.f & 512) && !U && H !== null && !!(H.f & 512), c = (a.f & b) === 0;
		Kn(a) && (s && (a.f |= 512), yt(a)), s && !c && (xt(a), er(a));
	}
	if (M?.has(e)) return M.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function er(e) {
	if (e.f |= 512, e.deps !== null) for (let r of e.deps) {
		var t = r.reactions;
		t === null ? r.reactions = [e] : n.call(t, e) || t.push(e), r.f & 2 && !(r.f & 512) && (xt(r), er(r));
	}
}
function tr(e) {
	if (e.v === C) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (Bt.has(t) || t.f & 2 && tr(t)) return !0;
	return !1;
}
function nr(e) {
	var t = U;
	try {
		return U = !0, e();
	} finally {
		U = t;
	}
}
[.../* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split(".")];
var rr = ["touchstart", "touchmove"];
function ir(e) {
	return rr.includes(e);
}
// ui/node_modules/svelte/src/internal/client/dev/css.js
var ar = Symbol("events"), or = /* @__PURE__ */ new Set(), sr = /* @__PURE__ */ new Set();
function cr(e) {
	if (!w) return;
	e.removeAttribute("onload"), e.removeAttribute("onerror");
	let t = e.__e;
	t !== void 0 && (e.__e = void 0, queueMicrotask(() => {
		e.isConnected && e.dispatchEvent(t);
	}));
}
function lr(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || hr.call(t, e), !e.cancelBubble) return ot(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, k(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function ur(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = lr(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && _n(() => {
		o.__removed = !0, t.removeEventListener(e, o, a);
	});
}
function dr(e, t, n) {
	(t[ar] ??= {})[e] = n;
}
function fr(e) {
	for (var t = 0; t < e.length; t++) or.add(e[t]);
	for (var n of sr) n(e);
}
var pr = null, mr = !1;
function hr(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	pr = e, mr || (mr = !0, setTimeout(() => {
		mr = !1, pr = null;
	}));
	var s = 0, c = pr === e && e[ar];
	if (c) {
		var l = a.indexOf(c);
		if (l !== -1 && (t === document || t === window)) {
			e[ar] = t;
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
					var h = o[ar]?.[r];
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
			e[ar] = t, delete e.currentTarget, W(d), K(f);
		}
	}
}
// ui/node_modules/svelte/src/internal/client/dom/reconciler.js
var gr = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function _r(e) {
	return gr?.createHTML(e) ?? e;
}
function vr(e) {
	var t = un("template");
	return t.innerHTML = _r(e.replaceAll("<!>", "<!---->")), t.content;
}
// ui/node_modules/svelte/src/internal/client/dom/template.js
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
function yr(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (w) return Q(T, null), T;
		i === void 0 && (i = vr(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ I(i)));
		var t = r || en ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ I(t), s = t.lastChild;
			Q(o, s);
		} else Q(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function br(e, t, n = "svg") {
	var r = !e.startsWith("<!>"), i = !!(t & 1), a = `<${n}>${r ? e : "<!>" + e}</${n}>`, o;
	return () => {
		if (w) return Q(T, null), T;
		if (!o) {
			var e = /* @__PURE__ */ I(vr(a));
			if (i) for (o = document.createDocumentFragment(); /* @__PURE__ */ I(e);) o.appendChild(/* @__PURE__ */ I(e));
			else o = /* @__PURE__ */ I(e);
		}
		var t = o.cloneNode(!0);
		if (i) {
			var n = /* @__PURE__ */ I(t), r = t.lastChild;
			Q(n, r);
		} else Q(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function xr(e, t) {
	return /* @__PURE__ */ br(e, t, "svg");
}
function Sr(e = "") {
	if (!w) {
		var t = F(e + "");
		return Q(t, t), t;
	}
	var n = T;
	return n.nodeType === 3 ? dn(n) : (n.before(n = F()), E(n)), Q(n, n), n;
}
function Cr() {
	if (w) return Q(T, null), T;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = F();
	return e.append(t, n), Q(t, n), e;
}
function wr(e, t) {
	if (w) {
		var n = G;
		n.f & 32768 && n.nodes.end !== null || (n.nodes.end = T), Ee();
	} else e !== null && e.before(t);
}
// ui/node_modules/svelte/src/reactivity/create-subscriber.js
function Tr(e) {
	let t = 0, n = Ht(0), r;
	return () => {
		gn() && (Z(n), Cn(() => (t === 0 && (r = nr(() => e(() => Jt(n)))), t += 1, () => {
			k(() => {
				--t, t === 0 && (r?.(), r = void 0, Jt(n));
			});
		})));
	};
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var Er = S | ee;
function Dr(e, t, n, r) {
	new Or(e, t, n, r);
}
var Or = class {
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
	#m = Tr(() => (this.#p = Ht(this.#l), () => {
		this.#p = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = G;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = G.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = Tn(() => {
			if (w) {
				let e = ke(this.#t);
				Ee();
				let t = e === "[!";
				if (e.startsWith("[?")) {
					let t = JSON.parse(e.slice(2));
					this.#g(t);
				} else t ? this.#y() : this.#h();
			} else this.#b();
		}, Er), w && (this.#e = T);
	}
	#h() {
		try {
			this.#a = B(() => this.#r(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#g(e) {
		let t = this.#n.failed, { reset: n, invoke_onerror: r } = this.#_(e);
		k(r), t && (this.#s = B(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#_(e) {
		var t = !1, n = !1;
		let r = () => {
			this.#v() || (t ? we() : (t = !0, n && We(), this.#s !== null && jn(this.#s, () => {
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
		e && (this.is_pending = !0, this.#o = B(() => e(this.#e)), k(() => {
			if (!this.#v()) {
				var e = this.#c = document.createDocumentFragment(), t = F(), n = !1;
				e.append(t), this.#a = this.#S(() => {
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
				}), this.#a === null ? (this.#c = null, n && this.#x(j)) : this.#u === 0 && (this.#e.before(e), this.#c = null, jn(this.#o, () => {
					this.#o = null;
				}), this.#x(j));
			}
		}));
	}
	#b() {
		try {
			if (this.is_pending = this.has_pending_snippet(), this.#u = 0, this.#l = 0, this.#a = B(() => {
				this.#r(this.#e);
			}), this.#u > 0) {
				var e = this.#c = document.createDocumentFragment();
				Fn(this.#a, e);
				let t = this.#n.pending;
				this.#o = B(() => t(this.#e));
			} else this.#x(j);
		} catch (e) {
			this.error(e);
		}
	}
	#x(e) {
		this.is_pending = !1, e.transfer_reactions(this.#f);
	}
	defer_effect(e) {
		tt(e, this.#f);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#n.pending;
	}
	#S(e) {
		var t = G, n = H, r = O;
		K(this.#i), W(this.#i), Ge(this.#i.ctx);
		try {
			return jt.ensure(), e();
		} finally {
			K(t), W(n), Ge(r);
		}
	}
	#C(e, t) {
		this.has_pending_snippet() ? (this.#u += e, this.#u === 0 && (this.#x(t), this.#o && jn(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null))) : this.parent && this.parent.#C(e, t);
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !this.#p || this.#d || (this.#d = !0, k(() => {
			this.#d = !1, this.#p && Kt(this.#p, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#m(), Z(this.#p);
	}
	error(e) {
		if (e === _e || !this.#n.onerror && !this.#n.failed) throw e;
		j?.is_fork ? (this.#a && j.skip_effect(this.#a), this.#o && j.skip_effect(this.#o), this.#s && j.skip_effect(this.#s), j.oncommit(() => {
			this.#v() || this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (V(this.#a), null), this.#o &&= (V(this.#o), null), this.#s &&= (V(this.#s), null), w && (E(this.#t), De(), E(Oe()));
		let t = this.#n.failed, n = (e) => {
			if (this.#v()) return;
			let { reset: n, invoke_onerror: r } = this.#_(e);
			r(), t && !this.#v() && (this.#s = this.#S(() => {
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
		k(() => {
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
function kr(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[pe] ??= e.nodeValue) && (e[pe] = n, e.nodeValue = `${n}`);
}
function Ar(e, t) {
	return Mr(e, t);
}
var jr = /* @__PURE__ */ new Map();
function Mr(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	rn();
	var l = void 0, u = bn(() => {
		var s = n ?? t.appendChild(F());
		Dr(s, { pending: () => {} }, (t) => {
			Ke({});
			var n = O;
			if (o && (n.c = o), a && (i.$$events = a), w && Q(t, null), l = e(t, i) || Je(), w && (G.nodes.end = T, T === null || T.nodeType !== 8 || T.data !== "]")) throw Se(), _e;
			qe();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = ir(r);
					for (let e of [t, document]) {
						var a = jr.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), jr.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, hr, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(or)), sr.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = jr.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, hr), r.delete(e), r.size === 0 && jr.delete(n)) : r.set(e, i);
			}
			sr.delete(d), s !== n && s.parentNode?.removeChild(s);
		};
	});
	return Nr.set(l, u), l;
}
var Nr = /* @__PURE__ */ new WeakMap();
function Pr(e, t) {
	let n = Nr.get(e);
	return n ? (Nr.delete(e), n(t)) : Promise.resolve();
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/branches.js
var Fr = class {
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
			if (n) Nn(n), this.#r.delete(t);
			else {
				var r = this.#n.get(t);
				r && (Nn(r.effect), this.#t.set(t, r.effect), this.#n.delete(t), r.fragment.lastChild.remove(), this.anchor.before(r.fragment), n = r.effect);
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
						Fn(r, t), t.append(F()), this.#n.set(e, {
							effect: r,
							fragment: t
						});
					} else V(r);
					this.#r.delete(e), this.#t.delete(e);
				};
				this.#i || !n ? (this.#r.add(e), jn(r, i, !1)) : i();
			}
		}
	};
	#o = (e) => {
		this.#e.delete(e);
		let t = Array.from(this.#e.values());
		for (let [e, n] of this.#n) t.includes(e) || (V(n.effect), this.#n.delete(e));
	};
	ensure(e, t) {
		var n = j, r = ln();
		if (t && !this.#t.has(e) && !this.#n.has(e)) {
			if (r) {
				var i = document.createDocumentFragment(), a = F();
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
// ui/node_modules/svelte/src/internal/client/dom/blocks/if.js
function Ir(e, t, n = !1) {
	var r;
	w && (r = T, Ee());
	var i = new Fr(e), a = n ? S : 0;
	function o(e, t) {
		if (w) {
			var n = ke(r);
			if (e !== parseInt(n.substring(1))) {
				var a = Oe();
				E(a), i.anchor = a, Te(!1), i.ensure(e, t), Te(!0);
				return;
			}
		}
		i.ensure(e, t);
	}
	Tn(() => {
		var e = !1;
		t((t, n = 0) => {
			e = !0, o(n, t);
		}), e || o(-1, null);
	}, a);
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/each.js
function Lr(e, t) {
	return t;
}
function Rr(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		jn(n, () => {
			if (o) {
				if (o.pending.delete(n), o.done.add(n), o.pending.size === 0) {
					var t = e.outrogroups;
					zr(e, r(o.done)), t.delete(o), t.size === 0 && (e.outrogroups = null);
				}
			} else --s;
		}, !1);
	}
	if (s === 0) {
		var l = i.length === 0 && n !== null && e.pending.size === 0;
		if (l) {
			var u = n, d = u.parentNode;
			cn(d), d.append(u), e.items.clear();
		}
		zr(e, t, !l);
	} else o = {
		pending: new Set(t),
		done: /* @__PURE__ */ new Set()
	}, (e.outrogroups ??= /* @__PURE__ */ new Set()).add(o);
}
function zr(e, t, n = !0) {
	var r;
	if (e.pending.size > 0) {
		r = /* @__PURE__ */ new Set();
		for (let t of e.pending.values()) for (let n of t) r.add(e.items.get(n).e);
	}
	for (var i = 0; i < t.length; i++) {
		var a = t[i];
		r?.has(a) ? (a.f |= ne, Fn(a, document.createDocumentFragment())) : V(t[i], n);
	}
}
var Br;
function Vr(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = w ? E(/* @__PURE__ */ I(u)) : u.appendChild(F());
	}
	w && Ee();
	var d = null, f = /* @__PURE__ */ gt(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p = /* @__PURE__ */ new Map(), m = !0;
	function h(e) {
		if (!(_.effect.f & 16384)) {
			_.pending.delete(e);
			var t = Z(f);
			_.fallback = d, Ur(_, t, c, n, a), d !== null && (t.length === 0 ? d.f & 33554432 ? (d.f ^= ne, Gr(d, null, c)) : Nn(d) : jn(d, () => {
				d = null;
			}));
		}
	}
	function g(e) {
		_.pending.delete(e);
	}
	var _ = {
		effect: Tn(() => {
			var e = Z(f), t = e.length;
			let r = !1;
			w && ke(c) === "[!" != (t === 0) && (c = Oe(), E(c), Te(!1), r = !0);
			for (var u = /* @__PURE__ */ new Set(), _ = j, v = ln(), y = 0; y < t; y += 1) {
				w && T.nodeType === 8 && T.data === "]" && (c = T, r = !0, Te(!1));
				var b = e[y], x = a(b, y), S = m ? null : l.get(x);
				S ? (S.v && Kt(S.v, b), S.i && Kt(S.i, y), v && _.unskip_effect(S.e)) : (S = Wr(l, m ? c : Br ??= F(), b, x, y, o, n, i), m || (S.e.f |= ne), l.set(x, S)), u.add(x);
			}
			if (t === 0 && s && !d && (m ? d = B(() => s(c)) : (d = B(() => s(Br ??= F())), d.f |= ne)), t > u.size && Fe("", "", ""), w && t > 0 && E(Oe()), !m) {
				if (p.set(_, u), v) {
					for (let [e, t] of l) u.has(e) || _.skip_effect(t.e);
					_.oncommit(h), _.ondiscard(g);
				} else h(_);
			}
			r && Te(!0), Z(f);
		}),
		flags: n,
		items: l,
		pending: p,
		outrogroups: null,
		fallback: d
	};
	m = !1, w && (c = T);
}
function Hr(e) {
	for (; e !== null && !(e.f & 32);) e = e.next;
	return e;
}
function Ur(e, t, n, i, a) {
	var o = !!(i & 8), s = t.length, c = e.items, l = Hr(e.effect.first), u, d = null, f, p = [], m = [], h, g, _, v;
	if (o) for (v = 0; v < s; v += 1) h = t[v], g = a(h, v), _ = c.get(g).e, _.f & 33554432 || (_.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(_));
	for (v = 0; v < s; v += 1) {
		if (h = t[v], g = a(h, v), _ = c.get(g).e, e.outrogroups !== null) for (let t of e.outrogroups) t.pending.delete(_), t.done.delete(_);
		if (_.f & 8192 && (Nn(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= ne, _ === l) Gr(_, null, n);
			else {
				var y = d ? d.next : l;
				_ === e.effect.last && (e.effect.last = _.prev), _.prev && (_.prev.next = _.next), _.next && (_.next.prev = _.prev), Kr(e, d, _), Kr(e, _, y), Gr(_, y, n), d = _, p = [], m = [], l = Hr(d.next);
				continue;
			}
		}
		if (_ !== l) {
			if (u !== void 0 && u.has(_)) {
				if (p.length < m.length) {
					var b = m[0], x;
					d = b.prev;
					var S = p[0], ee = p[p.length - 1];
					for (x = 0; x < p.length; x += 1) Gr(p[x], b, n);
					for (x = 0; x < m.length; x += 1) u.delete(m[x]);
					Kr(e, S.prev, ee.next), Kr(e, d, S), Kr(e, ee, b), l = b, d = ee, --v, p = [], m = [];
				} else u.delete(_), Gr(_, l, n), Kr(e, _.prev, _.next), Kr(e, _, d === null ? e.effect.first : d.next), Kr(e, d, _), d = _;
				continue;
			}
			for (p = [], m = []; l !== null && l !== _;) (u ??= /* @__PURE__ */ new Set()).add(l), m.push(l), l = Hr(l.next);
			if (l === null) continue;
		}
		_.f & 33554432 || p.push(_), d = _, l = Hr(_.next);
	}
	if (e.outrogroups !== null) {
		for (let t of e.outrogroups) t.pending.size === 0 && (zr(e, r(t.done)), e.outrogroups?.delete(t));
		e.outrogroups.size === 0 && (e.outrogroups = null);
	}
	if (l !== null || u !== void 0) {
		var te = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || te.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && te.push(l), l = Hr(l.next);
		var re = te.length;
		if (re > 0) {
			var ie = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.measure();
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.fix();
			}
			Rr(e, te, ie);
		}
	}
	o && k(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function Wr(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? Ht(n) : /* @__PURE__ */ Ut(n, !1, !1) : null, l = o & 2 ? Ht(i) : null;
	return {
		v: c,
		i: l,
		e: B(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function Gr(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ L(r);
		if (a.before(r), r === i) return;
		r = o;
	}
}
function Kr(e, t, n) {
	t === null ? e.effect.first = n : t.next = n, n === null ? e.effect.last = t : n.prev = t;
}
function qr(e, t, n = !1, r = !1, i = !1, a = !1) {
	var o = e, s = "";
	if (n) {
		var c = e;
		w && (o = E(/* @__PURE__ */ I(c)));
	}
	wn(() => {
		var e = G;
		if (s === (s = t() ?? "")) w && Ee();
		else if (n && !w) e.nodes = null, c.innerHTML = s, s !== "" && Q(/* @__PURE__ */ I(c), c.lastChild);
		else if (e.nodes !== null && (kn(e.nodes.start, e.nodes.end), e.nodes = null), s !== "") {
			if (w) {
				for (var a = T.data, l = Ee(), u = l; l !== null && (l.nodeType !== 8 || l.data !== "");) u = l, l = /* @__PURE__ */ L(l);
				if (l === null) throw Se(), _e;
				Q(T, u), o = E(l);
			} else {
				var d = un(r ? "svg" : i ? "math" : "template", r ? ye : i ? be : void 0);
				d.innerHTML = s;
				var f = r || i ? d : d.content;
				if (Q(/* @__PURE__ */ I(f), f.lastChild), r || i) for (; /* @__PURE__ */ I(f);) o.before(/* @__PURE__ */ I(f));
				else o.before(f);
			}
		}
	});
}
// ui/node_modules/svelte/src/internal/client/dom/css.js
function Jr(e, t) {
	xn(() => {
		e = G?.parent?.nodes?.start ?? e;
		var n = e.getRootNode(), r = n.host ? n : n.head ?? n.ownerDocument.head;
		if (!r.querySelector("#" + t.hash)) {
			let e = un("style");
			e.id = t.hash, e.textContent = t.code, r.appendChild(e);
		}
	});
}
// ui/node_modules/clsx/dist/clsx.mjs
function Yr(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") {
		if (Array.isArray(e)) {
			var i = e.length;
			for (t = 0; t < i; t++) e[t] && (n = Yr(e[t])) && (r && (r += " "), r += n);
		} else for (n in e) e[n] && (r && (r += " "), r += n);
	}
	return r;
}
function Xr() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = Yr(e)) && (r && (r += " "), r += t);
	return r;
}
// ui/node_modules/svelte/src/internal/shared/attributes.js
function Zr(e) {
	return typeof e == "object" ? Xr(e) : e ?? "";
}
var Qr = [..." 	\n\r\f\xA0\v﻿"];
function $r(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || Qr.includes(r[o - 1])) && (s === r.length || Qr.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function ei(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function ti(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function ni(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map(ti)), i && c.push(...Object.keys(i).map(ti));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = ti(e.substring(l, u).trim());
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
		return r && (n += ei(r)), i && (n += ei(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
// ui/node_modules/svelte/src/internal/client/dom/elements/class.js
function ri(e, t, n, r, i, a) {
	var o = e[de];
	if (w || o !== n || o === void 0) {
		var s = $r(n, r, a);
		w && s === e.getAttribute("class") || (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[de] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/style.js
function ii(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function ai(e, t, n, r) {
	var i = e[fe];
	if (w || i !== t) {
		var a = ni(t, r);
		w && a === e.getAttribute("style") || (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[fe] = t;
	} else r && (Array.isArray(r) ? (ii(e, n?.[0], r[0]), ii(e, n?.[1], r[1], "important")) : ii(e, n, r));
	return r;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
function oi(e, t) {
	t ? e.hasAttribute("selected") || e.setAttribute("selected", "") : e.removeAttribute("selected");
}
function si(t, n) {
	var r = t.__defaultValue, i = t.multiple, a = i ? r ?? [] : null;
	if (!i || e(a)) {
		var o = t.selectedIndex, s = n && i ? new Set(t.selectedOptions) : null;
		for (var c of t.options) {
			var l = di(c);
			oi(c, i ? a.includes(l) : Qt(l, r));
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
function ci(t, n, r = !1) {
	if (t.multiple) {
		if (n == null) return;
		if (!e(n)) return Ce();
		for (var i of t.options) i.selected = n.includes(di(i));
	} else {
		for (i of t.options) if (Qt(di(i), n)) {
			i.selected = !0;
			return;
		}
		r && n === void 0 || (t.selectedIndex = -1);
	}
}
function li(e) {
	var t = new MutationObserver((t) => {
		t.every(fi) || ("__defaultValue" in e && si(e, !1), "__value" in e && ci(e, e.__value));
	});
	t.observe(e, {
		childList: !0,
		subtree: !0,
		attributes: !0,
		attributeFilter: ["value"]
	}), _n(() => {
		t.disconnect();
	});
}
function ui(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet(), i = !0;
	st(e, "change", (t) => {
		var i = t ? "[selected]" : ":checked", a;
		if (e.multiple) a = [].map.call(e.querySelectorAll(i), di);
		else {
			var o = e.querySelector(i) ?? e.querySelector("option:not([disabled])");
			a = o && di(o);
		}
		n(a), e.__value = a, j !== null && r.add(j);
	}), xn(() => {
		var a = t();
		if (e === document.activeElement) {
			var o = j;
			if (r.has(o)) return;
		}
		if (ci(e, a, i), i && a === void 0) {
			var s = e.querySelector(":checked");
			s !== null && (a = di(s), n(a));
		}
		e.__value = a, i = !1;
	});
}
function di(e) {
	return "__value" in e ? e.__value : e.value;
}
function fi(e) {
	if (e.target.closest("selectedcontent") !== null) return !0;
	if (e.type === "childList") {
		var t = [...e.addedNodes, ...e.removedNodes];
		return t.length > 0 && t.every((e) => e.nodeName === "SELECTEDCONTENT");
	}
	return !1;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/attributes.js
var pi = Symbol("is custom element"), mi = Symbol("is html"), hi = ge ? "link" : "LINK", gi = ge ? "progress" : "PROGRESS";
function _i(e) {
	if (w) {
		var t = !1, n = () => {
			if (!t) {
				if (t = !0, e.hasAttribute("value")) {
					var n = e.value;
					$(e, "value", null), e.value = n;
				}
				if (e.hasAttribute("checked")) {
					var r = e.checked;
					$(e, "checked", null), e.checked = r;
				}
			}
		};
		e[me] = n, k(n), at();
	}
}
function vi(e, t) {
	var n = yi(e);
	n.value !== (n.value = t ?? void 0) && (e.value !== t || t === 0 && e.nodeName === gi) && (e.value = t ?? "");
}
function $(e, t, n, r) {
	var i = yi(e);
	if (!(w && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === hi))) {
		var a = i[t];
		a !== (i[t] = n) && (t === "loading" && (e[le] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && xi(e).has(t) ? e[t] = n : (!w || typeof n != "number" && typeof n != "boolean" || a !== String(n)) && e.setAttribute(t, n));
	}
}
function yi(e) {
	return e[ue] ??= {
		[pi]: e.nodeName.includes("-"),
		[mi]: e.namespaceURI === ve
	};
}
var bi = /* @__PURE__ */ new Map();
function xi(e) {
	var t = e.getAttribute("is") || e.nodeName, n = bi.get(t);
	if (n) return n;
	bi.set(t, n = /* @__PURE__ */ new Set());
	for (var r, i = e, a = Element.prototype; a !== i;) {
		for (var s in r = o(i), r) r[s].set && s !== "innerHTML" && s !== "textContent" && s !== "innerText" && n.add(s);
		i = l(i);
	}
	return n;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function Si(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet();
	st(e, "input", async (i) => {
		var a = i ? e.defaultValue : e.value;
		if (a = Ci(e) ? wi(a) : a, n(a), j !== null && r.add(j), await $n(), a !== (a = t())) {
			var o = e.selectionStart, s = e.selectionEnd, c = e.value.length;
			if (e.value = a ?? "", s !== null) {
				var l = e.value.length;
				o === s && s === c && l > c ? (e.selectionStart = l, e.selectionEnd = l) : (e.selectionStart = o, e.selectionEnd = Math.min(s, l));
			}
		}
	}), (w && e.defaultValue !== e.value || nr(t) == null && e.value) && (n(Ci(e) ? wi(e.value) : e.value), j !== null && r.add(j)), Cn(() => {
		var n = t();
		if (e === document.activeElement) {
			var i = j;
			if (r.has(i)) return;
		}
		Ci(e) && n === wi(e.value) || (e.type !== "date" || n || e.value) && n !== e.value && (e.value = n ?? "");
	});
}
function Ci(e) {
	var t = e.type;
	return t === "number" || t === "range";
}
function wi(e) {
	return e === "" ? null : +e;
}
var Ti = /* @__PURE__ */ new class e {
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
function Ei(e, t, n) {
	var r = Ti.observe(e, () => n(e[t]));
	xn(() => (nr(() => n(e[t])), r));
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function Di(e, t) {
	return e === t || e?.[oe] === t;
}
function Oi(e = Je(), t, n, r) {
	var i = O.r, a = G;
	return xn(() => {
		var o, s;
		return Cn(() => {
			o = s, s = r?.() || [], nr(() => {
				Di(n(...s), e) || (t(e, ...s), o && Di(n(...o), e) && t(null, ...o));
			});
		}), () => {
			let r = a;
			for (; r !== i && r.parent !== null && r.parent.f & 33554432;) r = r.parent;
			let o = () => {
				s && Di(n(...s), e) && t(null, ...s);
			}, c = r.teardown;
			r.teardown = () => {
				o(), c?.();
			};
		};
	}), e;
}
// ui/node_modules/svelte/src/internal/client/reactivity/store.js
var ki = !1;
function Ai(e) {
	var t = ki;
	try {
		return ki = !1, [e(), ki];
	} finally {
		ki = t;
	}
}
// ui/node_modules/svelte/src/internal/client/reactivity/props.js
function ji(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ ft(r), Z(u)) : (l && (l = !1, c = s ? nr(r) : r), c);
	let f;
	if (o) {
		var p = oe in e || ce in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = Ai(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && Be(t), f(m)));
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
	var v = !1, y = (n & 1 ? ft : gt)(() => (v = !1, g()));
	o && Z(y);
	var b = G;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? Z(y) : i && o ? Xt(e) : e;
			return P(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return Ln && v || b.f & 16384 ? y.v : Z(y);
	});
}
function Mi(e) {
	O === null && Ne("onMount"), vn(() => {
		let t = nr(e);
		if (typeof t == "function") return t;
	});
}
// ui/node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
// plugins/stable/email/ui/src/Icon.svelte
var Ni = {
	inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z",
	star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z",
	clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
	send: "M21 3L10 14M21 3l-7 18-4-7-7-4z",
	draft: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
	archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
	trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
	spam: "M12 3l9 16H3zM12 10v4M12 17v.5",
	folder: "M3 6h6l2 2h10v11H3z",
	label: "M3 12V4h8l10 10-8 8z M7.5 8.5h.01",
	all: "M4 6h16M4 12h16M4 18h16",
	attach: "M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7",
	search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5",
	reply: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 6 6v5",
	replyall: "M7 14L2 9l5-5M12 14L7 9l5-5M7 9h7a6 6 0 0 1 6 6v5",
	forward: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0-6 6v5",
	more: "M5 12h.01M12 12h.01M19 12h.01",
	pen: "M4 20h4L19 9l-4-4L4 16z",
	check: "M4 12l5 5L20 6",
	x: "M6 6l12 12M18 6L6 18",
	back: "M15 18l-6-6 6-6",
	down: "M6 9l6 6 6-6",
	up: "M6 15l6-6 6 6",
	right: "M9 6l6 6-6 6",
	note: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
	refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
	filter: "M3 5h18l-7 8v6l-4 2v-8z",
	gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z",
	calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
	image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
	unread: "M4 6h16v12H4zM4 7l8 6 8-6",
	read: "M3 10l9-6 9 6v9H3zM3 10l9 6 9-6",
	menu: "M4 6h16M4 12h16M4 18h16",
	plus: "M12 5v14M5 12h14",
	layout: "M3 4h18v16H3zM9 4v16M9 12h12",
	person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
	news: "M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5",
	bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
	open: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
	lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
	save: "M12 4v11M7 10l5 5 5-5M5 20h14",
	link: "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2",
	keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10"
}, Pi = /* @__PURE__ */ xr("<svg class=\"icon svelte-jfnn1v\" viewBox=\"0 0 24 24\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg>"), Fi = {
	hash: "svelte-jfnn1v",
	code: ".icon.svelte-jfnn1v {flex:none;display:block;}"
};
function Ii(e, t) {
	Jr(e, Fi);
	let n = ji(t, "size", 3, 16), r = ji(t, "title", 3, ""), i = ji(t, "filled", 3, !1);
	var a = Pi(), o = sn(a);
	wn(() => {
		$(a, "width", n()), $(a, "height", n()), $(a, "fill", i() ? "currentColor" : "none"), $(a, "aria-hidden", r() ? void 0 : "true"), $(a, "role", r() ? "img" : void 0), $(a, "aria-label", r() || void 0), $(o, "d", Ni[t.name] ?? Ni.folder);
	}), wr(e, a);
}
// plugins/stable/email/ui/src/api.ts
async function Li(e, t, n = {}, r = 120) {
	try {
		return await e.helper.call(t, {
			...n,
			settings: e.plugin.settings
		}, { timeout: r });
	} catch (e) {
		throw Error(String(e?.message ?? e).replace(/^.*?plugin [\w-]+: \w+: /, "").replace(/^.*?(method|error): /i, ""));
	}
}
var Ri = (e, t, n) => e.plugin.settings[t] ?? n;
function zi(e, t = []) {
	return e ? t.includes(e.addr.toLowerCase()) ? "me" : e.name || e.addr.split("@")[0] : "(no sender)";
}
var Bi = (e) => e.name ? `${e.name} <${e.addr}>` : e.addr;
function Vi(e, t) {
	let n = e.map((e) => zi(e, t));
	return n.length <= 3 ? n.join(", ") : `${n[0]} … ${n.slice(-2).join(", ")}`;
}
var Hi = (e) => new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
function Ui(e) {
	if (!e) return "";
	let t = /* @__PURE__ */ new Date(e * 1e3), n = /* @__PURE__ */ new Date(), r = (Hi(n) - Hi(t)) / 864e5;
	return r === 0 ? t.toLocaleTimeString(void 0, {
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	}) : r > 0 && r < 7 ? t.toLocaleDateString(void 0, { weekday: "short" }) : t.getFullYear() === n.getFullYear() ? t.toLocaleDateString(void 0, {
		day: "numeric",
		month: "short"
	}) : t.toLocaleDateString(void 0, {
		day: "numeric",
		month: "short",
		year: "numeric"
	});
}
function Wi(e) {
	let t = /* @__PURE__ */ new Date(e * 1e3), n = Gi(e);
	return `${t.toLocaleString(void 0, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	})}${n ? ` (${n})` : ""}`;
}
function Gi(e) {
	let t = Date.now() / 1e3 - e;
	return t < 0 ? "" : t < 60 ? "just now" : t < 3600 ? `${Math.floor(t / 60)} min ago` : t < 86400 ? `${Math.floor(t / 3600)} h ago` : t < 172800 ? "yesterday" : t < 604800 ? `${Math.floor(t / 86400)} days ago` : "";
}
function Ki(e) {
	return e < 1024 ? `${e} B` : e < 1048576 ? `${Math.round(e / 1024)} KB` : `${(e / 1024 / 1024).toFixed(1)} MB`;
}
function qi(e) {
	let t = 0;
	for (let n of e.toLowerCase()) t = (t * 31 + n.charCodeAt(0)) % 360;
	return t;
}
var Ji = (e) => {
	let t = (e?.name || e?.addr || "?").replace(/["']/g, "").trim().split(/[\s.@_-]+/).filter(Boolean);
	return ((t[0]?.[0] ?? "?") + (t.length > 1 ? t[1][0] : "")).toUpperCase();
};
function Yi(e = /* @__PURE__ */ new Date()) {
	let t = (e) => Math.floor(e.getTime() / 1e3), n = (e) => {
		let t = new Date(e);
		return t.setHours(8, 0, 0, 0), t;
	}, r = new Date(e);
	r.setHours(e.getHours() + 3, 0, 0, 0);
	let i = n(new Date(e.getTime() + 864e5)), a = n(new Date(e.getTime() + ((6 - e.getDay() + 7) % 7 || 7) * 864e5)), o = n(new Date(e.getTime() + ((8 - e.getDay()) % 7 || 7) * 864e5)), s = [
		{
			label: `Later today · ${r.toLocaleTimeString(void 0, {
				hour: "2-digit",
				hourCycle: "h23",
				minute: "2-digit"
			})}`,
			at: t(r)
		},
		{
			label: `Tomorrow · ${i.toLocaleDateString(void 0, { weekday: "short" })} 08:00`,
			at: t(i)
		},
		{
			label: "This weekend · Sat 08:00",
			at: t(a)
		},
		{
			label: "Next week · Mon 08:00",
			at: t(o)
		}
	];
	return r.getDate() === e.getDate() ? s : s.slice(1);
}
function Xi(e, t = /* @__PURE__ */ new Date()) {
	let n = e.trim().toLowerCase(), r = n.match(/^(\d+)\s*(m|min|h|d|w)$/);
	if (r) return Math.floor(t.getTime() / 1e3) + Number(r[1]) * {
		m: 60,
		min: 60,
		h: 3600,
		d: 86400,
		w: 604800
	}[r[2]];
	let i = n.match(/^(\d{4}-\d{2}-\d{2})(?:[ t](\d{1,2})(?::(\d{2}))?)?$/);
	if (i) {
		let e = /* @__PURE__ */ new Date(`${i[1]}T${(i[2] ?? "8").padStart(2, "0")}:${i[3] ?? "00"}:00`);
		return isNaN(e.getTime()) ? null : Math.floor(e.getTime() / 1e3);
	}
	let a = n.match(/^(today|tomorrow|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s*(\d{1,2})?(?::(\d{2}))?$/);
	if (!a) return null;
	let o = new Date(t);
	if (a[1] === "tomorrow") o.setDate(o.getDate() + 1);
	else if (a[1] !== "today") {
		let e = [
			"sun",
			"mon",
			"tue",
			"wed",
			"thu",
			"fri",
			"sat"
		].indexOf(a[1].slice(0, 3));
		o.setDate(o.getDate() + ((e - o.getDay() + 7) % 7 || 7));
	}
	return o.setHours(a[2] ? Number(a[2]) : 8, a[3] ? Number(a[3]) : 0, 0, 0), Math.floor(o.getTime() / 1e3);
}
var Zi = (e, t, n) => typeof e.confirm == "function" ? e.confirm(t, n) : Promise.resolve(window.confirm(t)), Qi = (e, t, n = "") => typeof e.input == "function" ? e.input(t, { value: n }) : Promise.resolve(window.prompt(t, n)?.trim() || null), $i = /* @__PURE__ */ yr("<iframe class=\"frame svelte-lnhtx6\" title=\"The message\" sandbox=\"allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox\" scrolling=\"no\"></iframe>"), ea = {
	hash: "svelte-lnhtx6",
	code: ".frame.svelte-lnhtx6 {display:block;width:100%;border:0;background:transparent;color-scheme:normal;}"
};
function ta(e, t) {
	Ke(t, !0), Jr(e, ea);
	let n = ji(t, "plain", 3, !1), r = ji(t, "remote", 3, !1), i = ji(t, "prose", 3, "");
	function a() {
		let e = document.documentElement, t = getComputedStyle(e), n = e.dataset.theme !== "light", r = (e, r, i) => t.getPropertyValue(e).trim() || (n ? i : r);
		return {
			dark: n,
			bg: r("--bg", "#ffffff", "#1b1d22"),
			text: r("--text", "#1d1d1f", "#dcdfe5"),
			muted: r("--text-muted", "#555b66", "#aab0bb"),
			faint: r("--text-faint", "#7a808a", "#8a919d"),
			link: r("--link", "#2557d6", "#8aa4ff"),
			border: r("--border", "#d6d9de", "#3a3f4a"),
			borderStrong: r("--border-strong", "#c3c7cf", "#4a5060"),
			chip: r("--bg-alt", "#eceef1", "#2a2e36")
		};
	}
	let o = /* @__PURE__ */ N(Xt(a()));
	vn(() => {
		let e = new MutationObserver(() => P(o, a(), !0));
		return e.observe(document.documentElement, {
			attributes: !0,
			attributeFilter: [
				"data-theme",
				"data-palette",
				"style",
				"class"
			]
		}), () => e.disconnect();
	});
	let s = /* @__PURE__ */ ht(() => Z(o).dark), c = /* @__PURE__ */ N(void 0), l = /* @__PURE__ */ N(80);
	function u(e) {
		let t = e.body, n = t.querySelector(".gmail_quote,blockquote[type=cite],.yahoo_quoted,#appendonsend,#divRplyFwdMsg,#mail-editor-reference-message-container,.moz-cite-prefix,div[style*='border-top:solid #E1E1E1'],div[style*='border-top: solid #E1E1E1'],div[style*='border-top:solid #B5C4DF'],.atlas-quote");
		if (!n || !n.parentNode || n.closest("details") || !(t.textContent ?? "").split(n.textContent ?? "")[0].trim()) return;
		let r = n.matches("#appendonsend, #divRplyFwdMsg, .moz-cite-prefix, div[style*='border-top']") || /wrote:\s*$|a écrit\s*:\s*$|escribió:\s*$/i.test(n.previousSibling?.textContent ?? ""), i = [], a = n, o = n.previousElementSibling;
		o && /wrote:\s*$|a écrit\s*:?\s*$|escribió:\s*$|schrieb.*:\s*$/i.test(o.textContent ?? "") && (o.textContent ?? "").length < 300 && (a = o);
		for (let e = a; e && (i.push(e), r || e !== n); e = e.nextSibling);
		let s = e.createElement("details"), c = e.createElement("summary");
		s.className = "atlas-quoted", c.textContent = "···", c.title = "Show the earlier messages", a.parentNode.insertBefore(s, a), s.append(c, ...i);
	}
	function d(e) {
		let t = e.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?\)/);
		return t ? [
			Number(t[1]),
			Number(t[2]),
			Number(t[3]),
			t[4] === void 0 ? 1 : Number(t[4])
		] : null;
	}
	function f(e, t, n) {
		e /= 255, t /= 255, n /= 255;
		let r = Math.max(e, t, n), i = Math.min(e, t, n), a = (r + i) / 2;
		if (r === i) return [
			0,
			0,
			a
		];
		let o = r - i, s = a > .5 ? o / (2 - r - i) : o / (r + i);
		return [
			(r === e ? (t - n) / o + (t < n ? 6 : 0) : r === t ? (n - e) / o + 2 : (e - t) / o + 4) * 60,
			s,
			a
		];
	}
	let p = (e, t, n, r) => `hsla(${e.toFixed(0)}, ${(t * 100).toFixed(0)}%, ${(n * 100).toFixed(0)}%, ${r})`;
	function m(e) {
		let t = d(e);
		if (!t || t[3] === 0) return null;
		let [n, r, i] = f(t[0], t[1], t[2]);
		return i < .35 ? null : i > .93 && r < .3 ? Z(o).bg : p(n, r * .55, .09 + (1 - i) * .35, t[3]);
	}
	function h(e) {
		let t = d(e);
		if (!t) return null;
		let [n, r, i] = f(t[0], t[1], t[2]);
		return i > .6 ? null : p(n, Math.min(r, .7), .92 - i * .4, t[3]);
	}
	function g(e) {
		let t = e.defaultView;
		if (t) for (let n of Array.from(e.body.querySelectorAll("*"))) {
			if (n instanceof t.HTMLImageElement || n.tagName === "PICTURE" || n.tagName === "VIDEO") continue;
			let e = t.getComputedStyle(n), r = m(e.backgroundColor);
			r && n.style.setProperty("background-color", r, "important");
			let i = h(e.color);
			i && n.style.setProperty("color", i, "important");
			for (let t of [
				"Top",
				"Right",
				"Bottom",
				"Left"
			]) {
				let r = e.getPropertyValue(`border-${t.toLowerCase()}-width`);
				if (r && r !== "0px") {
					let r = h(e.getPropertyValue(`border-${t.toLowerCase()}-color`));
					r && n.style.setProperty(`border-${t.toLowerCase()}-color`, r, "important");
				}
			}
			e.backgroundImage !== "none" && n.style.setProperty("filter", "brightness(.9)"), n.hasAttribute("bgcolor") && n.removeAttribute("bgcolor");
		}
	}
	let _ = /* @__PURE__ */ ht(() => {
		let e = r() ? "data: https: http:" : "data:", a = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'${r() ? " https: http:" : ""}; img-src ${e}; font-src data:${r() ? " https:" : ""}; media-src 'none'; form-action 'none'`, s = Z(o), c = s.bg, l = s.text, u = n() ? `${i() || "Georgia, serif"}` : "system-ui, -apple-system, 'Segoe UI', sans-serif";
		return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${a}"><base target="_blank"><meta name="color-scheme" content="${s.dark ? "dark" : "light"}">
<style>
html{overflow-y:hidden;background:${c}}
body{margin:0;padding:4px 2px 8px;font:14px/1.55 ${u};color:${l};background:${c};overflow-wrap:anywhere;overflow-x:auto}
img{max-width:100%;height:auto}
img:not([src]),img[src^="http"]:not([data-ok]){min-height:0}
a{color:${s.link};cursor:pointer}
blockquote{margin:.5em 0 .5em .2em;padding-left:.9em;border-left:3px solid ${s.border};color:${s.muted}}
blockquote blockquote{border-left-color:${s.borderStrong}}
.atlas-plain{white-space:normal;font-size:15px;line-height:1.6;max-width:72ch}
.atlas-signature{color:${s.faint};font-size:.92em}
pre.atlas-text{white-space:pre-wrap;font:inherit}
details.atlas-quoted>summary{display:inline-block;cursor:pointer;list-style:none;padding:0 8px;margin:6px 0;border-radius:6px;background:${s.chip};color:${s.muted};font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.1em}
details.atlas-quoted>summary::-webkit-details-marker{display:none}
details.atlas-quoted[open]>summary{margin-bottom:8px}
table{max-width:100%}
mark.atlas-find{background:${s.dark ? "#7a5d00" : "#ffe27a"};color:inherit;border-radius:2px}
mark.atlas-find.cur{background:${s.dark ? "#c77700" : "#ff9f1a"};color:${s.dark ? "#fff" : "#000"}}
</style></head><body>${t.html}</body></html>`;
	});
	function v() {
		let e = Z(c)?.contentDocument;
		if (!e?.body) return;
		u(e), Z(s) && !n() && g(e);
		let r = () => {
			P(l, Math.max(40, e.documentElement.scrollHeight), !0);
		};
		r(), new ResizeObserver(r).observe(e.documentElement);
		for (let t of Array.from(e.images)) t.addEventListener("load", r);
		e.addEventListener("toggle", r, !0);
		let i = (e) => {
			let n = e.target?.closest?.("a[href]");
			return n && t.atlas?.openLink && /^https?:/i.test(n.href) && e.button === 0 ? n : null;
		};
		e.addEventListener("mousedown", (e) => {
			let n = e.shiftKey ? i(e) : null;
			n && (e.preventDefault(), e.stopPropagation(), t.atlas.openLink(n.href, { outside: !0 }), t.atlas.toast?.("Opened in your browser", n.href));
		}, !0), e.addEventListener("click", (e) => {
			let n = i(e);
			n && (e.preventDefault(), e.shiftKey || t.atlas.openLink(n.href, { outside: !1 }));
		}), e.addEventListener("keydown", (e) => {
			(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && (e.preventDefault(), Z(c)?.dispatchEvent(new KeyboardEvent("keydown", {
				key: e.key,
				ctrlKey: e.ctrlKey,
				metaKey: e.metaKey,
				bubbles: !0
			})));
		});
	}
	var y = $i();
	let b;
	Oi(y, (e) => P(c, e), () => Z(c)), wn(() => {
		$(y, "srcdoc", Z(_)), b = ai(y, "", b, { height: `${Z(l) ?? ""}px` });
	}), ur("load", y, v), cr(y), wr(e, y), qe();
}
// plugins/stable/email/ui/src/open-mail.ts
function na(e, t = {}) {
	window.__atlasEmailOpen = t, e.openView(void 0, {
		title: "Email",
		icon: "mail"
	}), setTimeout(() => window.dispatchEvent(new CustomEvent("atlas-email:open", { detail: t })), 0);
}
// plugins/stable/email/ui/src/rules-host.ts
var ra = (e) => ({
	call: (t, n = {}, r = 120) => Li(e, t, n, r),
	search: (t) => na(e, { search: t }),
	toast: (t, n = "info") => e.toast("Email", t, n),
	atlas: { open: (t, n, r) => e.open(t, n, r) }
}), ia = JSON.stringify({ dialog: "rules" }), aa = JSON.stringify({ dialog: "thunderbird" }), oa = /* @__PURE__ */ yr("<div class=\"rule svelte-1mt0jy7\"><input class=\"when svelte-1mt0jy7\" placeholder=\"from:newsletter@shop.example\" aria-label=\"When new mail matches\"/> <span class=\"arrow svelte-1mt0jy7\">→</span> <input class=\"acts svelte-1mt0jy7\" placeholder=\"move Newsletters, read\" aria-label=\"Do\" list=\"email-rule-actions\"/> <button class=\"tool svelte-1mt0jy7\" title=\"Show the mail it matches now\"><!></button> <button class=\"tool svelte-1mt0jy7\" title=\"Remove this rule\"><!></button></div>"), sa = /* @__PURE__ */ yr("<p class=\"faint svelte-1mt0jy7\">No rules yet.</p>"), ca = /* @__PURE__ */ yr("<option></option>"), la = /* @__PURE__ */ yr("<p class=\"error svelte-1mt0jy7\"> </p>"), ua = /* @__PURE__ */ yr("<button class=\"atlas-btn svelte-1mt0jy7\">Cancel</button>"), da = /* @__PURE__ */ yr("<div><span class=\"faint svelte-1mt0jy7\">for new mail in an inbox · kept in <button class=\"link svelte-1mt0jy7\"> </button></span> <p class=\"hint svelte-1mt0jy7\">When new mail matches the search, do the actions in order. A search is written as in the search box: <code class=\"svelte-1mt0jy7\">from:shop.example</code>, <code class=\"svelte-1mt0jy7\">subject:invoice has:attachment</code>, <code class=\"svelte-1mt0jy7\">list:physics</code>, <code class=\"svelte-1mt0jy7\">-from:boss</code>, several people at once: <code class=\"svelte-1mt0jy7\">from:ana@uni.example,bo@uni.example</code>. <b>important</b> stars it and keeps the conversation as a note at once; <b>not-important</b> moves it out of the inbox; <b>stop</b> keeps later rules from seeing it; <b>save</b> keeps the conversation as a note.</p> <!> <datalist id=\"email-rule-actions\"></datalist> <!> <footer class=\"svelte-1mt0jy7\"><button class=\"atlas-btn svelte-1mt0jy7\"><!> Add a rule</button> <span class=\"grow svelte-1mt0jy7\"></span> <!> <button class=\"atlas-btn primary svelte-1mt0jy7\"> </button></footer></div>"), fa = {
	hash: "svelte-1mt0jy7",
	code: ".page.svelte-1mt0jy7 {display:grid;gap:10px;container-type:inline-size;}.dialog.svelte-1mt0jy7 {display:grid;gap:10px;align-content:start;container-type:inline-size;padding:14px 18px;height:100%;box-sizing:border-box;overflow:auto;}.faint.svelte-1mt0jy7 {color:var(--text-faint);font-size:0.9em;}.hint.svelte-1mt0jy7 {margin:0;color:var(--text-muted);font-size:0.9em;line-height:1.5;}code.svelte-1mt0jy7 {font-family:var(--font-mono);font-size:0.9em;background:var(--bg-hover);padding:0 4px;border-radius:4px;}.link.svelte-1mt0jy7 {all:unset;cursor:pointer;color:var(--accent);}.rule.svelte-1mt0jy7 {display:flex;gap:8px;align-items:center;}.rule.svelte-1mt0jy7 input:where(.svelte-1mt0jy7) {min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:6px 9px;font:inherit;}.when.svelte-1mt0jy7 {flex:3;font-family:var(--font-mono);font-size:0.92em !important;}.acts.svelte-1mt0jy7 {flex:2;}.arrow.svelte-1mt0jy7 {color:var(--text-faint);}.tool.svelte-1mt0jy7 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);}.tool.svelte-1mt0jy7:hover {background:var(--bg-hover);color:var(--text);}footer.svelte-1mt0jy7 {display:flex;gap:8px;align-items:center;padding-top:6px;}footer.svelte-1mt0jy7 .atlas-btn:where(.svelte-1mt0jy7) {display:inline-flex;gap:6px;align-items:center;}.primary.svelte-1mt0jy7 {background:var(--accent) !important;color:var(--accent-fg) !important;border-color:transparent !important;}.grow.svelte-1mt0jy7 {flex:1;}.error.svelte-1mt0jy7 {color:var(--red);margin:0;}\n  @container (max-width: 600px) {.rule.svelte-1mt0jy7 {flex-wrap:wrap;}.when.svelte-1mt0jy7, .acts.svelte-1mt0jy7 {flex-basis:100%;}.arrow.svelte-1mt0jy7 {display:none;} }"
};
function pa(e, t) {
	Ke(t, !0), Jr(e, fa);
	let n = ji(t, "onclose", 3, () => {}), r = /* @__PURE__ */ ht(() => t.frame === "page"), i = /* @__PURE__ */ N(Xt([])), a = /* @__PURE__ */ N(""), o = /* @__PURE__ */ N(""), s = /* @__PURE__ */ N(!1), c = [
		"important",
		"not-important",
		"archive",
		"read",
		"star",
		"trash",
		"spam",
		"save",
		"notify",
		"stop",
		"move …",
		"label …"
	];
	vn(() => {
		t.mail.call("rules").then((e) => {
			P(i, e.rules, !0), P(a, e.path, !0);
		}, (e) => P(o, e.message, !0));
	});
	let l = () => P(i, [...Z(i), {
		when: "",
		actions: ["archive"]
	}], !0), u = (e) => P(i, Z(i).filter((t, n) => n !== e), !0);
	async function d() {
		P(s, !0);
		try {
			let e = Z(i).map((e) => ({
				when: e.when.trim(),
				actions: e.actions.map((e) => e.trim()).filter((e) => e && !e.endsWith("…"))
			})).filter((e) => e.when && e.actions.length), a = await t.mail.call("set_rules", { rules: e });
			t.mail.toast(`Rules saved in ${a.path}`, "success"), Z(r) || n()();
		} catch (e) {
			P(o, e.message, !0);
		} finally {
			P(s, !1);
		}
	}
	async function f(e) {
		t.mail.search(e.when), n()();
	}
	var p = da(), m = an(p), h = R(an(m)), g = sn(h, !0);
	D(m);
	var _ = R(m, 4);
	Vr(_, 17, () => Z(i), Lr, (e, t, n) => {
		var r = oa(), i = an(r);
		_i(i);
		var a = R(i, 4);
		_i(a);
		var o = R(a, 2);
		Ii(an(o), {
			name: "search",
			size: 15
		}), D(o);
		var s = R(o, 2);
		Ii(an(s), {
			name: "trash",
			size: 15
		}), D(s), D(r), wn((e) => vi(a, e), [() => Z(t).actions.join(", ")]), Si(i, () => Z(t).when, (e) => Z(t).when = e), dr("input", a, (e) => Z(t).actions = e.currentTarget.value.split(",")), dr("click", o, () => f(Z(t))), dr("click", s, () => u(n)), wr(e, r);
	}, (e) => {
		wr(e, sa());
	});
	var v = R(_, 2);
	Vr(v, 20, () => c, (e) => e, (e, t) => {
		var n = ca(), r = {};
		wn(() => {
			r !== (r = t) && (n.value = (n.__value = r) ?? "");
		}), wr(e, n);
	}), D(v);
	var y = R(v, 2), b = (e) => {
		var t = la(), n = sn(t, !0);
		wn(() => kr(n, Z(o))), wr(e, t);
	};
	Ir(y, (e) => {
		Z(o) && e(b);
	});
	var x = R(y, 2), S = an(x);
	Ii(an(S), {
		name: "plus",
		size: 14
	}), De(), D(S);
	var ee = R(S, 4), te = (e) => {
		var t = ua();
		dr("click", t, function(...e) {
			n()?.apply(this, e);
		}), wr(e, t);
	};
	Ir(ee, (e) => {
		Z(r) || e(te);
	});
	var ne = R(ee, 2), re = sn(ne, !0);
	D(x), D(p), wn(() => {
		ri(p, 1, Zr(t.frame), "svelte-1mt0jy7"), kr(g, Z(a) || "mail/rules.md"), ne.disabled = Z(s), kr(re, Z(r) ? "Save rules" : "Save");
	}), dr("click", h, () => {
		t.mail.atlas.open(Z(a), void 0, { beside: !0 }), n()();
	}), dr("click", S, l), dr("click", ne, d), wr(e, p), qe();
}
fr(["click", "input"]);
export { $t as $, li as A, kr as B, ji as C, _i as D, Si as E, qr as F, Sr as G, wr as H, Vr as I, ur as J, fr as K, Lr as L, ai as M, ri as N, $ as O, Jr as P, vn as Q, Ir as R, Mi as S, Ei as T, Cr as U, Pr as V, yr as W, nr as X, Z as Y, wn as Z, Ki as _, na as a, P as at, zi as b, Zi as c, nt as ct, Wi as d, Ke as dt, an as et, qi as f, De as ft, Ri as g, Vi as h, m as ht, ra as i, Xt as it, ci as j, ui as k, Li as l, rt as lt, Xi as m, d as mt, ia as n, sn as nt, ta as o, N as ot, Ji as p, D as pt, dr as q, aa as r, R as rt, Qi as s, ht as st, pa as t, on as tt, Bi as u, qe as ut, Yi as v, Oi as w, Ii as x, Ui as y, Ar as z };
