import type { AppUser } from "../entities/AppUser";

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string };
      authProfile?: AppUser;
    }
  }
}

export {};
