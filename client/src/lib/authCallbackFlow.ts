export function requiresPasswordSetup(callbackType: string | null) {
  return callbackType === "recovery" || callbackType === "invite";
}

export type AuthCallbackParams = {
  type: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

/**
 * Lê o que o Supabase devolve no fragmento (#) da URL depois que a pessoa clica
 * no link do e-mail: o tipo do link (recovery/invite) ou um erro
 * (ex.: otp_expired, unexpected_failure). Precisa ser chamada ANTES de o
 * cliente Supabase iniciar, porque ele apaga o fragmento da URL ao processá-lo.
 */
export function parseAuthCallbackHash(hash: string): AuthCallbackParams {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    type: params.get("type"),
    errorCode: params.get("error_code") ?? params.get("error"),
    errorDescription: params.get("error_description"),
  };
}

/**
 * Se o link do e-mail cair em outra rota (por exemplo, a URL de redirecionamento
 * não estava liberada no Supabase e ele usou o Site URL), a pessoa veria só a
 * tela de login, sem saber que o link falhou. Nesses casos, leva para o callback
 * mantendo o fragmento, onde a senha é definida ou o erro é explicado.
 */
export function shouldForwardToAuthCallback(pathname: string, params: AuthCallbackParams) {
  if (pathname === "/auth/callback") return false;
  return requiresPasswordSetup(params.type) || Boolean(params.errorCode);
}

export function getAuthCallbackErrorMessage(errorCode: string | null) {
  if (!errorCode) return null;
  if (errorCode === "otp_expired" || errorCode === "access_denied") {
    return "Este link expirou ou já foi usado. Volte ao acesso e solicite um novo link de redefinição.";
  }
  return "Não foi possível validar o link agora. Tente solicitar um novo link em alguns minutos; se continuar, fale com o administrador da plataforma.";
}
