import type { AppUser } from "../entities/AppUser";

declare global {
  namespace Express {
    interface Request {
      authUserId?: string;
      authProfile?: AppUser;
    }
  }
}

export {};
