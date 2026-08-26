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
        const email = (profile?.email ?? supabaseUser.email)?.trim().toLowerCase();
        const legacyUser = email ? (await db.getUserByEmail(email)) ?? null : null;
        user = applySupabaseProfileRole(legacyUser, profile);
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
