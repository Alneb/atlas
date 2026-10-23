<script lang="ts">
  // Settings → Accounts (DESIGN-plugin-settings-v2.md §2): every account any plugin keeps (mail, calendars, banks…)
  // as one list — its status from the plugin, a click opens it in place with Test, its plugin's buttons (Sign in) and
  // its own Save. Add offers each plugin's presets (Gmail, Outlook…). `only`: one plugin's (its page in Settings).
  import { onMount } from "svelte";
  import Icon from "../Icon.svelte";
  import FormFields from "../FormFields.svelte";
  import SigninsPanel from "./SigninsPanel.svelte";
  import { applies, newCard, secretHint, type Card, type OptionField, type RecordsField } from "../../lib/block-options";
  import { accountLists, cardsOf, recordsField, refreshStatus, saveCards, statusOf, summaryOf, testAccount, type AccountList } from "../../lib/accounts.svelte";
  import { runPluginCommand } from "../../lib/plugins.svelte";
  import { isIconName } from "../../lib/icons";
  import { isOff } from "../../lib/plugin-manage";
  import { settingsNav, pluginPageId } from "../../lib/settings-nav.svelte";

  let { only }: { only?: string } = $props();

  const lists = $derived(accountLists(only));
  // the records field of each list, with its secrets' names (asked once per plugin reload)
  let forms = $state<Record<string, RecordsField>>({});
  const keyOf = (l: AccountList) => `${l.plugin.id}/${l.setting.key}`;
  $effect(() => { for (const l of lists) void recordsField(l).then((f) => (forms[keyOf(l)] = f)); });
  onMount(() => { for (const l of accountLists(only)) void refreshStatus(l); });

  // the card open for editing: which list, its form copy, and whether it is new
  let editing = $state<{ key: string; card: Card; fresh: boolean } | null>(null);
  let busy = $state<"" | "save" | "test">("");
  let tested = $state<{ ok: boolean; text: string } | null>(null);
  let confirmRemove = $state(false);
  let adding = $state(false);

  const nameOf = (f: RecordsField, c: Card) => String(c.values[f.name] ?? "").trim();
  function open(l: AccountList, c: Card) {
    if (editing?.card.id === c.id) { editing = null; return; }
    editing = { key: keyOf(l), card: structuredClone($state.snapshot(c)) as Card, fresh: false };
    tested = null; confirmRemove = false;
  }
  function add(l: AccountList, values: Record<string, unknown> = {}) {
    const f = forms[keyOf(l)];
    if (!f) return;
    const c = newCard(f);
    for (const [k, v] of Object.entries(values)) if (k in c.values) c.values[k] = typeof v === "boolean" ? v : String(v);
    editing = { key: keyOf(l), card: c, fresh: true };
    tested = null; adding = false;
  }
  // the card's fields, its secrets told as set or not (under the saved name)
  function fieldsOf(f: RecordsField, c: Card): OptionField[] {
    const set = c.saved ? (f.secretsOf?.(c.was ?? nameOf(f, c)) ?? []) : [];
    return f.fields.map((s) => s.kind === "secret" ? { ...s, isSet: set.includes(s.key), hint: secretHint(set.includes(s.key), s.readonly, s.hint) } : s);
  }
  const record = (f: RecordsField, c: Card) => Object.fromEntries(f.fields.filter((s) => applies(s, c.values, f.fields)).map((s) => [s.key, c.values[s.key]]));

  async function save(l: AccountList) {
    const f = forms[keyOf(l)];
    if (!f || !editing) return;
    busy = "save";
    const all = cardsOf(f, l);
    const i = all.findIndex((c) => c.saved && c.was === editing!.card.was);
    if (editing.fresh || i < 0) all.push(editing.card); else all[i] = editing.card;
    if (await saveCards(l, f, all)) editing = null;
    busy = "";
  }
  async function remove(l: AccountList) {
    const f = forms[keyOf(l)];
    if (!f || !editing) return;
    busy = "save";
    if (await saveCards(l, f, cardsOf(f, l).filter((c) => c.was !== editing!.card.was))) editing = null;
    busy = ""; confirmRemove = false;
  }
  async function makeMain(l: AccountList, c: Card) {
    const f = forms[keyOf(l)];
    if (!f) return;
    const all = cardsOf(f, l).filter((x) => x.was !== c.was);
    await saveCards(l, f, [c, ...all]);
  }
  async function test(l: AccountList) {
    const f = forms[keyOf(l)];
    if (!f || !editing) return;
    busy = "test"; tested = null;
    tested = await testAccount(l, record(f, editing.card));
    busy = "";
  }
  // a plugin's own button on the card (Sign in): the card must be saved first, so its command sees it
  async function action(l: AccountList, command: string) {
    if (editing && (editing.fresh || JSON.stringify(editing.card) !== JSON.stringify(cardsOf(forms[keyOf(l)], l).find((c) => c.was === editing!.card.was)))) await save(l);
    const f = forms[keyOf(l)];
    const name = editing ? nameOf(f, editing.card) : "";
    await runPluginCommand(l.plugin.id, command, { setting: l.setting.key, record: name });
    void refreshStatus(l);
  }

  // a colour per account from its name: the avatar
  const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const iconOf = (l: AccountList) => (isIconName(l.plugin.icon ?? "") ? l.plugin.icon : "plugin") as Parameters<typeof Icon>[1]["name"];
  const total = $derived(lists.reduce((n, l) => n + (forms[keyOf(l)] ? cardsOf(forms[keyOf(l)], l).length : 0), 0));
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && adding) adding = false; }} onclick={(e) => { if (adding && !(e.target as HTMLElement).closest?.(".addwrap")) adding = false; }} />

<div class="accounts" class:embedded={!!only}>
  {#if !only}
    <header class="top">
      <div class="tile"><Icon name="user" size={22} /></div>
      <div class="what">
        <h2>Accounts</h2>
        <p>Every account your plugins sign in to — mail, calendars, banks, servers — in one place. Click one to change it, test it before saving, or sign in again.</p>
      </div>
      <div class="addwrap">
        <button class="btn primary" onclick={() => (adding = !adding)} aria-expanded={adding}><Icon name="plus" size={13} /> Add account</button>
        {#if adding}
          <div class="menu" role="menu">
            {#each lists as l (keyOf(l))}
              <p class="mh"><Icon name={iconOf(l)} size={13} /> {l.spec.kind} <span>· {l.plugin.title}</span></p>
              {#each l.spec.presets as pr (pr.label)}
                <button role="menuitem" onclick={() => add(l, pr.values)}><b>{pr.label}</b>{#if pr.hint}<span>{pr.hint}</span>{/if}</button>
              {/each}
              <button role="menuitem" onclick={() => add(l)}><b>{l.spec.presets.length ? "Other…" : `${l.spec.kind} account`}</b></button>
            {:else}<p class="mh">No plugin keeps accounts.</p>{/each}
          </div>
        {/if}
      </div>
    </header>
  {/if}

  {#each lists as l (keyOf(l))}
    {@const f = forms[keyOf(l)]}
    <section class="list" data-accounts={keyOf(l)}>
      <h3>
        <Icon name={iconOf(l)} size={14} /> {l.spec.kind}
        {#if !only}<button class="from" onclick={() => (settingsNav.want = pluginPageId(l.plugin.id))}>{l.plugin.title}{isOff(l.plugin.id) ? " (off)" : ""}</button>{/if}
        <span class="sp"></span>
        {#if only}<button class="link" onclick={() => add(l)}><Icon name="plus" size={12} /> {f?.add ?? "Add"}</button>{/if}
      </h3>
      <div class="rows">
        {#each f ? cardsOf(f, l) : [] as c, i (c.was)}
          {@const name = nameOf(f, c)}
          {@const st = statusOf(l, name)}
          {@const open_ = editing?.key === keyOf(l) && !editing.fresh && editing.card.was === c.was}
          <div class="acct" class:open={open_}>
            <button class="row" onclick={() => open(l, c)} aria-expanded={open_}>
              <span class="avatar" style="--h:{hue(name)}">{name.slice(0, 1).toUpperCase()}</span>
              <span class="who"><b>{name}</b>{#if i === 0 && cardsOf(f, l).length > 1}<i class="main">main</i>{/if}
                <span class="sum">{summaryOf(l.spec, Object.fromEntries(Object.entries(c.values).map(([k, v]) => [k, typeof v === "string" ? v : ""])))}</span></span>
              {#if st}<span class="pill {st.state}" title={st.text}><span class="dot"></span>{st.text}</span>{/if}
              <span class="chev"><Icon name="chevron-down" size={14} /></span>
            </button>
            {#if open_ && editing}
              {@render editor(l, f, i)}
            {/if}
          </div>
        {:else}
          {#if !(editing?.fresh && editing.key === keyOf(l))}<p class="none">No {l.spec.kind.toLowerCase()} account yet. <button class="link" onclick={() => add(l)}>Add one</button></p>{/if}
        {/each}
        {#if editing?.fresh && editing.key === keyOf(l) && f}
          <div class="acct open fresh">
            <div class="row static"><span class="avatar" style="--h:{hue(nameOf(f, editing.card) || "?")}">+</span><span class="who"><b>{nameOf(f, editing.card) || `New ${l.spec.kind.toLowerCase()} account`}</b></span></div>
            {@render editor(l, f, -1)}
          </div>
        {/if}
      </div>
    </section>
  {/each}

  {#if !only}
    <section class="list"><SigninsPanel /></section>
    {#if !lists.length}<p class="none">No plugin here keeps accounts yet. A plugin opts in with <code>account = {"{ kind = \"Mail\" }"}</code> on a records setting (PLUGIN-API.md, “Accounts”).</p>{/if}
    <p class="foot">{total} account{total === 1 ? "" : "s"} · passwords and sign-ins are kept outside the vault, never in a file.</p>
  {/if}
</div>

{#snippet editor(l: AccountList, f: RecordsField, i: number)}
  {@const acts = f.actions.filter((a) => editing && applies(a, editing.card.values, f.fields))}
  <form class="edit" onsubmit={(e) => { e.preventDefault(); void save(l); }}>
    {#if editing}<FormFields fields={fieldsOf(f, editing.card)} bind:values={editing.card.values} compact />{/if}
    {#if tested}<p class="tested" class:ok={tested.ok} role="status"><Icon name={tested.ok ? "check" : "warning"} size={13} /> {tested.text}</p>{/if}
    {#if confirmRemove}
      <div class="confirm" role="alert"><span>Remove this account? Its passwords and sign-in are forgotten.</span>
        <button type="button" class="btn danger" disabled={!!busy} onclick={() => void remove(l)}>Remove</button>
        <button type="button" class="btn" onclick={() => (confirmRemove = false)}>Keep</button></div>
    {/if}
    <div class="bar">
      {#if l.spec.test}<button type="button" class="btn" disabled={!!busy} onclick={() => void test(l)}>{busy === "test" ? "Testing…" : "Test"}</button>{/if}
      {#each acts as a (a.command + a.label)}<button type="button" class="btn" disabled={!!busy} onclick={() => void action(l, a.command)}>{a.label}</button>{/each}
      {#if i > 0 && editing}<button type="button" class="btn quiet" onclick={() => editing && void makeMain(l, editing.card)}>Make main</button>{/if}
      <span class="sp"></span>
      {#if editing && !editing.fresh}<button type="button" class="btn quiet danger" onclick={() => (confirmRemove = true)}>Remove</button>{/if}
      <button type="button" class="btn" onclick={() => (editing = null)}>Cancel</button>
      <button class="btn primary" disabled={!!busy || !editing || !nameOf(f, editing.card)}>{busy === "save" ? "Saving…" : editing?.fresh ? "Add" : "Save"}</button>
    </div>
  </form>
{/snippet}

<style>
  .accounts { display: flex; flex-direction: column; gap: 18px; }
  .top { display: flex; gap: 14px; align-items: flex-start; }
  .tile { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 11px; color: #fff; background: linear-gradient(160deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000)); }
  .what { flex: 1; min-width: 0; }
  h2 { margin: 0; font-size: calc(22px * var(--ui-scale, 1)); color: var(--heading); letter-spacing: -.015em; }
  .what p { margin: 4px 0 0; color: var(--text-muted); line-height: 1.45; }
  .addwrap { position: relative; flex: none; }
  .menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 5; width: 290px; max-height: 60vh; overflow-y: auto; padding: 6px; border: 1px solid var(--border-strong); border-radius: 10px; background: var(--bg-elev); box-shadow: 0 12px 32px rgb(0 0 0 / .28); }
  .mh { display: flex; gap: 6px; align-items: center; margin: 8px 8px 4px; font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-faint); }
  .mh span { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .menu button { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; padding: 6px 10px; border-radius: 6px; text-align: left; color: var(--text); }
  .menu button:hover { background: var(--accent-soft); }
  .menu button span { color: var(--text-muted); font-size: calc(12px * var(--ui-scale, 1)); }
  h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: calc(11px * var(--ui-scale, 1)); font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--text-muted); }
  .from { text-transform: none; letter-spacing: 0; font-weight: 400; color: var(--text-faint); }
  .from:hover { color: var(--accent); }
  .sp { flex: 1; }
  .link { display: inline-flex; gap: 4px; align-items: center; color: var(--accent); text-transform: none; letter-spacing: 0; font-weight: 500; }
  .rows { border: 1px solid var(--border); border-radius: 12px; background: var(--bg); overflow: hidden; }
  .acct + .acct { border-top: 1px solid var(--border); }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 14px; text-align: left; }
  button.row:hover { background: var(--bg-hover); }
  .avatar { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; font-weight: 700; color: #fff; background: hsl(var(--h) 55% 48%); }
  .who { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
  .who b { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-weight: 600; }
  .main { font-style: normal; font-size: calc(10.5px * var(--ui-scale, 1)); color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 0 6px; }
  .sum { flex-basis: 100%; color: var(--text-muted); font-size: calc(12.5px * var(--ui-scale, 1)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill { flex: none; display: inline-flex; align-items: center; gap: 6px; max-width: 45%; padding: 2px 10px; border-radius: 999px; font-size: calc(12px * var(--ui-scale, 1)); background: var(--bg-alt); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--text-faint); }
  .pill.ok .dot { background: var(--green, #3fb950); } .pill.warn .dot { background: var(--yellow, #d29922); }
  .pill.error { color: var(--red); } .pill.error .dot { background: var(--red); }
  .pill.busy .dot { background: var(--accent); animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .3; } }
  .chev { flex: none; color: var(--text-faint); transition: transform .15s; }
  .open .chev { transform: rotate(180deg); }
  .acct.open { background: var(--bg-alt); }
  .edit { display: flex; flex-direction: column; gap: 12px; padding: 4px 16px 14px 58px; }
  .tested { display: flex; gap: 6px; align-items: center; margin: 0; color: var(--red); }
  .tested.ok { color: var(--green, #3fb950); }
  .confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--text); }
  .confirm span { flex: 1; min-width: 14em; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .btn { display: inline-flex; gap: 6px; align-items: center; padding: 5px 12px; border: 1px solid var(--border-strong); border-radius: 7px; color: var(--text); background: var(--bg); }
  .btn:hover:not(:disabled) { background: var(--bg-hover); }
  .btn:disabled { opacity: .55; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
  .btn.quiet { border-color: transparent; background: none; color: var(--text-muted); }
  .btn.danger { color: var(--red); }
  .btn.danger:not(.quiet) { border-color: var(--red); }
  .none { margin: 0; padding: 12px 14px; color: var(--text-muted); }
  .foot { margin: 0; color: var(--text-faint); font-size: calc(12px * var(--ui-scale, 1)); }
  .list :global(.settings-panel) { border-radius: 12px; }
  .embedded { gap: 12px; }
  /* a phone: the state as its dot alone (the words in its tooltip), so the name keeps the width */
  @media (max-width: 640px) { .edit { padding-left: 16px; } .pill { padding: 6px; font-size: 0; gap: 0; } .top { flex-wrap: wrap; } }
</style>
