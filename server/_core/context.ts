import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getBearerToken, getSupabaseAuthUser } from "./supabase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  const accessToken = getBearerToken(opts.req.headers.authorization);
  if (accessToken) {
    try {
      const supabaseUser = await getSupabaseAuthUser(accessToken);
      const email = supabaseUser?.email?.trim().toLowerCase();
      user = email ? (await db.getUserByEmail(email)) ?? null : null;
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
