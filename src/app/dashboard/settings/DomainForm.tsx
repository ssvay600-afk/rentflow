"use client";

import { useActionState } from "react";
import { setCustomDomain, type ActionState } from "../actions";

export function DomainForm({ current }: { current: string | null }) {
  const [state, formAction, pending] = useActionState(setCustomDomain, {} as ActionState);
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      {state.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>}
      <div className="flex gap-2">
        <input name="domain" defaultValue={current ?? ""} placeholder="www.yourbusiness.com" className="input" required />
        <button type="submit" disabled={pending} className="btn-primary whitespace-nowrap">
          {pending ? "Saving…" : current ? "Change" : "Connect"}
        </button>
      </div>
    </form>
  );
}
