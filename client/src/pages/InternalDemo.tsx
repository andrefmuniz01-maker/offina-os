import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LockKeyhole } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function InternalDemo() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user?.platformRole === "super_admin") {
      window.location.replace("/?demo=1");
    }
  }, [loading, user]);

  if (loading || user?.platformRole === "super_admin") {
    return <Loading />;
  }

  return <Restricted />;
}

function Loading() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] p-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <Skeleton className="h-28" />
        <Skeleton className="h-48" />
      </div>
    </main>
  );
}

function Restricted() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f7f9] p-5">
      <Card className="w-full max-w-md border-slate-200">
        <CardHeader>
          <LockKeyhole className="mb-2 h-6 w-6 text-orange-700" />
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            A Oficina Demo é um ambiente interno exclusivo de Super Admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/"
            className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Voltar
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
