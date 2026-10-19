import type { User } from "@supabase/supabase-js";
import type { AppUser } from "../entities/AppUser";

declare global {
  namespace Express {
    interface Request {
      authUser?: User;
      authProfile?: AppUser;
    }
  }
}

export {};
