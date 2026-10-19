import type { NextFunction, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { AppUser } from "../entities/AppUser";
import { getSupabaseClient } from "../config/supabase";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    res.status(401).json({
      error: { code: "AUTH_REQUIRED", message: "A valid Bearer token is required." }
    });
    return;
  }

  try {
    const { data, error } = await getSupabaseClient().auth.getUser(match[1]);
    if (error || !data.user) {
      res.status(401).json({
        error: { code: "INVALID_TOKEN", message: "The access token is invalid or expired." }
      });
      return;
    }

    if (!AppDataSource.isInitialized) {
      res.status(503).json({
        error: { code: "DATABASE_UNAVAILABLE", message: "Authentication profile lookup is unavailable." }
      });
      return;
    }

    const profile = await AppDataSource.getRepository(AppUser).findOne({
      where: { id: data.user.id }
    });

    if (!profile || !profile.isActive) {
      res.status(403).json({
        error: { code: "ACCOUNT_NOT_ALLOWED", message: "This account has no active KOROBO profile." }
      });
      return;
    }

    req.authUser = data.user;
    req.authProfile = profile;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.authProfile?.role !== "admin") {
    res.status(403).json({
      error: { code: "ADMIN_REQUIRED", message: "Administrator access is required." }
    });
    return;
  }
  next();
}
