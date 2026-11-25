import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getQuoteValidity } from "@/lib/publicQuoteDecision";
import { publicQuoteApprovalBoundary, publicQuoteFollowUpNotice } from "@/lib/publicCommunicationBoundaries";
import { trpc } from "@/lib/trpc";
import { Check, CheckCircle2, CircleAlert, ClipboardCheck, Download, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function PublicQuote() {
  const [, params] = useRoute("/orcamento/:token");
  const token = params?.token ?? "";
  const quote = trpc.publicQuotes.view.useQuery({ token }, { enabled: Boolean(token), retry: false });
  const decision = trpc.publicQuotes.decide.useMutation({ onSuccess: () => quote.refetch() });
  const [pendingDecision, setPendingDecision] = useState<"approved" | "rejected" | null>(null);

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
  const finished = data.quote.status === "approved" || data.quote.status === "rejected";
  const confirmDecision = () => { if (pendingDecision) decision.mutate({ token, decision: pendingDecision }); };
  const decisionPanel = finished ? (
    <section className={`mt-7 rounded-xl p-5 text-center ${data.quote.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
      {data.quote.status === "approved" ? <CheckCircle2 className="mx-auto h-7 w-7" /> : <XCircle className="mx-auto h-7 w-7" />}
      <p className="mt-2 font-semibold">{data.quote.status === "approved" ? "Proposta aprovada" : "Proposta recusada"}</p>
      <p className="mt-1 text-sm">{data.quote.status === "approved" ? publicQuoteFollowUpNotice : "A oficina registrou sua decisão e poderá orientar você separadamente."}</p>
    </section>
  ) : pendingDecision ? (
    <section className={`mt-7 rounded-xl border p-5 ${pendingDecision === "approved" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="font-semibold text-slate-900">{pendingDecision === "approved" ? "Confirmar aprovação?" : "Confirmar recusa?"}</p>
      <p className="mt-1 text-sm text-slate-600">{pendingDecision === "approved" ? publicQuoteApprovalBoundary : "Ao confirmar, a oficina receberá sua recusa. Esta ação não pode ser revertida por este link."}</p>
      <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={decision.isPending} onClick={() => setPendingDecision(null)}>Revisar proposta</Button><Button type="button" disabled={decision.isPending} style={{ backgroundColor: pendingDecision === "approved" ? primaryColor : secondaryColor }} onClick={confirmDecision}>{decision.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Confirmar decisão</Button></div>
    </section>
  ) : (
    <section className="mt-8"><p className="text-sm text-slate-600">Ao decidir, você confirma que revisou itens, valores e condições. A oficina entrará em contato para combinar as etapas seguintes.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Button type="button" variant="outline" className="h-11" onClick={() => setPendingDecision("rejected")}><XCircle className="mr-2 h-4 w-4" />Recusar proposta</Button><Button type="button" className="h-11" style={{ backgroundColor: primaryColor }} onClick={() => setPendingDecision("approved")}><CheckCircle2 className="mr-2 h-4 w-4" />Aprovar proposta</Button></div></section>
  );

  return <main className="min-h-screen bg-stone-50 px-4 py-8 sm:p-10"><div className="mx-auto max-w-3xl"><Card className="overflow-hidden border-stone-200 shadow-[0_25px_70px_-38px_rgba(15,23,42,.42)]"><header className="px-6 py-7 text-white sm:px-9" style={{ backgroundColor: secondaryColor }}><div className="flex flex-wrap items-center justify-between gap-3"><Badge className="text-white hover:opacity-100" style={{ backgroundColor: primaryColor }}>Orçamento #{String(data.quote.number).padStart(6, "0")}</Badge><span className="text-xs font-semibold" style={{ color: accentColor }}>Proposta da oficina</span></div><h1 className="mt-5 text-3xl font-semibold tracking-tight">Sua proposta está disponível</h1><p className="mt-2 text-sm leading-6 text-slate-300">{publicTitle} preparou esta proposta para {data.vehicle.make} {data.vehicle.model} {data.vehicle.modelYear ?? ""}.</p></header><CardContent className="p-6 sm:p-9"><section className="grid gap-px overflow-hidden rounded-xl border border-stone-100 bg-stone-100 sm:grid-cols-3" aria-label="Etapas da proposta"><div className="bg-white p-4"><p className="text-xs font-semibold text-slate-500">1. Revisar</p><p className="mt-2 text-sm font-medium text-slate-900">Confira itens, valores e condições.</p></div><div className="bg-white p-4"><p className="text-xs font-semibold text-slate-500">2. Decidir</p><p className="mt-2 text-sm font-medium text-slate-900">Aprove ou recuse com confirmação.</p></div><div className="bg-white p-4"><p className="text-xs font-semibold text-slate-500">3. Próximo contato</p><p className="mt-2 text-sm font-medium text-slate-900">A oficina seguirá com você diretamente.</p></div></section><div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-slate-700">Proposta para {data.customer.name}</p><p className="mt-1 text-xs text-slate-500">A confirmação registrada aqui não cria agenda, ordem de serviço ou cobrança.</p></div><div className="flex items-center gap-2"><Badge variant="outline" className={validityClass}>{validity.label}</Badge>{data.quote.pdfUrl ? <Button asChild type="button" variant="outline" size="sm"><a href={data.quote.pdfUrl} target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />Baixar PDF</a></Button> : null}</div></div><section className="mt-8"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-orange-700" /><h2 className="text-lg font-semibold text-slate-950">Itens do orçamento</h2></div><div className="mt-4 space-y-3">{data.items.map((item, index) => <article key={`${item.description}-${index}`} className="flex items-start justify-between gap-5 rounded-xl border border-stone-100 bg-stone-50/50 p-4"><div><p className="font-medium text-slate-900">{item.description}</p><p className="mt-1 text-sm text-slate-500">{item.quantity} × {money.format(item.unitPrice)}</p></div><p className="whitespace-nowrap font-semibold text-slate-900">{money.format(item.total)}</p></article>)}</div></section><Separator className="my-7" /><section className="rounded-2xl bg-slate-950 p-5 text-white"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold text-slate-300">Total da proposta</p><p className="mt-2 text-3xl font-semibold tracking-tight">{money.format(data.quote.total)}</p></div><p className="max-w-sm text-sm leading-6 text-slate-300">{data.quote.notes || "Os detalhes do serviço serão confirmados pela oficina antes de qualquer agendamento."}</p></div></section>{data.quote.terms ? <section className="mt-6 rounded-xl border border-stone-100 bg-stone-50 p-4 text-sm leading-6 text-slate-600"><strong className="text-slate-800">Condições:</strong> {data.quote.terms}</section> : null}{decisionPanel}<div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-700" />Este link não exibe custos internos da oficina.</div>{decision.error ? <p className="mt-3 text-center text-sm text-red-600" role="alert">Não foi possível registrar sua decisão agora. Tente novamente em alguns minutos.</p> : null}</CardContent></Card></div></main>;
}
