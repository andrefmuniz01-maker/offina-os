import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import {
  getBearerToken,
  getSupabaseAuthUser,
  getSupabaseProfile,
  type SupabaseProfile,
} from "./supabase";

export type SupabaseSessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  platformRole: "platform_user" | "super_admin";
  accessToken: string;
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  /**
   * Ponte temporária para routers ainda dependentes de IDs numéricos MySQL.
   * Não deve ser usada em novos routers migrados para Supabase.
   */
  user: User | null;
  /** Identidade validada por Supabase Auth e profile protegido por RLS. */
  supabaseUser: SupabaseSessionUser | null;
  /**
   * true quando um token foi enviado mas a validação falhou por uma exceção
   * (ex.: falha de rede ao consultar o Supabase Auth), e não por rejeição
   * legítima do token. Distingue "sessão inválida" de "não foi possível
   * verificar agora", para que auth.me não relate uma falha transitória de
   * infraestrutura como se o usuário estivesse deslogado.
   */
  supabaseAuthUnavailable?: boolean;
};

export function applySupabaseProfileRole(
  user: User | null,
  profile: SupabaseProfile | null,
): User | null {
  if (!user || !profile) return null;
  return { ...user, platformRole: profile.platformRole };
}

type SupabaseAuthenticatedIdentity = {
  id: string;
  email?: string | null;
};

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? null;
}

function isValidSupabasePlatformRole(role: unknown): role is SupabaseProfile["platformRole"] {
  return role === "platform_user" || role === "super_admin";
}

function getSupabaseDisplayName(identity: Awaited<ReturnType<typeof getSupabaseAuthUser>>) {
  const metadata = identity?.user_metadata;
  const candidates = [metadata?.full_name, metadata?.name, metadata?.display_name];
  const name = candidates.find(candidate => typeof candidate === "string" && candidate.trim().length > 0);
  return typeof name === "string" ? name.trim() : null;
}

export function isSupabaseProfileIdentityMatch(
  identity: SupabaseAuthenticatedIdentity,
  profile: SupabaseProfile | null,
) {
  const identityEmail = normalizeEmail(identity.email);
  const profileEmail = normalizeEmail(profile?.email);
  return Boolean(profile && isValidSupabasePlatformRole(profile.platformRole) && identity.id === profile.id && identityEmail && profileEmail && identityEmail === profileEmail);
}

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = null;
  let supabaseUser: SupabaseSessionUser | null = null;
  let supabaseAuthUnavailable = false;

  const accessToken = getBearerToken(opts.req.headers.authorization);
  if (accessToken) {
    try {
      const authenticatedIdentity = await getSupabaseAuthUser(accessToken);
      if (authenticatedIdentity) {
        const profile = await getSupabaseProfile(accessToken, authenticatedIdentity.id);
        if (profile && isSupabaseProfileIdentityMatch(authenticatedIdentity, profile)) {
          const email = normalizeEmail(profile.email);
          supabaseUser = {
            id: profile.id,
            name: getSupabaseDisplayName(authenticatedIdentity),
            email,
            platformRole: profile.platformRole,
            accessToken,
          };

          // Compatibilidade de transição: routers ainda legados exigem um User MySQL.
          // Routers novos devem usar `ctx.supabaseUser` e nunca depender deste fallback.
          // Uma indisponibilidade do legado não pode invalidar uma identidade Supabase
          // já autenticada e conferida pelo profile canônico.
          try {
            const legacyUser = email ? (await db.getUserByEmail(email)) ?? null : null;
            user = applySupabaseProfileRole(legacyUser, profile);
          } catch {
            user = null;
          }
        }
      }
    } catch {
      // getSupabaseAuthUser/getSupabaseProfile só chegam a lançar exceção por
      // falha de infraestrutura (ex.: rede indisponível); um token realmente
      // inválido ou expirado é reportado pelo Supabase via `error` e já
      // retorna null sem lançar. Por isso, uma exceção aqui nunca deve ser
      // tratada como "usuário sem sessão".
      user = null;
      supabaseUser = null;
      supabaseAuthUnavailable = true;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    supabaseUser,
    supabaseAuthUnavailable,
  };
}
