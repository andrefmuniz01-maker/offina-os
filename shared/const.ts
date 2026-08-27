// Usado exclusivamente pelo adaptador interno de Heartbeat legado. O cliente
// humano não cria, lê nem envia este cookie após a migração para Supabase Auth.
export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

export type OAuthState = { redirectUri: string; nonce?: string };

// Compatibilidade isolada ao transportador de cron legado. Não é chamado pelo
// cliente, callback ou contexto de autenticação de pessoas.
export const decodeOAuthState = (state: string): OAuthState => {
  try {
    const decoded = atob(state);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed.redirectUri === "string"
      ? parsed
      : { redirectUri: decoded };
  } catch {
    return { redirectUri: "" };
  }
};
