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
var h = 1024, g = 2048, _ = 4096, v = 8192, y = 16384, b = 32768, x = 1 << 25, S = 65536, C = 1 << 19, ee = 1 << 20, te = 1 << 25, ne = 1 << 21, re = 1 << 22, ie = 1 << 23, ae = Symbol("$state"), oe = Symbol("component"), se = Symbol("legacy props"), ce = Symbol(""), le = Symbol("attributes"), ue = Symbol("class"), de = Symbol("style"), fe = Symbol("text"), pe = Symbol("form reset"), me = new class extends Error {
	name = "StaleReactionError";
	message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
}(), he = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml"), ge = {}, w = Symbol("uninitialized"), _e = "http://www.w3.org/1999/xhtml", ve = "http://www.w3.org/2000/svg", ye = "http://www.w3.org/1998/Math/MathML";
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/hydration.js
var T = !1;
function we(e) {
	T = e;
}
var E;
function D(e) {
	if (e === null) throw xe(), ge;
	return E = e;
}
function Te() {
	return D(/* @__PURE__ */ R(E));
}
function O(e) {
	if (T) {
		if (/* @__PURE__ */ R(E) !== null) throw xe(), ge;
		E = e;
	}
}
function Ee(e = 1) {
	if (T) {
		for (var t = e, n = E; t--;) n = /* @__PURE__ */ R(n);
		E = n;
	}
}
function De(e = !0) {
	for (var t = 0, n = E;;) {
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
	if (!e || e.nodeType !== 8) throw xe(), ge;
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
var k = null;
function We(e) {
	k = e;
}
function Ge(e, t = !1, n) {
	k = {
		p: k,
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
	var t = k, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) vn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, k = t.p, qe(e);
}
function qe(e = {}) {
	return i(e, oe, { value: !0 }), e;
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
function A(e) {
	if (Ye.length === 0 && !wt) {
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
function j(e, t) {
	e.f = e.f & Qe | t;
}
function $e(e) {
	e.f & 512 || e.deps === null ? j(e, h) : j(e, _);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/utils.js
function et(e, t, n) {
	e.f & 2048 ? t.add(e) : e.f & 4096 && n.add(e), j(e, h);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/misc.js
function tt(e, t) {
	if (t) {
		let t = document.body;
		e.autofocus = !0, A(() => {
			document.activeElement === t && e.focus();
		});
	}
}
function nt(e) {
	T && /* @__PURE__ */ L(e) !== null && sn(e);
}
var rt = !1;
function it() {
	rt || (rt = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[pe]?.();
		});
	}, { capture: !0 }));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function at(e) {
	var t = U, n = K;
	G(null), q(null);
	try {
		return e();
	} finally {
		G(t), q(n);
	}
}
function ot(e, t, n, r = n) {
	e.addEventListener(t, () => at(n));
	let i = e[pe];
	e[pe] = i ? () => {
		i(), r(!0);
	} : () => r(!0), it();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/async.js
function st(e, t, n, r) {
	let i = Je() ? dt : ht;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = K, c = ct(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
	function u(e) {
		if (!(s.f & 16384)) {
			c();
			try {
				r([...o, ...e]);
			} catch (e) {
				B(e, s);
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
		Promise.all(n.map((e) => /* @__PURE__ */ pt(e))).then(u).catch((e) => B(e, s)).finally(d);
	}
	l ? l.then(() => {
		c(), f(), lt();
	}) : f();
}
function ct() {
	var e = K, t = U, n = k, r = M;
	return function(i = !0) {
		q(e), G(t), We(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function lt(e = !0) {
	q(null), G(null), We(null), e && M?.deactivate();
}
function ut() {
	var e = K, t = e.b, n = M, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function dt(e) {
	var t = 2 | g;
	return K !== null && (K.f |= C), {
		ctx: k,
		deps: null,
		effects: null,
		equals: ke,
		f: t,
		fn: e,
		reactions: null,
		rv: 0,
		v: w,
		wv: 0,
		parent: K,
		ac: null
	};
}
var ft = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function pt(e, t, n) {
	let r = K;
	r === null && Ne();
	var i = void 0, a = Vt(w), o = !U, s = /* @__PURE__ */ new Set();
	return xn(() => {
		var t = K, n = p();
		i = n.promise;
		try {
			Promise.resolve(e()).then(n.resolve, (e) => {
				e !== me && n.reject(e);
			}).finally(lt);
		} catch (e) {
			n.reject(e), lt();
		}
		var c = M;
		if (o) {
			if (t.f & 32768) var l = ut();
			if (r.b?.is_rendered()) c.async_deriveds.get(t)?.reject(ft);
			else for (let e of s.values()) e.reject(ft);
			s.add(n), c.async_deriveds.set(t, n);
		}
		let u = (e, t = void 0) => {
			l?.(), s.delete(n), t !== ft && (c.activate(), t ? (a.f |= ie, Gt(a, t)) : (a.f & 8388608 && (a.f ^= ie), Gt(a, e)), c.deactivate());
		};
		n.promise.then(u, (e) => u(null, e || "unknown"));
	}), gn(() => {
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
function mt(e) {
	let t = /* @__PURE__ */ dt(e);
	return Bn(t), t;
}
/*#__NO_SIDE_EFFECTS__*/
function ht(e) {
	let t = /* @__PURE__ */ dt(e);
	return t.equals = je, t;
}
function gt(e) {
	var t = e.effects;
	if (t !== null) {
		e.effects = null;
		for (var n = 0; n < t.length; n += 1) H(t[n]);
	}
}
function _t(e) {
	var t, n = K, r = e.parent;
	if (!Ln && r !== null && e.v !== w && r.f & 24576) return be(), e.v;
	q(r);
	try {
		gt(e), t = Yn(e);
	} finally {
		q(n);
	}
	return t;
}
function vt(e) {
	var t = _t(e);
	if (!e.equals(t) && (e.wv = Kn(), (!M?.is_fork || e.deps === null) && (M === null ? e.v = t : (M.capture(e, t, !0), St?.capture(e, t, !0)), e.deps === null))) {
		j(e, h);
		return;
	}
	Ln || (N === null ? $e(e) : (hn() || M?.is_fork) && N.set(e, t));
}
function yt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && at(() => {
		t.ac.abort(me), t.ac = null;
	}), t.fn !== null && (t.teardown = d), Qn(t, 0), En(t));
}
function bt(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && $n(t);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/batch.js
var xt = null, M = null, St = null, N = null, Ct = null, wt = !1, Tt = !1, Et = null, Dt = null, Ot = 0, kt = 1, At = class e {
	id = kt++;
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
		xt === null ? xt = this : (xt.#n = this, this.#t = xt), xt = this;
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
			for (var r of n.d) j(r, g), t(r);
			for (r of n.m) j(r, _), t(r);
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
		for (let e of this.#u) this.#d.delete(e), j(e, g), this.schedule(e);
		for (let e of this.#d) j(e, _), this.schedule(e);
		this.apply();
		for (var t = Et = [], n = [], r = Dt = []; this.#c.length > 0;) {
			Ot++ > 1e3 && (this.#S(), Mt());
			for (let e of this.#g()) try {
				this.#v(e, t, n);
			} catch (t) {
				throw Lt(e), this.#h() || this.discard(), t;
			}
		}
		if (M = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (Et = null, Dt = null, this.#h()) {
			this.#x(n), this.#x(t);
			for (let [e, t] of this.#f) It(e, t);
			r.length > 0 && M.#_();
			return;
		}
		let a = this.#y();
		if (a) {
			this.#x(n), this.#x(t), a.#b(this);
			return;
		}
		this.#u.clear(), this.#d.clear();
		for (let e of this.#r) e(this);
		this.#r.clear(), St = this, Pt(n), Pt(t), St = null, this.#s?.resolve();
		var o = M;
		if (this.#a === 0 && (this.#c.length === 0 || o !== null) && this.#S(), this.#c.length > 0) {
			if (o !== null) {
				for (let e of this.#c) o.#c.push(e);
				this.#c = [];
			} else o = this;
		}
		o !== null && (zt.clear(), o.#_());
	}
	#v(e, t, n) {
		e.f ^= h;
		for (var r = e.first; r !== null;) {
			var i = r.f, a = !!(i & 96);
			if (!(a && i & 1024 || i & 8192 || this.#f.has(r)) && r.fn !== null) {
				a ? r.f ^= h : i & 4 ? t.push(r) : qn(r) && (i & 16 && this.#d.add(r), $n(r));
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
					r & 4194320 && !this.async_deriveds.has(i) && (this.#d.delete(i), j(i, g), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#S(), M = this, this.#_();
	}
	#x(e) {
		for (var t = 0; t < e.length; t += 1) et(e[t], this.#u, this.#d);
	}
	capture(e, t, n = !1) {
		e.v !== w && !this.previous.has(e) && this.previous.set(e, e.v), e.f & 8388608 || (this.current.set(e, [t, n]), N?.set(e, t)), this.is_fork || (e.v = t);
	}
	activate() {
		M = this;
	}
	deactivate() {
		M = null, N = null;
	}
	flush() {
		try {
			Tt = !0, M = this, this.#_();
		} finally {
			Ot = 0, Ct = null, Et = null, Dt = null, Tt = !1, M = null, N = null, zt.clear();
		}
	}
	discard() {
		for (let e of this.#i) e(this);
		this.#i.clear();
		for (let e of this.async_deriveds.values()) e.reject(ft);
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
		this.#m || (this.#m = !0, A(() => {
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
		if (M === null) {
			let t = M = new e();
			!Tt && !wt && A(() => {
				t.#e || t.flush();
			});
		}
		return M;
	}
	apply() {
		N = null;
	}
	schedule(e) {
		if (Ct = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768)) {
			e.b.defer_effect(e);
			return;
		}
		this.#c.push(e);
	}
	#S() {
		if (this.linked) {
			var e = this.#t, t = this.#n;
			e === null || (e.#n = t), t === null ? xt = e : t.#t = e, this.linked = !1;
		}
	}
};
function jt(e) {
	var t = wt;
	wt = !0;
	try {
		var n;
		for (e && (M !== null && !M.is_fork && M.flush(), n = e());;) {
			if (Ze(), M === null) return n;
			M.flush();
		}
	} finally {
		wt = t;
	}
}
function Mt() {
	try {
		Re();
	} catch (e) {
		B(e, Ct);
	}
}
var Nt = null;
function Pt(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && qn(r) && (Nt = /* @__PURE__ */ new Set(), $n(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && kn(r), Nt?.size > 0)) {
				zt.clear();
				for (let e of Nt) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) Nt.has(n) && (Nt.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || $n(n);
					}
				}
				Nt.clear();
			}
		}
		Nt = null;
	}
}
function Ft(e) {
	M.schedule(e);
}
function It(e, t) {
	if (!(e.f & 32 && e.f & 1024)) {
		e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), j(e, h);
		for (var n = e.first; n !== null;) It(n, t), n = n.next;
	}
}
function Lt(e) {
	j(e, h);
	for (var t = e.first; t !== null;) Lt(t), t = t.next;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/sources.js
var Rt = /* @__PURE__ */ new Set(), zt = /* @__PURE__ */ new Map(), Bt = !1;
function Vt(e, t) {
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
	let n = Vt(e, t);
	return Bn(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function Ht(e, t = !1, n = !0) {
	let r = Vt(e);
	return t || (r.equals = je), r;
}
function F(e, t, n = !1) {
	return U !== null && (!W || U.f & 131072) && Je() && U.f & 4325394 && (zn === null || !zn.has(e)) && He(), Gt(e, n ? Yt(t) : t, Dt);
}
var Ut = null, Wt = 0;
function Gt(e, t, n = null) {
	if (!e.equals(t)) {
		Ln ? zt.set(e, t) : zt.has(e) || zt.set(e, e.v);
		var r = At.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && _t(t), N === null && $e(t);
		}
		e.wv = Kn(), Ut = null, Wt = 0, Jt(e, g, n), Ut = null, Je() && K !== null && K.f & 1024 && !(K.f & 96) && (X === null ? Vn([e]) : X.push(e)), !r.is_fork && Rt.size > 0 && !Bt && Kt();
	}
	return t;
}
function Kt() {
	Bt = !1;
	for (let e of Rt) {
		e.f & 1024 && j(e, _);
		let t;
		try {
			t = qn(e);
		} catch {
			t = !0;
		}
		t && $n(e);
	}
	Rt.clear();
}
function qt(e) {
	F(e, e.v + 1);
}
function Jt(e, t, n) {
	var r = e.reactions;
	if (r !== null) {
		var i = Je(), a = r.length;
		if (Wt += a, Wt > 1e5 && Ut === null && (Ut = /* @__PURE__ */ new Set()), Ut !== null) {
			if (Ut.has(e)) return;
			Ut.add(e);
		}
		for (var o = 0; o < a; o++) {
			var s = r[o], c = s.f;
			if (i || s !== K) {
				var l = (c & g) === 0;
				if (l && j(s, t), c & 131072) Rt.add(s);
				else if (c & 2) {
					var u = s;
					N?.delete(u), Jt(u, _, n);
				} else if (l) {
					var d = s;
					c & 16 && Nt !== null && Nt.add(d), n === null ? Ft(d) : n.push(d);
				}
			}
		}
	}
}
function Yt(t) {
	if (typeof t != "object" || !t || ae in t || oe in t) return t;
	let n = l(t);
	if (n !== s && n !== c) return t;
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ P(0), u = null, d = Wn, f = (e) => {
		if (Wn === d) return e();
		var t = U, n = Wn;
		G(null), Gn(d);
		var r = e();
		return G(t), Gn(n), r;
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
					let e = f(() => /* @__PURE__ */ P(w, u));
					r.set(t, e), qt(o);
				}
			} else F(n, w), qt(o);
			return !0;
		},
		get(e, n, i) {
			if (n === ae) return t;
			var o = r.get(n), s = n in e;
			if (o === void 0 && (!s || a(e, n)?.writable) && (o = f(() => /* @__PURE__ */ P(Yt(s ? e[n] : w), u)), r.set(n, o)), o !== void 0) {
				var c = Z(o);
				return c === w ? void 0 : c;
			}
			return Reflect.get(e, n, i);
		},
		getOwnPropertyDescriptor(e, t) {
			this.has?.(e, t);
			var n = Reflect.getOwnPropertyDescriptor(e, t), i = r.get(t);
			if (i !== void 0) {
				var a = Z(i);
				if (a === w) return;
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
			if (t === ae) return !0;
			var n = r.get(t), i = n !== void 0 && n.v !== w || Reflect.has(e, t);
			return (n !== void 0 || K !== null && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ P(i ? Yt(e[t]) : w, u)), r.set(t, n)), Z(n) === w) ? !1 : i;
		},
		set(e, t, n, s) {
			var c = r.get(t), l = t in e;
			if (i && t === "length") for (var d = n; d < c.v; d += 1) {
				var p = r.get(d + "");
				p === void 0 ? d in e && (p = f(() => /* @__PURE__ */ P(w, u)), r.set(d + "", p)) : F(p, w);
			}
			if (c === void 0) (!l || a(e, t)?.writable) && (c = f(() => /* @__PURE__ */ P(void 0, u)), F(c, Yt(n)), r.set(t, c));
			else {
				l = c.v !== w;
				var m = f(() => Yt(n));
				F(c, m);
			}
			var h = Reflect.getOwnPropertyDescriptor(e, t);
			if (h?.set && h.set.call(s, n), !l) {
				if (i && typeof t == "string") {
					var g = r.get("length"), _ = Number(t);
					Number.isInteger(_) && _ >= g.v && F(g, _ + 1);
				}
				qt(o);
			}
			return !0;
		},
		ownKeys(e) {
			Z(o);
			var t = Reflect.ownKeys(e).filter((e) => {
				var t = r.get(e);
				return t === void 0 || t.v !== w;
			});
			for (var [n, i] of r) i.v !== w && !(n in e) && t.push(n);
			return t;
		},
		setPrototypeOf() {
			Ve();
		}
	});
}
function Xt(e) {
	try {
		if (typeof e == "object" && e && ae in e) return e[ae];
	} catch {}
	return e;
}
function Zt(e, t) {
	return Object.is(Xt(e), Xt(t));
}
var Qt, $t, en, tn;
function nn() {
	if (Qt === void 0) {
		Qt = window, $t = /Firefox/.test(navigator.userAgent);
		var e = Element.prototype, t = Node.prototype, n = Text.prototype;
		en = a(t, "firstChild").get, tn = a(t, "nextSibling").get, u(e) && (e[ue] = void 0, e[le] = null, e[de] = void 0, e.__e = void 0), u(n) && (n[fe] = void 0);
	}
}
function I(e = "") {
	return document.createTextNode(e);
}
/*@__NO_SIDE_EFFECTS__*/
function L(e) {
	return en.call(e);
}
/*@__NO_SIDE_EFFECTS__*/
function R(e) {
	return tn.call(e);
}
function rn(e, t) {
	if (!T) return /* @__PURE__ */ L(e);
	var n = /* @__PURE__ */ L(E);
	if (n === null) n = E.appendChild(I());
	else if (t && n.nodeType !== 3) {
		var r = I();
		return n?.before(r), D(r), r;
	}
	return t && un(n), D(n), n;
}
function an(e, t = !1) {
	if (!T) {
		var n = /* @__PURE__ */ L(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ R(n) : n;
	}
	if (t) {
		if (E?.nodeType !== 3) {
			var r = I();
			return E?.before(r), D(r), r;
		}
		un(E);
	}
	return E;
}
function on(e, t = !1) {
	if (!T) return /* @__PURE__ */ L(e);
	var n = rn(e, t);
	return O(e), n;
}
function z(e, t = 1, n = !1) {
	let r = T ? E : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ R(r);
	if (!T) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = I();
			return r === null ? i?.after(a) : r.before(a), D(a), a;
		}
		un(r);
	}
	return D(r), r;
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
	var t = K;
	if (t === null) return U.f |= ie, e;
	if (!(t.f & 32768) && !(t.f & 4)) throw e;
	B(e, t);
}
function B(e, t) {
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
function fn(e) {
	K === null && (U === null && Le(e), Ie()), Ln && Fe(e);
}
function pn(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function mn(e, t) {
	var n = K;
	n !== null && n.f & 8192 && (e |= v);
	var r = {
		ctx: k,
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
	M?.register_created_effect(r);
	var i = r;
	if (e & 4) Et === null ? At.ensure().schedule(r) : Et.push(r);
	else if (t !== null) {
		try {
			$n(r);
		} catch (e) {
			throw H(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= S));
	}
	if (i !== null && (i.parent = n, n !== null && pn(i, n), U !== null && U.f & 2 && !(e & 64))) {
		var a = U;
		(a.effects ??= []).push(i);
	}
	return r;
}
function hn() {
	return U !== null && !W;
}
function gn(e) {
	let t = mn(8, null);
	return j(t, h), t.teardown = e, t;
}
function _n(e) {
	fn("$effect");
	var t = K.f;
	if (!U && t & 32 && k !== null && !k.i) {
		var n = k;
		(n.e ??= []).push(e);
	} else return vn(e);
}
function vn(e) {
	return mn(4 | ee, e);
}
function yn(e) {
	At.ensure();
	let t = mn(64 | C, e);
	return (e = {}) => new Promise((n) => {
		e.outro ? An(t, () => {
			H(t), n(void 0);
		}) : (H(t), n(void 0));
	});
}
function bn(e) {
	return mn(4, e);
}
function xn(e) {
	return mn(re | C, e);
}
function Sn(e, t = 0) {
	return mn(8 | t, e);
}
function Cn(e, t = [], n = [], r = []) {
	st(r, t, n, (t) => {
		mn(8, () => {
			e(...t.map(Z));
		});
	});
}
function wn(e, t = 0) {
	return mn(16 | t, e);
}
function V(e) {
	return mn(32 | C, e);
}
function Tn(e) {
	var t = e.teardown;
	if (t !== null) {
		let n = Ln, r = U;
		Rn(!0), G(null);
		try {
			t.call(null);
		} catch (t) {
			B(t, e.parent);
		} finally {
			Rn(n), G(r);
		}
	}
}
function En(e, t = !1) {
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
function Dn(e) {
	for (var t = e.first; t !== null;) {
		var n = t.next;
		t.f & 32 || H(t), t = n;
	}
}
function H(e, t = !0) {
	var n = !1;
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (On(e.nodes.start, e.nodes.end), n = !0), e.f |= x, En(e, t && !n), Qn(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	Tn(e), e.f ^= x, e.f |= y;
	var i = e.parent;
	i !== null && i.first !== null && kn(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function On(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ R(e);
		e.remove(), e = n;
	}
}
function kn(e) {
	var t = e.parent, n = e.prev, r = e.next;
	n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n));
}
function An(e, t, n = !0) {
	var r = [];
	e.f |= 256, jn(e, r, !0);
	var i = () => {
		n && H(e), t && t();
	}, a = r.length;
	if (a > 0) {
		var o = () => --a || i();
		for (var s of r) s.out(o);
	} else i();
}
function jn(e, t, n) {
	if (!(e.f & 8192)) {
		e.f ^= v;
		var r = e.nodes && e.nodes.t;
		if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
		for (var i = e.first; i !== null;) {
			var a = i.next;
			if (!(i.f & 64)) {
				var o = !!(i.f & 65536) || !!(i.f & 32) && !!(e.f & 16);
				jn(i, t, o ? n : !1);
			}
			i = a;
		}
	}
}
function Mn(e) {
	e.f &= -257, Nn(e, !0);
}
function Nn(e, t) {
	if (!(e.f & 256) && e.f & 8192) {
		e.f ^= v, e.f & 1024 || (j(e, g), At.ensure().schedule(e));
		for (var n = e.first; n !== null;) {
			var r = n.next, i = !!(n.f & 65536) || !!(n.f & 32);
			Nn(n, i ? t : !1), n = r;
		}
		var a = e.nodes && e.nodes.t;
		if (a !== null) for (let e of a) (e.is_global || t) && e.in();
	}
}
function Pn(e, t) {
	if (e.nodes) for (var n = e.nodes.start, r = e.nodes.end; n !== null;) {
		var i = n === r ? null : /* @__PURE__ */ R(n);
		t.append(n), n = i;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/legacy.js
var Fn = null, In = !1, Ln = !1;
function Rn(e) {
	Ln = e;
}
var U = null, W = !1;
function G(e) {
	U = e;
}
var K = null;
function q(e) {
	K = e;
}
var zn = null;
function Bn(e) {
	U !== null && (U.f & 2097152 || U.f & 2) && (zn ??= /* @__PURE__ */ new Set()).add(e);
}
var J = null, Y = 0, X = null;
function Vn(e) {
	X = e;
}
var Hn = 1, Un = 0, Wn = Un;
function Gn(e) {
	Wn = e;
}
function Kn() {
	return ++Hn;
}
function qn(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (qn(a) && vt(a), a.wv > e.wv) return !0;
		}
		t & 512 && N === null && j(e, h);
	}
	return !1;
}
function Jn(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(zn !== null && zn.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? Jn(a, t, !1) : t === a && (n ? j(a, g) : a.f & 1024 && j(a, _), Ft(a));
	}
}
function Yn(e) {
	var t = J, n = Y, r = X, i = U, a = zn, o = k, s = W, c = Wn, l = e.f;
	J = null, Y = 0, X = null, U = l & 96 ? null : e, zn = null, We(e.ctx), W = !1, Wn = ++Un, e.ac !== null && (at(() => {
		e.ac.abort(me);
	}), e.ac = null);
	try {
		e.f |= ne;
		var u = e.fn, d = u();
		e.f |= b;
		var f = Xn(e);
		if (Je() && X !== null && !W && f !== null && !(e.f & 6146)) for (var p = 0; p < X.length; p++) Jn(X[p], e);
		if (i !== null && i !== e) {
			if (Un++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = Un;
			if (t !== null) for (let e of t) e.rv = Un;
			X !== null && (r === null ? r = X : r.push(...X));
		}
		return e.f & 8388608 && (e.f ^= ie), d;
	} catch (t) {
		return Xn(e), dn(t);
	} finally {
		e.f ^= ne, J = t, Y = n, X = r, U = i, zn = a, We(o), W = s, Wn = c;
	}
}
function Xn(e) {
	var t = e.deps, n = M?.is_fork;
	if (J !== null) {
		var r;
		if (n || Qn(e, Y), t !== null && Y > 0) for (t.length = Y + J.length, r = 0; r < J.length; r++) t[Y + r] = J[r];
		else e.deps = t = J;
		if (hn() && e.f & 512) for (r = Y; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && Y < t.length && (Qn(e, Y), t.length = Y);
	return t;
}
function Zn(e, r) {
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
		s.f & 512 && (s.f ^= 512), s.v !== w && $e(s), s.ac !== null && at(() => {
			s.ac.abort(me), s.ac = null, j(s, g);
		}), yt(s), Qn(s, 0);
	}
}
function Qn(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) Zn(e, n[r]);
}
function $n(e) {
	var t = e.f;
	if (!(t & 16384)) {
		j(e, h);
		var n = K, r = In;
		K = e, In = !(t & 96);
		try {
			t & 16777232 ? Dn(e) : En(e), Tn(e);
			var i = Yn(e);
			e.teardown = typeof i == "function" ? i : null, e.wv = Hn;
		} finally {
			In = r, K = n;
		}
	}
}
async function er() {
	await Promise.resolve(), jt();
}
function Z(e) {
	var t = !!(e.f & 2);
	if (Fn?.add(e), U !== null && !W && !(K !== null && K.f & 16384) && (zn === null || !zn.has(e))) {
		var r = U.deps;
		if (U.f & 2097152) e.rv < Un && (e.rv = Un, J === null && r !== null && r[Y] === e ? Y++ : J === null ? J = [e] : J.push(e));
		else {
			U.deps ??= [], n.call(U.deps, e) || U.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [U] : n.call(i, U) || i.push(U);
		}
	}
	if (Ln && zt.has(e)) return zt.get(e);
	if (t) {
		var a = e;
		if (Ln) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || nr(a)) && (o = _t(a)), zt.set(a, o), o;
		}
		var s = !(a.f & 512) && !W && U !== null && (In || !!(U.f & 512)), c = (a.f & b) === 0;
		qn(a) && (s && (a.f |= 512), vt(a)), s && !c && (bt(a), tr(a));
	}
	if (N?.has(e)) return N.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function tr(e) {
	if (e.f |= 512, e.deps !== null) for (let t of e.deps) (t.reactions ??= []).push(e), t.f & 2 && !(t.f & 512) && (bt(t), tr(t));
}
function nr(e) {
	if (e.v === w) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (zt.has(t) || t.f & 2 && nr(t)) return !0;
	return !1;
}
function rr(e) {
	var t = W;
	try {
		return W = !0, e();
	} finally {
		W = t;
	}
}
[.../* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split(".")];
var ir = ["touchstart", "touchmove"];
function ar(e) {
	return ir.includes(e);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dev/css.js
var or = Symbol("events"), sr = /* @__PURE__ */ new Set(), cr = /* @__PURE__ */ new Set();
function lr(e) {
	if (!T) return;
	e.removeAttribute("onload"), e.removeAttribute("onerror");
	let t = e.__e;
	t !== void 0 && (e.__e = void 0, queueMicrotask(() => {
		e.isConnected && e.dispatchEvent(t);
	}));
}
function ur(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || gr.call(t, e), !e.cancelBubble) return at(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, A(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function dr(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = ur(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && gn(() => {
		o.__removed = !0, t.removeEventListener(e, o, a);
	});
}
function fr(e, t, n) {
	(t[or] ??= {})[e] = n;
}
function pr(e) {
	for (var t = 0; t < e.length; t++) sr.add(e[t]);
	for (var n of cr) n(e);
}
var mr = null, hr = !1;
function gr(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	mr = e, hr || (hr = !0, setTimeout(() => {
		hr = !1, mr = null;
	}));
	var s = 0, c = mr === e && e[or];
	if (c) {
		var l = a.indexOf(c);
		if (l !== -1 && (t === document || t === window)) {
			e[or] = t;
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
					var h = o[or]?.[r];
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
			e[or] = t, delete e.currentTarget, G(d), q(f);
		}
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/reconciler.js
var _r = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function vr(e) {
	return _r?.createHTML(e) ?? e;
}
function yr(e) {
	var t = ln("template");
	return t.innerHTML = vr(e.replaceAll("<!>", "<!---->")), t.content;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/template.js
function Q(e, t) {
	var n = K;
	n.nodes === null && (n.nodes = {
		start: e,
		end: t,
		a: null,
		t: null
	});
}
/*#__NO_SIDE_EFFECTS__*/
function br(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (T) return Q(E, null), E;
		i === void 0 && (i = yr(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ L(i)));
		var t = r || $t ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ L(t), s = t.lastChild;
			Q(o, s);
		} else Q(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function xr(e, t, n = "svg") {
	var r = !e.startsWith("<!>"), i = !!(t & 1), a = `<${n}>${r ? e : "<!>" + e}</${n}>`, o;
	return () => {
		if (T) return Q(E, null), E;
		if (!o) {
			var e = /* @__PURE__ */ L(yr(a));
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
function Sr(e, t) {
	return /* @__PURE__ */ xr(e, t, "svg");
}
function Cr(e = "") {
	if (!T) {
		var t = I(e + "");
		return Q(t, t), t;
	}
	var n = E;
	return n.nodeType === 3 ? un(n) : (n.before(n = I()), D(n)), Q(n, n), n;
}
function wr() {
	if (T) return Q(E, null), E;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = I();
	return e.append(t, n), Q(t, n), e;
}
function Tr(e, t) {
	if (T) {
		var n = K;
		(!(n.f & 32768) || n.nodes.end === null) && (n.nodes.end = E), Te();
		return;
	}
	e !== null && e.before(t);
}
//#endregion
//#region ui/node_modules/svelte/src/reactivity/create-subscriber.js
function Er(e) {
	let t = 0, n = Vt(0), r;
	return () => {
		hn() && (Z(n), Sn(() => (t === 0 && (r = rr(() => e(() => qt(n)))), t += 1, () => {
			A(() => {
				--t, t === 0 && (r?.(), r = void 0, qt(n));
			});
		})));
	};
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var Dr = S | C;
function Or(e, t, n, r) {
	new kr(e, t, n, r);
}
var kr = class {
	parent;
	is_pending = !1;
	transform_error;
	#e;
	#t = T ? E : null;
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
	#h = Er(() => (this.#m = Vt(this.#l), () => {
		this.#m = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = K;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = K.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = wn(() => {
			if (T) {
				let e = this.#t;
				Te();
				let t = e.data === "[!";
				if (e.data.startsWith("[?")) {
					let t = JSON.parse(e.data.slice(2));
					this.#_(t);
				} else t ? this.#y() : this.#g();
			} else this.#b();
		}, Dr), T && (this.#e = E);
	}
	#g() {
		try {
			this.#a = V(() => this.#r(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#_(e) {
		let t = this.#n.failed, { reset: n, invoke_onerror: r } = this.#v(e);
		A(r), t && (this.#s = V(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#v(e) {
		var t = !1, n = !1;
		let r = () => {
			if (t) {
				Ce();
				return;
			}
			t = !0, n && Ue(), this.#s !== null && An(this.#s, () => {
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
					B(e, this.#i && this.#i.parent);
				}
			}
		};
	}
	#y() {
		let e = this.#n.pending;
		e && (this.is_pending = !0, this.#o = V(() => e(this.#e)), A(() => {
			var e = this.#c = document.createDocumentFragment(), t = I(), n = !1;
			if (e.append(t), this.#a = this.#S(() => {
				try {
					return V(() => this.#r(t));
				} catch (e) {
					try {
						this.error(e), n = !0;
					} catch (e) {
						B(e, this.#i.parent);
					}
					return null;
				}
			}), this.#a === null) {
				this.#c = null, n && this.#x(M);
				return;
			}
			this.#u === 0 && (this.#e.before(e), this.#c = null, An(this.#o, () => {
				this.#o = null;
			}), this.#x(M));
		}));
	}
	#b() {
		try {
			if (this.is_pending = this.has_pending_snippet(), this.#u = 0, this.#l = 0, this.#a = V(() => {
				this.#r(this.#e);
			}), this.#u > 0) {
				var e = this.#c = document.createDocumentFragment();
				Pn(this.#a, e);
				let t = this.#n.pending;
				this.#o = V(() => t(this.#e));
			} else this.#x(M);
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
		var t = K, n = U, r = k;
		q(this.#i), G(this.#i), We(this.#i.ctx);
		try {
			return At.ensure(), e();
		} finally {
			q(t), G(n), We(r);
		}
	}
	#C(e, t) {
		if (!this.has_pending_snippet()) {
			this.parent && this.parent.#C(e, t);
			return;
		}
		this.#u += e, this.#u === 0 && (this.#x(t), this.#o && An(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null));
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !(!this.#m || this.#d) && (this.#d = !0, A(() => {
			this.#d = !1, this.#m && Gt(this.#m, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#h(), Z(this.#m);
	}
	error(e) {
		if (!this.#n.onerror && !this.#n.failed) throw e;
		M?.is_fork ? (this.#a && M.skip_effect(this.#a), this.#o && M.skip_effect(this.#o), this.#s && M.skip_effect(this.#s), M.oncommit(() => {
			this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (H(this.#a), null), this.#o &&= (H(this.#o), null), this.#s &&= (H(this.#s), null), T && (D(this.#t), Ee(), D(De()));
		let t = this.#n.failed, n = (e) => {
			let { reset: n, invoke_onerror: r } = this.#v(e);
			r(), t && (this.#s = this.#S(() => {
				try {
					return V(() => {
						var r = K;
						r.b = this, r.f |= 128, t(this.#e, () => e, () => n);
					});
				} catch (e) {
					return B(e, this.#i.parent), null;
				}
			}));
		};
		A(() => {
			var t;
			try {
				t = this.transform_error(e);
			} catch (e) {
				B(e, this.#i && this.#i.parent);
				return;
			}
			typeof t == "object" && t && typeof t.then == "function" ? t.then(n, (e) => B(e, this.#i && this.#i.parent)) : n(t);
		});
	}
};
function Ar(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[fe] ??= e.nodeValue) && (e[fe] = n, e.nodeValue = `${n}`);
}
function jr(e, t) {
	return Nr(e, t);
}
var Mr = /* @__PURE__ */ new Map();
function Nr(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	nn();
	var l = void 0, u = yn(() => {
		var s = n ?? t.appendChild(I());
		Or(s, { pending: () => {} }, (t) => {
			Ge({});
			var n = k;
			if (o && (n.c = o), a && (i.$$events = a), T && Q(t, null), l = e(t, i) || qe(), T && (K.nodes.end = E, E === null || E.nodeType !== 8 || E.data !== "]")) throw xe(), ge;
			Ke();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = ar(r);
					for (let e of [t, document]) {
						var a = Mr.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), Mr.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, gr, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(sr)), cr.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = Mr.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, gr), r.delete(e), r.size === 0 && Mr.delete(n)) : r.set(e, i);
			}
			cr.delete(d), s !== n && s.parentNode?.removeChild(s);
		};
	});
	return Pr.set(l, u), l;
}
var Pr = /* @__PURE__ */ new WeakMap();
function Fr(e, t) {
	let n = Pr.get(e);
	return n ? (Pr.delete(e), n(t)) : Promise.resolve();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/branches.js
var Ir = class {
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
			if (n) Mn(n), this.#r.delete(t);
			else {
				var r = this.#n.get(t);
				r && (Mn(r.effect), this.#t.set(t, r.effect), this.#n.delete(t), r.fragment.lastChild.remove(), this.anchor.before(r.fragment), n = r.effect);
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
						Pn(r, t), t.append(I()), this.#n.set(e, {
							effect: r,
							fragment: t
						});
					} else H(r);
					this.#r.delete(e), this.#t.delete(e);
				};
				this.#i || !n ? (this.#r.add(e), An(r, i, !1)) : i();
			}
		}
	};
	#o = (e) => {
		this.#e.delete(e);
		let t = Array.from(this.#e.values());
		for (let [e, n] of this.#n) t.includes(e) || (H(n.effect), this.#n.delete(e));
	};
	ensure(e, t) {
		var n = M, r = cn();
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
		} else T && (this.anchor = E), this.#a(n);
	}
};
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/if.js
function Lr(e, t, n = !1) {
	var r;
	T && (r = E, Te());
	var i = new Ir(e), a = n ? S : 0;
	function o(e, t) {
		if (T) {
			var n = Oe(r);
			if (e !== parseInt(n.substring(1))) {
				var a = De();
				D(a), i.anchor = a, we(!1), i.ensure(e, t), we(!0);
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/each.js
function Rr(e, t) {
	return t;
}
function zr(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		An(n, () => {
			if (o) {
				if (o.pending.delete(n), o.done.add(n), o.pending.size === 0) {
					var t = e.outrogroups;
					Br(e, r(o.done)), t.delete(o), t.size === 0 && (e.outrogroups = null);
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
		Br(e, t, !l);
	} else o = {
		pending: new Set(t),
		done: /* @__PURE__ */ new Set()
	}, (e.outrogroups ??= /* @__PURE__ */ new Set()).add(o);
}
function Br(e, t, n = !0) {
	var r;
	if (e.pending.size > 0) {
		r = /* @__PURE__ */ new Set();
		for (let t of e.pending.values()) for (let n of t) r.add(e.items.get(n).e);
	}
	for (var i = 0; i < t.length; i++) {
		var a = t[i];
		r?.has(a) ? (a.f |= te, Pn(a, document.createDocumentFragment())) : H(t[i], n);
	}
}
var Vr;
function Hr(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = T ? D(/* @__PURE__ */ L(u)) : u.appendChild(I());
	}
	T && Te();
	var d = null, f = /* @__PURE__ */ ht(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p, m = /* @__PURE__ */ new Map(), h = !0;
	function g(e) {
		v.effect.f & 16384 || (v.pending.delete(e), v.fallback = d, Wr(v, p, c, n, a), d !== null && (p.length === 0 ? d.f & 33554432 ? (d.f ^= te, Kr(d, null, c)) : Mn(d) : An(d, () => {
			d = null;
		})));
	}
	function _(e) {
		v.pending.delete(e);
	}
	var v = {
		effect: wn(() => {
			p = Z(f);
			var e = p.length;
			let t = !1;
			T && Oe(c) === "[!" != (e === 0) && (c = De(), D(c), we(!1), t = !0);
			for (var r = /* @__PURE__ */ new Set(), u = M, v = cn(), y = 0; y < e; y += 1) {
				T && E.nodeType === 8 && E.data === "]" && (c = E, t = !0, we(!1));
				var b = p[y], x = a(b, y), S = h ? null : l.get(x);
				S ? (S.v && Gt(S.v, b), S.i && Gt(S.i, y), v && u.unskip_effect(S.e)) : (S = Gr(l, h ? c : Vr ??= I(), b, x, y, o, n, i), h || (S.e.f |= te), l.set(x, S)), r.add(x);
			}
			if (e === 0 && s && !d && (h ? d = V(() => s(c)) : (d = V(() => s(Vr ??= I())), d.f |= te)), e > r.size && Pe("", "", ""), T && e > 0 && D(De()), !h) {
				if (m.set(u, r), v) {
					for (let [e, t] of l) r.has(e) || u.skip_effect(t.e);
					u.oncommit(g), u.ondiscard(_);
				} else g(u);
			}
			t && we(!0), Z(f);
		}),
		flags: n,
		items: l,
		pending: m,
		outrogroups: null,
		fallback: d
	};
	h = !1, T && (c = E);
}
function Ur(e) {
	for (; e !== null && !(e.f & 32);) e = e.next;
	return e;
}
function Wr(e, t, n, i, a) {
	var o = !!(i & 8), s = t.length, c = e.items, l = Ur(e.effect.first), u, d = null, f, p = [], m = [], h, g, _, v;
	if (o) for (v = 0; v < s; v += 1) h = t[v], g = a(h, v), _ = c.get(g).e, _.f & 33554432 || (_.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(_));
	for (v = 0; v < s; v += 1) {
		if (h = t[v], g = a(h, v), _ = c.get(g).e, e.outrogroups !== null) for (let t of e.outrogroups) t.pending.delete(_), t.done.delete(_);
		if (_.f & 8192 && (Mn(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= te, _ === l) Kr(_, null, n);
			else {
				var y = d ? d.next : l;
				_ === e.effect.last && (e.effect.last = _.prev), _.prev && (_.prev.next = _.next), _.next && (_.next.prev = _.prev), qr(e, d, _), qr(e, _, y), Kr(_, y, n), d = _, p = [], m = [], l = Ur(d.next);
				continue;
			}
		}
		if (_ !== l) {
			if (u !== void 0 && u.has(_)) {
				if (p.length < m.length) {
					var b = m[0], x;
					d = b.prev;
					var S = p[0], C = p[p.length - 1];
					for (x = 0; x < p.length; x += 1) Kr(p[x], b, n);
					for (x = 0; x < m.length; x += 1) u.delete(m[x]);
					qr(e, S.prev, C.next), qr(e, d, S), qr(e, C, b), l = b, d = C, --v, p = [], m = [];
				} else u.delete(_), Kr(_, l, n), qr(e, _.prev, _.next), qr(e, _, d === null ? e.effect.first : d.next), qr(e, d, _), d = _;
				continue;
			}
			for (p = [], m = []; l !== null && l !== _;) (u ??= /* @__PURE__ */ new Set()).add(l), m.push(l), l = Ur(l.next);
			if (l === null) continue;
		}
		_.f & 33554432 || p.push(_), d = _, l = Ur(_.next);
	}
	if (e.outrogroups !== null) {
		for (let t of e.outrogroups) t.pending.size === 0 && (Br(e, r(t.done)), e.outrogroups?.delete(t));
		e.outrogroups.size === 0 && (e.outrogroups = null);
	}
	if (l !== null || u !== void 0) {
		var ee = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || ee.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && ee.push(l), l = Ur(l.next);
		var ne = ee.length;
		if (ne > 0) {
			var re = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < ne; v += 1) ee[v].nodes?.a?.measure();
				for (v = 0; v < ne; v += 1) ee[v].nodes?.a?.fix();
			}
			zr(e, ee, re);
		}
	}
	o && A(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function Gr(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? Vt(n) : /* @__PURE__ */ Ht(n, !1, !1) : null, l = o & 2 ? Vt(i) : null;
	return {
		v: c,
		i: l,
		e: V(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function Kr(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ R(r);
		if (a.before(r), r === i) return;
		r = o;
	}
}
function qr(e, t, n) {
	t === null ? e.effect.first = n : t.next = n, n === null ? e.effect.last = t : n.prev = t;
}
function Jr(e, t, n = !1, r = !1, i = !1, a = !1) {
	var o = e, s = "";
	if (n) {
		var c = e;
		T && (o = D(/* @__PURE__ */ L(c)));
	}
	Cn(() => {
		var e = K;
		if (s === (s = t() ?? "")) {
			T && Te();
			return;
		}
		if (n && !T) {
			e.nodes = null, c.innerHTML = s, s !== "" && Q(/* @__PURE__ */ L(c), c.lastChild);
			return;
		}
		if (e.nodes !== null && (On(e.nodes.start, e.nodes.end), e.nodes = null), s !== "") {
			if (T) {
				for (var a = E.data, l = Te(), u = l; l !== null && (l.nodeType !== 8 || l.data !== "");) u = l, l = /* @__PURE__ */ R(l);
				if (l === null) throw xe(), ge;
				Q(E, u), o = D(l);
				return;
			}
			var d = ln(r ? "svg" : i ? "math" : "template", r ? ve : i ? ye : void 0);
			d.innerHTML = s;
			var f = r || i ? d : d.content;
			if (Q(/* @__PURE__ */ L(f), f.lastChild), r || i) for (; /* @__PURE__ */ L(f);) o.before(/* @__PURE__ */ L(f));
			else o.before(f);
		}
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/css.js
function Yr(e, t) {
	bn(() => {
		e = K?.parent?.nodes?.start ?? e;
		var n = e.getRootNode(), r = n.host ? n : n.head ?? n.ownerDocument.head;
		if (!r.querySelector("#" + t.hash)) {
			let e = ln("style");
			e.id = t.hash, e.textContent = t.code, r.appendChild(e);
		}
	});
}
//#endregion
//#region ui/node_modules/clsx/dist/clsx.mjs
function Xr(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") {
		if (Array.isArray(e)) {
			var i = e.length;
			for (t = 0; t < i; t++) e[t] && (n = Xr(e[t])) && (r && (r += " "), r += n);
		} else for (n in e) e[n] && (r && (r += " "), r += n);
	}
	return r;
}
function Zr() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = Xr(e)) && (r && (r += " "), r += t);
	return r;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/shared/attributes.js
function Qr(e) {
	return typeof e == "object" ? Zr(e) : e ?? "";
}
var $r = [..." 	\n\r\f\xA0\v﻿"];
function ei(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || $r.includes(r[o - 1])) && (s === r.length || $r.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function ti(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function ni(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function ri(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map(ni)), i && c.push(...Object.keys(i).map(ni));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = ni(e.substring(l, u).trim());
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
		return r && (n += ti(r)), i && (n += ti(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/class.js
function ii(e, t, n, r, i, a) {
	var o = e[ue];
	if (T || o !== n || o === void 0) {
		var s = ei(n, r, a);
		(!T || s !== e.getAttribute("class")) && (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[ue] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/style.js
function ai(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function oi(e, t, n, r) {
	var i = e[de];
	if (T || i !== t) {
		var a = ri(t, r);
		(!T || a !== e.getAttribute("style")) && (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[de] = t;
	} else r && (Array.isArray(r) ? (ai(e, n?.[0], r[0]), ai(e, n?.[1], r[1], "important")) : ai(e, n, r));
	return r;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
function si(e, t) {
	t ? e.hasAttribute("selected") || e.setAttribute("selected", "") : e.removeAttribute("selected");
}
function ci(t, n) {
	var r = t.__defaultValue, i = t.multiple, a = i ? r ?? [] : null;
	if (!i || e(a)) {
		var o = t.selectedIndex, s = n && i ? new Set(t.selectedOptions) : null;
		for (var c of t.options) {
			var l = di(c);
			si(c, i ? a.includes(l) : Zt(l, r));
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
function li(t, n, r = !1) {
	if (t.multiple) {
		if (n == null) return;
		if (!e(n)) return Se();
		for (var i of t.options) i.selected = n.includes(di(i));
		return;
	}
	for (i of t.options) if (Zt(di(i), n)) {
		i.selected = !0;
		return;
	}
	(!r || n !== void 0) && (t.selectedIndex = -1);
}
function ui(e) {
	var t = new MutationObserver((t) => {
		t.every(fi) || ("__defaultValue" in e && ci(e, !1), "__value" in e && li(e, e.__value));
	});
	t.observe(e, {
		childList: !0,
		subtree: !0,
		attributes: !0,
		attributeFilter: ["value"]
	}), gn(() => {
		t.disconnect();
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/attributes.js
var pi = Symbol("is custom element"), mi = Symbol("is html"), hi = he ? "link" : "LINK", gi = he ? "progress" : "PROGRESS";
function _i(e) {
	if (T) {
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
		e[pe] = n, A(n), it();
	}
}
function vi(e, t) {
	var n = yi(e);
	n.value !== (n.value = t ?? void 0) && (e.value !== t || t === 0 && e.nodeName === gi) && (e.value = t ?? "");
}
function $(e, t, n, r) {
	var i = yi(e);
	T && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === hi) || i[t] !== (i[t] = n) && (t === "loading" && (e[ce] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && xi(e).has(t) ? e[t] = n : e.setAttribute(t, n));
}
function yi(e) {
	return e[le] ??= {
		[pi]: e.nodeName.includes("-"),
		[mi]: e.namespaceURI === _e
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function Si(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet();
	ot(e, "input", async (i) => {
		var a = i ? e.defaultValue : e.value;
		if (a = Ci(e) ? wi(a) : a, n(a), M !== null && r.add(M), await er(), a !== (a = t())) {
			var o = e.selectionStart, s = e.selectionEnd, c = e.value.length;
			if (e.value = a ?? "", s !== null) {
				var l = e.value.length;
				o === s && s === c && l > c ? (e.selectionStart = l, e.selectionEnd = l) : (e.selectionStart = o, e.selectionEnd = Math.min(s, l));
			}
		}
	}), (T && e.defaultValue !== e.value || rr(t) == null && e.value) && (n(Ci(e) ? wi(e.value) : e.value), M !== null && r.add(M)), Sn(() => {
		var n = t();
		if (e === document.activeElement) {
			var i = M;
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
	bn(() => (rr(() => n(e[t])), r));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function Di(e, t) {
	return e === t || e?.[ae] === t;
}
function Oi(e = qe(), t, n, r) {
	var i = k.r, a = K;
	return bn(() => {
		var o, s;
		return Sn(() => {
			o = s, s = r?.() || [], rr(() => {
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/store.js
var ki = !1;
function Ai(e) {
	var t = ki;
	try {
		return ki = !1, [e(), ki];
	} finally {
		ki = t;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/props.js
function ji(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ dt(r), Z(u)) : (l && (l = !1, c = s ? rr(r) : r), c);
	let f;
	if (o) {
		var p = ae in e || se in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = Ai(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && ze(t), f(m)));
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
	var v = !1, y = (n & 1 ? dt : ht)(() => (v = !1, g()));
	o && Z(y);
	var b = K;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? Z(y) : i && o ? Yt(e) : e;
			return F(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return Ln && v || b.f & 16384 ? y.v : Z(y);
	});
}
function Mi(e) {
	k === null && Me("onMount"), _n(() => {
		let t = rr(e);
		if (typeof t == "function") return t;
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
//#endregion
//#region plugins/stable/email/ui/src/Icon.svelte
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
	keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10"
}, Pi = /* @__PURE__ */ Sr("<svg class=\"icon svelte-jfnn1v\" viewBox=\"0 0 24 24\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg>"), Fi = {
	hash: "svelte-jfnn1v",
	code: ".icon.svelte-jfnn1v {flex:none;display:block;}"
};
function Ii(e, t) {
	Yr(e, Fi);
	let n = ji(t, "size", 3, 16), r = ji(t, "title", 3, ""), i = ji(t, "filled", 3, !1);
	var a = Pi(), o = on(a);
	Cn(() => {
		$(a, "width", n()), $(a, "height", n()), $(a, "fill", i() ? "currentColor" : "none"), $(a, "aria-hidden", r() ? void 0 : "true"), $(a, "role", r() ? "img" : void 0), $(a, "aria-label", r() || void 0), $(o, "d", Ni[t.name] ?? Ni.folder);
	}), Tr(e, a);
}
//#endregion
//#region plugins/stable/email/ui/src/api.ts
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
	let a = n.match(/^(today|tomorrow|mon|tue|wed|thu|fri|sat|sun)\w*\s*(\d{1,2})?(?::(\d{2}))?$/);
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
		].indexOf(a[1]);
		o.setDate(o.getDate() + ((e - o.getDay() + 7) % 7 || 7));
	}
	return o.setHours(a[2] ? Number(a[2]) : 8, a[3] ? Number(a[3]) : 0, 0, 0), Math.floor(o.getTime() / 1e3);
}
var Zi = (e, t, n) => typeof e.confirm == "function" ? e.confirm(t, n) : Promise.resolve(window.confirm(t)), Qi = (e, t, n = "") => typeof e.input == "function" ? e.input(t, { value: n }) : Promise.resolve(window.prompt(t, n)?.trim() || null), $i = /* @__PURE__ */ br("<iframe class=\"frame svelte-lnhtx6\" title=\"The message\" sandbox=\"allow-same-origin allow-popups allow-popups-to-escape-sandbox\" scrolling=\"no\"></iframe>"), ea = {
	hash: "svelte-lnhtx6",
	code: ".frame.svelte-lnhtx6 {display:block;width:100%;border:0;background:transparent;color-scheme:normal;}"
};
function ta(e, t) {
	Ge(t, !0), Yr(e, ea);
	let n = ji(t, "plain", 3, !1), r = ji(t, "remote", 3, !1), i = ji(t, "dark", 3, !1), a = ji(t, "prose", 3, ""), o = /* @__PURE__ */ P(void 0), s = /* @__PURE__ */ P(80), c = [
		".gmail_quote",
		"blockquote[type=cite]",
		".yahoo_quoted",
		"#appendonsend",
		"#divRplyFwdMsg",
		"#mail-editor-reference-message-container",
		".moz-cite-prefix",
		"div[style*='border-top:solid #E1E1E1']",
		"div[style*='border-top: solid #E1E1E1']",
		"div[style*='border-top:solid #B5C4DF']",
		".atlas-quote"
	].join(",");
	function l(e) {
		let t = e.body, n = t.querySelector(c);
		if (!n || !n.parentNode || n.closest("details") || !(t.textContent ?? "").split(n.textContent ?? "")[0].trim()) return;
		let r = n.matches("#appendonsend, #divRplyFwdMsg, .moz-cite-prefix, div[style*='border-top']") || /wrote:\s*$|a écrit\s*:\s*$|escribió:\s*$/i.test(n.previousSibling?.textContent ?? ""), i = [], a = n, o = n.previousElementSibling;
		o && /wrote:\s*$|a écrit\s*:?\s*$|escribió:\s*$|schrieb.*:\s*$/i.test(o.textContent ?? "") && (o.textContent ?? "").length < 300 && (a = o);
		for (let e = a; e && (i.push(e), r || e !== n); e = e.nextSibling);
		let s = e.createElement("details"), l = e.createElement("summary");
		s.className = "atlas-quoted", l.textContent = "···", l.title = "Show the earlier messages", a.parentNode.insertBefore(s, a), s.append(l, ...i);
	}
	function u(e) {
		let t = e.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?\)/);
		return t ? [
			Number(t[1]),
			Number(t[2]),
			Number(t[3]),
			t[4] === void 0 ? 1 : Number(t[4])
		] : null;
	}
	function d(e, t, n) {
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
	let f = (e, t, n, r) => `hsla(${e.toFixed(0)}, ${(t * 100).toFixed(0)}%, ${(n * 100).toFixed(0)}%, ${r})`;
	function p(e) {
		let t = u(e);
		if (!t || t[3] === 0) return null;
		let [n, r, i] = d(t[0], t[1], t[2]);
		return i < .35 ? null : f(n, r * .55, .09 + (1 - i) * .35, t[3]);
	}
	function m(e) {
		let t = u(e);
		if (!t) return null;
		let [n, r, i] = d(t[0], t[1], t[2]);
		return i > .6 ? null : f(n, Math.min(r, .7), .92 - i * .4, t[3]);
	}
	function h(e) {
		let t = e.defaultView;
		if (t) for (let n of Array.from(e.body.querySelectorAll("*"))) {
			if (n instanceof t.HTMLImageElement || n.tagName === "PICTURE" || n.tagName === "VIDEO") continue;
			let e = t.getComputedStyle(n), r = p(e.backgroundColor);
			r && n.style.setProperty("background-color", r, "important");
			let i = m(e.color);
			i && n.style.setProperty("color", i, "important");
			for (let t of [
				"Top",
				"Right",
				"Bottom",
				"Left"
			]) {
				let r = e.getPropertyValue(`border-${t.toLowerCase()}-width`);
				if (r && r !== "0px") {
					let r = m(e.getPropertyValue(`border-${t.toLowerCase()}-color`));
					r && n.style.setProperty(`border-${t.toLowerCase()}-color`, r, "important");
				}
			}
			e.backgroundImage !== "none" && n.style.setProperty("filter", "brightness(.9)"), n.hasAttribute("bgcolor") && n.removeAttribute("bgcolor");
		}
	}
	let g = /* @__PURE__ */ mt(() => {
		let e = r() ? "data: https: http:" : "data:", o = `default-src 'none'; style-src 'unsafe-inline'${r() ? " https: http:" : ""}; img-src ${e}; font-src data:${r() ? " https:" : ""}; media-src 'none'; form-action 'none'`, s = i() ? "#1b1d22" : "#ffffff", c = i() ? "#dcdfe5" : "#1d1d1f", l = n() ? `${a() || "Georgia, serif"}` : "system-ui, -apple-system, 'Segoe UI', sans-serif";
		return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${o}"><base target="_blank"><meta name="color-scheme" content="${i() ? "dark" : "light"}">
<style>
html{overflow-y:hidden;background:${s}}
body{margin:0;padding:4px 2px 8px;font:14px/1.55 ${l};color:${c};background:${s};overflow-wrap:anywhere;overflow-x:auto}
img{max-width:100%;height:auto}
img:not([src]),img[src^="http"]:not([data-ok]){min-height:0}
a{color:${i() ? "#8aa4ff" : "#2557d6"}}
blockquote{margin:.5em 0 .5em .2em;padding-left:.9em;border-left:3px solid ${i() ? "#3a3f4a" : "#d6d9de"};color:${i() ? "#aab0bb" : "#555b66"}}
blockquote blockquote{border-left-color:${i() ? "#4a5060" : "#c3c7cf"}}
.atlas-plain{white-space:normal;font-size:15px;line-height:1.6;max-width:72ch}
.atlas-signature{color:${i() ? "#8a919d" : "#7a808a"};font-size:.92em}
pre.atlas-text{white-space:pre-wrap;font:inherit}
details.atlas-quoted>summary{display:inline-block;cursor:pointer;list-style:none;padding:0 8px;margin:6px 0;border-radius:6px;background:${i() ? "#2a2e36" : "#eceef1"};color:${i() ? "#aab0bb" : "#5b616b"};font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.1em}
details.atlas-quoted>summary::-webkit-details-marker{display:none}
details.atlas-quoted[open]>summary{margin-bottom:8px}
table{max-width:100%}
</style></head><body>${t.html}</body></html>`;
	});
	function _() {
		let e = Z(o)?.contentDocument;
		if (!e?.body) return;
		l(e), i() && !n() && h(e);
		let t = () => {
			F(s, Math.max(40, e.documentElement.scrollHeight), !0);
		};
		t(), new ResizeObserver(t).observe(e.documentElement);
		for (let n of Array.from(e.images)) n.addEventListener("load", t);
		e.addEventListener("toggle", t, !0);
	}
	var v = $i();
	let y;
	Oi(v, (e) => F(o, e), () => Z(o)), Cn(() => {
		$(v, "srcdoc", Z(g)), y = oi(v, "", y, { height: `${Z(s) ?? ""}px` });
	}), dr("load", v, _), lr(v), Tr(e, v), Ke();
}
//#endregion
//#region plugins/stable/email/ui/src/open-mail.ts
function na(e, t = {}) {
	window.__atlasEmailOpen = t, e.openView(void 0, {
		title: "Email",
		icon: "mail"
	}), setTimeout(() => window.dispatchEvent(new CustomEvent("atlas-email:open", { detail: t })), 0);
}
//#endregion
//#region plugins/stable/email/ui/src/rules-host.ts
var ra = (e) => ({
	call: (t, n = {}, r = 120) => Li(e, t, n, r),
	search: (t) => na(e, { search: t }),
	toast: (t, n = "info") => e.toast("Email", t, n),
	atlas: { open: (t, n, r) => e.open(t, n, r) }
}), ia = JSON.stringify({ dialog: "rules" }), aa = /* @__PURE__ */ br("<div class=\"rule svelte-1mt0jy7\"><input class=\"when svelte-1mt0jy7\" placeholder=\"from:newsletter@shop.example\" aria-label=\"When new mail matches\"/> <span class=\"arrow svelte-1mt0jy7\">→</span> <input class=\"acts svelte-1mt0jy7\" placeholder=\"move Newsletters, read\" aria-label=\"Do\" list=\"email-rule-actions\"/> <button class=\"tool svelte-1mt0jy7\" title=\"Show the mail it matches now\"><!></button> <button class=\"tool svelte-1mt0jy7\" title=\"Remove this rule\"><!></button></div>"), oa = /* @__PURE__ */ br("<p class=\"faint svelte-1mt0jy7\">No rules yet.</p>"), sa = /* @__PURE__ */ br("<option></option>"), ca = /* @__PURE__ */ br("<p class=\"error svelte-1mt0jy7\"> </p>"), la = /* @__PURE__ */ br("<button class=\"atlas-btn svelte-1mt0jy7\">Cancel</button>"), ua = /* @__PURE__ */ br("<div><span class=\"faint svelte-1mt0jy7\">for new mail in an inbox · kept in <button class=\"link svelte-1mt0jy7\"> </button></span> <p class=\"hint svelte-1mt0jy7\">When new mail matches the search, do the actions in order. A search is written as in the search box: <code class=\"svelte-1mt0jy7\">from:shop.example</code>, <code class=\"svelte-1mt0jy7\">subject:invoice has:attachment</code>, <code class=\"svelte-1mt0jy7\">list:physics</code>, <code class=\"svelte-1mt0jy7\">-from:boss</code>, several people at once: <code class=\"svelte-1mt0jy7\">from:ana@uni.example,bo@uni.example</code>. <b>important</b> stars it and keeps the conversation as a note at once; <b>not-important</b> moves it out of the inbox; <b>stop</b> keeps later rules from seeing it; <b>save</b> keeps the conversation as a note.</p> <!> <datalist id=\"email-rule-actions\"></datalist> <!> <footer class=\"svelte-1mt0jy7\"><button class=\"atlas-btn svelte-1mt0jy7\"><!> Add a rule</button> <span class=\"grow svelte-1mt0jy7\"></span> <!> <button class=\"atlas-btn primary svelte-1mt0jy7\"> </button></footer></div>"), da = {
	hash: "svelte-1mt0jy7",
	code: ".page.svelte-1mt0jy7 {display:grid;gap:10px;container-type:inline-size;}.dialog.svelte-1mt0jy7 {display:grid;gap:10px;align-content:start;container-type:inline-size;padding:14px 18px;height:100%;box-sizing:border-box;overflow:auto;}.faint.svelte-1mt0jy7 {color:var(--text-faint);font-size:0.9em;}.hint.svelte-1mt0jy7 {margin:0;color:var(--text-muted);font-size:0.9em;line-height:1.5;}code.svelte-1mt0jy7 {font-family:var(--font-mono);font-size:0.9em;background:var(--bg-hover);padding:0 4px;border-radius:4px;}.link.svelte-1mt0jy7 {all:unset;cursor:pointer;color:var(--accent);}.rule.svelte-1mt0jy7 {display:flex;gap:8px;align-items:center;}.rule.svelte-1mt0jy7 input:where(.svelte-1mt0jy7) {min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:6px 9px;font:inherit;}.when.svelte-1mt0jy7 {flex:3;font-family:var(--font-mono);font-size:0.92em !important;}.acts.svelte-1mt0jy7 {flex:2;}.arrow.svelte-1mt0jy7 {color:var(--text-faint);}.tool.svelte-1mt0jy7 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);}.tool.svelte-1mt0jy7:hover {background:var(--bg-hover);color:var(--text);}footer.svelte-1mt0jy7 {display:flex;gap:8px;align-items:center;padding-top:6px;}footer.svelte-1mt0jy7 .atlas-btn:where(.svelte-1mt0jy7) {display:inline-flex;gap:6px;align-items:center;}.primary.svelte-1mt0jy7 {background:var(--accent) !important;color:var(--accent-fg) !important;border-color:transparent !important;}.grow.svelte-1mt0jy7 {flex:1;}.error.svelte-1mt0jy7 {color:var(--red);margin:0;}\n  @container (max-width: 600px) {.rule.svelte-1mt0jy7 {flex-wrap:wrap;}.when.svelte-1mt0jy7, .acts.svelte-1mt0jy7 {flex-basis:100%;}.arrow.svelte-1mt0jy7 {display:none;} }"
};
function fa(e, t) {
	Ge(t, !0), Yr(e, da);
	let n = ji(t, "onclose", 3, () => {}), r = /* @__PURE__ */ mt(() => t.frame === "page"), i = /* @__PURE__ */ P(Yt([])), a = /* @__PURE__ */ P(""), o = /* @__PURE__ */ P(""), s = /* @__PURE__ */ P(!1), c = [
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
	_n(() => {
		t.mail.call("rules").then((e) => {
			F(i, e.rules, !0), F(a, e.path, !0);
		}, (e) => F(o, e.message, !0));
	});
	let l = () => F(i, [...Z(i), {
		when: "",
		actions: ["archive"]
	}], !0), u = (e) => F(i, Z(i).filter((t, n) => n !== e), !0);
	async function d() {
		F(s, !0);
		try {
			let e = Z(i).map((e) => ({
				when: e.when.trim(),
				actions: e.actions.map((e) => e.trim()).filter((e) => e && !e.endsWith("…"))
			})).filter((e) => e.when && e.actions.length), a = await t.mail.call("set_rules", { rules: e });
			t.mail.toast(`Rules saved in ${a.path}`, "success"), Z(r) || n()();
		} catch (e) {
			F(o, e.message, !0);
		} finally {
			F(s, !1);
		}
	}
	async function f(e) {
		t.mail.search(e.when), n()();
	}
	var p = ua(), m = rn(p), h = z(rn(m)), g = on(h, !0);
	O(m);
	var _ = z(m, 4);
	Hr(_, 17, () => Z(i), Rr, (e, t, n) => {
		var r = aa(), i = rn(r);
		_i(i);
		var a = z(i, 4);
		_i(a);
		var o = z(a, 2);
		Ii(rn(o), {
			name: "search",
			size: 15
		}), O(o);
		var s = z(o, 2);
		Ii(rn(s), {
			name: "trash",
			size: 15
		}), O(s), O(r), Cn((e) => vi(a, e), [() => Z(t).actions.join(", ")]), Si(i, () => Z(t).when, (e) => Z(t).when = e), fr("input", a, (e) => Z(t).actions = e.currentTarget.value.split(",")), fr("click", o, () => f(Z(t))), fr("click", s, () => u(n)), Tr(e, r);
	}, (e) => {
		Tr(e, oa());
	});
	var v = z(_, 2);
	Hr(v, 20, () => c, (e) => e, (e, t) => {
		var n = sa(), r = {};
		Cn(() => {
			r !== (r = t) && (n.value = (n.__value = r) ?? "");
		}), Tr(e, n);
	}), O(v);
	var y = z(v, 2), b = (e) => {
		var t = ca(), n = on(t, !0);
		Cn(() => Ar(n, Z(o))), Tr(e, t);
	};
	Lr(y, (e) => {
		Z(o) && e(b);
	});
	var x = z(y, 2), S = rn(x);
	Ii(rn(S), {
		name: "plus",
		size: 14
	}), Ee(), O(S);
	var C = z(S, 4), ee = (e) => {
		var t = la();
		fr("click", t, function(...e) {
			n()?.apply(this, e);
		}), Tr(e, t);
	};
	Lr(C, (e) => {
		Z(r) || e(ee);
	});
	var te = z(C, 2), ne = on(te, !0);
	O(x), O(p), Cn(() => {
		ii(p, 1, Qr(t.frame), "svelte-1mt0jy7"), Ar(g, Z(a) || "mail/rules.md"), te.disabled = Z(s), Ar(ne, Z(r) ? "Save rules" : "Save");
	}), fr("click", h, () => {
		t.mail.atlas.open(Z(a), void 0, { beside: !0 }), n()();
	}), fr("click", S, l), fr("click", te, d), Tr(e, p), Ke();
}
pr(["click", "input"]);
//#endregion
export { an as $, oi as A, Tr as B, Oi as C, $ as D, _i as E, Rr as F, fr as G, br as H, Lr as I, rr as J, dr as K, jr as L, Yr as M, Jr as N, ui as O, Hr as P, rn as Q, Ar as R, ji as S, Si as T, Cr as U, wr as V, pr as W, _n as X, Cn as Y, Qt as Z, Yi as _, ta as a, mt as at, Ii as b, Li as c, Ke as ct, qi as d, O as dt, on as et, Ji as f, d as ft, Ki as g, Ri as h, na as i, P as it, ii as j, li as k, Bi as l, Ge as lt, Vi as m, ia as n, Yt as nt, Qi as o, tt as ot, Xi as p, m as pt, Z as q, ra as r, F as rt, Zi as s, nt as st, fa as t, z as tt, Wi as u, Ee as ut, Ui as v, Ei as w, Mi as x, zi as y, Fr as z };
