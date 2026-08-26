import { supabase } from "@/lib/supabase";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("Validando seu acesso seguro…");

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error || !data.session) {
        setMessage("O link de acesso é inválido ou expirou. Solicite outro link.");
        window.setTimeout(() => setLocation("/"), 2500);
        return;
      }

      setLocation("/");
    })();

    return () => {
      active = false;
    };
  }, [setLocation]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <LoaderCircle className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
}
