import { randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AccessClaims = { sub: string; email: string; type: "access" };

function secret(): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters before authentication can be used.");
  }
  return env.JWT_SECRET;
}

export function issueAccessToken(user: { id: string; email: string }): string {
  return jwt.sign({ email: user.email, type: "access" }, secret(), {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as NonNullable<jwt.SignOptions["expiresIn"]>,
    issuer: "korobo-app-api",
    audience: "korobo-app"
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, secret(), {
    issuer: "korobo-app-api",
    audience: "korobo-app"
  });
  if (typeof decoded === "string" || decoded.type !== "access" || !decoded.sub || typeof decoded.email !== "string") {
    throw new Error("Invalid access token");
  }
  return decoded as AccessClaims;
}

export function createOneTimeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
