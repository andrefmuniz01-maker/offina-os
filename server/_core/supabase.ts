import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

export type SupabaseProfile = {
  id: string;
  email: string | null;
  platformRole: "platform_user" | "super_admin";
};

export function createSupabaseClient(accessToken?: string) {
  if (!ENV.supabaseUrl || !ENV.supabasePublishableKey) {
    throw new Error("Supabase Auth não está configurado no servidor.");
  }

  return createClient(ENV.supabaseUrl, ENV.supabasePublishableKey, {
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function createSupabaseServiceRoleClient() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) return null;

  return createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
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
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user;
}

export async function getSupabaseProfile(accessToken: string, profileId: string): Promise<SupabaseProfile | null> {
  // A identidade já é validada por getSupabaseAuthUser com o token recebido.
  // A leitura subsequente usa Service Role apenas no servidor e fica limitada
  // ao mesmo UUID validado, sem expor a chave ao cliente.
  const supabase = createSupabaseServiceRoleClient() ?? createSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, platform_role")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    platformRole: data.platform_role,
  };
}
