import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | undefined;

export function getSupabaseAdminClient(): SupabaseClient {
  if (client) return client;

  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for account provisioning.");
  }

  client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  return client;
}
