<script lang="ts">
  // An invitation above a message: its times in the user's own hour (the organiser's beside them when the zone
  // differs), the answer given, Accept / Maybe / Decline (an iTIP reply, then the Calendar plugin files it), and
  // whether the calendar has it and what overlaps it.
  import type { Mail } from "./store.svelte";
  import type { Invite, InviteStatus } from "./api";
  import Icon from "./Icon.svelte";

  let { mail, id, invite }: { mail: Mail; id: number; invite: Invite } = $props();

  let status = $state<InviteStatus | null>(null);
  let answer = $state<string | null>(null);
  let busy = $state(false);
  const given = $derived(answer ?? invite.answer);

  $effect(() => {
    const want = id;
    status = null;
    mail.call<InviteStatus | null>("invite_status", { id: want }).then((s) => { if (want === id) status = s; }).catch(() => {});
  });

  const day = (s: string) => new Date(`${s}T00:00:00`);
  const at = (s: string) => (s.length > 10 ? new Date(s) : day(s));
  const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  const fmtTime = (d: Date, zone?: string) => d.toLocaleTimeString(undefined, { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone: zone });
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  // "Tue 27 Oct · 15:00 – 16:00", a whole day or several, and the organiser's own hour when their zone is not ours
  const when = $derived.by(() => {
    if (!invite.start) return "";
    const s = at(invite.start), e = invite.end ? at(invite.end) : null;
    if (invite.all_day) {
      const last = e ? new Date(e.getTime() - 86400000) : s;
      return sameDay(s, last) ? `${fmtDay(s)} · all day` : `${fmtDay(s)} – ${fmtDay(last)}`;
    }
    const range = e ? (sameDay(s, e) ? `${fmtTime(s)} – ${fmtTime(e)}` : `${fmtTime(s)} – ${fmtDay(e)} ${fmtTime(e)}`) : fmtTime(s);
    return `${fmtDay(s)} · ${range}`;
  });
  const theirs = $derived.by(() => {
    if (!invite.zone || invite.all_day || !invite.start) return "";
    try {
      const city = invite.zone.split("/").pop()!.replace(/_/g, " ");
      return `${fmtTime(at(invite.start), invite.zone)} in ${city}`;
    } catch { return ""; }
  });
  const repeats = $derived.by(() => {
    const f = /FREQ=(\w+)/.exec(invite.repeats)?.[1];
    return f ? ({ DAILY: "every day", WEEKLY: "every week", MONTHLY: "every month", YEARLY: "every year" } as Record<string, string>)[f] ?? "repeats" : "";
  });
  const label = (p: string) => ({ ACCEPTED: "You accepted", TENTATIVE: "You said maybe", DECLINED: "You declined" } as Record<string, string>)[p] ?? "";
  const canAnswer = $derived(invite.method === "REQUEST" && !invite.mine);

  async function reply(partstat: "ACCEPTED" | "TENTATIVE" | "DECLINED") {
    busy = true;
    try {
      const r = await mail.call<{ calendar: { status?: string } | null; calendar_error?: string }>("answer_invite", { id, partstat });
      answer = partstat;
      const filed = r.calendar ? " · in your calendar" : r.calendar_error && partstat !== "DECLINED" ? " · not filed in a calendar" : "";
      mail.toast(`${label(partstat)}${filed}`, "success");
      if (r.calendar) status = { ...(status ?? { conflicts: [] }), in_calendar: true } as InviteStatus;
    } catch (e) {
      mail.toast(`Could not answer: ${(e as Error).message}`, "error");
    } finally { busy = false; }
  }
</script>

<div class="invite" class:cancelled={invite.method === "CANCEL"}>
  <Icon name="calendar" size={22} />
  <div class="what">
    <b>{invite.method === "CANCEL" ? "Cancelled: " : ""}{invite.summary || "An invitation"}</b>
    <span>{when}{#if repeats}<span class="faint"> · {repeats}</span>{/if}</span>
    {#if theirs}<span class="faint">{theirs}</span>{/if}
    {#if invite.location}<span>{invite.location}</span>{/if}
    {#if invite.organizer}<span class="faint">from {invite.organizer}{invite.attendees.length > 1 ? ` · ${invite.attendees.length} invited` : ""}</span>{/if}
    {#if status}
      <span class="state">
        {#if status.in_calendar}<span class="ok"><Icon name="check" size={13} /> In your calendar</span>{/if}
        {#each status.conflicts.slice(0, 2) as c (c.summary + c.start)}
          <span class="clash">Overlaps {c.summary} ({fmtTime(at(c.start))})</span>
        {/each}
      </span>
    {/if}
  </div>
  {#if canAnswer}
    <div class="answer" role="group" aria-label="Answer the invitation">
      {#if given}<span class="given">{label(given)}</span>{/if}
      <button class:on={given === "ACCEPTED"} disabled={busy} onclick={() => reply("ACCEPTED")}>Accept</button>
      <button class:on={given === "TENTATIVE"} disabled={busy} onclick={() => reply("TENTATIVE")}>Maybe</button>
      <button class:on={given === "DECLINED"} disabled={busy} onclick={() => reply("DECLINED")}>Decline</button>
    </div>
  {/if}
</div>

<style>
  .invite { display: flex; flex-wrap: wrap; gap: 10px 12px; align-items: flex-start; padding: 10px 12px; margin-bottom: 10px; border-radius: var(--radius); border: 1px solid var(--border-strong); background: var(--accent-soft); }
  .invite.cancelled b { text-decoration: line-through; }
  .what { display: grid; gap: 2px; flex: 1 1 220px; min-width: 0; }
  .faint { color: var(--text-muted); }
  .state { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 0.9em; margin-top: 2px; }
  .ok { display: inline-flex; align-items: center; gap: 4px; color: var(--success, var(--text)); }
  .clash { color: var(--warning, var(--text-muted)); }
  .answer { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .given { color: var(--text-muted); font-size: 0.9em; margin-right: 4px; }
  .answer button { padding: 4px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-strong); background: var(--bg); color: var(--text); cursor: pointer; }
  .answer button:hover:not(:disabled) { border-color: var(--accent); }
  .answer button.on { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
  .answer button:disabled { opacity: 0.6; cursor: default; }
</style>
