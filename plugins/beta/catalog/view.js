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
// ui/node_modules/svelte/src/internal/client/constants.js
var h = 1 << 24, g = 1024, _ = 2048, v = 4096, y = 8192, b = 16384, x = 32768, S = 1 << 25, ee = 65536, C = 1 << 19, te = 1 << 20, ne = 1 << 25, re = 1 << 21, ie = 1 << 22, ae = 1 << 23, oe = Symbol("$state"), se = Symbol("component"), ce = Symbol("legacy props"), le = Symbol(""), ue = Symbol("attributes"), de = Symbol("class"), w = Symbol("style"), fe = Symbol("text"), pe = Symbol("form reset"), me = new class extends Error {
	name = "StaleReactionError";
	message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
}(), he = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml"), ge = {}, T = Symbol("uninitialized"), _e = "http://www.w3.org/1999/xhtml", ve = "http://www.w3.org/2000/svg", ye = "http://www.w3.org/1998/Math/MathML";
function be() {
	console.warn("https://svelte.dev/e/derived_inert");
}
function xe(e) {
	console.warn("https://svelte.dev/e/hydration_mismatch");
}
function Se() {
	console.warn("https://svelte.dev/e/select_multiple_invalid_value");
}
function Ce() {
	console.warn("https://svelte.dev/e/svelte_boundary_reset_noop");
}
// ui/node_modules/svelte/src/internal/client/dom/hydration.js
var E = !1;
function we(e) {
	E = e;
}
var D;
function O(e) {
	if (e === null) throw xe(), ge;
	return D = e;
}
function Te() {
	return O(/* @__PURE__ */ an(D));
}
function k(e) {
	if (E) {
		if (/* @__PURE__ */ an(D) !== null) throw xe(), ge;
		D = e;
	}
}
function Ee(e = 1) {
	if (E) {
		for (var t = e, n = D; t--;) n = /* @__PURE__ */ an(n);
		D = n;
	}
}
function De(e = !0) {
	for (var t = 0, n = D;;) {
		if (n.nodeType === 8) {
			var r = n.data;
			if (r === "]") {
				if (t === 0) return n;
				--t;
			} else (r === "[" || r === "[!" || r[0] === "[" && !isNaN(Number(r.slice(1)))) && (t += 1);
		}
		var i = /* @__PURE__ */ an(n);
		e && n.remove(), n = i;
	}
}
function Oe(e) {
	if (!e || e.nodeType !== 8) throw xe(), ge;
	return e.data;
}
// ui/node_modules/svelte/src/internal/client/reactivity/equality.js
function A(e) {
	return e === this.v;
}
function ke(e, t) {
	return e == e ? e !== t || typeof e == "object" && !!e || typeof e == "function" : t == t;
}
function Ae(e) {
	return !ke(e, this.v);
}
function je(e) {
	throw Error("https://svelte.dev/e/lifecycle_outside_component");
}
// ui/node_modules/svelte/src/internal/client/errors.js
function Me() {
	throw Error("https://svelte.dev/e/async_derived_orphan");
}
function Ne(e, t, n) {
	throw Error("https://svelte.dev/e/each_key_duplicate");
}
function Pe(e) {
	throw Error("https://svelte.dev/e/effect_in_teardown");
}
function Fe() {
	throw Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function Ie(e) {
	throw Error("https://svelte.dev/e/effect_orphan");
}
function Le() {
	throw Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function Re(e) {
	throw Error("https://svelte.dev/e/props_invalid_value");
}
function ze() {
	throw Error("https://svelte.dev/e/state_descriptors_fixed");
}
function Be() {
	throw Error("https://svelte.dev/e/state_prototype_fixed");
}
function Ve() {
	throw Error("https://svelte.dev/e/state_unsafe_mutation");
}
function He() {
	throw Error("https://svelte.dev/e/svelte_boundary_reset_onerror");
}
// ui/node_modules/svelte/src/internal/client/context.js
var j = null;
function Ue(e) {
	j = e;
}
function We(e, t = !1, n) {
	j = {
		p: j,
		i: !1,
		c: null,
		e: null,
		s: e,
		x: null,
		r: W,
		l: null
	};
}
function Ge(e) {
	var t = j, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) yn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, j = t.p, Ke(e);
}
function Ke(e = {}) {
	return i(e, se, { value: !0 }), e;
}
function qe() {
	return !0;
}
// ui/node_modules/svelte/src/internal/client/dom/task.js
var Je = [];
function Ye() {
	var e = Je;
	Je = [], f(e);
}
function Xe(e) {
	if (Je.length === 0 && !wt) {
		var t = Je;
		queueMicrotask(() => {
			t === Je && Ye();
		});
	}
	Je.push(e);
}
function Ze() {
	for (; Je.length > 0;) Ye();
}
// ui/node_modules/svelte/src/internal/client/reactivity/status.js
var Qe = ~(_ | v | g);
function M(e, t) {
	e.f = e.f & Qe | t;
}
function $e(e) {
	e.f & 512 || e.deps === null ? M(e, g) : M(e, v);
}
// ui/node_modules/svelte/src/internal/client/reactivity/utils.js
function et(e, t) {
	e.f & 2048 ? t.set(e, _) : e.f & 4096 && t.get(e) !== 2048 && t.set(e, v), M(e, g);
}
// ui/node_modules/svelte/src/internal/client/dom/elements/misc.js
function tt(e, t) {
	if (t) {
		let t = document.body;
		e.autofocus = !0, Xe(() => {
			document.activeElement === t && e.focus();
		});
	}
}
function nt(e) {
	E && /* @__PURE__ */ rn(e) !== null && sn(e);
}
var rt = !1;
function it() {
	rt || (rt = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[pe]?.();
		});
	}, { capture: !0 }));
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function at(e) {
	var t = U, n = W;
	Vn(null), Hn(null);
	try {
		return e();
	} finally {
		Vn(t), Hn(n);
	}
}
function ot(e, t, n, r = n) {
	e.addEventListener(t, () => at(n));
	let i = e[pe];
	e[pe] = i ? () => {
		i(), r(!0);
	} : () => r(!0), it();
}
// ui/node_modules/svelte/src/internal/client/reactivity/async.js
function st(e, t, n, r) {
	let i = qe() ? dt : mt;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = W, c = ct(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
	function u(e) {
		if (!(s.f & 16384)) {
			c();
			try {
				r([...o, ...e]);
			} catch (e) {
				fn(e, s);
			}
			lt();
		}
	}
	var d = ut();
	if (n.length === 0) {
		l.then(() => u([])).finally(d);
		return;
	}
	function f() {
		Promise.all(n.map((e) => /* @__PURE__ */ pt(e))).then(u).catch((e) => fn(e, s)).finally(d);
	}
	l ? l.then(() => {
		s.f & 16384 ? d() : (c(), f(), lt());
	}) : f();
}
function ct() {
	var e = W, t = U, n = j, r = P;
	return function(i = !0) {
		Hn(e), Vn(t), Ue(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function lt(e = !0) {
	Hn(null), Vn(null), Ue(null), e && P?.deactivate();
}
function ut() {
	var e = W, t = e.b, n = P, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function dt(e) {
	var t = 2 | _;
	return W !== null && (W.f |= C), {
		ctx: j,
		deps: null,
		effects: null,
		equals: A,
		f: t,
		fn: e,
		reactions: null,
		rv: 0,
		v: T,
		wv: 0,
		parent: W,
		ac: null
	};
}
var ft = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function pt(e, t, n) {
	let r = W;
	r === null && Me();
	var i = void 0, a = Vt(T), o = !U, s = /* @__PURE__ */ new Set();
	return Sn(() => {
		var t = W, n = p();
		i = n.promise;
		try {
			Promise.resolve(e()).then(n.resolve, (e) => {
				e !== me && n.reject(e);
			}).finally(lt);
		} catch (e) {
			n.reject(e), lt();
		}
		var c = P;
		if (o) {
			if (t.f & 32768) var l = ut();
			if (r.b?.is_rendered()) c.async_deriveds.get(t)?.reject(ft);
			else for (let e of s.values()) e.reject(ft);
			s.add(n), c.async_deriveds.set(t, n);
		}
		let u = (e, t = void 0) => {
			l?.(), s.delete(n), t !== ft && (c.activate(), t ? (a.f |= ae, Gt(a, t)) : (a.f & 8388608 && (a.f ^= ae), Gt(a, e)), c.deactivate());
		};
		n.promise.then(u, (e) => u(null, e || "unknown"));
	}), _n(() => {
		for (let e of s) e.reject(ft);
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
function N(e) {
	let t = /* @__PURE__ */ dt(e);
	return Wn(t), t;
}
/*#__NO_SIDE_EFFECTS__*/
function mt(e) {
	let t = /* @__PURE__ */ dt(e);
	return t.equals = Ae, t;
}
function ht(e) {
	var t = e.effects;
	if (t !== null) {
		e.effects = null;
		for (var n = 0; n < t.length; n += 1) H(t[n]);
	}
}
function gt(e) {
	var t, n = W, r = e.parent;
	if (!Rn && r !== null && e.v !== T && r.f & 24576) return be(), e.v;
	Hn(r);
	try {
		ht(e), t = nr(e);
	} finally {
		Hn(n);
	}
	return t;
}
function _t(e) {
	var t = gt(e);
	!e.equals(t) && (e.wv = $n(), (!P?.is_fork || e.deps === null) && (P === null ? e.v = t : (P.capture(e, t, !0), xt?.capture(e, t, !0)), e.deps === null)) ? M(e, g) : Rn || (St === null ? $e(e) : (gn() || P?.is_fork) && St.set(e, t));
}
function vt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && at(() => {
		t.ac.abort(me), t.ac = null;
	}), t.fn !== null && (t.teardown = d), ar(t, 0), On(t));
}
function yt(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && or(t);
}
// ui/node_modules/svelte/src/internal/client/reactivity/batch.js
var bt = null, P = null, xt = null, St = null, Ct = null, wt = !1, Tt = !1, Et = null, Dt = null, Ot = 0, kt = 1, At = class e {
	id = kt++;
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
			for (var r of n.d) M(r, _), t(r);
			for (r of n.m) M(r, v), t(r);
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
					t.f ^= g;
				}
			}
			n || e.push(t);
		}
		return this.#a = [], e;
	}
	#m() {
		this.started = !0;
		for (let [e, t] of this.#s) M(e, t), this.schedule(e);
		this.apply();
		for (var t = Et = [], n = [], r = Dt = []; this.#a.length > 0;) {
			Ot++ > 1e3 && (this.#b(), Mt());
			for (let e of this.#p()) try {
				this.#h(e, t, n);
			} catch (t) {
				throw Lt(e), this.#d() || this.discard(), t;
			}
		}
		if (P = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (Et = null, Dt = null, this.#d()) {
			this.#y(n), this.#y(t);
			for (let [e, t] of this.#c) It(e, t);
			r.length > 0 && P.#m();
			return;
		}
		let a = this.#g();
		if (a) this.#y(n), this.#y(t), a.#v(this);
		else {
			this.#s.clear();
			for (let e of this.#e) e(this);
			this.#e.clear(), xt = this, Pt(n), Pt(t), xt = null, this.#i?.resolve();
			var o = P;
			this.#n === 0 && (this.#a.length === 0 || o !== null) && this.#b(), o !== null && (zt.clear(), o.#m());
		}
	}
	#h(e, t, n) {
		e.f ^= g;
		for (var r = e.first; r !== null;) {
			var i = r.f, a = !!(i & 96);
			if (!(a && i & 1024 || i & 8192 || this.#c.has(r)) && r.fn !== null) {
				a ? r.f ^= g : i & 4 ? t.push(r) : er(r) && (i & 16 && this.add_dirty_reaction(r, v), or(r));
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
					r & 4194320 && !this.async_deriveds.has(i) && (this.#s.delete(i), M(i, _), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#b(), P = this, this.#m();
	}
	#y(e) {
		for (var t = 0; t < e.length; t += 1) et(e[t], this.#s);
	}
	capture(e, t, n = !1) {
		e.v !== T && !this.previous.has(e) && this.previous.set(e, e.v), e.f & 8388608 || (this.current.set(e, [t, n]), St?.set(e, t)), this.is_fork || (e.v = t);
	}
	activate() {
		P = this;
	}
	deactivate() {
		P = null, St = null;
	}
	flush() {
		try {
			Tt = !0, P = this, this.#m();
		} finally {
			Ot = 0, Ct = null, Et = null, Dt = null, Tt = !1, P = null, St = null, zt.clear();
		}
	}
	discard() {
		for (let e of this.#t) e(this);
		this.#t.clear();
		for (let e of this.async_deriveds.values()) e.reject(ft);
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
		this.#u || (this.#u = !0, Xe(() => {
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
		if (P === null) {
			let t = P = new e();
			!Tt && !wt && Xe(() => {
				t.started || t.flush();
			});
		}
		return P;
	}
	apply() {
		St = null;
	}
	schedule(e) {
		Ct = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768) ? e.b.defer_effect(e) : this.#a.push(e);
	}
	#b() {
		if (this.linked) {
			var e = this.prev, t = this.next;
			e === null || (e.next = t), t === null ? bt = e : t.prev = e, this.linked = !1;
		}
	}
};
function jt(e) {
	var t = wt, n = xt;
	xt = null, wt = !0;
	try {
		var r;
		for (e && (jt(), r = e());;) {
			if (Ze(), P === null) return r;
			P.flush();
		}
	} finally {
		wt = t, xt = n;
	}
}
function Mt() {
	try {
		Le();
	} catch (e) {
		fn(e, Ct);
	}
}
var Nt = null;
function Pt(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && er(r) && (Nt = /* @__PURE__ */ new Set(), or(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && jn(r), Nt?.size > 0)) {
				zt.clear();
				for (let e of Nt) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) Nt.has(n) && (Nt.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || or(n);
					}
				}
				Nt.clear();
			}
		}
		Nt = null;
	}
}
function Ft(e) {
	P.schedule(e);
}
function It(e, t) {
	if (!(e.f & 32 && e.f & 1024)) {
		e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), M(e, g);
		for (var n = e.first; n !== null;) It(n, t), n = n.next;
	}
}
function Lt(e) {
	M(e, g);
	for (var t = e.first; t !== null;) Lt(t), t = t.next;
}
// ui/node_modules/svelte/src/internal/client/reactivity/sources.js
var Rt = /* @__PURE__ */ new Set(), zt = /* @__PURE__ */ new Map(), Bt = !1;
function Vt(e, t) {
	return {
		f: 0,
		v: e,
		reactions: null,
		equals: A,
		rv: 0,
		wv: 0
	};
}
/*#__NO_SIDE_EFFECTS__*/
function F(e, t) {
	let n = Vt(e, t);
	return Wn(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function Ht(e, t = !1, n = !0) {
	let r = Vt(e);
	return t || (r.equals = Ae), r;
}
function I(e, t, n = !1) {
	return U !== null && (!Bn || U.f & 131072) && qe() && U.f & 4325394 && (Un === null || !Un.has(e)) && Ve(), Gt(e, n ? L(t) : t, Dt);
}
var Ut = null, Wt = 0;
function Gt(e, t, n = null) {
	if (!e.equals(t)) {
		Rn ? zt.set(e, t) : zt.has(e) || zt.set(e, e.v);
		var r = At.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && gt(t), St === null && $e(t);
		}
		e.wv = $n(), Ut = null, Wt = 0, Jt(e, _, n), Ut = null, qe() && W !== null && W.f & 1024 && !(W.f & 96) && (qn === null ? Jn([e]) : qn.push(e)), !r.is_fork && Rt.size > 0 && !Bt && Kt();
	}
	return t;
}
function Kt() {
	Bt = !1;
	for (let e of Rt) {
		e.f & 1024 && M(e, v);
		let t;
		try {
			t = er(e);
		} catch {
			t = !0;
		}
		t && or(e);
	}
	Rt.clear();
}
function qt(e) {
	I(e, e.v + 1);
}
function Jt(e, t, n) {
	var r = e.reactions;
	if (r !== null) {
		var i = qe(), a = r.length;
		if (Wt += a, Wt > 1e5 && Ut === null && (Ut = /* @__PURE__ */ new Set()), Ut !== null) {
			if (Ut.has(e)) return;
			Ut.add(e);
		}
		for (var o = 0; o < a; o++) {
			var s = r[o], c = s.f;
			if (i || s !== W) {
				var l = (c & _) === 0;
				if (l && M(s, t), c & 131072) Rt.add(s);
				else if (c & 2) {
					var u = s;
					St?.delete(u), Jt(u, v, n);
				} else if (l) {
					var d = s;
					c & 16 && Nt !== null && Nt.add(d), n === null ? Ft(d) : n.push(d);
				}
			}
		}
	}
}
function L(t) {
	if (typeof t != "object" || !t || oe in t || se in t) return t;
	let n = l(t);
	if (n !== s && n !== c) return t;
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ F(0), u = null, d = Zn, f = (e) => {
		if (Zn === d) return e();
		var t = U, n = Zn;
		Vn(null), Qn(d);
		var r = e();
		return Vn(t), Qn(n), r;
	};
	return i && r.set("length", /* @__PURE__ */ F(t.length, u)), new Proxy(t, {
		defineProperty(e, t, n) {
			"value" in n && n.configurable !== !1 && n.enumerable !== !1 && n.writable !== !1 || ze();
			var i = r.get(t);
			return i === void 0 ? f(() => {
				var e = /* @__PURE__ */ F(n.value, u);
				return r.set(t, e), e;
			}) : I(i, n.value, !0), !0;
		},
		deleteProperty(e, t) {
			var n = r.get(t);
			if (n === void 0) {
				if (t in e) {
					let e = f(() => /* @__PURE__ */ F(T, u));
					r.set(t, e), qt(o);
				}
			} else I(n, T), qt(o);
			return !0;
		},
		get(e, n, i) {
			if (n === oe) return t;
			var o = r.get(n), s = n in e;
			if (o === void 0 && (!s || a(e, n)?.writable) && (o = f(() => /* @__PURE__ */ F(L(s ? e[n] : T), u)), r.set(n, o)), o !== void 0) {
				var c = G(o);
				return c === T ? void 0 : c;
			}
			return Reflect.get(e, n, i);
		},
		getOwnPropertyDescriptor(e, t) {
			this.has?.(e, t);
			var n = Reflect.getOwnPropertyDescriptor(e, t), i = r.get(t);
			if (i !== void 0) {
				var a = G(i);
				if (a === T) return;
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
			var n = r.get(t), i = n !== void 0 && n.v !== T || Reflect.has(e, t);
			return (n !== void 0 || (W !== null || U !== null) && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ F(i ? L(e[t]) : T, u)), r.set(t, n)), G(n) === T) ? !1 : i;
		},
		set(e, t, n, s) {
			var c = r.get(t), l = t in e;
			if (i && t === "length") for (var d = n; d < c.v; d += 1) {
				var p = r.get(d + "");
				p === void 0 ? d in e && (p = f(() => /* @__PURE__ */ F(T, u)), r.set(d + "", p)) : I(p, T);
			}
			if (c === void 0) (!l || a(e, t)?.writable) && (c = f(() => /* @__PURE__ */ F(void 0, u)), I(c, L(n)), r.set(t, c));
			else {
				l = c.v !== T;
				var m = f(() => L(n));
				I(c, m);
			}
			var h = Reflect.getOwnPropertyDescriptor(e, t);
			if (h?.set && h.set.call(s, n), !l) {
				if (i && typeof t == "string") {
					var g = r.get("length"), _ = Number(t);
					Number.isInteger(_) && _ >= g.v && I(g, _ + 1);
				}
				qt(o);
			}
			return !0;
		},
		ownKeys(e) {
			G(o);
			var t = Reflect.ownKeys(e).filter((e) => {
				var t = r.get(e);
				return t === void 0 || t.v !== T;
			});
			for (var [n, i] of r) i.v !== T && !(n in e) && t.push(n);
			return t;
		},
		setPrototypeOf() {
			Be();
		}
	});
}
function Yt(e) {
	try {
		if (typeof e == "object" && e && oe in e) return e[oe];
	} catch {}
	return e;
}
function Xt(e, t) {
	return Object.is(Yt(e), Yt(t));
}
var Zt, Qt, $t, en;
function tn() {
	if (Zt === void 0) {
		Zt = window, Qt = /Firefox/.test(navigator.userAgent);
		var e = Element.prototype, t = Node.prototype, n = Text.prototype;
		$t = a(t, "firstChild").get, en = a(t, "nextSibling").get, u(e) && (e[de] = void 0, e[ue] = null, e[w] = void 0, e.__e = void 0), u(n) && (n[fe] = void 0);
	}
}
function nn(e = "") {
	return document.createTextNode(e);
}
/*@__NO_SIDE_EFFECTS__*/
function rn(e) {
	return $t.call(e);
}
/*@__NO_SIDE_EFFECTS__*/
function an(e) {
	return en.call(e);
}
function R(e, t) {
	if (!E) return /* @__PURE__ */ rn(e);
	var n = /* @__PURE__ */ rn(D);
	if (n === null) n = D.appendChild(nn());
	else if (t && n.nodeType !== 3) {
		var r = nn();
		return n?.before(r), O(r), r;
	}
	return t && un(n), O(n), n;
}
function on(e, t = !1) {
	if (!E) {
		var n = /* @__PURE__ */ rn(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ an(n) : n;
	}
	if (t) {
		if (D?.nodeType !== 3) {
			var r = nn();
			return D?.before(r), O(r), r;
		}
		un(D);
	}
	return D;
}
function z(e, t = !1) {
	if (!E) return /* @__PURE__ */ rn(e);
	var n = R(e, t);
	return k(e), n;
}
function B(e, t = 1, n = !1) {
	let r = E ? D : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ an(r);
	if (!E) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = nn();
			return r === null ? i?.after(a) : r.before(a), O(a), a;
		}
		un(r);
	}
	return O(r), r;
}
function sn(e) {
	e.textContent = "";
}
function cn() {
	return !1;
}
function ln(e, t, n) {
	return t == null || t === "http://www.w3.org/1999/xhtml" ? n ? document.createElement(e, { is: n }) : document.createElement(e) : n ? document.createElementNS(t, e, { is: n }) : document.createElementNS(t, e);
}
function un(e) {
	if (e.nodeValue.length < 65536) return;
	let t = e.nextSibling;
	for (; t !== null && t.nodeType === 3;) t.remove(), e.nodeValue += t.nodeValue, t = e.nextSibling;
}
function dn(e) {
	var t = W;
	if (t === null) return U.f |= ae, e;
	if (!(t.f & 32768) && !(t.f & 4)) throw e;
	fn(e, t);
}
function fn(e, t) {
	if (e === ge) throw e;
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
	W === null && (U === null && Ie(e), Fe()), Rn && Pe(e);
}
function mn(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function hn(e, t) {
	var n = W;
	n !== null && n.f & 8192 && (e |= y);
	var r = {
		ctx: j,
		deps: null,
		nodes: null,
		f: e | _ | 512,
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
	P?.register_created_effect(r);
	var i = r;
	if (e & 4) Et === null ? At.ensure().schedule(r) : Et.push(r);
	else if (t !== null) {
		try {
			or(r);
		} catch (e) {
			throw H(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= ee));
	}
	if (i !== null && (i.parent = n, n !== null && mn(i, n), U !== null && U.f & 2 && !(e & 64))) {
		var a = U;
		(a.effects ??= []).push(i);
	}
	return r;
}
function gn() {
	return U !== null && !Bn;
}
function _n(e) {
	let t = hn(8, null);
	return M(t, g), t.teardown = e, t;
}
function vn(e) {
	pn("$effect");
	var t = W.f;
	if (!U && t & 32 && j !== null && !j.i) {
		var n = j;
		(n.e ??= []).push(e);
	} else return yn(e);
}
function yn(e) {
	return hn(4 | te, e);
}
function bn(e) {
	At.ensure();
	let t = hn(64 | C, e);
	return (e = {}) => new Promise((n) => {
		e.outro ? Mn(t, () => {
			H(t), n(void 0);
		}) : (H(t), n(void 0));
	});
}
function xn(e) {
	return hn(4, e);
}
function Sn(e) {
	return hn(ie | C, e);
}
function Cn(e, t = 0) {
	return hn(8 | t, e);
}
function V(e, t = [], n = [], r = []) {
	st(r, t, n, (t) => {
		hn(8, () => {
			e(...t.map(G));
		});
	});
}
function wn(e, t = 0) {
	return hn(16 | t, e);
}
function Tn(e, t = 0) {
	return hn(h | t, e);
}
function En(e) {
	return hn(32 | C, e);
}
function Dn(e) {
	var t = e.teardown;
	if (t !== null) {
		let n = Rn, r = U;
		zn(!0), Vn(null);
		try {
			t.call(null);
		} catch (t) {
			fn(t, e.parent);
		} finally {
			zn(n), Vn(r);
		}
	}
}
function On(e, t = !1) {
	var n = e.first;
	for (e.first = e.last = null; n !== null;) {
		let e = n.ac;
		e !== null && at(() => {
			e.abort(me);
		});
		var r = n.next;
		n.f & 64 ? n.parent = null : H(n, t), n = r;
	}
}
function kn(e) {
	for (var t = e.first; t !== null;) {
		var n = t.next;
		t.f & 32 || H(t), t = n;
	}
}
function H(e, t = !0) {
	var n = !1;
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (An(e.nodes.start, e.nodes.end), n = !0), e.f |= S, On(e, t && !n), ar(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	Dn(e), e.f ^= S, e.f |= b;
	var i = e.parent;
	i !== null && i.first !== null && jn(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function An(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ an(e);
		e.remove(), e = n;
	}
}
function jn(e) {
	var t = e.parent, n = e.prev, r = e.next;
	n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n));
}
function Mn(e, t, n = !0) {
	var r = [];
	e.f |= 256, Nn(e, r, !0);
	var i = () => {
		n && H(e), t && t();
	}, a = r.length;
	if (a > 0) {
		var o = () => --a || i();
		for (var s of r) s.out(o);
	} else i();
}
function Nn(e, t, n) {
	if (!(e.f & 8192)) {
		e.f ^= y;
		var r = e.nodes && e.nodes.t;
		if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
		for (var i = e.first; i !== null;) {
			var a = i.next;
			if (!(i.f & 64)) {
				var o = !!(i.f & 65536) || !!(i.f & 32) && !!(e.f & 16);
				Nn(i, t, o ? n : !1);
			}
			i = a;
		}
	}
}
function Pn(e) {
	e.f &= -257, Fn(e, !0);
}
function Fn(e, t) {
	if (!(e.f & 256) && e.f & 8192) {
		e.f ^= y, e.f & 1024 || (M(e, _), At.ensure().schedule(e));
		for (var n = e.first; n !== null;) {
			var r = n.next, i = !!(n.f & 65536) || !!(n.f & 32);
			Fn(n, i ? t : !1), n = r;
		}
		var a = e.nodes && e.nodes.t;
		if (a !== null) for (let e of a) (e.is_global || t) && e.in();
	}
}
function In(e, t) {
	if (e.nodes) for (var n = e.nodes.start, r = e.nodes.end; n !== null;) {
		var i = n === r ? null : /* @__PURE__ */ an(n);
		t.append(n), n = i;
	}
}
// ui/node_modules/svelte/src/internal/client/legacy.js
var Ln = null, Rn = !1;
function zn(e) {
	Rn = e;
}
var U = null, Bn = !1;
function Vn(e) {
	U = e;
}
var W = null;
function Hn(e) {
	W = e;
}
var Un = null;
function Wn(e) {
	U !== null && (U.f & 2097152 || U.f & 2) && (Un ??= /* @__PURE__ */ new Set()).add(e);
}
var Gn = null, Kn = 0, qn = null;
function Jn(e) {
	qn = e;
}
var Yn = 1, Xn = 0, Zn = Xn;
function Qn(e) {
	Zn = e;
}
function $n() {
	return ++Yn;
}
function er(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (er(a) && _t(a), a.wv > e.wv) return !0;
		}
		t & 512 && St === null && M(e, g);
	}
	return !1;
}
function tr(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(Un !== null && Un.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? tr(a, t, !1) : t === a && (n ? M(a, _) : a.f & 1024 && M(a, v), Ft(a));
	}
}
function nr(e) {
	var t = Gn, n = Kn, r = qn, i = U, a = Un, o = j, s = Bn, c = Zn, l = e.f;
	Gn = null, Kn = 0, qn = null, U = l & 96 ? null : e, Un = null, Ue(e.ctx), Bn = !1, Zn = ++Xn, e.ac !== null && (at(() => {
		e.ac.abort(me);
	}), e.ac = null);
	try {
		e.f |= re;
		var u = e.fn, d = u();
		e.f |= x;
		var f = rr(e);
		if (qe() && qn !== null && !Bn && f !== null && !(e.f & 6146)) for (var p = 0; p < qn.length; p++) tr(qn[p], e);
		if (i !== null && i !== e) {
			if (Xn++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = Xn;
			if (t !== null) for (let e of t) e.rv = Xn;
			qn !== null && (r === null ? r = qn : r.push(...qn));
		}
		return e.f & 8388608 && (e.f ^= ae), d;
	} catch (t) {
		return rr(e), dn(t);
	} finally {
		e.f ^= re, Gn = t, Kn = n, qn = r, U = i, Un = a, Ue(o), Bn = s, Zn = c;
	}
}
function rr(e) {
	var t = e.deps, n = P?.is_fork;
	if (Gn !== null) {
		var r;
		if (n || ar(e, Kn), t !== null && Kn > 0) for (t.length = Kn + Gn.length, r = 0; r < Gn.length; r++) t[Kn + r] = Gn[r];
		else e.deps = t = Gn;
		if (gn() && e.f & 512) for (r = Kn; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && Kn < t.length && (ar(e, Kn), t.length = Kn);
	return t;
}
function ir(e, r) {
	let i = r.reactions;
	if (i !== null) {
		var a = t.call(i, e);
		if (a !== -1) {
			var o = i.length - 1;
			o === 0 ? i = r.reactions = null : (i[a] = i[o], i.pop());
		}
	}
	if (i === null && r.f & 2 && (Gn === null || !n.call(Gn, r))) {
		var s = r;
		s.f & 512 && (s.f ^= 512), s.v !== T && $e(s), s.ac !== null && at(() => {
			s.ac.abort(me), s.ac = null, M(s, _);
		}), vt(s), ar(s, 0);
	}
}
function ar(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) ir(e, n[r]);
}
function or(e) {
	var t = e.f;
	if (!(t & 16384)) {
		M(e, g);
		var n = W;
		W = e;
		try {
			t & 16777232 ? kn(e) : On(e), Dn(e);
			var r = nr(e);
			e.teardown = typeof r == "function" ? r : null, e.wv = Yn;
		} finally {
			W = n;
		}
	}
}
async function sr() {
	await Promise.resolve(), jt();
}
function G(e) {
	var t = !!(e.f & 2);
	if (Ln?.add(e), U !== null && !Bn && !(W !== null && W.f & 16384) && (Un === null || !Un.has(e))) {
		var r = U.deps;
		if (U.f & 2097152) e.rv < Xn && (e.rv = Xn, Gn === null && r !== null && r[Kn] === e ? Kn++ : Gn === null ? Gn = [e] : Gn.push(e));
		else {
			U.deps ??= [], n.call(U.deps, e) || U.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [U] : n.call(i, U) || i.push(U);
		}
	}
	if (Rn && zt.has(e)) return zt.get(e);
	if (t) {
		var a = e;
		if (Rn) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || lr(a)) && (o = gt(a)), zt.set(a, o), o;
		}
		var s = !(a.f & 512) && !Bn && U !== null && !!(U.f & 512), c = (a.f & x) === 0;
		er(a) && (s && (a.f |= 512), _t(a)), s && !c && (yt(a), cr(a));
	}
	if (St?.has(e)) return St.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function cr(e) {
	if (e.f |= 512, e.deps !== null) for (let r of e.deps) {
		var t = r.reactions;
		t === null ? r.reactions = [e] : n.call(t, e) || t.push(e), r.f & 2 && !(r.f & 512) && (yt(r), cr(r));
	}
}
function lr(e) {
	if (e.v === T) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (zt.has(t) || t.f & 2 && lr(t)) return !0;
	return !1;
}
function ur(e) {
	var t = Bn;
	try {
		return Bn = !0, e();
	} finally {
		Bn = t;
	}
}
function dr(e) {
	if (!(typeof e != "object" || !e || e instanceof EventTarget)) {
		if (oe in e) fr(e);
		else if (!Array.isArray(e)) for (let t in e) {
			let n = e[t];
			typeof n == "object" && n && oe in n && fr(n);
		}
	}
}
function fr(e, t = /* @__PURE__ */ new Set()) {
	if (typeof e == "object" && e && !(e instanceof EventTarget) && !t.has(e)) {
		t.add(e), e instanceof Date && e.getTime();
		for (let n in e) try {
			fr(e[n], t);
		} catch {}
		let n = l(e);
		if (n !== Object.prototype && n !== Array.prototype && n !== Map.prototype && n !== Set.prototype && n !== Date.prototype) {
			let t = o(n);
			for (let n in t) {
				let r = t[n].get;
				if (r) try {
					r.call(e);
				} catch {}
			}
		}
	}
}
function pr(e) {
	return e.endsWith("capture") && e !== "gotpointercapture" && e !== "lostpointercapture";
}
var mr = [
	"beforeinput",
	"click",
	"change",
	"dblclick",
	"contextmenu",
	"focusin",
	"focusout",
	"input",
	"keydown",
	"keyup",
	"mousedown",
	"mousemove",
	"mouseout",
	"mouseover",
	"mouseup",
	"pointerdown",
	"pointermove",
	"pointerout",
	"pointerover",
	"pointerup",
	"touchend",
	"touchmove",
	"touchstart"
];
function hr(e) {
	return mr.includes(e);
}
var gr = /* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split("."), _r = {
	formnovalidate: "formNoValidate",
	ismap: "isMap",
	nomodule: "noModule",
	playsinline: "playsInline",
	readonly: "readOnly",
	defaultvalue: "defaultValue",
	defaultchecked: "defaultChecked",
	srcobject: "srcObject",
	novalidate: "noValidate",
	allowfullscreen: "allowFullscreen",
	disablepictureinpicture: "disablePictureInPicture",
	disableremoteplayback: "disableRemotePlayback"
};
function vr(e) {
	return e = e.toLowerCase(), _r[e] ?? e;
}
[...gr];
var yr = ["touchstart", "touchmove"];
function br(e) {
	return yr.includes(e);
}
// ui/node_modules/svelte/src/internal/client/dev/css.js
var xr = Symbol("events"), Sr = /* @__PURE__ */ new Set(), Cr = /* @__PURE__ */ new Set();
function wr(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || kr.call(t, e), !e.cancelBubble) return at(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, Xe(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function Tr(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = wr(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && _n(() => {
		o.__removed = !0, t.removeEventListener(e, o, a);
	});
}
function K(e, t, n) {
	(t[xr] ??= {})[e] = n;
}
function Er(e) {
	for (var t = 0; t < e.length; t++) Sr.add(e[t]);
	for (var n of Cr) n(e);
}
var Dr = null, Or = !1;
function kr(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	Dr = e, Or || (Or = !0, setTimeout(() => {
		Or = !1, Dr = null;
	}));
	var s = 0, c = Dr === e && e[xr];
	if (c) {
		var l = a.indexOf(c);
		if (l !== -1 && (t === document || t === window)) {
			e[xr] = t;
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
		var d = U, f = W;
		Vn(null), Hn(null);
		try {
			for (var p, m = []; o !== null && o !== t;) {
				try {
					var h = o[xr]?.[r];
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
			e[xr] = t, delete e.currentTarget, Vn(d), Hn(f);
		}
	}
}
// ui/node_modules/svelte/src/internal/client/dom/reconciler.js
var Ar = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function jr(e) {
	return Ar?.createHTML(e) ?? e;
}
function Mr(e) {
	var t = ln("template");
	return t.innerHTML = jr(e.replaceAll("<!>", "<!---->")), t.content;
}
// ui/node_modules/svelte/src/internal/client/dom/template.js
function Nr(e, t) {
	var n = W;
	n.nodes === null && (n.nodes = {
		start: e,
		end: t,
		a: null,
		t: null
	});
}
/*#__NO_SIDE_EFFECTS__*/
function q(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (E) return Nr(D, null), D;
		i === void 0 && (i = Mr(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ rn(i)));
		var t = r || Qt ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ rn(t), s = t.lastChild;
			Nr(o, s);
		} else Nr(t, t);
		return t;
	};
}
function Pr() {
	if (E) return Nr(D, null), D;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = nn();
	return e.append(t, n), Nr(t, n), e;
}
function J(e, t) {
	if (E) {
		var n = W;
		n.f & 32768 && n.nodes.end !== null || (n.nodes.end = D), Te();
	} else e !== null && e.before(t);
}
// ui/node_modules/svelte/src/reactivity/create-subscriber.js
function Fr(e) {
	let t = 0, n = Vt(0), r;
	return () => {
		gn() && (G(n), Cn(() => (t === 0 && (r = ur(() => e(() => qt(n)))), t += 1, () => {
			Xe(() => {
				--t, t === 0 && (r?.(), r = void 0, qt(n));
			});
		})));
	};
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var Ir = ee | C;
function Lr(e, t, n, r) {
	new Rr(e, t, n, r);
}
var Rr = class {
	parent;
	is_pending = !1;
	transform_error;
	#e;
	#t = E ? D : null;
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
	#m = Fr(() => (this.#p = Vt(this.#l), () => {
		this.#p = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = W;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = W.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = wn(() => {
			if (E) {
				let e = Oe(this.#t);
				Te();
				let t = e === "[!";
				if (e.startsWith("[?")) {
					let t = JSON.parse(e.slice(2));
					this.#g(t);
				} else t ? this.#y() : this.#h();
			} else this.#b();
		}, Ir), E && (this.#e = D);
	}
	#h() {
		try {
			this.#a = En(() => this.#r(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#g(e) {
		let t = this.#n.failed, { reset: n, invoke_onerror: r } = this.#_(e);
		Xe(r), t && (this.#s = En(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#_(e) {
		var t = !1, n = !1;
		let r = () => {
			this.#v() || (t ? Ce() : (t = !0, n && He(), this.#s !== null && Mn(this.#s, () => {
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
					fn(e, this.#i && this.#i.parent);
				}
			}
		};
	}
	#v() {
		return (this.#i.f & (b | S)) !== 0;
	}
	#y() {
		let e = this.#n.pending;
		e && (this.is_pending = !0, this.#o = En(() => e(this.#e)), Xe(() => {
			if (!this.#v()) {
				var e = this.#c = document.createDocumentFragment(), t = nn(), n = !1;
				e.append(t), this.#a = this.#S(() => {
					try {
						return En(() => this.#r(t));
					} catch (e) {
						try {
							this.error(e), n = !0;
						} catch (e) {
							fn(e, this.#i.parent);
						}
						return null;
					}
				}), this.#a === null ? (this.#c = null, n && this.#x(P)) : this.#u === 0 && (this.#e.before(e), this.#c = null, Mn(this.#o, () => {
					this.#o = null;
				}), this.#x(P));
			}
		}));
	}
	#b() {
		try {
			if (this.is_pending = this.has_pending_snippet(), this.#u = 0, this.#l = 0, this.#a = En(() => {
				this.#r(this.#e);
			}), this.#u > 0) {
				var e = this.#c = document.createDocumentFragment();
				In(this.#a, e);
				let t = this.#n.pending;
				this.#o = En(() => t(this.#e));
			} else this.#x(P);
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
		var t = W, n = U, r = j;
		Hn(this.#i), Vn(this.#i), Ue(this.#i.ctx);
		try {
			return At.ensure(), e();
		} finally {
			Hn(t), Vn(n), Ue(r);
		}
	}
	#C(e, t) {
		this.has_pending_snippet() ? (this.#u += e, this.#u === 0 && (this.#x(t), this.#o && Mn(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null))) : this.parent && this.parent.#C(e, t);
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !this.#p || this.#d || (this.#d = !0, Xe(() => {
			this.#d = !1, this.#p && Gt(this.#p, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#m(), G(this.#p);
	}
	error(e) {
		if (e === ge || !this.#n.onerror && !this.#n.failed) throw e;
		P?.is_fork ? (this.#a && P.skip_effect(this.#a), this.#o && P.skip_effect(this.#o), this.#s && P.skip_effect(this.#s), P.oncommit(() => {
			this.#v() || this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (H(this.#a), null), this.#o &&= (H(this.#o), null), this.#s &&= (H(this.#s), null), E && (O(this.#t), Ee(), O(De()));
		let t = this.#n.failed, n = (e) => {
			if (this.#v()) return;
			let { reset: n, invoke_onerror: r } = this.#_(e);
			r(), t && !this.#v() && (this.#s = this.#S(() => {
				try {
					return En(() => {
						var r = W;
						r.b = this, r.f |= 128, t(this.#e, () => e, () => n);
					});
				} catch (e) {
					return fn(e, this.#i.parent), null;
				}
			}));
		};
		Xe(() => {
			if (!this.#v()) {
				var t;
				try {
					t = this.transform_error(e);
				} catch (e) {
					fn(e, this.#i && this.#i.parent);
					return;
				}
				typeof t == "object" && t && typeof t.then == "function" ? t.then(n, (e) => fn(e, this.#i && this.#i.parent)) : n(t);
			}
		});
	}
};
function Y(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[fe] ??= e.nodeValue) && (e[fe] = n, e.nodeValue = `${n}`);
}
function zr(e, t) {
	return Vr(e, t);
}
var Br = /* @__PURE__ */ new Map();
function Vr(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	tn();
	var l = void 0, u = bn(() => {
		var s = n ?? t.appendChild(nn());
		Lr(s, { pending: () => {} }, (t) => {
			We({});
			var n = j;
			if (o && (n.c = o), a && (i.$$events = a), E && Nr(t, null), l = e(t, i) || Ke(), E && (W.nodes.end = D, D === null || D.nodeType !== 8 || D.data !== "]")) throw xe(), ge;
			Ge();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = br(r);
					for (let e of [t, document]) {
						var a = Br.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), Br.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, kr, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(Sr)), Cr.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = Br.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, kr), r.delete(e), r.size === 0 && Br.delete(n)) : r.set(e, i);
			}
			Cr.delete(d), s !== n && s.parentNode?.removeChild(s);
		};
	});
	return Hr.set(l, u), l;
}
var Hr = /* @__PURE__ */ new WeakMap();
function Ur(e, t) {
	let n = Hr.get(e);
	return n ? (Hr.delete(e), n(t)) : Promise.resolve();
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/branches.js
var Wr = class {
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
			if (n) Pn(n), this.#r.delete(t);
			else {
				var r = this.#n.get(t);
				r && (Pn(r.effect), this.#t.set(t, r.effect), this.#n.delete(t), r.fragment.lastChild.remove(), this.anchor.before(r.fragment), n = r.effect);
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
						In(r, t), t.append(nn()), this.#n.set(e, {
							effect: r,
							fragment: t
						});
					} else H(r);
					this.#r.delete(e), this.#t.delete(e);
				};
				this.#i || !n ? (this.#r.add(e), Mn(r, i, !1)) : i();
			}
		}
	};
	#o = (e) => {
		this.#e.delete(e);
		let t = Array.from(this.#e.values());
		for (let [e, n] of this.#n) t.includes(e) || (H(n.effect), this.#n.delete(e));
	};
	ensure(e, t) {
		var n = P, r = cn();
		if (t && !this.#t.has(e) && !this.#n.has(e)) {
			if (r) {
				var i = document.createDocumentFragment(), a = nn();
				i.append(a), this.#n.set(e, {
					effect: En(() => t(a)),
					fragment: i
				});
			} else this.#t.set(e, En(() => t(this.anchor)));
		}
		if (this.#e.set(n, e), r) {
			for (let [t, r] of this.#t) t === e ? n.unskip_effect(r) : n.skip_effect(r);
			for (let [t, r] of this.#n) t === e ? n.unskip_effect(r.effect) : n.skip_effect(r.effect);
			n.oncommit(this.#a), n.ondiscard(this.#o);
		} else E && (this.anchor = D), this.#a(n);
	}
};
// ui/node_modules/svelte/src/internal/client/dom/blocks/if.js
function X(e, t, n = !1) {
	var r;
	E && (r = D, Te());
	var i = new Wr(e), a = n ? ee : 0;
	function o(e, t) {
		if (E) {
			var n = Oe(r);
			if (e !== parseInt(n.substring(1))) {
				var a = De();
				O(a), i.anchor = a, we(!1), i.ensure(e, t), we(!0);
				return;
			}
		}
		i.ensure(e, t);
	}
	wn(() => {
		var e = !1;
		t((t, n = 0) => {
			e = !0, o(n, t);
		}), e || o(-1, null);
	}, a);
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/key.js
var Gr = Symbol("NaN");
function Kr(e, t, n) {
	E && Te();
	var r = new Wr(e), i = !qe();
	wn(() => {
		var e = t();
		e !== e && (e = Gr), i && typeof e == "object" && e && (e = {}), r.ensure(e, n);
	});
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/each.js
function qr(e, t) {
	return t;
}
function Jr(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		Mn(n, () => {
			if (o) {
				if (o.pending.delete(n), o.done.add(n), o.pending.size === 0) {
					var t = e.outrogroups;
					Yr(e, r(o.done)), t.delete(o), t.size === 0 && (e.outrogroups = null);
				}
			} else --s;
		}, !1);
	}
	if (s === 0) {
		var l = i.length === 0 && n !== null && e.pending.size === 0;
		if (l) {
			var u = n, d = u.parentNode;
			sn(d), d.append(u), e.items.clear();
		}
		Yr(e, t, !l);
	} else o = {
		pending: new Set(t),
		done: /* @__PURE__ */ new Set()
	}, (e.outrogroups ??= /* @__PURE__ */ new Set()).add(o);
}
function Yr(e, t, n = !0) {
	var r;
	if (e.pending.size > 0) {
		r = /* @__PURE__ */ new Set();
		for (let t of e.pending.values()) for (let n of t) r.add(e.items.get(n).e);
	}
	for (var i = 0; i < t.length; i++) {
		var a = t[i];
		r?.has(a) ? (a.f |= ne, In(a, document.createDocumentFragment())) : H(t[i], n);
	}
}
var Xr;
function Z(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = E ? O(/* @__PURE__ */ rn(u)) : u.appendChild(nn());
	}
	E && Te();
	var d = null, f = /* @__PURE__ */ mt(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p = /* @__PURE__ */ new Map(), m = !0;
	function h(e) {
		if (!(_.effect.f & 16384)) {
			_.pending.delete(e);
			var t = G(f);
			_.fallback = d, Qr(_, t, c, n, a), d !== null && (t.length === 0 ? d.f & 33554432 ? (d.f ^= ne, ei(d, null, c)) : Pn(d) : Mn(d, () => {
				d = null;
			}));
		}
	}
	function g(e) {
		_.pending.delete(e);
	}
	var _ = {
		effect: wn(() => {
			var e = G(f), t = e.length;
			let r = !1;
			E && Oe(c) === "[!" != (t === 0) && (c = De(), O(c), we(!1), r = !0);
			for (var u = /* @__PURE__ */ new Set(), _ = P, v = cn(), y = 0; y < t; y += 1) {
				E && D.nodeType === 8 && D.data === "]" && (c = D, r = !0, we(!1));
				var b = e[y], x = a(b, y), S = m ? null : l.get(x);
				S ? (S.v && Gt(S.v, b), S.i && Gt(S.i, y), v && _.unskip_effect(S.e)) : (S = $r(l, m ? c : Xr ??= nn(), b, x, y, o, n, i), m || (S.e.f |= ne), l.set(x, S)), u.add(x);
			}
			if (t === 0 && s && !d && (m ? d = En(() => s(c)) : (d = En(() => s(Xr ??= nn())), d.f |= ne)), t > u.size && Ne("", "", ""), E && t > 0 && O(De()), !m) {
				if (p.set(_, u), v) {
					for (let [e, t] of l) u.has(e) || _.skip_effect(t.e);
					_.oncommit(h), _.ondiscard(g);
				} else h(_);
			}
			r && we(!0), G(f);
		}),
		flags: n,
		items: l,
		pending: p,
		outrogroups: null,
		fallback: d
	};
	m = !1, E && (c = D);
}
function Zr(e) {
	for (; e !== null && !(e.f & 32);) e = e.next;
	return e;
}
function Qr(e, t, n, i, a) {
	var o = !!(i & 8), s = t.length, c = e.items, l = Zr(e.effect.first), u, d = null, f, p = [], m = [], h, g, _, v;
	if (o) for (v = 0; v < s; v += 1) h = t[v], g = a(h, v), _ = c.get(g).e, _.f & 33554432 || (_.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(_));
	for (v = 0; v < s; v += 1) {
		if (h = t[v], g = a(h, v), _ = c.get(g).e, e.outrogroups !== null) for (let t of e.outrogroups) t.pending.delete(_), t.done.delete(_);
		if (_.f & 8192 && (Pn(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= ne, _ === l) ei(_, null, n);
			else {
				var y = d ? d.next : l;
				_ === e.effect.last && (e.effect.last = _.prev), _.prev && (_.prev.next = _.next), _.next && (_.next.prev = _.prev), ti(e, d, _), ti(e, _, y), ei(_, y, n), d = _, p = [], m = [], l = Zr(d.next);
				continue;
			}
		}
		if (_ !== l) {
			if (u !== void 0 && u.has(_)) {
				if (p.length < m.length) {
					var b = m[0], x;
					d = b.prev;
					var S = p[0], ee = p[p.length - 1];
					for (x = 0; x < p.length; x += 1) ei(p[x], b, n);
					for (x = 0; x < m.length; x += 1) u.delete(m[x]);
					ti(e, S.prev, ee.next), ti(e, d, S), ti(e, ee, b), l = b, d = ee, --v, p = [], m = [];
				} else u.delete(_), ei(_, l, n), ti(e, _.prev, _.next), ti(e, _, d === null ? e.effect.first : d.next), ti(e, d, _), d = _;
				continue;
			}
			for (p = [], m = []; l !== null && l !== _;) (u ??= /* @__PURE__ */ new Set()).add(l), m.push(l), l = Zr(l.next);
			if (l === null) continue;
		}
		_.f & 33554432 || p.push(_), d = _, l = Zr(_.next);
	}
	if (e.outrogroups !== null) {
		for (let t of e.outrogroups) t.pending.size === 0 && (Yr(e, r(t.done)), e.outrogroups?.delete(t));
		e.outrogroups.size === 0 && (e.outrogroups = null);
	}
	if (l !== null || u !== void 0) {
		var C = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || C.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && C.push(l), l = Zr(l.next);
		var te = C.length;
		if (te > 0) {
			var re = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < te; v += 1) C[v].nodes?.a?.measure();
				for (v = 0; v < te; v += 1) C[v].nodes?.a?.fix();
			}
			Jr(e, C, re);
		}
	}
	o && Xe(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function $r(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? Vt(n) : /* @__PURE__ */ Ht(n, !1, !1) : null, l = o & 2 ? Vt(i) : null;
	return {
		v: c,
		i: l,
		e: En(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function ei(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ an(r);
		if (a.before(r), r === i) return;
		r = o;
	}
}
function ti(e, t, n) {
	t === null ? e.effect.first = n : t.next = n, n === null ? e.effect.last = t : n.prev = t;
}
function ni(e, t, n = !1, r = !1, i = !1, a = !1) {
	var o = e, s = "";
	if (n) {
		var c = e;
		E && (o = O(/* @__PURE__ */ rn(c)));
	}
	V(() => {
		var e = W;
		if (s === (s = t() ?? "")) E && Te();
		else if (n && !E) e.nodes = null, c.innerHTML = s, s !== "" && Nr(/* @__PURE__ */ rn(c), c.lastChild);
		else if (e.nodes !== null && (An(e.nodes.start, e.nodes.end), e.nodes = null), s !== "") {
			if (E) {
				for (var a = D.data, l = Te(), u = l; l !== null && (l.nodeType !== 8 || l.data !== "");) u = l, l = /* @__PURE__ */ an(l);
				if (l === null) throw xe(), ge;
				Nr(D, u), o = O(l);
			} else {
				var d = ln(r ? "svg" : i ? "math" : "template", r ? ve : i ? ye : void 0);
				d.innerHTML = s;
				var f = r || i ? d : d.content;
				if (Nr(/* @__PURE__ */ rn(f), f.lastChild), r || i) for (; /* @__PURE__ */ rn(f);) o.before(/* @__PURE__ */ rn(f));
				else o.before(f);
			}
		}
	});
}
// ui/node_modules/svelte/src/internal/client/dom/css.js
function ri(e, t) {
	xn(() => {
		e = W?.parent?.nodes?.start ?? e;
		var n = e.getRootNode(), r = n.host ? n : n.head ?? n.ownerDocument.head;
		if (!r.querySelector("#" + t.hash)) {
			let e = ln("style");
			e.id = t.hash, e.textContent = t.code, r.appendChild(e);
		}
	});
}
// ui/node_modules/svelte/src/internal/client/dom/elements/actions.js
function ii(e, t, n) {
	xn(() => {
		var r = ur(() => t(e, n?.()) || {});
		if (n && r?.update) {
			var i = !1, a = {};
			Cn(() => {
				var e = n();
				dr(e), i && ke(a, e) && (a = e, r.update(e));
			}), i = !0;
		}
		if (r?.destroy) return () => r.destroy();
	});
}
// ui/node_modules/svelte/src/internal/client/dom/elements/attachments.js
function ai(e, t) {
	var n = void 0, r;
	Tn(() => {
		n !== (n = t()) && (r &&= (H(r), null), n && (r = En(() => {
			xn(() => n(e));
		})));
	});
}
// ui/node_modules/clsx/dist/clsx.mjs
function oi(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") {
		if (Array.isArray(e)) {
			var i = e.length;
			for (t = 0; t < i; t++) e[t] && (n = oi(e[t])) && (r && (r += " "), r += n);
		} else for (n in e) e[n] && (r && (r += " "), r += n);
	}
	return r;
}
function si() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = oi(e)) && (r && (r += " "), r += t);
	return r;
}
// ui/node_modules/svelte/src/internal/shared/attributes.js
function ci(e) {
	return typeof e == "object" ? si(e) : e ?? "";
}
var li = [..." 	\n\r\f\xA0\v﻿"];
function ui(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || li.includes(r[o - 1])) && (s === r.length || li.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function di(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function fi(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function pi(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map(fi)), i && c.push(...Object.keys(i).map(fi));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = fi(e.substring(l, u).trim());
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
		return r && (n += di(r)), i && (n += di(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
// ui/node_modules/svelte/src/internal/client/dom/elements/class.js
function Q(e, t, n, r, i, a) {
	var o = e[de];
	if (E || o !== n || o === void 0) {
		var s = ui(n, r, a);
		E && s === e.getAttribute("class") || (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[de] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/style.js
function mi(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function hi(e, t, n, r) {
	var i = e[w];
	if (E || i !== t) {
		var a = pi(t, r);
		E && a === e.getAttribute("style") || (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[w] = t;
	} else r && (Array.isArray(r) ? (mi(e, n?.[0], r[0]), mi(e, n?.[1], r[1], "important")) : mi(e, n, r));
	return r;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
function gi(e, t) {
	t ? e.hasAttribute("selected") || e.setAttribute("selected", "") : e.removeAttribute("selected");
}
function _i(e, t) {
	var n = !("__defaultValue" in e);
	(n || e.__defaultValue !== t) && (e.__defaultValue = t, vi(e, !n || "__value" in e));
}
function vi(t, n) {
	var r = t.__defaultValue, i = t.multiple, a = i ? r ?? [] : null;
	if (!i || e(a)) {
		var o = t.selectedIndex, s = n && i ? new Set(t.selectedOptions) : null;
		for (var c of t.options) {
			var l = xi(c);
			gi(c, i ? a.includes(l) : Xt(l, r));
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
function yi(t, n, r = !1) {
	if (t.multiple) {
		if (n == null) return;
		if (!e(n)) return Se();
		for (var i of t.options) i.selected = n.includes(xi(i));
	} else {
		for (i of t.options) if (Xt(xi(i), n)) {
			i.selected = !0;
			return;
		}
		r && n === void 0 || (t.selectedIndex = -1);
	}
}
function bi(e) {
	var t = new MutationObserver((t) => {
		t.every(Si) || ("__defaultValue" in e && vi(e, !1), "__value" in e && yi(e, e.__value));
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
function xi(e) {
	return "__value" in e ? e.__value : e.value;
}
function Si(e) {
	if (e.target.closest("selectedcontent") !== null) return !0;
	if (e.type === "childList") {
		var t = [...e.addedNodes, ...e.removedNodes];
		return t.length > 0 && t.every((e) => e.nodeName === "SELECTEDCONTENT");
	}
	return !1;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/attributes.js
var Ci = Symbol("class"), wi = Symbol("style"), Ti = Symbol("is custom element"), Ei = Symbol("is html"), Di = he ? "link" : "LINK", Oi = he ? "input" : "INPUT", ki = he ? "option" : "OPTION", Ai = he ? "select" : "SELECT", ji = he ? "progress" : "PROGRESS";
function Mi(e) {
	if (E) {
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
		e[pe] = n, Xe(n), it();
	}
}
function $(e, t, n, r) {
	var i = Fi(e);
	if (!(E && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === Di))) {
		var a = i[t];
		a !== (i[t] = n) && (t === "loading" && (e[le] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && Li(e).has(t) ? e[t] = n : (!E || typeof n != "number" && typeof n != "boolean" || a !== String(n)) && e.setAttribute(t, n));
	}
}
function Ni(e, t, n, r, i = !1, a = !1) {
	E && i && e.nodeName === Oi && ("defaultValue" in n || "defaultChecked" in n || Mi(e));
	var o = Fi(e), s = o[Ti], c = !o[Ei];
	let l = E && s;
	l && we(!1);
	var u = t || {}, d = e.nodeName === ki, f = e.nodeName === Ai;
	try {
		for (var p in t) !(p in n) && p[0] + p[1] !== "$$" && (n[p] = null);
		n.class ? n.class = ci(n.class) : (r || n[Ci]) && (n.class = null), n[wi] && (n.style ??= null);
		var m = Li(e);
		if (e.nodeName === Oi && "type" in n && ("value" in n || "__value" in n)) {
			var h = n.type;
			(h !== u.type || h === void 0 && e.hasAttribute("type")) && (u.type = h, $(e, "type", h, a));
		}
		for (let i in n) {
			let l = n[i];
			if (d && i === "value" && l == null) e.value = e.__value = "", u[i] = l;
			else if (i === "class") Q(e, e.namespaceURI === "http://www.w3.org/1999/xhtml", l, r, t?.[Ci], n[Ci]), u[i] = l, u[Ci] = n[Ci];
			else if (i === "style") hi(e, l, t?.[wi], n[wi]), u[i] = l, u[wi] = n[wi];
			else {
				var g = u[i];
				if (l !== g || l === void 0 && e.hasAttribute(i)) {
					u[i] = l;
					var _ = i[0] + i[1];
					if (_ !== "$$") {
						if (_ === "on") {
							let t = {}, n = "$$" + i, r = i.slice(2);
							var v = hr(r);
							if (pr(r) && (r = r.slice(0, -7), t.capture = !0), !v && g) {
								if (l != null) continue;
								e.removeEventListener(r, u[n], t), u[n] = null;
							}
							if (v) K(r, e, l), Er([r]);
							else if (l != null) {
								function a(e) {
									u[i].call(this, e);
								}
								u[n] = wr(r, e, a, t);
							}
						} else if (i === "style") $(e, i, l);
						else if (i === "autofocus") tt(e, !!l);
						else if (!s && (i === "__value" || i === "value" && l != null)) e.__value = l, (g == null || e.value !== l || l === 0 && e.nodeName === ji) && (e.value = l);
						else if (i === "selected" && d) gi(e, l);
						else {
							var y = i;
							c || (y = vr(y));
							var b = y === "defaultValue" || y === "defaultChecked";
							if (f && y === "defaultValue") continue;
							if (l == null && !s && !b) {
								if (o[i] = null, y === "value" || y === "checked") {
									let n = e, r = t === void 0;
									if (y === "value") {
										let e = n.defaultValue;
										n.removeAttribute(y), n.defaultValue = e, n.value = n.__value = r ? e : null;
									} else {
										let e = n.defaultChecked;
										n.removeAttribute(y), n.defaultChecked = e, n.checked = r ? e : !1;
									}
								} else e.removeAttribute(i);
							} else b || (s || typeof l != "string") && m.has(y) ? (e[y] = l, y in o && (o[y] = T)) : typeof l != "function" && $(e, y, l, a);
						}
					}
				}
			}
		}
	} finally {
		l && we(!0);
	}
	return u;
}
function Pi(e, t, n = [], r = [], i = [], a, o = !1, s = !1) {
	st(i, n, r, (n) => {
		var r = void 0, i = {}, c = e.nodeName === Ai, l = !1;
		if (Tn(() => {
			var u = t(...n.map(G)), d = Ni(e, r, u, a, o, s);
			if (l && c) {
				var f = e;
				"defaultValue" in u && _i(f, u.defaultValue), "value" in u && yi(f, u.value);
			}
			for (let e of Object.getOwnPropertySymbols(i)) u[e] || H(i[e]);
			for (let t of Object.getOwnPropertySymbols(u)) {
				var p = u[t];
				t.description !== "@attach" || r && p === r[t] || (i[t] && H(i[t]), i[t] = En(() => ai(e, () => p))), d[t] = p;
			}
			r = d;
		}), c) {
			var u = e;
			xn(() => {
				var e = r;
				"defaultValue" in e && _i(u, e.defaultValue), yi(u, e.value, !0), bi(u);
			});
		}
		l = !0;
	});
}
function Fi(e) {
	return e[ue] ??= {
		[Ti]: e.nodeName.includes("-"),
		[Ei]: e.namespaceURI === _e
	};
}
var Ii = /* @__PURE__ */ new Map();
function Li(e) {
	var t = e.getAttribute("is") || e.nodeName, n = Ii.get(t);
	if (n) return n;
	Ii.set(t, n = /* @__PURE__ */ new Set());
	for (var r, i = e, a = Element.prototype; a !== i;) {
		for (var s in r = o(i), r) r[s].set && s !== "innerHTML" && s !== "textContent" && s !== "innerText" && n.add(s);
		i = l(i);
	}
	return n;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function Ri(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet();
	ot(e, "input", async (i) => {
		var a = i ? e.defaultValue : e.value;
		if (a = zi(e) ? Bi(a) : a, n(a), P !== null && r.add(P), await sr(), a !== (a = t())) {
			var o = e.selectionStart, s = e.selectionEnd, c = e.value.length;
			if (e.value = a ?? "", s !== null) {
				var l = e.value.length;
				o === s && s === c && l > c ? (e.selectionStart = l, e.selectionEnd = l) : (e.selectionStart = o, e.selectionEnd = Math.min(s, l));
			}
		}
	}), (E && e.defaultValue !== e.value || ur(t) == null && e.value) && (n(zi(e) ? Bi(e.value) : e.value), P !== null && r.add(P)), Cn(() => {
		var n = t();
		if (e === document.activeElement) {
			var i = P;
			if (r.has(i)) return;
		}
		zi(e) && n === Bi(e.value) || (e.type !== "date" || n || e.value) && n !== e.value && (e.value = n ?? "");
	});
}
function zi(e) {
	var t = e.type;
	return t === "number" || t === "range";
}
function Bi(e) {
	return e === "" ? null : +e;
}
var Vi = /* @__PURE__ */ new class e {
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
function Hi(e, t, n) {
	var r = Vi.observe(e, () => n(e[t]));
	xn(() => (ur(() => n(e[t])), r));
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function Ui(e, t) {
	return e === t || e?.[oe] === t;
}
function Wi(e = Ke(), t, n, r) {
	var i = j.r, a = W;
	return xn(() => {
		var o, s;
		return Cn(() => {
			o = s, s = r?.() || [], ur(() => {
				Ui(n(...s), e) || (t(e, ...s), o && Ui(n(...o), e) && t(null, ...o));
			});
		}), () => {
			let r = a;
			for (; r !== i && r.parent !== null && r.parent.f & 33554432;) r = r.parent;
			let o = () => {
				s && Ui(n(...s), e) && t(null, ...s);
			}, c = r.teardown;
			r.teardown = () => {
				o(), c?.();
			};
		};
	}), e;
}
// ui/node_modules/svelte/src/internal/client/reactivity/store.js
var Gi = !1;
function Ki(e) {
	var t = Gi;
	try {
		return Gi = !1, [e(), Gi];
	} finally {
		Gi = t;
	}
}
// ui/node_modules/svelte/src/internal/client/reactivity/props.js
function qi(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ dt(r), G(u)) : (l && (l = !1, c = s ? ur(r) : r), c);
	let f;
	if (o) {
		var p = oe in e || ce in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = Ki(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && Re(t), f(m)));
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
	var v = !1, y = (n & 1 ? dt : mt)(() => (v = !1, g()));
	o && G(y);
	var b = W;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? G(y) : i && o ? L(e) : e;
			return I(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return Rn && v || b.f & 16384 ? y.v : G(y);
	});
}
function Ji(e) {
	j === null && je("onMount"), vn(() => {
		let t = ur(e);
		if (typeof t == "function") return t;
	});
}
// ui/node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
// ui/src/lib/prefs.ts
function Yi(e, t) {
	try {
		let n = localStorage.getItem(e);
		return n === null ? t : JSON.parse(n);
	} catch {
		return t;
	}
}
function Xi(e, t) {
	try {
		localStorage.setItem(e, JSON.stringify(t));
	} catch {}
}
// ui/src/lib/text.ts
var Zi = (e) => String(e instanceof Error ? e.message : e);
// plugins/beta/catalog/ui/src/library.ts
function Qi(e, t) {
	let n = (e) => e.sort[t.id] ?? "";
	return [...e].sort((e, r) => {
		let i = n(e), a = n(r), o = typeof i == "number" && typeof a == "number" ? i - a : String(i).localeCompare(String(a), void 0, { numeric: !0 });
		return (t.desc ? -o : o) || e.id.localeCompare(r.id);
	});
}
function $i(e, t) {
	return e.filter((e) => typeof e.lastUsed == "number" && e.lastUsed > 0 && (e.progress ?? 0) < 1).sort((e, t) => t.lastUsed - e.lastUsed || e.id.localeCompare(t.id)).slice(0, t);
}
var ea = /* @__PURE__ */ new Map(), ta = /* @__PURE__ */ new Map();
function na(e, t) {
	let n = e.text.toLowerCase();
	return t.toLowerCase().split(/\s+/).filter(Boolean).every((e) => n.includes(e));
}
var ra = " › ", ia = (e, t) => (e ?? []).some((e) => e === t || e.startsWith(t + " › "));
function aa(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [t, r] of e) {
		let e = t.split(ra);
		e.forEach((t, i) => {
			let a = e.slice(0, i + 1).join(ra), o = n.get(a) ?? {
				path: a,
				name: t,
				depth: i,
				count: 0,
				kids: !1
			};
			o.count += r, i < e.length - 1 && (o.kids = !0), n.set(a, o);
		});
	}
	return [...n.values()].sort((e, t) => e.path.localeCompare(t.path)).filter((e) => {
		let n = e.path.split(ra);
		return n.slice(0, -1).every((e, r) => t.has(n.slice(0, r + 1).join(ra)));
	});
}
function oa(e, t, n = []) {
	let r = /* @__PURE__ */ new Map();
	for (let n of e) for (let e of t(n) ?? []) r.set(e, (r.get(e) ?? 0) + 1);
	let i = [...r].filter(([e]) => !n.includes(e)).sort((e, t) => e[0].localeCompare(t[0]));
	return [...n.map((e) => [e, r.get(e) ?? 0]), ...i];
}
function sa(e, t, n, r) {
	let i = /* @__PURE__ */ new Map(), a = (e) => i.get(e.id), o = (e) => (typeof e.tabs == "function" ? e.tabs() : e.tabs) ?? [], s = (e, t) => {
		if (e.from) return [];
		let n = o(e);
		return n.length ? n.map((e) => ({
			...e,
			id: `${t}␟${e.id}`
		})) : [{
			id: `${t}␟`,
			title: e.title
		}];
	}, c = (e) => {
		let t = /* @__PURE__ */ new Map();
		for (let n of e) {
			let e = a(n);
			e && t.set(e.part, [...t.get(e.part) ?? [], e.item]);
		}
		return t;
	}, l = (e, t) => {
		let n = /* @__PURE__ */ new Set();
		return e.flat().filter((e) => !n.has(t(e)) && !!n.add(t(e)));
	}, u = (e) => r.find((t) => t[e]);
	return {
		id: e,
		title: t,
		icon: n,
		noun: r[0].noun,
		async load() {
			i.clear();
			let e = await Promise.all(r.map((e) => e.load().catch(() => []))), t = /* @__PURE__ */ new Set();
			return e.flatMap((e, n) => e.flatMap((e) => {
				if (e.note && !(e.from ?? r[n].from)) {
					if (t.has(e.note)) return [];
					t.add(e.note);
				}
				let a = {
					...e,
					id: `${n}␟${e.id}`,
					tab: r[n].from ? void 0 : `${n}␟${o(r[n]).length ? e.tab ?? "" : ""}`,
					from: e.from ?? r[n].from
				};
				return i.set(a.id, {
					part: r[n],
					item: e
				}), [a];
			}));
		},
		tabs: () => r.flatMap(s),
		groupsTitle: r.map((e) => e.groupsTitle).find(Boolean),
		groupOrder: l(r.map((e) => e.groupOrder ?? []), (e) => e),
		regroup: r.some((e) => e.regroup) ? async (e, t) => {
			for (let [n, r] of c(e)) await n.regroup?.(r, t);
		} : void 0,
		layouts: l(r.map((e) => e.layouts), (e) => e),
		from: r.every((e) => e.from) ? r[0].from : void 0,
		homes: l(r.map((e) => e.homes ?? []), (e) => e.from),
		sorts: l(r.map((e) => e.sorts), (e) => e.id),
		search: r[0].search,
		empty: r.map((e) => e.empty).join(" "),
		detail: (e) => {
			let t = a(e);
			return t ? t.part.detail(t.item) : {
				title: e.title,
				actions: []
			};
		},
		add: u("add")?.add,
		drop: u("drop")?.drop,
		tools: r.some((e) => e.tools) ? async () => (await Promise.all(r.map((e) => e.tools?.() ?? []))).flat() : void 0,
		watch: (e) => {
			let t = r.map((t) => t.watch?.(e));
			return () => t.forEach((e) => e?.());
		},
		keys: Object.assign({}, ...r.map((e) => Object.fromEntries(Object.entries(e.keys ?? {}).map(([t, n]) => [t, (t) => {
			let r = a(t);
			r?.part === e && n(r.item);
		}])))),
		open: (e) => {
			let t = a(e);
			t?.part.open?.(t.item);
		},
		many: (e) => {
			let t = c(e);
			if (t.size !== 1) return [];
			let [[n, r]] = [...t];
			return n.many?.(r) ?? [];
		}
	};
}
var ca = (e) => e.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), la = (e) => e.subject ?? ca(e.title), ua = /* @__PURE__ */ new Map();
function da(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(la(n), [...t.get(la(n)) ?? [], n]);
	return [...t].map(([e, t]) => {
		if (t.length === 1) return t[0];
		let n = t.map((e) => e.id).join("\n"), r = ua.get(n);
		if (!r || t.some((e, t) => r.members[t] !== e.id)) {
			let i = t.find((t) => ca(t.title) === e)?.title ?? t[0].title, a = t[0].icon;
			r = {
				id: t[0].id,
				title: i,
				icon: a,
				by: t[0].by,
				subject: e,
				members: t.map((e) => e.id),
				from: t.every((e) => e.from) ? t[0].from : void 0,
				source: async () => sa(t[0].id, i, a, await Promise.all(t.map((e) => e.source())))
			}, ua.set(n, r);
		}
		return r;
	});
}
// ui/src/lib/keys.ts
var fa = !1, pa = /^(Meta|OS|Super|Hyper)(Left|Right)?$/;
if (typeof window < "u") {
	let e = (e) => (t) => {
		(pa.test(t.key) || pa.test(t.code)) && (fa = e);
	};
	window.addEventListener("keydown", e(!0), !0), window.addEventListener("keyup", e(!1), !0), window.addEventListener("blur", () => {
		fa = !1;
	});
}
function ma(e) {
	return e.metaKey || fa || e.getModifierState?.("Super") || e.getModifierState?.("OS") || !1;
}
// ui/src/lib/marquee.ts
var ha = 5;
function ga(e, t) {
	let n = t, r = null, i = null, a = {
		x: 0,
		y: 0
	}, o = (t, n) => {
		let r = e.getBoundingClientRect();
		return {
			x: t - r.left + e.scrollLeft,
			y: n - r.top + e.scrollTop
		};
	};
	function s(t, a) {
		if (!r || !i) return;
		let s = o(t, a), c = Math.min(r.x, s.x), l = Math.min(r.y, s.y), u = Math.max(r.x, s.x), d = Math.max(r.y, s.y);
		Object.assign(i.style, {
			left: `${c}px`,
			top: `${l}px`,
			width: `${u - c}px`,
			height: `${d - l}px`
		});
		let f = e.getBoundingClientRect(), p = [];
		for (let t of e.querySelectorAll("[data-pick]")) {
			let n = t.getBoundingClientRect(), r = n.left - f.left + e.scrollLeft, i = n.top - f.top + e.scrollTop;
			r < u && r + n.width > c && i < d && i + n.height > l && p.push(t.dataset.pick);
		}
		n.pick(p, r.add);
	}
	let c = (e) => e.button !== 0 || !!e.target.closest("input, textarea, select, a, [contenteditable], [draggable=true]");
	function l(t) {
		c(t) || t.offsetX > e.clientWidth && t.target === e || (t.preventDefault(), e.closest("[tabindex]")?.focus({ preventScroll: !0 }));
	}
	function u(t) {
		c(t) || t.pointerType === "touch" || t.offsetX > e.clientWidth && t.target === e || (r = {
			...o(t.clientX, t.clientY),
			add: t.ctrlKey || t.metaKey || t.shiftKey,
			id: t.pointerId
		}, a = {
			x: t.clientX,
			y: t.clientY
		});
	}
	function d(t) {
		if (!r || t.pointerId !== r.id) return;
		if (a = {
			x: t.clientX,
			y: t.clientY
		}, !i) {
			let n = o(t.clientX, t.clientY);
			if (Math.hypot(n.x - r.x, n.y - r.y) < ha) return;
			i = document.createElement("div"), i.className = "marquee", e.append(i), e.setPointerCapture(t.pointerId), window.getSelection()?.removeAllRanges();
		}
		let n = e.getBoundingClientRect();
		t.clientY < n.top + 24 ? e.scrollTop -= 16 : t.clientY > n.bottom - 24 && (e.scrollTop += 16), s(t.clientX, t.clientY);
	}
	function f(t) {
		if (!r || t.pointerId !== r.id) return;
		let n = !!i;
		if (i?.remove(), i = null, r = null, !n) return;
		let a = (e) => {
			e.stopPropagation(), e.preventDefault();
		};
		e.addEventListener("click", a, {
			capture: !0,
			once: !0
		}), setTimeout(() => e.removeEventListener("click", a, { capture: !0 }), 0);
	}
	let p = () => {
		i && s(a.x, a.y);
	};
	return e.addEventListener("mousedown", l), e.addEventListener("pointerdown", u), e.addEventListener("pointermove", d), e.addEventListener("pointerup", f), e.addEventListener("pointercancel", f), e.addEventListener("scroll", p), {
		update(e) {
			n = e;
		},
		destroy() {
			i?.remove(), e.removeEventListener("mousedown", l), e.removeEventListener("pointerdown", u), e.removeEventListener("pointermove", d), e.removeEventListener("pointerup", f), e.removeEventListener("pointercancel", f), e.removeEventListener("scroll", p);
		}
	};
}
// ui/src/lib/back.ts
var _a = globalThis.atlasBackStack ??= [];
function va(e, t) {
	let n = {
		close: e,
		shown: t
	};
	return _a.push(n), () => {
		let e = _a.lastIndexOf(n);
		e >= 0 && _a.splice(e, 1);
	};
}
// ui/src/components/Select.svelte
var ya = /* @__PURE__ */ q("<span class=\"n svelte-ifm9j5\"> </span>"), ba = /* @__PURE__ */ q("<li role=\"option\"><span class=\"l svelte-ifm9j5\"> </span><!></li>"), xa = /* @__PURE__ */ q("<ul class=\"menu svelte-ifm9j5\" role=\"listbox\" tabindex=\"-1\"></ul>"), Sa = /* @__PURE__ */ q("<div class=\"select svelte-ifm9j5\"><button type=\"button\" class=\"trigger svelte-ifm9j5\" aria-haspopup=\"listbox\"><span class=\"cur svelte-ifm9j5\"> </span> <svg viewBox=\"0 0 16 16\" width=\"12\" height=\"12\" aria-hidden=\"true\" class=\"svelte-ifm9j5\"><path d=\"M4 6l4 4 4-4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg></button> <!></div>"), Ca = {
	hash: "svelte-ifm9j5",
	code: ".select.svelte-ifm9j5 {position:relative;display:inline-block;min-width:180px;max-width:100%;}.trigger.svelte-ifm9j5 {display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;font:inherit;font-size:calc(13px * var(--ui-scale, 1));color:var(--text);background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 9px;text-align:left;}.trigger.svelte-ifm9j5:hover {border-color:var(--text-faint);}.trigger.svelte-ifm9j5:focus-visible, .trigger[aria-expanded=\"true\"].svelte-ifm9j5 {outline:none;border-color:var(--accent);}.cur.svelte-ifm9j5 {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}svg.svelte-ifm9j5 {flex:none;color:var(--text-muted);}.menu.svelte-ifm9j5 {position:absolute;z-index:50;top:calc(100% + 4px);left:0;min-width:100%;max-width:460px;max-height:300px;overflow:auto;margin:0;padding:4px;list-style:none;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-sm);box-shadow:var(--shadow-pop);}li.svelte-ifm9j5 {display:flex;flex-direction:column;gap:1px;padding:5px 9px;border-radius:4px;cursor:pointer;color:var(--text);font-size:calc(13px * var(--ui-scale, 1));}li.on.svelte-ifm9j5 {background:var(--bg-hover);}li.cur.svelte-ifm9j5 .l:where(.svelte-ifm9j5) {color:var(--accent);font-weight:600;}.n.svelte-ifm9j5 {color:var(--text-muted);font-size:.86em;}"
};
function wa(e, t) {
	We(t, !0), ri(e, Ca);
	let n = /* @__PURE__ */ F(!1), r = /* @__PURE__ */ F(0), i, a = /* @__PURE__ */ F(void 0), o = /* @__PURE__ */ N(() => t.options.find((e) => e.value === t.value));
	vn(() => {
		if (G(n)) return va(() => I(n, !1));
	});
	function s() {
		I(r, Math.max(0, t.options.findIndex((e) => e.value === t.value)), !0), I(n, !0), requestAnimationFrame(() => G(a)?.querySelector(".on")?.scrollIntoView({ block: "nearest" }));
	}
	function c(e) {
		I(n, !1), t.options[e] && t.options[e].value !== t.value && t.onchange(t.options[e].value), i.querySelector("button")?.focus();
	}
	function l(e) {
		if (!G(n)) [
			"Enter",
			" ",
			"ArrowDown",
			"ArrowUp"
		].includes(e.key) && (e.preventDefault(), s());
		else {
			if (e.key === "Escape") e.preventDefault(), e.stopPropagation(), I(n, !1);
			else if (e.key === "ArrowDown") e.preventDefault(), I(r, Math.min(t.options.length - 1, G(r) + 1), !0);
			else if (e.key === "ArrowUp") e.preventDefault(), I(r, Math.max(0, G(r) - 1), !0);
			else if (e.key === "Enter" || e.key === " ") e.preventDefault(), c(G(r));
			else if (e.key.length === 1) {
				let n = t.options.findIndex((t) => t.label.toLowerCase().startsWith(e.key.toLowerCase()));
				n >= 0 && I(r, n, !0);
			} else return;
			requestAnimationFrame(() => G(a)?.children[G(r)]?.scrollIntoView({ block: "nearest" }));
		}
	}
	function u(e) {
		i.contains(e.relatedTarget) || I(n, !1);
	}
	var d = Sa(), f = R(d), p = z(R(f), !0);
	Ee(2), k(f);
	var m = B(f, 2), h = (e) => {
		var n = xa();
		Z(n, 23, () => t.options, (e) => e.value, (e, n, i) => {
			var a = ba();
			let o;
			var s = R(a), l = z(s, !0), u = B(s), d = (e) => {
				var t = ya(), r = z(t, !0);
				V(() => Y(r, G(n).note)), J(e, t);
			};
			X(u, (e) => {
				G(n).note && e(d);
			}), k(a), V(() => {
				$(a, "aria-selected", G(n).value === t.value), o = Q(a, 1, "svelte-ifm9j5", null, o, {
					on: G(i) === G(r),
					cur: G(n).value === t.value
				}), Y(l, G(n).label);
			}), K("mousedown", a, (e) => {
				e.preventDefault(), c(G(i));
			}), K("mousemove", a, () => I(r, G(i), !0)), J(e, a);
		}), k(n), Wi(n, (e) => I(a, e), () => G(a)), J(e, n);
	};
	X(m, (e) => {
		G(n) && e(h);
	}), k(d), Wi(d, (e) => i = e, () => i), V(() => {
		$(f, "id", t.id), $(f, "aria-expanded", G(n)), $(f, "aria-label", t.label), $(f, "title", G(o)?.note), Y(p, G(o)?.label ?? t.value);
	}), K("focusout", d, u), K("click", f, () => G(n) ? I(n, !1) : s()), K("keydown", f, l), J(e, d), Ge();
}
Er([
	"focusout",
	"click",
	"keydown",
	"mousedown",
	"mousemove"
]);
// ui/src/lib/icons.ts
var Ta = {
	mic: "<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7\"/>",
	camera: "<path d=\"M4 8.5A2 2 0 0 1 6 6.5h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z\"/><circle cx=\"12\" cy=\"13\" r=\"3.5\"/>",
	indent: "<path d=\"M11 6h9M11 12h9M11 18h9\"/><path d=\"m4 9 3 3-3 3\"/>",
	outdent: "<path d=\"M11 6h9M11 12h9M11 18h9\"/><path d=\"m7 9-3 3 3 3\"/>",
	brackets: "<path d=\"M7 4H4.5v16H7M10 4H8.5v16H10M17 4h2.5v16H17M14 4h1.5v16H14\"/>",
	"keyboard-down": "<rect x=\"3\" y=\"3.5\" width=\"18\" height=\"11\" rx=\"2\"/><path d=\"M7 7.5h.01M11 7.5h.01M15 7.5h.01M8 11h8\"/><path d=\"m9 18 3 3 3-3\"/>",
	key: "<circle cx=\"7.5\" cy=\"15.5\" r=\"4\"/><path d=\"m10.4 12.6 9.1-9.1M16 7l2.5 2.5M18.5 4.5 21 7\"/>",
	user: "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4.5 20.5a7.5 7.5 0 0 1 15 0\"/>",
	plugin: "<path d=\"M9 3.5v4M15 3.5v4\"/><path d=\"M6 7.5h12v4a6 6 0 0 1-12 0z\"/><path d=\"M12 17.5v3\"/>",
	today: "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"16.5\" rx=\"2.5\"/><path d=\"M8 2.5v4M16 2.5v4M3 10h18\"/><path d=\"M8.5 15l2.3 2.3L15.5 12.8\"/>",
	home: "<path d=\"M3.5 10.5 12 3.5l8.5 7\"/><path d=\"M5.5 9v10a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9\"/><path d=\"M10 21v-5.5h4V21\"/>",
	files: "<path d=\"M4 6.5A2.5 2.5 0 0 1 6.5 4h3.3l2 2.2h5.7A2.5 2.5 0 0 1 20 8.7v8.8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z\"/>",
	search: "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"m20 20-4.3-4.3\"/>",
	lecture: "<path d=\"M2.5 6.5 12 3l9.5 3.5L12 10z\"/><path d=\"M6 8.3v5.2c0 1.4 2.7 3 6 3s6-1.6 6-3V8.3\"/><path d=\"M21.5 6.5v6\"/>",
	command: "<path d=\"M9 6.5V17.5M15 6.5V17.5M6.5 9H17.5M6.5 15H17.5\"/><path d=\"M9 6.5a2.5 2.5 0 1 0-2.5 2.5M15 6.5A2.5 2.5 0 1 1 17.5 9M9 17.5A2.5 2.5 0 1 1 6.5 15M15 17.5a2.5 2.5 0 1 0 2.5-2.5\"/>",
	file: "<path d=\"M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z\"/><path d=\"M14 3v5h5\"/>",
	"file-text": "<path d=\"M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z\"/><path d=\"M14 3v5h5M9 13h6M9 17h4\"/>",
	"file-code": "<path d=\"M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z\"/><path d=\"M14 3v5h5M10 12.5l-2 2 2 2M14 12.5l2 2-2 2\"/>",
	pdf: "<path d=\"M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z\"/><path d=\"M14 3v5h5\"/><path d=\"M8.5 17.5c2-1.2 4.5-4.6 4.2-6.6-.3-1.6-2.2-.6-1.4 1.4.9 2.4 3.3 4.4 4.9 4.6\"/>",
	image: "<rect x=\"3\" y=\"3.5\" width=\"18\" height=\"17\" rx=\"2.5\"/><circle cx=\"9\" cy=\"9.5\" r=\"1.8\"/><path d=\"m21 15.5-4.5-4.5L6 20.5\"/>",
	terminal: "<rect x=\"2.5\" y=\"4\" width=\"19\" height=\"16\" rx=\"2.5\"/><path d=\"m7 9.5 3 2.5-3 2.5M12.5 15h4.5\"/>",
	claude: "<path d=\"M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.8 2.8M15.2 15.2 18 18M18 6l-2.8 2.8M8.8 15.2 6 18\"/>",
	globe: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5z\"/>",
	mail: "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2.5\"/><path d=\"m3.5 7 8.5 6 8.5-6\"/>",
	bell: "<path d=\"M6 9.5a6 6 0 0 1 12 0c0 5.5 2.5 7 2.5 7h-17S6 15 6 9.5z\"/><path d=\"M10 20a2 2 0 0 0 4 0\"/>",
	inbox: "<path d=\"M3 13h5l1.5 2.5h5L16 13h5\"/><path d=\"M5.5 5h13L21 13v5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18v-5z\"/>",
	server: "<rect x=\"3.5\" y=\"4\" width=\"17\" height=\"7\" rx=\"2\"/><rect x=\"3.5\" y=\"13\" width=\"17\" height=\"7\" rx=\"2\"/><path d=\"M7.5 7.5h.01M7.5 16.5h.01\"/>",
	folder: "<path d=\"M4 6.5A2.5 2.5 0 0 1 6.5 4h3.3l2 2.2h5.7A2.5 2.5 0 0 1 20 8.7v8.8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z\"/>",
	"folder-open": "<path d=\"M4 17.5V6.5A2.5 2.5 0 0 1 6.5 4h3.3l2 2.2h5.2A2.5 2.5 0 0 1 19.5 8.7V10\"/><path d=\"M4 17.5 6.3 11.6A2 2 0 0 1 8.2 10.3h12a1.3 1.3 0 0 1 1.2 1.8l-2.2 5.9a3 3 0 0 1-2.8 2H6.5A2.5 2.5 0 0 1 4 17.5z\"/>",
	chevron: "<path d=\"m9.5 6 6 6-6 6\"/>",
	undo: "<path d=\"M9 14 4 9l5-5\"/><path d=\"M4 9h10.5a5.5 5.5 0 0 1 0 11H11\"/>",
	redo: "<path d=\"m15 14 5-5-5-5\"/><path d=\"M20 9H9.5a5.5 5.5 0 0 0 0 11H13\"/>",
	pen: "<path d=\"M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z\"/><path d=\"m14.5 5.5 3 3\"/>",
	ballpoint: "<path d=\"M18.5 3.5 20.5 5.5 9 17l-3.5 1.5L7 15z\"/><path d=\"m5.5 18.5-2 2\"/>",
	highlighter: "<path d=\"m9 11-5 5v3.5h3.5l5-5\"/><path d=\"m9 11 6.5-6.5a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3L13 15z\"/><path d=\"M14 20.5h7\"/>",
	eraser: "<path d=\"m7 21-4.3-4.3a1.5 1.5 0 0 1 0-2.1l9.9-9.9a1.5 1.5 0 0 1 2.1 0l5.6 5.6a1.5 1.5 0 0 1 0 2.1L13 21\"/><path d=\"M7 21h14M5.5 12.5l6 6\"/>",
	pointer: "<path d=\"m4 4 7 17 2.5-7.5L21 11z\"/>",
	hand: "<path d=\"M18 11V6.5a1.5 1.5 0 0 0-3 0V11M15 10.5V4.5a1.5 1.5 0 0 0-3 0v6M12 10.5V5.5a1.5 1.5 0 0 0-3 0V14\"/><path d=\"M18 8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.5a7 7 0 0 1-5.4-2.6L3.6 15a1.5 1.5 0 0 1 2.3-1.9L9 16\"/>",
	"external-link": "<path d=\"M14 4h6v6\"/><path d=\"M20 4l-8.5 8.5\"/><path d=\"M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10\"/>",
	maximize: "<path d=\"M8 3.5H5A1.5 1.5 0 0 0 3.5 5v3M20.5 8V5A1.5 1.5 0 0 0 19 3.5h-3M16 20.5h3a1.5 1.5 0 0 0 1.5-1.5v-3M3.5 16v3A1.5 1.5 0 0 0 5 20.5h3\"/>",
	sliders: "<path d=\"M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0\"/><circle cx=\"16\" cy=\"6\" r=\"2\"/><circle cx=\"10\" cy=\"12\" r=\"2\"/><circle cx=\"18\" cy=\"18\" r=\"2\"/>",
	"arrow-up": "<path d=\"M12 19V5M5.5 11.5 12 5l6.5 6.5\"/>",
	"arrow-down": "<path d=\"M12 5v14M5.5 12.5 12 19l6.5-6.5\"/>",
	"folder-plus": "<path d=\"M3.5 7.5v10a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7v.5\"/><path d=\"M12 11v5M9.5 13.5h5\"/>",
	upload: "<path d=\"M12 15.5V4.5M7 9l5-5 5 5\"/><path d=\"M5 19.5h14\"/>",
	columns: "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"1.5\"/><path d=\"M12 4.5v15\"/>",
	download: "<path d=\"M12 4v11M7 10.5l5 5 5-5\"/><path d=\"M5 19.5h14\"/>",
	"arrow-left": "<path d=\"M19 12H5M11 6l-6 6 6 6\"/>",
	"arrow-right": "<path d=\"M5 12h14M13 6l6 6-6 6\"/>",
	error: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"m9 9 6 6M15 9l-6 6\"/>",
	warning: "<path d=\"M10.3 4.3 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z\"/><path d=\"M12 9.5v4M12 17h.01\"/>",
	pin: "<path d=\"M12 17v4.5\"/><path d=\"M9 3.5h6l-1 5.2 3.5 3.3v2H6.5v-2L10 8.7z\"/>",
	"folder-tree": "<path d=\"M13 4h2.6l1.1 1.4H20a1 1 0 0 1 1 1v2.6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z\"/><path d=\"M13 14h2.6l1.1 1.4H20a1 1 0 0 1 1 1v2.6a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V15a1 1 0 0 1 1-1z\"/><path d=\"M4 3v13a2 2 0 0 0 2 2h4M4 6.5a2 2 0 0 0 2 2h4\"/>",
	"move-out": "<path d=\"M4 5v14\"/><path d=\"M20 12H8\"/><path d=\"m14 6 6 6-6 6\"/>",
	"move-in": "<path d=\"M20 5v14\"/><path d=\"M4 12h12\"/><path d=\"m10 6-6 6 6 6\"/>",
	bold: "<path d=\"M7 5h6.5a3.5 3.5 0 0 1 0 7H7z\"/><path d=\"M7 12h7.5a3.5 3.5 0 0 1 0 7H7z\"/>",
	italic: "<path d=\"M10 5h8M6 19h8M14.5 5l-5 14\"/>",
	code: "<path d=\"m9 8-4 4 4 4M15 8l4 4-4 4\"/>",
	heading: "<path d=\"M6 5v14M18 5v14M6 12h12\"/>",
	list: "<path d=\"M10 7h10M10 12h10M10 17h10\"/><circle cx=\"5\" cy=\"7\" r=\".9\"/><circle cx=\"5\" cy=\"12\" r=\".9\"/><circle cx=\"5\" cy=\"17\" r=\".9\"/>",
	"list-ordered": "<path d=\"M11 7h9M11 12h9M11 17h9\"/><path d=\"M4.5 5.5 6 4.8V9.5M4.5 15.2c.4-.5 2.4-.7 2.2.6-.2.9-2.2 1.9-2.2 2.7h2.4\"/>",
	"list-todo": "<rect x=\"3.5\" y=\"4.5\" width=\"6\" height=\"6\" rx=\"1.2\"/><path d=\"m4.8 15.8 1.6 1.6 3-3.2M13 7.5h7.5M13 16h7.5\"/>",
	quote: "<path d=\"M5 18c2.8-1.2 4-3.4 4-6.5V7H5v5h3M14 18c2.8-1.2 4-3.4 4-6.5V7h-4v5h3\"/>",
	"panel-left": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M9.5 4v16\"/>",
	close: "<path d=\"M7 7l10 10M17 7 7 17\"/>",
	edit: "<path d=\"M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z\"/>",
	trash: "<path d=\"M4 6.5h16M9.5 6.5V4.5h5v2\"/><path d=\"M6.5 6.5l1 13a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-13\"/><path d=\"M10 10.5v6.5M14 10.5v6.5\"/>",
	calendar: "<rect x=\"4\" y=\"5.5\" width=\"16\" height=\"14.5\" rx=\"2\"/><path d=\"M4 10h16M8.5 3.5v4M15.5 3.5v4\"/>",
	flag: "<path d=\"M5.5 21V4.5M5.5 4.5h11l-2.5 4 2.5 4h-11\"/>",
	repeat: "<path d=\"M17 3.5 20 6.5 17 9.5\"/><path d=\"M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5 4 17.5 7 14.5\"/><path d=\"M20 12.5v1a4 4 0 0 1-4 4H4\"/>",
	"chevrons-up": "<path d=\"m7 11.5 5-5 5 5M7 17.5l5-5 5 5\"/>",
	"chevrons-down": "<path d=\"m7 6.5 5 5 5-5M7 12.5l5 5 5-5\"/>",
	return: "<path d=\"M19 5.5v6a3 3 0 0 1-3 3H5.5\"/><path d=\"m9 10.5-4 4 4 4\"/>",
	hash: "<path d=\"M4 9h16M4 15h16M10 3 8 21M16 3l-2 18\"/>",
	sigma: "<path d=\"M18 7V4.5H6l6 7.5-6 7.5h12V17\"/>",
	check: "<path d=\"m5 12.5 4.5 4.5L19 7.5\"/>",
	circle: "<circle cx=\"12\" cy=\"12\" r=\"7.5\"/>",
	settings: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z\"/>",
	git: "<circle cx=\"6\" cy=\"6\" r=\"2.5\"/><circle cx=\"6\" cy=\"18\" r=\"2.5\"/><circle cx=\"18\" cy=\"8\" r=\"2.5\"/><path d=\"M6 8.5v7M18 10.5c0 4-6 3-10.5 6\"/>",
	"panel-bottom": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M3 14.5h18\"/>",
	"panel-right": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M14.5 4v16\"/>",
	outline: "<path d=\"M4 6h16M8 11h12M8 16h12M4 11h.01M4 16h.01\"/>",
	film: "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M7 3v18M17 3v18M3 12h18M3 7.5h4M3 16.5h4M17 7.5h4M17 16.5h4\"/>",
	headphones: "<path d=\"M3 18v-6a9 9 0 0 1 18 0v6\"/><path d=\"M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z\"/>",
	library: "<path d=\"M5 4.5h3.5v15H5zM10.5 4.5H14v15h-3.5z\"/><path d=\"m16 5.2 3.3-.9 3.2 14.6-3.3.9z\"/>",
	scissors: "<circle cx=\"6\" cy=\"6\" r=\"2.6\"/><circle cx=\"6\" cy=\"18\" r=\"2.6\"/><path d=\"M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12\"/>",
	clipboard: "<rect x=\"5\" y=\"5\" width=\"14\" height=\"16\" rx=\"2\"/><rect x=\"9\" y=\"3\" width=\"6\" height=\"4\" rx=\"1\"/>",
	"select-all": "<path d=\"M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M21 19a2 2 0 0 1-2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h1M14 3h1M14 21h1M3 9v1M21 9v1M3 14v1M21 14v1\"/><rect x=\"8\" y=\"8\" width=\"8\" height=\"8\" rx=\"1\"/>",
	copy: "<rect x=\"8.5\" y=\"8.5\" width=\"11.5\" height=\"11.5\" rx=\"2.2\"/><path d=\"M15.5 8.5V6A2 2 0 0 0 13.5 4h-7.5A2 2 0 0 0 4 6v7.5a2 2 0 0 0 2 2h2.5\"/>",
	link: "<path d=\"M10 14a4.5 4.5 0 0 0 6.4 0l3-3A4.5 4.5 0 0 0 13 4.6l-1 1\"/><path d=\"M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1-1\"/>",
	grid: "<rect x=\"4\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.5\"/><rect x=\"13.5\" y=\"4\" width=\"6.5\" height=\"6.5\" rx=\"1.5\"/><rect x=\"4\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.5\"/><rect x=\"13.5\" y=\"13.5\" width=\"6.5\" height=\"6.5\" rx=\"1.5\"/>",
	rows: "<path d=\"M8.5 6h11.5M8.5 12h11.5M8.5 18h11.5\"/><circle cx=\"4.5\" cy=\"6\" r=\".9\"/><circle cx=\"4.5\" cy=\"12\" r=\".9\"/><circle cx=\"4.5\" cy=\"18\" r=\".9\"/>",
	table: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2.5\"/><path d=\"M3 9.5h18M3 15h18M9.5 9.5V20\"/>",
	chart: "<path d=\"M3.5 3.5v17h17\"/><path d=\"m7 15 4-5 3.5 3L20 6.5\"/>",
	"chevron-down": "<path d=\"m6 9 6 6 6-6\"/>",
	commit: "<circle cx=\"12\" cy=\"12\" r=\"3.5\"/><path d=\"M3 12h5.5M15.5 12H21\"/>",
	clock: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/>",
	sun: "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4\"/>",
	eye: "<path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
	moon: "<path d=\"M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z\"/>",
	plus: "<path d=\"M12 5v14M5 12h14\"/>",
	minus: "<path d=\"M5 12h14\"/>",
	more: "<circle cx=\"12\" cy=\"5.5\" r=\"0.9\"/><circle cx=\"12\" cy=\"12\" r=\"0.9\"/><circle cx=\"12\" cy=\"18.5\" r=\"0.9\"/>",
	refresh: "<path d=\"M20 11.5A8 8 0 0 0 6 6.6L4 8.5M4 4v4.5h4.5M4 12.5A8 8 0 0 0 18 17.4l2-1.9M20 20v-4.5h-4.5\"/>",
	zoom: "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"m20 20-4.3-4.3M8.5 11h5M11 8.5v5\"/>",
	contents: "<path d=\"M9 6h11M9 12h11M9 18h11\"/><circle cx=\"4.5\" cy=\"6\" r=\"1\"/><circle cx=\"4.5\" cy=\"12\" r=\"1\"/><circle cx=\"4.5\" cy=\"18\" r=\"1\"/>",
	pages: "<rect x=\"7\" y=\"3\" width=\"13\" height=\"15\" rx=\"2\"/><path d=\"M4 7v11.5A2.5 2.5 0 0 0 6.5 21H16\"/>",
	bookmark: "<path d=\"M18 21l-6-4-6 4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z\"/>",
	notes: "<path d=\"M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z\"/><path d=\"M15 3v4a2 2 0 0 0 2 2h4M7.5 13h7M7.5 17h4\"/>",
	text: "<path d=\"M6 4h12\"/><path d=\"M12 4v16\"/>",
	underline: "<path d=\"M6.5 4v6a5.5 5.5 0 0 0 11 0V4\"/><path d=\"M4.5 20.5h15\"/>",
	strike: "<path d=\"M16 5.5c-.8-1.3-2.3-2-4.2-2-2.6 0-4.3 1.4-4.3 3.3 0 1.4.8 2.4 2.5 3.2\"/><path d=\"M8 17.5c.8 1.6 2.3 2.5 4.3 2.5 2.7 0 4.5-1.5 4.5-3.6 0-.9-.3-1.7-1-2.4\"/><path d=\"M3.5 12h17\"/>",
	sticky: "<path d=\"M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z\"/><path d=\"M15 3v6h6\"/>",
	crop: "<path d=\"M6 2.5V16a2 2 0 0 0 2 2h13.5\"/><path d=\"M18 21.5V8a2 2 0 0 0-2-2H2.5\"/>",
	stamp: "<path d=\"m12 2.5 2.9 5.9 6.6 1-4.8 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5-4.8-4.6 6.6-1z\"/>"
}, Ea = (e) => Object.hasOwn(Ta, e);
function Da(e, t = 16) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Ta[e]}</svg>`;
}
// ui/src/components/Icon.svelte
var Oa = /* @__PURE__ */ q("<span class=\"icon svelte-1yrfdk4\"></span>"), ka = {
	hash: "svelte-1yrfdk4",
	code: "\n  /* sized by the interface's scale (Settings → font size, a tab's zoom), as the text beside it */.icon.svelte-1yrfdk4 {display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:0;}.icon.svelte-1yrfdk4 svg {width:100%;height:100%;}"
};
function Aa(e, t) {
	We(t, !0), ri(e, ka);
	let n = qi(t, "size", 3, 16);
	var r = Oa();
	let i;
	ni(r, () => Da(t.name, n()), !0), k(r), V(() => i = hi(r, "", i, {
		width: `calc(${n() ?? ""}px * var(--ui-scale, 1))`,
		height: `calc(${n() ?? ""}px * var(--ui-scale, 1))`
	})), J(e, r), Ge();
}
// plugins/beta/catalog/ui/src/Icon.svelte
function ja(e, t) {
	We(t, !0);
	let n = qi(t, "size", 3, 16);
	{
		let r = /* @__PURE__ */ N(() => Ea(t.name) ? t.name : "library");
		Aa(e, {
			get name() {
				return G(r);
			},
			get size() {
				return n();
			}
		});
	}
	Ge();
}
// plugins/beta/catalog/ui/src/LibraryCover.svelte
var Ma = /* @__PURE__ */ q("<img alt=\"\"/>"), Na = /* @__PURE__ */ q("<div aria-hidden=\"true\"> </div>"), Pa = /* @__PURE__ */ q("<div><!></div>"), Fa = {
	hash: "svelte-enia8e",
	code: ".cover.svelte-enia8e {width:100%;aspect-ratio:2 / 3;object-fit:cover;border-radius:var(--radius-sm);background:var(--bg-alt);box-shadow:var(--shadow-sm);}.cover.big.svelte-enia8e {aspect-ratio:auto;max-height:280px;width:auto;max-width:100%;margin-bottom:10px;}.tile.svelte-enia8e {display:grid;place-items:center;font-size:2.2em;font-weight:600;box-shadow:none;background:hsl(var(--hue) 32% 50% / .22);color:hsl(var(--hue) 40% 42%);} /* literal: a hue per title */\n  /* the panel's: a tile its column's width while the picture is missing or on its way, not a blank column */.tile.big.svelte-enia8e {aspect-ratio:2 / 3;width:100%;max-height:240px;font-size:3em;}.wrap.svelte-enia8e {width:100%;min-height:1px;}"
};
function Ia(e, t) {
	We(t, !0), ri(e, Fa);
	let n = qi(t, "big", 3, !1), r = /* @__PURE__ */ F(null), i = /* @__PURE__ */ F(void 0);
	async function a(e) {
		let r = typeof e == "function" ? await e() : e;
		return r ? /^(https?:|data:|blob:)/i.test(r) ? r : t.atlas.thumbUrl(r.replace(/^!?\[\[|\]\]$/g, "").split("|")[0], n() ? 520 : 260) : null;
	}
	vn(() => {
		let e = t.cover, n = G(i);
		if (!n) return;
		let o = !0;
		I(r, null);
		let s = new IntersectionObserver((t) => {
			t.some((e) => e.isIntersecting) && (s.disconnect(), a(e).then((e) => {
				o && I(r, e, !0);
			}, () => {}));
		}, { rootMargin: "400px" });
		return s.observe(n), () => {
			o = !1, s.disconnect();
		};
	});
	let o = /* @__PURE__ */ N(() => t.title.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "?"), s = /* @__PURE__ */ N(() => [...t.title].reduce((e, t) => (e * 31 + t.charCodeAt(0)) % 360, 7));
	var c = Pa();
	let l;
	var u = R(c), d = (e) => {
		var t = Ma();
		let i;
		V(() => {
			i = Q(t, 1, "cover svelte-enia8e", null, i, { big: n() }), $(t, "src", G(r));
		}), J(e, t);
	}, f = (e) => {
		var t = Na();
		let r, i;
		var a = z(t, !0);
		V(() => {
			r = Q(t, 1, "cover tile svelte-enia8e", null, r, { big: n() }), i = hi(t, "", i, { "--hue": G(s) }), Y(a, G(o));
		}), J(e, t);
	};
	X(u, (e) => {
		G(r) ? e(d) : e(f, -1);
	}), k(c), Wi(c, (e) => I(i, e), () => G(i)), V(() => l = Q(c, 1, "wrap svelte-enia8e", null, l, { big: n() })), J(e, c), Ge();
}
// plugins/beta/catalog/ui/src/Library.svelte
var La = /* @__PURE__ */ q("<button><!> </button>"), Ra = /* @__PURE__ */ q("<div class=\"drop-hint svelte-7gk24t\"> </div>"), za = /* @__PURE__ */ q("<button role=\"radio\"> </button>"), Ba = /* @__PURE__ */ q("<div class=\"seg svelte-7gk24t\" role=\"radiogroup\" aria-label=\"Layout\"></div>"), Va = /* @__PURE__ */ q("<button class=\"btn home svelte-7gk24t\"><!> <!></button>"), Ha = /* @__PURE__ */ q("<form class=\"add svelte-7gk24t\"><input spellcheck=\"false\" class=\"svelte-7gk24t\"/> <button class=\"btn primary svelte-7gk24t\"> </button></form>"), Ua = /* @__PURE__ */ q("<button> <span class=\"c svelte-7gk24t\"> </span></button>"), Wa = /* @__PURE__ */ q("<div class=\"types svelte-7gk24t\" role=\"toolbar\" aria-label=\"Type\"><button>All <span class=\"c svelte-7gk24t\"> </span></button> <!></div>"), Ga = /* @__PURE__ */ q("<button class=\"btn primary svelte-7gk24t\"> </button>"), Ka = /* @__PURE__ */ q("<p class=\"muted pad svelte-7gk24t\"> <!></p>"), qa = /* @__PURE__ */ q("<span class=\"bar svelte-7gk24t\"></span>"), Ja = /* @__PURE__ */ q("<button class=\"go svelte-7gk24t\"><!> <span class=\"t svelte-7gk24t\"></span> <!></button>"), Ya = /* @__PURE__ */ q("<section class=\"continue svelte-7gk24t\" aria-label=\"Continue\"><h4 class=\"svelte-7gk24t\">Continue</h4> <div class=\"strip svelte-7gk24t\"></div></section>"), Xa = /* @__PURE__ */ q("<button class=\"twisty svelte-7gk24t\"><!></button>"), Za = /* @__PURE__ */ q("<span class=\"twisty svelte-7gk24t\"></span>"), Qa = /* @__PURE__ */ q("<div class=\"tree-row svelte-7gk24t\"><!> <button><!><span class=\"n svelte-7gk24t\"> </span><span class=\"c svelte-7gk24t\"> </span></button></div>"), $a = /* @__PURE__ */ q("<button><!><span class=\"n svelte-7gk24t\"> </span><span class=\"c svelte-7gk24t\"> </span></button>"), eo = /* @__PURE__ */ q("<h4 class=\"svelte-7gk24t\"> </h4> <!>", 1), to = /* @__PURE__ */ q("<button><span class=\"hash svelte-7gk24t\">#</span><span class=\"n svelte-7gk24t\"> </span><span class=\"c svelte-7gk24t\"> </span></button>"), no = /* @__PURE__ */ q("<button class=\"h4 svelte-7gk24t\"><!>Tags <span class=\"c svelte-7gk24t\"> </span></button> <!>", 1), ro = /* @__PURE__ */ q("<nav class=\"side svelte-7gk24t\"><button><!><span class=\"n svelte-7gk24t\"> </span><span class=\"c svelte-7gk24t\"> </span></button> <!> <!></nav>"), io = /* @__PURE__ */ q("<button class=\"btn from-home svelte-7gk24t\"> <!></button>"), ao = /* @__PURE__ */ q("<div class=\"from-head svelte-7gk24t\" role=\"heading\" aria-level=\"3\"><!><span class=\"fh svelte-7gk24t\"> </span> <span class=\"fc svelte-7gk24t\"> </span> <!></div>"), oo = /* @__PURE__ */ q("<span class=\"m svelte-7gk24t\"> </span>"), so = /* @__PURE__ */ q("<button><!> <!> <span class=\"t svelte-7gk24t\"></span> <!></button>"), co = /* @__PURE__ */ q("<span> </span>"), lo = /* @__PURE__ */ q("<span class=\"flags svelte-7gk24t\"></span>"), uo = /* @__PURE__ */ q("<button><span class=\"t svelte-7gk24t\"></span> <!> <!> <!></button>"), fo = /* @__PURE__ */ q("<!> <!>", 1), po = /* @__PURE__ */ q("<p class=\"muted pad none svelte-7gk24t\"> <!></p>"), mo = /* @__PURE__ */ q("<li class=\"svelte-7gk24t\"></li>"), ho = /* @__PURE__ */ q("<li class=\"muted svelte-7gk24t\"> </li>"), go = /* @__PURE__ */ q("<aside class=\"detail many svelte-7gk24t\" aria-label=\"Picked\"><div class=\"kind svelte-7gk24t\"> </div> <ul class=\"picked svelte-7gk24t\"><!><!></ul> <div class=\"actions svelte-7gk24t\"><!><button class=\"btn svelte-7gk24t\">Clear</button></div></aside>"), _o = /* @__PURE__ */ q("<button class=\"scrim svelte-7gk24t\" aria-label=\"Close\"></button>"), vo = /* @__PURE__ */ q("<button class=\"close icon-btn svelte-7gk24t\" aria-label=\"Close\" title=\"Close\"><!></button>"), yo = /* @__PURE__ */ q("<span class=\"hint svelte-7gk24t\"> </span>"), bo = /* @__PURE__ */ q("<textarea class=\"svelte-7gk24t\"></textarea>"), xo = /* @__PURE__ */ q("<input class=\"svelte-7gk24t\"/>"), So = /* @__PURE__ */ q("<label> <!> <!></label>"), Co = /* @__PURE__ */ q("<form class=\"edit svelte-7gk24t\"><!> <div class=\"actions svelte-7gk24t\"><button class=\"btn primary svelte-7gk24t\">Save</button><button type=\"button\" class=\"btn svelte-7gk24t\">Cancel</button></div></form>"), wo = /* @__PURE__ */ q("<div class=\"kind svelte-7gk24t\"> </div>"), To = /* @__PURE__ */ q("<p> </p>"), Eo = /* @__PURE__ */ q("<button class=\"btn svelte-7gk24t\" aria-label=\"More\"><!></button>"), Do = /* @__PURE__ */ q("<div class=\"facts-pic svelte-7gk24t\"><!></div>"), Oo = /* @__PURE__ */ q("<dt class=\"svelte-7gk24t\"> </dt><dd class=\"svelte-7gk24t\"> </dd>", 1), ko = /* @__PURE__ */ q("<dl class=\"svelte-7gk24t\"></dl>"), Ao = /* @__PURE__ */ q("<div><!> <!></div>"), jo = /* @__PURE__ */ q("<div class=\"choice svelte-7gk24t\" role=\"radiogroup\"><span class=\"svelte-7gk24t\"> </span> <!></div>"), Mo = /* @__PURE__ */ q("<a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-7gk24t\"><!> </a>"), No = /* @__PURE__ */ q("<div class=\"links svelte-7gk24t\"></div>"), Po = /* @__PURE__ */ q("<button class=\"tag coll svelte-7gk24t\"><!> </button>"), Fo = /* @__PURE__ */ q("<button class=\"tag svelte-7gk24t\"> </button>"), Io = /* @__PURE__ */ q("<div class=\"tags svelte-7gk24t\"><!> <!></div>"), Lo = /* @__PURE__ */ q("<h3 class=\"svelte-7gk24t\"> </h3><p class=\"abstract svelte-7gk24t\"> </p>", 1), Ro = /* @__PURE__ */ q("<h3 class=\"svelte-7gk24t\">Your notes</h3><p class=\"abstract own svelte-7gk24t\"> </p><button class=\"atlas-btn more-notes svelte-7gk24t\">Open the notes</button>", 1), zo = /* @__PURE__ */ q("<div></div>"), Bo = /* @__PURE__ */ q("<div class=\"links-bar svelte-7gk24t\"><!></div>"), Vo = /* @__PURE__ */ q("<!> <aside class=\"detail svelte-7gk24t\"><!> <!> <!> <h2 class=\"svelte-7gk24t\"></h2> <!> <div class=\"actions svelte-7gk24t\"><!> <!></div> <!> <!> <!> <!> <!> <!> <!></aside>", 1), Ho = /* @__PURE__ */ q("<aside class=\"detail none svelte-7gk24t\" aria-label=\"Details\"><p> <span class=\"keys-only\"><br/>↑ ↓ move, Enter opens.</span></p></aside>"), Uo = /* @__PURE__ */ q("<div tabindex=\"0\" role=\"application\"><!> <header class=\"svelte-7gk24t\"><h1 class=\"svelte-7gk24t\"><!> <span class=\"count svelte-7gk24t\"> </span></h1> <input class=\"search svelte-7gk24t\" spellcheck=\"false\"/> <!> <!> <!> <!> <!></header> <!> <!> <!> <div><!> <div></div> <!></div></div>"), Wo = {
	hash: "svelte-7gk24t",
	code: ".types.svelte-7gk24t {display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 10px;}.chip.svelte-7gk24t {display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--border);color:var(--text-muted);font-size:calc(12.5px * var(--ui-scale, 1));}.chip.svelte-7gk24t:hover {background:var(--bg-hover);color:var(--text);}.chip.on.svelte-7gk24t {background:var(--accent-soft);border-color:color-mix(in srgb, var(--accent) 45%, transparent);color:var(--accent);}.chip.svelte-7gk24t .c:where(.svelte-7gk24t) {color:var(--text-faint);font-variant-numeric:tabular-nums;}.library.svelte-7gk24t {height:100%;display:flex;flex-direction:column;background:var(--bg);outline:none;position:relative;}.library.dragging.svelte-7gk24t {box-shadow:inset 0 0 0 2px var(--accent);}.drop-hint.svelte-7gk24t {position:absolute;inset:0;z-index:5;display:grid;place-items:center;pointer-events:none;background:color-mix(in srgb, var(--bg) 70%, transparent);color:var(--accent);font-size:calc(16px * var(--ui-scale, 1));font-weight:600;}header.svelte-7gk24t {display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--border);}h1.svelte-7gk24t {display:inline-flex;gap:8px;align-items:center;margin:0 8px 0 0;font-size:calc(17px * var(--ui-scale, 1));color:var(--heading);}.count.svelte-7gk24t {font-size:.7em;font-weight:500;color:var(--text-faint);}input.svelte-7gk24t {font:inherit;font-size:calc(13px * var(--ui-scale, 1));color:var(--text);background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 9px;}input.svelte-7gk24t:focus {outline:none;border-color:var(--accent);}.search.svelte-7gk24t {flex:1;min-width:220px;}.add.svelte-7gk24t {display:flex;gap:6px;}.add.svelte-7gk24t input:where(.svelte-7gk24t) {width:270px;} /* the placeholder whole (clipped text is a bug) */.seg.svelte-7gk24t {display:inline-flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;}.seg.svelte-7gk24t button:where(.svelte-7gk24t) {padding:4px 10px;color:var(--text-muted);}.seg.svelte-7gk24t button.on:where(.svelte-7gk24t) {background:var(--accent-soft);color:var(--accent);}.btn.svelte-7gk24t {display:inline-flex;gap:6px;align-items:center;border:1px solid var(--border-strong);}.btn.svelte-7gk24t:hover:not(:disabled) {background:var(--bg-hover);}.btn.svelte-7gk24t:disabled {opacity:.45;cursor:default;}.btn.danger.svelte-7gk24t {color:var(--red);}.edit.svelte-7gk24t {display:grid;grid-template-columns:1fr 2fr;gap:8px;margin:0 0 14px;padding:12px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--bg-alt);}.edit.svelte-7gk24t label:where(.svelte-7gk24t) {grid-column:1 / -1;display:flex;flex-direction:column;gap:3px;color:var(--text-muted);font-size:calc(12px * var(--ui-scale, 1));}.edit.svelte-7gk24t label.half:where(.svelte-7gk24t) {grid-column:auto;}.edit.svelte-7gk24t .actions:where(.svelte-7gk24t) {grid-column:1 / -1;}.edit.svelte-7gk24t textarea:where(.svelte-7gk24t) {font:inherit;font-size:calc(13px * var(--ui-scale, 1));color:var(--text);background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 9px;resize:vertical;}.hint.svelte-7gk24t {color:var(--text-faint);font-weight:400;}.body.svelte-7gk24t {flex:1;min-height:0;display:grid;grid-template-columns:210px minmax(300px, 1.15fr) minmax(280px, 1fr);}.body.bare.svelte-7gk24t {grid-template-columns:minmax(300px, 1.4fr) minmax(280px, 1fr);}.list.empty-list.svelte-7gk24t {grid-column:span 2;} /* nothing to list: its words get the detail's column too */.detail.none.svelte-7gk24t {display:grid;place-content:center;text-align:center;color:var(--text-faint);}.side.svelte-7gk24t {overflow:auto;border-right:1px solid var(--border);padding:8px 6px;background:var(--bg-alt);display:flex;flex-direction:column;gap:1px;}.side.svelte-7gk24t h4:where(.svelte-7gk24t), .side.svelte-7gk24t .h4:where(.svelte-7gk24t) {display:flex;align-items:center;gap:4px;margin:12px 8px 4px;padding:0;font-size:calc(10.5px * var(--ui-scale, 1));font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);text-align:left;}.side.svelte-7gk24t .h4:where(.svelte-7gk24t):hover {color:var(--text);}.item.svelte-7gk24t {display:flex;align-items:center;gap:7px;width:100%;padding:4px 8px;border-radius:var(--radius-sm);color:var(--text);text-align:left;font-size:calc(12.5px * var(--ui-scale, 1));}.item.svelte-7gk24t:hover {background:var(--bg-hover);}.item.on.svelte-7gk24t {background:var(--accent-soft);color:var(--heading);box-shadow:inset 2px 0 0 var(--accent);}.item.drop.svelte-7gk24t {outline:2px dashed var(--accent);outline-offset:-2px;background:var(--accent-soft);}.item.svelte-7gk24t .n:where(.svelte-7gk24t) {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.c.svelte-7gk24t {color:var(--text-faint);font-size:.85em;font-variant-numeric:tabular-nums;}.hash.svelte-7gk24t {color:var(--text-faint);width:14px;text-align:center;}.tagitem.svelte-7gk24t {color:var(--text-muted);}.tag.coll.svelte-7gk24t {display:inline-flex;gap:4px;align-items:center;color:var(--text);}.list.svelte-7gk24t {overflow:hidden auto; /* the grid wraps: a horizontal offset only ever hid the first column */border-right:1px solid var(--border);padding:6px;position:relative;user-select:none;-webkit-user-select:none;}.list.svelte-7gk24t .marquee {position:absolute;z-index:2;pointer-events:none;border:1px solid var(--accent);background:color-mix(in srgb, var(--accent) 12%, transparent);border-radius:2px;}.tree-row.svelte-7gk24t {display:flex;align-items:center;min-width:0;}.tree-row.svelte-7gk24t .item:where(.svelte-7gk24t) {flex:1;min-width:0;}.twisty.svelte-7gk24t {flex:none;width:16px;height:22px;display:grid;place-items:center;color:var(--text-faint);padding:0;}.twisty.svelte-7gk24t:hover {color:var(--text);}.picked.svelte-7gk24t {margin:8px 0 12px;padding-left:18px;font-size:.9em;color:var(--text-muted);}.picked.svelte-7gk24t li:where(.svelte-7gk24t) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.list.covers.svelte-7gk24t {display:grid;grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));gap:16px 14px;align-content:start;padding:14px;}\n  /* a service's things, apart from the vault's: a band across the list with the way into the service's own app */.from-head.svelte-7gk24t {grid-column:1 / -1;display:flex;align-items:center;gap:8px;margin:14px 0 2px;padding:8px 10px;border-radius:var(--radius-sm);background:var(--bg-alt);border:1px solid var(--border);color:var(--text-muted);font-size:calc(12px * var(--ui-scale, 1));}.from-head.svelte-7gk24t:first-child {margin-top:0;}.from-head.svelte-7gk24t .fh:where(.svelte-7gk24t) {font-weight:600;letter-spacing:.02em;color:var(--heading);}.from-head.svelte-7gk24t .fc:where(.svelte-7gk24t) {color:var(--text-faint);font-variant-numeric:tabular-nums;}.home.svelte-7gk24t {display:inline-flex;align-items:center;gap:6px;}.from-home.svelte-7gk24t {margin-left:auto;display:inline-flex;align-items:center;gap:5px;}.mine-none.svelte-7gk24t {grid-column:1 / -1;margin:4px 2px 0;color:var(--text-muted);}.row.svelte-7gk24t {display:grid;grid-template-columns:minmax(0, 1fr) auto;gap:2px 10px;width:100%;text-align:left;padding:8px 10px;border-radius:var(--radius-sm);}.row.svelte-7gk24t:hover {background:var(--bg-hover);}.row.sel.svelte-7gk24t {background:var(--accent-soft);box-shadow:inset 2px 0 0 var(--accent);}.card.svelte-7gk24t {display:flex;flex-direction:column;gap:4px;text-align:left;padding:4px;border-radius:var(--radius-sm);min-width:0;}\n  /* a library of thousands: items out of view are not laid out or painted (still in the page, for the marquee and keys) */.row.svelte-7gk24t {content-visibility:auto;contain-intrinsic-size:auto 52px;}\n  /* never a card: its height (a cover's 2:3 at the column's width, then two lines) is not one number, and WebKit kept\n     the guessed one for cards laid out again after the pane came back (titles drawn over the covers); covers already\n     load only near the view (LibraryCover) */.card.svelte-7gk24t:hover {background:var(--bg-hover);}.card.sel.svelte-7gk24t {background:var(--accent-soft);box-shadow:0 0 0 2px var(--accent);}.card.svelte-7gk24t .t:where(.svelte-7gk24t) {font-size:.92em;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;}.card.svelte-7gk24t .m:where(.svelte-7gk24t) {font-size:.8em;}.t.svelte-7gk24t {grid-column:1;color:var(--heading);font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.m.svelte-7gk24t {grid-column:1;color:var(--text-muted);font-size:.9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n  /* how far along: a thin bar, the done part in the accent */.bar.svelte-7gk24t {display:block;height:3px;border-radius:2px;background:linear-gradient(to right, var(--accent) calc(var(--p) * 100%), var(--border) 0);}.row.svelte-7gk24t .bar:where(.svelte-7gk24t) {grid-column:1 / -1;margin-top:3px;}.continue.svelte-7gk24t {flex:none;padding:8px 16px 10px;border-bottom:1px solid var(--border);}.continue.svelte-7gk24t h4:where(.svelte-7gk24t) {margin:0 0 6px;font-size:calc(10.5px * var(--ui-scale, 1));font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);}.strip.svelte-7gk24t {display:flex;gap:12px;overflow-x:auto;scrollbar-width:thin;padding-bottom:2px;}.go.svelte-7gk24t {flex:none;width:104px;display:flex;flex-direction:column;gap:4px;padding:3px;border-radius:var(--radius-sm);text-align:left;}.go.svelte-7gk24t:hover {background:var(--bg-hover);}.go.svelte-7gk24t .t:where(.svelte-7gk24t) {font-size:.82em;font-weight:500;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;}.narrow.svelte-7gk24t .continue:where(.svelte-7gk24t) {padding:6px 12px 8px;}.flags.svelte-7gk24t {grid-column:2;grid-row:1 / span 2;display:flex;gap:4px;align-items:center;}.flag.svelte-7gk24t {font-size:calc(11px * var(--ui-scale, 1));padding:1px 6px;border-radius:999px;background:var(--bg-hover);color:var(--text-muted);}.flag.red.svelte-7gk24t {color:var(--red);background:color-mix(in srgb, var(--red) 14%, transparent);}\n  /* a column; the linked mentions follow the item (at the bottom of a short card they stood apart, the column blank) */.detail.svelte-7gk24t {overflow:auto;padding:18px 22px 40px;display:flex;flex-direction:column;container-type:inline-size;}.detail.svelte-7gk24t > * {flex-shrink:0;}.facts.svelte-7gk24t {display:grid;gap:14px;margin:8px 0 4px;}\n  /* the picture a fixed, modest width: the fields get the rest (beside a 42 % picture they broke letter by letter) */.facts.pic.svelte-7gk24t {grid-template-columns:120px minmax(0, 1fr);align-items:start;}.facts-pic.svelte-7gk24t .cover.big {width:120px;}.facts-pic.svelte-7gk24t .cover.big {max-height:240px;margin:0;}.facts.svelte-7gk24t dl:where(.svelte-7gk24t) {margin:0;}.narrow.svelte-7gk24t .facts.pic:where(.svelte-7gk24t) {grid-template-columns:96px minmax(0, 1fr);}\n  /* a narrow panel (the usual ~300 px column): the picture on its own line, the fields the panel's whole width —\n     beside it the values broke inside words */\n  @container (max-width: 460px) {.facts.pic.svelte-7gk24t {grid-template-columns:minmax(0, 1fr);}.facts-pic.svelte-7gk24t .cover.big {width:auto;max-width:140px;max-height:190px;}\n  }\n  /* the mentions follow the item, open (an item's panel is where they matter), never pinned under an empty column */.links-bar.svelte-7gk24t {margin:22px -22px 0;padding-top:4px;display:flex;flex-direction:column;}\n  /* folded, the bar alone would stand mid-column over blank space: it goes to the column's foot instead; open, the\n     mentions follow the item and take the rest of the column (no third of it, as under a note) */.links-bar.svelte-7gk24t:has(.backlinks:not(.open)) {margin-top:auto;}.links-bar.svelte-7gk24t .backlinks.open {max-height:none;}.abstract.own.svelte-7gk24t {white-space:pre-line;}.more-notes.svelte-7gk24t {align-self:flex-start;margin-top:4px;}.kind.svelte-7gk24t {text-transform:uppercase;letter-spacing:.07em;font-size:calc(11px * var(--ui-scale, 1));color:var(--text-faint);}h2.svelte-7gk24t {margin:4px 0 6px;font-size:calc(19px * var(--ui-scale, 1));color:var(--heading);line-height:1.3;}.authors.svelte-7gk24t {margin:0;color:var(--text);}.venue.svelte-7gk24t {margin:2px 0 0;color:var(--text-muted);font-style:italic;}dl.svelte-7gk24t {display:grid;grid-template-columns:max-content minmax(0, 1fr);gap:3px 12px;font-size:.9em;margin:10px 0;}dt.svelte-7gk24t {color:var(--text-faint);}dd.svelte-7gk24t {margin:0;overflow-wrap:anywhere;}.actions.svelte-7gk24t {display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 8px;}.choice.svelte-7gk24t {display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0 10px;}.choice.svelte-7gk24t span:where(.svelte-7gk24t) {color:var(--text-faint);font-size:.85em;margin-right:2px;}.links.svelte-7gk24t {display:flex;flex-wrap:wrap;gap:14px;margin:6px 0;}.links.svelte-7gk24t a:where(.svelte-7gk24t) {display:inline-flex;gap:5px;align-items:center;color:var(--link, var(--accent));text-decoration:none;font-size:.92em;}.links.svelte-7gk24t a:where(.svelte-7gk24t):hover {text-decoration:underline;}.tags.svelte-7gk24t {display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;}.tag.svelte-7gk24t {font-size:calc(11.5px * var(--ui-scale, 1));padding:2px 9px;border-radius:999px;border:1px solid var(--border-strong);color:var(--text-muted);}.tag.svelte-7gk24t:hover {color:var(--text);border-color:var(--accent);}h3.svelte-7gk24t {margin:18px 0 6px;font-size:calc(11px * var(--ui-scale, 1));text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);}.abstract.svelte-7gk24t {margin:0;line-height:1.6;color:var(--text);}.pad.svelte-7gk24t {padding:12px 16px;}\n  /* the covers are a grid: the \"nothing here\" line spans all its columns (on a phone it sat in one, a word a line) */.list.svelte-7gk24t .none:where(.svelte-7gk24t) {grid-column:1 / -1;} /* only the list's: the detail's empty column must stay in its own column */\n\n  /* narrow: one column; groups as a row of chips; the card as a sheet over the list */.narrow.svelte-7gk24t header:where(.svelte-7gk24t) {padding:10px 12px;gap:8px;}.narrow.svelte-7gk24t .search:where(.svelte-7gk24t) {flex:1 1 100%;min-width:0;order:1;}.narrow.svelte-7gk24t .add:where(.svelte-7gk24t) {flex:1 1 100%;order:2;}.narrow.svelte-7gk24t .add:where(.svelte-7gk24t) input:where(.svelte-7gk24t) {flex:1;width:auto;min-width:0;}.narrow.svelte-7gk24t .types:where(.svelte-7gk24t) {padding:0 12px 8px;flex-wrap:nowrap;overflow-x:auto;}.narrow.svelte-7gk24t .body:where(.svelte-7gk24t), .narrow.svelte-7gk24t .body.bare:where(.svelte-7gk24t) {display:flex;flex-direction:column;}.narrow.svelte-7gk24t .side:where(.svelte-7gk24t) {flex:none;flex-direction:row;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid var(--border);padding:6px 12px;}.narrow.svelte-7gk24t .side:where(.svelte-7gk24t) h4:where(.svelte-7gk24t), .narrow.svelte-7gk24t .side:where(.svelte-7gk24t) .h4:where(.svelte-7gk24t) {margin:0 2px 0 6px;flex:none;}.narrow.svelte-7gk24t .side:where(.svelte-7gk24t) .item:where(.svelte-7gk24t) {width:auto;flex:none;max-width:70vw;padding:5px 10px;border-radius:999px;border:1px solid var(--border);}.narrow.svelte-7gk24t .side:where(.svelte-7gk24t) .item.on:where(.svelte-7gk24t) {box-shadow:none;border-color:color-mix(in srgb, var(--accent) 45%, transparent);}.narrow.svelte-7gk24t .list:where(.svelte-7gk24t) {flex:1;border-right:0;}.narrow.svelte-7gk24t .list.covers:where(.svelte-7gk24t) {grid-template-columns:repeat(auto-fill, minmax(104px, 1fr));gap:12px 10px;padding:10px 12px;}.scrim.svelte-7gk24t {position:absolute;inset:0;z-index:6;background:var(--scrim);border:0;padding:0;cursor:default;}.narrow.svelte-7gk24t .detail:where(.svelte-7gk24t) {position:absolute;left:0;right:0;bottom:0;z-index:7;max-height:80%;padding:18px 16px calc(24px + env(safe-area-inset-bottom, 0px));background:var(--bg-elev);border-top:1px solid var(--border-strong);border-radius:14px 14px 0 0;box-shadow:var(--shadow-pop);}.narrow.svelte-7gk24t .detail:where(.svelte-7gk24t) .cover.big {max-height:180px;}\n  /* stays at the sheet's top right while its card scrolls */.close.svelte-7gk24t {position:sticky;top:0;float:right;z-index:1;margin:-8px -6px 0 8px;width:36px;height:36px;display:grid;place-items:center;border-radius:50%;background:var(--bg-hover);}"
};
function Go(e, t) {
	We(t, !0), ri(e, Wo);
	let n = (e, t = d) => {
		var n = La();
		let r;
		var i = R(n), a = (e) => {
			ja(e, {
				get name() {
					return t().icon;
				},
				size: 14
			});
		};
		X(i, (e) => {
			t().icon && e(a);
		});
		var o = B(i);
		k(n), V(() => {
			r = Q(n, 1, "btn svelte-7gk24t", null, r, {
				primary: t().primary,
				danger: t().danger
			}), n.disabled = t().disabled, $(n, "title", t().title), Y(o, ` ${t().label ?? ""}`);
		}), K("click", n, () => void ve(t())), J(e, n);
	}, r = (e, n, r = "info", i) => t.atlas.toast(e, n, r, { timeout: i }), i = (e) => t.atlas.richTitle(e), a = /* @__PURE__ */ F(L(ur(() => ea.get(t.source.id) ?? []))), o = /* @__PURE__ */ F(""), s = /* @__PURE__ */ F(L(ur(() => ta.get(t.source.id)?.q ?? ""))), c = ur(() => ta.get(t.source.id)), l = /* @__PURE__ */ F(L(c?.scope ?? { kind: "all" })), u = /* @__PURE__ */ F(L(c?.tab ?? null)), f = /* @__PURE__ */ F(!1), p = /* @__PURE__ */ F(L(ur(() => ta.get(t.source.id)?.selId ?? null))), h = /* @__PURE__ */ F(L(ur(() => ta.get(t.source.id)?.sortId ?? t.source.sorts[0]?.id ?? ""))), g = /* @__PURE__ */ F(L(ur(() => ta.get(t.source.id)?.layout ?? t.source.layouts[0]))), _ = /* @__PURE__ */ F(L([])), v;
	async function y() {
		try {
			let e = new Map(G(a).map((e) => [e.id, e])), n = await t.source.load();
			I(a, (t.source.from ? n : n.filter((e) => !e.from)).map((t) => {
				let n = e.get(t.id);
				return n && JSON.stringify(n) === JSON.stringify(t) ? n : t;
			}), !0), ea.set(t.source.id, G(a)), I(o, "");
		} catch (e) {
			I(o, Zi(e), !0);
		}
	}
	let b = /* @__PURE__ */ N(() => oa(G(a), (e) => e.groups, t.source.groupOrder)), x = /* @__PURE__ */ N(() => G(b).some(([e]) => e.includes(ra))), S = /* @__PURE__ */ F(L([])), ee = /* @__PURE__ */ F(L([])), C = /* @__PURE__ */ N(() => new Set([...G(S), ...G(b).map(([e]) => e.split(ra)[0])].filter((e) => !G(ee).includes(e)))), te = /* @__PURE__ */ N(() => G(x) ? aa(G(b), G(C)) : []);
	function ne(e) {
		G(C).has(e) ? (I(S, G(S).filter((t) => t !== e), !0), I(ee, [...G(ee), e], !0)) : (I(ee, G(ee).filter((t) => t !== e), !0), I(S, [...G(S), e], !0));
	}
	let re = /* @__PURE__ */ N(() => oa(G(a), (e) => e.tags)), ie = /* @__PURE__ */ N(() => {
		let e = G(a);
		return (typeof t.source.tabs == "function" ? t.source.tabs() : t.source.tabs ?? []).map((t) => ({
			...t,
			n: e.filter((e) => e.tab === t.id).length
		})).filter((e) => e.n || e.always);
	}), ae = (e, t) => G(l).kind === e && (e === "all" || G(l).name === t), oe = (e) => (!G(u) || e.tab === G(u)) && (G(l).kind === "all" || (G(l).kind === "group" ? ia(e.groups, G(l).name) : (e.tags ?? []).includes(G(l).name))), se = /* @__PURE__ */ N(() => G(a).filter((e) => oe(e) && na(e, G(s)))), ce = (e) => e ? e.from ?? t.source.from ?? "" : "", le = /* @__PURE__ */ N(() => {
		let e = Qi(G(se), t.source.sorts.find((e) => e.id === G(h)) ?? { id: "" }), n = [...new Set(e.map(ce).filter(Boolean))];
		return [...e.filter((e) => !ce(e)), ...n.flatMap((t) => e.filter((e) => ce(e) === t))];
	}), ue = /* @__PURE__ */ N(() => G(a).filter((e) => !ce(e)).length), de = (e) => t.source.homes?.find((t) => t.from === e), w = /* @__PURE__ */ N(() => G(le).find((e) => e.id === G(p)) ?? G(le)[0] ?? null), fe = /* @__PURE__ */ N(() => G(s) || G(l).kind !== "all" ? [] : $i(G(a).filter((e) => (!G(u) || e.tab === G(u)) && (!G(ue) || !ce(e))), 8));
	function pe(e) {
		t.source.open ? t.source.open(e) : (I(p, e.id, !0), I(A, [e.id], !0));
	}
	let me = /* @__PURE__ */ F(1e3), he = /* @__PURE__ */ N(() => G(me) < 700), ge = /* @__PURE__ */ N(() => G(he) ? G(p) !== null && G(w)?.id === G(p) ? G(w) : null : G(w)), T = /* @__PURE__ */ F(null);
	vn(() => {
		let e = G(w);
		if (!e) {
			I(T, null);
			return;
		}
		let n = ur(() => t.source.detail(e));
		if (!(n instanceof Promise)) {
			I(T, n, !0);
			return;
		}
		let r = !0;
		return n.then((e) => {
			r && I(T, e, !0);
		}, (e) => {
			r && I(o, Zi(e), !0);
		}), () => {
			r = !1;
		};
	});
	let _e = /* @__PURE__ */ F(null);
	async function ve(e) {
		"edit" in e ? I(_e, {
			def: e.edit,
			values: Object.fromEntries(e.edit.fields.map((e) => [e.key, e.value]))
		}, !0) : "confirm" in e && !await t.atlas.confirm(e.confirm.title, {
			hint: e.confirm.hint,
			ok: e.confirm.button,
			danger: !0
		}) || await ye(e.run);
	}
	async function ye(e) {
		try {
			await e();
		} catch (e) {
			r("It did not work", Zi(e), "error");
		}
		await y();
	}
	async function be() {
		if (G(_e)) try {
			await G(_e).def.save(G(_e).values), I(_e, null), await y();
		} catch (e) {
			r("Could not save", Zi(e), "error");
		}
	}
	let xe = /* @__PURE__ */ N(() => G(w)?.id);
	vn(() => {
		G(xe), I(_e, null);
	});
	let Se = /* @__PURE__ */ F(!1), Ce = /* @__PURE__ */ F("");
	async function E() {
		if (t.source.add && G(Ce).trim() && !G(Se)) {
			I(Se, !0);
			try {
				let e = await t.source.add.run(G(Ce).trim());
				await y(), e && I(p, e, !0), I(Ce, "");
			} catch (e) {
				r("Could not add it", Zi(e), "error", 9e3);
			} finally {
				I(Se, !1);
			}
		}
	}
	let we = /* @__PURE__ */ F(!1);
	async function D(e) {
		if (e.preventDefault(), I(we, !1), !t.source.drop) return;
		let n = [...e.dataTransfer?.files ?? []].filter((e) => t.source.drop.accept.test(e.name));
		if (!n.length) {
			r("Nothing here can take these files");
			return;
		}
		let i = await t.source.drop.run(n);
		await y(), i && I(p, i, !0);
	}
	let O = "text/x-atlas-library", Te = /* @__PURE__ */ F(null);
	function De(e, t) {
		let n = G(A).length > 1 && G(Ae).has(t.id) ? G(A) : [t.id];
		e.dataTransfer?.setData(O, JSON.stringify(n)), e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
	}
	let Oe = (e) => ({
		ondragover: (n) => {
			t.source.regroup && n.dataTransfer?.types.includes(O) && (n.preventDefault(), I(Te, e, !0));
		},
		ondragleave: () => {
			G(Te) === e && I(Te, null);
		},
		ondrop: async (n) => {
			let i = JSON.parse(n.dataTransfer?.getData(O) || "[]");
			if (t.source.regroup && i.length) {
				n.preventDefault(), n.stopPropagation(), I(Te, null);
				try {
					await t.source.regroup(G(a).filter((e) => i.includes(e.id)), e);
				} catch (e) {
					r("Not moved", Zi(e), "error");
				}
				await y();
			}
		}
	}), A = /* @__PURE__ */ F(L([])), ke = null, Ae = /* @__PURE__ */ N(() => new Set(G(A))), je = /* @__PURE__ */ N(() => G(le).filter((e) => G(Ae).has(e.id))), Me = (e) => G(A).length > 1 ? G(Ae).has(e.id) : G(ge)?.id === e.id;
	function Ne(e, n) {
		if (G(he) && t.source.open && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.target.closest(".wrap")) t.source.open(n);
		else {
			if (e.ctrlKey || e.metaKey) {
				let e = G(A).length ? G(A) : G(w) ? [G(w).id] : [];
				I(A, e.includes(n.id) ? e.filter((e) => e !== n.id) : [...e, n.id], !0);
			} else if (e.shiftKey && ke) {
				let e = G(le).findIndex((e) => e.id === ke), t = G(le).indexOf(n);
				I(A, e < 0 ? [n.id] : G(le).slice(Math.min(e, t), Math.max(e, t) + 1).map((e) => e.id), !0);
			} else I(A, [n.id], !0);
			e.shiftKey || (ke = n.id), I(p, n.id, !0);
		}
	}
	async function Pe(e, n) {
		if (typeof t.atlas.shell.popMenu != "function") return;
		if (G(A).length > 1 && G(Ae).has(n.id)) {
			t.atlas.shell.popMenu(e, G(Re).map((e) => ({
				label: e.label,
				icon: e.icon,
				danger: e.danger,
				disabled: e.disabled,
				run: () => ve(e)
			})));
			return;
		}
		I(A, [n.id], !0), ke = n.id, I(p, n.id, !0);
		let r = t.source.detail(n), i = r instanceof Promise ? null : r, a = [];
		if (t.source.open && !i?.actions.some((e) => e.primary) && a.push({
			label: "Open",
			icon: "book-open",
			run: () => t.source.open(n)
		}), i) {
			let e = (e) => ({
				label: "confirm" in e ? `${e.label.replace(/…$/, "")}…` : e.label,
				icon: e.icon,
				danger: e.danger,
				disabled: e.disabled,
				run: () => ve(e)
			});
			if (a.push(...i.actions.filter((e) => !e.more && !e.danger).map(e)), i.choice) {
				a.push(null);
				for (let e of i.choice.options) a.push({
					label: `${e.on ? "✓ " : ""}${e.label}`,
					detail: i.choice.label,
					disabled: e.on,
					run: () => ye(e.run)
				});
			}
			a.push(null, ...i.actions.filter((e) => e.more && !e.danger).map(e)), a.push(null, ...i.actions.filter((e) => e.danger).map(e));
		}
		t.atlas.shell.popMenu(e, a.map((e) => e && {
			...e,
			run: async () => {
				await e.run();
			}
		}), {
			path: n.note,
			openLabel: t.source.open ? "Open its note" : "Open"
		});
	}
	function Fe(e, n) {
		typeof t.atlas.shell.popMenu == "function" && t.atlas.shell.popMenu(e, n.map((e) => ({
			label: e.label,
			icon: e.icon,
			danger: e.danger,
			disabled: e.disabled,
			run: async () => {
				await ve(e);
			}
		})));
	}
	let Ie = [];
	function Le(e, t) {
		t ? Ie.length || (Ie = G(A)) : Ie = [], I(A, [.../* @__PURE__ */ new Set([...Ie, ...e])], !0), e.length && I(p, e.at(-1), !0);
	}
	let Re = /* @__PURE__ */ N(() => {
		let e = G(je);
		if (e.length < 2) return [];
		let n = t.source.open;
		return [...n ? [{
			label: `Open ${e.length}`,
			icon: "folder-open",
			primary: !0,
			run: () => {
				for (let t of e.slice(0, 20)) n(t);
			}
		}] : [], ...t.source.many?.(e) ?? []];
	});
	function ze(e) {
		if (!G(le).length) return;
		let t = Math.max(0, Math.min(G(le).length - 1, (G(w) ? G(le).indexOf(G(w)) : -1) + e));
		I(p, G(le)[t].id, !0), I(A, [G(p)], !0), ke = G(p);
		let n = !!v?.contains(document.activeElement);
		requestAnimationFrame(() => {
			let e = v?.querySelector(".row.sel, .card.sel");
			e?.scrollIntoView({ block: "nearest" }), n && e?.focus();
		});
	}
	function Be(e) {
		if (e.target.closest("input, select, textarea")) return;
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
			e.preventDefault(), I(A, G(le).map((e) => e.id), !0);
			return;
		}
		if (e.key === "Escape" && G(A).length > 1) {
			e.preventDefault(), I(A, G(w) ? [G(w).id] : [], !0);
			return;
		}
		if (e.ctrlKey || ma(e) || e.altKey) return;
		let n = e.key;
		if (n === "ArrowDown" || n === "j" || G(g) === "covers" && n === "ArrowRight") ze(1);
		else if (n === "ArrowUp" || n === "k" || G(g) === "covers" && n === "ArrowLeft") ze(-1);
		else if (n === "Enter" && G(w) && t.source.open) t.source.open(G(w));
		else if (G(w) && t.source.keys?.[n]) t.source.keys[n](G(w));
		else return;
		e.preventDefault();
	}
	function Ve(e, n) {
		return { destroy: t.atlas.mountBlock(e, {
			type: "backlinks",
			path: n,
			open: !0
		}) };
	}
	vn(() => {
		ta.set(t.source.id, {
			scope: G(l),
			tab: G(u),
			q: G(s),
			selId: G(p),
			sortId: G(h),
			layout: G(g),
			scroll: ur(() => ta.get(t.source.id)?.scroll ?? 0)
		});
	});
	let He = () => {
		let e = ta.get(t.source.id);
		e && v && (e.scroll = v.scrollTop);
	};
	Ji(() => {
		let e = ta.get(t.source.id)?.scroll ?? 0;
		e && v && requestAnimationFrame(() => {
			v.scrollTop = e;
		}), v?.addEventListener("scroll", He, { passive: !0 }), y(), t.source.tools?.().then((e) => I(_, e, !0), () => {});
		let n, r = t.source.watch?.(() => {
			clearTimeout(n), n = setTimeout(y, 1200);
		});
		return () => {
			r?.(), clearTimeout(n), v?.removeEventListener("scroll", He);
		};
	});
	var j = Uo();
	let Ue;
	var Ke = R(j), qe = (e) => {
		var n = Ra(), r = z(n, !0);
		V(() => Y(r, t.source.drop.hint)), J(e, n);
	};
	X(Ke, (e) => {
		G(we) && t.source.drop && e(qe);
	});
	var Je = B(Ke, 2), Ye = R(Je), Xe = R(Ye);
	ja(Xe, {
		get name() {
			return t.source.icon;
		},
		size: 18
	});
	var Ze = B(Xe), Qe = z(B(Ze), !0);
	k(Ye);
	var M = B(Ye, 2);
	Mi(M);
	var $e = B(M, 2), et = (e) => {
		{
			let n = /* @__PURE__ */ N(() => t.source.sorts.map((e) => ({
				value: e.id,
				label: `Sort: ${e.label}`
			})));
			wa(e, {
				get value() {
					return G(h);
				},
				label: "Sort by",
				onchange: (e) => I(h, e, !0),
				get options() {
					return G(n);
				}
			});
		}
	};
	X($e, (e) => {
		t.source.sorts.length > 1 && e(et);
	});
	var tt = B($e, 2), rt = (e) => {
		var n = Ba();
		Z(n, 20, () => t.source.layouts, (e) => e, (e, t) => {
			var n = za();
			let r;
			var i = z(n, !0);
			V(() => {
				$(n, "aria-checked", G(g) === t), r = Q(n, 1, "svelte-7gk24t", null, r, { on: G(g) === t }), Y(i, t === "covers" ? "Covers" : "List");
			}), K("click", n, () => I(g, t, !0)), J(e, n);
		}), k(n), J(e, n);
	};
	X(tt, (e) => {
		t.source.layouts.length > 1 && e(rt);
	});
	var it = B(tt, 2);
	Z(it, 17, () => t.source.homes ?? [], (e) => e.from, (e, t) => {
		var n = Va(), r = R(n);
		ja(r, {
			name: "server",
			size: 14
		});
		var i = B(r);
		ja(B(i), {
			name: "external-link",
			size: 12
		}), k(n), V(() => {
			$(n, "title", `Open ${G(t).from ?? ""} in its own tab: what is there, yours or not`), Y(i, ` ${G(t).label ?? ""} `);
		}), K("click", n, () => void ye(G(t).run)), J(e, n);
	});
	var at = B(it, 2), ot = (e) => {
		var n = Ha(), r = R(n);
		Mi(r);
		var i = B(r, 2), a = z(i, !0);
		k(n), V((e) => {
			$(r, "placeholder", t.source.add.placeholder), r.disabled = G(Se), i.disabled = e, Y(a, G(Se) ? t.source.add.busy : "Add");
		}, [() => !G(Ce).trim() || G(Se)]), Tr("submit", n, (e) => {
			e.preventDefault(), E();
		}), Ri(r, () => G(Ce), (e) => I(Ce, e)), J(e, n);
	};
	X(at, (e) => {
		t.source.add && e(ot);
	}), Z(B(at, 2), 17, () => G(_), (e) => e.label, (e, t) => {
		n(e, () => G(t));
	}), k(Je);
	var st = B(Je, 2), ct = (e) => {
		var t = Wa(), n = R(t);
		let r;
		var i = z(B(R(n)), !0);
		k(n), Z(B(n, 2), 17, () => G(ie), (e) => e.id, (e, t) => {
			var n = Ua();
			let r;
			var i = R(n), a = z(B(i), !0);
			k(n), V(() => {
				r = Q(n, 1, "chip svelte-7gk24t", null, r, { on: G(u) === G(t).id }), $(n, "aria-pressed", G(u) === G(t).id), Y(i, `${G(t).title ?? ""} `), Y(a, G(t).n);
			}), K("click", n, () => I(u, G(u) === G(t).id ? null : G(t).id, !0)), J(e, n);
		}), k(t), V(() => {
			r = Q(n, 1, "chip svelte-7gk24t", null, r, { on: !G(u) }), Y(i, G(a).length);
		}), K("click", n, () => I(u, null)), J(e, t);
	};
	X(st, (e) => {
		G(ie).length > 1 && e(ct);
	});
	var lt = B(st, 2), ut = (e) => {
		var n = Ka(), r = R(n, !0), i = B(r), a = (e) => {
			var n = Ga(), r = z(n, !0);
			V(() => Y(r, t.source.setup.label)), K("click", n, () => void ye(async () => {
				await t.source.setup?.run(), await y();
			})), J(e, n);
		};
		X(i, (e) => {
			t.source.setup && e(a);
		}), k(n), V(() => Y(r, t.source.setup ? t.source.empty : G(o))), J(e, n);
	};
	X(lt, (e) => {
		G(o) && e(ut);
	});
	var dt = B(lt, 2), ft = (e) => {
		var n = Ya(), r = B(R(n), 2);
		Z(r, 21, () => G(fe), (e) => e.id, (e, n) => {
			var r = Ja(), a = R(r);
			Ia(a, {
				get atlas() {
					return t.atlas;
				},
				get cover() {
					return G(n).cover;
				},
				get title() {
					return G(n).title;
				}
			});
			var o = B(a, 2);
			ni(o, () => i(G(n).title), !0), k(o);
			var s = B(o, 2), c = (e) => {
				var t = qa();
				let r;
				V((e) => {
					$(t, "aria-label", `${e ?? ""} %`), r = hi(t, "", r, { "--p": G(n).progress });
				}, [() => Math.round(G(n).progress * 100)]), J(e, t);
			};
			X(s, (e) => {
				G(n).progress && e(c);
			}), k(r), V(() => $(r, "title", t.source.open ? `Open ${G(n).title}` : G(n).title)), K("click", r, () => pe(G(n))), J(e, r);
		}), k(r), k(n), J(e, n);
	};
	X(dt, (e) => {
		G(fe).length && e(ft);
	});
	var pt = B(dt, 2);
	let mt;
	var ht = R(pt), gt = (e) => {
		var n = ro(), r = R(n);
		let i;
		var o = R(r);
		ja(o, {
			get name() {
				return t.source.icon;
			},
			size: 14
		});
		var s = B(o), c = z(s), u = z(B(s), !0);
		k(r);
		var d = B(r, 2), p = (e) => {
			var n = eo(), r = on(n), i = z(r, !0), a = B(r, 2), o = (e) => {
				var t = Pr();
				Z(on(t), 17, () => G(te), (e) => e.path, (e, t) => {
					var n = Qa();
					let r;
					var i = R(n), a = (e) => {
						var n = Xa(), r = R(n);
						{
							let e = /* @__PURE__ */ N(() => G(C).has(G(t).path) ? "chevron-down" : "chevron");
							ja(r, {
								get name() {
									return G(e);
								},
								size: 12
							});
						}
						k(n), V((e, t) => {
							$(n, "aria-label", e), $(n, "aria-expanded", t);
						}, [() => G(C).has(G(t).path) ? `Close ${G(t).name}` : `Open ${G(t).name}`, () => G(C).has(G(t).path)]), K("click", n, () => ne(G(t).path)), J(e, n);
					}, o = (e) => {
						J(e, Za());
					};
					X(i, (e) => {
						G(t).kids ? e(a) : e(o, -1);
					});
					var s = B(i, 2);
					let c;
					var u = R(s);
					{
						let e = /* @__PURE__ */ N(() => G(C).has(G(t).path) && G(t).kids ? "folder-open" : "folder");
						ja(u, {
							get name() {
								return G(e);
							},
							size: 14
						});
					}
					var d = B(u), f = z(d, !0), p = z(B(d), !0);
					k(s), k(n), V((e) => {
						r = hi(n, "", r, { "padding-left": `${G(t).depth * 12}px` }), c = Q(s, 1, "item svelte-7gk24t", null, c, { on: e }), $(s, "title", G(t).path), Y(f, G(t).name), Y(p, G(t).count);
					}, [() => ae("group", G(t).path)]), K("click", s, () => I(l, {
						kind: "group",
						name: G(t).path
					}, !0)), K("dblclick", s, () => G(t).kids && ne(G(t).path)), J(e, n);
				}), J(e, t);
			}, s = (e) => {
				var t = Pr();
				Z(on(t), 17, () => G(b), ([e, t]) => e, (e, t) => {
					var n = /* @__PURE__ */ N(() => m(G(t), 2));
					let r = () => G(n)[0], i = () => G(n)[1];
					var a = $a(), o = () => I(l, {
						kind: "group",
						name: r()
					}, !0);
					Pi(a, (e, t) => ({
						class: "item",
						onclick: o,
						title: r(),
						...e,
						[Ci]: {
							on: t,
							drop: G(Te) === r()
						}
					}), [() => Oe(r()), () => ae("group", r())], void 0, void 0, "svelte-7gk24t");
					var s = R(a);
					ja(s, {
						name: "folder",
						size: 14
					});
					var c = B(s), u = z(c, !0), d = z(B(c), !0);
					k(a), V(() => {
						Y(u, r()), Y(d, i());
					}), J(e, a);
				}), J(e, t);
			};
			X(a, (e) => {
				G(x) ? e(o) : e(s, -1);
			}), V(() => Y(i, t.source.groupsTitle ?? "Groups")), J(e, n);
		};
		X(d, (e) => {
			G(b).length && e(p);
		});
		var h = B(d, 2), g = (e) => {
			var t = no(), n = on(t), r = R(n);
			{
				let e = /* @__PURE__ */ N(() => G(f) ? "chevron-down" : "chevron");
				ja(r, {
					get name() {
						return G(e);
					},
					size: 12
				});
			}
			var i = z(B(r, 2), !0);
			k(n);
			var a = B(n, 2), o = (e) => {
				var t = Pr();
				Z(on(t), 17, () => G(re), ([e, t]) => e, (e, t) => {
					var n = /* @__PURE__ */ N(() => m(G(t), 2));
					let r = () => G(n)[0], i = () => G(n)[1];
					var a = Pr(), o = on(a), s = (e) => {
						var t = to();
						let n;
						var a = B(R(t)), o = z(a, !0), s = z(B(a), !0);
						k(t), V((e) => {
							n = Q(t, 1, "item tagitem svelte-7gk24t", null, n, { on: e }), $(t, "title", r()), Y(o, r()), Y(s, i());
						}, [() => ae("tag", r())]), K("click", t, () => I(l, {
							kind: "tag",
							name: r()
						}, !0)), J(e, t);
					}, c = /* @__PURE__ */ N(() => G(f) || ae("tag", r()));
					X(o, (e) => {
						G(c) && e(s);
					}), J(e, a);
				}), J(e, t);
			};
			X(a, (e) => {
				(G(f) || G(l).kind === "tag") && e(o);
			}), V(() => {
				$(n, "aria-expanded", G(f)), Y(i, G(re).length);
			}), K("click", n, () => I(f, !G(f))), J(e, t);
		};
		X(h, (e) => {
			G(re).length && e(g);
		}), k(n), V((e) => {
			$(n, "aria-label", t.source.groupsTitle ?? "Groups"), i = Q(r, 1, "item svelte-7gk24t", null, i, { on: e }), Y(c, `All ${t.source.noun ?? ""}`), Y(u, G(a).length);
		}, [() => ae("all")]), K("click", r, () => I(l, { kind: "all" }, !0)), J(e, n);
	};
	X(ht, (e) => {
		(G(b).length || G(re).length) && e(gt);
	});
	var _t = B(ht, 2);
	let vt;
	Z(_t, 23, () => G(le), (e) => e.id, (e, n, r) => {
		var a = fo(), o = on(a), s = (e) => {
			let t = /* @__PURE__ */ N(() => de(ce(G(n))));
			var r = ao(), i = R(r);
			ja(i, {
				name: "server",
				size: 14
			});
			var a = B(i), o = z(a), s = B(a, 2), c = z(s, !0), l = B(s, 2), u = (e) => {
				var n = io(), r = R(n);
				ja(B(r), {
					name: "external-link",
					size: 12
				}), k(n), V(() => Y(r, `${G(t).label ?? ""} `)), K("click", n, () => void ye(G(t).run)), J(e, n);
			};
			X(l, (e) => {
				G(t) && e(u);
			}), k(r), V((e, t) => {
				Y(o, `From ${e ?? ""}`), Y(c, t);
			}, [() => ce(G(n)), () => G(le).filter((e) => ce(e) === ce(G(n))).length]), J(e, r);
		}, c = /* @__PURE__ */ N(() => ce(G(n)) && ce(G(n)) !== ce(G(le)[G(r) - 1]));
		X(o, (e) => {
			G(c) && e(s);
		});
		var l = B(o, 2), u = (e) => {
			var r = so();
			let a;
			var o = R(r);
			Ia(o, {
				get atlas() {
					return t.atlas;
				},
				get cover() {
					return G(n).cover;
				},
				get title() {
					return G(n).title;
				}
			});
			var s = B(o, 2), c = (e) => {
				var t = qa();
				let r;
				V((e) => {
					$(t, "aria-label", `${e ?? ""} %`), r = hi(t, "", r, { "--p": G(n).progress });
				}, [() => Math.round(G(n).progress * 100)]), J(e, t);
			};
			X(s, (e) => {
				G(n).progress && e(c);
			});
			var l = B(s, 2);
			ni(l, () => i(G(n).title), !0), k(l);
			var u = B(l, 2), d = (e) => {
				var t = oo(), r = z(t, !0);
				V(() => Y(r, G(n).sub)), J(e, t);
			};
			X(u, (e) => {
				G(n).sub && e(d);
			}), k(r), V((e) => {
				a = Q(r, 1, "card svelte-7gk24t", null, a, { sel: e }), $(r, "data-pick", G(n).id), $(r, "draggable", t.source.regroup ? "true" : void 0), $(r, "title", G(n).sub);
			}, [() => Me(G(n))]), Tr("dragstart", r, (e) => De(e, G(n))), K("click", r, (e) => Ne(e, G(n))), K("dblclick", r, () => t.source.open?.(G(n))), K("contextmenu", r, (e) => void Pe(e, G(n))), J(e, r);
		}, d = (e) => {
			var r = uo();
			let a;
			var o = R(r);
			ni(o, () => i(G(n).title), !0), k(o);
			var s = B(o, 2), c = (e) => {
				var t = oo(), r = z(t, !0);
				V(() => Y(r, G(n).sub)), J(e, t);
			};
			X(s, (e) => {
				G(n).sub && e(c);
			});
			var l = B(s, 2), u = (e) => {
				var t = lo();
				Z(t, 21, () => G(n).flags, (e) => e.label, (e, t) => {
					var n = co();
					let r;
					var i = z(n, !0);
					V(() => {
						r = Q(n, 1, "flag svelte-7gk24t", null, r, { red: G(t).tone === "red" }), Y(i, G(t).label);
					}), J(e, n);
				}), k(t), J(e, t);
			};
			X(l, (e) => {
				G(n).flags?.length && e(u);
			});
			var d = B(l, 2), f = (e) => {
				var t = qa();
				let r;
				V((e) => {
					$(t, "aria-label", `${e ?? ""} %`), r = hi(t, "", r, { "--p": G(n).progress });
				}, [() => Math.round(G(n).progress * 100)]), J(e, t);
			};
			X(d, (e) => {
				G(n).progress && e(f);
			}), k(r), V((e) => {
				a = Q(r, 1, "row svelte-7gk24t", null, a, { sel: e }), $(r, "data-pick", G(n).id), $(r, "draggable", t.source.regroup ? "true" : void 0);
			}, [() => Me(G(n))]), Tr("dragstart", r, (e) => De(e, G(n))), K("click", r, (e) => Ne(e, G(n))), K("dblclick", r, () => t.source.open?.(G(n))), K("contextmenu", r, (e) => void Pe(e, G(n))), J(e, r);
		};
		X(l, (e) => {
			G(g) === "covers" ? e(u) : e(d, -1);
		}), J(e, a);
	}, (e) => {
		var n = po(), r = R(n, !0), i = B(r), o = (e) => {
			var n = Ga(), r = z(n, !0);
			V(() => Y(r, t.source.setup.label)), K("click", n, () => void ye(async () => {
				await t.source.setup?.run(), await y();
			})), J(e, n);
		};
		X(i, (e) => {
			!G(a).length && t.source.setup && e(o);
		}), k(n), V((e) => Y(r, e), [() => G(a).length ? "Nothing matches." : t.source.homes?.length ? `Nothing of yours yet. What is on ${t.source.homes.map((e) => e.from).join(" or ")} is in its own tab (the button above); a thing comes here once you read it or write about it.` : t.source.empty]), J(e, n);
	}), k(_t), Wi(_t, (e) => v = e, () => v), ii(_t, (e, t) => ga?.(e, t), () => ({ pick: Le }));
	var yt = B(_t, 2), bt = (e) => {
		var r = go(), a = R(r), o = z(a), s = B(a, 2), c = R(s);
		Z(c, 17, () => G(je).slice(0, 12), (e) => e.id, (e, t) => {
			var n = mo();
			ni(n, () => i(G(t).title), !0), k(n), J(e, n);
		});
		var l = B(c), u = (e) => {
			var t = ho(), n = z(t);
			V(() => Y(n, `and ${G(je).length - 12} more`)), J(e, t);
		};
		X(l, (e) => {
			G(je).length > 12 && e(u);
		}), k(s);
		var d = B(s, 2), f = R(d);
		Z(f, 17, () => G(Re), (e) => e.label, (e, t) => {
			n(e, () => G(t));
		});
		var p = B(f);
		k(d), k(r), V(() => Y(o, `${G(je).length ?? ""} ${t.source.noun ?? ""} picked`)), K("click", p, () => I(A, G(w) ? [G(w).id] : [], !0)), J(e, r);
	}, P = (e) => {
		var r = Vo(), a = on(r), o = (e) => {
			var t = _o();
			K("click", t, () => I(p, null)), J(e, t);
		};
		X(a, (e) => {
			G(he) && e(o);
		});
		var s = B(a, 2), c = R(s), u = (e) => {
			var t = vo();
			ja(R(t), {
				name: "close",
				size: 16
			}), k(t), K("click", t, () => I(p, null)), J(e, t);
		};
		X(c, (e) => {
			G(he) && e(u);
		});
		var d = B(c, 2), f = (e) => {
			var t = Co(), n = R(t);
			Z(n, 17, () => G(_e).def.fields, (e) => e.key, (e, t) => {
				var n = So();
				let r;
				var i = R(n, !0), a = B(i), o = (e) => {
					var n = yo(), r = z(n, !0);
					V(() => Y(r, G(t).hint)), J(e, n);
				};
				X(a, (e) => {
					G(t).hint && e(o);
				});
				var s = B(a, 2), c = (e) => {
					var n = bo();
					nt(n), V(() => $(n, "rows", G(t).rows)), Ri(n, () => G(_e).values[G(t).key], (e) => G(_e).values[G(t).key] = e), J(e, n);
				}, l = (e) => {
					var n = xo();
					Mi(n), Ri(n, () => G(_e).values[G(t).key], (e) => G(_e).values[G(t).key] = e), J(e, n);
				};
				X(s, (e) => {
					G(t).rows ? e(c) : e(l, -1);
				}), k(n), V(() => {
					r = Q(n, 1, "svelte-7gk24t", null, r, { half: G(t).half }), Y(i, G(t).label);
				}), J(e, n);
			});
			var r = B(n, 2), i = B(R(r));
			k(r), k(t), Tr("submit", t, (e) => {
				e.preventDefault(), be();
			}), K("keydown", t, (e) => {
				e.key === "Escape" && (e.stopPropagation(), I(_e, null));
			}), K("click", i, () => I(_e, null)), J(e, t);
		};
		X(d, (e) => {
			G(_e) && e(f);
		});
		var h = B(d, 2), g = (e) => {
			var t = wo(), n = z(t, !0);
			V(() => Y(n, G(T).kind)), J(e, t);
		};
		X(h, (e) => {
			G(T).kind && e(g);
		});
		var _ = B(h, 2);
		ni(_, () => i(G(T).title), !0), k(_);
		var v = B(_, 2);
		Z(v, 17, () => G(T).lines ?? [], qr, (e, t) => {
			var n = To(), r = z(n, !0);
			V(() => {
				Q(n, 1, ci(G(t).muted ? "venue" : "authors"), "svelte-7gk24t"), Y(r, G(t).text);
			}), J(e, n);
		});
		var y = B(v, 2), b = R(y);
		Z(b, 17, () => G(T).actions.filter((e) => !e.more), (e) => e.label, (e, t) => {
			n(e, () => G(t));
		});
		var x = B(b, 2), S = (e) => {
			let t = /* @__PURE__ */ N(() => G(T).actions.filter((e) => e.more));
			var n = Eo();
			ja(R(n), {
				name: "more",
				size: 14
			}), k(n), V((e) => $(n, "title", `More: ${e ?? ""}`), [() => G(t).map((e) => e.label).join(", ")]), K("click", n, (e) => Fe(e, G(t))), J(e, n);
		}, ee = /* @__PURE__ */ N(() => G(T).actions.some((e) => e.more));
		X(x, (e) => {
			G(ee) && e(S);
		}), k(y);
		var C = B(y, 2), te = (e) => {
			var n = Ao();
			let r;
			var i = R(n), a = (e) => {
				var n = Do();
				Kr(R(n), () => G(w).id, (e) => {
					Ia(e, {
						get atlas() {
							return t.atlas;
						},
						get cover() {
							return G(w).cover;
						},
						get title() {
							return G(w).title;
						},
						big: !0
					});
				}), k(n), J(e, n);
			};
			X(i, (e) => {
				G(w).cover && e(a);
			});
			var o = B(i, 2), s = (e) => {
				var t = ko();
				Z(t, 21, () => G(T).fields, ([e, t]) => e, (e, t) => {
					var n = /* @__PURE__ */ N(() => m(G(t), 2));
					let r = () => G(n)[0], i = () => G(n)[1];
					var a = Oo(), o = on(a), s = z(o, !0), c = z(B(o), !0);
					V(() => {
						Y(s, r()), Y(c, i());
					}), J(e, a);
				}), k(t), J(e, t);
			};
			X(o, (e) => {
				G(T).fields?.length && e(s);
			}), k(n), V(() => r = Q(n, 1, "facts svelte-7gk24t", null, r, { pic: !!G(w).cover })), J(e, n);
		};
		X(C, (e) => {
			(G(w).cover || G(T).fields?.length) && e(te);
		});
		var ne = B(C, 2), re = (e) => {
			var t = jo(), n = R(t), r = z(n, !0);
			Z(B(n, 2), 17, () => G(T).choice.options, (e) => e.label, (e, t) => {
				var n = za();
				let r;
				var i = z(n, !0);
				V(() => {
					r = Q(n, 1, "chip svelte-7gk24t", null, r, { on: G(t).on }), $(n, "aria-checked", G(t).on), Y(i, G(t).label);
				}), K("click", n, () => void ye(G(t).run)), J(e, n);
			}), k(t), V(() => {
				$(t, "aria-label", G(T).choice.label), Y(r, G(T).choice.label);
			}), J(e, t);
		};
		X(ne, (e) => {
			G(T).choice && e(re);
		});
		var ie = B(ne, 2), ae = (e) => {
			var t = No();
			Z(t, 21, () => G(T).links, (e) => e.url, (e, t) => {
				var n = Mo(), r = R(n);
				ja(r, {
					name: "link",
					size: 13
				});
				var i = B(r);
				k(n), V(() => {
					$(n, "href", G(t).url), Y(i, ` ${G(t).label ?? ""}`);
				}), J(e, n);
			}), k(t), J(e, t);
		};
		X(ie, (e) => {
			G(T).links?.length && e(ae);
		});
		var oe = B(ie, 2), se = (e) => {
			var t = Io(), n = R(t);
			Z(n, 16, () => G(w).groups ?? [], (e) => e, (e, t) => {
				var n = Po(), r = R(n);
				ja(r, {
					name: "folder",
					size: 12
				});
				var i = B(r, 1, !0);
				k(n), V(() => Y(i, t)), K("click", n, () => I(l, {
					kind: "group",
					name: t
				}, !0)), J(e, n);
			}), Z(B(n, 2), 16, () => G(w).tags ?? [], (e) => e, (e, t) => {
				var n = Fo(), r = z(n);
				V(() => Y(r, `#${t ?? ""}`)), K("click", n, () => I(l, {
					kind: "tag",
					name: t
				}, !0)), J(e, n);
			}), k(t), J(e, t);
		};
		X(oe, (e) => {
			(G(w).groups?.length || G(w).tags?.length) && e(se);
		});
		var ce = B(oe, 2), le = (e) => {
			var t = Lo(), n = on(t), r = z(n, !0), i = z(B(n), !0);
			V(() => {
				Y(r, G(T).body.title), Y(i, G(T).body.text);
			}), J(e, t);
		};
		X(ce, (e) => {
			G(T).body && e(le);
		});
		var ue = B(ce, 2), de = (e) => {
			var t = Ro(), n = B(on(t)), r = z(n, !0), i = B(n);
			V(() => Y(r, G(T).notes.text)), K("click", i, () => G(T)?.notes?.open()), J(e, t);
		};
		X(ue, (e) => {
			G(T).notes && e(de);
		});
		var fe = B(ue, 2), pe = (e) => {
			var t = Bo();
			Kr(R(t), () => G(w).note, (e) => {
				var t = zo();
				ii(t, (e, t) => Ve?.(e, t), () => G(w).note), J(e, t);
			}), k(t), J(e, t);
		};
		X(fe, (e) => {
			G(w).note && e(pe);
		}), k(s), J(e, r);
	}, xt = (e) => {
		var n = Ho(), r = R(n), i = R(r);
		Ee(), k(r), k(n), V(() => Y(i, `Pick one of the ${t.source.noun ?? ""} to see it here.`)), J(e, n);
	};
	X(yt, (e) => {
		G(je).length > 1 ? e(bt) : G(ge) && G(T) ? e(P, 1) : !G(he) && G(a).length && e(xt, 2);
	}), k(pt), k(j), V(() => {
		Ue = Q(j, 1, "library svelte-7gk24t", null, Ue, {
			dragging: G(we),
			narrow: G(he)
		}), $(j, "aria-label", t.source.title), $(j, "data-source", t.source.id), Y(Ze, ` ${t.source.title ?? ""} `), Y(Qe, G(se).length === G(a).length ? G(a).length : `${G(se).length} / ${G(a).length}`), $(M, "placeholder", t.source.search), mt = Q(pt, 1, "body svelte-7gk24t", null, mt, { bare: !G(b).length && !G(re).length }), vt = Q(_t, 1, "list svelte-7gk24t", null, vt, {
			covers: G(g) === "covers",
			"empty-list": !G(a).length
		});
	}), K("keydown", j, Be), Tr("dragover", j, (e) => {
		t.source.drop && e.dataTransfer?.types.includes("Files") && (e.preventDefault(), I(we, !0));
	}), Tr("dragleave", j, (e) => {
		e.currentTarget === e.target && I(we, !1);
	}), Tr("drop", j, D), Ri(M, () => G(s), (e) => I(s, e)), Hi(j, "clientWidth", (e) => I(me, e)), J(e, j), Ge();
}
Er([
	"click",
	"keydown",
	"dblclick",
	"contextmenu"
]);
// plugins/beta/catalog/ui/src/Libraries.svelte
var Ko = /* @__PURE__ */ q("<button role=\"tab\"><!> </button>"), qo = /* @__PURE__ */ q("<span class=\"apart svelte-1hozhyt\" aria-hidden=\"true\"></span><span class=\"label svelte-1hozhyt\">On your servers</span> <!>", 1), Jo = /* @__PURE__ */ q("<div class=\"which svelte-1hozhyt\" role=\"tablist\" aria-label=\"Libraries\"><!> <!></div>"), Yo = /* @__PURE__ */ q("<p class=\"none svelte-1hozhyt\">No library in this vault yet. Show a folder as a library from its menu in the file explorer (“Show as a library”), or add one in Settings → Libraries.</p>"), Xo = /* @__PURE__ */ q("<p class=\"none svelte-1hozhyt\"> </p>"), Zo = /* @__PURE__ */ q("<div class=\"libraries svelte-1hozhyt\"><!> <!></div>"), Qo = {
	hash: "svelte-1hozhyt",
	code: ".libraries.svelte-1hozhyt {display:flex;flex-direction:column;height:100%;min-height:0;}.which.svelte-1hozhyt {display:flex;gap:4px;padding:6px 10px 0;overflow-x:auto;flex:none;border-bottom:1px solid var(--border);}.which.svelte-1hozhyt button:where(.svelte-1hozhyt) {display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:none;background:none;color:var(--text-muted);border-bottom:2px solid transparent;white-space:nowrap;font:inherit;cursor:pointer;}.which.svelte-1hozhyt button:where(.svelte-1hozhyt):hover {color:var(--text);}.which.svelte-1hozhyt button.on:where(.svelte-1hozhyt) {color:var(--text);border-bottom-color:var(--accent);}.which.svelte-1hozhyt .apart:where(.svelte-1hozhyt) {flex:none;width:1px;margin:6px 6px 8px;background:var(--border-strong);}.which.svelte-1hozhyt .label:where(.svelte-1hozhyt) {flex:none;align-self:center;padding:0 4px 2px;color:var(--text-faint);font-size:calc(11px * var(--ui-scale, 1));text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;}.libraries.svelte-1hozhyt > :last-child {flex:1;min-height:0;}.none.svelte-1hozhyt {padding:24px;color:var(--text-muted);}"
};
function $o(e, t) {
	We(t, !0), ri(e, Qo);
	let n = "atlas.libraries.last", r = /* @__PURE__ */ F(ur(() => t.atlas.libraries.list())), i = /* @__PURE__ */ N(() => da(G(r))), a = /* @__PURE__ */ N(() => G(i).filter((e) => !e.from)), o = /* @__PURE__ */ N(() => G(i).filter((e) => e.from)), s = /* @__PURE__ */ F(L(ur(() => t.atlas.anchor) || Yi(n, "")));
	Ji(() => {
		let e = t.atlas.libraries.onChange((e) => I(r, e)), n = t.atlas.pane?.onAnchor((e) => I(s, e, !0));
		return () => {
			e(), n?.();
		};
	});
	let c = /* @__PURE__ */ N(() => G(i).find((e) => e.id === G(s) || e.members?.includes(G(s))) ?? G(i)[0]), l = /* @__PURE__ */ F(null), u = /* @__PURE__ */ F("");
	vn(() => {
		let e = G(c);
		if (I(l, null), I(u, ""), !e) return;
		Xi(n, e.id);
		let t = !0;
		return Promise.resolve(e.source()).then((e) => {
			t && I(l, e, !0);
		}, (n) => {
			t && I(u, `${e.title}: ${Zi(n)}`);
		}), () => {
			t = !1;
		};
	});
	var f = Zo();
	{
		let e = (e, t = d) => {
			var n = Ko();
			let r;
			var i = R(n);
			ja(i, {
				get name() {
					return t().icon;
				},
				size: 14
			});
			var a = B(i, 1, !0);
			k(n), V(() => {
				$(n, "aria-selected", t() === G(c)), r = Q(n, 1, "svelte-1hozhyt", null, r, { on: t() === G(c) }), Y(a, t().title);
			}), K("click", n, () => I(s, t().id, !0)), J(e, n);
		};
		var p = R(f), m = (t) => {
			var n = Jo(), r = R(n);
			Z(r, 17, () => G(a), (e) => e.id, (t, n) => {
				e(t, () => G(n));
			});
			var i = B(r, 2), s = (t) => {
				var n = qo();
				Z(B(on(n), 3), 17, () => G(o), (e) => e.id, (t, n) => {
					e(t, () => G(n));
				}), J(t, n);
			};
			X(i, (e) => {
				G(o).length && e(s);
			}), k(n), J(t, n);
		};
		X(p, (e) => {
			G(i).length > 1 && e(m);
		});
		var h = B(p, 2), g = (e) => {
			J(e, Yo());
		}, _ = (e) => {
			var t = Xo(), n = z(t, !0);
			V(() => Y(n, G(u))), J(e, t);
		}, v = (e) => {
			var n = Pr();
			Kr(on(n), () => G(l), (e) => {
				Go(e, {
					get atlas() {
						return t.atlas;
					},
					get source() {
						return G(l);
					}
				});
			}), J(e, n);
		};
		X(h, (e) => {
			G(c) ? G(u) ? e(_, 1) : G(l) && e(v, 2) : e(g);
		}), k(f);
	}
	J(e, f), Ge();
}
Er(["click"]);
// plugins/beta/catalog/ui/src/view.ts
function es(e, t) {
	e.style.height = "100%";
	let n = zr($o, {
		target: e,
		props: { atlas: t }
	});
	return () => void Ur(n);
}
function ts(e, t, n) {
	e.style.height = "100%";
	let r = zr(Go, {
		target: e,
		props: {
			atlas: n,
			source: t
		}
	});
	return () => void Ur(r);
}
export { es as default, ts as mountLibrary };
