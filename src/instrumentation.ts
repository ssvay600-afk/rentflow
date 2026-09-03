/**
 * Next.js instrumentation hook. The runtime check must be a literal `if` so
 * the edge bundle drops the Node-only import at build time.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startReminderScheduler } = await import("./instrumentation-node");
    await startReminderScheduler();
  }
}
