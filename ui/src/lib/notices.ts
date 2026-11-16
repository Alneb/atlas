// The core's notices on the page (`Event::Notify` / `Event::Withdraw`, notify.rs): a toast each, its buttons pressed
// through the core's router (POST /api/notices/action → notice_actions.rs) — the same answer as a press on the system's
// notification — and taken away again when the core withdraws it by its id or its subject (a task done, an event
// deleted).
import { api } from "./api";
import { noticeToast, toast, withdrawToasts, type ToastKind } from "./state.svelte";
import { errText } from "./text";
import type { Notice } from "./gen/Notice";

const KIND: Record<NonNullable<Notice["level"]>, ToastKind> = { info: "info", success: "success", warning: "info", failure: "error" };

export function showNotice(n: Notice): void {
  const actions = (n.actions ?? []).map((a) => ({
    label: a.label,
    run: () => void api.noticeAction({ action: a.id, source: n.source, notice: n.id, open: n.open }).catch((err) => toast(`“${a.label}” failed`, errText(err), "error")),
  }));
  noticeToast(n.title, n.body, n.level ? KIND[n.level] : "info", actions, { notice: n.id, subject: n.subject });
}

export const withdrawNotice = (id: string): void => withdrawToasts(id);
