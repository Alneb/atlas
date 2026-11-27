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
	console.warn("https://svelte.dev/e/svelte_boundary_reset_noop");
}
// ui/node_modules/svelte/src/internal/client/dom/hydration.js
var w = !1;
function Se(e) {
	w = e;
}
var T;
function E(e) {
	if (e === null) throw be(), _e;
	return T = e;
}
function Ce() {
	return E(/* @__PURE__ */ Xt(T));
}
function D(e) {
	if (w) {
		if (/* @__PURE__ */ Xt(T) !== null) throw be(), _e;
		T = e;
	}
}
function we(e = 1) {
	if (w) {
		for (var t = e, n = T; t--;) n = /* @__PURE__ */ Xt(n);
		T = n;
	}
}
function Te(e = !0) {
	for (var t = 0, n = T;;) {
		if (n.nodeType === 8) {
			var r = n.data;
			if (r === "]") {
				if (t === 0) return n;
				--t;
			} else (r === "[" || r === "[!" || r[0] === "[" && !isNaN(Number(r.slice(1)))) && (t += 1);
		}
		var i = /* @__PURE__ */ Xt(n);
		e && n.remove(), n = i;
	}
}
function Ee(e) {
	if (!e || e.nodeType !== 8) throw be(), _e;
	return e.data;
}
// ui/node_modules/svelte/src/internal/client/reactivity/equality.js
function De(e) {
	return e === this.v;
}
function Oe(e, t) {
	return e == e ? e !== t || typeof e == "object" && !!e || typeof e == "function" : t == t;
}
function ke(e) {
	return !Oe(e, this.v);
}
// ui/node_modules/svelte/src/internal/client/errors.js
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
// ui/node_modules/svelte/src/internal/client/context.js
var O = null;
function Ve(e) {
	O = e;
}
function He(e, t = !1, n) {
	O = {
		p: O,
		i: !1,
		c: null,
		e: null,
		s: e,
		x: null,
		r: W,
		l: null
	};
}
function Ue(e) {
	var t = O, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) dn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, O = t.p, We(e);
}
function We(e = {}) {
	return i(e, se, { value: !0 }), e;
}
function Ge() {
	return !0;
}
// ui/node_modules/svelte/src/internal/client/dom/task.js
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
// ui/node_modules/svelte/src/internal/client/reactivity/status.js
var Ye = ~(g | _ | h);
function k(e, t) {
	e.f = e.f & Ye | t;
}
function Xe(e) {
	e.f & 512 || e.deps === null ? k(e, h) : k(e, _);
}
// ui/node_modules/svelte/src/internal/client/reactivity/utils.js
function Ze(e, t) {
	e.f & 2048 ? t.set(e, g) : e.f & 4096 && t.get(e) !== 2048 && t.set(e, _), k(e, h);
}
// ui/node_modules/svelte/src/internal/client/dom/elements/misc.js
var Qe = !1;
function $e() {
	Qe || (Qe = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[me]?.();
		});
	}, { capture: !0 }));
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function et(e) {
	var t = V, n = W;
	U(null), An(null);
	try {
		return e();
	} finally {
		U(t), An(n);
	}
}
function tt(e, t, n, r = n) {
	e.addEventListener(t, () => et(n));
	let i = e[me];
	e[me] = i ? () => {
		i(), r(!0);
	} : () => r(!0), $e();
}
// ui/node_modules/svelte/src/internal/client/reactivity/async.js
function nt(e, t, n, r) {
	let i = Ge() ? ot : ut;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = W, c = rt(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
	function u(e) {
		if (!(s.f & 16384)) {
			c();
			try {
				r([...o, ...e]);
			} catch (e) {
				rn(e, s);
			}
			it();
		}
	}
	var d = at();
	if (n.length === 0) {
		l.then(() => u([])).finally(d);
		return;
	}
	function f() {
		Promise.all(n.map((e) => /* @__PURE__ */ ct(e))).then(u).catch((e) => rn(e, s)).finally(d);
	}
	l ? l.then(() => {
		s.f & 16384 ? d() : (c(), f(), it());
	}) : f();
}
function rt() {
	var e = W, t = V, n = O, r = A;
	return function(i = !0) {
		An(e), U(t), Ve(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function it(e = !0) {
	An(null), U(null), Ve(null), e && A?.deactivate();
}
function at() {
	var e = W, t = e.b, n = A, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function ot(e) {
	var t = 2 | g;
	return W !== null && (W.f |= ee), {
		ctx: O,
		deps: null,
		effects: null,
		equals: De,
		f: t,
		fn: e,
		reactions: null,
		rv: 0,
		v: C,
		wv: 0,
		parent: W,
		ac: null
	};
}
var st = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function ct(e, t, n) {
	let r = W;
	r === null && Ae();
	var i = void 0, a = Ft(C), o = !V, s = /* @__PURE__ */ new Set();
	return mn(() => {
		var t = W, n = p();
		i = n.promise;
		try {
			Promise.resolve(e()).then(n.resolve, (e) => {
				e !== he && n.reject(e);
			}).finally(it);
		} catch (e) {
			n.reject(e), it();
		}
		var c = A;
		if (o) {
			if (t.f & 32768) var l = at();
			if (r.b?.is_rendered()) c.async_deriveds.get(t)?.reject(st);
			else for (let e of s.values()) e.reject(st);
			s.add(n), c.async_deriveds.set(t, n);
		}
		let u = (e, t = void 0) => {
			l?.(), s.delete(n), t !== st && (c.activate(), t ? (a.f |= ae, zt(a, t)) : (a.f & 8388608 && (a.f ^= ae), zt(a, e)), c.deactivate());
		};
		n.promise.then(u, (e) => u(null, e || "unknown"));
	}), ln(() => {
		for (let e of s) e.reject(st);
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
function lt(e) {
	let t = /* @__PURE__ */ ot(e);
	return Mn(t), t;
}
/*#__NO_SIDE_EFFECTS__*/
function ut(e) {
	let t = /* @__PURE__ */ ot(e);
	return t.equals = ke, t;
}
function dt(e) {
	var t = e.effects;
	if (t !== null) {
		e.effects = null;
		for (var n = 0; n < t.length; n += 1) B(t[n]);
	}
}
function ft(e) {
	var t, n = W, r = e.parent;
	if (!On && r !== null && e.v !== C && r.f & 24576) return ye(), e.v;
	An(r);
	try {
		dt(e), t = Vn(e);
	} finally {
		An(n);
	}
	return t;
}
function pt(e) {
	var t = ft(e);
	!e.equals(t) && (e.wv = Rn(), (!A?.is_fork || e.deps === null) && (A === null ? e.v = t : (A.capture(e, t, !0), _t?.capture(e, t, !0)), e.deps === null)) ? k(e, h) : On || (j === null ? Xe(e) : (cn() || A?.is_fork) && j.set(e, t));
}
function mt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && et(() => {
		t.ac.abort(he), t.ac = null;
	}), t.fn !== null && (t.teardown = d), Wn(t, 0), vn(t));
}
function ht(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && Gn(t);
}
// ui/node_modules/svelte/src/internal/client/reactivity/batch.js
var gt = null, A = null, _t = null, j = null, vt = null, yt = !1, bt = !1, xt = null, St = null, Ct = 0, wt = 1, Tt = class e {
	id = wt++;
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
		gt === null ? gt = this : (gt.next = this, this.prev = gt), gt = this;
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
		for (var t = xt = [], n = [], r = St = []; this.#a.length > 0;) {
			Ct++ > 1e3 && (this.#b(), Et());
			for (let e of this.#p()) try {
				this.#h(e, t, n);
			} catch (t) {
				throw jt(e), this.#d() || this.discard(), t;
			}
		}
		if (A = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (xt = null, St = null, this.#d()) {
			this.#y(n), this.#y(t);
			for (let [e, t] of this.#c) At(e, t);
			r.length > 0 && A.#m();
			return;
		}
		let a = this.#g();
		if (a) this.#y(n), this.#y(t), a.#v(this);
		else {
			this.#s.clear();
			for (let e of this.#e) e(this);
			this.#e.clear(), _t = this, Ot(n), Ot(t), _t = null, this.#i?.resolve();
			var o = A;
			this.#n === 0 && (this.#a.length === 0 || o !== null) && this.#b(), o !== null && (Nt.clear(), o.#m());
		}
	}
	#h(e, t, n) {
		e.f ^= h;
		for (var r = e.first; r !== null;) {
			var i = r.f, a = !!(i & 96);
			if (!(a && i & 1024 || i & 8192 || this.#c.has(r)) && r.fn !== null) {
				a ? r.f ^= h : i & 4 ? t.push(r) : zn(r) && (i & 16 && this.add_dirty_reaction(r, _), Gn(r));
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
		for (var t = 0; t < e.length; t += 1) Ze(e[t], this.#s);
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
			bt = !0, A = this, this.#m();
		} finally {
			Ct = 0, vt = null, xt = null, St = null, bt = !1, A = null, j = null, Nt.clear();
		}
	}
	discard() {
		for (let e of this.#t) e(this);
		this.#t.clear();
		for (let e of this.async_deriveds.values()) e.reject(st);
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
		this.#u || (this.#u = !0, Je(() => {
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
			!bt && Je(() => {
				t.started || t.flush();
			});
		}
		return A;
	}
	apply() {
		j = null;
	}
	schedule(e) {
		vt = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768) ? e.b.defer_effect(e) : this.#a.push(e);
	}
	#b() {
		if (this.linked) {
			var e = this.prev, t = this.next;
			e === null || (e.next = t), t === null ? gt = e : t.prev = e, this.linked = !1;
		}
	}
};
function Et() {
	try {
		Fe();
	} catch (e) {
		rn(e, vt);
	}
}
var Dt = null;
function Ot(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && zn(r) && (Dt = /* @__PURE__ */ new Set(), Gn(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && xn(r), Dt?.size > 0)) {
				Nt.clear();
				for (let e of Dt) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) Dt.has(n) && (Dt.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || Gn(n);
					}
				}
				Dt.clear();
			}
		}
		Dt = null;
	}
}
function kt(e) {
	A.schedule(e);
}
function At(e, t) {
	if (!(e.f & 32 && e.f & 1024)) {
		e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), k(e, h);
		for (var n = e.first; n !== null;) At(n, t), n = n.next;
	}
}
function jt(e) {
	k(e, h);
	for (var t = e.first; t !== null;) jt(t), t = t.next;
}
// ui/node_modules/svelte/src/internal/client/reactivity/sources.js
var Mt = /* @__PURE__ */ new Set(), Nt = /* @__PURE__ */ new Map(), Pt = !1;
function Ft(e, t) {
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
function M(e, t) {
	let n = Ft(e, t);
	return Mn(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function It(e, t = !1, n = !0) {
	let r = Ft(e);
	return t || (r.equals = ke), r;
}
function N(e, t, n = !1) {
	return V !== null && (!H || V.f & 131072) && Ge() && V.f & 4325394 && (jn === null || !jn.has(e)) && ze(), zt(e, n ? Ut(t) : t, St);
}
var Lt = null, Rt = 0;
function zt(e, t, n = null) {
	if (!e.equals(t)) {
		On ? Nt.set(e, t) : Nt.has(e) || Nt.set(e, e.v);
		var r = Tt.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && ft(t), j === null && Xe(t);
		}
		e.wv = Rn(), Lt = null, Rt = 0, Ht(e, g, n), Lt = null, Ge() && W !== null && W.f & 1024 && !(W.f & 96) && (q === null ? Nn([e]) : q.push(e)), !r.is_fork && Mt.size > 0 && !Pt && Bt();
	}
	return t;
}
function Bt() {
	Pt = !1;
	for (let e of Mt) {
		e.f & 1024 && k(e, _);
		let t;
		try {
			t = zn(e);
		} catch {
			t = !0;
		}
		t && Gn(e);
	}
	Mt.clear();
}
function Vt(e) {
	N(e, e.v + 1);
}
function Ht(e, t, n) {
	var r = e.reactions;
	if (r !== null) {
		var i = Ge(), a = r.length;
		if (Rt += a, Rt > 1e5 && Lt === null && (Lt = /* @__PURE__ */ new Set()), Lt !== null) {
			if (Lt.has(e)) return;
			Lt.add(e);
		}
		for (var o = 0; o < a; o++) {
			var s = r[o], c = s.f;
			if (i || s !== W) {
				var l = (c & g) === 0;
				if (l && k(s, t), c & 131072) Mt.add(s);
				else if (c & 2) {
					var u = s;
					j?.delete(u), Ht(u, _, n);
				} else if (l) {
					var d = s;
					c & 16 && Dt !== null && Dt.add(d), n === null ? kt(d) : n.push(d);
				}
			}
		}
	}
}
function Ut(t) {
	if (typeof t != "object" || !t || oe in t || se in t) return t;
	let n = l(t);
	if (n !== s && n !== c) return t;
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ M(0), u = null, d = In, f = (e) => {
		if (In === d) return e();
		var t = V, n = In;
		U(null), Ln(d);
		var r = e();
		return U(t), Ln(n), r;
	};
	return i && r.set("length", /* @__PURE__ */ M(t.length, u)), new Proxy(t, {
		defineProperty(e, t, n) {
			"value" in n && n.configurable !== !1 && n.enumerable !== !1 && n.writable !== !1 || Le();
			var i = r.get(t);
			return i === void 0 ? f(() => {
				var e = /* @__PURE__ */ M(n.value, u);
				return r.set(t, e), e;
			}) : N(i, n.value, !0), !0;
		},
		deleteProperty(e, t) {
			var n = r.get(t);
			if (n === void 0) {
				if (t in e) {
					let e = f(() => /* @__PURE__ */ M(C, u));
					r.set(t, e), Vt(o);
				}
			} else N(n, C), Vt(o);
			return !0;
		},
		get(e, n, i) {
			if (n === oe) return t;
			var o = r.get(n), s = n in e;
			if (o === void 0 && (!s || a(e, n)?.writable) && (o = f(() => /* @__PURE__ */ M(Ut(s ? e[n] : C), u)), r.set(n, o)), o !== void 0) {
				var c = J(o);
				return c === C ? void 0 : c;
			}
			return Reflect.get(e, n, i);
		},
		getOwnPropertyDescriptor(e, t) {
			this.has?.(e, t);
			var n = Reflect.getOwnPropertyDescriptor(e, t), i = r.get(t);
			if (i !== void 0) {
				var a = J(i);
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
			return (n !== void 0 || (W !== null || V !== null) && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ M(i ? Ut(e[t]) : C, u)), r.set(t, n)), J(n) === C) ? !1 : i;
		},
		set(e, t, n, s) {
			var c = r.get(t), l = t in e;
			if (i && t === "length") for (var d = n; d < c.v; d += 1) {
				var p = r.get(d + "");
				p === void 0 ? d in e && (p = f(() => /* @__PURE__ */ M(C, u)), r.set(d + "", p)) : N(p, C);
			}
			if (c === void 0) (!l || a(e, t)?.writable) && (c = f(() => /* @__PURE__ */ M(void 0, u)), N(c, Ut(n)), r.set(t, c));
			else {
				l = c.v !== C;
				var m = f(() => Ut(n));
				N(c, m);
			}
			var h = Reflect.getOwnPropertyDescriptor(e, t);
			if (h?.set && h.set.call(s, n), !l) {
				if (i && typeof t == "string") {
					var g = r.get("length"), _ = Number(t);
					Number.isInteger(_) && _ >= g.v && N(g, _ + 1);
				}
				Vt(o);
			}
			return !0;
		},
		ownKeys(e) {
			J(o);
			var t = Reflect.ownKeys(e).filter((e) => {
				var t = r.get(e);
				return t === void 0 || t.v !== C;
			});
			for (var [n, i] of r) i.v !== C && !(n in e) && t.push(n);
			return t;
		},
		setPrototypeOf() {
			Re();
		}
	});
}
var Wt, Gt, Kt, qt;
function Jt() {
	if (Wt === void 0) {
		Wt = window, Gt = /Firefox/.test(navigator.userAgent);
		var e = Element.prototype, t = Node.prototype, n = Text.prototype;
		Kt = a(t, "firstChild").get, qt = a(t, "nextSibling").get, u(e) && (e[de] = void 0, e[ue] = null, e[fe] = void 0, e.__e = void 0), u(n) && (n[pe] = void 0);
	}
}
function P(e = "") {
	return document.createTextNode(e);
}
/*@__NO_SIDE_EFFECTS__*/
function Yt(e) {
	return Kt.call(e);
}
/*@__NO_SIDE_EFFECTS__*/
function Xt(e) {
	return qt.call(e);
}
function F(e, t) {
	if (!w) return /* @__PURE__ */ Yt(e);
	var n = /* @__PURE__ */ Yt(T);
	if (n === null) n = T.appendChild(P());
	else if (t && n.nodeType !== 3) {
		var r = P();
		return n?.before(r), E(r), r;
	}
	return t && tn(n), E(n), n;
}
function Zt(e, t = !1) {
	if (!w) {
		var n = /* @__PURE__ */ Yt(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ Xt(n) : n;
	}
	if (t) {
		if (T?.nodeType !== 3) {
			var r = P();
			return T?.before(r), E(r), r;
		}
		tn(T);
	}
	return T;
}
function I(e, t = !1) {
	if (!w) return /* @__PURE__ */ Yt(e);
	var n = F(e, t);
	return D(e), n;
}
function L(e, t = 1, n = !1) {
	let r = w ? T : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ Xt(r);
	if (!w) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = P();
			return r === null ? i?.after(a) : r.before(a), E(a), a;
		}
		tn(r);
	}
	return E(r), r;
}
function Qt(e) {
	e.textContent = "";
}
function $t() {
	return !1;
}
function en(e, t, n) {
	return t == null || t === "http://www.w3.org/1999/xhtml" ? n ? document.createElement(e, { is: n }) : document.createElement(e) : n ? document.createElementNS(t, e, { is: n }) : document.createElementNS(t, e);
}
function tn(e) {
	if (e.nodeValue.length < 65536) return;
	let t = e.nextSibling;
	for (; t !== null && t.nodeType === 3;) t.remove(), e.nodeValue += t.nodeValue, t = e.nextSibling;
}
function nn(e) {
	var t = W;
	if (t === null) return V.f |= ae, e;
	if (!(t.f & 32768) && !(t.f & 4)) throw e;
	rn(e, t);
}
function rn(e, t) {
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
function an(e) {
	W === null && (V === null && Pe(e), Ne()), On && Me(e);
}
function on(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function sn(e, t) {
	var n = W;
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
	A?.register_created_effect(r);
	var i = r;
	if (e & 4) xt === null ? Tt.ensure().schedule(r) : xt.push(r);
	else if (t !== null) {
		try {
			Gn(r);
		} catch (e) {
			throw B(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= S));
	}
	if (i !== null && (i.parent = n, n !== null && on(i, n), V !== null && V.f & 2 && !(e & 64))) {
		var a = V;
		(a.effects ??= []).push(i);
	}
	return r;
}
function cn() {
	return V !== null && !H;
}
function ln(e) {
	let t = sn(8, null);
	return k(t, h), t.teardown = e, t;
}
function un(e) {
	an("$effect");
	var t = W.f;
	if (!V && t & 32 && O !== null && !O.i) {
		var n = O;
		(n.e ??= []).push(e);
	} else return dn(e);
}
function dn(e) {
	return sn(4 | te, e);
}
function fn(e) {
	Tt.ensure();
	let t = sn(64 | ee, e);
	return (e = {}) => new Promise((n) => {
		e.outro ? Sn(t, () => {
			B(t), n(void 0);
		}) : (B(t), n(void 0));
	});
}
function pn(e) {
	return sn(4, e);
}
function mn(e) {
	return sn(ie | ee, e);
}
function hn(e, t = 0) {
	return sn(8 | t, e);
}
function R(e, t = [], n = [], r = []) {
	nt(r, t, n, (t) => {
		sn(8, () => {
			e(...t.map(J));
		});
	});
}
function gn(e, t = 0) {
	return sn(16 | t, e);
}
function z(e) {
	return sn(32 | ee, e);
}
function _n(e) {
	var t = e.teardown;
	if (t !== null) {
		let n = On, r = V;
		kn(!0), U(null);
		try {
			t.call(null);
		} catch (t) {
			rn(t, e.parent);
		} finally {
			kn(n), U(r);
		}
	}
}
function vn(e, t = !1) {
	var n = e.first;
	for (e.first = e.last = null; n !== null;) {
		let e = n.ac;
		e !== null && et(() => {
			e.abort(he);
		});
		var r = n.next;
		n.f & 64 ? n.parent = null : B(n, t), n = r;
	}
}
function yn(e) {
	for (var t = e.first; t !== null;) {
		var n = t.next;
		t.f & 32 || B(t), t = n;
	}
}
function B(e, t = !0) {
	var n = !1;
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (bn(e.nodes.start, e.nodes.end), n = !0), e.f |= x, vn(e, t && !n), Wn(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	_n(e), e.f ^= x, e.f |= y;
	var i = e.parent;
	i !== null && i.first !== null && xn(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function bn(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ Xt(e);
		e.remove(), e = n;
	}
}
function xn(e) {
	var t = e.parent, n = e.prev, r = e.next;
	n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n));
}
function Sn(e, t, n = !0) {
	var r = [];
	e.f |= 256, Cn(e, r, !0);
	var i = () => {
		n && B(e), t && t();
	}, a = r.length;
	if (a > 0) {
		var o = () => --a || i();
		for (var s of r) s.out(o);
	} else i();
}
function Cn(e, t, n) {
	if (!(e.f & 8192)) {
		e.f ^= v;
		var r = e.nodes && e.nodes.t;
		if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
		for (var i = e.first; i !== null;) {
			var a = i.next;
			if (!(i.f & 64)) {
				var o = !!(i.f & 65536) || !!(i.f & 32) && !!(e.f & 16);
				Cn(i, t, o ? n : !1);
			}
			i = a;
		}
	}
}
function wn(e) {
	e.f &= -257, Tn(e, !0);
}
function Tn(e, t) {
	if (!(e.f & 256) && e.f & 8192) {
		e.f ^= v, e.f & 1024 || (k(e, g), Tt.ensure().schedule(e));
		for (var n = e.first; n !== null;) {
			var r = n.next, i = !!(n.f & 65536) || !!(n.f & 32);
			Tn(n, i ? t : !1), n = r;
		}
		var a = e.nodes && e.nodes.t;
		if (a !== null) for (let e of a) (e.is_global || t) && e.in();
	}
}
function En(e, t) {
	if (e.nodes) for (var n = e.nodes.start, r = e.nodes.end; n !== null;) {
		var i = n === r ? null : /* @__PURE__ */ Xt(n);
		t.append(n), n = i;
	}
}
// ui/node_modules/svelte/src/internal/client/legacy.js
var Dn = null, On = !1;
function kn(e) {
	On = e;
}
var V = null, H = !1;
function U(e) {
	V = e;
}
var W = null;
function An(e) {
	W = e;
}
var jn = null;
function Mn(e) {
	V !== null && (V.f & 2097152 || V.f & 2) && (jn ??= /* @__PURE__ */ new Set()).add(e);
}
var G = null, K = 0, q = null;
function Nn(e) {
	q = e;
}
var Pn = 1, Fn = 0, In = Fn;
function Ln(e) {
	In = e;
}
function Rn() {
	return ++Pn;
}
function zn(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (zn(a) && pt(a), a.wv > e.wv) return !0;
		}
		t & 512 && j === null && k(e, h);
	}
	return !1;
}
function Bn(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(jn !== null && jn.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? Bn(a, t, !1) : t === a && (n ? k(a, g) : a.f & 1024 && k(a, _), kt(a));
	}
}
function Vn(e) {
	var t = G, n = K, r = q, i = V, a = jn, o = O, s = H, c = In, l = e.f;
	G = null, K = 0, q = null, V = l & 96 ? null : e, jn = null, Ve(e.ctx), H = !1, In = ++Fn, e.ac !== null && (et(() => {
		e.ac.abort(he);
	}), e.ac = null);
	try {
		e.f |= re;
		var u = e.fn, d = u();
		e.f |= b;
		var f = Hn(e);
		if (Ge() && q !== null && !H && f !== null && !(e.f & 6146)) for (var p = 0; p < q.length; p++) Bn(q[p], e);
		if (i !== null && i !== e) {
			if (Fn++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = Fn;
			if (t !== null) for (let e of t) e.rv = Fn;
			q !== null && (r === null ? r = q : r.push(...q));
		}
		return e.f & 8388608 && (e.f ^= ae), d;
	} catch (t) {
		return Hn(e), nn(t);
	} finally {
		e.f ^= re, G = t, K = n, q = r, V = i, jn = a, Ve(o), H = s, In = c;
	}
}
function Hn(e) {
	var t = e.deps, n = A?.is_fork;
	if (G !== null) {
		var r;
		if (n || Wn(e, K), t !== null && K > 0) for (t.length = K + G.length, r = 0; r < G.length; r++) t[K + r] = G[r];
		else e.deps = t = G;
		if (cn() && e.f & 512) for (r = K; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && K < t.length && (Wn(e, K), t.length = K);
	return t;
}
function Un(e, r) {
	let i = r.reactions;
	if (i !== null) {
		var a = t.call(i, e);
		if (a !== -1) {
			var o = i.length - 1;
			o === 0 ? i = r.reactions = null : (i[a] = i[o], i.pop());
		}
	}
	if (i === null && r.f & 2 && (G === null || !n.call(G, r))) {
		var s = r;
		s.f & 512 && (s.f ^= 512), s.v !== C && Xe(s), s.ac !== null && et(() => {
			s.ac.abort(he), s.ac = null, k(s, g);
		}), mt(s), Wn(s, 0);
	}
}
function Wn(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) Un(e, n[r]);
}
function Gn(e) {
	var t = e.f;
	if (!(t & 16384)) {
		k(e, h);
		var n = W;
		W = e;
		try {
			t & 16777232 ? yn(e) : vn(e), _n(e);
			var r = Vn(e);
			e.teardown = typeof r == "function" ? r : null, e.wv = Pn;
		} finally {
			W = n;
		}
	}
}
function J(e) {
	var t = !!(e.f & 2);
	if (Dn?.add(e), V !== null && !H && !(W !== null && W.f & 16384) && (jn === null || !jn.has(e))) {
		var r = V.deps;
		if (V.f & 2097152) e.rv < Fn && (e.rv = Fn, G === null && r !== null && r[K] === e ? K++ : G === null ? G = [e] : G.push(e));
		else {
			V.deps ??= [], n.call(V.deps, e) || V.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [V] : n.call(i, V) || i.push(V);
		}
	}
	if (On && Nt.has(e)) return Nt.get(e);
	if (t) {
		var a = e;
		if (On) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || qn(a)) && (o = ft(a)), Nt.set(a, o), o;
		}
		var s = !(a.f & 512) && !H && V !== null && !!(V.f & 512), c = (a.f & b) === 0;
		zn(a) && (s && (a.f |= 512), pt(a)), s && !c && (ht(a), Kn(a));
	}
	if (j?.has(e)) return j.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function Kn(e) {
	if (e.f |= 512, e.deps !== null) for (let r of e.deps) {
		var t = r.reactions;
		t === null ? r.reactions = [e] : n.call(t, e) || t.push(e), r.f & 2 && !(r.f & 512) && (ht(r), Kn(r));
	}
}
function qn(e) {
	if (e.v === C) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (Nt.has(t) || t.f & 2 && qn(t)) return !0;
	return !1;
}
function Jn(e) {
	var t = H;
	try {
		return H = !0, e();
	} finally {
		H = t;
	}
}
[.../* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split(".")];
var Yn = ["touchstart", "touchmove"];
function Xn(e) {
	return Yn.includes(e);
}
// ui/node_modules/svelte/src/internal/client/dev/css.js
var Zn = Symbol("events"), Qn = /* @__PURE__ */ new Set(), $n = /* @__PURE__ */ new Set();
function er(e) {
	if (!w) return;
	e.removeAttribute("onload"), e.removeAttribute("onerror");
	let t = e.__e;
	t !== void 0 && (e.__e = void 0, queueMicrotask(() => {
		e.isConnected && e.dispatchEvent(t);
	}));
}
function tr(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || or.call(t, e), !e.cancelBubble) return et(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, Je(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function nr(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = tr(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && ln(() => {
		o.__removed = !0, t.removeEventListener(e, o, a);
	});
}
function Y(e, t, n) {
	(t[Zn] ??= {})[e] = n;
}
function rr(e) {
	for (var t = 0; t < e.length; t++) Qn.add(e[t]);
	for (var n of $n) n(e);
}
var ir = null, ar = !1;
function or(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	ir = e, ar || (ar = !0, setTimeout(() => {
		ar = !1, ir = null;
	}));
	var s = 0, c = ir === e && e[Zn];
	if (c) {
		var l = a.indexOf(c);
		if (l !== -1 && (t === document || t === window)) {
			e[Zn] = t;
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
		var d = V, f = W;
		U(null), An(null);
		try {
			for (var p, m = []; o !== null && o !== t;) {
				try {
					var h = o[Zn]?.[r];
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
			e[Zn] = t, delete e.currentTarget, U(d), An(f);
		}
	}
}
// ui/node_modules/svelte/src/internal/client/dom/reconciler.js
var sr = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function cr(e) {
	return sr?.createHTML(e) ?? e;
}
function lr(e) {
	var t = en("template");
	return t.innerHTML = cr(e.replaceAll("<!>", "<!---->")), t.content;
}
// ui/node_modules/svelte/src/internal/client/dom/template.js
function ur(e, t) {
	var n = W;
	n.nodes === null && (n.nodes = {
		start: e,
		end: t,
		a: null,
		t: null
	});
}
/*#__NO_SIDE_EFFECTS__*/
function X(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (w) return ur(T, null), T;
		i === void 0 && (i = lr(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ Yt(i)));
		var t = r || Gt ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ Yt(t), s = t.lastChild;
			ur(o, s);
		} else ur(t, t);
		return t;
	};
}
function dr(e = "") {
	if (!w) {
		var t = P(e + "");
		return ur(t, t), t;
	}
	var n = T;
	return n.nodeType === 3 ? tn(n) : (n.before(n = P()), E(n)), ur(n, n), n;
}
function fr() {
	if (w) return ur(T, null), T;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = P();
	return e.append(t, n), ur(t, n), e;
}
function Z(e, t) {
	if (w) {
		var n = W;
		n.f & 32768 && n.nodes.end !== null || (n.nodes.end = T), Ce();
	} else e !== null && e.before(t);
}
// ui/node_modules/svelte/src/reactivity/create-subscriber.js
function pr(e) {
	let t = 0, n = Ft(0), r;
	return () => {
		cn() && (J(n), hn(() => (t === 0 && (r = Jn(() => e(() => Vt(n)))), t += 1, () => {
			Je(() => {
				--t, t === 0 && (r?.(), r = void 0, Vt(n));
			});
		})));
	};
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var mr = S | ee;
function hr(e, t, n, r) {
	new gr(e, t, n, r);
}
var gr = class {
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
	#m = pr(() => (this.#p = Ft(this.#l), () => {
		this.#p = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = W;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = W.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = gn(() => {
			if (w) {
				let e = Ee(this.#t);
				Ce();
				let t = e === "[!";
				if (e.startsWith("[?")) {
					let t = JSON.parse(e.slice(2));
					this.#g(t);
				} else t ? this.#y() : this.#h();
			} else this.#b();
		}, mr), w && (this.#e = T);
	}
	#h() {
		try {
			this.#a = z(() => this.#r(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#g(e) {
		let t = this.#n.failed, { reset: n, invoke_onerror: r } = this.#_(e);
		Je(r), t && (this.#s = z(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#_(e) {
		var t = !1, n = !1;
		let r = () => {
			this.#v() || (t ? xe() : (t = !0, n && Be(), this.#s !== null && Sn(this.#s, () => {
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
					rn(e, this.#i && this.#i.parent);
				}
			}
		};
	}
	#v() {
		return (this.#i.f & (y | x)) !== 0;
	}
	#y() {
		let e = this.#n.pending;
		e && (this.is_pending = !0, this.#o = z(() => e(this.#e)), Je(() => {
			if (!this.#v()) {
				var e = this.#c = document.createDocumentFragment(), t = P(), n = !1;
				e.append(t), this.#a = this.#S(() => {
					try {
						return z(() => this.#r(t));
					} catch (e) {
						try {
							this.error(e), n = !0;
						} catch (e) {
							rn(e, this.#i.parent);
						}
						return null;
					}
				}), this.#a === null ? (this.#c = null, n && this.#x(A)) : this.#u === 0 && (this.#e.before(e), this.#c = null, Sn(this.#o, () => {
					this.#o = null;
				}), this.#x(A));
			}
		}));
	}
	#b() {
		try {
			if (this.is_pending = this.has_pending_snippet(), this.#u = 0, this.#l = 0, this.#a = z(() => {
				this.#r(this.#e);
			}), this.#u > 0) {
				var e = this.#c = document.createDocumentFragment();
				En(this.#a, e);
				let t = this.#n.pending;
				this.#o = z(() => t(this.#e));
			} else this.#x(A);
		} catch (e) {
			this.error(e);
		}
	}
	#x(e) {
		this.is_pending = !1, e.transfer_reactions(this.#f);
	}
	defer_effect(e) {
		Ze(e, this.#f);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#n.pending;
	}
	#S(e) {
		var t = W, n = V, r = O;
		An(this.#i), U(this.#i), Ve(this.#i.ctx);
		try {
			return Tt.ensure(), e();
		} finally {
			An(t), U(n), Ve(r);
		}
	}
	#C(e, t) {
		this.has_pending_snippet() ? (this.#u += e, this.#u === 0 && (this.#x(t), this.#o && Sn(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null))) : this.parent && this.parent.#C(e, t);
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !this.#p || this.#d || (this.#d = !0, Je(() => {
			this.#d = !1, this.#p && zt(this.#p, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#m(), J(this.#p);
	}
	error(e) {
		if (e === _e || !this.#n.onerror && !this.#n.failed) throw e;
		A?.is_fork ? (this.#a && A.skip_effect(this.#a), this.#o && A.skip_effect(this.#o), this.#s && A.skip_effect(this.#s), A.oncommit(() => {
			this.#v() || this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (B(this.#a), null), this.#o &&= (B(this.#o), null), this.#s &&= (B(this.#s), null), w && (E(this.#t), we(), E(Te()));
		let t = this.#n.failed, n = (e) => {
			if (this.#v()) return;
			let { reset: n, invoke_onerror: r } = this.#_(e);
			r(), t && !this.#v() && (this.#s = this.#S(() => {
				try {
					return z(() => {
						var r = W;
						r.b = this, r.f |= 128, t(this.#e, () => e, () => n);
					});
				} catch (e) {
					return rn(e, this.#i.parent), null;
				}
			}));
		};
		Je(() => {
			if (!this.#v()) {
				var t;
				try {
					t = this.transform_error(e);
				} catch (e) {
					rn(e, this.#i && this.#i.parent);
					return;
				}
				typeof t == "object" && t && typeof t.then == "function" ? t.then(n, (e) => rn(e, this.#i && this.#i.parent)) : n(t);
			}
		});
	}
};
function Q(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[pe] ??= e.nodeValue) && (e[pe] = n, e.nodeValue = `${n}`);
}
function _r(e, t) {
	return yr(e, t);
}
var vr = /* @__PURE__ */ new Map();
function yr(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	Jt();
	var l = void 0, u = fn(() => {
		var s = n ?? t.appendChild(P());
		hr(s, { pending: () => {} }, (t) => {
			He({});
			var n = O;
			if (o && (n.c = o), a && (i.$$events = a), w && ur(t, null), l = e(t, i) || We(), w && (W.nodes.end = T, T === null || T.nodeType !== 8 || T.data !== "]")) throw be(), _e;
			Ue();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = Xn(r);
					for (let e of [t, document]) {
						var a = vr.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), vr.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, or, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(Qn)), $n.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = vr.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, or), r.delete(e), r.size === 0 && vr.delete(n)) : r.set(e, i);
			}
			$n.delete(d), s !== n && s.parentNode?.removeChild(s);
		};
	});
	return br.set(l, u), l;
}
var br = /* @__PURE__ */ new WeakMap();
function xr(e, t) {
	let n = br.get(e);
	return n ? (br.delete(e), n(t)) : Promise.resolve();
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/branches.js
var Sr = class {
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
			if (n) wn(n), this.#r.delete(t);
			else {
				var r = this.#n.get(t);
				r && (wn(r.effect), this.#t.set(t, r.effect), this.#n.delete(t), r.fragment.lastChild.remove(), this.anchor.before(r.fragment), n = r.effect);
			}
			for (let [t, n] of this.#e) {
				if (this.#e.delete(t), t === e) break;
				let r = this.#n.get(n);
				r && (B(r.effect), this.#n.delete(n));
			}
			for (let [e, r] of this.#t) {
				if (e === t || this.#r.has(e)) continue;
				let i = () => {
					if (Array.from(this.#e.values()).includes(e)) {
						var t = document.createDocumentFragment();
						En(r, t), t.append(P()), this.#n.set(e, {
							effect: r,
							fragment: t
						});
					} else B(r);
					this.#r.delete(e), this.#t.delete(e);
				};
				this.#i || !n ? (this.#r.add(e), Sn(r, i, !1)) : i();
			}
		}
	};
	#o = (e) => {
		this.#e.delete(e);
		let t = Array.from(this.#e.values());
		for (let [e, n] of this.#n) t.includes(e) || (B(n.effect), this.#n.delete(e));
	};
	ensure(e, t) {
		var n = A, r = $t();
		if (t && !this.#t.has(e) && !this.#n.has(e)) {
			if (r) {
				var i = document.createDocumentFragment(), a = P();
				i.append(a), this.#n.set(e, {
					effect: z(() => t(a)),
					fragment: i
				});
			} else this.#t.set(e, z(() => t(this.anchor)));
		}
		if (this.#e.set(n, e), r) {
			for (let [t, r] of this.#t) t === e ? n.unskip_effect(r) : n.skip_effect(r);
			for (let [t, r] of this.#n) t === e ? n.unskip_effect(r.effect) : n.skip_effect(r.effect);
			n.oncommit(this.#a), n.ondiscard(this.#o);
		} else w && (this.anchor = T), this.#a(n);
	}
};
// ui/node_modules/svelte/src/internal/client/dom/blocks/if.js
function $(e, t, n = !1) {
	var r;
	w && (r = T, Ce());
	var i = new Sr(e), a = n ? S : 0;
	function o(e, t) {
		if (w) {
			var n = Ee(r);
			if (e !== parseInt(n.substring(1))) {
				var a = Te();
				E(a), i.anchor = a, Se(!1), i.ensure(e, t), Se(!0);
				return;
			}
		}
		i.ensure(e, t);
	}
	gn(() => {
		var e = !1;
		t((t, n = 0) => {
			e = !0, o(n, t);
		}), e || o(-1, null);
	}, a);
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/key.js
var Cr = Symbol("NaN");
function wr(e, t, n) {
	w && Ce();
	var r = new Sr(e), i = !Ge();
	gn(() => {
		var e = t();
		e !== e && (e = Cr), i && typeof e == "object" && e && (e = {}), r.ensure(e, n);
	});
}
// ui/node_modules/svelte/src/internal/client/dom/blocks/each.js
function Tr(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		Sn(n, () => {
			if (o) {
				if (o.pending.delete(n), o.done.add(n), o.pending.size === 0) {
					var t = e.outrogroups;
					Er(e, r(o.done)), t.delete(o), t.size === 0 && (e.outrogroups = null);
				}
			} else --s;
		}, !1);
	}
	if (s === 0) {
		var l = i.length === 0 && n !== null && e.pending.size === 0;
		if (l) {
			var u = n, d = u.parentNode;
			Qt(d), d.append(u), e.items.clear();
		}
		Er(e, t, !l);
	} else o = {
		pending: new Set(t),
		done: /* @__PURE__ */ new Set()
	}, (e.outrogroups ??= /* @__PURE__ */ new Set()).add(o);
}
function Er(e, t, n = !0) {
	var r;
	if (e.pending.size > 0) {
		r = /* @__PURE__ */ new Set();
		for (let t of e.pending.values()) for (let n of t) r.add(e.items.get(n).e);
	}
	for (var i = 0; i < t.length; i++) {
		var a = t[i];
		r?.has(a) ? (a.f |= ne, En(a, document.createDocumentFragment())) : B(t[i], n);
	}
}
var Dr;
function Or(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = w ? E(/* @__PURE__ */ Yt(u)) : u.appendChild(P());
	}
	w && Ce();
	var d = null, f = /* @__PURE__ */ ut(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p = /* @__PURE__ */ new Map(), m = !0;
	function h(e) {
		if (!(_.effect.f & 16384)) {
			_.pending.delete(e);
			var t = J(f);
			_.fallback = d, Ar(_, t, c, n, a), d !== null && (t.length === 0 ? d.f & 33554432 ? (d.f ^= ne, Mr(d, null, c)) : wn(d) : Sn(d, () => {
				d = null;
			}));
		}
	}
	function g(e) {
		_.pending.delete(e);
	}
	var _ = {
		effect: gn(() => {
			var e = J(f), t = e.length;
			let r = !1;
			w && Ee(c) === "[!" != (t === 0) && (c = Te(), E(c), Se(!1), r = !0);
			for (var u = /* @__PURE__ */ new Set(), _ = A, v = $t(), y = 0; y < t; y += 1) {
				w && T.nodeType === 8 && T.data === "]" && (c = T, r = !0, Se(!1));
				var b = e[y], x = a(b, y), S = m ? null : l.get(x);
				S ? (S.v && zt(S.v, b), S.i && zt(S.i, y), v && _.unskip_effect(S.e)) : (S = jr(l, m ? c : Dr ??= P(), b, x, y, o, n, i), m || (S.e.f |= ne), l.set(x, S)), u.add(x);
			}
			if (t === 0 && s && !d && (m ? d = z(() => s(c)) : (d = z(() => s(Dr ??= P())), d.f |= ne)), t > u.size && je("", "", ""), w && t > 0 && E(Te()), !m) {
				if (p.set(_, u), v) {
					for (let [e, t] of l) u.has(e) || _.skip_effect(t.e);
					_.oncommit(h), _.ondiscard(g);
				} else h(_);
			}
			r && Se(!0), J(f);
		}),
		flags: n,
		items: l,
		pending: p,
		outrogroups: null,
		fallback: d
	};
	m = !1, w && (c = T);
}
function kr(e) {
	for (; e !== null && !(e.f & 32);) e = e.next;
	return e;
}
function Ar(e, t, n, i, a) {
	var o = !!(i & 8), s = t.length, c = e.items, l = kr(e.effect.first), u, d = null, f, p = [], m = [], h, g, _, v;
	if (o) for (v = 0; v < s; v += 1) h = t[v], g = a(h, v), _ = c.get(g).e, _.f & 33554432 || (_.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(_));
	for (v = 0; v < s; v += 1) {
		if (h = t[v], g = a(h, v), _ = c.get(g).e, e.outrogroups !== null) for (let t of e.outrogroups) t.pending.delete(_), t.done.delete(_);
		if (_.f & 8192 && (wn(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= ne, _ === l) Mr(_, null, n);
			else {
				var y = d ? d.next : l;
				_ === e.effect.last && (e.effect.last = _.prev), _.prev && (_.prev.next = _.next), _.next && (_.next.prev = _.prev), Nr(e, d, _), Nr(e, _, y), Mr(_, y, n), d = _, p = [], m = [], l = kr(d.next);
				continue;
			}
		}
		if (_ !== l) {
			if (u !== void 0 && u.has(_)) {
				if (p.length < m.length) {
					var b = m[0], x;
					d = b.prev;
					var S = p[0], ee = p[p.length - 1];
					for (x = 0; x < p.length; x += 1) Mr(p[x], b, n);
					for (x = 0; x < m.length; x += 1) u.delete(m[x]);
					Nr(e, S.prev, ee.next), Nr(e, d, S), Nr(e, ee, b), l = b, d = ee, --v, p = [], m = [];
				} else u.delete(_), Mr(_, l, n), Nr(e, _.prev, _.next), Nr(e, _, d === null ? e.effect.first : d.next), Nr(e, d, _), d = _;
				continue;
			}
			for (p = [], m = []; l !== null && l !== _;) (u ??= /* @__PURE__ */ new Set()).add(l), m.push(l), l = kr(l.next);
			if (l === null) continue;
		}
		_.f & 33554432 || p.push(_), d = _, l = kr(_.next);
	}
	if (e.outrogroups !== null) {
		for (let t of e.outrogroups) t.pending.size === 0 && (Er(e, r(t.done)), e.outrogroups?.delete(t));
		e.outrogroups.size === 0 && (e.outrogroups = null);
	}
	if (l !== null || u !== void 0) {
		var te = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || te.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && te.push(l), l = kr(l.next);
		var re = te.length;
		if (re > 0) {
			var ie = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.measure();
				for (v = 0; v < re; v += 1) te[v].nodes?.a?.fix();
			}
			Tr(e, te, ie);
		}
	}
	o && Je(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function jr(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? Ft(n) : /* @__PURE__ */ It(n, !1, !1) : null, l = o & 2 ? Ft(i) : null;
	return {
		v: c,
		i: l,
		e: z(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function Mr(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ Xt(r);
		if (a.before(r), r === i) return;
		r = o;
	}
}
function Nr(e, t, n) {
	t === null ? e.effect.first = n : t.next = n, n === null ? e.effect.last = t : n.prev = t;
}
// ui/node_modules/svelte/src/internal/client/dom/css.js
function Pr(e, t) {
	pn(() => {
		e = W?.parent?.nodes?.start ?? e;
		var n = e.getRootNode(), r = n.host ? n : n.head ?? n.ownerDocument.head;
		if (!r.querySelector("#" + t.hash)) {
			let e = en("style");
			e.id = t.hash, e.textContent = t.code, r.appendChild(e);
		}
	});
}
// ui/node_modules/svelte/src/internal/shared/attributes.js
var Fr = [..." 	\n\r\f\xA0\v﻿"];
function Ir(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || Fr.includes(r[o - 1])) && (s === r.length || Fr.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function Lr(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function Rr(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function zr(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map(Rr)), i && c.push(...Object.keys(i).map(Rr));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = Rr(e.substring(l, u).trim());
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
		return r && (n += Lr(r)), i && (n += Lr(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
// ui/node_modules/svelte/src/internal/client/dom/elements/class.js
function Br(e, t, n, r, i, a) {
	var o = e[de];
	if (w || o !== n || o === void 0) {
		var s = Ir(n, r, a);
		w && s === e.getAttribute("class") || (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[de] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/style.js
function Vr(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function Hr(e, t, n, r) {
	var i = e[fe];
	if (w || i !== t) {
		var a = zr(t, r);
		w && a === e.getAttribute("style") || (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[fe] = t;
	} else r && (Array.isArray(r) ? (Vr(e, n?.[0], r[0]), Vr(e, n?.[1], r[1], "important")) : Vr(e, n, r));
	return r;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/attributes.js
var Ur = Symbol("is custom element"), Wr = Symbol("is html"), Gr = ge ? "link" : "LINK";
function Kr(e) {
	if (w) {
		var t = !1, n = () => {
			if (!t) {
				if (t = !0, e.hasAttribute("value")) {
					var n = e.value;
					qr(e, "value", null), e.value = n;
				}
				if (e.hasAttribute("checked")) {
					var r = e.checked;
					qr(e, "checked", null), e.checked = r;
				}
			}
		};
		e[me] = n, Je(n), $e();
	}
}
function qr(e, t, n, r) {
	var i = Jr(e);
	if (!(w && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === Gr))) {
		var a = i[t];
		a !== (i[t] = n) && (t === "loading" && (e[le] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && Xr(e).has(t) ? e[t] = n : (!w || typeof n != "number" && typeof n != "boolean" || a !== String(n)) && e.setAttribute(t, n));
	}
}
function Jr(e) {
	return e[ue] ??= {
		[Ur]: e.nodeName.includes("-"),
		[Wr]: e.namespaceURI === ve
	};
}
var Yr = /* @__PURE__ */ new Map();
function Xr(e) {
	var t = e.getAttribute("is") || e.nodeName, n = Yr.get(t);
	if (n) return n;
	Yr.set(t, n = /* @__PURE__ */ new Set());
	for (var r, i = e, a = Element.prototype; a !== i;) {
		for (var s in r = o(i), r) r[s].set && s !== "innerHTML" && s !== "textContent" && s !== "innerText" && n.add(s);
		i = l(i);
	}
	return n;
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function Zr(e, t, n = t) {
	tt(e, "change", (t) => {
		n(t ? e.defaultChecked : e.checked);
	}), (w && e.defaultChecked !== e.checked || Jn(t) == null) && n(e.checked), hn(() => {
		e.checked = !!t();
	});
}
// ui/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function Qr(e, t) {
	return e === t || e?.[oe] === t;
}
function $r(e = We(), t, n, r) {
	var i = O.r, a = W;
	return pn(() => {
		var o, s;
		return hn(() => {
			o = s, s = r?.() || [], Jn(() => {
				Qr(n(...s), e) || (t(e, ...s), o && Qr(n(...o), e) && t(null, ...o));
			});
		}), () => {
			let r = a;
			for (; r !== i && r.parent !== null && r.parent.f & 33554432;) r = r.parent;
			let o = () => {
				s && Qr(n(...s), e) && t(null, ...s);
			}, c = r.teardown;
			r.teardown = () => {
				o(), c?.();
			};
		};
	}), e;
}
// ui/node_modules/svelte/src/internal/client/reactivity/store.js
var ei = !1;
function ti(e) {
	var t = ei;
	try {
		return ei = !1, [e(), ei];
	} finally {
		ei = t;
	}
}
// ui/node_modules/svelte/src/internal/client/reactivity/props.js
function ni(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ ot(r), J(u)) : (l && (l = !1, c = s ? Jn(r) : r), c);
	let f;
	if (o) {
		var p = oe in e || ce in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = ti(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && Ie(t), f(m)));
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
	var v = !1, y = (n & 1 ? ot : ut)(() => (v = !1, g()));
	o && J(y);
	var b = W;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? J(y) : i && o ? Ut(e) : e;
			return N(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return On && v || b.f & 16384 ? y.v : J(y);
	});
}
// ui/node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
// ui/src/components/HtmlFrame.svelte
var ri = /* @__PURE__ */ X("<iframe class=\"frame svelte-16wjo63\" sandbox=\"allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox\" scrolling=\"no\"></iframe>"), ii = {
	hash: "svelte-16wjo63",
	code: ".frame.svelte-16wjo63 {display:block;width:100%;border:0;background:transparent;color-scheme:normal;}"
};
function ai(e, t) {
	He(t, !0), Pr(e, ii);
	let n = ni(t, "plain", 3, !1), r = ni(t, "remote", 3, !1), i = ni(t, "prose", 3, ""), a = ni(t, "title", 3, "The message"), o = ni(t, "quotes", 3, !0);
	function s() {
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
	let c = /* @__PURE__ */ M(Ut(s()));
	un(() => {
		let e = new MutationObserver(() => N(c, s(), !0));
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
	let l = /* @__PURE__ */ lt(() => J(c).dark), u = /* @__PURE__ */ M(void 0), d = /* @__PURE__ */ M(80);
	function f(e) {
		let t = e.body, n = t.querySelector(".gmail_quote,blockquote[type=cite],.yahoo_quoted,#appendonsend,#divRplyFwdMsg,#mail-editor-reference-message-container,.moz-cite-prefix,div[style*='border-top:solid #E1E1E1'],div[style*='border-top: solid #E1E1E1'],div[style*='border-top:solid #B5C4DF'],.atlas-quote");
		if (!n || !n.parentNode || n.closest("details") || !(t.textContent ?? "").split(n.textContent ?? "")[0].trim()) return;
		let r = n.matches("#appendonsend, #divRplyFwdMsg, .moz-cite-prefix, div[style*='border-top']") || /wrote:\s*$|a écrit\s*:\s*$|escribió:\s*$/i.test(n.previousSibling?.textContent ?? ""), i = [], a = n, o = n.previousElementSibling;
		o && /wrote:\s*$|a écrit\s*:?\s*$|escribió:\s*$|schrieb.*:\s*$/i.test(o.textContent ?? "") && (o.textContent ?? "").length < 300 && (a = o);
		for (let e = a; e && (i.push(e), r || e !== n); e = e.nextSibling);
		let s = e.createElement("details"), c = e.createElement("summary");
		s.className = "atlas-quoted", c.textContent = "···", c.title = "Show the earlier messages", a.parentNode.insertBefore(s, a), s.append(c, ...i);
	}
	function p(e) {
		let t = e.match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?\)/);
		return t ? [
			Number(t[1]),
			Number(t[2]),
			Number(t[3]),
			t[4] === void 0 ? 1 : Number(t[4])
		] : null;
	}
	function m(e, t, n) {
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
	let h = (e, t, n, r) => `hsla(${e.toFixed(0)}, ${(t * 100).toFixed(0)}%, ${(n * 100).toFixed(0)}%, ${r})`;
	function g(e) {
		let t = p(e);
		if (!t || t[3] === 0) return null;
		let [n, r, i] = m(t[0], t[1], t[2]);
		return i < .35 ? null : i > .93 && r < .3 ? J(c).bg : h(n, r * .55, .09 + (1 - i) * .35, t[3]);
	}
	function _(e) {
		let t = p(e);
		if (!t) return null;
		let [n, r, i] = m(t[0], t[1], t[2]);
		return i > .6 ? null : h(n, Math.min(r, .7), .92 - i * .4, t[3]);
	}
	function v(e) {
		let t = e.defaultView;
		if (t) for (let n of Array.from(e.body.querySelectorAll("*"))) {
			if (n instanceof t.HTMLImageElement || n.tagName === "PICTURE" || n.tagName === "VIDEO") continue;
			let e = t.getComputedStyle(n), r = g(e.backgroundColor);
			r && n.style.setProperty("background-color", r, "important");
			let i = _(e.color);
			i && n.style.setProperty("color", i, "important");
			for (let t of [
				"Top",
				"Right",
				"Bottom",
				"Left"
			]) {
				let r = e.getPropertyValue(`border-${t.toLowerCase()}-width`);
				if (r && r !== "0px") {
					let r = _(e.getPropertyValue(`border-${t.toLowerCase()}-color`));
					r && n.style.setProperty(`border-${t.toLowerCase()}-color`, r, "important");
				}
			}
			e.backgroundImage !== "none" && n.style.setProperty("filter", "brightness(.9)"), n.hasAttribute("bgcolor") && n.removeAttribute("bgcolor");
		}
	}
	let y = /* @__PURE__ */ lt(() => {
		let e = r() ? "data: https: http:" : "data:", a = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'${r() ? " https: http:" : ""}; img-src ${e}; font-src data:${r() ? " https:" : ""}; media-src 'none'; form-action 'none'`, o = J(c), s = o.bg, l = o.text, u = n() ? `${i() || "Georgia, serif"}` : "system-ui, -apple-system, 'Segoe UI', sans-serif";
		return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${a}"><base target="_blank"><meta name="color-scheme" content="${o.dark ? "dark" : "light"}">
<style>
html{overflow-y:hidden;background:${s}}
body{margin:0;padding:4px 2px 8px;font:14px/1.55 ${u};color:${l};background:${s};overflow-wrap:anywhere;overflow-x:auto}
img{max-width:100%;height:auto}
img:not([src]),img[src^="http"]:not([data-ok]){min-height:0}
a{color:${o.link};cursor:pointer}
blockquote{margin:.5em 0 .5em .2em;padding-left:.9em;border-left:3px solid ${o.border};color:${o.muted}}
blockquote blockquote{border-left-color:${o.borderStrong}}
.atlas-plain{white-space:normal;font-size:15px;line-height:1.6;max-width:72ch}
.atlas-signature{color:${o.faint};font-size:.92em}
pre.atlas-text{white-space:pre-wrap;font:inherit}
details.atlas-quoted>summary{display:inline-block;cursor:pointer;list-style:none;padding:0 8px;margin:6px 0;border-radius:6px;background:${o.chip};color:${o.muted};font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.1em}
details.atlas-quoted>summary::-webkit-details-marker{display:none}
details.atlas-quoted[open]>summary{margin-bottom:8px}
table{max-width:100%}
mark.atlas-find{background:${o.dark ? "#7a5d00" : "#ffe27a"};color:inherit;border-radius:2px}
mark.atlas-find.cur{background:${o.dark ? "#c77700" : "#ff9f1a"};color:${o.dark ? "#fff" : "#000"}}
</style></head><body>${t.html}</body></html>`;
	});
	function b() {
		let e = J(u)?.contentDocument;
		if (!e?.body) return;
		o() && f(e), J(l) && !n() && v(e);
		let r = () => {
			N(d, Math.max(40, e.documentElement.scrollHeight), !0);
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
			(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && (e.preventDefault(), J(u)?.dispatchEvent(new KeyboardEvent("keydown", {
				key: e.key,
				ctrlKey: e.ctrlKey,
				metaKey: e.metaKey,
				bubbles: !0
			})));
		});
	}
	var x = ri();
	let S;
	$r(x, (e) => N(u, e), () => J(u)), R(() => {
		qr(x, "title", a()), qr(x, "srcdoc", J(y)), S = Hr(x, "", S, { height: `${J(d) ?? ""}px` });
	}), nr("load", x, b), er(x), Z(e, x), Ue();
}
// plugins/beta/freshrss/fr.js
var oi = "user/-/state/com.google/starred", si = "user/-/state/com.google/reading-list", ci = /* @__PURE__ */ X("<b class=\"svelte-14s2hjs\"> </b>"), li = /* @__PURE__ */ X("<div class=\"folder svelte-14s2hjs\"> </div>"), ui = /* @__PURE__ */ X("<button><span class=\"svelte-14s2hjs\"> </span><!></button>"), di = /* @__PURE__ */ X("<!> <!>", 1), fi = /* @__PURE__ */ X("<p class=\"error svelte-14s2hjs\"> </p>"), pi = /* @__PURE__ */ X("<span class=\"star svelte-14s2hjs\" aria-label=\"starred\">★</span>"), mi = /* @__PURE__ */ X("<button><span class=\"title svelte-14s2hjs\"><!> </span> <small class=\"svelte-14s2hjs\"> </small></button>"), hi = /* @__PURE__ */ X("<p class=\"empty svelte-14s2hjs\"> </p>"), gi = /* @__PURE__ */ X("<p class=\"empty svelte-14s2hjs\">Reading FreshRSS…</p>"), _i = /* @__PURE__ */ X("<a class=\"svelte-14s2hjs\"> </a>"), vi = /* @__PURE__ */ X("<button class=\"svelte-14s2hjs\">Open</button>"), yi = /* @__PURE__ */ X("<header class=\"svelte-14s2hjs\"><h2 class=\"svelte-14s2hjs\"><!></h2> <small class=\"svelte-14s2hjs\"> </small> <div class=\"actions svelte-14s2hjs\"><button class=\"svelte-14s2hjs\"> </button> <button class=\"svelte-14s2hjs\"> </button> <button title=\"Make a note of this article\" class=\"svelte-14s2hjs\">Keep</button> <!></div></header> <!>", 1), bi = /* @__PURE__ */ X("<p class=\"empty svelte-14s2hjs\">Choose an article. Keys: j / k next and previous, s star, m read, o open, v keep.</p>"), xi = /* @__PURE__ */ X("<div class=\"fr svelte-14s2hjs\" tabindex=\"0\" role=\"application\" aria-label=\"FreshRSS\"><nav class=\"feeds svelte-14s2hjs\" aria-label=\"Feeds\"><button><span class=\"svelte-14s2hjs\">All articles</span><!></button> <button><span class=\"svelte-14s2hjs\">Starred</span></button> <!></nav> <section class=\"list svelte-14s2hjs\" aria-label=\"Articles\"><div class=\"bar svelte-14s2hjs\"><label class=\"svelte-14s2hjs\"><input type=\"checkbox\"/> Unread only</label> <button class=\"ghost svelte-14s2hjs\" title=\"Read FreshRSS again\">Refresh</button></div> <!> <!> <!></section> <article class=\"reading svelte-14s2hjs\" aria-label=\"Article\"><!></article></div>"), Si = {
	hash: "svelte-14s2hjs",
	code: ".fr.svelte-14s2hjs {display:grid;grid-template-columns:minmax(160px, 220px) minmax(240px, 360px) 1fr;height:100%;min-height:0;background:var(--bg);color:var(--text);font-family:var(--font-ui);font-size:calc(14px * var(--ui-scale, 1));outline:none;}.feeds.svelte-14s2hjs, .list.svelte-14s2hjs, .reading.svelte-14s2hjs {min-height:0;overflow-y:auto;}.feeds.svelte-14s2hjs {border-right:1px solid var(--border);padding:8px 6px;background:var(--bg-alt, var(--bg));}.list.svelte-14s2hjs {border-right:1px solid var(--border);}.feed.svelte-14s2hjs {display:flex;width:100%;gap:6px;align-items:center;padding:4px 8px;border:0;border-radius:6px;background:none;color:var(--text);font:inherit;text-align:left;cursor:pointer;}.feed.svelte-14s2hjs span:where(.svelte-14s2hjs) {flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.feed.svelte-14s2hjs b:where(.svelte-14s2hjs) {font-weight:600;font-size:.85em;color:var(--text-muted);font-variant-numeric:tabular-nums;}.feed.svelte-14s2hjs:hover {background:var(--bg-hover, var(--bg));}.feed.on.svelte-14s2hjs {background:var(--accent-soft, var(--bg-hover));color:var(--heading, var(--text));}.folder.svelte-14s2hjs {margin:10px 8px 2px;color:var(--text-faint);font-size:.8em;text-transform:uppercase;letter-spacing:.04em;}.bar.svelte-14s2hjs {position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--border);background:var(--bg);color:var(--text-muted);font-size:.9em;}.bar.svelte-14s2hjs label:where(.svelte-14s2hjs) {display:flex;gap:5px;align-items:center;cursor:pointer;}.item.svelte-14s2hjs {display:flex;flex-direction:column;gap:2px;width:100%;padding:8px 12px;border:0;border-bottom:1px solid var(--border);background:none;color:var(--text-muted);font:inherit;text-align:left;cursor:pointer;}.item.svelte-14s2hjs .title:where(.svelte-14s2hjs) {color:var(--text);line-height:1.35;}.item.unread.svelte-14s2hjs .title:where(.svelte-14s2hjs) {font-weight:600;color:var(--heading, var(--text));}.item.svelte-14s2hjs small:where(.svelte-14s2hjs) {color:var(--text-faint);font-size:.82em;}.item.svelte-14s2hjs:hover {background:var(--bg-hover, var(--bg));}.item.on.svelte-14s2hjs {background:var(--accent-soft, var(--bg-hover));}.star.svelte-14s2hjs {color:var(--yellow, #c9a227);margin-right:4px;}.reading.svelte-14s2hjs {padding:16px 24px 32px;}.reading.svelte-14s2hjs header:where(.svelte-14s2hjs) {max-width:760px;margin-bottom:12px;}.reading.svelte-14s2hjs h2:where(.svelte-14s2hjs) {margin:0 0 4px;font-size:1.35em;line-height:1.3;color:var(--heading, var(--text));}.reading.svelte-14s2hjs h2:where(.svelte-14s2hjs) a:where(.svelte-14s2hjs) {color:inherit;text-decoration:none;}.reading.svelte-14s2hjs h2:where(.svelte-14s2hjs) a:where(.svelte-14s2hjs):hover {text-decoration:underline;}.reading.svelte-14s2hjs small:where(.svelte-14s2hjs) {color:var(--text-faint);}.actions.svelte-14s2hjs {display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;}.actions.svelte-14s2hjs button:where(.svelte-14s2hjs), .ghost.svelte-14s2hjs {padding:3px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font:inherit;font-size:.9em;cursor:pointer;}.actions.svelte-14s2hjs button:where(.svelte-14s2hjs):hover, .ghost.svelte-14s2hjs:hover {border-color:var(--border-strong, var(--border));}.reading.svelte-14s2hjs .frame {max-width:760px;}.empty.svelte-14s2hjs {padding:16px;color:var(--text-faint);}.error.svelte-14s2hjs {padding:10px 12px;color:var(--red);}"
};
function Ci(e, t) {
	He(t, !0), Pr(e, Si);
	let n = /* @__PURE__ */ lt(() => t.atlas), r = /* @__PURE__ */ M(Ut([])), i = /* @__PURE__ */ M(0), a = /* @__PURE__ */ M(Ut(si)), o = /* @__PURE__ */ M(!0), s = /* @__PURE__ */ M(Ut([])), c = /* @__PURE__ */ M(""), l = /* @__PURE__ */ M(null), u = /* @__PURE__ */ M(""), d = /* @__PURE__ */ M(!1), f = /* @__PURE__ */ M(void 0), p = /* @__PURE__ */ lt(() => J(n).plugin.settings?.remote_images !== !1), h = (e, t = {}) => J(n).helper.call(e, t, { timeout: 60 }), g = (e) => e ? new Date(e).toLocaleString(void 0, {
		dateStyle: "medium",
		timeStyle: "short"
	}) : "", _ = /* @__PURE__ */ lt(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t of J(r)) e.set(t.folder, [...e.get(t.folder) ?? [], t]);
		return [...e.entries()];
	});
	async function v() {
		try {
			let e = await h("feeds");
			N(r, e.feeds, !0), N(i, e.unread, !0), N(u, "");
		} catch (e) {
			N(u, String(e?.message ?? e), !0);
		}
	}
	async function y(e = !1) {
		if (!J(d)) {
			N(d, !0);
			try {
				let t = await h("articles", {
					stream: J(a),
					unread: J(o) && J(a) !== "user/-/state/com.google/starred",
					more: e ? J(c) : ""
				});
				N(s, e ? [...J(s), ...t.articles] : t.articles, !0), N(c, t.more, !0), N(u, "");
			} catch (e) {
				N(u, String(e?.message ?? e), !0);
			} finally {
				N(d, !1);
			}
		}
	}
	function b(e) {
		N(a, e, !0), N(l, null), y();
	}
	async function x(e, t) {
		let a = {
			read: e.read,
			starred: e.starred
		};
		t === "read" || t === "unread" ? e.read = t === "read" : e.starred = t === "star";
		let o = J(r).find((t) => t.id === e.feedId), s = t === "read" && !a.read ? -1 : t === "unread" && a.read ? 1 : 0;
		o && (o.unread = Math.max(0, o.unread + s)), N(i, Math.max(0, J(i) + s), !0);
		try {
			await h("mark", {
				ids: [e.id],
				mark: t
			});
		} catch (t) {
			e.read = a.read, e.starred = a.starred, o && (o.unread = Math.max(0, o.unread - s)), N(i, Math.max(0, J(i) - s), !0), J(n).toast?.("FreshRSS", `Not marked: ${String(t?.message ?? t)}`, "error");
		}
	}
	function S(e) {
		N(l, e, !0), e.read || x(e, "read");
	}
	async function ee(e) {
		try {
			let t = await h("save", { id: e.id });
			t.made || J(n).toast?.("FreshRSS", `${t.path} is already there`), J(n).open(t.path, void 0, { beside: !0 });
		} catch (e) {
			J(n).toast?.("FreshRSS: not kept", String(e?.message ?? e), "error");
		}
	}
	let te = (e) => {
		e.url && J(n).openLink?.(e.url);
	};
	function ne(e) {
		if (!J(s).length) return;
		let t = J(l) ? J(s).findIndex((e) => e.id === J(l).id) : -1, n = J(s)[Math.min(J(s).length - 1, Math.max(0, t + e))];
		n && (S(n), J(f)?.querySelector(`[data-id="${CSS.escape(n.id)}"]`)?.scrollIntoView({ block: "nearest" }));
	}
	function re(e) {
		if (e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.("input, textarea, select")) return;
		let t = J(l), n = {
			j: () => ne(1),
			k: () => ne(-1),
			s: () => t && void x(t, t.starred ? "unstar" : "star"),
			m: () => t && void x(t, t.read ? "unread" : "read"),
			o: () => t && te(t),
			v: () => t && void ee(t)
		}[e.key];
		n && (e.preventDefault(), n());
	}
	function ie(e) {
		let t = e.currentTarget;
		J(c) && !J(d) && t.scrollTop + t.clientHeight > t.scrollHeight - 300 && y(!0);
	}
	un(() => {
		String(J(n).plugin.settings?.server ?? "").trim() ? (v(), y()) : N(u, "Set the FreshRSS address and your API password in Settings → Plugins → FreshRSS.");
	});
	var ae = xi(), oe = F(ae), se = F(oe);
	let ce;
	var le = L(F(se)), ue = (e) => {
		var t = ci(), n = I(t, !0);
		R(() => Q(n, J(i))), Z(e, t);
	};
	$(le, (e) => {
		J(i) && e(ue);
	}), D(se);
	var de = L(se, 2);
	let fe;
	Or(L(de, 2), 17, () => J(_), ([e, t]) => e, (e, t) => {
		var n = /* @__PURE__ */ lt(() => m(J(t), 2));
		let r = () => J(n)[0], i = () => J(n)[1];
		var o = di(), s = Zt(o), c = (e) => {
			var t = li(), n = I(t, !0);
			R(() => Q(n, r())), Z(e, t);
		};
		$(s, (e) => {
			r() && e(c);
		}), Or(L(s, 2), 17, i, (e) => e.id, (e, t) => {
			var n = ui();
			let r;
			var i = F(n), o = I(i, !0), s = L(i), c = (e) => {
				var n = ci(), r = I(n, !0);
				R(() => Q(r, J(t).unread)), Z(e, n);
			};
			$(s, (e) => {
				J(t).unread && e(c);
			}), D(n), R(() => {
				r = Br(n, 1, "feed svelte-14s2hjs", null, r, { on: J(a) === J(t).id }), qr(n, "title", J(t).title), Q(o, J(t).title);
			}), Y("click", n, () => b(J(t).id)), Z(e, n);
		}), Z(e, o);
	}), D(oe);
	var pe = L(oe, 2), me = F(pe), he = F(me), ge = F(he);
	Kr(ge), we(), D(he);
	var _e = L(he, 2);
	D(me);
	var C = L(me, 2), ve = (e) => {
		var t = fi(), n = I(t, !0);
		R(() => Q(n, J(u))), Z(e, t);
	};
	$(C, (e) => {
		J(u) && e(ve);
	});
	var ye = L(C, 2);
	Or(ye, 17, () => J(s), (e) => e.id, (e, t) => {
		var n = mi();
		let r;
		var i = F(n), a = F(i), o = (e) => {
			Z(e, pi());
		};
		$(a, (e) => {
			J(t).starred && e(o);
		});
		var s = L(a, 1, !0);
		D(i);
		var c = I(L(i, 2));
		D(n), R((e) => {
			r = Br(n, 1, "item svelte-14s2hjs", null, r, {
				unread: !J(t).read,
				on: J(l)?.id === J(t).id
			}), qr(n, "data-id", J(t).id), Q(s, J(t).title), Q(c, `${J(t).feed ?? ""}${e ?? ""}`);
		}, [() => J(t).published ? ` · ${g(J(t).published)}` : ""]), Y("click", n, () => S(J(t))), Z(e, n);
	}, (e) => {
		var t = fr(), n = Zt(t), r = (e) => {
			var t = hi(), n = I(t, !0);
			R(() => Q(n, J(o) ? "Nothing unread here." : "No articles here.")), Z(e, t);
		};
		$(n, (e) => {
			!J(u) && !J(d) && e(r);
		}), Z(e, t);
	});
	var be = L(ye, 2), xe = (e) => {
		Z(e, gi());
	};
	$(be, (e) => {
		J(d) && e(xe);
	}), D(pe);
	var w = L(pe, 2), Se = F(w), T = (e) => {
		let t = /* @__PURE__ */ lt(() => J(l));
		var r = yi(), i = Zt(r), a = F(i), o = F(a), s = (e) => {
			var n = _i(), r = I(n, !0);
			R(() => {
				qr(n, "href", J(t).url), Q(r, J(t).title);
			}), Y("click", n, (e) => {
				e.preventDefault(), te(J(t));
			}), Z(e, n);
		}, c = (e) => {
			var n = dr();
			R(() => Q(n, J(t).title)), Z(e, n);
		};
		$(o, (e) => {
			J(t).url ? e(s) : e(c, -1);
		}), D(a);
		var u = L(a, 2), d = I(u, !0), f = L(u, 2), m = F(f), h = I(m, !0), _ = L(m, 2), v = I(_, !0), y = L(_, 2), b = L(y, 2), S = (e) => {
			var n = vi();
			Y("click", n, () => te(J(t))), Z(e, n);
		};
		$(b, (e) => {
			J(t).url && e(S);
		}), D(f), D(i), wr(L(i, 2), () => J(t).id, (e) => {
			ai(e, {
				get html() {
					return J(t).html;
				},
				get remote() {
					return J(p);
				},
				quotes: !1,
				get title() {
					return J(t).title;
				},
				get atlas() {
					return J(n);
				}
			});
		}), R((e) => {
			Q(d, e), Q(h, J(t).starred ? "Unstar" : "Star"), Q(v, J(t).read ? "Mark unread" : "Mark read");
		}, [() => [
			J(t).feed,
			J(t).author,
			g(J(t).published)
		].filter(Boolean).join(" · ")]), Y("click", m, () => x(J(t), J(t).starred ? "unstar" : "star")), Y("click", _, () => x(J(t), J(t).read ? "unread" : "read")), Y("click", y, () => ee(J(t))), Z(e, r);
	}, E = (e) => {
		Z(e, bi());
	};
	$(Se, (e) => {
		J(l) ? e(T) : e(E, -1);
	}), D(w), D(ae), $r(ae, (e) => N(f, e), () => J(f)), R(() => {
		ce = Br(se, 1, "feed svelte-14s2hjs", null, ce, { on: J(a) === si }), fe = Br(de, 1, "feed svelte-14s2hjs", null, fe, { on: J(a) === oi }), ge.disabled = J(a) === oi;
	}), Y("keydown", ae, re), Y("click", se, () => b(si)), Y("click", de, () => b(oi)), nr("scroll", pe, ie), Y("change", ge, () => y()), Zr(ge, () => J(o), (e) => N(o, e)), Y("click", _e, () => {
		v(), y();
	}), Z(e, ae), Ue();
}
rr([
	"keydown",
	"click",
	"change"
]);
// plugins/beta/freshrss/ui/src/view.ts
function wi(e, t) {
	let n = _r(Ci, {
		target: e,
		props: { atlas: t }
	});
	return () => xr(n);
}
export { wi as default };
