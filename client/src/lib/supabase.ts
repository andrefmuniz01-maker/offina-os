import { createClient } from "@supabase/supabase-js";
import { parseAuthCallbackHash, shouldForwardToAuthCallback } from "@/lib/authCallbackFlow";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Supabase Auth não está configurado para este ambiente.");
}

// Precisa vir ANTES do createClient: ao iniciar, o cliente processa e apaga o
// fragmento (#...) da URL, e o tipo/erro do link do e-mail se perderia.
export const initialAuthCallback = parseAuthCallbackHash(typeof window === "undefined" ? "" : window.location.hash);

if (typeof window !== "undefined" && shouldForwardToAuthCallback(window.location.pathname, initialAuthCallback)) {
  window.location.replace(`/auth/callback${window.location.search}${window.location.hash}`);
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
