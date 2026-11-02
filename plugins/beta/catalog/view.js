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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/constants.js
var h = 1 << 24, g = 1024, _ = 2048, v = 4096, y = 8192, ee = 16384, b = 32768, x = 1 << 25, te = 65536, ne = 1 << 19, re = 1 << 20, ie = 1 << 25, ae = 1 << 21, oe = 1 << 22, se = 1 << 23, ce = Symbol("$state"), S = Symbol("component"), C = Symbol("legacy props"), le = Symbol(""), ue = Symbol("attributes"), de = Symbol("class"), w = Symbol("style"), T = Symbol("text"), fe = Symbol("form reset"), pe = new class extends Error {
	name = "StaleReactionError";
	message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
}(), me = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml"), he = {}, E = Symbol("uninitialized"), ge = "http://www.w3.org/1999/xhtml", _e = "http://www.w3.org/2000/svg", ve = "http://www.w3.org/1998/Math/MathML";
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
var D = !1;
function O(e) {
	D = e;
}
var k;
function A(e) {
	if (e === null) throw be(), he;
	return k = e;
}
function Ce() {
	return A(/* @__PURE__ */ an(k));
}
function j(e) {
	if (D) {
		if (/* @__PURE__ */ an(k) !== null) throw be(), he;
		k = e;
	}
}
function we(e = 1) {
	if (D) {
		for (var t = e, n = k; t--;) n = /* @__PURE__ */ an(n);
		k = n;
	}
}
function Te(e = !0) {
	for (var t = 0, n = k;;) {
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
function Ee(e) {
	if (!e || e.nodeType !== 8) throw be(), he;
	return e.data;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/equality.js
function De(e) {
	return e === this.v;
}
function Oe(e, t) {
	return e == e ? e !== t || typeof e == "object" && !!e || typeof e == "function" : t == t;
}
function ke(e) {
	return !Oe(e, this.v);
}
function Ae(e) {
	throw Error("https://svelte.dev/e/lifecycle_outside_component");
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/errors.js
function je() {
	throw Error("https://svelte.dev/e/async_derived_orphan");
}
function Me(e, t, n) {
	throw Error("https://svelte.dev/e/each_key_duplicate");
}
function Ne(e) {
	throw Error("https://svelte.dev/e/effect_in_teardown");
}
function Pe() {
	throw Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function Fe(e) {
	throw Error("https://svelte.dev/e/effect_orphan");
}
function Ie() {
	throw Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function Le(e) {
	throw Error("https://svelte.dev/e/props_invalid_value");
}
function Re() {
	throw Error("https://svelte.dev/e/state_descriptors_fixed");
}
function ze() {
	throw Error("https://svelte.dev/e/state_prototype_fixed");
}
function Be() {
	throw Error("https://svelte.dev/e/state_unsafe_mutation");
}
function Ve() {
	throw Error("https://svelte.dev/e/svelte_boundary_reset_onerror");
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/context.js
var M = null;
function He(e) {
	M = e;
}
function Ue(e, t = !1, n) {
	M = {
		p: M,
		i: !1,
		c: null,
		e: null,
		s: e,
		x: null,
		r: W,
		l: null
	};
}
function We(e) {
	var t = M, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) yn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, M = t.p, Ge(e);
}
function Ge(e = {}) {
	return i(e, S, { value: !0 }), e;
}
function Ke() {
	return !0;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/task.js
var qe = [];
function Je() {
	var e = qe;
	qe = [], f(e);
}
function Ye(e) {
	if (qe.length === 0 && !Ct) {
		var t = qe;
		queueMicrotask(() => {
			t === qe && Je();
		});
	}
	qe.push(e);
}
function Xe() {
	for (; qe.length > 0;) Je();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/status.js
var Ze = ~(_ | v | g);
function N(e, t) {
	e.f = e.f & Ze | t;
}
function Qe(e) {
	e.f & 512 || e.deps === null ? N(e, g) : N(e, v);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/utils.js
function $e(e, t, n) {
	e.f & 2048 ? t.add(e) : e.f & 4096 && n.add(e), N(e, g);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/misc.js
function et(e, t) {
	if (t) {
		let t = document.body;
		e.autofocus = !0, Ye(() => {
			document.activeElement === t && e.focus();
		});
	}
}
function tt(e) {
	D && /* @__PURE__ */ rn(e) !== null && sn(e);
}
var nt = !1;
function rt() {
	nt || (nt = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[fe]?.();
		});
	}, { capture: !0 }));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function it(e) {
	var t = U, n = W;
	Hn(null), Un(null);
	try {
		return e();
	} finally {
		Hn(t), Un(n);
	}
}
function at(e, t, n, r = n) {
	e.addEventListener(t, () => it(n));
	let i = e[fe];
	e[fe] = i ? () => {
		i(), r(!0);
	} : () => r(!0), rt();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/async.js
function ot(e, t, n, r) {
	let i = Ke() ? ut : pt;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = W, c = st(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
	function u(e) {
		if (!(s.f & 16384)) {
			c();
			try {
				r([...o, ...e]);
			} catch (e) {
				fn(e, s);
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
		Promise.all(n.map((e) => /* @__PURE__ */ ft(e))).then(u).catch((e) => fn(e, s)).finally(d);
	}
	l ? l.then(() => {
		c(), f(), ct();
	}) : f();
}
function st() {
	var e = W, t = U, n = M, r = F;
	return function(i = !0) {
		Un(e), Hn(t), He(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function ct(e = !0) {
	Un(null), Hn(null), He(null), e && F?.deactivate();
}
function lt() {
	var e = W, t = e.b, n = F, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function ut(e) {
	var t = 2 | _;
	return W !== null && (W.f |= ne), {
		ctx: M,
		deps: null,
		effects: null,
		equals: De,
		f: t,
		fn: e,
		reactions: null,
		rv: 0,
		v: E,
		wv: 0,
		parent: W,
		ac: null
	};
}
var dt = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function ft(e, t, n) {
	let r = W;
	r === null && je();
	var i = void 0, a = Bt(E), o = !U, s = /* @__PURE__ */ new Set();
	return Sn(() => {
		var t = W, n = p();
		i = n.promise;
		try {
			Promise.resolve(e()).then(n.resolve, (e) => {
				e !== pe && n.reject(e);
			}).finally(ct);
		} catch (e) {
			n.reject(e), ct();
		}
		var c = F;
		if (o) {
			if (t.f & 32768) var l = lt();
			if (r.b?.is_rendered()) c.async_deriveds.get(t)?.reject(dt);
			else for (let e of s.values()) e.reject(dt);
			s.add(n), c.async_deriveds.set(t, n);
		}
		let u = (e, t = void 0) => {
			l?.(), s.delete(n), t !== dt && (c.activate(), t ? (a.f |= se, Wt(a, t)) : (a.f & 8388608 && (a.f ^= se), Wt(a, e)), c.deactivate());
		};
		n.promise.then(u, (e) => u(null, e || "unknown"));
	}), _n(() => {
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
function P(e) {
	let t = /* @__PURE__ */ ut(e);
	return Gn(t), t;
}
/*#__NO_SIDE_EFFECTS__*/
function pt(e) {
	let t = /* @__PURE__ */ ut(e);
	return t.equals = ke, t;
}
function mt(e) {
	var t = e.effects;
	if (t !== null) {
		e.effects = null;
		for (var n = 0; n < t.length; n += 1) H(t[n]);
	}
}
function ht(e) {
	var t, n = W, r = e.parent;
	if (!zn && r !== null && e.v !== E && r.f & 24576) return ye(), e.v;
	Un(r);
	try {
		mt(e), t = rr(e);
	} finally {
		Un(n);
	}
	return t;
}
function gt(e) {
	var t = ht(e);
	if (!e.equals(t) && (e.wv = er(), (!F?.is_fork || e.deps === null) && (F === null ? e.v = t : (F.capture(e, t, !0), bt?.capture(e, t, !0)), e.deps === null))) {
		N(e, g);
		return;
	}
	zn || (xt === null ? Qe(e) : (gn() || F?.is_fork) && xt.set(e, t));
}
function _t(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && it(() => {
		t.ac.abort(pe), t.ac = null;
	}), t.fn !== null && (t.teardown = d), or(t, 0), On(t));
}
function vt(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && sr(t);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/batch.js
var yt = null, F = null, bt = null, xt = null, St = null, Ct = !1, wt = !1, Tt = null, Et = null, Dt = 0, Ot = 1, kt = class e {
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
		yt === null ? yt = this : (yt.#n = this, this.#t = yt), yt = this;
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
			for (var r of n.d) N(r, _), t(r);
			for (r of n.m) N(r, v), t(r);
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
					t.f ^= g;
				}
			}
			n || e.push(t);
		}
		return this.#c = [], e;
	}
	#_() {
		this.#e = !0;
		for (let e of this.#u) this.#d.delete(e), N(e, _), this.schedule(e);
		for (let e of this.#d) N(e, v), this.schedule(e);
		this.apply();
		for (var t = Tt = [], n = [], r = Et = []; this.#c.length > 0;) {
			Dt++ > 1e3 && (this.#S(), jt());
			for (let e of this.#g()) try {
				this.#v(e, t, n);
			} catch (t) {
				throw It(e), this.#h() || this.discard(), t;
			}
		}
		if (F = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (Tt = null, Et = null, this.#h()) {
			this.#x(n), this.#x(t);
			for (let [e, t] of this.#f) Ft(e, t);
			r.length > 0 && F.#_();
			return;
		}
		let a = this.#y();
		if (a) {
			this.#x(n), this.#x(t), a.#b(this);
			return;
		}
		this.#u.clear(), this.#d.clear();
		for (let e of this.#r) e(this);
		this.#r.clear(), bt = this, Nt(n), Nt(t), bt = null, this.#s?.resolve();
		var o = F;
		if (this.#a === 0 && (this.#c.length === 0 || o !== null) && this.#S(), this.#c.length > 0) {
			if (o !== null) {
				for (let e of this.#c) o.#c.push(e);
				this.#c = [];
			} else o = this;
		}
		o !== null && (Rt.clear(), o.#_());
	}
	#v(e, t, n) {
		e.f ^= g;
		for (var r = e.first; r !== null;) {
			var i = r.f, a = !!(i & 96);
			if (!(a && i & 1024 || i & 8192 || this.#f.has(r)) && r.fn !== null) {
				a ? r.f ^= g : i & 4 ? t.push(r) : tr(r) && (i & 16 && this.#d.add(r), sr(r));
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
					r & 4194320 && !this.async_deriveds.has(i) && (this.#d.delete(i), N(i, _), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#S(), F = this, this.#_();
	}
	#x(e) {
		for (var t = 0; t < e.length; t += 1) $e(e[t], this.#u, this.#d);
	}
	capture(e, t, n = !1) {
		e.v !== E && !this.previous.has(e) && this.previous.set(e, e.v), e.f & 8388608 || (this.current.set(e, [t, n]), xt?.set(e, t)), this.is_fork || (e.v = t);
	}
	activate() {
		F = this;
	}
	deactivate() {
		F = null, xt = null;
	}
	flush() {
		try {
			wt = !0, F = this, this.#_();
		} finally {
			Dt = 0, St = null, Tt = null, Et = null, wt = !1, F = null, xt = null, Rt.clear();
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
		this.#m || (this.#m = !0, Ye(() => {
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
		if (F === null) {
			let t = F = new e();
			!wt && !Ct && Ye(() => {
				t.#e || t.flush();
			});
		}
		return F;
	}
	apply() {
		xt = null;
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
			e === null || (e.#n = t), t === null ? yt = e : t.#t = e, this.linked = !1;
		}
	}
};
function At(e) {
	var t = Ct;
	Ct = !0;
	try {
		var n;
		for (e && (F !== null && !F.is_fork && F.flush(), n = e());;) {
			if (Xe(), F === null) return n;
			F.flush();
		}
	} finally {
		Ct = t;
	}
}
function jt() {
	try {
		Ie();
	} catch (e) {
		fn(e, St);
	}
}
var Mt = null;
function Nt(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && tr(r) && (Mt = /* @__PURE__ */ new Set(), sr(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && jn(r), Mt?.size > 0)) {
				Rt.clear();
				for (let e of Mt) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) Mt.has(n) && (Mt.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || sr(n);
					}
				}
				Mt.clear();
			}
		}
		Mt = null;
	}
}
function Pt(e) {
	F.schedule(e);
}
function Ft(e, t) {
	if (!(e.f & 32 && e.f & 1024)) {
		e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), N(e, g);
		for (var n = e.first; n !== null;) Ft(n, t), n = n.next;
	}
}
function It(e) {
	N(e, g);
	for (var t = e.first; t !== null;) It(t), t = t.next;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/sources.js
var Lt = /* @__PURE__ */ new Set(), Rt = /* @__PURE__ */ new Map(), zt = !1;
function Bt(e, t) {
	return {
		f: 0,
		v: e,
		reactions: null,
		equals: De,
		rv: 0,
		wv: 0
	};
}
/*#__NO_SIDE_EFFECTS__*/
function I(e, t) {
	let n = Bt(e, t);
	return Gn(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function Vt(e, t = !1, n = !0) {
	let r = Bt(e);
	return t || (r.equals = ke), r;
}
function L(e, t, n = !1) {
	return U !== null && (!Vn || U.f & 131072) && Ke() && U.f & 4325394 && (Wn === null || !Wn.has(e)) && Be(), Wt(e, n ? Jt(t) : t, Et);
}
var Ht = null, Ut = 0;
function Wt(e, t, n = null) {
	if (!e.equals(t)) {
		zn ? Rt.set(e, t) : Rt.has(e) || Rt.set(e, e.v);
		var r = kt.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && ht(t), xt === null && Qe(t);
		}
		e.wv = er(), Ht = null, Ut = 0, qt(e, _, n), Ht = null, Ke() && W !== null && W.f & 1024 && !(W.f & 96) && (Jn === null ? Yn([e]) : Jn.push(e)), !r.is_fork && Lt.size > 0 && !zt && Gt();
	}
	return t;
}
function Gt() {
	zt = !1;
	for (let e of Lt) {
		e.f & 1024 && N(e, v);
		let t;
		try {
			t = tr(e);
		} catch {
			t = !0;
		}
		t && sr(e);
	}
	Lt.clear();
}
function Kt(e) {
	L(e, e.v + 1);
}
function qt(e, t, n) {
	var r = e.reactions;
	if (r !== null) {
		var i = Ke(), a = r.length;
		if (Ut += a, Ut > 1e5 && Ht === null && (Ht = /* @__PURE__ */ new Set()), Ht !== null) {
			if (Ht.has(e)) return;
			Ht.add(e);
		}
		for (var o = 0; o < a; o++) {
			var s = r[o], c = s.f;
			if (i || s !== W) {
				var l = (c & _) === 0;
				if (l && N(s, t), c & 131072) Lt.add(s);
				else if (c & 2) {
					var u = s;
					xt?.delete(u), qt(u, v, n);
				} else if (l) {
					var d = s;
					c & 16 && Mt !== null && Mt.add(d), n === null ? Pt(d) : n.push(d);
				}
			}
		}
	}
}
function Jt(t) {
	if (typeof t != "object" || !t || ce in t || S in t) return t;
	let n = l(t);
	if (n !== s && n !== c) return t;
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ I(0), u = null, d = Qn, f = (e) => {
		if (Qn === d) return e();
		var t = U, n = Qn;
		Hn(null), $n(d);
		var r = e();
		return Hn(t), $n(n), r;
	};
	return i && r.set("length", /* @__PURE__ */ I(t.length, u)), new Proxy(t, {
		defineProperty(e, t, n) {
			(!("value" in n) || n.configurable === !1 || n.enumerable === !1 || n.writable === !1) && Re();
			var i = r.get(t);
			return i === void 0 ? f(() => {
				var e = /* @__PURE__ */ I(n.value, u);
				return r.set(t, e), e;
			}) : L(i, n.value, !0), !0;
		},
		deleteProperty(e, t) {
			var n = r.get(t);
			if (n === void 0) {
				if (t in e) {
					let e = f(() => /* @__PURE__ */ I(E, u));
					r.set(t, e), Kt(o);
				}
			} else L(n, E), Kt(o);
			return !0;
		},
		get(e, n, i) {
			if (n === ce) return t;
			var o = r.get(n), s = n in e;
			if (o === void 0 && (!s || a(e, n)?.writable) && (o = f(() => /* @__PURE__ */ I(Jt(s ? e[n] : E), u)), r.set(n, o)), o !== void 0) {
				var c = G(o);
				return c === E ? void 0 : c;
			}
			return Reflect.get(e, n, i);
		},
		getOwnPropertyDescriptor(e, t) {
			this.has?.(e, t);
			var n = Reflect.getOwnPropertyDescriptor(e, t), i = r.get(t);
			if (i !== void 0) {
				var a = G(i);
				if (a === E) return;
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
			if (t === ce) return !0;
			var n = r.get(t), i = n !== void 0 && n.v !== E || Reflect.has(e, t);
			return (n !== void 0 || W !== null && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ I(i ? Jt(e[t]) : E, u)), r.set(t, n)), G(n) === E) ? !1 : i;
		},
		set(e, t, n, s) {
			var c = r.get(t), l = t in e;
			if (i && t === "length") for (var d = n; d < c.v; d += 1) {
				var p = r.get(d + "");
				p === void 0 ? d in e && (p = f(() => /* @__PURE__ */ I(E, u)), r.set(d + "", p)) : L(p, E);
			}
			if (c === void 0) (!l || a(e, t)?.writable) && (c = f(() => /* @__PURE__ */ I(void 0, u)), L(c, Jt(n)), r.set(t, c));
			else {
				l = c.v !== E;
				var m = f(() => Jt(n));
				L(c, m);
			}
			var h = Reflect.getOwnPropertyDescriptor(e, t);
			if (h?.set && h.set.call(s, n), !l) {
				if (i && typeof t == "string") {
					var g = r.get("length"), _ = Number(t);
					Number.isInteger(_) && _ >= g.v && L(g, _ + 1);
				}
				Kt(o);
			}
			return !0;
		},
		ownKeys(e) {
			G(o);
			var t = Reflect.ownKeys(e).filter((e) => {
				var t = r.get(e);
				return t === void 0 || t.v !== E;
			});
			for (var [n, i] of r) i.v !== E && !(n in e) && t.push(n);
			return t;
		},
		setPrototypeOf() {
			ze();
		}
	});
}
function Yt(e) {
	try {
		if (typeof e == "object" && e && ce in e) return e[ce];
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
		$t = a(t, "firstChild").get, en = a(t, "nextSibling").get, u(e) && (e[de] = void 0, e[ue] = null, e[w] = void 0, e.__e = void 0), u(n) && (n[T] = void 0);
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
	if (!D) return /* @__PURE__ */ rn(e);
	var n = /* @__PURE__ */ rn(k);
	if (n === null) n = k.appendChild(nn());
	else if (t && n.nodeType !== 3) {
		var r = nn();
		return n?.before(r), A(r), r;
	}
	return t && un(n), A(n), n;
}
function on(e, t = !1) {
	if (!D) {
		var n = /* @__PURE__ */ rn(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ an(n) : n;
	}
	if (t) {
		if (k?.nodeType !== 3) {
			var r = nn();
			return k?.before(r), A(r), r;
		}
		un(k);
	}
	return k;
}
function z(e, t = !1) {
	if (!D) return /* @__PURE__ */ rn(e);
	var n = R(e, t);
	return j(e), n;
}
function B(e, t = 1, n = !1) {
	let r = D ? k : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ an(r);
	if (!D) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = nn();
			return r === null ? i?.after(a) : r.before(a), A(a), a;
		}
		un(r);
	}
	return A(r), r;
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
	if (t === null) return U.f |= se, e;
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
	W === null && (U === null && Fe(e), Pe()), zn && Ne(e);
}
function mn(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function hn(e, t) {
	var n = W;
	n !== null && n.f & 8192 && (e |= y);
	var r = {
		ctx: M,
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
	F?.register_created_effect(r);
	var i = r;
	if (e & 4) Tt === null ? kt.ensure().schedule(r) : Tt.push(r);
	else if (t !== null) {
		try {
			sr(r);
		} catch (e) {
			throw H(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= te));
	}
	if (i !== null && (i.parent = n, n !== null && mn(i, n), U !== null && U.f & 2 && !(e & 64))) {
		var a = U;
		(a.effects ??= []).push(i);
	}
	return r;
}
function gn() {
	return U !== null && !Vn;
}
function _n(e) {
	let t = hn(8, null);
	return N(t, g), t.teardown = e, t;
}
function vn(e) {
	pn("$effect");
	var t = W.f;
	if (!U && t & 32 && M !== null && !M.i) {
		var n = M;
		(n.e ??= []).push(e);
	} else return yn(e);
}
function yn(e) {
	return hn(4 | re, e);
}
function bn(e) {
	kt.ensure();
	let t = hn(64 | ne, e);
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
	return hn(oe | ne, e);
}
function Cn(e, t = 0) {
	return hn(8 | t, e);
}
function V(e, t = [], n = [], r = []) {
	ot(r, t, n, (t) => {
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
	return hn(32 | ne, e);
}
function Dn(e) {
	var t = e.teardown;
	if (t !== null) {
		let n = zn, r = U;
		Bn(!0), Hn(null);
		try {
			t.call(null);
		} catch (t) {
			fn(t, e.parent);
		} finally {
			Bn(n), Hn(r);
		}
	}
}
function On(e, t = !1) {
	var n = e.first;
	for (e.first = e.last = null; n !== null;) {
		let e = n.ac;
		e !== null && it(() => {
			e.abort(pe);
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
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (An(e.nodes.start, e.nodes.end), n = !0), e.f |= x, On(e, t && !n), or(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	Dn(e), e.f ^= x, e.f |= ee;
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
		e.f ^= y, e.f & 1024 || (N(e, _), kt.ensure().schedule(e));
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/legacy.js
var Ln = null, Rn = !1, zn = !1;
function Bn(e) {
	zn = e;
}
var U = null, Vn = !1;
function Hn(e) {
	U = e;
}
var W = null;
function Un(e) {
	W = e;
}
var Wn = null;
function Gn(e) {
	U !== null && (U.f & 2097152 || U.f & 2) && (Wn ??= /* @__PURE__ */ new Set()).add(e);
}
var Kn = null, qn = 0, Jn = null;
function Yn(e) {
	Jn = e;
}
var Xn = 1, Zn = 0, Qn = Zn;
function $n(e) {
	Qn = e;
}
function er() {
	return ++Xn;
}
function tr(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (tr(a) && gt(a), a.wv > e.wv) return !0;
		}
		t & 512 && xt === null && N(e, g);
	}
	return !1;
}
function nr(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(Wn !== null && Wn.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? nr(a, t, !1) : t === a && (n ? N(a, _) : a.f & 1024 && N(a, v), Pt(a));
	}
}
function rr(e) {
	var t = Kn, n = qn, r = Jn, i = U, a = Wn, o = M, s = Vn, c = Qn, l = e.f;
	Kn = null, qn = 0, Jn = null, U = l & 96 ? null : e, Wn = null, He(e.ctx), Vn = !1, Qn = ++Zn, e.ac !== null && (it(() => {
		e.ac.abort(pe);
	}), e.ac = null);
	try {
		e.f |= ae;
		var u = e.fn, d = u();
		e.f |= b;
		var f = ir(e);
		if (Ke() && Jn !== null && !Vn && f !== null && !(e.f & 6146)) for (var p = 0; p < Jn.length; p++) nr(Jn[p], e);
		if (i !== null && i !== e) {
			if (Zn++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = Zn;
			if (t !== null) for (let e of t) e.rv = Zn;
			Jn !== null && (r === null ? r = Jn : r.push(...Jn));
		}
		return e.f & 8388608 && (e.f ^= se), d;
	} catch (t) {
		return ir(e), dn(t);
	} finally {
		e.f ^= ae, Kn = t, qn = n, Jn = r, U = i, Wn = a, He(o), Vn = s, Qn = c;
	}
}
function ir(e) {
	var t = e.deps, n = F?.is_fork;
	if (Kn !== null) {
		var r;
		if (n || or(e, qn), t !== null && qn > 0) for (t.length = qn + Kn.length, r = 0; r < Kn.length; r++) t[qn + r] = Kn[r];
		else e.deps = t = Kn;
		if (gn() && e.f & 512) for (r = qn; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && qn < t.length && (or(e, qn), t.length = qn);
	return t;
}
function ar(e, r) {
	let i = r.reactions;
	if (i !== null) {
		var a = t.call(i, e);
		if (a !== -1) {
			var o = i.length - 1;
			o === 0 ? i = r.reactions = null : (i[a] = i[o], i.pop());
		}
	}
	if (i === null && r.f & 2 && (Kn === null || !n.call(Kn, r))) {
		var s = r;
		s.f & 512 && (s.f ^= 512), s.v !== E && Qe(s), s.ac !== null && it(() => {
			s.ac.abort(pe), s.ac = null, N(s, _);
		}), _t(s), or(s, 0);
	}
}
function or(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) ar(e, n[r]);
}
function sr(e) {
	var t = e.f;
	if (!(t & 16384)) {
		N(e, g);
		var n = W, r = Rn;
		W = e, Rn = !(t & 96);
		try {
			t & 16777232 ? kn(e) : On(e), Dn(e);
			var i = rr(e);
			e.teardown = typeof i == "function" ? i : null, e.wv = Xn;
		} finally {
			Rn = r, W = n;
		}
	}
}
async function cr() {
	await Promise.resolve(), At();
}
function G(e) {
	var t = !!(e.f & 2);
	if (Ln?.add(e), U !== null && !Vn && !(W !== null && W.f & 16384) && (Wn === null || !Wn.has(e))) {
		var r = U.deps;
		if (U.f & 2097152) e.rv < Zn && (e.rv = Zn, Kn === null && r !== null && r[qn] === e ? qn++ : Kn === null ? Kn = [e] : Kn.push(e));
		else {
			U.deps ??= [], n.call(U.deps, e) || U.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [U] : n.call(i, U) || i.push(U);
		}
	}
	if (zn && Rt.has(e)) return Rt.get(e);
	if (t) {
		var a = e;
		if (zn) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || ur(a)) && (o = ht(a)), Rt.set(a, o), o;
		}
		var s = !(a.f & 512) && !Vn && U !== null && (Rn || !!(U.f & 512)), c = (a.f & b) === 0;
		tr(a) && (s && (a.f |= 512), gt(a)), s && !c && (vt(a), lr(a));
	}
	if (xt?.has(e)) return xt.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function lr(e) {
	if (e.f |= 512, e.deps !== null) for (let t of e.deps) (t.reactions ??= []).push(e), t.f & 2 && !(t.f & 512) && (vt(t), lr(t));
}
function ur(e) {
	if (e.v === E) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (Rt.has(t) || t.f & 2 && ur(t)) return !0;
	return !1;
}
function dr(e) {
	var t = Vn;
	try {
		return Vn = !0, e();
	} finally {
		Vn = t;
	}
}
function fr(e) {
	if (!(typeof e != "object" || !e || e instanceof EventTarget)) {
		if (ce in e) pr(e);
		else if (!Array.isArray(e)) for (let t in e) {
			let n = e[t];
			typeof n == "object" && n && ce in n && pr(n);
		}
	}
}
function pr(e, t = /* @__PURE__ */ new Set()) {
	if (typeof e == "object" && e && !(e instanceof EventTarget) && !t.has(e)) {
		t.add(e), e instanceof Date && e.getTime();
		for (let n in e) try {
			pr(e[n], t);
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
function mr(e) {
	return e.endsWith("capture") && e !== "gotpointercapture" && e !== "lostpointercapture";
}
var hr = [
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
function gr(e) {
	return hr.includes(e);
}
var _r = /* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split("."), vr = {
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
function yr(e) {
	return e = e.toLowerCase(), vr[e] ?? e;
}
[..._r];
var br = ["touchstart", "touchmove"];
function xr(e) {
	return br.includes(e);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dev/css.js
var Sr = Symbol("events"), Cr = /* @__PURE__ */ new Set(), wr = /* @__PURE__ */ new Set();
function Tr(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || Ar.call(t, e), !e.cancelBubble) return it(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, Ye(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function Er(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = Tr(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && _n(() => {
		o.__removed = !0, t.removeEventListener(e, o, a);
	});
}
function K(e, t, n) {
	(t[Sr] ??= {})[e] = n;
}
function Dr(e) {
	for (var t = 0; t < e.length; t++) Cr.add(e[t]);
	for (var n of wr) n(e);
}
var Or = null, kr = !1;
function Ar(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	Or = e, kr || (kr = !0, setTimeout(() => {
		kr = !1, Or = null;
	}));
	var s = 0, c = Or === e && e[Sr];
	if (c) {
		var l = a.indexOf(c);
		if (l !== -1 && (t === document || t === window)) {
			e[Sr] = t;
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
		Hn(null), Un(null);
		try {
			for (var p, m = []; o !== null && o !== t;) {
				try {
					var h = o[Sr]?.[r];
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
			e[Sr] = t, delete e.currentTarget, Hn(d), Un(f);
		}
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/reconciler.js
var jr = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function Mr(e) {
	return jr?.createHTML(e) ?? e;
}
function Nr(e) {
	var t = ln("template");
	return t.innerHTML = Mr(e.replaceAll("<!>", "<!---->")), t.content;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/template.js
function Pr(e, t) {
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
		if (D) return Pr(k, null), k;
		i === void 0 && (i = Nr(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ rn(i)));
		var t = r || Qt ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ rn(t), s = t.lastChild;
			Pr(o, s);
		} else Pr(t, t);
		return t;
	};
}
function Fr() {
	if (D) return Pr(k, null), k;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = nn();
	return e.append(t, n), Pr(t, n), e;
}
function J(e, t) {
	if (D) {
		var n = W;
		(!(n.f & 32768) || n.nodes.end === null) && (n.nodes.end = k), Ce();
		return;
	}
	e !== null && e.before(t);
}
//#endregion
//#region ui/node_modules/svelte/src/reactivity/create-subscriber.js
function Ir(e) {
	let t = 0, n = Bt(0), r;
	return () => {
		gn() && (G(n), Cn(() => (t === 0 && (r = dr(() => e(() => Kt(n)))), t += 1, () => {
			Ye(() => {
				--t, t === 0 && (r?.(), r = void 0, Kt(n));
			});
		})));
	};
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var Lr = te | ne;
function Rr(e, t, n, r) {
	new zr(e, t, n, r);
}
var zr = class {
	parent;
	is_pending = !1;
	transform_error;
	#e;
	#t = D ? k : null;
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
	#h = Ir(() => (this.#m = Bt(this.#l), () => {
		this.#m = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = W;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = W.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = wn(() => {
			if (D) {
				let e = this.#t;
				Ce();
				let t = e.data === "[!";
				if (e.data.startsWith("[?")) {
					let t = JSON.parse(e.data.slice(2));
					this.#_(t);
				} else t ? this.#y() : this.#g();
			} else this.#b();
		}, Lr), D && (this.#e = k);
	}
	#g() {
		try {
			this.#a = En(() => this.#r(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#_(e) {
		let t = this.#n.failed, { reset: n, invoke_onerror: r } = this.#v(e);
		Ye(r), t && (this.#s = En(() => {
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
			t = !0, n && Ve(), this.#s !== null && Mn(this.#s, () => {
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
		e && (this.is_pending = !0, this.#o = En(() => e(this.#e)), Ye(() => {
			var e = this.#c = document.createDocumentFragment(), t = nn(), n = !1;
			if (e.append(t), this.#a = this.#S(() => {
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
			}), this.#a === null) {
				this.#c = null, n && this.#x(F);
				return;
			}
			this.#u === 0 && (this.#e.before(e), this.#c = null, Mn(this.#o, () => {
				this.#o = null;
			}), this.#x(F));
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
			} else this.#x(F);
		} catch (e) {
			this.error(e);
		}
	}
	#x(e) {
		this.is_pending = !1, e.transfer_effects(this.#f, this.#p);
	}
	defer_effect(e) {
		$e(e, this.#f, this.#p);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#n.pending;
	}
	#S(e) {
		var t = W, n = U, r = M;
		Un(this.#i), Hn(this.#i), He(this.#i.ctx);
		try {
			return kt.ensure(), e();
		} finally {
			Un(t), Hn(n), He(r);
		}
	}
	#C(e, t) {
		if (!this.has_pending_snippet()) {
			this.parent && this.parent.#C(e, t);
			return;
		}
		this.#u += e, this.#u === 0 && (this.#x(t), this.#o && Mn(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null));
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !(!this.#m || this.#d) && (this.#d = !0, Ye(() => {
			this.#d = !1, this.#m && Wt(this.#m, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#h(), G(this.#m);
	}
	error(e) {
		if (!this.#n.onerror && !this.#n.failed) throw e;
		F?.is_fork ? (this.#a && F.skip_effect(this.#a), this.#o && F.skip_effect(this.#o), this.#s && F.skip_effect(this.#s), F.oncommit(() => {
			this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (H(this.#a), null), this.#o &&= (H(this.#o), null), this.#s &&= (H(this.#s), null), D && (A(this.#t), we(), A(Te()));
		let t = this.#n.failed, n = (e) => {
			let { reset: n, invoke_onerror: r } = this.#v(e);
			r(), t && (this.#s = this.#S(() => {
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
		Ye(() => {
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
function Y(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[T] ??= e.nodeValue) && (e[T] = n, e.nodeValue = `${n}`);
}
function Br(e, t) {
	return Hr(e, t);
}
var Vr = /* @__PURE__ */ new Map();
function Hr(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	tn();
	var l = void 0, u = bn(() => {
		var s = n ?? t.appendChild(nn());
		Rr(s, { pending: () => {} }, (t) => {
			Ue({});
			var n = M;
			if (o && (n.c = o), a && (i.$$events = a), D && Pr(t, null), l = e(t, i) || Ge(), D && (W.nodes.end = k, k === null || k.nodeType !== 8 || k.data !== "]")) throw be(), he;
			We();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = xr(r);
					for (let e of [t, document]) {
						var a = Vr.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), Vr.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, Ar, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(Cr)), wr.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = Vr.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, Ar), r.delete(e), r.size === 0 && Vr.delete(n)) : r.set(e, i);
			}
			wr.delete(d), s !== n && s.parentNode?.removeChild(s);
		};
	});
	return Ur.set(l, u), l;
}
var Ur = /* @__PURE__ */ new WeakMap();
function Wr(e, t) {
	let n = Ur.get(e);
	return n ? (Ur.delete(e), n(t)) : Promise.resolve();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/branches.js
var Gr = class {
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
		var n = F, r = cn();
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
		} else D && (this.anchor = k), this.#a(n);
	}
};
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/if.js
function X(e, t, n = !1) {
	var r;
	D && (r = k, Ce());
	var i = new Gr(e), a = n ? te : 0;
	function o(e, t) {
		if (D) {
			var n = Ee(r);
			if (e !== parseInt(n.substring(1))) {
				var a = Te();
				A(a), i.anchor = a, O(!1), i.ensure(e, t), O(!0);
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
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/key.js
var Kr = Symbol("NaN");
function qr(e, t, n) {
	D && Ce();
	var r = new Gr(e), i = !Ke();
	wn(() => {
		var e = t();
		e !== e && (e = Kr), i && typeof e == "object" && e && (e = {}), r.ensure(e, n);
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/each.js
function Jr(e, t) {
	return t;
}
function Yr(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		Mn(n, () => {
			if (o) {
				if (o.pending.delete(n), o.done.add(n), o.pending.size === 0) {
					var t = e.outrogroups;
					Xr(e, r(o.done)), t.delete(o), t.size === 0 && (e.outrogroups = null);
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
		Xr(e, t, !l);
	} else o = {
		pending: new Set(t),
		done: /* @__PURE__ */ new Set()
	}, (e.outrogroups ??= /* @__PURE__ */ new Set()).add(o);
}
function Xr(e, t, n = !0) {
	var r;
	if (e.pending.size > 0) {
		r = /* @__PURE__ */ new Set();
		for (let t of e.pending.values()) for (let n of t) r.add(e.items.get(n).e);
	}
	for (var i = 0; i < t.length; i++) {
		var a = t[i];
		r?.has(a) ? (a.f |= ie, In(a, document.createDocumentFragment())) : H(t[i], n);
	}
}
var Zr;
function Z(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = D ? A(/* @__PURE__ */ rn(u)) : u.appendChild(nn());
	}
	D && Ce();
	var d = null, f = /* @__PURE__ */ pt(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p, m = /* @__PURE__ */ new Map(), h = !0;
	function g(e) {
		v.effect.f & 16384 || (v.pending.delete(e), v.fallback = d, $r(v, p, c, n, a), d !== null && (p.length === 0 ? d.f & 33554432 ? (d.f ^= ie, ti(d, null, c)) : Pn(d) : Mn(d, () => {
			d = null;
		})));
	}
	function _(e) {
		v.pending.delete(e);
	}
	var v = {
		effect: wn(() => {
			p = G(f);
			var e = p.length;
			let t = !1;
			D && Ee(c) === "[!" != (e === 0) && (c = Te(), A(c), O(!1), t = !0);
			for (var r = /* @__PURE__ */ new Set(), u = F, v = cn(), y = 0; y < e; y += 1) {
				D && k.nodeType === 8 && k.data === "]" && (c = k, t = !0, O(!1));
				var ee = p[y], b = a(ee, y), x = h ? null : l.get(b);
				x ? (x.v && Wt(x.v, ee), x.i && Wt(x.i, y), v && u.unskip_effect(x.e)) : (x = ei(l, h ? c : Zr ??= nn(), ee, b, y, o, n, i), h || (x.e.f |= ie), l.set(b, x)), r.add(b);
			}
			if (e === 0 && s && !d && (h ? d = En(() => s(c)) : (d = En(() => s(Zr ??= nn())), d.f |= ie)), e > r.size && Me("", "", ""), D && e > 0 && A(Te()), !h) {
				if (m.set(u, r), v) {
					for (let [e, t] of l) r.has(e) || u.skip_effect(t.e);
					u.oncommit(g), u.ondiscard(_);
				} else g(u);
			}
			t && O(!0), G(f);
		}),
		flags: n,
		items: l,
		pending: m,
		outrogroups: null,
		fallback: d
	};
	h = !1, D && (c = k);
}
function Qr(e) {
	for (; e !== null && !(e.f & 32);) e = e.next;
	return e;
}
function $r(e, t, n, i, a) {
	var o = !!(i & 8), s = t.length, c = e.items, l = Qr(e.effect.first), u, d = null, f, p = [], m = [], h, g, _, v;
	if (o) for (v = 0; v < s; v += 1) h = t[v], g = a(h, v), _ = c.get(g).e, _.f & 33554432 || (_.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(_));
	for (v = 0; v < s; v += 1) {
		if (h = t[v], g = a(h, v), _ = c.get(g).e, e.outrogroups !== null) for (let t of e.outrogroups) t.pending.delete(_), t.done.delete(_);
		if (_.f & 8192 && (Pn(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= ie, _ === l) ti(_, null, n);
			else {
				var y = d ? d.next : l;
				_ === e.effect.last && (e.effect.last = _.prev), _.prev && (_.prev.next = _.next), _.next && (_.next.prev = _.prev), ni(e, d, _), ni(e, _, y), ti(_, y, n), d = _, p = [], m = [], l = Qr(d.next);
				continue;
			}
		}
		if (_ !== l) {
			if (u !== void 0 && u.has(_)) {
				if (p.length < m.length) {
					var ee = m[0], b;
					d = ee.prev;
					var x = p[0], te = p[p.length - 1];
					for (b = 0; b < p.length; b += 1) ti(p[b], ee, n);
					for (b = 0; b < m.length; b += 1) u.delete(m[b]);
					ni(e, x.prev, te.next), ni(e, d, x), ni(e, te, ee), l = ee, d = te, --v, p = [], m = [];
				} else u.delete(_), ti(_, l, n), ni(e, _.prev, _.next), ni(e, _, d === null ? e.effect.first : d.next), ni(e, d, _), d = _;
				continue;
			}
			for (p = [], m = []; l !== null && l !== _;) (u ??= /* @__PURE__ */ new Set()).add(l), m.push(l), l = Qr(l.next);
			if (l === null) continue;
		}
		_.f & 33554432 || p.push(_), d = _, l = Qr(_.next);
	}
	if (e.outrogroups !== null) {
		for (let t of e.outrogroups) t.pending.size === 0 && (Xr(e, r(t.done)), e.outrogroups?.delete(t));
		e.outrogroups.size === 0 && (e.outrogroups = null);
	}
	if (l !== null || u !== void 0) {
		var ne = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || ne.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && ne.push(l), l = Qr(l.next);
		var re = ne.length;
		if (re > 0) {
			var ae = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < re; v += 1) ne[v].nodes?.a?.measure();
				for (v = 0; v < re; v += 1) ne[v].nodes?.a?.fix();
			}
			Yr(e, ne, ae);
		}
	}
	o && Ye(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function ei(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? Bt(n) : /* @__PURE__ */ Vt(n, !1, !1) : null, l = o & 2 ? Bt(i) : null;
	return {
		v: c,
		i: l,
		e: En(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function ti(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ an(r);
		if (a.before(r), r === i) return;
		r = o;
	}
}
function ni(e, t, n) {
	t === null ? e.effect.first = n : t.next = n, n === null ? e.effect.last = t : n.prev = t;
}
function ri(e, t, n = !1, r = !1, i = !1, a = !1) {
	var o = e, s = "";
	if (n) {
		var c = e;
		D && (o = A(/* @__PURE__ */ rn(c)));
	}
	V(() => {
		var e = W;
		if (s === (s = t() ?? "")) {
			D && Ce();
			return;
		}
		if (n && !D) {
			e.nodes = null, c.innerHTML = s, s !== "" && Pr(/* @__PURE__ */ rn(c), c.lastChild);
			return;
		}
		if (e.nodes !== null && (An(e.nodes.start, e.nodes.end), e.nodes = null), s !== "") {
			if (D) {
				for (var a = k.data, l = Ce(), u = l; l !== null && (l.nodeType !== 8 || l.data !== "");) u = l, l = /* @__PURE__ */ an(l);
				if (l === null) throw be(), he;
				Pr(k, u), o = A(l);
				return;
			}
			var d = ln(r ? "svg" : i ? "math" : "template", r ? _e : i ? ve : void 0);
			d.innerHTML = s;
			var f = r || i ? d : d.content;
			if (Pr(/* @__PURE__ */ rn(f), f.lastChild), r || i) for (; /* @__PURE__ */ rn(f);) o.before(/* @__PURE__ */ rn(f));
			else o.before(f);
		}
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/css.js
function ii(e, t) {
	xn(() => {
		e = W?.parent?.nodes?.start ?? e;
		var n = e.getRootNode(), r = n.host ? n : n.head ?? n.ownerDocument.head;
		if (!r.querySelector("#" + t.hash)) {
			let e = ln("style");
			e.id = t.hash, e.textContent = t.code, r.appendChild(e);
		}
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/actions.js
function ai(e, t, n) {
	xn(() => {
		var r = dr(() => t(e, n?.()) || {});
		if (n && r?.update) {
			var i = !1, a = {};
			Cn(() => {
				var e = n();
				fr(e), i && Oe(a, e) && (a = e, r.update(e));
			}), i = !0;
		}
		if (r?.destroy) return () => r.destroy();
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/attachments.js
function oi(e, t) {
	var n = void 0, r;
	Tn(() => {
		n !== (n = t()) && (r &&= (H(r), null), n && (r = En(() => {
			xn(() => n(e));
		})));
	});
}
//#endregion
//#region ui/node_modules/clsx/dist/clsx.mjs
function si(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") {
		if (Array.isArray(e)) {
			var i = e.length;
			for (t = 0; t < i; t++) e[t] && (n = si(e[t])) && (r && (r += " "), r += n);
		} else for (n in e) e[n] && (r && (r += " "), r += n);
	}
	return r;
}
function ci() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = si(e)) && (r && (r += " "), r += t);
	return r;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/shared/attributes.js
function li(e) {
	return typeof e == "object" ? ci(e) : e ?? "";
}
var ui = [..." 	\n\r\f\xA0\v﻿"];
function di(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || ui.includes(r[o - 1])) && (s === r.length || ui.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function fi(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function pi(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function mi(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map(pi)), i && c.push(...Object.keys(i).map(pi));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = pi(e.substring(l, u).trim());
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
		return r && (n += fi(r)), i && (n += fi(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/class.js
function Q(e, t, n, r, i, a) {
	var o = e[de];
	if (D || o !== n || o === void 0) {
		var s = di(n, r, a);
		(!D || s !== e.getAttribute("class")) && (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[de] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/style.js
function hi(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function gi(e, t, n, r) {
	var i = e[w];
	if (D || i !== t) {
		var a = mi(t, r);
		(!D || a !== e.getAttribute("style")) && (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[w] = t;
	} else r && (Array.isArray(r) ? (hi(e, n?.[0], r[0]), hi(e, n?.[1], r[1], "important")) : hi(e, n, r));
	return r;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
function _i(e, t) {
	t ? e.hasAttribute("selected") || e.setAttribute("selected", "") : e.removeAttribute("selected");
}
function vi(e, t) {
	var n = !("__defaultValue" in e);
	(n || e.__defaultValue !== t) && (e.__defaultValue = t, yi(e, !n || "__value" in e));
}
function yi(t, n) {
	var r = t.__defaultValue, i = t.multiple, a = i ? r ?? [] : null;
	if (!i || e(a)) {
		var o = t.selectedIndex, s = n && i ? new Set(t.selectedOptions) : null;
		for (var c of t.options) {
			var l = Si(c);
			_i(c, i ? a.includes(l) : Xt(l, r));
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
function bi(t, n, r = !1) {
	if (t.multiple) {
		if (n == null) return;
		if (!e(n)) return xe();
		for (var i of t.options) i.selected = n.includes(Si(i));
		return;
	}
	for (i of t.options) if (Xt(Si(i), n)) {
		i.selected = !0;
		return;
	}
	(!r || n !== void 0) && (t.selectedIndex = -1);
}
function xi(e) {
	var t = new MutationObserver((t) => {
		t.every(Ci) || ("__defaultValue" in e && yi(e, !1), "__value" in e && bi(e, e.__value));
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
function Si(e) {
	return "__value" in e ? e.__value : e.value;
}
function Ci(e) {
	if (e.target.closest("selectedcontent") !== null) return !0;
	if (e.type === "childList") {
		var t = [...e.addedNodes, ...e.removedNodes];
		return t.length > 0 && t.every((e) => e.nodeName === "SELECTEDCONTENT");
	}
	return !1;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/attributes.js
var wi = Symbol("class"), Ti = Symbol("style"), Ei = Symbol("is custom element"), Di = Symbol("is html"), Oi = me ? "link" : "LINK", ki = me ? "input" : "INPUT", Ai = me ? "option" : "OPTION", ji = me ? "select" : "SELECT";
function Mi(e) {
	if (D) {
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
		e[fe] = n, Ye(n), rt();
	}
}
function $(e, t, n, r) {
	var i = Fi(e);
	D && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === Oi) || i[t] !== (i[t] = n) && (t === "loading" && (e[le] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && Li(e).has(t) ? e[t] = n : e.setAttribute(t, n));
}
function Ni(e, t, n, r, i = !1, a = !1) {
	D && i && e.nodeName === ki && ("defaultValue" in n || "defaultChecked" in n || Mi(e));
	var o = Fi(e), s = o[Ei], c = !o[Di];
	let l = D && s;
	l && O(!1);
	var u = t || {}, d = e.nodeName === Ai, f = e.nodeName === ji;
	for (var p in t) !(p in n) && p[0] + p[1] !== "$$" && (n[p] = null);
	n.class ? n.class = li(n.class) : (r || n[wi]) && (n.class = null), n[Ti] && (n.style ??= null);
	var m = Li(e);
	if (e.nodeName === ki && "type" in n && ("value" in n || "__value" in n)) {
		var h = n.type;
		(h !== u.type || h === void 0 && e.hasAttribute("type")) && (u.type = h, $(e, "type", h, a));
	}
	for (let i in n) {
		let l = n[i];
		if (d && i === "value" && l == null) {
			e.value = e.__value = "", u[i] = l;
			continue;
		}
		if (i === "class") {
			Q(e, e.namespaceURI === "http://www.w3.org/1999/xhtml", l, r, t?.[wi], n[wi]), u[i] = l, u[wi] = n[wi];
			continue;
		}
		if (i === "style") {
			gi(e, l, t?.[Ti], n[Ti]), u[i] = l, u[Ti] = n[Ti];
			continue;
		}
		var g = u[i];
		if (l !== g || l === void 0 && e.hasAttribute(i)) {
			u[i] = l;
			var _ = i[0] + i[1];
			if (_ !== "$$") {
				if (_ === "on") {
					let t = {}, n = "$$" + i, r = i.slice(2);
					var v = gr(r);
					if (mr(r) && (r = r.slice(0, -7), t.capture = !0), !v && g) {
						if (l != null) continue;
						e.removeEventListener(r, u[n], t), u[n] = null;
					}
					if (v) K(r, e, l), Dr([r]);
					else if (l != null) {
						function a(e) {
							u[i].call(this, e);
						}
						u[n] = Tr(r, e, a, t);
					}
				} else if (i === "style") $(e, i, l);
				else if (i === "autofocus") et(e, !!l);
				else if (!s && (i === "__value" || i === "value" && l != null)) e.value = e.__value = l;
				else if (i === "selected" && d) _i(e, l);
				else {
					var y = i;
					c || (y = yr(y));
					var ee = y === "defaultValue" || y === "defaultChecked";
					if (f && y === "defaultValue") continue;
					if (l == null && !s && !ee) {
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
					} else ee || (s || typeof l != "string") && m.has(y) ? (e[y] = l, y in o && (o[y] = E)) : typeof l != "function" && $(e, y, l, a);
				}
			}
		}
	}
	return l && O(!0), u;
}
function Pi(e, t, n = [], r = [], i = [], a, o = !1, s = !1) {
	ot(i, n, r, (n) => {
		var r = void 0, i = {}, c = e.nodeName === ji, l = !1;
		if (Tn(() => {
			var u = t(...n.map(G)), d = Ni(e, r, u, a, o, s);
			if (l && c) {
				var f = e;
				"defaultValue" in u && vi(f, u.defaultValue), "value" in u && bi(f, u.value);
			}
			for (let e of Object.getOwnPropertySymbols(i)) u[e] || H(i[e]);
			for (let t of Object.getOwnPropertySymbols(u)) {
				var p = u[t];
				t.description === "@attach" && (!r || p !== r[t]) && (i[t] && H(i[t]), i[t] = En(() => oi(e, () => p))), d[t] = p;
			}
			r = d;
		}), c) {
			var u = e;
			xn(() => {
				var e = r;
				"defaultValue" in e && vi(u, e.defaultValue), bi(u, e.value, !0), xi(u);
			});
		}
		l = !0;
	});
}
function Fi(e) {
	return e[ue] ??= {
		[Ei]: e.nodeName.includes("-"),
		[Di]: e.namespaceURI === ge
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function Ri(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet();
	at(e, "input", async (i) => {
		var a = i ? e.defaultValue : e.value;
		if (a = zi(e) ? Bi(a) : a, n(a), F !== null && r.add(F), await cr(), a !== (a = t())) {
			var o = e.selectionStart, s = e.selectionEnd, c = e.value.length;
			if (e.value = a ?? "", s !== null) {
				var l = e.value.length;
				o === s && s === c && l > c ? (e.selectionStart = l, e.selectionEnd = l) : (e.selectionStart = o, e.selectionEnd = Math.min(s, l));
			}
		}
	}), (D && e.defaultValue !== e.value || dr(t) == null && e.value) && (n(zi(e) ? Bi(e.value) : e.value), F !== null && r.add(F)), Cn(() => {
		var n = t();
		if (e === document.activeElement) {
			var i = F;
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
	xn(() => (dr(() => n(e[t])), r));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function Ui(e, t) {
	return e === t || e?.[ce] === t;
}
function Wi(e = Ge(), t, n, r) {
	var i = M.r, a = W;
	return xn(() => {
		var o, s;
		return Cn(() => {
			o = s, s = r?.() || [], dr(() => {
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/store.js
var Gi = !1;
function Ki(e) {
	var t = Gi;
	try {
		return Gi = !1, [e(), Gi];
	} finally {
		Gi = t;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/props.js
function qi(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ ut(r), G(u)) : (l && (l = !1, c = s ? dr(r) : r), c);
	let f;
	if (o) {
		var p = ce in e || C in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = Ki(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && Le(t), f(m)));
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
	var v = !1, y = (n & 1 ? ut : pt)(() => (v = !1, g()));
	o && G(y);
	var ee = W;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? G(y) : i && o ? Jt(e) : e;
			return L(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return zn && v || ee.f & 16384 ? y.v : G(y);
	});
}
function Ji(e) {
	M === null && Ae("onMount"), vn(() => {
		let t = dr(e);
		if (typeof t == "function") return t;
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
//#endregion
//#region ui/src/lib/prefs.ts
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
//#endregion
//#region ui/src/lib/text.ts
var Zi = (e) => String(e instanceof Error ? e.message : e);
//#endregion
//#region plugins/beta/catalog/ui/src/library.ts
function Qi(e, t) {
	let n = (e) => e.sort[t.id] ?? "";
	return [...e].sort((e, r) => {
		let i = n(e), a = n(r), o = typeof i == "number" && typeof a == "number" ? i - a : String(i).localeCompare(String(a), void 0, { numeric: !0 });
		return (t.desc ? -o : o) || e.id.localeCompare(r.id);
	});
}
function $i(e, t) {
	let n = e.text.toLowerCase();
	return t.toLowerCase().split(/\s+/).filter(Boolean).every((e) => n.includes(e));
}
var ea = " › ", ta = (e, t) => (e ?? []).some((e) => e === t || e.startsWith(t + " › "));
function na(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [t, r] of e) {
		let e = t.split(ea);
		e.forEach((t, i) => {
			let a = e.slice(0, i + 1).join(ea), o = n.get(a) ?? {
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
		let n = e.path.split(ea);
		return n.slice(0, -1).every((e, r) => t.has(n.slice(0, r + 1).join(ea)));
	});
}
function ra(e, t, n = []) {
	let r = /* @__PURE__ */ new Map();
	for (let n of e) for (let e of t(n) ?? []) r.set(e, (r.get(e) ?? 0) + 1);
	let i = [...r].filter(([e]) => !n.includes(e)).sort((e, t) => e[0].localeCompare(t[0]));
	return [...n.map((e) => [e, r.get(e) ?? 0]), ...i];
}
function ia(e, t, n, r) {
	let i = /* @__PURE__ */ new Map(), a = (e) => i.get(e.id), o = (e) => (typeof e.tabs == "function" ? e.tabs() : e.tabs) ?? [], s = (e, t) => {
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
			return i.clear(), (await Promise.all(r.map((e) => e.load().catch(() => [])))).flatMap((e, t) => e.map((e) => {
				let n = {
					...e,
					id: `${t}␟${e.id}`,
					tab: `${t}␟${o(r[t]).length ? e.tab ?? "" : ""}`
				};
				return i.set(n.id, {
					part: r[t],
					item: e
				}), n;
			}));
		},
		tabs: () => r.flatMap(s),
		groupsTitle: r.map((e) => e.groupsTitle).find(Boolean),
		groupOrder: l(r.map((e) => e.groupOrder ?? []), (e) => e),
		regroup: r.some((e) => e.regroup) ? async (e, t) => {
			for (let [n, r] of c(e)) await n.regroup?.(r, t);
		} : void 0,
		layouts: l(r.map((e) => e.layouts), (e) => e),
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
var aa = (e) => e.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), oa = (e) => e.subject ?? aa(e.title), sa = /* @__PURE__ */ new Map();
function ca(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(oa(n), [...t.get(oa(n)) ?? [], n]);
	return [...t].map(([e, t]) => {
		if (t.length === 1) return t[0];
		let n = t.map((e) => e.id).join("\n"), r = sa.get(n);
		if (!r || t.some((e, t) => r.members[t] !== e.id)) {
			let i = t.find((t) => aa(t.title) === e)?.title ?? t[0].title, a = t[0].icon;
			r = {
				id: t[0].id,
				title: i,
				icon: a,
				by: t[0].by,
				subject: e,
				members: t.map((e) => e.id),
				source: async () => ia(t[0].id, i, a, await Promise.all(t.map((e) => e.source())))
			}, sa.set(n, r);
		}
		return r;
	});
}
//#endregion
//#region ui/src/lib/keys.ts
var la = !1, ua = /^(Meta|OS|Super|Hyper)(Left|Right)?$/;
if (typeof window < "u") {
	let e = (e) => (t) => {
		(ua.test(t.key) || ua.test(t.code)) && (la = e);
	};
	window.addEventListener("keydown", e(!0), !0), window.addEventListener("keyup", e(!1), !0), window.addEventListener("blur", () => {
		la = !1;
	});
}
function da(e) {
	return e.metaKey || la || e.getModifierState?.("Super") || e.getModifierState?.("OS") || !1;
}
//#endregion
//#region ui/src/lib/marquee.ts
var fa = 5;
function pa(e, t) {
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
			if (Math.hypot(n.x - r.x, n.y - r.y) < fa) return;
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
//#endregion
//#region ui/src/lib/back.ts
var ma = globalThis.atlasBackStack ??= [];
function ha(e, t) {
	let n = {
		close: e,
		shown: t
	};
	return ma.push(n), () => {
		let e = ma.lastIndexOf(n);
		e >= 0 && ma.splice(e, 1);
	};
}
//#endregion
//#region ui/src/components/Select.svelte
var ga = /* @__PURE__ */ q("<span class=\"n svelte-ifm9j5\"> </span>"), _a = /* @__PURE__ */ q("<li role=\"option\"><span class=\"l svelte-ifm9j5\"> </span><!></li>"), va = /* @__PURE__ */ q("<ul class=\"menu svelte-ifm9j5\" role=\"listbox\" tabindex=\"-1\"></ul>"), ya = /* @__PURE__ */ q("<div class=\"select svelte-ifm9j5\"><button type=\"button\" class=\"trigger svelte-ifm9j5\" aria-haspopup=\"listbox\"><span class=\"cur svelte-ifm9j5\"> </span> <svg viewBox=\"0 0 16 16\" width=\"12\" height=\"12\" aria-hidden=\"true\" class=\"svelte-ifm9j5\"><path d=\"M4 6l4 4 4-4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg></button> <!></div>"), ba = {
	hash: "svelte-ifm9j5",
	code: ".select.svelte-ifm9j5 {position:relative;display:inline-block;min-width:180px;max-width:100%;}.trigger.svelte-ifm9j5 {display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;font:inherit;font-size:calc(13px * var(--ui-scale, 1));color:var(--text);background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 9px;text-align:left;}.trigger.svelte-ifm9j5:hover {border-color:var(--text-faint);}.trigger.svelte-ifm9j5:focus-visible, .trigger[aria-expanded=\"true\"].svelte-ifm9j5 {outline:none;border-color:var(--accent);}.cur.svelte-ifm9j5 {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}svg.svelte-ifm9j5 {flex:none;color:var(--text-muted);}.menu.svelte-ifm9j5 {position:absolute;z-index:50;top:calc(100% + 4px);left:0;min-width:100%;max-width:460px;max-height:300px;overflow:auto;margin:0;padding:4px;list-style:none;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-sm);box-shadow:var(--shadow-pop);}li.svelte-ifm9j5 {display:flex;flex-direction:column;gap:1px;padding:5px 9px;border-radius:4px;cursor:pointer;color:var(--text);font-size:calc(13px * var(--ui-scale, 1));}li.on.svelte-ifm9j5 {background:var(--bg-hover);}li.cur.svelte-ifm9j5 .l:where(.svelte-ifm9j5) {color:var(--accent);font-weight:600;}.n.svelte-ifm9j5 {color:var(--text-muted);font-size:.86em;}"
};
function xa(e, t) {
	Ue(t, !0), ii(e, ba);
	let n = /* @__PURE__ */ I(!1), r = /* @__PURE__ */ I(0), i, a = /* @__PURE__ */ I(void 0), o = /* @__PURE__ */ P(() => t.options.find((e) => e.value === t.value));
	vn(() => {
		if (G(n)) return ha(() => L(n, !1));
	});
	function s() {
		L(r, Math.max(0, t.options.findIndex((e) => e.value === t.value)), !0), L(n, !0), requestAnimationFrame(() => G(a)?.querySelector(".on")?.scrollIntoView({ block: "nearest" }));
	}
	function c(e) {
		L(n, !1), t.options[e] && t.options[e].value !== t.value && t.onchange(t.options[e].value), i.querySelector("button")?.focus();
	}
	function l(e) {
		if (!G(n)) {
			[
				"Enter",
				" ",
				"ArrowDown",
				"ArrowUp"
			].includes(e.key) && (e.preventDefault(), s());
			return;
		}
		if (e.key === "Escape") e.preventDefault(), e.stopPropagation(), L(n, !1);
		else if (e.key === "ArrowDown") e.preventDefault(), L(r, Math.min(t.options.length - 1, G(r) + 1), !0);
		else if (e.key === "ArrowUp") e.preventDefault(), L(r, Math.max(0, G(r) - 1), !0);
		else if (e.key === "Enter" || e.key === " ") e.preventDefault(), c(G(r));
		else if (e.key.length === 1) {
			let n = t.options.findIndex((t) => t.label.toLowerCase().startsWith(e.key.toLowerCase()));
			n >= 0 && L(r, n, !0);
		} else return;
		requestAnimationFrame(() => G(a)?.children[G(r)]?.scrollIntoView({ block: "nearest" }));
	}
	function u(e) {
		i.contains(e.relatedTarget) || L(n, !1);
	}
	var d = ya(), f = R(d), p = z(R(f), !0);
	we(2), j(f);
	var m = B(f, 2), h = (e) => {
		var n = va();
		Z(n, 23, () => t.options, (e) => e.value, (e, n, i) => {
			var a = _a();
			let o;
			var s = R(a), l = z(s, !0), u = B(s), d = (e) => {
				var t = ga(), r = z(t, !0);
				V(() => Y(r, G(n).note)), J(e, t);
			};
			X(u, (e) => {
				G(n).note && e(d);
			}), j(a), V(() => {
				$(a, "aria-selected", G(n).value === t.value), o = Q(a, 1, "svelte-ifm9j5", null, o, {
					on: G(i) === G(r),
					cur: G(n).value === t.value
				}), Y(l, G(n).label);
			}), K("mousedown", a, (e) => {
				e.preventDefault(), c(G(i));
			}), K("mousemove", a, () => L(r, G(i), !0)), J(e, a);
		}), j(n), Wi(n, (e) => L(a, e), () => G(a)), J(e, n);
	};
	X(m, (e) => {
		G(n) && e(h);
	}), j(d), Wi(d, (e) => i = e, () => i), V(() => {
		$(f, "id", t.id), $(f, "aria-expanded", G(n)), $(f, "aria-label", t.label), $(f, "title", G(o)?.note), Y(p, G(o)?.label ?? t.value);
	}), K("focusout", d, u), K("click", f, () => G(n) ? L(n, !1) : s()), K("keydown", f, l), J(e, d), We();
}
Dr([
	"focusout",
	"click",
	"keydown",
	"mousedown",
	"mousemove"
]);
//#endregion
//#region ui/src/lib/icons.ts
var Sa = {
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
}, Ca = (e) => Object.hasOwn(Sa, e);
function wa(e, t = 16) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Sa[e]}</svg>`;
}
//#endregion
//#region ui/src/components/Icon.svelte
var Ta = /* @__PURE__ */ q("<span class=\"icon svelte-1yrfdk4\"></span>"), Ea = {
	hash: "svelte-1yrfdk4",
	code: "\n  /* sized by the interface's scale (Settings → font size, a tab's zoom), as the text beside it */.icon.svelte-1yrfdk4 {display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:0;}.icon.svelte-1yrfdk4 svg {width:100%;height:100%;}"
};
function Da(e, t) {
	Ue(t, !0), ii(e, Ea);
	let n = qi(t, "size", 3, 16);
	var r = Ta();
	let i;
	ri(r, () => wa(t.name, n()), !0), j(r), V(() => i = gi(r, "", i, {
		width: `calc(${n() ?? ""}px * var(--ui-scale, 1))`,
		height: `calc(${n() ?? ""}px * var(--ui-scale, 1))`
	})), J(e, r), We();
}
//#endregion
//#region plugins/beta/catalog/ui/src/Icon.svelte
function Oa(e, t) {
	Ue(t, !0);
	let n = qi(t, "size", 3, 16);
	{
		let r = /* @__PURE__ */ P(() => Ca(t.name) ? t.name : "library");
		Da(e, {
			get name() {
				return G(r);
			},
			get size() {
				return n();
			}
		});
	}
	We();
}
//#endregion
//#region plugins/beta/catalog/ui/src/LibraryCover.svelte
var ka = /* @__PURE__ */ q("<img alt=\"\"/>"), Aa = /* @__PURE__ */ q("<div class=\"cover tile svelte-enia8e\" aria-hidden=\"true\"> </div>"), ja = /* @__PURE__ */ q("<div><!></div>"), Ma = {
	hash: "svelte-enia8e",
	code: ".cover.svelte-enia8e {width:100%;aspect-ratio:2 / 3;object-fit:cover;border-radius:var(--radius-sm);background:var(--bg-alt);box-shadow:var(--shadow-sm);}.cover.big.svelte-enia8e {aspect-ratio:auto;max-height:280px;width:auto;max-width:100%;margin-bottom:10px;}.tile.svelte-enia8e {display:grid;place-items:center;font-size:2.2em;font-weight:600;box-shadow:none;background:hsl(var(--hue) 32% 50% / .22);color:hsl(var(--hue) 40% 42%);} /* literal: a hue per title */.wrap.svelte-enia8e {width:100%;min-height:1px;}"
};
function Na(e, t) {
	Ue(t, !0), ii(e, Ma);
	let n = qi(t, "big", 3, !1), r = /* @__PURE__ */ I(null), i = /* @__PURE__ */ I(void 0);
	async function a(e) {
		let r = typeof e == "function" ? await e() : e;
		return r ? /^(https?:|data:|blob:)/i.test(r) ? r : t.atlas.thumbUrl(r.replace(/^!?\[\[|\]\]$/g, "").split("|")[0], n() ? 520 : 260) : null;
	}
	vn(() => {
		let e = t.cover, n = G(i);
		if (!n) return;
		let o = !0;
		L(r, null);
		let s = new IntersectionObserver((t) => {
			t.some((e) => e.isIntersecting) && (s.disconnect(), a(e).then((e) => {
				o && L(r, e, !0);
			}, () => {}));
		}, { rootMargin: "400px" });
		return s.observe(n), () => {
			o = !1, s.disconnect();
		};
	});
	let o = /* @__PURE__ */ P(() => t.title.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase() || "?"), s = /* @__PURE__ */ P(() => [...t.title].reduce((e, t) => (e * 31 + t.charCodeAt(0)) % 360, 7));
	var c = ja();
	let l;
	var u = R(c), d = (e) => {
		var t = ka();
		let i;
		V(() => {
			i = Q(t, 1, "cover svelte-enia8e", null, i, { big: n() }), $(t, "src", G(r));
		}), J(e, t);
	}, f = (e) => {
		var t = Aa();
		let n;
		var r = z(t, !0);
		V(() => {
			n = gi(t, "", n, { "--hue": G(s) }), Y(r, G(o));
		}), J(e, t);
	};
	X(u, (e) => {
		G(r) ? e(d) : n() || e(f, 1);
	}), j(c), Wi(c, (e) => L(i, e), () => G(i)), V(() => l = Q(c, 1, "wrap svelte-enia8e", null, l, { big: n() })), J(e, c), We();
}
//#endregion
//#region plugins/beta/catalog/ui/src/Library.svelte
var Pa = /* @__PURE__ */ q("<button><!> </button>"), Fa = /* @__PURE__ */ q("<div class=\"drop-hint svelte-7gk24t\"> </div>"), Ia = /* @__PURE__ */ q("<button role=\"radio\"> </button>"), La = /* @__PURE__ */ q("<div class=\"seg svelte-7gk24t\" role=\"radiogroup\" aria-label=\"Layout\"></div>"), Ra = /* @__PURE__ */ q("<form class=\"add svelte-7gk24t\"><input spellcheck=\"false\" class=\"svelte-7gk24t\"/> <button class=\"btn primary svelte-7gk24t\"> </button></form>"), za = /* @__PURE__ */ q("<button> <span class=\"c svelte-7gk24t\"> </span></button>"), Ba = /* @__PURE__ */ q("<div class=\"types svelte-7gk24t\" role=\"toolbar\" aria-label=\"Type\"><button>All <span class=\"c svelte-7gk24t\"> </span></button> <!></div>"), Va = /* @__PURE__ */ q("<p class=\"muted pad svelte-7gk24t\"> </p>"), Ha = /* @__PURE__ */ q("<button class=\"twisty svelte-7gk24t\"><!></button>"), Ua = /* @__PURE__ */ q("<span class=\"twisty svelte-7gk24t\"></span>"), Wa = /* @__PURE__ */ q("<div class=\"tree-row svelte-7gk24t\"><!> <button><!><span class=\"n svelte-7gk24t\"> </span><span class=\"c svelte-7gk24t\"> </span></button></div>"), Ga = /* @__PURE__ */ q("<button><!><span class=\"n svelte-7gk24t\"> </span><span class=\"c svelte-7gk24t\"> </span></button>"), Ka = /* @__PURE__ */ q("<h4 class=\"svelte-7gk24t\"> </h4> <!>", 1), qa = /* @__PURE__ */ q("<button><span class=\"hash svelte-7gk24t\">#</span><span class=\"n svelte-7gk24t\"> </span><span class=\"c svelte-7gk24t\"> </span></button>"), Ja = /* @__PURE__ */ q("<button class=\"h4 svelte-7gk24t\"><!>Tags <span class=\"c svelte-7gk24t\"> </span></button> <!>", 1), Ya = /* @__PURE__ */ q("<nav class=\"side svelte-7gk24t\"><button><!><span class=\"n svelte-7gk24t\"> </span><span class=\"c svelte-7gk24t\"> </span></button> <!> <!></nav>"), Xa = /* @__PURE__ */ q("<span class=\"m svelte-7gk24t\"> </span>"), Za = /* @__PURE__ */ q("<button><!> <span class=\"t svelte-7gk24t\"></span> <!></button>"), Qa = /* @__PURE__ */ q("<span> </span>"), $a = /* @__PURE__ */ q("<span class=\"flags svelte-7gk24t\"></span>"), eo = /* @__PURE__ */ q("<button><span class=\"t svelte-7gk24t\"></span> <!> <!></button>"), to = /* @__PURE__ */ q("<p class=\"muted pad none svelte-7gk24t\"> </p>"), no = /* @__PURE__ */ q("<li class=\"svelte-7gk24t\"></li>"), ro = /* @__PURE__ */ q("<li class=\"muted svelte-7gk24t\"> </li>"), io = /* @__PURE__ */ q("<aside class=\"detail many svelte-7gk24t\" aria-label=\"Picked\"><div class=\"kind svelte-7gk24t\"> </div> <ul class=\"picked svelte-7gk24t\"><!><!></ul> <div class=\"actions svelte-7gk24t\"><!><button class=\"btn svelte-7gk24t\">Clear</button></div></aside>"), ao = /* @__PURE__ */ q("<button class=\"scrim svelte-7gk24t\" aria-label=\"Close\"></button>"), oo = /* @__PURE__ */ q("<button class=\"close icon-btn svelte-7gk24t\" aria-label=\"Close\" title=\"Close\"><!></button>"), so = /* @__PURE__ */ q("<span class=\"hint svelte-7gk24t\"> </span>"), co = /* @__PURE__ */ q("<textarea class=\"svelte-7gk24t\"></textarea>"), lo = /* @__PURE__ */ q("<input class=\"svelte-7gk24t\"/>"), uo = /* @__PURE__ */ q("<label> <!> <!></label>"), fo = /* @__PURE__ */ q("<form class=\"edit svelte-7gk24t\"><!> <div class=\"actions svelte-7gk24t\"><button class=\"btn primary svelte-7gk24t\">Save</button><button type=\"button\" class=\"btn svelte-7gk24t\">Cancel</button></div></form>"), po = /* @__PURE__ */ q("<div class=\"kind svelte-7gk24t\"> </div>"), mo = /* @__PURE__ */ q("<p> </p>"), ho = /* @__PURE__ */ q("<dt class=\"svelte-7gk24t\"> </dt><dd class=\"svelte-7gk24t\"> </dd>", 1), go = /* @__PURE__ */ q("<dl class=\"svelte-7gk24t\"></dl>"), _o = /* @__PURE__ */ q("<div class=\"choice svelte-7gk24t\" role=\"radiogroup\"><span class=\"svelte-7gk24t\"> </span> <!></div>"), vo = /* @__PURE__ */ q("<a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-7gk24t\"><!> </a>"), yo = /* @__PURE__ */ q("<div class=\"links svelte-7gk24t\"></div>"), bo = /* @__PURE__ */ q("<button class=\"tag coll svelte-7gk24t\"><!> </button>"), xo = /* @__PURE__ */ q("<button class=\"tag svelte-7gk24t\"> </button>"), So = /* @__PURE__ */ q("<div class=\"tags svelte-7gk24t\"><!> <!></div>"), Co = /* @__PURE__ */ q("<h3 class=\"svelte-7gk24t\"> </h3><p class=\"abstract svelte-7gk24t\"> </p>", 1), wo = /* @__PURE__ */ q("<div></div>"), To = /* @__PURE__ */ q("<div class=\"links-bar svelte-7gk24t\"><!></div>"), Eo = /* @__PURE__ */ q("<!> <aside class=\"detail svelte-7gk24t\"><!> <!> <!> <!> <h2 class=\"svelte-7gk24t\"></h2> <!> <!> <div class=\"actions svelte-7gk24t\"></div> <!> <!> <!> <!> <!></aside>", 1), Do = /* @__PURE__ */ q("<aside class=\"detail none svelte-7gk24t\" aria-label=\"Details\"><p> <span class=\"keys-only\"><br/>↑ ↓ move, Enter opens.</span></p></aside>"), Oo = /* @__PURE__ */ q("<div tabindex=\"0\" role=\"application\"><!> <header class=\"svelte-7gk24t\"><h1 class=\"svelte-7gk24t\"><!> <span class=\"count svelte-7gk24t\"> </span></h1> <input class=\"search svelte-7gk24t\" spellcheck=\"false\"/> <!> <!> <!> <!></header> <!> <!> <div><!> <div></div> <!></div></div>"), ko = {
	hash: "svelte-7gk24t",
	code: ".types.svelte-7gk24t {display:flex;gap:6px;flex-wrap:wrap;padding:0 16px 10px;}.chip.svelte-7gk24t {display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--border);color:var(--text-muted);font-size:calc(12.5px * var(--ui-scale, 1));}.chip.svelte-7gk24t:hover {background:var(--bg-hover);color:var(--text);}.chip.on.svelte-7gk24t {background:var(--accent-soft);border-color:color-mix(in srgb, var(--accent) 45%, transparent);color:var(--accent);}.chip.svelte-7gk24t .c:where(.svelte-7gk24t) {color:var(--text-faint);font-variant-numeric:tabular-nums;}.library.svelte-7gk24t {height:100%;display:flex;flex-direction:column;background:var(--bg);outline:none;position:relative;}.library.dragging.svelte-7gk24t {box-shadow:inset 0 0 0 2px var(--accent);}.drop-hint.svelte-7gk24t {position:absolute;inset:0;z-index:5;display:grid;place-items:center;pointer-events:none;background:color-mix(in srgb, var(--bg) 70%, transparent);color:var(--accent);font-size:calc(16px * var(--ui-scale, 1));font-weight:600;}header.svelte-7gk24t {display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--border);}h1.svelte-7gk24t {display:inline-flex;gap:8px;align-items:center;margin:0 8px 0 0;font-size:calc(17px * var(--ui-scale, 1));color:var(--heading);}.count.svelte-7gk24t {font-size:.7em;font-weight:500;color:var(--text-faint);}input.svelte-7gk24t {font:inherit;font-size:calc(13px * var(--ui-scale, 1));color:var(--text);background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 9px;}input.svelte-7gk24t:focus {outline:none;border-color:var(--accent);}.search.svelte-7gk24t {flex:1;min-width:220px;}.add.svelte-7gk24t {display:flex;gap:6px;}.add.svelte-7gk24t input:where(.svelte-7gk24t) {width:270px;} /* the placeholder whole (clipped text is a bug) */.seg.svelte-7gk24t {display:inline-flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;}.seg.svelte-7gk24t button:where(.svelte-7gk24t) {padding:4px 10px;color:var(--text-muted);}.seg.svelte-7gk24t button.on:where(.svelte-7gk24t) {background:var(--accent-soft);color:var(--accent);}.btn.svelte-7gk24t {display:inline-flex;gap:6px;align-items:center;border:1px solid var(--border-strong);}.btn.svelte-7gk24t:hover:not(:disabled) {background:var(--bg-hover);}.btn.svelte-7gk24t:disabled {opacity:.45;cursor:default;}.btn.danger.svelte-7gk24t {color:var(--red);}.edit.svelte-7gk24t {display:grid;grid-template-columns:1fr 2fr;gap:8px;margin:0 0 14px;padding:12px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);background:var(--bg-alt);}.edit.svelte-7gk24t label:where(.svelte-7gk24t) {grid-column:1 / -1;display:flex;flex-direction:column;gap:3px;color:var(--text-muted);font-size:calc(12px * var(--ui-scale, 1));}.edit.svelte-7gk24t label.half:where(.svelte-7gk24t) {grid-column:auto;}.edit.svelte-7gk24t .actions:where(.svelte-7gk24t) {grid-column:1 / -1;}.edit.svelte-7gk24t textarea:where(.svelte-7gk24t) {font:inherit;font-size:calc(13px * var(--ui-scale, 1));color:var(--text);background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 9px;resize:vertical;}.hint.svelte-7gk24t {color:var(--text-faint);font-weight:400;}.body.svelte-7gk24t {flex:1;min-height:0;display:grid;grid-template-columns:210px minmax(300px, 1.15fr) minmax(280px, 1fr);}.body.bare.svelte-7gk24t {grid-template-columns:minmax(300px, 1.4fr) minmax(280px, 1fr);}.list.empty-list.svelte-7gk24t {grid-column:span 2;} /* nothing to list: its words get the detail's column too */.detail.none.svelte-7gk24t {display:grid;place-content:center;text-align:center;color:var(--text-faint);}.side.svelte-7gk24t {overflow:auto;border-right:1px solid var(--border);padding:8px 6px;background:var(--bg-alt);display:flex;flex-direction:column;gap:1px;}.side.svelte-7gk24t h4:where(.svelte-7gk24t), .side.svelte-7gk24t .h4:where(.svelte-7gk24t) {display:flex;align-items:center;gap:4px;margin:12px 8px 4px;padding:0;font-size:calc(10.5px * var(--ui-scale, 1));font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);text-align:left;}.side.svelte-7gk24t .h4:where(.svelte-7gk24t):hover {color:var(--text);}.item.svelte-7gk24t {display:flex;align-items:center;gap:7px;width:100%;padding:4px 8px;border-radius:var(--radius-sm);color:var(--text);text-align:left;font-size:calc(12.5px * var(--ui-scale, 1));}.item.svelte-7gk24t:hover {background:var(--bg-hover);}.item.on.svelte-7gk24t {background:var(--accent-soft);color:var(--heading);box-shadow:inset 2px 0 0 var(--accent);}.item.drop.svelte-7gk24t {outline:2px dashed var(--accent);outline-offset:-2px;background:var(--accent-soft);}.item.svelte-7gk24t .n:where(.svelte-7gk24t) {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.c.svelte-7gk24t {color:var(--text-faint);font-size:.85em;font-variant-numeric:tabular-nums;}.hash.svelte-7gk24t {color:var(--text-faint);width:14px;text-align:center;}.tagitem.svelte-7gk24t {color:var(--text-muted);}.tag.coll.svelte-7gk24t {display:inline-flex;gap:4px;align-items:center;color:var(--text);}.list.svelte-7gk24t {overflow:hidden auto; /* the grid wraps: a horizontal offset only ever hid the first column */border-right:1px solid var(--border);padding:6px;position:relative;user-select:none;-webkit-user-select:none;}.list.svelte-7gk24t .marquee {position:absolute;z-index:2;pointer-events:none;border:1px solid var(--accent);background:color-mix(in srgb, var(--accent) 12%, transparent);border-radius:2px;}.tree-row.svelte-7gk24t {display:flex;align-items:center;min-width:0;}.tree-row.svelte-7gk24t .item:where(.svelte-7gk24t) {flex:1;min-width:0;}.twisty.svelte-7gk24t {flex:none;width:16px;height:22px;display:grid;place-items:center;color:var(--text-faint);padding:0;}.twisty.svelte-7gk24t:hover {color:var(--text);}.picked.svelte-7gk24t {margin:8px 0 12px;padding-left:18px;font-size:.9em;color:var(--text-muted);}.picked.svelte-7gk24t li:where(.svelte-7gk24t) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.list.covers.svelte-7gk24t {display:grid;grid-template-columns:repeat(auto-fill, minmax(118px, 1fr));gap:14px 12px;align-content:start;padding:12px;}.row.svelte-7gk24t {display:grid;grid-template-columns:minmax(0, 1fr) auto;gap:2px 10px;width:100%;text-align:left;padding:8px 10px;border-radius:var(--radius-sm);}.row.svelte-7gk24t:hover {background:var(--bg-hover);}.row.sel.svelte-7gk24t {background:var(--accent-soft);box-shadow:inset 2px 0 0 var(--accent);}.card.svelte-7gk24t {display:flex;flex-direction:column;gap:4px;text-align:left;padding:4px;border-radius:var(--radius-sm);min-width:0;}\n  /* a library of thousands: items out of view are not laid out or painted (still in the page, for the marquee and keys) */.row.svelte-7gk24t {content-visibility:auto;contain-intrinsic-size:auto 52px;}.card.svelte-7gk24t {content-visibility:auto;contain-intrinsic-size:auto 230px;}.card.svelte-7gk24t:hover {background:var(--bg-hover);}.card.sel.svelte-7gk24t {background:var(--accent-soft);box-shadow:0 0 0 2px var(--accent);}.card.svelte-7gk24t .t:where(.svelte-7gk24t) {font-size:.92em;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;}.card.svelte-7gk24t .m:where(.svelte-7gk24t) {font-size:.8em;}.t.svelte-7gk24t {grid-column:1;color:var(--heading);font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.m.svelte-7gk24t {grid-column:1;color:var(--text-muted);font-size:.9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.flags.svelte-7gk24t {grid-column:2;grid-row:1 / span 2;display:flex;gap:4px;align-items:center;}.flag.svelte-7gk24t {font-size:calc(11px * var(--ui-scale, 1));padding:1px 6px;border-radius:999px;background:var(--bg-hover);color:var(--text-muted);}.flag.red.svelte-7gk24t {color:var(--red);background:color-mix(in srgb, var(--red) 14%, transparent);}\n  /* a column, so the linked mentions sit at the bottom however short the item's card is */.detail.svelte-7gk24t {overflow:auto;padding:18px 22px 40px;display:flex;flex-direction:column;}.detail.svelte-7gk24t > * {flex-shrink:0;}.links-bar.svelte-7gk24t {position:sticky;bottom:-40px;margin:auto -22px -40px;padding-top:18px;display:flex;flex-direction:column;max-height:50vh;}.links-bar.svelte-7gk24t .backlinks {max-height:50vh;}.kind.svelte-7gk24t {text-transform:uppercase;letter-spacing:.07em;font-size:calc(11px * var(--ui-scale, 1));color:var(--text-faint);}h2.svelte-7gk24t {margin:4px 0 6px;font-size:calc(19px * var(--ui-scale, 1));color:var(--heading);line-height:1.3;}.authors.svelte-7gk24t {margin:0;color:var(--text);}.venue.svelte-7gk24t {margin:2px 0 0;color:var(--text-muted);font-style:italic;}dl.svelte-7gk24t {display:grid;grid-template-columns:max-content minmax(0, 1fr);gap:3px 12px;font-size:.9em;margin:10px 0;}dt.svelte-7gk24t {color:var(--text-faint);}dd.svelte-7gk24t {margin:0;overflow-wrap:anywhere;}.actions.svelte-7gk24t {display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 8px;}.choice.svelte-7gk24t {display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0 10px;}.choice.svelte-7gk24t span:where(.svelte-7gk24t) {color:var(--text-faint);font-size:.85em;margin-right:2px;}.links.svelte-7gk24t {display:flex;flex-wrap:wrap;gap:14px;margin:6px 0;}.links.svelte-7gk24t a:where(.svelte-7gk24t) {display:inline-flex;gap:5px;align-items:center;color:var(--link, var(--accent));text-decoration:none;font-size:.92em;}.links.svelte-7gk24t a:where(.svelte-7gk24t):hover {text-decoration:underline;}.tags.svelte-7gk24t {display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;}.tag.svelte-7gk24t {font-size:calc(11.5px * var(--ui-scale, 1));padding:2px 9px;border-radius:999px;border:1px solid var(--border-strong);color:var(--text-muted);}.tag.svelte-7gk24t:hover {color:var(--text);border-color:var(--accent);}h3.svelte-7gk24t {margin:18px 0 6px;font-size:calc(11px * var(--ui-scale, 1));text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);}.abstract.svelte-7gk24t {margin:0;line-height:1.6;color:var(--text);}.pad.svelte-7gk24t {padding:12px 16px;}\n  /* the covers are a grid: the \"nothing here\" line spans all its columns (on a phone it sat in one, a word a line) */.none.svelte-7gk24t {grid-column:1 / -1;}\n\n  /* narrow: one column; groups as a row of chips; the card as a sheet over the list */.narrow.svelte-7gk24t header:where(.svelte-7gk24t) {padding:10px 12px;gap:8px;}.narrow.svelte-7gk24t .search:where(.svelte-7gk24t) {flex:1 1 100%;min-width:0;order:1;}.narrow.svelte-7gk24t .add:where(.svelte-7gk24t) {flex:1 1 100%;order:2;}.narrow.svelte-7gk24t .add:where(.svelte-7gk24t) input:where(.svelte-7gk24t) {flex:1;width:auto;min-width:0;}.narrow.svelte-7gk24t .types:where(.svelte-7gk24t) {padding:0 12px 8px;flex-wrap:nowrap;overflow-x:auto;}.narrow.svelte-7gk24t .body:where(.svelte-7gk24t), .narrow.svelte-7gk24t .body.bare:where(.svelte-7gk24t) {display:flex;flex-direction:column;}.narrow.svelte-7gk24t .side:where(.svelte-7gk24t) {flex:none;flex-direction:row;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid var(--border);padding:6px 12px;}.narrow.svelte-7gk24t .side:where(.svelte-7gk24t) h4:where(.svelte-7gk24t), .narrow.svelte-7gk24t .side:where(.svelte-7gk24t) .h4:where(.svelte-7gk24t) {margin:0 2px 0 6px;flex:none;}.narrow.svelte-7gk24t .side:where(.svelte-7gk24t) .item:where(.svelte-7gk24t) {width:auto;flex:none;max-width:70vw;padding:5px 10px;border-radius:999px;border:1px solid var(--border);}.narrow.svelte-7gk24t .side:where(.svelte-7gk24t) .item.on:where(.svelte-7gk24t) {box-shadow:none;border-color:color-mix(in srgb, var(--accent) 45%, transparent);}.narrow.svelte-7gk24t .list:where(.svelte-7gk24t) {flex:1;border-right:0;}.narrow.svelte-7gk24t .list.covers:where(.svelte-7gk24t) {grid-template-columns:repeat(auto-fill, minmax(104px, 1fr));gap:12px 10px;padding:10px 12px;}.scrim.svelte-7gk24t {position:absolute;inset:0;z-index:6;background:var(--scrim);border:0;padding:0;cursor:default;}.narrow.svelte-7gk24t .detail:where(.svelte-7gk24t) {position:absolute;left:0;right:0;bottom:0;z-index:7;max-height:80%;padding:18px 16px calc(24px + env(safe-area-inset-bottom, 0px));background:var(--bg-elev);border-top:1px solid var(--border-strong);border-radius:14px 14px 0 0;box-shadow:var(--shadow-pop);}.narrow.svelte-7gk24t .detail:where(.svelte-7gk24t) .cover.big {max-height:180px;}\n  /* stays at the sheet's top right while its card scrolls */.close.svelte-7gk24t {position:sticky;top:0;float:right;z-index:1;margin:-8px -6px 0 8px;width:36px;height:36px;display:grid;place-items:center;border-radius:50%;background:var(--bg-hover);}"
};
function Ao(e, t) {
	Ue(t, !0), ii(e, ko);
	let n = (e, t = d) => {
		var n = Pa();
		let r;
		var i = R(n), a = (e) => {
			Oa(e, {
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
		j(n), V(() => {
			r = Q(n, 1, "btn svelte-7gk24t", null, r, {
				primary: t().primary,
				danger: t().danger
			}), n.disabled = t().disabled, $(n, "title", t().title), Y(o, ` ${t().label ?? ""}`);
		}), K("click", n, () => void fe(t())), J(e, n);
	}, r = (e, n, r = "info", i) => t.atlas.toast(e, n, r, { timeout: i }), i = (e) => t.atlas.richTitle(e), a = /* @__PURE__ */ I(Jt([])), o = /* @__PURE__ */ I(""), s = /* @__PURE__ */ I(""), c = /* @__PURE__ */ I(Jt({ kind: "all" })), l = /* @__PURE__ */ I(null), u = /* @__PURE__ */ I(!1), f = /* @__PURE__ */ I(null), p = /* @__PURE__ */ I(Jt(dr(() => t.source.sorts[0]?.id ?? ""))), h = /* @__PURE__ */ I(Jt(dr(() => t.source.layouts[0]))), g = /* @__PURE__ */ I(Jt([])), _;
	async function v() {
		try {
			let e = new Map(G(a).map((e) => [e.id, e]));
			L(a, (await t.source.load()).map((t) => {
				let n = e.get(t.id);
				return n && JSON.stringify(n) === JSON.stringify(t) ? n : t;
			}), !0), L(o, "");
		} catch (e) {
			L(o, Zi(e), !0);
		}
	}
	let y = /* @__PURE__ */ P(() => ra(G(a), (e) => e.groups, t.source.groupOrder)), ee = /* @__PURE__ */ P(() => G(y).some(([e]) => e.includes(ea))), b = /* @__PURE__ */ I(Jt([])), x = /* @__PURE__ */ I(Jt([])), te = /* @__PURE__ */ P(() => new Set([...G(b), ...G(y).map(([e]) => e.split(ea)[0])].filter((e) => !G(x).includes(e)))), ne = /* @__PURE__ */ P(() => G(ee) ? na(G(y), G(te)) : []);
	function re(e) {
		G(te).has(e) ? (L(b, G(b).filter((t) => t !== e), !0), L(x, [...G(x), e], !0)) : (L(x, G(x).filter((t) => t !== e), !0), L(b, [...G(b), e], !0));
	}
	let ie = /* @__PURE__ */ P(() => ra(G(a), (e) => e.tags)), ae = /* @__PURE__ */ P(() => {
		let e = G(a);
		return (typeof t.source.tabs == "function" ? t.source.tabs() : t.source.tabs ?? []).map((t) => ({
			...t,
			n: e.filter((e) => e.tab === t.id).length
		})).filter((e) => e.n || e.always);
	}), oe = (e, t) => G(c).kind === e && (e === "all" || G(c).name === t), se = (e) => (!G(l) || e.tab === G(l)) && (G(c).kind === "all" || (G(c).kind === "group" ? ta(e.groups, G(c).name) : (e.tags ?? []).includes(G(c).name))), ce = /* @__PURE__ */ P(() => G(a).filter((e) => se(e) && $i(e, G(s)))), S = /* @__PURE__ */ P(() => Qi(G(ce), t.source.sorts.find((e) => e.id === G(p)) ?? { id: "" })), C = /* @__PURE__ */ P(() => G(S).find((e) => e.id === G(f)) ?? G(S)[0] ?? null), le = /* @__PURE__ */ I(1e3), ue = /* @__PURE__ */ P(() => G(le) < 700), de = /* @__PURE__ */ P(() => G(ue) ? G(f) !== null && G(C)?.id === G(f) ? G(C) : null : G(C)), w = /* @__PURE__ */ I(null);
	vn(() => {
		let e = G(C);
		if (!e) {
			L(w, null);
			return;
		}
		let n = dr(() => t.source.detail(e));
		if (!(n instanceof Promise)) {
			L(w, n, !0);
			return;
		}
		let r = !0;
		return n.then((e) => {
			r && L(w, e, !0);
		}, (e) => {
			r && L(o, Zi(e), !0);
		}), () => {
			r = !1;
		};
	});
	let T = /* @__PURE__ */ I(null);
	async function fe(e) {
		if ("edit" in e) {
			L(T, {
				def: e.edit,
				values: Object.fromEntries(e.edit.fields.map((e) => [e.key, e.value]))
			}, !0);
			return;
		}
		"confirm" in e && !await t.atlas.confirm(e.confirm.title, {
			hint: e.confirm.hint,
			ok: e.confirm.button,
			danger: !0
		}) || await pe(e.run);
	}
	async function pe(e) {
		try {
			await e();
		} catch (e) {
			r("It did not work", Zi(e), "error");
		}
		await v();
	}
	async function me() {
		if (G(T)) try {
			await G(T).def.save(G(T).values), L(T, null), await v();
		} catch (e) {
			r("Could not save", Zi(e), "error");
		}
	}
	let he = /* @__PURE__ */ P(() => G(C)?.id);
	vn(() => {
		G(he), L(T, null);
	});
	let E = /* @__PURE__ */ I(!1), ge = /* @__PURE__ */ I("");
	async function _e() {
		if (t.source.add && G(ge).trim() && !G(E)) {
			L(E, !0);
			try {
				let e = await t.source.add.run(G(ge).trim());
				await v(), e && L(f, e, !0), L(ge, "");
			} catch (e) {
				r("Could not add it", Zi(e), "error", 9e3);
			} finally {
				L(E, !1);
			}
		}
	}
	let ve = /* @__PURE__ */ I(!1);
	async function ye(e) {
		if (e.preventDefault(), L(ve, !1), !t.source.drop) return;
		let n = [...e.dataTransfer?.files ?? []].filter((e) => t.source.drop.accept.test(e.name));
		if (!n.length) {
			r("Nothing here can take these files");
			return;
		}
		let i = await t.source.drop.run(n);
		await v(), i && L(f, i, !0);
	}
	let be = "text/x-atlas-library", xe = /* @__PURE__ */ I(null);
	function Se(e, t) {
		let n = G(O).length > 1 && G(A).has(t.id) ? G(O) : [t.id];
		e.dataTransfer?.setData(be, JSON.stringify(n)), e.dataTransfer && (e.dataTransfer.effectAllowed = "move");
	}
	let D = (e) => ({
		ondragover: (n) => {
			t.source.regroup && n.dataTransfer?.types.includes(be) && (n.preventDefault(), L(xe, e, !0));
		},
		ondragleave: () => {
			G(xe) === e && L(xe, null);
		},
		ondrop: async (n) => {
			let i = JSON.parse(n.dataTransfer?.getData(be) || "[]");
			if (t.source.regroup && i.length) {
				n.preventDefault(), n.stopPropagation(), L(xe, null);
				try {
					await t.source.regroup(G(a).filter((e) => i.includes(e.id)), e);
				} catch (e) {
					r("Not moved", Zi(e), "error");
				}
				await v();
			}
		}
	}), O = /* @__PURE__ */ I(Jt([])), k = null, A = /* @__PURE__ */ P(() => new Set(G(O))), Ce = /* @__PURE__ */ P(() => G(S).filter((e) => G(A).has(e.id))), Te = (e) => G(O).length > 1 ? G(A).has(e.id) : G(de)?.id === e.id;
	function Ee(e, t) {
		if (e.ctrlKey || e.metaKey) {
			let e = G(O).length ? G(O) : G(C) ? [G(C).id] : [];
			L(O, e.includes(t.id) ? e.filter((e) => e !== t.id) : [...e, t.id], !0);
		} else if (e.shiftKey && k) {
			let e = G(S).findIndex((e) => e.id === k), n = G(S).indexOf(t);
			L(O, e < 0 ? [t.id] : G(S).slice(Math.min(e, n), Math.max(e, n) + 1).map((e) => e.id), !0);
		} else L(O, [t.id], !0);
		e.shiftKey || (k = t.id), L(f, t.id, !0);
	}
	let De = [];
	function Oe(e, t) {
		t ? De.length || (De = G(O)) : De = [], L(O, [.../* @__PURE__ */ new Set([...De, ...e])], !0), e.length && L(f, e.at(-1), !0);
	}
	let ke = /* @__PURE__ */ P(() => {
		let e = G(Ce);
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
	function Ae(e) {
		if (!G(S).length) return;
		let t = Math.max(0, Math.min(G(S).length - 1, (G(C) ? G(S).indexOf(G(C)) : -1) + e));
		L(f, G(S)[t].id, !0), L(O, [G(f)], !0), k = G(f);
		let n = !!_?.contains(document.activeElement);
		requestAnimationFrame(() => {
			let e = _?.querySelector(".row.sel, .card.sel");
			e?.scrollIntoView({ block: "nearest" }), n && e?.focus();
		});
	}
	function je(e) {
		if (e.target.closest("input, select, textarea")) return;
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
			e.preventDefault(), L(O, G(S).map((e) => e.id), !0);
			return;
		}
		if (e.key === "Escape" && G(O).length > 1) {
			e.preventDefault(), L(O, G(C) ? [G(C).id] : [], !0);
			return;
		}
		if (e.ctrlKey || da(e) || e.altKey) return;
		let n = e.key;
		if (n === "ArrowDown" || n === "j" || G(h) === "covers" && n === "ArrowRight") Ae(1);
		else if (n === "ArrowUp" || n === "k" || G(h) === "covers" && n === "ArrowLeft") Ae(-1);
		else if (n === "Enter" && G(C) && t.source.open) t.source.open(G(C));
		else if (G(C) && t.source.keys?.[n]) t.source.keys[n](G(C));
		else return;
		e.preventDefault();
	}
	function Me(e, n) {
		return { destroy: t.atlas.mountBlock(e, {
			type: "backlinks",
			path: n
		}) };
	}
	Ji(() => {
		v(), t.source.tools?.().then((e) => L(g, e, !0), () => {});
		let e, n = t.source.watch?.(() => {
			clearTimeout(e), e = setTimeout(v, 1200);
		});
		return () => {
			n?.(), clearTimeout(e);
		};
	});
	var Ne = Oo();
	let Pe;
	var Fe = R(Ne), Ie = (e) => {
		var n = Fa(), r = z(n, !0);
		V(() => Y(r, t.source.drop.hint)), J(e, n);
	};
	X(Fe, (e) => {
		G(ve) && t.source.drop && e(Ie);
	});
	var Le = B(Fe, 2), Re = R(Le), ze = R(Re);
	Oa(ze, {
		get name() {
			return t.source.icon;
		},
		size: 18
	});
	var Be = B(ze), Ve = z(B(Be), !0);
	j(Re);
	var M = B(Re, 2);
	Mi(M);
	var He = B(M, 2), Ge = (e) => {
		{
			let n = /* @__PURE__ */ P(() => t.source.sorts.map((e) => ({
				value: e.id,
				label: `Sort: ${e.label}`
			})));
			xa(e, {
				get value() {
					return G(p);
				},
				label: "Sort by",
				onchange: (e) => L(p, e, !0),
				get options() {
					return G(n);
				}
			});
		}
	};
	X(He, (e) => {
		t.source.sorts.length > 1 && e(Ge);
	});
	var Ke = B(He, 2), qe = (e) => {
		var n = La();
		Z(n, 20, () => t.source.layouts, (e) => e, (e, t) => {
			var n = Ia();
			let r;
			var i = z(n, !0);
			V(() => {
				$(n, "aria-checked", G(h) === t), r = Q(n, 1, "svelte-7gk24t", null, r, { on: G(h) === t }), Y(i, t === "covers" ? "Covers" : "List");
			}), K("click", n, () => L(h, t, !0)), J(e, n);
		}), j(n), J(e, n);
	};
	X(Ke, (e) => {
		t.source.layouts.length > 1 && e(qe);
	});
	var Je = B(Ke, 2), Ye = (e) => {
		var n = Ra(), r = R(n);
		Mi(r);
		var i = B(r, 2), a = z(i, !0);
		j(n), V((e) => {
			$(r, "placeholder", t.source.add.placeholder), r.disabled = G(E), i.disabled = e, Y(a, G(E) ? t.source.add.busy : "Add");
		}, [() => !G(ge).trim() || G(E)]), Er("submit", n, (e) => {
			e.preventDefault(), _e();
		}), Ri(r, () => G(ge), (e) => L(ge, e)), J(e, n);
	};
	X(Je, (e) => {
		t.source.add && e(Ye);
	}), Z(B(Je, 2), 17, () => G(g), (e) => e.label, (e, t) => {
		n(e, () => G(t));
	}), j(Le);
	var Xe = B(Le, 2), Ze = (e) => {
		var t = Ba(), n = R(t);
		let r;
		var i = z(B(R(n)), !0);
		j(n), Z(B(n, 2), 17, () => G(ae), (e) => e.id, (e, t) => {
			var n = za();
			let r;
			var i = R(n), a = z(B(i), !0);
			j(n), V(() => {
				r = Q(n, 1, "chip svelte-7gk24t", null, r, { on: G(l) === G(t).id }), $(n, "aria-pressed", G(l) === G(t).id), Y(i, `${G(t).title ?? ""} `), Y(a, G(t).n);
			}), K("click", n, () => L(l, G(l) === G(t).id ? null : G(t).id, !0)), J(e, n);
		}), j(t), V(() => {
			r = Q(n, 1, "chip svelte-7gk24t", null, r, { on: !G(l) }), Y(i, G(a).length);
		}), K("click", n, () => L(l, null)), J(e, t);
	};
	X(Xe, (e) => {
		G(ae).length > 1 && e(Ze);
	});
	var N = B(Xe, 2), Qe = (e) => {
		var t = Va(), n = z(t, !0);
		V(() => Y(n, G(o))), J(e, t);
	};
	X(N, (e) => {
		G(o) && e(Qe);
	});
	var $e = B(N, 2);
	let et;
	var nt = R($e), rt = (e) => {
		var n = Ya(), r = R(n);
		let i;
		var o = R(r);
		Oa(o, {
			get name() {
				return t.source.icon;
			},
			size: 14
		});
		var s = B(o), l = z(s), d = z(B(s), !0);
		j(r);
		var f = B(r, 2), p = (e) => {
			var n = Ka(), r = on(n), i = z(r, !0), a = B(r, 2), o = (e) => {
				var t = Fr();
				Z(on(t), 17, () => G(ne), (e) => e.path, (e, t) => {
					var n = Wa();
					let r;
					var i = R(n), a = (e) => {
						var n = Ha(), r = R(n);
						{
							let e = /* @__PURE__ */ P(() => G(te).has(G(t).path) ? "chevron-down" : "chevron");
							Oa(r, {
								get name() {
									return G(e);
								},
								size: 12
							});
						}
						j(n), V((e, t) => {
							$(n, "aria-label", e), $(n, "aria-expanded", t);
						}, [() => G(te).has(G(t).path) ? `Close ${G(t).name}` : `Open ${G(t).name}`, () => G(te).has(G(t).path)]), K("click", n, () => re(G(t).path)), J(e, n);
					}, o = (e) => {
						J(e, Ua());
					};
					X(i, (e) => {
						G(t).kids ? e(a) : e(o, -1);
					});
					var s = B(i, 2);
					let l;
					var u = R(s);
					{
						let e = /* @__PURE__ */ P(() => G(te).has(G(t).path) && G(t).kids ? "folder-open" : "folder");
						Oa(u, {
							get name() {
								return G(e);
							},
							size: 14
						});
					}
					var d = B(u), f = z(d, !0), p = z(B(d), !0);
					j(s), j(n), V((e) => {
						r = gi(n, "", r, { "padding-left": `${G(t).depth * 12}px` }), l = Q(s, 1, "item svelte-7gk24t", null, l, { on: e }), $(s, "title", G(t).path), Y(f, G(t).name), Y(p, G(t).count);
					}, [() => oe("group", G(t).path)]), K("click", s, () => L(c, {
						kind: "group",
						name: G(t).path
					}, !0)), K("dblclick", s, () => G(t).kids && re(G(t).path)), J(e, n);
				}), J(e, t);
			}, s = (e) => {
				var t = Fr();
				Z(on(t), 17, () => G(y), ([e, t]) => e, (e, t) => {
					var n = /* @__PURE__ */ P(() => m(G(t), 2));
					let r = () => G(n)[0], i = () => G(n)[1];
					var a = Ga(), o = () => L(c, {
						kind: "group",
						name: r()
					}, !0);
					Pi(a, (e, t) => ({
						class: "item",
						onclick: o,
						title: r(),
						...e,
						[wi]: {
							on: t,
							drop: G(xe) === r()
						}
					}), [() => D(r()), () => oe("group", r())], void 0, void 0, "svelte-7gk24t");
					var s = R(a);
					Oa(s, {
						name: "folder",
						size: 14
					});
					var l = B(s), u = z(l, !0), d = z(B(l), !0);
					j(a), V(() => {
						Y(u, r()), Y(d, i());
					}), J(e, a);
				}), J(e, t);
			};
			X(a, (e) => {
				G(ee) ? e(o) : e(s, -1);
			}), V(() => Y(i, t.source.groupsTitle ?? "Groups")), J(e, n);
		};
		X(f, (e) => {
			G(y).length && e(p);
		});
		var h = B(f, 2), g = (e) => {
			var t = Ja(), n = on(t), r = R(n);
			{
				let e = /* @__PURE__ */ P(() => G(u) ? "chevron-down" : "chevron");
				Oa(r, {
					get name() {
						return G(e);
					},
					size: 12
				});
			}
			var i = z(B(r, 2), !0);
			j(n);
			var a = B(n, 2), o = (e) => {
				var t = Fr();
				Z(on(t), 17, () => G(ie), ([e, t]) => e, (e, t) => {
					var n = /* @__PURE__ */ P(() => m(G(t), 2));
					let r = () => G(n)[0], i = () => G(n)[1];
					var a = Fr(), o = on(a), s = (e) => {
						var t = qa();
						let n;
						var a = B(R(t)), o = z(a, !0), s = z(B(a), !0);
						j(t), V((e) => {
							n = Q(t, 1, "item tagitem svelte-7gk24t", null, n, { on: e }), $(t, "title", r()), Y(o, r()), Y(s, i());
						}, [() => oe("tag", r())]), K("click", t, () => L(c, {
							kind: "tag",
							name: r()
						}, !0)), J(e, t);
					}, l = /* @__PURE__ */ P(() => G(u) || oe("tag", r()));
					X(o, (e) => {
						G(l) && e(s);
					}), J(e, a);
				}), J(e, t);
			};
			X(a, (e) => {
				(G(u) || G(c).kind === "tag") && e(o);
			}), V(() => {
				$(n, "aria-expanded", G(u)), Y(i, G(ie).length);
			}), K("click", n, () => L(u, !G(u))), J(e, t);
		};
		X(h, (e) => {
			G(ie).length && e(g);
		}), j(n), V((e) => {
			$(n, "aria-label", t.source.groupsTitle ?? "Groups"), i = Q(r, 1, "item svelte-7gk24t", null, i, { on: e }), Y(l, `All ${t.source.noun ?? ""}`), Y(d, G(a).length);
		}, [() => oe("all")]), K("click", r, () => L(c, { kind: "all" }, !0)), J(e, n);
	};
	X(nt, (e) => {
		(G(y).length || G(ie).length) && e(rt);
	});
	var it = B(nt, 2);
	let at;
	Z(it, 21, () => G(S), (e) => e.id, (e, n) => {
		var r = Fr(), a = on(r), o = (e) => {
			var r = Za();
			let a;
			var o = R(r);
			Na(o, {
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
			var s = B(o, 2);
			ri(s, () => i(G(n).title), !0), j(s);
			var c = B(s, 2), l = (e) => {
				var t = Xa(), r = z(t, !0);
				V(() => Y(r, G(n).sub)), J(e, t);
			};
			X(c, (e) => {
				G(n).sub && e(l);
			}), j(r), V((e) => {
				a = Q(r, 1, "card svelte-7gk24t", null, a, { sel: e }), $(r, "data-pick", G(n).id), $(r, "draggable", t.source.regroup ? "true" : void 0), $(r, "title", G(n).sub);
			}, [() => Te(G(n))]), Er("dragstart", r, (e) => Se(e, G(n))), K("click", r, (e) => Ee(e, G(n))), K("dblclick", r, () => t.source.open?.(G(n))), J(e, r);
		}, s = (e) => {
			var r = eo();
			let a;
			var o = R(r);
			ri(o, () => i(G(n).title), !0), j(o);
			var s = B(o, 2), c = (e) => {
				var t = Xa(), r = z(t, !0);
				V(() => Y(r, G(n).sub)), J(e, t);
			};
			X(s, (e) => {
				G(n).sub && e(c);
			});
			var l = B(s, 2), u = (e) => {
				var t = $a();
				Z(t, 21, () => G(n).flags, (e) => e.label, (e, t) => {
					var n = Qa();
					let r;
					var i = z(n, !0);
					V(() => {
						r = Q(n, 1, "flag svelte-7gk24t", null, r, { red: G(t).tone === "red" }), Y(i, G(t).label);
					}), J(e, n);
				}), j(t), J(e, t);
			};
			X(l, (e) => {
				G(n).flags?.length && e(u);
			}), j(r), V((e) => {
				a = Q(r, 1, "row svelte-7gk24t", null, a, { sel: e }), $(r, "data-pick", G(n).id), $(r, "draggable", t.source.regroup ? "true" : void 0);
			}, [() => Te(G(n))]), Er("dragstart", r, (e) => Se(e, G(n))), K("click", r, (e) => Ee(e, G(n))), K("dblclick", r, () => t.source.open?.(G(n))), J(e, r);
		};
		X(a, (e) => {
			G(h) === "covers" ? e(o) : e(s, -1);
		}), J(e, r);
	}, (e) => {
		var n = to(), r = z(n, !0);
		V(() => Y(r, G(a).length ? "Nothing matches." : t.source.empty)), J(e, n);
	}), j(it), Wi(it, (e) => _ = e, () => _), ai(it, (e, t) => pa?.(e, t), () => ({ pick: Oe }));
	var ot = B(it, 2), st = (e) => {
		var r = io(), a = R(r), o = z(a), s = B(a, 2), c = R(s);
		Z(c, 17, () => G(Ce).slice(0, 12), (e) => e.id, (e, t) => {
			var n = no();
			ri(n, () => i(G(t).title), !0), j(n), J(e, n);
		});
		var l = B(c), u = (e) => {
			var t = ro(), n = z(t);
			V(() => Y(n, `and ${G(Ce).length - 12} more`)), J(e, t);
		};
		X(l, (e) => {
			G(Ce).length > 12 && e(u);
		}), j(s);
		var d = B(s, 2), f = R(d);
		Z(f, 17, () => G(ke), (e) => e.label, (e, t) => {
			n(e, () => G(t));
		});
		var p = B(f);
		j(d), j(r), V(() => Y(o, `${G(Ce).length ?? ""} ${t.source.noun ?? ""} picked`)), K("click", p, () => L(O, G(C) ? [G(C).id] : [], !0)), J(e, r);
	}, ct = (e) => {
		var r = Eo(), a = on(r), o = (e) => {
			var t = ao();
			K("click", t, () => L(f, null)), J(e, t);
		};
		X(a, (e) => {
			G(ue) && e(o);
		});
		var s = B(a, 2), l = R(s), u = (e) => {
			var t = oo();
			Oa(R(t), {
				name: "close",
				size: 16
			}), j(t), K("click", t, () => L(f, null)), J(e, t);
		};
		X(l, (e) => {
			G(ue) && e(u);
		});
		var d = B(l, 2), p = (e) => {
			var t = fo(), n = R(t);
			Z(n, 17, () => G(T).def.fields, (e) => e.key, (e, t) => {
				var n = uo();
				let r;
				var i = R(n, !0), a = B(i), o = (e) => {
					var n = so(), r = z(n, !0);
					V(() => Y(r, G(t).hint)), J(e, n);
				};
				X(a, (e) => {
					G(t).hint && e(o);
				});
				var s = B(a, 2), c = (e) => {
					var n = co();
					tt(n), V(() => $(n, "rows", G(t).rows)), Ri(n, () => G(T).values[G(t).key], (e) => G(T).values[G(t).key] = e), J(e, n);
				}, l = (e) => {
					var n = lo();
					Mi(n), Ri(n, () => G(T).values[G(t).key], (e) => G(T).values[G(t).key] = e), J(e, n);
				};
				X(s, (e) => {
					G(t).rows ? e(c) : e(l, -1);
				}), j(n), V(() => {
					r = Q(n, 1, "svelte-7gk24t", null, r, { half: G(t).half }), Y(i, G(t).label);
				}), J(e, n);
			});
			var r = B(n, 2), i = B(R(r));
			j(r), j(t), Er("submit", t, (e) => {
				e.preventDefault(), me();
			}), K("keydown", t, (e) => {
				e.key === "Escape" && (e.stopPropagation(), L(T, null));
			}), K("click", i, () => L(T, null)), J(e, t);
		};
		X(d, (e) => {
			G(T) && e(p);
		});
		var g = B(d, 2), _ = (e) => {
			Na(e, {
				get atlas() {
					return t.atlas;
				},
				get cover() {
					return G(C).cover;
				},
				get title() {
					return G(C).title;
				},
				big: !0
			});
		};
		X(g, (e) => {
			G(h) === "covers" && e(_);
		});
		var v = B(g, 2), y = (e) => {
			var t = po(), n = z(t, !0);
			V(() => Y(n, G(w).kind)), J(e, t);
		};
		X(v, (e) => {
			G(w).kind && e(y);
		});
		var ee = B(v, 2);
		ri(ee, () => i(G(w).title), !0), j(ee);
		var b = B(ee, 2);
		Z(b, 17, () => G(w).lines ?? [], Jr, (e, t) => {
			var n = mo(), r = z(n, !0);
			V(() => {
				Q(n, 1, li(G(t).muted ? "venue" : "authors"), "svelte-7gk24t"), Y(r, G(t).text);
			}), J(e, n);
		});
		var x = B(b, 2), te = (e) => {
			var t = go();
			Z(t, 21, () => G(w).fields, ([e, t]) => e, (e, t) => {
				var n = /* @__PURE__ */ P(() => m(G(t), 2));
				let r = () => G(n)[0], i = () => G(n)[1];
				var a = ho(), o = on(a), s = z(o, !0), c = z(B(o), !0);
				V(() => {
					Y(s, r()), Y(c, i());
				}), J(e, a);
			}), j(t), J(e, t);
		};
		X(x, (e) => {
			G(w).fields?.length && e(te);
		});
		var ne = B(x, 2);
		Z(ne, 21, () => G(w).actions, (e) => e.label, (e, t) => {
			n(e, () => G(t));
		}), j(ne);
		var re = B(ne, 2), ie = (e) => {
			var t = _o(), n = R(t), r = z(n, !0);
			Z(B(n, 2), 17, () => G(w).choice.options, (e) => e.label, (e, t) => {
				var n = Ia();
				let r;
				var i = z(n, !0);
				V(() => {
					r = Q(n, 1, "chip svelte-7gk24t", null, r, { on: G(t).on }), $(n, "aria-checked", G(t).on), Y(i, G(t).label);
				}), K("click", n, () => void pe(G(t).run)), J(e, n);
			}), j(t), V(() => {
				$(t, "aria-label", G(w).choice.label), Y(r, G(w).choice.label);
			}), J(e, t);
		};
		X(re, (e) => {
			G(w).choice && e(ie);
		});
		var ae = B(re, 2), oe = (e) => {
			var t = yo();
			Z(t, 21, () => G(w).links, (e) => e.url, (e, t) => {
				var n = vo(), r = R(n);
				Oa(r, {
					name: "link",
					size: 13
				});
				var i = B(r);
				j(n), V(() => {
					$(n, "href", G(t).url), Y(i, ` ${G(t).label ?? ""}`);
				}), J(e, n);
			}), j(t), J(e, t);
		};
		X(ae, (e) => {
			G(w).links?.length && e(oe);
		});
		var se = B(ae, 2), ce = (e) => {
			var t = So(), n = R(t);
			Z(n, 16, () => G(C).groups ?? [], (e) => e, (e, t) => {
				var n = bo(), r = R(n);
				Oa(r, {
					name: "folder",
					size: 12
				});
				var i = B(r, 1, !0);
				j(n), V(() => Y(i, t)), K("click", n, () => L(c, {
					kind: "group",
					name: t
				}, !0)), J(e, n);
			}), Z(B(n, 2), 16, () => G(C).tags ?? [], (e) => e, (e, t) => {
				var n = xo(), r = z(n);
				V(() => Y(r, `#${t ?? ""}`)), K("click", n, () => L(c, {
					kind: "tag",
					name: t
				}, !0)), J(e, n);
			}), j(t), J(e, t);
		};
		X(se, (e) => {
			(G(C).groups?.length || G(C).tags?.length) && e(ce);
		});
		var S = B(se, 2), le = (e) => {
			var t = Co(), n = on(t), r = z(n, !0), i = z(B(n), !0);
			V(() => {
				Y(r, G(w).body.title), Y(i, G(w).body.text);
			}), J(e, t);
		};
		X(S, (e) => {
			G(w).body && e(le);
		});
		var de = B(S, 2), fe = (e) => {
			var t = To();
			qr(R(t), () => G(C).note, (e) => {
				var t = wo();
				ai(t, (e, t) => Me?.(e, t), () => G(C).note), J(e, t);
			}), j(t), J(e, t);
		};
		X(de, (e) => {
			G(C).note && e(fe);
		}), j(s), J(e, r);
	}, lt = (e) => {
		var n = Do(), r = R(n), i = R(r);
		we(), j(r), j(n), V(() => Y(i, `Pick one of the ${t.source.noun ?? ""} to see it here.`)), J(e, n);
	};
	X(ot, (e) => {
		G(Ce).length > 1 ? e(st) : G(de) && G(w) ? e(ct, 1) : !G(ue) && G(a).length && e(lt, 2);
	}), j($e), j(Ne), V(() => {
		Pe = Q(Ne, 1, "library svelte-7gk24t", null, Pe, {
			dragging: G(ve),
			narrow: G(ue)
		}), $(Ne, "aria-label", t.source.title), $(Ne, "data-source", t.source.id), Y(Be, ` ${t.source.title ?? ""} `), Y(Ve, G(ce).length === G(a).length ? G(a).length : `${G(ce).length} / ${G(a).length}`), $(M, "placeholder", t.source.search), et = Q($e, 1, "body svelte-7gk24t", null, et, { bare: !G(y).length && !G(ie).length }), at = Q(it, 1, "list svelte-7gk24t", null, at, {
			covers: G(h) === "covers",
			"empty-list": !G(a).length
		});
	}), K("keydown", Ne, je), Er("dragover", Ne, (e) => {
		t.source.drop && e.dataTransfer?.types.includes("Files") && (e.preventDefault(), L(ve, !0));
	}), Er("dragleave", Ne, (e) => {
		e.currentTarget === e.target && L(ve, !1);
	}), Er("drop", Ne, ye), Ri(M, () => G(s), (e) => L(s, e)), Hi(Ne, "clientWidth", (e) => L(le, e)), J(e, Ne), We();
}
Dr([
	"click",
	"keydown",
	"dblclick"
]);
//#endregion
//#region plugins/beta/catalog/ui/src/Libraries.svelte
var jo = /* @__PURE__ */ q("<button role=\"tab\"><!> </button>"), Mo = /* @__PURE__ */ q("<div class=\"which svelte-1hozhyt\" role=\"tablist\" aria-label=\"Libraries\"></div>"), No = /* @__PURE__ */ q("<p class=\"none svelte-1hozhyt\">No library in this vault: Atlas and its plugins give them (Drawings is Atlas's own; Settings → Appearance → Libraries chooses which show).</p>"), Po = /* @__PURE__ */ q("<p class=\"none svelte-1hozhyt\"> </p>"), Fo = /* @__PURE__ */ q("<div class=\"libraries svelte-1hozhyt\"><!> <!></div>"), Io = {
	hash: "svelte-1hozhyt",
	code: ".libraries.svelte-1hozhyt {display:flex;flex-direction:column;height:100%;min-height:0;}.which.svelte-1hozhyt {display:flex;gap:4px;padding:6px 10px 0;overflow-x:auto;flex:none;border-bottom:1px solid var(--border);}.which.svelte-1hozhyt button:where(.svelte-1hozhyt) {display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:none;background:none;color:var(--text-muted);border-bottom:2px solid transparent;white-space:nowrap;font:inherit;cursor:pointer;}.which.svelte-1hozhyt button:where(.svelte-1hozhyt):hover {color:var(--text);}.which.svelte-1hozhyt button.on:where(.svelte-1hozhyt) {color:var(--text);border-bottom-color:var(--accent);}.libraries.svelte-1hozhyt > :last-child {flex:1;min-height:0;}.none.svelte-1hozhyt {padding:24px;color:var(--text-muted);}"
};
function Lo(e, t) {
	Ue(t, !0), ii(e, Io);
	let n = "atlas.libraries.last", r = /* @__PURE__ */ I(dr(() => t.atlas.libraries.list())), i = /* @__PURE__ */ P(() => ca(G(r))), a = /* @__PURE__ */ I(Jt(dr(() => t.atlas.anchor) || Yi(n, "")));
	Ji(() => {
		let e = t.atlas.libraries.onChange((e) => L(r, e)), n = t.atlas.pane?.onAnchor((e) => L(a, e, !0));
		return () => {
			e(), n?.();
		};
	});
	let o = /* @__PURE__ */ P(() => G(i).find((e) => e.id === G(a) || e.members?.includes(G(a))) ?? G(i)[0]), s = /* @__PURE__ */ I(null), c = /* @__PURE__ */ I("");
	vn(() => {
		let e = G(o);
		if (L(s, null), L(c, ""), !e) return;
		Xi(n, e.id);
		let t = !0;
		return Promise.resolve(e.source()).then((e) => {
			t && L(s, e, !0);
		}, (n) => {
			t && L(c, `${e.title}: ${Zi(n)}`);
		}), () => {
			t = !1;
		};
	});
	var l = Fo(), u = R(l), d = (e) => {
		var t = Mo();
		Z(t, 21, () => G(i), (e) => e.id, (e, t) => {
			var n = jo();
			let r;
			var i = R(n);
			Oa(i, {
				get name() {
					return G(t).icon;
				},
				size: 14
			});
			var s = B(i, 1, !0);
			j(n), V(() => {
				$(n, "aria-selected", G(t) === G(o)), r = Q(n, 1, "svelte-1hozhyt", null, r, { on: G(t) === G(o) }), Y(s, G(t).title);
			}), K("click", n, () => L(a, G(t).id, !0)), J(e, n);
		}), j(t), J(e, t);
	};
	X(u, (e) => {
		G(i).length > 1 && e(d);
	});
	var f = B(u, 2), p = (e) => {
		J(e, No());
	}, m = (e) => {
		var t = Po(), n = z(t, !0);
		V(() => Y(n, G(c))), J(e, t);
	}, h = (e) => {
		var n = Fr();
		qr(on(n), () => G(s), (e) => {
			Ao(e, {
				get atlas() {
					return t.atlas;
				},
				get source() {
					return G(s);
				}
			});
		}), J(e, n);
	};
	X(f, (e) => {
		G(o) ? G(c) ? e(m, 1) : G(s) && e(h, 2) : e(p);
	}), j(l), J(e, l), We();
}
Dr(["click"]);
//#endregion
//#region plugins/beta/catalog/ui/src/view.ts
function Ro(e, t) {
	e.style.height = "100%";
	let n = Br(Lo, {
		target: e,
		props: { atlas: t }
	});
	return () => void Wr(n);
}
function zo(e, t, n) {
	e.style.height = "100%";
	let r = Br(Ao, {
		target: e,
		props: {
			atlas: n,
			source: t
		}
	});
	return () => void Wr(r);
}
//#endregion
export { Ro as default, zo as mountLibrary };
