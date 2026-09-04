import { sendEmail } from "./email";

export type SendResult = { delivered: boolean; note: string };

/** Backwards-compatible wrapper used by the reminder agent. */
export async function sendReminderEmail(params: { businessId: string; businessName: string; replyTo?: string; to: string; subject: string; text: string }): Promise<SendResult> {
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#0f172a;white-space:pre-wrap">${params.text
    .replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c)}</div>`;
  const r = await sendEmail({
    businessId: params.businessId,
    kind: "reminder",
    to: params.to,
    subject: params.subject,
    text: params.text,
    html,
    replyTo: params.replyTo,
    fromName: params.businessName,
  });
  if (r.status === "sent") return { delivered: true, note: `Delivered (${r.providerId})` };
  if (r.status === "logged") return { delivered: false, note: "No email provider configured – stored in outbox only" };
  throw new Error(r.error ?? "Send failed");
}
