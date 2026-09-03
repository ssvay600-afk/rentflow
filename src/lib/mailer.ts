import nodemailer from "nodemailer";

export type SendResult = { delivered: boolean; note: string };

/**
 * Sends an email through SMTP when configured. Otherwise the message is kept
 * in the outbox (the Reminder row) and marked as logged so the workflow still
 * completes in demo mode.
 */
export async function sendEmail(params: { to: string; subject: string; text: string }): Promise<SendResult> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST) {
    return { delivered: false, note: "SMTP not configured – message stored in outbox only" };
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  const info = await transporter.sendMail({
    from: SMTP_FROM ?? SMTP_USER,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
  return { delivered: true, note: `Delivered via SMTP (${info.messageId})` };
}
