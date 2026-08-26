import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export function getPostLoginPath(platformRole: string | null | undefined) {
  return platformRole === "super_admin" ? "/plataforma" : "/";
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("Validando seu acesso seguro…");
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "invalid">("checking");
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: sessionState === "ready",
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

      setSessionState("ready");
    })();

    return () => {
      active = false;
    };
  }, [setLocation]);

  useEffect(() => {
    if (sessionState !== "ready" || meQuery.isLoading) return;

    if (meQuery.error || !meQuery.data) {
      setMessage("Seu link foi validado, mas seu perfil operacional ainda não está disponível. Contate um Super Admin.");
      return;
    }

    setLocation(getPostLoginPath(meQuery.data.platformRole));
  }, [meQuery.data, meQuery.error, meQuery.isLoading, sessionState, setLocation]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <LoaderCircle className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
