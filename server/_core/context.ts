import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import {
  getBearerToken,
  getSupabaseAuthUser,
  getSupabaseProfile,
  type SupabaseProfile,
} from "./supabase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
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

export function isSupabaseProfileIdentityMatch(
  identity: SupabaseAuthenticatedIdentity,
  profile: SupabaseProfile | null,
) {
  const identityEmail = normalizeEmail(identity.email);
  const profileEmail = normalizeEmail(profile?.email);
  return Boolean(profile && identity.id === profile.id && identityEmail && profileEmail && identityEmail === profileEmail);
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  const accessToken = getBearerToken(opts.req.headers.authorization);
  if (accessToken) {
    try {
      const supabaseUser = await getSupabaseAuthUser(accessToken);
      if (supabaseUser) {
        const profile = await getSupabaseProfile(accessToken);
        if (profile && isSupabaseProfileIdentityMatch(supabaseUser, profile)) {
          const email = normalizeEmail(profile.email);
          const legacyUser = email ? (await db.getUserByEmail(email)) ?? null : null;
          user = applySupabaseProfileRole(legacyUser, profile);
        }
      }
    } catch {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
