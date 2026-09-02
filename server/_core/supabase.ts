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

/**
 * O e-mail de convite do Supabase leva a pessoa para /auth/callback com
 * type=invite; a origem é derivada da própria requisição para funcionar tanto
 * em desenvolvimento quanto em qualquer domínio de produção sem variável extra.
 */
export function resolveRequestOrigin(req: { headers: Record<string, unknown> }): string {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.length > 0) return origin;
  const host = req.headers.host;
  if (typeof host === "string" && host.length > 0) return `https://${host}`;
  throw new Error("Não foi possível determinar o endereço da aplicação para enviar o convite.");
}

export function getBearerToken(value: string | undefined): string | null {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function getSupabaseAuthUser(accessToken: string) {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    // Um token genuinamente expirado/inválido volta com status 4xx. Qualquer
    // outro erro (5xx, timeout, indisponibilidade do Auth) não significa que a
    // sessão é inválida — só que não foi possível verificá-la agora. Tratar os
    // dois casos da mesma forma faz uma instabilidade passageira parecer uma
    // sessão expirada.
    const status = (error as { status?: number }).status;
    if (status !== undefined && status >= 400 && status < 500) return null;
    throw new Error(`Falha ao validar a sessão Supabase: ${error.message}`);
  }
  if (!data.user) return null;
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
