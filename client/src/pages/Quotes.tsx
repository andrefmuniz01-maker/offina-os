import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getQuoteNextAction, getQuoteStatusTone, getQuoteValidityState, quoteStatusLabels, type QuoteQueueStatus } from "@/lib/quoteQueue";
import { trpc } from "@/lib/trpc";
import { AlertCircle, ArrowLeft, CalendarClock, ChevronLeft, ChevronRight, Copy, FileText, FilterX, ListChecks, Search, Send, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: FileText, label: "Orçamentos", path: "/orcamentos" },
];
const labels: Record<string, string> = quoteStatusLabels;
const statuses = ["draft", "ready", "sent", "viewed", "approved", "rejected", "expired", "cancelled"] as const;

export default function Quotes() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<(typeof statuses)[number] | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editingQuoteId, setEditingQuoteId] = useState<number | null>(null);
  const [discounts, setDiscounts] = useState<Record<number, string>>({});
  const [overrideReason, setOverrideReason] = useState("");

  const listInput = useMemo(() => ({ tenantId, page, pageSize: 10, ...(status === "all" ? {} : { status }), ...(search.trim() ? { search: search.trim() } : {}) }), [tenantId, page, search, status]);
  const detailInput = useMemo(() => ({ tenantId, quoteId: editingQuoteId ?? 0 }), [tenantId, editingQuoteId]);
  const list = trpc.quotes.list.useQuery(listInput, { enabled: Boolean(tenantId) });
  const detail = trpc.quotes.detail.useQuery(detailInput, { enabled: Boolean(tenantId && editingQuoteId) });

  useEffect(() => {
    if (detail.data) {
      setDiscounts(Object.fromEntries(detail.data.items.map(item => [item.id, String(Number(item.discount))])));
      setOverrideReason("");
    }
  }, [detail.data]);

  const send = trpc.quotes.send.useMutation({
    onSuccess: async result => {
      await navigator.clipboard.writeText(result.preparedMessage);
      toast.success("Mensagem preparada e copiada. Revise antes de enviar no WhatsApp.");
      utils.quotes.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const applyDiscounts = trpc.quotes.applyDiscounts.useMutation({
    onSuccess: async () => {
      toast.success("Descontos e margem atualizados.");
      setEditingQuoteId(null);
      await Promise.all([utils.quotes.list.invalidate(), utils.quotes.detail.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const draftDiscount = useMemo(() => detail.data?.items.reduce((sum, item) => sum + Number(discounts[item.id] || 0), 0) ?? 0, [detail.data, discounts]);
  const draftTotal = detail.data ? Number(detail.data.quote.subtotal) - draftDiscount : 0;
  const items = list.data?.items ?? [];
  const awaitingResponseCount = items.filter(({ quote }) => ["sent", "viewed"].includes(quote.status)).length;
  const preparationCount = items.filter(({ quote }) => ["draft", "ready"].includes(quote.status)).length;
  const approvedCount = items.filter(({ quote }) => quote.status === "approved").length;
  const expiringCount = items.filter(({ quote }) => ["draft", "ready", "sent", "viewed"].includes(quote.status) && getQuoteValidityState(quote.validUntil).urgency !== "normal").length;
  const hasFilters = status !== "all" || Boolean(search.trim());

  const submitDiscounts = () => {
    if (!tenant || !editingQuoteId || !detail.data) return;
    applyDiscounts.mutate({ tenantId: tenant.id, quoteId: editingQuoteId, items: detail.data.items.map(item => ({ quoteItemId: item.id, discount: Number(discounts[item.id] || 0) })), overrideReason: overrideReason.trim() || undefined });
  };
  const resetQueuePage = () => { setPage(1); setEditingQuoteId(null); };
  const changeStatus = (value: (typeof statuses)[number] | "all") => { setStatus(value); resetQueuePage(); };

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Orçamentos, descontos e mensagens preparadas só podem ser gerenciados dentro de uma oficina ativa.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
    <main className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Orçamentos</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Revise propostas, conduza a decisão do cliente e transforme aprovações em agenda e execução sem retrabalho.</p></div>
        <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Sem disparos automáticos</Badge>
      </header>

      <section className="overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-white shadow-sm" aria-label="Resumo da fila de orçamentos"><div className="grid gap-px bg-violet-100 md:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]"><div className="bg-white/80 p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Painel comercial</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Conduza cada proposta até a decisão.</p><p className="mt-1 text-sm text-slate-600">Os indicadores consideram os orçamentos exibidos nesta página, respeitando a busca e o status escolhidos.</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Em preparação</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{preparationCount}</p><p className="mt-1 text-xs text-slate-500">Rascunhos e propostas prontas</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Aguardam cliente</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{awaitingResponseCount}</p><p className="mt-1 text-xs text-slate-500">Enviados ou já visualizados</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Em atenção</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{expiringCount}</p><p className="mt-1 text-xs text-slate-500">Validade curta ou expirada</p></div></div></section>

      <Card className="border-slate-200 shadow-sm"><CardHeader className="gap-4 xl:flex-row xl:items-end xl:justify-between"><div><CardTitle className="inline-flex items-center gap-2 text-lg"><ListChecks className="h-4 w-4 text-orange-700" />Fila de orçamentos</CardTitle><CardDescription>Busque por número, cliente, placa ou veículo. Custos e margens só são retornados para perfis financeiros.</CardDescription></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1"><Label htmlFor="quote-search" className="text-xs">Buscar</Label><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="quote-search" className="h-10 min-w-0 pl-8" value={search} onChange={event => { setSearch(event.target.value); resetQueuePage(); }} placeholder="Número, cliente ou placa" aria-describedby="quote-search-help" disabled={list.isLoading || list.isError} /></div><span id="quote-search-help" className="sr-only">Busca por número do orçamento, cliente, placa, marca ou modelo do veículo.</span></div><div className="grid gap-1"><Label htmlFor="quote-status" className="text-xs">Status</Label><select id="quote-status" className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" value={status} onChange={event => changeStatus(event.target.value as (typeof statuses)[number] | "all")} aria-busy={list.isLoading} aria-invalid={list.isError} disabled={list.isLoading || list.isError}><option value="all">Todos</option>{statuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></div></div></CardHeader>
        <CardContent className="border-t border-slate-100 pt-4"><div className="mb-4 flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-slate-500">Atalhos:</span>{(["draft", "ready", "sent", "viewed", "approved"] as const).map(value => <Button key={value} size="sm" variant={status === value ? "default" : "outline"} className={status === value ? "bg-slate-950 hover:bg-slate-800" : "bg-white"} onClick={() => changeStatus(value)}>{labels[value]}</Button>)}{hasFilters ? <Button size="sm" variant="ghost" onClick={() => { setSearch(""); changeStatus("all"); }}><FilterX className="mr-1.5 h-3.5 w-3.5" />Limpar filtros</Button> : null}</div>
          {list.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-32" key={index} />)}</div> : list.isError ? <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">Não foi possível carregar os orçamentos. Atualize a página e tente novamente.</div> : items.length ? <div className="space-y-3">
            {items.map(({ quote, customer, vehicle }) => { const nextAction = getQuoteNextAction(quote.status as QuoteQueueStatus); const validity = getQuoteValidityState(quote.validUntil); return <Card key={quote.id} className="overflow-hidden border-slate-200 shadow-sm transition-shadow hover:shadow-md"><div className={validity.urgency === "critical" ? "h-1 bg-red-500" : validity.urgency === "attention" ? "h-1 bg-amber-400" : "h-1 bg-slate-200"} /><CardContent className="flex flex-col gap-5 p-5 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">Orçamento #{String(quote.number).padStart(6, "0")}</p><Badge variant="outline" className={getQuoteStatusTone(quote.status as QuoteQueueStatus)}>{labels[quote.status] ?? quote.status}</Badge></div><p className="mt-2 text-sm font-medium text-slate-700">{customer.name} <span className="font-normal text-slate-400">·</span> {vehicle.make} {vehicle.model} <span className="font-normal text-slate-400">·</span> <strong>{money.format(Number(quote.total))}</strong></p><p className={validity.urgency === "normal" ? "mt-2 inline-flex items-center gap-1 text-xs text-slate-500" : "mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-800"}><CalendarClock className="h-3.5 w-3.5" />{validity.label} · até {new Date(quote.validUntil).toLocaleDateString("pt-BR")}</p></div><div className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3 xl:max-w-xs"><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><AlertCircle className="h-3.5 w-3.5 text-orange-700" />Próxima ação</p><p className="mt-1 text-sm font-semibold text-slate-900">{nextAction.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{nextAction.description}</p></div><div className="flex flex-wrap gap-2 xl:flex-col xl:items-stretch">{quote.status === "approved" ? <Link href={`/operacao?orcamento=${quote.id}`}><a className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"><CalendarClock className="mr-2 h-4 w-4" />Agendar serviço</a></Link> : null}<Button size="sm" variant="outline" disabled={!['draft', 'ready'].includes(quote.status)} onClick={() => setEditingQuoteId(quote.id)}><Tag className="mr-2 h-4 w-4" />Desconto</Button><Button size="sm" disabled={send.isPending || ["approved", "rejected", "expired", "cancelled"].includes(quote.status)} onClick={() => send.mutate({ tenantId, quoteId: quote.id })}><Send className="mr-2 h-4 w-4" />{send.isPending ? "Preparando…" : "Preparar envio"}</Button></div></CardContent></Card>; })}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-sm text-slate-500">Página {list.data?.page ?? page}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(current => current - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" disabled={!list.data?.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
          </div> : <div className="rounded-xl border border-dashed border-slate-300 bg-gradient-to-b from-white to-violet-50/40 py-14 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-violet-50 text-violet-700"><FileText className="h-6 w-6" /></div><p className="mt-4 font-medium text-slate-900">{hasFilters ? "Nenhum orçamento neste filtro" : "A fila de propostas está pronta"}</p><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{hasFilters ? "Ajuste a busca ou os status para reencontrar orçamentos desta oficina." : "Gere um orçamento a partir de uma solicitação com serviço vinculado para iniciar a negociação."}</p>{hasFilters ? <Button variant="outline" className="mt-4" onClick={() => { setSearch(""); changeStatus("all"); }}><FilterX className="mr-2 h-4 w-4" />Limpar filtros</Button> : null}</div>}
        </CardContent>
      </Card>
      <p className="flex items-center gap-2 text-xs text-slate-500"><Copy className="h-3.5 w-3.5" />Ao preparar o envio, o texto é apenas copiado para revisão no WhatsApp; o sistema não dispara mensagens.</p>
    </main>

    <Dialog open={Boolean(editingQuoteId)} onOpenChange={open => { if (!open) setEditingQuoteId(null); }}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Revisar descontos do orçamento</DialogTitle><DialogDescription>Os limites do seu perfil e a margem mínima configurada serão validados antes de salvar.</DialogDescription></DialogHeader>{detail.isLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-12" key={index} />)}</div> : detail.isError ? <p className="text-sm text-red-700" role="alert">Não foi possível carregar os itens deste orçamento.</p> : detail.data ? <div className="space-y-4"><div className="max-h-64 space-y-3 overflow-y-auto pr-1">{detail.data.items.map(item => { const gross = Number(item.quantity) * Number(item.unitPrice); return <div className="grid grid-cols-[1fr_8rem] items-center gap-4 rounded-lg border border-slate-200 p-3" key={item.id}><div><p className="text-sm font-medium text-slate-900">{item.description}</p><p className="text-xs text-slate-500">{Number(item.quantity)} × {money.format(Number(item.unitPrice))} · máximo {money.format(gross)}</p></div><Input aria-label={`Desconto para ${item.description}`} min={0} max={gross} step="0.01" type="number" value={discounts[item.id] ?? "0"} onChange={event => setDiscounts(current => ({ ...current, [item.id]: event.target.value }))} /></div>; })}</div><div className="rounded-lg bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Desconto total</span><strong>{money.format(draftDiscount)}</strong></div><div className="mt-1 flex justify-between text-base text-slate-950"><span>Novo total</span><strong>{money.format(draftTotal)}</strong></div></div><div className="space-y-2"><Label htmlFor="override-reason">Justificativa de exceção</Label><Textarea id="override-reason" value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Obrigatória somente quando um gestor autorizar margem abaixo do mínimo." /></div></div> : null}<DialogFooter><Button variant="outline" onClick={() => setEditingQuoteId(null)}>Cancelar</Button><Button disabled={!detail.data || applyDiscounts.isPending} onClick={submitDiscounts}>{applyDiscounts.isPending ? "Validando…" : "Aplicar descontos"}</Button></DialogFooter></DialogContent>
    </Dialog>
  </DashboardLayout>;
}
