import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getQuoteValidity } from "@/lib/publicQuoteDecision";
import { trpc } from "@/lib/trpc";
import { CircleAlert, ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";
import { useRoute } from "wouter";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function PublicQuote() {
  const [, params] = useRoute("/orcamento/:token");
  const token = params?.token ?? "";
  const quote = trpc.publicQuotes.view.useQuery({ token }, { enabled: Boolean(token), retry: false });

  if (quote.isLoading) {
    return <main className="grid min-h-screen place-items-center bg-stone-50" aria-live="polite"><div className="flex items-center gap-3 text-sm text-slate-600" role="status"><Loader2 className="h-6 w-6 animate-spin text-orange-700" aria-hidden="true" /><span>Carregando orçamento…</span></div></main>;
  }
  if (quote.error || !quote.data) {
    return <main className="grid min-h-screen place-items-center bg-stone-50 p-6" aria-live="assertive"><Card className="w-full max-w-md border-slate-200 shadow-sm" role="alert"><CardHeader><CircleAlert className="h-7 w-7 text-red-700" aria-hidden="true" /><h1 className="mt-3 text-xl font-semibold text-slate-950">Orçamento indisponível</h1><p className="text-sm leading-6 text-slate-600">Este link não está disponível. Solicite uma nova proposta diretamente à oficina.</p></CardHeader></Card></main>;
  }

  const data = quote.data;
  const primaryColor = data.workshop.branding?.primaryColor ?? "#E84D1C";
  const secondaryColor = data.workshop.branding?.secondaryColor ?? "#171717";
  const accentColor = data.workshop.branding?.accentColor ?? "#F5B33A";
  const publicTitle = data.workshop.branding?.publicTitle || data.workshop.name;
  const validity = getQuoteValidity(data.quote.validUntil);
  const validityClass = validity.tone === "urgent" ? "border-red-200 bg-red-50 text-red-800" : validity.tone === "attention" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return <main className="min-h-screen bg-stone-50 px-4 py-8 sm:p-10"><div className="mx-auto max-w-3xl"><Card className="overflow-hidden border-stone-200 shadow-[0_25px_70px_-38px_rgba(15,23,42,.42)]"><header className="px-6 py-7 text-white sm:px-9" style={{ backgroundColor: secondaryColor }}><div className="flex flex-wrap items-center justify-between gap-3"><Badge className="text-white hover:opacity-100" style={{ backgroundColor: primaryColor }}>Orçamento #{String(data.quote.number).padStart(6, "0")}</Badge><span className="text-xs font-semibold uppercase tracking-[.14em]" style={{ color: accentColor }}>Proposta da oficina</span></div><h1 className="mt-5 text-3xl font-semibold tracking-tight">Sua proposta está disponível</h1><p className="mt-2 text-sm leading-6 text-slate-300">{publicTitle} preparou esta proposta para {data.vehicle.make} {data.vehicle.model} {data.vehicle.modelYear ?? ""}.</p></header><CardContent className="p-6 sm:p-9"><section className="grid gap-px overflow-hidden rounded-xl border border-stone-100 bg-stone-100 sm:grid-cols-3" aria-label="Etapas da proposta"><div className="bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1. Revisar</p><p className="mt-2 text-sm font-medium text-slate-900">Confira itens, valores e condições.</p></div><div className="bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2. Avaliar</p><p className="mt-2 text-sm font-medium text-slate-900">Considere a proposta com calma.</p></div><div className="bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">3. Próximo contato</p><p className="mt-2 text-sm font-medium text-slate-900">A oficina seguirá com você diretamente.</p></div></section><div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-slate-700">Proposta para {data.customer.name}</p><p className="mt-1 text-xs text-slate-500">A confirmação comercial será realizada diretamente com a oficina.</p></div><Badge variant="outline" className={validityClass}>{validity.label}</Badge></div><section className="mt-8"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-orange-700" /><h2 className="text-lg font-semibold text-slate-950">Itens do orçamento</h2></div><div className="mt-4 space-y-3">{data.items.map((item, index) => <article key={`${item.description}-${index}`} className="flex items-start justify-between gap-5 rounded-xl border border-stone-100 bg-stone-50/50 p-4"><div><p className="font-medium text-slate-900">{item.description}</p><p className="mt-1 text-sm text-slate-500">{item.quantity} × {money.format(item.unitPrice)}</p></div><p className="whitespace-nowrap font-semibold text-slate-900">{money.format(item.total)}</p></article>)}</div></section><Separator className="my-7" /><section className="rounded-2xl bg-slate-950 p-5 text-white"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-300">Total da proposta</p><p className="mt-2 text-3xl font-semibold tracking-tight">{money.format(data.quote.total)}</p></div><p className="max-w-sm text-sm leading-6 text-slate-300">{data.quote.notes || "Os detalhes do serviço serão confirmados pela oficina antes de qualquer agendamento."}</p></div></section>{data.quote.terms ? <section className="mt-6 rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm leading-6 text-slate-600"><strong className="text-slate-800">Condições:</strong> {data.quote.terms}</section> : null}<section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Confirmação direta.</strong> Este link permite apenas consultar a proposta. Aprovação, reserva de peças, agenda e ordem de serviço ainda não são realizados por aqui.</section><div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-700" />Este link não exibe custos internos da oficina.</div></CardContent></Card></div></main>;
}
