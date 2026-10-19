import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Used only to secure the initial migration and first-owner setup endpoints.
  OWNER_BOOTSTRAP_TOKEN: z.string().min(32).optional().or(z.literal("")),
  JWT_SECRET: z.string().min(32).optional().or(z.literal("")),
  JWT_ISSUER: z.string().default("korobo-app-api"),
  JWT_AUDIENCE: z.string().default("korobo-app"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  DATABASE_URL: z.string().optional().or(z.literal("")),
  DATABASE_CA_CERT: z.string().optional().or(z.literal(""))
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  COOKIE_SECURE: parsed.data.COOKIE_SECURE ?? (parsed.data.NODE_ENV === "production" ? "true" : "false")
};
