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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/hydration.js
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
	return E(/* @__PURE__ */ rn(T));
}
function D(e) {
	if (w) {
		if (/* @__PURE__ */ rn(T) !== null) throw Se(), _e;
		T = e;
	}
}
function De(e = 1) {
	if (w) {
		for (var t = e, n = T; t--;) n = /* @__PURE__ */ rn(n);
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
		var i = /* @__PURE__ */ rn(n);
		e && n.remove(), n = i;
	}
}
function ke(e) {
	if (!e || e.nodeType !== 8) throw Se(), _e;
	return e.data;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/equality.js
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/errors.js
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/context.js
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/task.js
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/status.js
var $e = ~(g | _ | h);
function A(e, t) {
	e.f = e.f & $e | t;
}
function et(e) {
	e.f & 512 || e.deps === null ? A(e, h) : A(e, _);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/utils.js
function tt(e, t, n) {
	e.f & 2048 ? t.add(e) : e.f & 4096 && n.add(e), A(e, h);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/misc.js
function nt(e, t) {
	if (t) {
		let t = document.body;
		e.autofocus = !0, k(() => {
			document.activeElement === t && e.focus();
		});
	}
}
function rt(e) {
	w && /* @__PURE__ */ L(e) !== null && sn(e);
}
var it = !1;
function at() {
	it || (it = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[me]?.();
		});
	}, { capture: !0 }));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function ot(e) {
	var t = H, n = G;
	W(null), Bn(null);
	try {
		return e();
	} finally {
		W(t), Bn(n);
	}
}
function st(e, t, n, r = n) {
	e.addEventListener(t, () => ot(n));
	let i = e[me];
	e[me] = i ? () => {
		i(), r(!0);
	} : () => r(!0), at();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/async.js
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
				fn(e, s);
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
		Promise.all(n.map((e) => /* @__PURE__ */ mt(e))).then(u).catch((e) => fn(e, s)).finally(d);
	}
	l ? l.then(() => {
		c(), f(), ut();
	}) : f();
}
function lt() {
	var e = G, t = H, n = O, r = j;
	return function(i = !0) {
		Bn(e), W(t), Ge(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function ut(e = !0) {
	Bn(null), W(null), Ge(null), e && j?.deactivate();
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
	var i = void 0, a = Vt(C), o = !H, s = /* @__PURE__ */ new Set();
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
			l?.(), s.delete(n), t !== pt && (c.activate(), t ? (a.f |= ae, Gt(a, t)) : (a.f & 8388608 && (a.f ^= ae), Gt(a, e)), c.deactivate());
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
	return Hn(t), t;
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
	if (!Rn && r !== null && e.v !== C && r.f & 24576) return xe(), e.v;
	Bn(r);
	try {
		_t(e), t = Zn(e);
	} finally {
		Bn(n);
	}
	return t;
}
function yt(e) {
	var t = vt(e);
	if (!e.equals(t) && (e.wv = Jn(), (!j?.is_fork || e.deps === null) && (j === null ? e.v = t : (j.capture(e, t, !0), Ct?.capture(e, t, !0)), e.deps === null))) {
		A(e, h);
		return;
	}
	Rn || (M === null ? et(e) : (gn() || j?.is_fork) && M.set(e, t));
}
function bt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && ot(() => {
		t.ac.abort(he), t.ac = null;
	}), t.fn !== null && (t.teardown = d), er(t, 0), Dn(t));
}
function xt(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && tr(t);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/batch.js
var St = null, j = null, Ct = null, M = null, wt = null, Tt = !1, Et = !1, Dt = null, Ot = null, kt = 0, At = 1, jt = class e {
	id = At++;
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
		St === null ? St = this : (St.#n = this, this.#t = St), St = this;
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
			for (var r of n.d) A(r, g), t(r);
			for (r of n.m) A(r, _), t(r);
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
		for (let e of this.#u) this.#d.delete(e), A(e, g), this.schedule(e);
		for (let e of this.#d) A(e, _), this.schedule(e);
		this.apply();
		for (var t = Dt = [], n = [], r = Ot = []; this.#c.length > 0;) {
			kt++ > 1e3 && (this.#S(), Nt());
			for (let e of this.#g()) try {
				this.#v(e, t, n);
			} catch (t) {
				throw Rt(e), this.#h() || this.discard(), t;
			}
		}
		if (j = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (Dt = null, Ot = null, this.#h()) {
			this.#x(n), this.#x(t);
			for (let [e, t] of this.#f) Lt(e, t);
			r.length > 0 && j.#_();
			return;
		}
		let a = this.#y();
		if (a) {
			this.#x(n), this.#x(t), a.#b(this);
			return;
		}
		this.#u.clear(), this.#d.clear();
		for (let e of this.#r) e(this);
		this.#r.clear(), Ct = this, Ft(n), Ft(t), Ct = null, this.#s?.resolve();
		var o = j;
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
				a ? r.f ^= h : i & 4 ? t.push(r) : Yn(r) && (i & 16 && this.#d.add(r), tr(r));
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
					r & 4194320 && !this.async_deriveds.has(i) && (this.#d.delete(i), A(i, g), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#S(), j = this, this.#_();
	}
	#x(e) {
		for (var t = 0; t < e.length; t += 1) tt(e[t], this.#u, this.#d);
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
			Et = !0, j = this, this.#_();
		} finally {
			kt = 0, wt = null, Dt = null, Ot = null, Et = !1, j = null, M = null, N.clear();
		}
	}
	discard() {
		for (let e of this.#i) e(this);
		this.#i.clear();
		for (let e of this.async_deriveds.values()) e.reject(pt);
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
		this.#m || (this.#m = !0, k(() => {
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
		if (j === null) {
			let t = j = new e();
			!Et && !Tt && k(() => {
				t.#e || t.flush();
			});
		}
		return j;
	}
	apply() {
		M = null;
	}
	schedule(e) {
		if (wt = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768)) {
			e.b.defer_effect(e);
			return;
		}
		this.#c.push(e);
	}
	#S() {
		if (this.linked) {
			var e = this.#t, t = this.#n;
			e === null || (e.#n = t), t === null ? St = e : t.#t = e, this.linked = !1;
		}
	}
};
function Mt(e) {
	var t = Tt;
	Tt = !0;
	try {
		var n;
		for (e && (j !== null && !j.is_fork && j.flush(), n = e());;) {
			if (Qe(), j === null) return n;
			j.flush();
		}
	} finally {
		Tt = t;
	}
}
function Nt() {
	try {
		ze();
	} catch (e) {
		fn(e, wt);
	}
}
var Pt = null;
function Ft(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && Yn(r) && (Pt = /* @__PURE__ */ new Set(), tr(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && An(r), Pt?.size > 0)) {
				N.clear();
				for (let e of Pt) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) Pt.has(n) && (Pt.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || tr(n);
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/sources.js
var zt = /* @__PURE__ */ new Set(), N = /* @__PURE__ */ new Map(), Bt = !1;
function Vt(e, t) {
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
function P(e, t) {
	let n = Vt(e, t);
	return Hn(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function Ht(e, t = !1, n = !0) {
	let r = Vt(e);
	return t || (r.equals = Me), r;
}
function F(e, t, n = !1) {
	return H !== null && (!U || H.f & 131072) && Ye() && H.f & 4325394 && (Vn === null || !Vn.has(e)) && Ue(), Gt(e, n ? Yt(t) : t, Ot);
}
var Ut = null, Wt = 0;
function Gt(e, t, n = null) {
	if (!e.equals(t)) {
		Rn ? N.set(e, t) : N.has(e) || N.set(e, e.v);
		var r = jt.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && vt(t), M === null && et(t);
		}
		e.wv = Jn(), Ut = null, Wt = 0, Jt(e, g, n), Ut = null, Ye() && G !== null && G.f & 1024 && !(G.f & 96) && (J === null ? Un([e]) : J.push(e)), !r.is_fork && zt.size > 0 && !Bt && Kt();
	}
	return t;
}
function Kt() {
	Bt = !1;
	for (let e of zt) {
		e.f & 1024 && A(e, _);
		let t;
		try {
			t = Yn(e);
		} catch {
			t = !0;
		}
		t && tr(e);
	}
	zt.clear();
}
function qt(e) {
	F(e, e.v + 1);
}
function Jt(e, t, n) {
	var r = e.reactions;
	if (r !== null) {
		var i = Ye(), a = r.length;
		if (Wt += a, Wt > 1e5 && Ut === null && (Ut = /* @__PURE__ */ new Set()), Ut !== null) {
			if (Ut.has(e)) return;
			Ut.add(e);
		}
		for (var o = 0; o < a; o++) {
			var s = r[o], c = s.f;
			if (i || s !== G) {
				var l = (c & g) === 0;
				if (l && A(s, t), c & 131072) zt.add(s);
				else if (c & 2) {
					var u = s;
					M?.delete(u), Jt(u, _, n);
				} else if (l) {
					var d = s;
					c & 16 && Pt !== null && Pt.add(d), n === null ? It(d) : n.push(d);
				}
			}
		}
	}
}
function Yt(t) {
	if (typeof t != "object" || !t || oe in t || se in t) return t;
	let n = l(t);
	if (n !== s && n !== c) return t;
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ P(0), u = null, d = Kn, f = (e) => {
		if (Kn === d) return e();
		var t = H, n = Kn;
		W(null), qn(d);
		var r = e();
		return W(t), qn(n), r;
	};
	return i && r.set("length", /* @__PURE__ */ P(t.length, u)), new Proxy(t, {
		defineProperty(e, t, n) {
			(!("value" in n) || n.configurable === !1 || n.enumerable === !1 || n.writable === !1) && Ve();
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
					r.set(t, e), qt(o);
				}
			} else F(n, C), qt(o);
			return !0;
		},
		get(e, n, i) {
			if (n === oe) return t;
			var o = r.get(n), s = n in e;
			if (o === void 0 && (!s || a(e, n)?.writable) && (o = f(() => /* @__PURE__ */ P(Yt(s ? e[n] : C), u)), r.set(n, o)), o !== void 0) {
				var c = Y(o);
				return c === C ? void 0 : c;
			}
			return Reflect.get(e, n, i);
		},
		getOwnPropertyDescriptor(e, t) {
			this.has?.(e, t);
			var n = Reflect.getOwnPropertyDescriptor(e, t), i = r.get(t);
			if (i !== void 0) {
				var a = Y(i);
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
			return (n !== void 0 || G !== null && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ P(i ? Yt(e[t]) : C, u)), r.set(t, n)), Y(n) === C) ? !1 : i;
		},
		set(e, t, n, s) {
			var c = r.get(t), l = t in e;
			if (i && t === "length") for (var d = n; d < c.v; d += 1) {
				var p = r.get(d + "");
				p === void 0 ? d in e && (p = f(() => /* @__PURE__ */ P(C, u)), r.set(d + "", p)) : F(p, C);
			}
			if (c === void 0) (!l || a(e, t)?.writable) && (c = f(() => /* @__PURE__ */ P(void 0, u)), F(c, Yt(n)), r.set(t, c));
			else {
				l = c.v !== C;
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
			Y(o);
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
function Xt(e) {
	try {
		if (typeof e == "object" && e && oe in e) return e[oe];
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
		en = a(t, "firstChild").get, tn = a(t, "nextSibling").get, u(e) && (e[de] = void 0, e[ue] = null, e[fe] = void 0, e.__e = void 0), u(n) && (n[pe] = void 0);
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
function rn(e) {
	return tn.call(e);
}
function R(e, t) {
	if (!w) return /* @__PURE__ */ L(e);
	var n = /* @__PURE__ */ L(T);
	if (n === null) n = T.appendChild(I());
	else if (t && n.nodeType !== 3) {
		var r = I();
		return n?.before(r), E(r), r;
	}
	return t && un(n), E(n), n;
}
function an(e, t = !1) {
	if (!w) {
		var n = /* @__PURE__ */ L(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ rn(n) : n;
	}
	if (t) {
		if (T?.nodeType !== 3) {
			var r = I();
			return T?.before(r), E(r), r;
		}
		un(T);
	}
	return T;
}
function on(e, t = !1) {
	if (!w) return /* @__PURE__ */ L(e);
	var n = R(e, t);
	return D(e), n;
}
function z(e, t = 1, n = !1) {
	let r = w ? T : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ rn(r);
	if (!w) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = I();
			return r === null ? i?.after(a) : r.before(a), E(a), a;
		}
		un(r);
	}
	return E(r), r;
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
	var t = G;
	if (t === null) return H.f |= ae, e;
	if (!(t.f & 32768) && !(t.f & 4)) throw e;
	fn(e, t);
}
function fn(e, t) {
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
function pn(e) {
	G === null && (H === null && Re(e), Le()), Rn && Ie(e);
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
			tr(r);
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
			e(...t.map(Y));
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
		let n = Rn, r = H;
		zn(!0), W(null);
		try {
			t.call(null);
		} catch (t) {
			fn(t, e.parent);
		} finally {
			zn(n), W(r);
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
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (kn(e.nodes.start, e.nodes.end), n = !0), e.f |= x, Dn(e, t && !n), er(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	En(e), e.f ^= x, e.f |= y;
	var i = e.parent;
	i !== null && i.first !== null && An(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function kn(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ rn(e);
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
		var i = n === r ? null : /* @__PURE__ */ rn(n);
		t.append(n), n = i;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/legacy.js
var In = null, Ln = !1, Rn = !1;
function zn(e) {
	Rn = e;
}
var H = null, U = !1;
function W(e) {
	H = e;
}
var G = null;
function Bn(e) {
	G = e;
}
var Vn = null;
function Hn(e) {
	H !== null && (H.f & 2097152 || H.f & 2) && (Vn ??= /* @__PURE__ */ new Set()).add(e);
}
var K = null, q = 0, J = null;
function Un(e) {
	J = e;
}
var Wn = 1, Gn = 0, Kn = Gn;
function qn(e) {
	Kn = e;
}
function Jn() {
	return ++Wn;
}
function Yn(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (Yn(a) && yt(a), a.wv > e.wv) return !0;
		}
		t & 512 && M === null && A(e, h);
	}
	return !1;
}
function Xn(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(Vn !== null && Vn.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? Xn(a, t, !1) : t === a && (n ? A(a, g) : a.f & 1024 && A(a, _), It(a));
	}
}
function Zn(e) {
	var t = K, n = q, r = J, i = H, a = Vn, o = O, s = U, c = Kn, l = e.f;
	K = null, q = 0, J = null, H = l & 96 ? null : e, Vn = null, Ge(e.ctx), U = !1, Kn = ++Gn, e.ac !== null && (ot(() => {
		e.ac.abort(he);
	}), e.ac = null);
	try {
		e.f |= re;
		var u = e.fn, d = u();
		e.f |= b;
		var f = Qn(e);
		if (Ye() && J !== null && !U && f !== null && !(e.f & 6146)) for (var p = 0; p < J.length; p++) Xn(J[p], e);
		if (i !== null && i !== e) {
			if (Gn++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = Gn;
			if (t !== null) for (let e of t) e.rv = Gn;
			J !== null && (r === null ? r = J : r.push(...J));
		}
		return e.f & 8388608 && (e.f ^= ae), d;
	} catch (t) {
		return Qn(e), dn(t);
	} finally {
		e.f ^= re, K = t, q = n, J = r, H = i, Vn = a, Ge(o), U = s, Kn = c;
	}
}
function Qn(e) {
	var t = e.deps, n = j?.is_fork;
	if (K !== null) {
		var r;
		if (n || er(e, q), t !== null && q > 0) for (t.length = q + K.length, r = 0; r < K.length; r++) t[q + r] = K[r];
		else e.deps = t = K;
		if (gn() && e.f & 512) for (r = q; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && q < t.length && (er(e, q), t.length = q);
	return t;
}
function $n(e, r) {
	let i = r.reactions;
	if (i !== null) {
		var a = t.call(i, e);
		if (a !== -1) {
			var o = i.length - 1;
			o === 0 ? i = r.reactions = null : (i[a] = i[o], i.pop());
		}
	}
	if (i === null && r.f & 2 && (K === null || !n.call(K, r))) {
		var s = r;
		s.f & 512 && (s.f ^= 512), s.v !== C && et(s), s.ac !== null && ot(() => {
			s.ac.abort(he), s.ac = null, A(s, g);
		}), bt(s), er(s, 0);
	}
}
function er(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) $n(e, n[r]);
}
function tr(e) {
	var t = e.f;
	if (!(t & 16384)) {
		A(e, h);
		var n = G, r = Ln;
		G = e, Ln = !(t & 96);
		try {
			t & 16777232 ? On(e) : Dn(e), En(e);
			var i = Zn(e);
			e.teardown = typeof i == "function" ? i : null, e.wv = Wn;
		} finally {
			Ln = r, G = n;
		}
	}
}
async function nr() {
	await Promise.resolve(), Mt();
}
function Y(e) {
	var t = !!(e.f & 2);
	if (In?.add(e), H !== null && !U && !(G !== null && G.f & 16384) && (Vn === null || !Vn.has(e))) {
		var r = H.deps;
		if (H.f & 2097152) e.rv < Gn && (e.rv = Gn, K === null && r !== null && r[q] === e ? q++ : K === null ? K = [e] : K.push(e));
		else {
			H.deps ??= [], n.call(H.deps, e) || H.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [H] : n.call(i, H) || i.push(H);
		}
	}
	if (Rn && N.has(e)) return N.get(e);
	if (t) {
		var a = e;
		if (Rn) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || ir(a)) && (o = vt(a)), N.set(a, o), o;
		}
		var s = !(a.f & 512) && !U && H !== null && (Ln || !!(H.f & 512)), c = (a.f & b) === 0;
		Yn(a) && (s && (a.f |= 512), yt(a)), s && !c && (xt(a), rr(a));
	}
	if (M?.has(e)) return M.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function rr(e) {
	if (e.f |= 512, e.deps !== null) for (let t of e.deps) (t.reactions ??= []).push(e), t.f & 2 && !(t.f & 512) && (xt(t), rr(t));
}
function ir(e) {
	if (e.v === C) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (N.has(t) || t.f & 2 && ir(t)) return !0;
	return !1;
}
function ar(e) {
	var t = U;
	try {
		return U = !0, e();
	} finally {
		U = t;
	}
}
[.../* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split(".")];
var or = ["touchstart", "touchmove"];
function sr(e) {
	return or.includes(e);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dev/css.js
var cr = Symbol("events"), lr = /* @__PURE__ */ new Set(), ur = /* @__PURE__ */ new Set();
function dr(e) {
	if (!w) return;
	e.removeAttribute("onload"), e.removeAttribute("onerror");
	let t = e.__e;
	t !== void 0 && (e.__e = void 0, queueMicrotask(() => {
		e.isConnected && e.dispatchEvent(t);
	}));
}
function fr(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || _r.call(t, e), !e.cancelBubble) return ot(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, k(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function pr(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = fr(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && _n(() => {
		o.__removed = !0, t.removeEventListener(e, o, a);
	});
}
function X(e, t, n) {
	(t[cr] ??= {})[e] = n;
}
function mr(e) {
	for (var t = 0; t < e.length; t++) lr.add(e[t]);
	for (var n of ur) n(e);
}
var hr = null, gr = !1;
function _r(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	hr = e, gr || (gr = !0, setTimeout(() => {
		gr = !1, hr = null;
	}));
	var s = 0, c = hr === e && e[cr];
	if (c) {
		var l = a.indexOf(c);
		if (l !== -1 && (t === document || t === window)) {
			e[cr] = t;
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
		W(null), Bn(null);
		try {
			for (var p, m = []; o !== null && o !== t;) {
				try {
					var h = o[cr]?.[r];
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
			e[cr] = t, delete e.currentTarget, W(d), Bn(f);
		}
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/reconciler.js
var vr = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function yr(e) {
	return vr?.createHTML(e) ?? e;
}
function br(e) {
	var t = ln("template");
	return t.innerHTML = yr(e.replaceAll("<!>", "<!---->")), t.content;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/template.js
function Z(e, t) {
	var n = G;
	n.nodes === null && (n.nodes = {
		start: e,
		end: t,
		a: null,
		t: null
	});
}
/*#__NO_SIDE_EFFECTS__*/
function xr(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (w) return Z(T, null), T;
		i === void 0 && (i = br(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ L(i)));
		var t = r || $t ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ L(t), s = t.lastChild;
			Z(o, s);
		} else Z(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function Sr(e, t, n = "svg") {
	var r = !e.startsWith("<!>"), i = !!(t & 1), a = `<${n}>${r ? e : "<!>" + e}</${n}>`, o;
	return () => {
		if (w) return Z(T, null), T;
		if (!o) {
			var e = /* @__PURE__ */ L(br(a));
			if (i) for (o = document.createDocumentFragment(); /* @__PURE__ */ L(e);) o.appendChild(/* @__PURE__ */ L(e));
			else o = /* @__PURE__ */ L(e);
		}
		var t = o.cloneNode(!0);
		if (i) {
			var n = /* @__PURE__ */ L(t), r = t.lastChild;
			Z(n, r);
		} else Z(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function Cr(e, t) {
	return /* @__PURE__ */ Sr(e, t, "svg");
}
function wr(e = "") {
	if (!w) {
		var t = I(e + "");
		return Z(t, t), t;
	}
	var n = T;
	return n.nodeType === 3 ? un(n) : (n.before(n = I()), E(n)), Z(n, n), n;
}
function Tr() {
	if (w) return Z(T, null), T;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = I();
	return e.append(t, n), Z(t, n), e;
}
function Q(e, t) {
	if (w) {
		var n = G;
		(!(n.f & 32768) || n.nodes.end === null) && (n.nodes.end = T), Ee();
		return;
	}
	e !== null && e.before(t);
}
//#endregion
//#region ui/node_modules/svelte/src/reactivity/create-subscriber.js
function Er(e) {
	let t = 0, n = Vt(0), r;
	return () => {
		gn() && (Y(n), Cn(() => (t === 0 && (r = ar(() => e(() => qt(n)))), t += 1, () => {
			k(() => {
				--t, t === 0 && (r?.(), r = void 0, qt(n));
			});
		})));
	};
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var Dr = S | ee;
function Or(e, t, n, r) {
	new kr(e, t, n, r);
}
var kr = class {
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
	#h = Er(() => (this.#m = Vt(this.#l), () => {
		this.#m = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = G;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = G.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = Tn(() => {
			if (w) {
				let e = this.#t;
				Ee();
				let t = e.data === "[!";
				if (e.data.startsWith("[?")) {
					let t = JSON.parse(e.data.slice(2));
					this.#_(t);
				} else t ? this.#y() : this.#g();
			} else this.#b();
		}, Dr), w && (this.#e = T);
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
		k(r), t && (this.#s = B(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#v(e) {
		var t = !1, n = !1;
		let r = () => {
			if (t) {
				we();
				return;
			}
			t = !0, n && We(), this.#s !== null && jn(this.#s, () => {
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
					fn(e, this.#i && this.#i.parent);
				}
			}
		};
	}
	#y() {
		let e = this.#n.pending;
		e && (this.is_pending = !0, this.#o = B(() => e(this.#e)), k(() => {
			var e = this.#c = document.createDocumentFragment(), t = I(), n = !1;
			if (e.append(t), this.#a = this.#S(() => {
				try {
					return B(() => this.#r(t));
				} catch (e) {
					try {
						this.error(e), n = !0;
					} catch (e) {
						fn(e, this.#i.parent);
					}
					return null;
				}
			}), this.#a === null) {
				this.#c = null, n && this.#x(j);
				return;
			}
			this.#u === 0 && (this.#e.before(e), this.#c = null, jn(this.#o, () => {
				this.#o = null;
			}), this.#x(j));
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
		this.is_pending = !1, e.transfer_effects(this.#f, this.#p);
	}
	defer_effect(e) {
		tt(e, this.#f, this.#p);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#n.pending;
	}
	#S(e) {
		var t = G, n = H, r = O;
		Bn(this.#i), W(this.#i), Ge(this.#i.ctx);
		try {
			return jt.ensure(), e();
		} finally {
			Bn(t), W(n), Ge(r);
		}
	}
	#C(e, t) {
		if (!this.has_pending_snippet()) {
			this.parent && this.parent.#C(e, t);
			return;
		}
		this.#u += e, this.#u === 0 && (this.#x(t), this.#o && jn(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null));
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !(!this.#m || this.#d) && (this.#d = !0, k(() => {
			this.#d = !1, this.#m && Gt(this.#m, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#h(), Y(this.#m);
	}
	error(e) {
		if (!this.#n.onerror && !this.#n.failed) throw e;
		j?.is_fork ? (this.#a && j.skip_effect(this.#a), this.#o && j.skip_effect(this.#o), this.#s && j.skip_effect(this.#s), j.oncommit(() => {
			this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (V(this.#a), null), this.#o &&= (V(this.#o), null), this.#s &&= (V(this.#s), null), w && (E(this.#t), De(), E(Oe()));
		let t = this.#n.failed, n = (e) => {
			let { reset: n, invoke_onerror: r } = this.#v(e);
			r(), t && (this.#s = this.#S(() => {
				try {
					return B(() => {
						var r = G;
						r.b = this, r.f |= 128, t(this.#e, () => e, () => n);
					});
				} catch (e) {
					return fn(e, this.#i.parent), null;
				}
			}));
		};
		k(() => {
			var t;
			try {
				t = this.transform_error(e);
			} catch (e) {
				fn(e, this.#i && this.#i.parent);
				return;
			}
			typeof t == "object" && t && typeof t.then == "function" ? t.then(n, (e) => fn(e, this.#i && this.#i.parent)) : n(t);
		});
	}
};
function Ar(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[pe] ??= e.nodeValue) && (e[pe] = n, e.nodeValue = `${n}`);
}
function jr(e, t) {
	return Nr(e, t);
}
var Mr = /* @__PURE__ */ new Map();
function Nr(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	nn();
	var l = void 0, u = bn(() => {
		var s = n ?? t.appendChild(I());
		Or(s, { pending: () => {} }, (t) => {
			Ke({});
			var n = O;
			if (o && (n.c = o), a && (i.$$events = a), w && Z(t, null), l = e(t, i) || Je(), w && (G.nodes.end = T, T === null || T.nodeType !== 8 || T.data !== "]")) throw Se(), _e;
			qe();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = sr(r);
					for (let e of [t, document]) {
						var a = Mr.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), Mr.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, _r, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(lr)), ur.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = Mr.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, _r), r.delete(e), r.size === 0 && Mr.delete(n)) : r.set(e, i);
			}
			ur.delete(d), s !== n && s.parentNode?.removeChild(s);
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
						Fn(r, t), t.append(I()), this.#n.set(e, {
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
		var n = j, r = cn();
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
function Lr(e, t, n = !1) {
	var r;
	w && (r = T, Ee());
	var i = new Ir(e), a = n ? S : 0;
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/each.js
function Rr(e, t) {
	return t;
}
function zr(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		jn(n, () => {
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
		r?.has(a) ? (a.f |= ne, Fn(a, document.createDocumentFragment())) : V(t[i], n);
	}
}
var Vr;
function Hr(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = w ? E(/* @__PURE__ */ L(u)) : u.appendChild(I());
	}
	w && Ee();
	var d = null, f = /* @__PURE__ */ gt(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p, m = /* @__PURE__ */ new Map(), h = !0;
	function g(e) {
		v.effect.f & 16384 || (v.pending.delete(e), v.fallback = d, Wr(v, p, c, n, a), d !== null && (p.length === 0 ? d.f & 33554432 ? (d.f ^= ne, Kr(d, null, c)) : Nn(d) : jn(d, () => {
			d = null;
		})));
	}
	function _(e) {
		v.pending.delete(e);
	}
	var v = {
		effect: Tn(() => {
			p = Y(f);
			var e = p.length;
			let t = !1;
			w && ke(c) === "[!" != (e === 0) && (c = Oe(), E(c), Te(!1), t = !0);
			for (var r = /* @__PURE__ */ new Set(), u = j, v = cn(), y = 0; y < e; y += 1) {
				w && T.nodeType === 8 && T.data === "]" && (c = T, t = !0, Te(!1));
				var b = p[y], x = a(b, y), S = h ? null : l.get(x);
				S ? (S.v && Gt(S.v, b), S.i && Gt(S.i, y), v && u.unskip_effect(S.e)) : (S = Gr(l, h ? c : Vr ??= I(), b, x, y, o, n, i), h || (S.e.f |= ne), l.set(x, S)), r.add(x);
			}
			if (e === 0 && s && !d && (h ? d = B(() => s(c)) : (d = B(() => s(Vr ??= I())), d.f |= ne)), e > r.size && Fe("", "", ""), w && e > 0 && E(Oe()), !h) {
				if (m.set(u, r), v) {
					for (let [e, t] of l) r.has(e) || u.skip_effect(t.e);
					u.oncommit(g), u.ondiscard(_);
				} else g(u);
			}
			t && Te(!0), Y(f);
		}),
		flags: n,
		items: l,
		pending: m,
		outrogroups: null,
		fallback: d
	};
	h = !1, w && (c = T);
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
		if (_.f & 8192 && (Nn(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= ne, _ === l) Kr(_, null, n);
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
					var S = p[0], ee = p[p.length - 1];
					for (x = 0; x < p.length; x += 1) Kr(p[x], b, n);
					for (x = 0; x < m.length; x += 1) u.delete(m[x]);
					qr(e, S.prev, ee.next), qr(e, d, S), qr(e, ee, b), l = b, d = ee, --v, p = [], m = [];
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
		var te = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || te.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && te.push(l), l = Ur(l.next);
		var re = te.length;
		if (re > 0) {
			var ie = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.measure();
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.fix();
			}
			zr(e, te, ie);
		}
	}
	o && k(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function Gr(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? Vt(n) : /* @__PURE__ */ Ht(n, !1, !1) : null, l = o & 2 ? Vt(i) : null;
	return {
		v: c,
		i: l,
		e: B(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function Kr(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ rn(r);
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
		w && (o = E(/* @__PURE__ */ L(c)));
	}
	wn(() => {
		var e = G;
		if (s === (s = t() ?? "")) {
			w && Ee();
			return;
		}
		if (n && !w) {
			e.nodes = null, c.innerHTML = s, s !== "" && Z(/* @__PURE__ */ L(c), c.lastChild);
			return;
		}
		if (e.nodes !== null && (kn(e.nodes.start, e.nodes.end), e.nodes = null), s !== "") {
			if (w) {
				for (var a = T.data, l = Ee(), u = l; l !== null && (l.nodeType !== 8 || l.data !== "");) u = l, l = /* @__PURE__ */ rn(l);
				if (l === null) throw Se(), _e;
				Z(T, u), o = E(l);
				return;
			}
			var d = ln(r ? "svg" : i ? "math" : "template", r ? ye : i ? be : void 0);
			d.innerHTML = s;
			var f = r || i ? d : d.content;
			if (Z(/* @__PURE__ */ L(f), f.lastChild), r || i) for (; /* @__PURE__ */ L(f);) o.before(/* @__PURE__ */ L(f));
			else o.before(f);
		}
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/css.js
function Yr(e, t) {
	xn(() => {
		e = G?.parent?.nodes?.start ?? e;
		var n = e.getRootNode(), r = n.host ? n : n.head ?? n.ownerDocument.head;
		if (!r.querySelector("#" + t.hash)) {
			let e = ln("style");
			e.id = t.hash, e.textContent = t.code, r.appendChild(e);
		}
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/shared/attributes.js
var Xr = [..." 	\n\r\f\xA0\v﻿"];
function Zr(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || Xr.includes(r[o - 1])) && (s === r.length || Xr.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function Qr(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function $r(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function ei(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map($r)), i && c.push(...Object.keys(i).map($r));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = $r(e.substring(l, u).trim());
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
		return r && (n += Qr(r)), i && (n += Qr(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/class.js
function ti(e, t, n, r, i, a) {
	var o = e[de];
	if (w || o !== n || o === void 0) {
		var s = Zr(n, r, a);
		(!w || s !== e.getAttribute("class")) && (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[de] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/style.js
function ni(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function ri(e, t, n, r) {
	var i = e[fe];
	if (w || i !== t) {
		var a = ei(t, r);
		(!w || a !== e.getAttribute("style")) && (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[fe] = t;
	} else r && (Array.isArray(r) ? (ni(e, n?.[0], r[0]), ni(e, n?.[1], r[1], "important")) : ni(e, n, r));
	return r;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
function ii(e, t) {
	t ? e.hasAttribute("selected") || e.setAttribute("selected", "") : e.removeAttribute("selected");
}
function ai(t, n) {
	var r = t.__defaultValue, i = t.multiple, a = i ? r ?? [] : null;
	if (!i || e(a)) {
		var o = t.selectedIndex, s = n && i ? new Set(t.selectedOptions) : null;
		for (var c of t.options) {
			var l = ci(c);
			ii(c, i ? a.includes(l) : Zt(l, r));
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
function oi(t, n, r = !1) {
	if (t.multiple) {
		if (n == null) return;
		if (!e(n)) return Ce();
		for (var i of t.options) i.selected = n.includes(ci(i));
		return;
	}
	for (i of t.options) if (Zt(ci(i), n)) {
		i.selected = !0;
		return;
	}
	(!r || n !== void 0) && (t.selectedIndex = -1);
}
function si(e) {
	var t = new MutationObserver((t) => {
		t.every(li) || ("__defaultValue" in e && ai(e, !1), "__value" in e && oi(e, e.__value));
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
function ci(e) {
	return "__value" in e ? e.__value : e.value;
}
function li(e) {
	if (e.target.closest("selectedcontent") !== null) return !0;
	if (e.type === "childList") {
		var t = [...e.addedNodes, ...e.removedNodes];
		return t.length > 0 && t.every((e) => e.nodeName === "SELECTEDCONTENT");
	}
	return !1;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/attributes.js
var ui = Symbol("is custom element"), di = Symbol("is html"), fi = ge ? "link" : "LINK", pi = ge ? "progress" : "PROGRESS";
function mi(e) {
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
function hi(e, t) {
	var n = gi(e);
	n.value !== (n.value = t ?? void 0) && (e.value !== t || t === 0 && e.nodeName === pi) && (e.value = t ?? "");
}
function $(e, t, n, r) {
	var i = gi(e);
	w && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === fi) || i[t] !== (i[t] = n) && (t === "loading" && (e[le] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && vi(e).has(t) ? e[t] = n : e.setAttribute(t, n));
}
function gi(e) {
	return e[ue] ??= {
		[ui]: e.nodeName.includes("-"),
		[di]: e.namespaceURI === ve
	};
}
var _i = /* @__PURE__ */ new Map();
function vi(e) {
	var t = e.getAttribute("is") || e.nodeName, n = _i.get(t);
	if (n) return n;
	_i.set(t, n = /* @__PURE__ */ new Set());
	for (var r, i = e, a = Element.prototype; a !== i;) {
		for (var s in r = o(i), r) r[s].set && s !== "innerHTML" && s !== "textContent" && s !== "innerText" && n.add(s);
		i = l(i);
	}
	return n;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function yi(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet();
	st(e, "input", async (i) => {
		var a = i ? e.defaultValue : e.value;
		if (a = bi(e) ? xi(a) : a, n(a), j !== null && r.add(j), await nr(), a !== (a = t())) {
			var o = e.selectionStart, s = e.selectionEnd, c = e.value.length;
			if (e.value = a ?? "", s !== null) {
				var l = e.value.length;
				o === s && s === c && l > c ? (e.selectionStart = l, e.selectionEnd = l) : (e.selectionStart = o, e.selectionEnd = Math.min(s, l));
			}
		}
	}), (w && e.defaultValue !== e.value || ar(t) == null && e.value) && (n(bi(e) ? xi(e.value) : e.value), j !== null && r.add(j)), Cn(() => {
		var n = t();
		if (e === document.activeElement) {
			var i = j;
			if (r.has(i)) return;
		}
		bi(e) && n === xi(e.value) || (e.type !== "date" || n || e.value) && n !== e.value && (e.value = n ?? "");
	});
}
function bi(e) {
	var t = e.type;
	return t === "number" || t === "range";
}
function xi(e) {
	return e === "" ? null : +e;
}
var Si = /* @__PURE__ */ new class e {
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
function Ci(e, t, n) {
	var r = Si.observe(e, () => n(e[t]));
	xn(() => (ar(() => n(e[t])), r));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function wi(e, t) {
	return e === t || e?.[oe] === t;
}
function Ti(e = Je(), t, n, r) {
	var i = O.r, a = G;
	return xn(() => {
		var o, s;
		return Cn(() => {
			o = s, s = r?.() || [], ar(() => {
				wi(n(...s), e) || (t(e, ...s), o && wi(n(...o), e) && t(null, ...o));
			});
		}), () => {
			let r = a;
			for (; r !== i && r.parent !== null && r.parent.f & 33554432;) r = r.parent;
			let o = () => {
				s && wi(n(...s), e) && t(null, ...s);
			}, c = r.teardown;
			r.teardown = () => {
				o(), c?.();
			};
		};
	}), e;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/store.js
var Ei = !1;
function Di(e) {
	var t = Ei;
	try {
		return Ei = !1, [e(), Ei];
	} finally {
		Ei = t;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/props.js
function Oi(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ ft(r), Y(u)) : (l && (l = !1, c = s ? ar(r) : r), c);
	let f;
	if (o) {
		var p = oe in e || ce in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = Di(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && Be(t), f(m)));
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
	o && Y(y);
	var b = G;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? Y(y) : i && o ? Yt(e) : e;
			return F(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return Rn && v || b.f & 16384 ? y.v : Y(y);
	});
}
function ki(e) {
	O === null && Ne("onMount"), vn(() => {
		let t = ar(e);
		if (typeof t == "function") return t;
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
//#endregion
//#region plugins/stable/email/ui/src/Icon.svelte
var Ai = {
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
}, ji = /* @__PURE__ */ Cr("<svg class=\"icon svelte-jfnn1v\" viewBox=\"0 0 24 24\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg>"), Mi = {
	hash: "svelte-jfnn1v",
	code: ".icon.svelte-jfnn1v {flex:none;display:block;}"
};
function Ni(e, t) {
	Yr(e, Mi);
	let n = Oi(t, "size", 3, 16), r = Oi(t, "title", 3, ""), i = Oi(t, "filled", 3, !1);
	var a = ji(), o = on(a);
	wn(() => {
		$(a, "width", n()), $(a, "height", n()), $(a, "fill", i() ? "currentColor" : "none"), $(a, "aria-hidden", r() ? void 0 : "true"), $(a, "role", r() ? "img" : void 0), $(a, "aria-label", r() || void 0), $(o, "d", Ai[t.name] ?? Ai.folder);
	}), Q(e, a);
}
//#endregion
//#region plugins/stable/email/ui/src/api.ts
async function Pi(e, t, n = {}, r = 120) {
	try {
		return await e.helper.call(t, {
			...n,
			settings: e.plugin.settings
		}, { timeout: r });
	} catch (e) {
		throw Error(String(e?.message ?? e).replace(/^.*?plugin [\w-]+: \w+: /, "").replace(/^.*?(method|error): /i, ""));
	}
}
var Fi = (e, t, n) => e.plugin.settings[t] ?? n;
function Ii(e, t = []) {
	return e ? t.includes(e.addr.toLowerCase()) ? "me" : e.name || e.addr.split("@")[0] : "(no sender)";
}
var Li = (e) => e.name ? `${e.name} <${e.addr}>` : e.addr;
function Ri(e, t) {
	let n = e.map((e) => Ii(e, t));
	return n.length <= 3 ? n.join(", ") : `${n[0]} … ${n.slice(-2).join(", ")}`;
}
var zi = (e) => new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
function Bi(e) {
	if (!e) return "";
	let t = /* @__PURE__ */ new Date(e * 1e3), n = /* @__PURE__ */ new Date(), r = (zi(n) - zi(t)) / 864e5;
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
function Vi(e) {
	let t = /* @__PURE__ */ new Date(e * 1e3), n = Hi(e);
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
function Hi(e) {
	let t = Date.now() / 1e3 - e;
	return t < 0 ? "" : t < 60 ? "just now" : t < 3600 ? `${Math.floor(t / 60)} min ago` : t < 86400 ? `${Math.floor(t / 3600)} h ago` : t < 172800 ? "yesterday" : t < 604800 ? `${Math.floor(t / 86400)} days ago` : "";
}
function Ui(e) {
	return e < 1024 ? `${e} B` : e < 1048576 ? `${Math.round(e / 1024)} KB` : `${(e / 1024 / 1024).toFixed(1)} MB`;
}
function Wi(e) {
	let t = 0;
	for (let n of e.toLowerCase()) t = (t * 31 + n.charCodeAt(0)) % 360;
	return t;
}
var Gi = (e) => {
	let t = (e?.name || e?.addr || "?").replace(/["']/g, "").trim().split(/[\s.@_-]+/).filter(Boolean);
	return ((t[0]?.[0] ?? "?") + (t.length > 1 ? t[1][0] : "")).toUpperCase();
};
function Ki(e = /* @__PURE__ */ new Date()) {
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
function qi(e, t = /* @__PURE__ */ new Date()) {
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
var Ji = (e, t, n) => typeof e.confirm == "function" ? e.confirm(t, n) : Promise.resolve(window.confirm(t)), Yi = (e, t, n = "") => typeof e.input == "function" ? e.input(t, { value: n }) : Promise.resolve(window.prompt(t, n)?.trim() || null), Xi = /* @__PURE__ */ xr("<iframe class=\"frame svelte-lnhtx6\" title=\"The message\" sandbox=\"allow-same-origin allow-popups allow-popups-to-escape-sandbox\" scrolling=\"no\"></iframe>"), Zi = {
	hash: "svelte-lnhtx6",
	code: ".frame.svelte-lnhtx6 {display:block;width:100%;border:0;background:transparent;color-scheme:normal;}"
};
function Qi(e, t) {
	Ke(t, !0), Yr(e, Zi);
	let n = Oi(t, "plain", 3, !1), r = Oi(t, "remote", 3, !1), i = Oi(t, "dark", 3, !1), a = Oi(t, "prose", 3, ""), o = /* @__PURE__ */ P(void 0), s = /* @__PURE__ */ P(80), c = [
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
	let g = /* @__PURE__ */ ht(() => {
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
		let e = Y(o)?.contentDocument;
		if (!e?.body) return;
		l(e), i() && !n() && h(e);
		let t = () => {
			F(s, Math.max(40, e.documentElement.scrollHeight), !0);
		};
		t(), new ResizeObserver(t).observe(e.documentElement);
		for (let n of Array.from(e.images)) n.addEventListener("load", t);
		e.addEventListener("toggle", t, !0);
	}
	var v = Xi();
	let y;
	Ti(v, (e) => F(o, e), () => Y(o)), wn(() => {
		$(v, "srcdoc", Y(g)), y = ri(v, "", y, { height: `${Y(s) ?? ""}px` });
	}), pr("load", v, _), dr(v), Q(e, v), qe();
}
//#endregion
//#region plugins/stable/email/ui/src/Rules.svelte
var $i = /* @__PURE__ */ xr("<div class=\"rule svelte-1mt0jy7\"><input class=\"when svelte-1mt0jy7\" placeholder=\"from:newsletter@shop.example\" aria-label=\"When new mail matches\"/> <span class=\"arrow svelte-1mt0jy7\">→</span> <input class=\"acts svelte-1mt0jy7\" placeholder=\"move Newsletters, read\" aria-label=\"Do\" list=\"email-rule-actions\"/> <button class=\"tool svelte-1mt0jy7\" title=\"Show the mail it matches now\"><!></button> <button class=\"tool svelte-1mt0jy7\" title=\"Remove this rule\"><!></button></div>"), ea = /* @__PURE__ */ xr("<p class=\"faint svelte-1mt0jy7\">No rules yet.</p>"), ta = /* @__PURE__ */ xr("<option></option>"), na = /* @__PURE__ */ xr("<p class=\"error svelte-1mt0jy7\"> </p>"), ra = /* @__PURE__ */ xr("<button class=\"atlas-btn svelte-1mt0jy7\">Cancel</button>"), ia = /* @__PURE__ */ xr("<span class=\"faint svelte-1mt0jy7\">for new mail in an inbox · kept in <button class=\"link svelte-1mt0jy7\"> </button></span> <p class=\"hint svelte-1mt0jy7\">When new mail matches the search, do the actions in order. A search is written as in the search box: <code class=\"svelte-1mt0jy7\">from:shop.example</code>, <code class=\"svelte-1mt0jy7\">subject:invoice has:attachment</code>, <code class=\"svelte-1mt0jy7\">list:physics</code>, <code class=\"svelte-1mt0jy7\">-from:boss</code>, several people at once: <code class=\"svelte-1mt0jy7\">from:ana@uni.example,bo@uni.example</code>. <b>important</b> stars it and keeps the conversation as a note at once; <b>not-important</b> moves it out of the inbox; <b>stop</b> keeps later rules from seeing it; <b>save</b> keeps the conversation as a note.</p> <!> <datalist id=\"email-rule-actions\"></datalist> <!> <footer class=\"svelte-1mt0jy7\"><button class=\"atlas-btn svelte-1mt0jy7\"><!> Add a rule</button> <span class=\"grow svelte-1mt0jy7\"></span> <!> <button class=\"atlas-btn primary svelte-1mt0jy7\"> </button></footer>", 1), aa = /* @__PURE__ */ xr("<div class=\"inline svelte-1mt0jy7\"><!></div>"), oa = /* @__PURE__ */ xr("<div class=\"scrim svelte-1mt0jy7\" role=\"presentation\"><div class=\"sheet svelte-1mt0jy7\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Rules\" tabindex=\"-1\"><header class=\"svelte-1mt0jy7\"><h2 class=\"svelte-1mt0jy7\">Rules</h2> <button class=\"x svelte-1mt0jy7\" aria-label=\"Close\">×</button></header> <!></div></div>"), sa = {
	hash: "svelte-1mt0jy7",
	code: ".scrim.svelte-1mt0jy7 {position:absolute;inset:0;z-index:60;background:rgba(0, 0, 0, 0.35);display:grid;place-items:center;padding:16px;}.inline.svelte-1mt0jy7 {display:grid;gap:10px;container-type:inline-size;}.sheet.svelte-1mt0jy7 {background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-lg);width:min(820px, 100%);max-height:90%;overflow:auto;padding:18px 22px;display:grid;gap:10px;}header.svelte-1mt0jy7 {display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;}h2.svelte-1mt0jy7 {margin:0;font-size:1.15em;}.faint.svelte-1mt0jy7 {color:var(--text-faint);font-size:0.9em;}.hint.svelte-1mt0jy7 {margin:0;color:var(--text-muted);font-size:0.9em;line-height:1.5;}code.svelte-1mt0jy7 {font-family:var(--font-mono);font-size:0.9em;background:var(--bg-hover);padding:0 4px;border-radius:4px;}.x.svelte-1mt0jy7 {all:unset;cursor:pointer;margin-left:auto;font-size:1.4em;color:var(--text-muted);padding:0 6px;}.link.svelte-1mt0jy7 {all:unset;cursor:pointer;color:var(--accent);}.rule.svelte-1mt0jy7 {display:flex;gap:8px;align-items:center;}.rule.svelte-1mt0jy7 input:where(.svelte-1mt0jy7) {min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:6px 9px;font:inherit;}.when.svelte-1mt0jy7 {flex:3;font-family:var(--font-mono);font-size:0.92em !important;}.acts.svelte-1mt0jy7 {flex:2;}.arrow.svelte-1mt0jy7 {color:var(--text-faint);}.tool.svelte-1mt0jy7 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);}.tool.svelte-1mt0jy7:hover {background:var(--bg-hover);color:var(--text);}footer.svelte-1mt0jy7 {display:flex;gap:8px;align-items:center;padding-top:6px;}footer.svelte-1mt0jy7 .atlas-btn:where(.svelte-1mt0jy7) {display:inline-flex;gap:6px;align-items:center;}.primary.svelte-1mt0jy7 {background:var(--accent) !important;color:var(--accent-fg) !important;border-color:transparent !important;}.grow.svelte-1mt0jy7 {flex:1;}.error.svelte-1mt0jy7 {color:var(--red);margin:0;}\n  @container (max-width: 600px) {.rule.svelte-1mt0jy7 {flex-wrap:wrap;}.when.svelte-1mt0jy7, .acts.svelte-1mt0jy7 {flex-basis:100%;}.arrow.svelte-1mt0jy7 {display:none;} }"
};
function ca(e, t) {
	Ke(t, !0), Yr(e, sa);
	let n = (e) => {
		var n = ia(), m = an(n), h = z(R(m)), g = on(h, !0);
		D(m);
		var _ = z(m, 4);
		Hr(_, 17, () => Y(a), Rr, (e, t, n) => {
			var r = $i(), i = R(r);
			mi(i);
			var a = z(i, 4);
			mi(a);
			var o = z(a, 2);
			Ni(R(o), {
				name: "search",
				size: 15
			}), D(o);
			var s = z(o, 2);
			Ni(R(s), {
				name: "trash",
				size: 15
			}), D(s), D(r), wn((e) => hi(a, e), [() => Y(t).actions.join(", ")]), yi(i, () => Y(t).when, (e) => Y(t).when = e), X("input", a, (e) => Y(t).actions = e.currentTarget.value.split(",")), X("click", o, () => p(Y(t))), X("click", s, () => d(n)), Q(e, r);
		}, (e) => {
			Q(e, ea());
		});
		var v = z(_, 2);
		Hr(v, 20, () => l, (e) => e, (e, t) => {
			var n = ta(), r = {};
			wn(() => {
				r !== (r = t) && (n.value = (n.__value = r) ?? "");
			}), Q(e, n);
		}), D(v);
		var y = z(v, 2), b = (e) => {
			var t = na(), n = on(t, !0);
			wn(() => Ar(n, Y(s))), Q(e, t);
		};
		Lr(y, (e) => {
			Y(s) && e(b);
		});
		var x = z(y, 2), S = R(x);
		Ni(R(S), {
			name: "plus",
			size: 14
		}), De(), D(S);
		var ee = z(S, 4), te = (e) => {
			var t = ra();
			X("click", t, function(...e) {
				r()?.apply(this, e);
			}), Q(e, t);
		};
		Lr(ee, (e) => {
			i() || e(te);
		});
		var ne = z(ee, 2), re = on(ne, !0);
		D(x), wn(() => {
			Ar(g, Y(o) || "mail/rules.md"), ne.disabled = Y(c), Ar(re, i() ? "Save rules" : "Save");
		}), X("click", h, () => {
			t.mail.atlas.open(Y(o), void 0, { beside: !0 }), r()();
		}), X("click", S, u), X("click", ne, f), Q(e, n);
	}, r = Oi(t, "onclose", 3, () => {}), i = Oi(t, "inline", 3, !1), a = /* @__PURE__ */ P(Yt([])), o = /* @__PURE__ */ P(""), s = /* @__PURE__ */ P(""), c = /* @__PURE__ */ P(!1), l = [
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
			F(a, e.rules, !0), F(o, e.path, !0);
		}, (e) => F(s, e.message, !0));
	});
	let u = () => F(a, [...Y(a), {
		when: "",
		actions: ["archive"]
	}], !0), d = (e) => F(a, Y(a).filter((t, n) => n !== e), !0);
	async function f() {
		F(c, !0);
		try {
			let e = Y(a).map((e) => ({
				when: e.when.trim(),
				actions: e.actions.map((e) => e.trim()).filter((e) => e && !e.endsWith("…"))
			})).filter((e) => e.when && e.actions.length), n = await t.mail.call("set_rules", { rules: e });
			t.mail.toast(`Rules saved in ${n.path}`, "success"), i() || r()();
		} catch (e) {
			F(s, e.message, !0);
		} finally {
			F(c, !1);
		}
	}
	async function p(e) {
		t.mail.search(e.when), r()();
	}
	var m = Tr(), h = an(m), g = (e) => {
		var t = aa(), r = R(t);
		n(r), D(t), Q(e, t);
	}, _ = (e) => {
		var t = oa(), i = R(t), a = R(i), o = z(R(a), 2);
		D(a);
		var s = z(a, 2);
		n(s), D(i), D(t), X("click", t, function(...e) {
			r()?.apply(this, e);
		}), X("keydown", t, (e) => e.key === "Escape" && r()()), X("click", i, (e) => e.stopPropagation()), X("keydown", i, (e) => e.stopPropagation()), X("click", o, function(...e) {
			r()?.apply(this, e);
		}), Q(e, t);
	};
	Lr(h, (e) => {
		i() ? e(g) : e(_, -1);
	}), Q(e, m), qe();
}
mr([
	"click",
	"input",
	"keydown"
]);
//#endregion
export { Yt as $, Jr as A, wr as B, mi as C, ri as D, oi as E, Ar as F, ar as G, X as H, Fr as I, Qt as J, wn as K, Q as L, Rr as M, Lr as N, ti as O, jr as P, z as Q, Tr as R, yi as S, si as T, pr as U, mr as V, Y as W, an as X, R as Y, on as Z, Ni as _, Pi as a, qe as at, Ti as b, Wi as c, D as ct, Ri as d, F as et, Fi as f, Ii as g, Bi as h, Ji as i, rt as it, Hr as j, Yr as k, Gi as l, d as lt, Ki as m, Qi as n, ht as nt, Li as o, Ke as ot, Ui as p, vn as q, Yi as r, nt as rt, Vi as s, De as st, ca as t, P as tt, qi as u, m as ut, ki as v, $ as w, Ci as x, Oi as y, xr as z };
