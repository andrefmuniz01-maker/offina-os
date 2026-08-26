import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export type SupabaseSignOut = () => PromiseLike<{ error: Error | null }>;

export async function signOutSupabaseSession(signOut: SupabaseSignOut) {
  const { error } = await signOut();

  if (error) {
    throw error;
  }
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<Error | null>(null);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logout = useCallback(async () => {
    setIsSigningOut(true);
    setLogoutError(null);

    try {
      await signOutSupabaseSession(supabase.auth.signOut.bind(supabase.auth));
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    } catch (error: unknown) {
      setLogoutError(error instanceof Error ? error : new Error("Não foi possível encerrar a sessão."));
      throw error;
    } finally {
      setIsSigningOut(false);
    }
  }, [utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || isSigningOut,
      error: meQuery.error ?? logoutError,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    isSigningOut,
    logoutError,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || isSigningOut) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    window.location.href = redirectPath ?? "/";
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    isSigningOut,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
