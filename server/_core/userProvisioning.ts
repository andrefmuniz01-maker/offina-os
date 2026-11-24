import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Sem caracteres ambíguos (0/O, 1/l/I) para a senha poder ser lida e digitada sem erro.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";

/** Senha aleatória que já atende a regra do sistema (10+ caracteres, maiúscula, minúscula e número). */
export function generateTemporaryPassword(length = 16) {
  const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)];
  const chars = [pick(UPPER), pick(UPPER), pick(LOWER), pick(LOWER), pick(LOWER), pick(DIGITS), pick(DIGITS)];
  const all = UPPER + LOWER + DIGITS;
  while (chars.length < Math.max(length, 10)) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export type ProvisionedUser = {
  userId: string;
  /** true quando a conta foi criada agora; false quando o e-mail já tinha conta. */
  created: boolean;
  /** Preenchida só quando a conta foi criada agora. Exibida uma única vez; nunca é gravada. */
  temporaryPassword: string | null;
};

/**
 * Garante que o e-mail tenha uma conta. Se ainda não existe, cria já confirmada e com senha
 * temporária, sem depender do e-mail de convite do Supabase (que usa a tabela de tokens).
 */
export async function ensureUserWithTemporaryPassword(service: SupabaseClient, email: string, name?: string): Promise<ProvisionedUser> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data: existing, error: lookupError } = await service.from("profiles").select("id").ilike("email", normalizedEmail).maybeSingle();
  if (lookupError) throw new Error("Não foi possível verificar se este e-mail já possui conta.");
  if (existing?.id) return { userId: existing.id as string, created: false, temporaryPassword: null };

  const temporaryPassword = generateTemporaryPassword();
  const { data, error } = await service.auth.admin.createUser({
    email: normalizedEmail,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: name ? { full_name: name } : undefined,
  });
  if (error || !data.user) throw new Error(error?.message ?? "Não foi possível criar a conta.");
  return { userId: data.user.id, created: true, temporaryPassword };
}

/** Define uma nova senha temporária para uma conta existente (substitui o "esqueci a senha" por e-mail). */
export async function resetUserTemporaryPassword(service: SupabaseClient, userId: string) {
  const temporaryPassword = generateTemporaryPassword();
  const { data, error } = await service.auth.admin.updateUserById(userId, { password: temporaryPassword });
  if (error || !data.user) throw new Error(error?.message ?? "Não foi possível definir a nova senha.");
  return { email: data.user.email ?? null, temporaryPassword };
}

/** Trilha de auditoria da plataforma (sem oficina). Falha de auditoria nunca bloqueia a ação. */
export async function writePlatformAudit(service: SupabaseClient, actorUserId: string, action: string, after: Record<string, unknown>) {
  const { error } = await service.from("audit_logs").insert({ tenant_id: null, actor_user_id: actorUserId, action, entity_type: "profile", after });
  if (error) console.error("[audit] Falha ao registrar", action, error.message);
}
