import { createHash, randomBytes } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessClaims extends JwtPayload {
  sub: string;
  typ: "access";
}

function jwtSecret(): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return env.JWT_SECRET;
}

export function createAccessToken(userId: string): string {
  return jwt.sign({ typ: "access" }, jwtSecret(), {
    algorithm: "HS256",
    subject: userId,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, jwtSecret(), {
    algorithms: ["HS256"],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE
  });
  if (typeof decoded === "string" || decoded.typ !== "access" || typeof decoded.sub !== "string") {
    throw new Error("Invalid access token.");
  }
  return decoded as AccessClaims;
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenLifetimeMs(): number {
  return env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE === "true",
    sameSite: "strict" as const,
    path: "/auth",
    maxAge: refreshTokenLifetimeMs()
  };
}

export function readRefreshCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "korobo_refresh") return decodeURIComponent(value.join("="));
  }
  return null;
}
