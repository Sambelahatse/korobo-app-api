import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().optional().or(z.literal("")),
  DATABASE_CA_CERT: z.string().optional().or(z.literal("")),
  JWT_SECRET: z.string().min(32).optional().or(z.literal("")),
  JWT_EXPIRES_IN: z.string().default("8h"),
  OWNER_BOOTSTRAP_TOKEN: z.string().min(32).optional().or(z.literal("")),
  GOOGLE_CLIENT_ID: z.string().optional().or(z.literal("")),
  GOOGLE_CLIENT_SECRET: z.string().optional().or(z.literal("")),
  GOOGLE_REDIRECT_URI: z.string().url().optional().or(z.literal("")),
  SMTP_HOST: z.string().optional().or(z.literal("")),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.string().default("false").transform((value) => value === "true"),
  SMTP_USER: z.string().optional().or(z.literal("")),
  SMTP_PASSWORD: z.string().optional().or(z.literal("")),
  SMTP_FROM: z.string().default("KOROBO <no-reply@korobo.mg>"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

if (parsed.data.NODE_ENV === "production" && !parsed.data.JWT_SECRET) {
  console.error("JWT_SECRET must be configured in production.");
  process.exit(1);
}

export const env = parsed.data;
