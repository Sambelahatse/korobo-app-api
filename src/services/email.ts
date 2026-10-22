import nodemailer from "nodemailer";
import { env } from "../config/env";

function getTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new Error("Email service is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD.");
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
  });
}

export async function sendAccountEmail(to: string, subject: string, heading: string, message: string, actionUrl: string): Promise<void> {
  const transport = getTransport();
  await transport.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text: `${heading}\n\n${message}\n\n${actionUrl}\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#172018"><h2>${heading}</h2><p>${message}</p><p><a href="${actionUrl}" style="display:inline-block;padding:12px 18px;background:#3d6b2a;color:#fff;text-decoration:none;border-radius:8px">Continuer</a></p><p>Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p></body></html>`
  });
}
