import { Button } from "@/components/ui/button";
import { ArrowLeft, Compass } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12">
    <section className="w-full border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="not-found-title">
      <Compass className="h-5 w-5 text-orange-700" aria-hidden="true" />
      <p className="mt-5 text-xs font-semibold uppercase tracking-[.14em] text-slate-500">Endereço indisponível</p>
      <h1 id="not-found-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Esta página não foi encontrada.</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">O link pode estar incorreto, ter expirado ou não estar mais disponível. Retorne à visão geral para continuar.</p>
      <Button onClick={() => setLocation("/")} className="mt-6 bg-slate-950 hover:bg-slate-800"><ArrowLeft className="mr-2 h-4 w-4" />Ir para a visão geral</Button>
    </section>
  </main>;
}
