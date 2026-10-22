import nodemailer from "nodemailer";
import { env } from "../config/env";

function getTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER) {
    throw new Error("Email service is not configured. Set SMTP_HOST and SMTP_USER.");
  }

  const hasCompleteOAuthConfig = Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
    env.GOOGLE_OAUTH_CLIENT_SECRET &&
    env.GOOGLE_OAUTH_REFRESH_TOKEN
  );

  if (hasCompleteOAuthConfig) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        type: "OAuth2",
        user: env.SMTP_USER,
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        refreshToken: env.GOOGLE_OAUTH_REFRESH_TOKEN
      }
    });
  }

  // Keep password-based SMTP available as a backward-compatible fallback.
  if (env.SMTP_PASSWORD) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
    });
  }

  throw new Error(
    "Email service is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN for Gmail OAuth2, or set SMTP_PASSWORD for password-based SMTP."
  );
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
