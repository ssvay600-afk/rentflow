/**
 * Node-only scheduler for the reminder agent. Loaded by instrumentation.ts
 * strictly inside a NEXT_RUNTIME === "nodejs" branch so the edge bundle never
 * pulls in nodemailer/Prisma.
 */
export async function startReminderScheduler() {
  const minutes = Number(process.env.REMINDER_AGENT_INTERVAL_MINUTES ?? 0);
  if (!minutes || Number.isNaN(minutes)) return;

  const globalRef = globalThis as unknown as { __rentflowAgentTimer?: NodeJS.Timeout };
  if (globalRef.__rentflowAgentTimer) return;

  const { runReminderAgentForAll } = await import("./lib/reminders");
  const tick = async () => {
    try {
      const results = await runReminderAgentForAll("schedule");
      const created = results.reduce((s, r) => s + r.result.created, 0);
      if (created > 0) console.log(`[reminder-agent] drafted ${created} reminder(s) across ${results.length} business(es)`);
    } catch (error) {
      console.error("[reminder-agent] run failed", error);
    }
  };

  globalRef.__rentflowAgentTimer = setInterval(tick, minutes * 60_000);
  globalRef.__rentflowAgentTimer.unref?.();
  console.log(`[reminder-agent] scheduled every ${minutes} minute(s)`);
}
