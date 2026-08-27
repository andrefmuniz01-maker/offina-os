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
  return Boolean(profile && identity.id === profile.id && identityEmail && profileEmail && identityEmail === profileEmail);
}

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = null;
  let supabaseUser: SupabaseSessionUser | null = null;

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
          const legacyUser = email ? (await db.getUserByEmail(email)) ?? null : null;
          user = applySupabaseProfileRole(legacyUser, profile);
        }
      }
    } catch {
      user = null;
      supabaseUser = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    supabaseUser,
  };
}
