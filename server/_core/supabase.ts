import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

function createSupabaseAuthClient() {
  if (!ENV.supabaseUrl || !ENV.supabasePublishableKey) {
    throw new Error("Supabase Auth não está configurado no servidor.");
  }

  return createClient(ENV.supabaseUrl, ENV.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export function getBearerToken(value: string | undefined): string | null {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function getSupabaseAuthUser(accessToken: string) {
  const supabase = createSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}
