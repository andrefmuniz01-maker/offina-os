import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
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
  const recoveryMode = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery", []);
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: sessionState === "ready" && !recoveryReady,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error || !data.session) {
        setMessage("O link de acesso é inválido ou expirou. Solicite outro link.");
        setSessionState("invalid");
        window.setTimeout(() => setLocation("/"), 2500);
        return;
      }

      if (recoveryMode) {
        setRecoveryReady(true);
        setMessage("Defina sua senha de acesso.");
        return;
      }

      setSessionState("ready");
    })();

    return () => {
      active = false;
    };
  }, [recoveryMode, setLocation]);

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
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsSavingPassword(false);
    if (error) {
      setPasswordError("Não foi possível salvar a senha. Solicite uma nova redefinição e tente novamente.");
      return;
    }

    window.history.replaceState(null, "", "/auth/callback");
    setRecoveryReady(false);
    setSessionState("ready");
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
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <form onSubmit={savePassword} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
          <div>
            <h1 className="text-xl font-semibold">Defina sua senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use ao menos 10 caracteres com letras maiúsculas, minúsculas e números.</p>
          </div>
          <input aria-label="Nova senha" className="h-11 rounded-md border bg-background px-3 text-sm" type="password" minLength={10} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required />
          <input aria-label="Confirmar nova senha" className="h-11 rounded-md border bg-background px-3 text-sm" type="password" minLength={10} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required />
          {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
          <button type="submit" disabled={isSavingPassword} className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{isSavingPassword ? "Salvando…" : "Salvar senha e continuar"}</button>
        </form>
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
