// plugins/beta/freshrss/ui/src/main.ts
var e = (e, t, n) => {
	let r = document.createElement(e);
	return t && (r.style.cssText = t), n !== void 0 && (r.textContent = n), r;
};
function t(t) {
	t.registerCommand({
		id: "read",
		title: "FreshRSS: read",
		run: () => t.openView("reader", {
			title: "FreshRSS",
			icon: "globe"
		})
	});
	async function n(e) {
		try {
			let n = await t.helper.call("save", { id: e.id });
			n.made || t.toast("FreshRSS", `${n.path} is already there`), t.open(n.path);
		} catch (e) {
			t.toast("FreshRSS: not saved", String(e?.message ?? e), "error");
		}
	}
	t.registerBlock("freshrss.unread", (r, i) => {
		let a = !1;
		return String(t.plugin.settings.server ?? "").trim() ? (r.replaceChildren(e("p", "color: var(--text-faint)", "Reading FreshRSS…")), (async () => {
			try {
				let o = await t.helper.call("unread", { limit: Number(i.options.limit ?? 15) });
				if (a) return;
				let s = e("ul", "list-style: none; margin: 0; padding: 4px 0");
				for (let t of o) {
					let r = e("li", "display: flex; gap: 8px; align-items: baseline; padding: 2px 0"), i = e("a", "color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap", t.title);
					i.href = t.url ?? "#", i.target = "_blank";
					let a = e("span", "color: var(--text-faint); flex: none; font-size: .85em", t.feed), o = e("button", "color: var(--accent); flex: none", "Save");
					o.title = "Make a note of this article", o.onclick = () => void n(t), r.append(i, a, o), s.append(r);
				}
				let c = e("button", "color: var(--accent); margin-top: 4px", "Open the reader");
				c.onclick = () => t.openView("reader", {
					title: "FreshRSS",
					icon: "globe"
				}), r.replaceChildren(o.length ? s : e("p", "color: var(--text-faint)", "Nothing unread."), c);
			} catch (t) {
				a || r.replaceChildren(e("p", "color: var(--red)", String(t?.message ?? t)));
			}
		})(), () => {
			a = !0;
		}) : (r.replaceChildren(e("p", "color: var(--text-faint)", "Set the FreshRSS server in Settings → Plugins → FreshRSS.")), () => {});
	}, {
		title: "FreshRSS unread",
		options: [{
			key: "limit",
			label: "At most",
			kind: "number"
		}]
	});
}
export { t as register };
