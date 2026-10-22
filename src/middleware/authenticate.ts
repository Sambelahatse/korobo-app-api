import type { NextFunction, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { AppUser } from "../entities/AppUser";
import { verifyAccessToken } from "../services/auth";

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const match = req.header("authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "A valid Bearer token is required." } });
    return;
  }
  try {
    const claims = verifyAccessToken(match[1]!);
    if (!AppDataSource.isInitialized) {
      res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "Authentication is temporarily unavailable." } });
      return;
    }
    const profile = await AppDataSource.getRepository(AppUser).findOne({ where: { id: claims.sub } });
    if (!profile || !profile.isActive || profile.email.toLowerCase() !== claims.email.toLowerCase()) {
      res.status(401).json({ error: { code: "INVALID_SESSION", message: "Your session is invalid or expired." } });
      return;
    }
    req.authUser = { id: profile.id, email: profile.email };
    req.authProfile = profile;
    next();
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "The access token is invalid or expired." } });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.authProfile?.role !== "admin") {
    res.status(403).json({ error: { code: "ADMIN_REQUIRED", message: "Administrator access is required." } });
    return;
  }
  next();
}
