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

export function createSupabaseServiceRoleClient() {
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

  // O query builder do PostgREST nunca lança exceção: uma falha de infra (rede,
  // timeout, RLS) chega aqui como `error`, igual a "perfil não encontrado". Sem
  // essa distinção, createContext trata as duas a mesma forma e o usuário vê
  // "perfil operacional indisponível" quando na verdade a consulta falhou.
  if (error) throw new Error(`Falha ao consultar o profile Supabase: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    platformRole: data.platform_role,
  };
}
