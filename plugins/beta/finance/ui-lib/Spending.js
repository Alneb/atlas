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
}(), he = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml"), ge = {}, w = Symbol("uninitialized"), _e = "http://www.w3.org/1999/xhtml";
function ve() {
	console.warn("https://svelte.dev/e/derived_inert");
}
function ye(e) {
	console.warn("https://svelte.dev/e/hydration_mismatch");
}
function be() {
	console.warn("https://svelte.dev/e/select_multiple_invalid_value");
}
function xe() {
	console.warn("https://svelte.dev/e/svelte_boundary_reset_noop");
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/hydration.js
var T = !1;
function Se(e) {
	T = e;
}
var E;
function D(e) {
	if (e === null) throw ye(), ge;
	return E = e;
}
function Ce() {
	return D(/* @__PURE__ */ en(E));
}
function O(e) {
	if (T) {
		if (/* @__PURE__ */ en(E) !== null) throw ye(), ge;
		E = e;
	}
}
function we(e = 1) {
	if (T) {
		for (var t = e, n = E; t--;) n = /* @__PURE__ */ en(n);
		E = n;
	}
}
function Te(e = !0) {
	for (var t = 0, n = E;;) {
		if (n.nodeType === 8) {
			var r = n.data;
			if (r === "]") {
				if (t === 0) return n;
				--t;
			} else (r === "[" || r === "[!" || r[0] === "[" && !isNaN(Number(r.slice(1)))) && (t += 1);
		}
		var i = /* @__PURE__ */ en(n);
		e && n.remove(), n = i;
	}
}
function Ee(e) {
	if (!e || e.nodeType !== 8) throw ye(), ge;
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/errors.js
function Ae() {
	throw Error("https://svelte.dev/e/async_derived_orphan");
}
function je(e, t, n) {
	throw Error("https://svelte.dev/e/each_key_duplicate");
}
function Me(e) {
	throw Error("https://svelte.dev/e/effect_in_teardown");
}
function Ne() {
	throw Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function Pe(e) {
	throw Error("https://svelte.dev/e/effect_orphan");
}
function Fe() {
	throw Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function Ie(e) {
	throw Error("https://svelte.dev/e/props_invalid_value");
}
function Le() {
	throw Error("https://svelte.dev/e/state_descriptors_fixed");
}
function Re() {
	throw Error("https://svelte.dev/e/state_prototype_fixed");
}
function ze() {
	throw Error("https://svelte.dev/e/state_unsafe_mutation");
}
function Be() {
	throw Error("https://svelte.dev/e/svelte_boundary_reset_onerror");
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/context.js
var k = null;
function Ve(e) {
	k = e;
}
function He(e, t = !1, n) {
	k = {
		p: k,
		i: !1,
		c: null,
		e: null,
		s: e,
		x: null,
		r: G,
		l: null
	};
}
function Ue(e) {
	var t = k, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) hn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, k = t.p, We(e);
}
function We(e = {}) {
	return i(e, oe, { value: !0 }), e;
}
function Ge() {
	return !0;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/task.js
var Ke = [];
function qe() {
	var e = Ke;
	Ke = [], f(e);
}
function Je(e) {
	if (Ke.length === 0 && !yt) {
		var t = Ke;
		queueMicrotask(() => {
			t === Ke && qe();
		});
	}
	Ke.push(e);
}
function Ye() {
	for (; Ke.length > 0;) qe();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/status.js
var Xe = ~(g | _ | h);
function A(e, t) {
	e.f = e.f & Xe | t;
}
function Ze(e) {
	e.f & 512 || e.deps === null ? A(e, h) : A(e, _);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/utils.js
function Qe(e, t, n) {
	e.f & 2048 ? t.add(e) : e.f & 4096 && n.add(e), A(e, h);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/misc.js
var $e = !1;
function et() {
	$e || ($e = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[pe]?.();
		});
	}, { capture: !0 }));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function tt(e) {
	var t = H, n = G;
	W(null), Fn(null);
	try {
		return e();
	} finally {
		W(t), Fn(n);
	}
}
function nt(e, t, n, r = n) {
	e.addEventListener(t, () => tt(n));
	let i = e[pe];
	e[pe] = i ? () => {
		i(), r(!0);
	} : () => r(!0), et();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/async.js
function rt(e, t, n, r) {
	let i = Ge() ? st : ut;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = G, c = it(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
	function u(e) {
		if (!(s.f & 16384)) {
			c();
			try {
				r([...o, ...e]);
			} catch (e) {
				cn(e, s);
			}
			at();
		}
	}
	var d = ot();
	if (n.length === 0) {
		l.then(() => u([])).finally(d);
		return;
	}
	function f() {
		Promise.all(n.map((e) => /* @__PURE__ */ lt(e))).then(u).catch((e) => cn(e, s)).finally(d);
	}
	l ? l.then(() => {
		c(), f(), at();
	}) : f();
}
function it() {
	var e = G, t = H, n = k, r = M;
	return function(i = !0) {
		Fn(e), W(t), Ve(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function at(e = !0) {
	Fn(null), W(null), Ve(null), e && M?.deactivate();
}
function ot() {
	var e = G, t = e.b, n = M, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function st(e) {
	var t = 2 | g;
	return G !== null && (G.f |= C), {
		ctx: k,
		deps: null,
		effects: null,
		equals: De,
		f: t,
		fn: e,
		reactions: null,
		rv: 0,
		v: w,
		wv: 0,
		parent: G,
		ac: null
	};
}
var ct = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function lt(e, t, n) {
	let r = G;
	r === null && Ae();
	var i = void 0, a = It(w), o = !H, s = /* @__PURE__ */ new Set();
	return vn(() => {
		var t = G, n = p();
		i = n.promise;
		try {
			Promise.resolve(e()).then(n.resolve, (e) => {
				e !== me && n.reject(e);
			}).finally(at);
		} catch (e) {
			n.reject(e), at();
		}
		var c = M;
		if (o) {
			if (t.f & 32768) var l = ot();
			if (r.b?.is_rendered()) c.async_deriveds.get(t)?.reject(ct);
			else for (let e of s.values()) e.reject(ct);
			s.add(n), c.async_deriveds.set(t, n);
		}
		let u = (e, t = void 0) => {
			l?.(), s.delete(n), t !== ct && (c.activate(), t ? (a.f |= ie, Ht(a, t)) : (a.f & 8388608 && (a.f ^= ie), Ht(a, e)), c.deactivate());
		};
		n.promise.then(u, (e) => u(null, e || "unknown"));
	}), pn(() => {
		for (let e of s) e.reject(ct);
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
function j(e) {
	let t = /* @__PURE__ */ st(e);
	return Ln(t), t;
}
/*#__NO_SIDE_EFFECTS__*/
function ut(e) {
	let t = /* @__PURE__ */ st(e);
	return t.equals = ke, t;
}
function dt(e) {
	var t = e.effects;
	if (t !== null) {
		e.effects = null;
		for (var n = 0; n < t.length; n += 1) V(t[n]);
	}
}
function ft(e) {
	var t, n = G, r = e.parent;
	if (!Nn && r !== null && e.v !== w && r.f & 24576) return ve(), e.v;
	Fn(r);
	try {
		dt(e), t = Kn(e);
	} finally {
		Fn(n);
	}
	return t;
}
function pt(e) {
	var t = ft(e);
	if (!e.equals(t) && (e.wv = Un(), (!M?.is_fork || e.deps === null) && (M === null ? e.v = t : (M.capture(e, t, !0), _t?.capture(e, t, !0)), e.deps === null))) {
		A(e, h);
		return;
	}
	Nn || (N === null ? Ze(e) : (fn() || M?.is_fork) && N.set(e, t));
}
function mt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && tt(() => {
		t.ac.abort(me), t.ac = null;
	}), t.fn !== null && (t.teardown = d), Yn(t, 0), Sn(t));
}
function ht(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && Xn(t);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/batch.js
var gt = null, M = null, _t = null, N = null, vt = null, yt = !1, bt = !1, xt = null, St = null, Ct = 0, wt = 1, Tt = class e {
	id = wt++;
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
		gt === null ? gt = this : (gt.#n = this, this.#t = gt), gt = this;
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
		for (var t = xt = [], n = [], r = St = []; this.#c.length > 0;) {
			Ct++ > 1e3 && (this.#S(), Dt());
			for (let e of this.#g()) try {
				this.#v(e, t, n);
			} catch (t) {
				throw Mt(e), this.#h() || this.discard(), t;
			}
		}
		if (M = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (xt = null, St = null, this.#h()) {
			this.#x(n), this.#x(t);
			for (let [e, t] of this.#f) jt(e, t);
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
		this.#r.clear(), _t = this, kt(n), kt(t), _t = null, this.#s?.resolve();
		var o = M;
		if (this.#a === 0 && (this.#c.length === 0 || o !== null) && this.#S(), this.#c.length > 0) {
			if (o !== null) {
				for (let e of this.#c) o.#c.push(e);
				this.#c = [];
			} else o = this;
		}
		o !== null && (Pt.clear(), o.#_());
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
					r & 4194320 && !this.async_deriveds.has(i) && (this.#d.delete(i), A(i, g), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#S(), M = this, this.#_();
	}
	#x(e) {
		for (var t = 0; t < e.length; t += 1) Qe(e[t], this.#u, this.#d);
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
			bt = !0, M = this, this.#_();
		} finally {
			Ct = 0, vt = null, xt = null, St = null, bt = !1, M = null, N = null, Pt.clear();
		}
	}
	discard() {
		for (let e of this.#i) e(this);
		this.#i.clear();
		for (let e of this.async_deriveds.values()) e.reject(ct);
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
		this.#m || (this.#m = !0, Je(() => {
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
			!bt && !yt && Je(() => {
				t.#e || t.flush();
			});
		}
		return M;
	}
	apply() {
		N = null;
	}
	schedule(e) {
		if (vt = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768)) {
			e.b.defer_effect(e);
			return;
		}
		this.#c.push(e);
	}
	#S() {
		if (this.linked) {
			var e = this.#t, t = this.#n;
			e === null || (e.#n = t), t === null ? gt = e : t.#t = e, this.linked = !1;
		}
	}
};
function Et(e) {
	var t = yt;
	yt = !0;
	try {
		var n;
		for (e && (M !== null && !M.is_fork && M.flush(), n = e());;) {
			if (Ye(), M === null) return n;
			M.flush();
		}
	} finally {
		yt = t;
	}
}
function Dt() {
	try {
		Fe();
	} catch (e) {
		cn(e, vt);
	}
}
var Ot = null;
function kt(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && Wn(r) && (Ot = /* @__PURE__ */ new Set(), Xn(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && Tn(r), Ot?.size > 0)) {
				Pt.clear();
				for (let e of Ot) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) Ot.has(n) && (Ot.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || Xn(n);
					}
				}
				Ot.clear();
			}
		}
		Ot = null;
	}
}
function At(e) {
	M.schedule(e);
}
function jt(e, t) {
	if (!(e.f & 32 && e.f & 1024)) {
		e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), A(e, h);
		for (var n = e.first; n !== null;) jt(n, t), n = n.next;
	}
}
function Mt(e) {
	A(e, h);
	for (var t = e.first; t !== null;) Mt(t), t = t.next;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/sources.js
var Nt = /* @__PURE__ */ new Set(), Pt = /* @__PURE__ */ new Map(), Ft = !1;
function It(e, t) {
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
function Lt(e, t) {
	let n = It(e, t);
	return Ln(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function Rt(e, t = !1, n = !0) {
	let r = It(e);
	return t || (r.equals = ke), r;
}
function zt(e, t, n = !1) {
	return H !== null && (!U || H.f & 131072) && Ge() && H.f & 4325394 && (In === null || !In.has(e)) && ze(), Ht(e, n ? Kt(t) : t, St);
}
var Bt = null, Vt = 0;
function Ht(e, t, n = null) {
	if (!e.equals(t)) {
		Nn ? Pt.set(e, t) : Pt.has(e) || Pt.set(e, e.v);
		var r = Tt.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && ft(t), N === null && Ze(t);
		}
		e.wv = Un(), Bt = null, Vt = 0, Gt(e, g, n), Bt = null, Ge() && G !== null && G.f & 1024 && !(G.f & 96) && (J === null ? Rn([e]) : J.push(e)), !r.is_fork && Nt.size > 0 && !Ft && Ut();
	}
	return t;
}
function Ut() {
	Ft = !1;
	for (let e of Nt) {
		e.f & 1024 && A(e, _);
		let t;
		try {
			t = Wn(e);
		} catch {
			t = !0;
		}
		t && Xn(e);
	}
	Nt.clear();
}
function Wt(e) {
	zt(e, e.v + 1);
}
function Gt(e, t, n) {
	var r = e.reactions;
	if (r !== null) {
		var i = Ge(), a = r.length;
		if (Vt += a, Vt > 1e5 && Bt === null && (Bt = /* @__PURE__ */ new Set()), Bt !== null) {
			if (Bt.has(e)) return;
			Bt.add(e);
		}
		for (var o = 0; o < a; o++) {
			var s = r[o], c = s.f;
			if (i || s !== G) {
				var l = (c & g) === 0;
				if (l && A(s, t), c & 131072) Nt.add(s);
				else if (c & 2) {
					var u = s;
					N?.delete(u), Gt(u, _, n);
				} else if (l) {
					var d = s;
					c & 16 && Ot !== null && Ot.add(d), n === null ? At(d) : n.push(d);
				}
			}
		}
	}
}
function Kt(t) {
	if (typeof t != "object" || !t || ae in t || oe in t) return t;
	let n = l(t);
	if (n !== s && n !== c) return t;
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ Lt(0), u = null, d = Vn, f = (e) => {
		if (Vn === d) return e();
		var t = H, n = Vn;
		W(null), Hn(d);
		var r = e();
		return W(t), Hn(n), r;
	};
	return i && r.set("length", /* @__PURE__ */ Lt(t.length, u)), new Proxy(t, {
		defineProperty(e, t, n) {
			(!("value" in n) || n.configurable === !1 || n.enumerable === !1 || n.writable === !1) && Le();
			var i = r.get(t);
			return i === void 0 ? f(() => {
				var e = /* @__PURE__ */ Lt(n.value, u);
				return r.set(t, e), e;
			}) : zt(i, n.value, !0), !0;
		},
		deleteProperty(e, t) {
			var n = r.get(t);
			if (n === void 0) {
				if (t in e) {
					let e = f(() => /* @__PURE__ */ Lt(w, u));
					r.set(t, e), Wt(o);
				}
			} else zt(n, w), Wt(o);
			return !0;
		},
		get(e, n, i) {
			if (n === ae) return t;
			var o = r.get(n), s = n in e;
			if (o === void 0 && (!s || a(e, n)?.writable) && (o = f(() => /* @__PURE__ */ Lt(Kt(s ? e[n] : w), u)), r.set(n, o)), o !== void 0) {
				var c = Y(o);
				return c === w ? void 0 : c;
			}
			return Reflect.get(e, n, i);
		},
		getOwnPropertyDescriptor(e, t) {
			this.has?.(e, t);
			var n = Reflect.getOwnPropertyDescriptor(e, t), i = r.get(t);
			if (i !== void 0) {
				var a = Y(i);
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
			return (n !== void 0 || G !== null && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ Lt(i ? Kt(e[t]) : w, u)), r.set(t, n)), Y(n) === w) ? !1 : i;
		},
		set(e, t, n, s) {
			var c = r.get(t), l = t in e;
			if (i && t === "length") for (var d = n; d < c.v; d += 1) {
				var p = r.get(d + "");
				p === void 0 ? d in e && (p = f(() => /* @__PURE__ */ Lt(w, u)), r.set(d + "", p)) : zt(p, w);
			}
			if (c === void 0) (!l || a(e, t)?.writable) && (c = f(() => /* @__PURE__ */ Lt(void 0, u)), zt(c, Kt(n)), r.set(t, c));
			else {
				l = c.v !== w;
				var m = f(() => Kt(n));
				zt(c, m);
			}
			var h = Reflect.getOwnPropertyDescriptor(e, t);
			if (h?.set && h.set.call(s, n), !l) {
				if (i && typeof t == "string") {
					var g = r.get("length"), _ = Number(t);
					Number.isInteger(_) && _ >= g.v && zt(g, _ + 1);
				}
				Wt(o);
			}
			return !0;
		},
		ownKeys(e) {
			Y(o);
			var t = Reflect.ownKeys(e).filter((e) => {
				var t = r.get(e);
				return t === void 0 || t.v !== w;
			});
			for (var [n, i] of r) i.v !== w && !(n in e) && t.push(n);
			return t;
		},
		setPrototypeOf() {
			Re();
		}
	});
}
function qt(e) {
	try {
		if (typeof e == "object" && e && ae in e) return e[ae];
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
		Zt = a(t, "firstChild").get, Qt = a(t, "nextSibling").get, u(e) && (e[ue] = void 0, e[le] = null, e[de] = void 0, e.__e = void 0), u(n) && (n[fe] = void 0);
	}
}
function P(e = "") {
	return document.createTextNode(e);
}
/*@__NO_SIDE_EFFECTS__*/
function F(e) {
	return Zt.call(e);
}
/*@__NO_SIDE_EFFECTS__*/
function en(e) {
	return Qt.call(e);
}
function I(e, t) {
	if (!T) return /* @__PURE__ */ F(e);
	var n = /* @__PURE__ */ F(E);
	if (n === null) n = E.appendChild(P());
	else if (t && n.nodeType !== 3) {
		var r = P();
		return n?.before(r), D(r), r;
	}
	return t && on(n), D(n), n;
}
function tn(e, t = !1) {
	if (!T) {
		var n = /* @__PURE__ */ F(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ en(n) : n;
	}
	if (t) {
		if (E?.nodeType !== 3) {
			var r = P();
			return E?.before(r), D(r), r;
		}
		on(E);
	}
	return E;
}
function L(e, t = !1) {
	if (!T) return /* @__PURE__ */ F(e);
	var n = I(e, t);
	return O(e), n;
}
function R(e, t = 1, n = !1) {
	let r = T ? E : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ en(r);
	if (!T) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = P();
			return r === null ? i?.after(a) : r.before(a), D(a), a;
		}
		on(r);
	}
	return D(r), r;
}
function nn(e) {
	e.textContent = "";
}
function rn() {
	return !1;
}
function an(e, t, n) {
	return t == null || t === "http://www.w3.org/1999/xhtml" ? n ? document.createElement(e, { is: n }) : document.createElement(e) : n ? document.createElementNS(t, e, { is: n }) : document.createElementNS(t, e);
}
function on(e) {
	if (e.nodeValue.length < 65536) return;
	let t = e.nextSibling;
	for (; t !== null && t.nodeType === 3;) t.remove(), e.nodeValue += t.nodeValue, t = e.nextSibling;
}
function sn(e) {
	var t = G;
	if (t === null) return H.f |= ie, e;
	if (!(t.f & 32768) && !(t.f & 4)) throw e;
	cn(e, t);
}
function cn(e, t) {
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
function ln(e) {
	G === null && (H === null && Pe(e), Ne()), Nn && Me(e);
}
function un(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function dn(e, t) {
	var n = G;
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
	if (e & 4) xt === null ? Tt.ensure().schedule(r) : xt.push(r);
	else if (t !== null) {
		try {
			Xn(r);
		} catch (e) {
			throw V(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= S));
	}
	if (i !== null && (i.parent = n, n !== null && un(i, n), H !== null && H.f & 2 && !(e & 64))) {
		var a = H;
		(a.effects ??= []).push(i);
	}
	return r;
}
function fn() {
	return H !== null && !U;
}
function pn(e) {
	let t = dn(8, null);
	return A(t, h), t.teardown = e, t;
}
function mn(e) {
	ln("$effect");
	var t = G.f;
	if (!H && t & 32 && k !== null && !k.i) {
		var n = k;
		(n.e ??= []).push(e);
	} else return hn(e);
}
function hn(e) {
	return dn(4 | ee, e);
}
function gn(e) {
	Tt.ensure();
	let t = dn(64 | C, e);
	return (e = {}) => new Promise((n) => {
		e.outro ? En(t, () => {
			V(t), n(void 0);
		}) : (V(t), n(void 0));
	});
}
function _n(e) {
	return dn(4, e);
}
function vn(e) {
	return dn(re | C, e);
}
function yn(e, t = 0) {
	return dn(8 | t, e);
}
function z(e, t = [], n = [], r = []) {
	rt(r, t, n, (t) => {
		dn(8, () => {
			e(...t.map(Y));
		});
	});
}
function bn(e, t = 0) {
	return dn(16 | t, e);
}
function B(e) {
	return dn(32 | C, e);
}
function xn(e) {
	var t = e.teardown;
	if (t !== null) {
		let n = Nn, r = H;
		Pn(!0), W(null);
		try {
			t.call(null);
		} catch (t) {
			cn(t, e.parent);
		} finally {
			Pn(n), W(r);
		}
	}
}
function Sn(e, t = !1) {
	var n = e.first;
	for (e.first = e.last = null; n !== null;) {
		let e = n.ac;
		e !== null && tt(() => {
			e.abort(me);
		});
		var r = n.next;
		n.f & 64 ? n.parent = null : V(n, t), n = r;
	}
}
function Cn(e) {
	for (var t = e.first; t !== null;) {
		var n = t.next;
		t.f & 32 || V(t), t = n;
	}
}
function V(e, t = !0) {
	var n = !1;
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (wn(e.nodes.start, e.nodes.end), n = !0), e.f |= x, Sn(e, t && !n), Yn(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	xn(e), e.f ^= x, e.f |= y;
	var i = e.parent;
	i !== null && i.first !== null && Tn(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function wn(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ en(e);
		e.remove(), e = n;
	}
}
function Tn(e) {
	var t = e.parent, n = e.prev, r = e.next;
	n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n));
}
function En(e, t, n = !0) {
	var r = [];
	e.f |= 256, Dn(e, r, !0);
	var i = () => {
		n && V(e), t && t();
	}, a = r.length;
	if (a > 0) {
		var o = () => --a || i();
		for (var s of r) s.out(o);
	} else i();
}
function Dn(e, t, n) {
	if (!(e.f & 8192)) {
		e.f ^= v;
		var r = e.nodes && e.nodes.t;
		if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
		for (var i = e.first; i !== null;) {
			var a = i.next;
			if (!(i.f & 64)) {
				var o = !!(i.f & 65536) || !!(i.f & 32) && !!(e.f & 16);
				Dn(i, t, o ? n : !1);
			}
			i = a;
		}
	}
}
function On(e) {
	e.f &= -257, kn(e, !0);
}
function kn(e, t) {
	if (!(e.f & 256) && e.f & 8192) {
		e.f ^= v, e.f & 1024 || (A(e, g), Tt.ensure().schedule(e));
		for (var n = e.first; n !== null;) {
			var r = n.next, i = !!(n.f & 65536) || !!(n.f & 32);
			kn(n, i ? t : !1), n = r;
		}
		var a = e.nodes && e.nodes.t;
		if (a !== null) for (let e of a) (e.is_global || t) && e.in();
	}
}
function An(e, t) {
	if (e.nodes) for (var n = e.nodes.start, r = e.nodes.end; n !== null;) {
		var i = n === r ? null : /* @__PURE__ */ en(n);
		t.append(n), n = i;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/legacy.js
var jn = null, Mn = !1, Nn = !1;
function Pn(e) {
	Nn = e;
}
var H = null, U = !1;
function W(e) {
	H = e;
}
var G = null;
function Fn(e) {
	G = e;
}
var In = null;
function Ln(e) {
	H !== null && (H.f & 2097152 || H.f & 2) && (In ??= /* @__PURE__ */ new Set()).add(e);
}
var K = null, q = 0, J = null;
function Rn(e) {
	J = e;
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
			if (Wn(a) && pt(a), a.wv > e.wv) return !0;
		}
		t & 512 && N === null && A(e, h);
	}
	return !1;
}
function Gn(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(In !== null && In.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? Gn(a, t, !1) : t === a && (n ? A(a, g) : a.f & 1024 && A(a, _), At(a));
	}
}
function Kn(e) {
	var t = K, n = q, r = J, i = H, a = In, o = k, s = U, c = Vn, l = e.f;
	K = null, q = 0, J = null, H = l & 96 ? null : e, In = null, Ve(e.ctx), U = !1, Vn = ++Bn, e.ac !== null && (tt(() => {
		e.ac.abort(me);
	}), e.ac = null);
	try {
		e.f |= ne;
		var u = e.fn, d = u();
		e.f |= b;
		var f = qn(e);
		if (Ge() && J !== null && !U && f !== null && !(e.f & 6146)) for (var p = 0; p < J.length; p++) Gn(J[p], e);
		if (i !== null && i !== e) {
			if (Bn++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = Bn;
			if (t !== null) for (let e of t) e.rv = Bn;
			J !== null && (r === null ? r = J : r.push(...J));
		}
		return e.f & 8388608 && (e.f ^= ie), d;
	} catch (t) {
		return qn(e), sn(t);
	} finally {
		e.f ^= ne, K = t, q = n, J = r, H = i, In = a, Ve(o), U = s, Vn = c;
	}
}
function qn(e) {
	var t = e.deps, n = M?.is_fork;
	if (K !== null) {
		var r;
		if (n || Yn(e, q), t !== null && q > 0) for (t.length = q + K.length, r = 0; r < K.length; r++) t[q + r] = K[r];
		else e.deps = t = K;
		if (fn() && e.f & 512) for (r = q; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && q < t.length && (Yn(e, q), t.length = q);
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
	if (i === null && r.f & 2 && (K === null || !n.call(K, r))) {
		var s = r;
		s.f & 512 && (s.f ^= 512), s.v !== w && Ze(s), s.ac !== null && tt(() => {
			s.ac.abort(me), s.ac = null, A(s, g);
		}), mt(s), Yn(s, 0);
	}
}
function Yn(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) Jn(e, n[r]);
}
function Xn(e) {
	var t = e.f;
	if (!(t & 16384)) {
		A(e, h);
		var n = G, r = Mn;
		G = e, Mn = !(t & 96);
		try {
			t & 16777232 ? Cn(e) : Sn(e), xn(e);
			var i = Kn(e);
			e.teardown = typeof i == "function" ? i : null, e.wv = zn;
		} finally {
			Mn = r, G = n;
		}
	}
}
async function Zn() {
	await Promise.resolve(), Et();
}
function Y(e) {
	var t = !!(e.f & 2);
	if (jn?.add(e), H !== null && !U && !(G !== null && G.f & 16384) && (In === null || !In.has(e))) {
		var r = H.deps;
		if (H.f & 2097152) e.rv < Bn && (e.rv = Bn, K === null && r !== null && r[q] === e ? q++ : K === null ? K = [e] : K.push(e));
		else {
			H.deps ??= [], n.call(H.deps, e) || H.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [H] : n.call(i, H) || i.push(H);
		}
	}
	if (Nn && Pt.has(e)) return Pt.get(e);
	if (t) {
		var a = e;
		if (Nn) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || $n(a)) && (o = ft(a)), Pt.set(a, o), o;
		}
		var s = !(a.f & 512) && !U && H !== null && (Mn || !!(H.f & 512)), c = (a.f & b) === 0;
		Wn(a) && (s && (a.f |= 512), pt(a)), s && !c && (ht(a), Qn(a));
	}
	if (N?.has(e)) return N.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function Qn(e) {
	if (e.f |= 512, e.deps !== null) for (let t of e.deps) (t.reactions ??= []).push(e), t.f & 2 && !(t.f & 512) && (ht(t), Qn(t));
}
function $n(e) {
	if (e.v === w) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (Pt.has(t) || t.f & 2 && $n(t)) return !0;
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
function tr(e) {
	if (!(typeof e != "object" || !e || e instanceof EventTarget)) {
		if (ae in e) nr(e);
		else if (!Array.isArray(e)) for (let t in e) {
			let n = e[t];
			typeof n == "object" && n && ae in n && nr(n);
		}
	}
}
function nr(e, t = /* @__PURE__ */ new Set()) {
	if (typeof e == "object" && e && !(e instanceof EventTarget) && !t.has(e)) {
		t.add(e), e instanceof Date && e.getTime();
		for (let n in e) try {
			nr(e[n], t);
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
[.../* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split(".")];
var rr = ["touchstart", "touchmove"];
function ir(e) {
	return rr.includes(e);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dev/css.js
var ar = Symbol("events"), or = /* @__PURE__ */ new Set(), sr = /* @__PURE__ */ new Set();
function cr(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || mr.call(t, e), !e.cancelBubble) return tt(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, Je(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function lr(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = cr(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && pn(() => {
		o.__removed = !0, t.removeEventListener(e, o, a);
	});
}
function ur(e, t, n) {
	(t[ar] ??= {})[e] = n;
}
function dr(e) {
	for (var t = 0; t < e.length; t++) or.add(e[t]);
	for (var n of sr) n(e);
}
var fr = null, pr = !1;
function mr(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	fr = e, pr || (pr = !0, setTimeout(() => {
		pr = !1, fr = null;
	}));
	var s = 0, c = fr === e && e[ar];
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
		W(null), Fn(null);
		try {
			for (var p, m = []; o !== null && o !== t;) {
				try {
					var h = o[ar]?.[r];
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
			e[ar] = t, delete e.currentTarget, W(d), Fn(f);
		}
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/reconciler.js
var hr = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function gr(e) {
	return hr?.createHTML(e) ?? e;
}
function _r(e) {
	var t = an("template");
	return t.innerHTML = gr(e.replaceAll("<!>", "<!---->")), t.content;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/template.js
function X(e, t) {
	var n = G;
	n.nodes === null && (n.nodes = {
		start: e,
		end: t,
		a: null,
		t: null
	});
}
/*#__NO_SIDE_EFFECTS__*/
function Z(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (T) return X(E, null), E;
		i === void 0 && (i = _r(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ F(i)));
		var t = r || Xt ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ F(t), s = t.lastChild;
			X(o, s);
		} else X(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function vr(e, t, n = "svg") {
	var r = !e.startsWith("<!>"), i = !!(t & 1), a = `<${n}>${r ? e : "<!>" + e}</${n}>`, o;
	return () => {
		if (T) return X(E, null), E;
		if (!o) {
			var e = /* @__PURE__ */ F(_r(a));
			if (i) for (o = document.createDocumentFragment(); /* @__PURE__ */ F(e);) o.appendChild(/* @__PURE__ */ F(e));
			else o = /* @__PURE__ */ F(e);
		}
		var t = o.cloneNode(!0);
		if (i) {
			var n = /* @__PURE__ */ F(t), r = t.lastChild;
			X(n, r);
		} else X(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function yr(e, t) {
	return /* @__PURE__ */ vr(e, t, "svg");
}
function br(e = "") {
	if (!T) {
		var t = P(e + "");
		return X(t, t), t;
	}
	var n = E;
	return n.nodeType === 3 ? on(n) : (n.before(n = P()), D(n)), X(n, n), n;
}
function xr() {
	if (T) return X(E, null), E;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = P();
	return e.append(t, n), X(t, n), e;
}
function Q(e, t) {
	if (T) {
		var n = G;
		(!(n.f & 32768) || n.nodes.end === null) && (n.nodes.end = E), Ce();
		return;
	}
	e !== null && e.before(t);
}
//#endregion
//#region ui/node_modules/svelte/src/reactivity/create-subscriber.js
function Sr(e) {
	let t = 0, n = It(0), r;
	return () => {
		fn() && (Y(n), yn(() => (t === 0 && (r = er(() => e(() => Wt(n)))), t += 1, () => {
			Je(() => {
				--t, t === 0 && (r?.(), r = void 0, Wt(n));
			});
		})));
	};
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var Cr = S | C;
function wr(e, t, n, r) {
	new Tr(e, t, n, r);
}
var Tr = class {
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
	#h = Sr(() => (this.#m = It(this.#l), () => {
		this.#m = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = G;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = G.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = bn(() => {
			if (T) {
				let e = this.#t;
				Ce();
				let t = e.data === "[!";
				if (e.data.startsWith("[?")) {
					let t = JSON.parse(e.data.slice(2));
					this.#_(t);
				} else t ? this.#y() : this.#g();
			} else this.#b();
		}, Cr), T && (this.#e = E);
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
		Je(r), t && (this.#s = B(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#v(e) {
		var t = !1, n = !1;
		let r = () => {
			if (t) {
				xe();
				return;
			}
			t = !0, n && Be(), this.#s !== null && En(this.#s, () => {
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
					cn(e, this.#i && this.#i.parent);
				}
			}
		};
	}
	#y() {
		let e = this.#n.pending;
		e && (this.is_pending = !0, this.#o = B(() => e(this.#e)), Je(() => {
			var e = this.#c = document.createDocumentFragment(), t = P(), n = !1;
			if (e.append(t), this.#a = this.#S(() => {
				try {
					return B(() => this.#r(t));
				} catch (e) {
					try {
						this.error(e), n = !0;
					} catch (e) {
						cn(e, this.#i.parent);
					}
					return null;
				}
			}), this.#a === null) {
				this.#c = null, n && this.#x(M);
				return;
			}
			this.#u === 0 && (this.#e.before(e), this.#c = null, En(this.#o, () => {
				this.#o = null;
			}), this.#x(M));
		}));
	}
	#b() {
		try {
			if (this.is_pending = this.has_pending_snippet(), this.#u = 0, this.#l = 0, this.#a = B(() => {
				this.#r(this.#e);
			}), this.#u > 0) {
				var e = this.#c = document.createDocumentFragment();
				An(this.#a, e);
				let t = this.#n.pending;
				this.#o = B(() => t(this.#e));
			} else this.#x(M);
		} catch (e) {
			this.error(e);
		}
	}
	#x(e) {
		this.is_pending = !1, e.transfer_effects(this.#f, this.#p);
	}
	defer_effect(e) {
		Qe(e, this.#f, this.#p);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#n.pending;
	}
	#S(e) {
		var t = G, n = H, r = k;
		Fn(this.#i), W(this.#i), Ve(this.#i.ctx);
		try {
			return Tt.ensure(), e();
		} finally {
			Fn(t), W(n), Ve(r);
		}
	}
	#C(e, t) {
		if (!this.has_pending_snippet()) {
			this.parent && this.parent.#C(e, t);
			return;
		}
		this.#u += e, this.#u === 0 && (this.#x(t), this.#o && En(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null));
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !(!this.#m || this.#d) && (this.#d = !0, Je(() => {
			this.#d = !1, this.#m && Ht(this.#m, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#h(), Y(this.#m);
	}
	error(e) {
		if (!this.#n.onerror && !this.#n.failed) throw e;
		M?.is_fork ? (this.#a && M.skip_effect(this.#a), this.#o && M.skip_effect(this.#o), this.#s && M.skip_effect(this.#s), M.oncommit(() => {
			this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (V(this.#a), null), this.#o &&= (V(this.#o), null), this.#s &&= (V(this.#s), null), T && (D(this.#t), we(), D(Te()));
		let t = this.#n.failed, n = (e) => {
			let { reset: n, invoke_onerror: r } = this.#v(e);
			r(), t && (this.#s = this.#S(() => {
				try {
					return B(() => {
						var r = G;
						r.b = this, r.f |= 128, t(this.#e, () => e, () => n);
					});
				} catch (e) {
					return cn(e, this.#i.parent), null;
				}
			}));
		};
		Je(() => {
			var t;
			try {
				t = this.transform_error(e);
			} catch (e) {
				cn(e, this.#i && this.#i.parent);
				return;
			}
			typeof t == "object" && t && typeof t.then == "function" ? t.then(n, (e) => cn(e, this.#i && this.#i.parent)) : n(t);
		});
	}
};
function $(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[fe] ??= e.nodeValue) && (e[fe] = n, e.nodeValue = `${n}`);
}
function Er(e, t) {
	return Or(e, t);
}
var Dr = /* @__PURE__ */ new Map();
function Or(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	$t();
	var l = void 0, u = gn(() => {
		var s = n ?? t.appendChild(P());
		wr(s, { pending: () => {} }, (t) => {
			He({});
			var n = k;
			if (o && (n.c = o), a && (i.$$events = a), T && X(t, null), l = e(t, i) || We(), T && (G.nodes.end = E, E === null || E.nodeType !== 8 || E.data !== "]")) throw ye(), ge;
			Ue();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = ir(r);
					for (let e of [t, document]) {
						var a = Dr.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), Dr.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, mr, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(or)), sr.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = Dr.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, mr), r.delete(e), r.size === 0 && Dr.delete(n)) : r.set(e, i);
			}
			sr.delete(d), s !== n && s.parentNode?.removeChild(s);
		};
	});
	return kr.set(l, u), l;
}
var kr = /* @__PURE__ */ new WeakMap();
function Ar(e, t) {
	let n = kr.get(e);
	return n ? (kr.delete(e), n(t)) : Promise.resolve();
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/branches.js
var jr = class {
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
			if (n) On(n), this.#r.delete(t);
			else {
				var r = this.#n.get(t);
				r && (On(r.effect), this.#t.set(t, r.effect), this.#n.delete(t), r.fragment.lastChild.remove(), this.anchor.before(r.fragment), n = r.effect);
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
						An(r, t), t.append(P()), this.#n.set(e, {
							effect: r,
							fragment: t
						});
					} else V(r);
					this.#r.delete(e), this.#t.delete(e);
				};
				this.#i || !n ? (this.#r.add(e), En(r, i, !1)) : i();
			}
		}
	};
	#o = (e) => {
		this.#e.delete(e);
		let t = Array.from(this.#e.values());
		for (let [e, n] of this.#n) t.includes(e) || (V(n.effect), this.#n.delete(e));
	};
	ensure(e, t) {
		var n = M, r = rn();
		if (t && !this.#t.has(e) && !this.#n.has(e)) {
			if (r) {
				var i = document.createDocumentFragment(), a = P();
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
		} else T && (this.anchor = E), this.#a(n);
	}
};
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/if.js
function Mr(e, t, n = !1) {
	var r;
	T && (r = E, Ce());
	var i = new jr(e), a = n ? S : 0;
	function o(e, t) {
		if (T) {
			var n = Ee(r);
			if (e !== parseInt(n.substring(1))) {
				var a = Te();
				D(a), i.anchor = a, Se(!1), i.ensure(e, t), Se(!0);
				return;
			}
		}
		i.ensure(e, t);
	}
	bn(() => {
		var e = !1;
		t((t, n = 0) => {
			e = !0, o(n, t);
		}), e || o(-1, null);
	}, a);
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/key.js
var Nr = Symbol("NaN");
function Pr(e, t, n) {
	T && Ce();
	var r = new jr(e), i = !Ge();
	bn(() => {
		var e = t();
		e !== e && (e = Nr), i && typeof e == "object" && e && (e = {}), r.ensure(e, n);
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/blocks/each.js
function Fr(e, t) {
	return t;
}
function Ir(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		En(n, () => {
			if (o) {
				if (o.pending.delete(n), o.done.add(n), o.pending.size === 0) {
					var t = e.outrogroups;
					Lr(e, r(o.done)), t.delete(o), t.size === 0 && (e.outrogroups = null);
				}
			} else --s;
		}, !1);
	}
	if (s === 0) {
		var l = i.length === 0 && n !== null && e.pending.size === 0;
		if (l) {
			var u = n, d = u.parentNode;
			nn(d), d.append(u), e.items.clear();
		}
		Lr(e, t, !l);
	} else o = {
		pending: new Set(t),
		done: /* @__PURE__ */ new Set()
	}, (e.outrogroups ??= /* @__PURE__ */ new Set()).add(o);
}
function Lr(e, t, n = !0) {
	var r;
	if (e.pending.size > 0) {
		r = /* @__PURE__ */ new Set();
		for (let t of e.pending.values()) for (let n of t) r.add(e.items.get(n).e);
	}
	for (var i = 0; i < t.length; i++) {
		var a = t[i];
		r?.has(a) ? (a.f |= te, An(a, document.createDocumentFragment())) : V(t[i], n);
	}
}
var Rr;
function zr(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = T ? D(/* @__PURE__ */ F(u)) : u.appendChild(P());
	}
	T && Ce();
	var d = null, f = /* @__PURE__ */ ut(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p, m = /* @__PURE__ */ new Map(), h = !0;
	function g(e) {
		v.effect.f & 16384 || (v.pending.delete(e), v.fallback = d, Vr(v, p, c, n, a), d !== null && (p.length === 0 ? d.f & 33554432 ? (d.f ^= te, Ur(d, null, c)) : On(d) : En(d, () => {
			d = null;
		})));
	}
	function _(e) {
		v.pending.delete(e);
	}
	var v = {
		effect: bn(() => {
			p = Y(f);
			var e = p.length;
			let t = !1;
			T && Ee(c) === "[!" != (e === 0) && (c = Te(), D(c), Se(!1), t = !0);
			for (var r = /* @__PURE__ */ new Set(), u = M, v = rn(), y = 0; y < e; y += 1) {
				T && E.nodeType === 8 && E.data === "]" && (c = E, t = !0, Se(!1));
				var b = p[y], x = a(b, y), S = h ? null : l.get(x);
				S ? (S.v && Ht(S.v, b), S.i && Ht(S.i, y), v && u.unskip_effect(S.e)) : (S = Hr(l, h ? c : Rr ??= P(), b, x, y, o, n, i), h || (S.e.f |= te), l.set(x, S)), r.add(x);
			}
			if (e === 0 && s && !d && (h ? d = B(() => s(c)) : (d = B(() => s(Rr ??= P())), d.f |= te)), e > r.size && je("", "", ""), T && e > 0 && D(Te()), !h) {
				if (m.set(u, r), v) {
					for (let [e, t] of l) r.has(e) || u.skip_effect(t.e);
					u.oncommit(g), u.ondiscard(_);
				} else g(u);
			}
			t && Se(!0), Y(f);
		}),
		flags: n,
		items: l,
		pending: m,
		outrogroups: null,
		fallback: d
	};
	h = !1, T && (c = E);
}
function Br(e) {
	for (; e !== null && !(e.f & 32);) e = e.next;
	return e;
}
function Vr(e, t, n, i, a) {
	var o = !!(i & 8), s = t.length, c = e.items, l = Br(e.effect.first), u, d = null, f, p = [], m = [], h, g, _, v;
	if (o) for (v = 0; v < s; v += 1) h = t[v], g = a(h, v), _ = c.get(g).e, _.f & 33554432 || (_.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(_));
	for (v = 0; v < s; v += 1) {
		if (h = t[v], g = a(h, v), _ = c.get(g).e, e.outrogroups !== null) for (let t of e.outrogroups) t.pending.delete(_), t.done.delete(_);
		if (_.f & 8192 && (On(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= te, _ === l) Ur(_, null, n);
			else {
				var y = d ? d.next : l;
				_ === e.effect.last && (e.effect.last = _.prev), _.prev && (_.prev.next = _.next), _.next && (_.next.prev = _.prev), Wr(e, d, _), Wr(e, _, y), Ur(_, y, n), d = _, p = [], m = [], l = Br(d.next);
				continue;
			}
		}
		if (_ !== l) {
			if (u !== void 0 && u.has(_)) {
				if (p.length < m.length) {
					var b = m[0], x;
					d = b.prev;
					var S = p[0], C = p[p.length - 1];
					for (x = 0; x < p.length; x += 1) Ur(p[x], b, n);
					for (x = 0; x < m.length; x += 1) u.delete(m[x]);
					Wr(e, S.prev, C.next), Wr(e, d, S), Wr(e, C, b), l = b, d = C, --v, p = [], m = [];
				} else u.delete(_), Ur(_, l, n), Wr(e, _.prev, _.next), Wr(e, _, d === null ? e.effect.first : d.next), Wr(e, d, _), d = _;
				continue;
			}
			for (p = [], m = []; l !== null && l !== _;) (u ??= /* @__PURE__ */ new Set()).add(l), m.push(l), l = Br(l.next);
			if (l === null) continue;
		}
		_.f & 33554432 || p.push(_), d = _, l = Br(_.next);
	}
	if (e.outrogroups !== null) {
		for (let t of e.outrogroups) t.pending.size === 0 && (Lr(e, r(t.done)), e.outrogroups?.delete(t));
		e.outrogroups.size === 0 && (e.outrogroups = null);
	}
	if (l !== null || u !== void 0) {
		var ee = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || ee.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && ee.push(l), l = Br(l.next);
		var ne = ee.length;
		if (ne > 0) {
			var re = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < ne; v += 1) ee[v].nodes?.a?.measure();
				for (v = 0; v < ne; v += 1) ee[v].nodes?.a?.fix();
			}
			Ir(e, ee, re);
		}
	}
	o && Je(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function Hr(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? It(n) : /* @__PURE__ */ Rt(n, !1, !1) : null, l = o & 2 ? It(i) : null;
	return {
		v: c,
		i: l,
		e: B(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function Ur(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ en(r);
		if (a.before(r), r === i) return;
		r = o;
	}
}
function Wr(e, t, n) {
	t === null ? e.effect.first = n : t.next = n, n === null ? e.effect.last = t : n.prev = t;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/css.js
function Gr(e, t) {
	_n(() => {
		e = G?.parent?.nodes?.start ?? e;
		var n = e.getRootNode(), r = n.host ? n : n.head ?? n.ownerDocument.head;
		if (!r.querySelector("#" + t.hash)) {
			let e = an("style");
			e.id = t.hash, e.textContent = t.code, r.appendChild(e);
		}
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/actions.js
function Kr(e, t, n) {
	_n(() => {
		var r = er(() => t(e, n?.()) || {});
		if (n && r?.update) {
			var i = !1, a = {};
			yn(() => {
				var e = n();
				tr(e), i && Oe(a, e) && (a = e, r.update(e));
			}), i = !0;
		}
		if (r?.destroy) return () => r.destroy();
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
	var o = e[ue];
	if (T || o !== n || o === void 0) {
		var s = Jr(n, r, a);
		(!T || s !== e.getAttribute("class")) && (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[ue] = n;
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
	var i = e[de];
	if (T || i !== t) {
		var a = Zr(t, r);
		(!T || a !== e.getAttribute("style")) && (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[de] = t;
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
		if (!e(n)) return be();
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
	}), pn(() => {
		t.disconnect();
	});
}
function ai(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet(), i = !0;
	nt(e, "change", (t) => {
		var i = t ? "[selected]" : ":checked", a;
		if (e.multiple) a = [].map.call(e.querySelectorAll(i), oi);
		else {
			var o = e.querySelector(i) ?? e.querySelector("option:not([disabled])");
			a = o && oi(o);
		}
		n(a), e.__value = a, M !== null && r.add(M);
	}), _n(() => {
		var a = t();
		if (e === document.activeElement) {
			var o = M;
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
var ci = Symbol("is custom element"), li = Symbol("is html"), ui = he ? "link" : "LINK";
function di(e) {
	if (T) {
		var t = !1, n = () => {
			if (!t) {
				if (t = !0, e.hasAttribute("value")) {
					var n = e.value;
					fi(e, "value", null), e.value = n;
				}
				if (e.hasAttribute("checked")) {
					var r = e.checked;
					fi(e, "checked", null), e.checked = r;
				}
			}
		};
		e[pe] = n, Je(n), et();
	}
}
function fi(e, t, n, r) {
	var i = pi(e);
	T && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === ui) || i[t] !== (i[t] = n) && (t === "loading" && (e[ce] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && hi(e).has(t) ? e[t] = n : e.setAttribute(t, n));
}
function pi(e) {
	return e[le] ??= {
		[ci]: e.nodeName.includes("-"),
		[li]: e.namespaceURI === _e
	};
}
var mi = /* @__PURE__ */ new Map();
function hi(e) {
	var t = e.getAttribute("is") || e.nodeName, n = mi.get(t);
	if (n) return n;
	mi.set(t, n = /* @__PURE__ */ new Set());
	for (var r, i = e, a = Element.prototype; a !== i;) {
		for (var s in r = o(i), r) r[s].set && s !== "innerHTML" && s !== "textContent" && s !== "innerText" && n.add(s);
		i = l(i);
	}
	return n;
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function gi(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet();
	nt(e, "input", async (i) => {
		var a = i ? e.defaultValue : e.value;
		if (a = _i(e) ? vi(a) : a, n(a), M !== null && r.add(M), await Zn(), a !== (a = t())) {
			var o = e.selectionStart, s = e.selectionEnd, c = e.value.length;
			if (e.value = a ?? "", s !== null) {
				var l = e.value.length;
				o === s && s === c && l > c ? (e.selectionStart = l, e.selectionEnd = l) : (e.selectionStart = o, e.selectionEnd = Math.min(s, l));
			}
		}
	}), (T && e.defaultValue !== e.value || er(t) == null && e.value) && (n(_i(e) ? vi(e.value) : e.value), M !== null && r.add(M)), yn(() => {
		var n = t();
		if (e === document.activeElement) {
			var i = M;
			if (r.has(i)) return;
		}
		_i(e) && n === vi(e.value) || (e.type !== "date" || n || e.value) && n !== e.value && (e.value = n ?? "");
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
	_n(() => (er(() => n(e[t])), r));
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function xi(e, t) {
	return e === t || e?.[ae] === t;
}
function Si(e = We(), t, n, r) {
	var i = k.r, a = G;
	return _n(() => {
		var o, s;
		return yn(() => {
			o = s, s = r?.() || [], er(() => {
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
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/store.js
var Ci = !1;
function wi(e) {
	var t = Ci;
	try {
		return Ci = !1, [e(), Ci];
	} finally {
		Ci = t;
	}
}
//#endregion
//#region ui/node_modules/svelte/src/internal/client/reactivity/props.js
function Ti(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ st(r), Y(u)) : (l && (l = !1, c = s ? er(r) : r), c);
	let f;
	if (o) {
		var p = ae in e || se in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = wi(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && Ie(t), f(m)));
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
	var v = !1, y = (n & 1 ? st : ut)(() => (v = !1, g()));
	o && Y(y);
	var b = G;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? Y(y) : i && o ? Kt(e) : e;
			return zt(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return Nn && v || b.f & 16384 ? y.v : Y(y);
	});
}
//#endregion
//#region ui/node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
//#endregion
//#region plugins/beta/finance/ui/src/api.ts
async function Ei(e, t, n = {}) {
	try {
		return await e.helper.call(t, {
			...n,
			settings: e.plugin.settings
		}, { timeout: 60 });
	} catch (e) {
		throw Error(String(e?.message ?? e).replace(/^.*?plugin [\w-]+: \w+: /, "").replace(/^.*?(method|error): /i, ""));
	}
}
var Di = (e) => String(e.plugin.settings.currency ?? "EUR"), Oi = (e) => String(e.plugin.settings.folder ?? "finance").replace(/^\/+|\/+$/g, "");
function ki(e, t, n = {}) {
	let r = new Intl.NumberFormat(void 0, {
		style: "currency",
		currency: /^[A-Z]{3}$/.test(t) ? t : "EUR",
		maximumFractionDigits: n.whole ? 0 : 2,
		minimumFractionDigits: n.whole ? 0 : 2,
		signDisplay: n.sign ? "exceptZero" : "auto"
	});
	return /^[A-Z]{3}$/.test(t) ? r.format(e) : `${e.toFixed(2)} ${t}`;
}
var Ai = (e) => e.split(":").slice(1).join(" · ") || e, ji = (e) => Number(e ?? 0) || 0;
function Mi(e, t, n = {}) {
	if (t.money) return ki(e, t.unit, n);
	let r = Math.abs(e) >= 100 ? 1 : Math.abs(e) >= 1 ? 3 : 5;
	return `${n.sign && e > 0 ? "+" : ""}${e.toLocaleString(void 0, { maximumFractionDigits: r })} ${t.unit}`;
}
var Ni = (e) => (/* @__PURE__ */ new Date(`${e}-01T12:00:00`)).toLocaleDateString(void 0, {
	month: "long",
	year: "numeric"
}), Pi = /* @__PURE__ */ Z("<span> </span>"), Fi = /* @__PURE__ */ Z("<span class=\"faint svelte-17ztdi8\">—</span>"), Ii = /* @__PURE__ */ Z("<button class=\"row svelte-17ztdi8\"><span class=\"name svelte-17ztdi8\"> </span> <span class=\"nums svelte-17ztdi8\"></span></button>"), Li = /* @__PURE__ */ Z("<div class=\"atlas-empty\">No accounts yet: an account is a note with <code>type: finance-account</code>.</div>"), Ri = /* @__PURE__ */ Z("<div class=\"balances svelte-17ztdi8\"></div>"), zi = {
	hash: "svelte-17ztdi8",
	code: ".balances.svelte-17ztdi8 {display:grid;gap:2px;}.row.svelte-17ztdi8 {all:unset;display:flex;justify-content:space-between;gap:12px;padding:5px 8px;border-radius:var(--radius-sm);cursor:default;}.row.svelte-17ztdi8:not(:disabled) {cursor:pointer;}.row.svelte-17ztdi8:not(:disabled):hover, .row.svelte-17ztdi8:focus-visible {background:var(--bg-hover);}.name.svelte-17ztdi8 {color:var(--text-muted);}.nums.svelte-17ztdi8 {display:flex;flex-direction:column;align-items:flex-end;font-variant-numeric:tabular-nums;}.neg.svelte-17ztdi8 {color:var(--red);}.faint.svelte-17ztdi8 {color:var(--text-faint);}"
};
function Bi(e, t) {
	He(t, !0), Gr(e, zi);
	let n = /* @__PURE__ */ j(() => t.accounts.filter((e) => !e.closed)), r = (e, n) => n === t.cur || /^[A-Z]{3}$/.test(n) ? ki(Number(e), n) : `${Number(e).toLocaleString(void 0, { maximumFractionDigits: 6 })} ${n}`;
	var i = Ri();
	zr(i, 21, () => Y(n), (e) => e.account, (e, n) => {
		let i = /* @__PURE__ */ j(() => Object.entries(Y(n).balances));
		var a = Ii(), o = I(a), s = L(o, !0), c = R(o, 2);
		zr(c, 21, () => Y(i), ([e, t]) => e, (e, t) => {
			var n = /* @__PURE__ */ j(() => m(Y(t), 2));
			let i = () => Y(n)[0], a = () => Y(n)[1];
			var o = Pi();
			let s;
			var c = L(o, !0);
			z((e, t) => {
				s = Qr(o, 1, "svelte-17ztdi8", null, s, { neg: e }), $(c, t);
			}, [() => Number(a()) < 0, () => r(a(), i())]), Q(e, o);
		}, (e) => {
			Q(e, Fi());
		}), O(c), O(a), z((e) => {
			a.disabled = !t.onpick, fi(a, "title", Y(n).account), $(s, e);
		}, [() => Ai(Y(n).account)]), ur("click", a, () => t.onpick?.(Y(n))), Q(e, a);
	}, (e) => {
		Q(e, Li());
	}), O(i), Q(e, i), Ue();
}
dr(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/Register.svelte
var Vi = /* @__PURE__ */ Z("<span class=\"faint svelte-3ugf0o\"> </span>"), Hi = /* @__PURE__ */ Z("<tr class=\"svelte-3ugf0o\"><td class=\"date svelte-3ugf0o\"> </td><td class=\"payee svelte-3ugf0o\"><span> </span><!><!></td><td> </td><td class=\"num run svelte-3ugf0o\"> </td></tr>"), Ui = /* @__PURE__ */ Z("<tr class=\"svelte-3ugf0o\"><td class=\"atlas-empty svelte-3ugf0o\" colspan=\"4\">No postings.</td></tr>"), Wi = /* @__PURE__ */ Z("<button class=\"atlas-btn more svelte-3ugf0o\"> </button>"), Gi = /* @__PURE__ */ Z("<table class=\"register svelte-3ugf0o\"><tbody></tbody></table> <!>", 1), Ki = {
	hash: "svelte-3ugf0o",
	code: ".register.svelte-3ugf0o {width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;}tr.svelte-3ugf0o {cursor:pointer;}tr.svelte-3ugf0o:hover td:where(.svelte-3ugf0o) {background:var(--bg-hover);}td.svelte-3ugf0o {padding:4px 8px;border-bottom:1px solid var(--border);vertical-align:baseline;}.date.svelte-3ugf0o {color:var(--text-muted);white-space:nowrap;width:1%;}.payee.svelte-3ugf0o {overflow-wrap:anywhere;}.review.svelte-3ugf0o {border-bottom:2px dotted var(--yellow);}.faint.svelte-3ugf0o {color:var(--text-faint);}.num.svelte-3ugf0o {text-align:right;white-space:nowrap;width:1%;}.neg.svelte-3ugf0o {color:var(--red);}.run.svelte-3ugf0o {color:var(--text-muted);}.more.svelte-3ugf0o {margin:8px;}"
};
function qi(e, t) {
	He(t, !0), Gr(e, Ki);
	let n = Ti(t, "limit", 3, 200), r = /* @__PURE__ */ Lt(0), i = /* @__PURE__ */ j(() => Y(r) || n()), a = /* @__PURE__ */ j(() => t.rows.slice().reverse()), o = (e) => Number(e.split(" ")[0]), s = (e) => {
		let [t, n] = e.split(" ");
		return `${Number(t).toLocaleString(void 0, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 6
		})} ${n ?? ""}`;
	};
	var c = Gi(), l = tn(c), u = I(l);
	zr(u, 21, () => Y(a).slice(0, Y(i)), Fr, (e, n) => {
		var r = Hi(), i = I(r), a = L(i, !0), c = R(i), l = I(c);
		let u;
		var d = L(l, !0), f = R(l), p = (e) => {
			var t = Vi(), r = L(t);
			z(() => $(r, `· ${Y(n).narration ?? ""}`)), Q(e, t);
		};
		Mr(f, (e) => {
			Y(n).narration && e(p);
		});
		var m = R(f), h = (e) => {
			var t = Vi(), r = L(t);
			z((e) => $(r, `· ${e ?? ""}`), [() => Ai(Y(n).account)]), Q(e, t);
		};
		Mr(m, (e) => {
			Y(n).account !== t.account && e(h);
		}), O(c);
		var g = R(c);
		let _;
		var v = L(g, !0), y = L(R(g), !0);
		O(r), z((e, t, i) => {
			fi(r, "title", `${Y(n).path ?? ""}:${Y(n).line ?? ""}`), $(a, Y(n).date), u = Qr(l, 1, "svelte-3ugf0o", null, u, { review: Y(n).status === "!" }), $(d, Y(n).payee), _ = Qr(g, 1, "num svelte-3ugf0o", null, _, { neg: e }), $(v, t), $(y, i);
		}, [
			() => o(Y(n).amount) < 0,
			() => s(Y(n).amount),
			() => Number(Y(n).running).toLocaleString(void 0, {
				minimumFractionDigits: 2,
				maximumFractionDigits: 6
			})
		]), ur("click", r, () => t.onopen(Y(n))), Q(e, r);
	}, (e) => {
		Q(e, Ui());
	}), O(u), O(l);
	var d = R(l, 2), f = (e) => {
		var t = Wi(), n = L(t);
		z(() => $(n, `${Y(a).length - Y(i)} older…`)), ur("click", t, () => zt(r, Y(i) + 500)), Q(e, t);
	};
	Mr(d, (e) => {
		Y(a).length > Y(i) && e(f);
	}), Q(e, c), Ue();
}
dr(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/Spending.svelte
var Ji = /* @__PURE__ */ Z("<span class=\"faint svelte-1669bz5\"> </span>"), Yi = /* @__PURE__ */ Z("<span class=\"pin svelte-1669bz5\" title=\"pinned target\">◆</span>"), Xi = /* @__PURE__ */ Z("<span class=\"pace svelte-1669bz5\"></span>"), Zi = /* @__PURE__ */ Z("<button class=\"pinbtn svelte-1669bz5\"> </button>"), Qi = /* @__PURE__ */ Z("<div class=\"row svelte-1669bz5\"><span class=\"name svelte-1669bz5\"> <!></span> <span class=\"bar svelte-1669bz5\"><span></span> <!> <span class=\"tick svelte-1669bz5\"></span></span> <span> <span class=\"faint svelte-1669bz5\"> </span></span> <!></div>"), $i = /* @__PURE__ */ Z("<div class=\"atlas-empty\">No spending this month.</div>"), ea = /* @__PURE__ */ Z("<div class=\"faint svelte-1669bz5\"> </div>"), ta = /* @__PURE__ */ Z("<div class=\"spending svelte-1669bz5\"><div class=\"head svelte-1669bz5\"><span class=\"title svelte-1669bz5\"> <!></span> <span class=\"total svelte-1669bz5\"> <span class=\"faint svelte-1669bz5\"> </span></span></div> <!> <!></div>"), na = {
	hash: "svelte-1669bz5",
	code: ".spending.svelte-1669bz5 {display:grid;gap:6px;}.head.svelte-1669bz5 {display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:2px;}.title.svelte-1669bz5 {font-weight:600;}.total.svelte-1669bz5 {font-variant-numeric:tabular-nums;}.faint.svelte-1669bz5 {color:var(--text-faint);font-size:0.9em;font-weight:400;}.row.svelte-1669bz5 {display:grid;grid-template-columns:minmax(80px, 11em) 1fr 8em auto;align-items:center;gap:10px;}.name.svelte-1669bz5 {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);}.pin.svelte-1669bz5 {color:var(--accent);margin-left:4px;font-size:0.75em;}.bar.svelte-1669bz5 {position:relative;height:10px;border-radius:5px;background:var(--bg-hover);}.fill.svelte-1669bz5 {position:absolute;inset:0 auto 0 0;border-radius:5px;background:var(--accent);opacity:0.75;}.fill.over.svelte-1669bz5 {background:var(--yellow);opacity:0.9;}.tick.svelte-1669bz5 {position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:var(--text-muted);border-radius:1px;}.pace.svelte-1669bz5 {position:absolute;top:1px;bottom:1px;width:2px;margin-left:-1px;background:var(--text-faint);opacity:0.6;}.num.svelte-1669bz5 {text-align:right;font-variant-numeric:tabular-nums;}.num.over.svelte-1669bz5 {font-weight:600;}.pinbtn.svelte-1669bz5 {all:unset;cursor:pointer;color:var(--text-faint);font-size:0.82em;padding:0 4px;}.pinbtn.svelte-1669bz5:hover {color:var(--accent);}\n  @media (max-width: 700px) {.row.svelte-1669bz5 {grid-template-columns:minmax(70px, 8em) 1fr 6.5em;}.pinbtn.svelte-1669bz5 {display:none;} }"
};
function ra(e, t) {
	He(t, !0), Gr(e, na);
	let n = Ti(t, "limit", 3, 99), r = (e) => ji(e.target ?? e.usual), i = /* @__PURE__ */ j(() => t.budget.lines.filter((e) => ji(e.spent) >= .5 || r(e) >= .5).slice(0, n())), a = /* @__PURE__ */ j(() => Math.max(1, ...Y(i).map((e) => Math.max(ji(e.spent), r(e))))), o = /* @__PURE__ */ j(() => Y(i).reduce((e, t) => e + ji(t.spent), 0)), s = /* @__PURE__ */ j(() => Y(i).reduce((e, t) => e + r(t), 0)), c = /* @__PURE__ */ j(() => ji(t.budget.elapsed));
	var l = ta(), u = I(l), d = I(u), f = I(d, !0), p = R(f), m = (e) => {
		var t = Ji(), n = L(t);
		z((e) => $(n, `· ${e ?? ""} % through`), [() => Math.round(Y(c) * 100)]), Q(e, t);
	};
	Mr(p, (e) => {
		Y(c) < 1 && e(m);
	}), O(d);
	var h = R(d, 2), g = I(h), _ = L(R(g));
	O(h), O(u);
	var v = R(u, 2);
	zr(v, 17, () => Y(i), (e) => e.account, (e, n) => {
		let i = /* @__PURE__ */ j(() => r(Y(n))), o = /* @__PURE__ */ j(() => ji(Y(n).spent)), s = /* @__PURE__ */ j(() => Y(o) > Y(i) * 1.05 && Y(o) - Y(i) > 1);
		var l = Qi(), u = I(l), d = I(u, !0), f = R(d), p = (e) => {
			Q(e, Yi());
		};
		Mr(f, (e) => {
			Y(n).target && e(p);
		}), O(u);
		var m = R(u, 2), h = I(m);
		let g, _;
		var v = R(h, 2), y = (e) => {
			var t = Xi();
			let n;
			z(() => n = ei(t, "", n, { left: `${100 * Y(i) * Y(c) / Y(a)}%` })), Q(e, t);
		};
		Mr(v, (e) => {
			Y(c) < 1 && Y(i) > 0 && e(y);
		});
		var b = R(v, 2);
		let x;
		O(m);
		var S = R(m, 2);
		let C;
		var ee = I(S, !0), te = L(R(ee));
		O(S);
		var ne = R(S, 2), re = (e) => {
			var r = Zi(), i = L(r, !0);
			z((e) => {
				fi(r, "title", `Pin a target for ${e ?? ""}`), $(i, Y(n).target ? "edit" : "pin");
			}, [() => Ai(Y(n).account)]), ur("click", r, () => t.onpin(Y(n))), Q(e, r);
		};
		Mr(ne, (e) => {
			t.onpin && e(re);
		}), O(l), z((e, t, r, o, c, u) => {
			fi(l, "title", `${Y(n).account ?? ""}: ${e ?? ""} this month; ${t ?? ""}`), $(d, r), g = Qr(h, 1, "fill svelte-1669bz5", null, g, { over: Y(s) }), _ = ei(h, "", _, { width: o }), x = ei(b, "", x, { left: `${100 * Y(i) / Y(a)}%` }), C = Qr(S, 1, "num svelte-1669bz5", null, C, { over: Y(s) }), $(ee, c), $(te, ` / ${u ?? ""}`);
		}, [
			() => ki(Y(o), t.cur),
			() => Y(n).target ? `target ${ki(ji(Y(n).target), t.cur)} (pinned on its note)` : `${ki(ji(Y(n).usual), t.cur)} in a usual month (the median of the months before, or the mean for a category of only some months)`,
			() => Ai(Y(n).account),
			() => `${100 * Math.max(Y(o), 0) / Y(a)}%`,
			() => ki(Y(o), t.cur, { whole: !0 }),
			() => Math.round(Y(i))
		]), Q(e, l);
	}, (e) => {
		Q(e, $i());
	});
	var y = R(v, 2), b = (e) => {
		var n = ea(), r = L(n);
		z((e) => $(r, `Not counted, no price into ${t.cur ?? ""} yet: ${e ?? ""}.`), [() => t.budget.unpriced.join(", ")]), Q(e, n);
	};
	Mr(y, (e) => {
		t.budget.unpriced.length && e(b);
	}), O(l), z((e, t, n) => {
		$(f, e), $(g, `${t ?? ""} `), $(_, `of ${n ?? ""}`);
	}, [
		() => Ni(t.budget.month),
		() => ki(Y(o), t.cur, { whole: !0 }),
		() => ki(Y(s), t.cur, { whole: !0 })
	]), Q(e, l), Ue();
}
dr(["click"]);
//#endregion
export { He as $, $ as A, Y as B, Kr as C, Pr as D, Fr as E, yr as F, tn as G, mn as H, br as I, Kt as J, L as K, dr as L, Q as M, xr as N, Mr as O, Z as P, Ue as Q, ur as R, Qr as S, zr as T, Yt as U, z as V, I as W, Lt as X, zt as Y, j as Z, fi as _, Di as a, ti as b, Mi as c, ji as d, we as et, Ti as f, di as g, gi as h, Ei as i, Ar as j, Er as k, ki as l, bi as m, qi as n, m as nt, Oi as o, Si as p, R as q, Bi as r, Ai as s, ra as t, O as tt, Ni as u, ai as v, Gr as w, ei as x, ii as y, lr as z };
