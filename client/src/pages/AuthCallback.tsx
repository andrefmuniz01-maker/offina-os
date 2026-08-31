import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { requiresPasswordSetup } from "@/lib/authCallbackFlow";
import { getAuthConnectionTimeoutMessage, withAuthTimeout } from "@/lib/authTimeout";
import { AuthPasswordSetupForm } from "@/components/AuthPasswordSetupForm";
import { LoaderCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

export function getPostLoginPath(_platformRole: string | null | undefined) {
  // A Home já usa o workspace Supabase. O Painel de Plataforma permanece em
  // migração e não deve ser o destino automático até abandonar o MySQL legado.
  return "/";
}

export function isValidPassword(password: string) {
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("Validando seu acesso seguro…");
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "invalid">("checking");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const passwordSetupMode = useMemo(() => requiresPasswordSetup(new URLSearchParams(window.location.hash.slice(1)).get("type")), []);
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: sessionState === "ready" && !recoveryReady,
    // Logo após o link mágico, a otimização de dependências do Vite (em um projeto
    // recém-clonado) pode derrubar a primeira chamada antes de terminar. Um pequeno
    // retry evita travar o usuário na mensagem de "perfil indisponível" por isso.
    retry: 2,
    retryDelay: attempt => 500 * (attempt + 1),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { data, error } = await withAuthTimeout(() => supabase.auth.getSession());
        if (!active) return;

        if (error || !data.session) {
          setMessage("O link de acesso é inválido ou expirou. Solicite outro link.");
          setSessionState("invalid");
          return;
        }

        if (passwordSetupMode) {
          setRecoveryReady(true);
          setMessage("Defina sua senha de acesso.");
          return;
        }

        setSessionState("ready");
      } catch {
        if (!active) return;
        setMessage(getAuthConnectionTimeoutMessage());
        setSessionState("invalid");
      }
    })();

    return () => {
      active = false;
    };
  }, [passwordSetupMode, setLocation]);

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    if (!isValidPassword(newPassword)) {
      setPasswordError("Use pelo menos 10 caracteres, incluindo letras maiúsculas, minúsculas e números.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("As senhas informadas não coincidem.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const { error } = await withAuthTimeout(() => supabase.auth.updateUser({ password: newPassword }));
      if (error) {
        setPasswordError("Não foi possível salvar a senha. Solicite uma nova redefinição e tente novamente.");
        return;
      }

      window.history.replaceState(null, "", "/auth/callback");
      setRecoveryReady(false);
      setSessionState("ready");
    } catch {
      setPasswordError(getAuthConnectionTimeoutMessage());
    } finally {
      setIsSavingPassword(false);
    }
  };

  useEffect(() => {
    if (sessionState !== "ready" || meQuery.isLoading) return;

    if (meQuery.error || !meQuery.data) {
      setMessage("Seu link foi validado, mas seu perfil operacional ainda não está disponível. Contate um Super Admin.");
      return;
    }

    setLocation(getPostLoginPath(meQuery.data.platformRole));
  }, [meQuery.data, meQuery.error, meQuery.isLoading, sessionState, setLocation]);

  if (recoveryReady) {
    return (
      <AuthPasswordSetupForm
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        passwordError={passwordError}
        isSavingPassword={isSavingPassword}
        onSubmit={savePassword}
        onNewPasswordChange={setNewPassword}
        onConfirmPasswordChange={setConfirmPassword}
      />
    );
  }

  if (sessionState === "invalid") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground" role="alert">{message}</p>
          <button type="button" onClick={() => setLocation("/")} className="text-sm font-medium text-primary underline-offset-4 hover:underline">Voltar ao acesso</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <LoaderCircle className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
