"use client";

import { useActionState } from "react";
import { sendTestEmailAction, type ActionState } from "../actions";

export function TestEmailButton() {
  const [state, action, pending] = useActionState(async () => sendTestEmailAction(), {} as ActionState);
  return (
    <form action={action} className="flex items-center gap-3">
      {state.success && <span className="text-xs text-emerald-700">{state.success}</span>}
      {state.error && <span className="max-w-xs text-xs text-rose-700">{state.error}</span>}
      <button type="submit" disabled={pending} className="btn-secondary">{pending ? "Sending…" : "Send test email"}</button>
    </form>
  );
}
