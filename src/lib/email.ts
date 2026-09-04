import nodemailer from "nodemailer";
import { prisma } from "./db";

/**
 * Email transport. Priority: Resend (HTTP API, best on Vercel) → SMTP → outbox only.
 * Every message is recorded in EmailLog so businesses can see what went out.
 */

export type EmailKind = "order_confirmation" | "payment_receipt" | "refund" | "order_status" | "reminder" | "owner_new_order" | "test";

export function emailProvider(): "resend" | "smtp" | null {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return null;
}

function fromAddress(displayName?: string) {
  const base = process.env.EMAIL_FROM ?? process.env.SMTP_FROM ?? "RentFlow <onboarding@resend.dev>";
  if (!displayName) return base;
  const m = /<([^>]+)>/.exec(base);
  const addr = m ? m[1] : base;
  return `${displayName.replace(/[<>"]/g, "")} via RentFlow <${addr}>`;
}

export type SendEmailInput = {
  businessId?: string | null;
  kind: EmailKind;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  fromName?: string;
};

export type SendEmailResult = { status: "sent" | "logged" | "failed"; providerId?: string; error?: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = emailProvider();
  let result: SendEmailResult;
  try {
    if (provider === "resend") result = await viaResend(input);
    else if (provider === "smtp") result = await viaSmtp(input);
    else result = { status: "logged", error: "No email provider configured (set RESEND_API_KEY or SMTP_HOST)" };
  } catch (error) {
    result = { status: "failed", error: error instanceof Error ? error.message : "Send failed" };
  }
  await prisma.emailLog
    .create({
      data: {
        businessId: input.businessId ?? null,
        kind: input.kind,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html ?? "",
        status: result.status,
        providerId: result.providerId ?? "",
        error: result.error ?? "",
      },
    })
    .catch((e) => console.error("email log failed", e));
  if (result.status === "failed") console.error(`email failed (${input.kind} → ${input.to}): ${result.error}`);
  return result;
}

async function viaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(input.fromName),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { status: "failed", error: body?.message ?? `Resend error ${res.status}` };
  return { status: "sent", providerId: body?.id ?? "" };
}

async function viaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const port = Number(SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  const info = await transporter.sendMail({
    from: fromAddress(input.fromName),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
  });
  return { status: "sent", providerId: info.messageId };
}
