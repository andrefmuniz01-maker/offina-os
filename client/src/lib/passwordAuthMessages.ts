export type SupabaseAuthError = {
  code?: string;
  message?: string;
  status?: number;
};

export function getPasswordAuthErrorMessage(error: SupabaseAuthError) {
  const message = error.message?.toLowerCase() ?? "";

  if (
    error.code === "over_email_send_rate_limit" ||
    error.status === 429 ||
    message.includes("email rate limit")
  ) {
    return "O limite temporário de e-mails foi atingido. Aguarde até uma hora antes de solicitar outro link.";
  }

  if (error.code === "otp_disabled" || message.includes("signups not allowed")) {
    return "Não foi possível preparar o acesso agora. Verifique as instruções recebidas ou tente novamente mais tarde.";
  }

  if (error.code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }

  if (error.code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar ou solicite uma redefinição de senha.";
  }

  return "Não foi possível concluir o acesso seguro. Tente novamente mais tarde.";
}

export function getPasswordSetupMessage() {
  return "Enviaremos instruções seguras para criar ou redefinir a senha, caso o acesso esteja disponível.";
}
