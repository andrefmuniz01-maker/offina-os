import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getSupportTenantId, isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { buildWhatsappLink, renderQuoteMessageTemplate } from "@/lib/whatsappLink";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CalendarClock, ChevronLeft, ChevronRight, Copy, FileText, FilterX, Link2, MessageCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: FileText, label: "Novas solicitações", path: "/solicitacoes" },
  { icon: FileText, label: "Orçamentos", path: "/orcamentos" },
];
const statusLabels = { draft: "Rascunho", ready: "Pronto", sent: "Enviado", viewed: "Visualizado", approved: "Aprovado", rejected: "Recusado", expired: "Expirado", cancelled: "Cancelado" } as const;
const statusTones = { draft: "bg-slate-100 text-slate-700", ready: "bg-blue-50 text-blue-800", sent: "bg-amber-50 text-amber-900", viewed: "bg-violet-50 text-violet-800", approved: "bg-emerald-50 text-emerald-800", rejected: "bg-red-50 text-red-800", expired: "bg-slate-100 text-slate-600", cancelled: "bg-slate-100 text-slate-600" } as const;
type QuoteStatus = keyof typeof statusLabels;
type QuoteGroup = "aguardando_retorno" | "aprovados" | "recusados";
const groupStatuses: Record<QuoteGroup, QuoteStatus[]> = {
  aguardando_retorno: ["sent", "viewed"],
  aprovados: ["approved"],
  recusados: ["rejected", "expired", "cancelled"],
};
const groupLabels: Record<QuoteGroup, string> = {
  aguardando_retorno: "Aguardando retorno",
  aprovados: "Aprovados",
  recusados: "Recusados",
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function SupabaseQuotes() {
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, isDemoWorkspace(), getSupportTenantId())?.tenant;
  const tenantId = tenant?.id ?? 0;
  const [group, setGroup] = useState<QuoteGroup>("aguardando_retorno");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const [discounts, setDiscounts] = useState<Record<number, string>>({});
  const [overrideReason, setOverrideReason] = useState("");
  const [shareConfirmationOpen, setShareConfirmationOpen] = useState(false);
  const [preparedShare, setPreparedShare] = useState<{ publicUrl: string; message: string; whatsappLink: string; quoteNumber: number } | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleDuration, setScheduleDuration] = useState("60");
  const [scheduleBay, setScheduleBay] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const listInput = useMemo(() => ({ tenantId, statuses: groupStatuses[group], search: search.trim() || undefined, page, pageSize: 12 }), [tenantId, group, search, page]);
  const detailInput = useMemo(() => ({ tenantId, quoteId: selectedQuoteId ?? 0 }), [tenantId, selectedQuoteId]);
  const quotes = trpc.workspaceQuotes.list.useQuery(listInput, { enabled: Boolean(tenantId) });
  const detail = trpc.workspaceQuotes.detail.useQuery(detailInput, { enabled: Boolean(tenantId && selectedQuoteId) });
  const utils = trpc.useUtils();
  const updateDraftDiscounts = trpc.workspaceQuotes.updateDraftDiscounts.useMutation({
    onSuccess: async () => {
      toast.success("Descontos atualizados no rascunho.");
      setOverrideReason("");
      await Promise.all([utils.workspaceQuotes.list.invalidate(), utils.workspaceQuotes.detail.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const finalizeDraft = trpc.workspaceQuotes.finalizeDraft.useMutation({
    onSuccess: async () => {
      toast.success("Proposta pronta para a próxima etapa comercial.");
      setSelectedQuoteId(null);
      await Promise.all([utils.workspaceQuotes.list.invalidate(), utils.workspaceQuotes.detail.invalidate(), utils.workspaceQuoteRequests.list.invalidate(), utils.workspaceQuoteRequests.history.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const prepareManualShare = trpc.workspaceQuotes.prepareManualShare.useMutation({
    onSuccess: async output => {
      const publicUrl = new URL(`/orcamento/${output.publicToken}`, window.location.origin).toString();
      // O link da proposta sempre vai na mensagem, mesmo que o modelo da oficina não tenha o campo {{link}}.
      const message = renderQuoteMessageTemplate(output.messageTemplate, { client: output.customerName, vehicle: output.vehicleName, total: currency.format(output.total), link: publicUrl, workshop: output.workshopName });
      setPreparedShare({ publicUrl, message, whatsappLink: buildWhatsappLink(output.customerWhatsapp, message), quoteNumber: detail.data?.quote.number ?? output.id });
      setShareConfirmationOpen(false);
      setSelectedQuoteId(null);
      toast.success("Proposta pronta para enviar ao cliente.");
      await Promise.all([utils.workspaceQuotes.list.invalidate(), utils.workspaceQuotes.detail.invalidate(), utils.workspaceQuoteRequests.list.invalidate(), utils.workspaceQuoteRequests.history.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const scheduleFromApprovedQuote = trpc.workspaceOperations.scheduleFromApprovedQuote.useMutation({
    onSuccess: async output => {
      toast.success(`Agendamento criado e OS #${String(output.workOrderNumber).padStart(6, "0")} vinculada.`);
      setScheduleDialogOpen(false);
      setScheduleStart(""); setScheduleDuration("60"); setScheduleBay(""); setScheduleNotes("");
      setSelectedQuoteId(null);
      await Promise.all([utils.workspaceQuotes.list.invalidate(), utils.workspaceQuotes.detail.invalidate(), utils.workspaceQuoteRequests.list.invalidate(), utils.workspaceQuoteRequests.history.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const hasFilters = Boolean(search.trim());

  useEffect(() => {
    if (detail.data) {
      setDiscounts(Object.fromEntries(detail.data.items.map(item => [item.id, String(item.discount)])));
      setOverrideReason("");
    }
  }, [detail.data]);

  const resetPage = () => { setPage(1); setSelectedQuoteId(null); };
  const saveDiscounts = () => {
    if (!tenantId || !selectedQuoteId || !detail.data || detail.data.quote.status !== "draft") return;
    updateDraftDiscounts.mutate({ tenantId, quoteId: selectedQuoteId, expectedUpdatedAt: detail.data.quote.updatedAt, discounts: detail.data.items.map(item => ({ quoteItemId: item.id, discount: Number(discounts[item.id] || 0) })), overrideReason: overrideReason.trim() || undefined });
  };
  const finishDraft = () => {
    if (!tenantId || !selectedQuoteId || !detail.data || detail.data.quote.status !== "draft") return;
    finalizeDraft.mutate({ tenantId, quoteId: selectedQuoteId, expectedUpdatedAt: detail.data.quote.updatedAt });
  };
  const confirmManualShare = () => {
    if (!tenantId || !selectedQuoteId || !detail.data || detail.data.quote.status !== "ready") return;
    prepareManualShare.mutate({ tenantId, quoteId: selectedQuoteId, expectedUpdatedAt: detail.data.quote.updatedAt });
  };
  const copyPreparedText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error(`Não foi possível copiar ${label.toLocaleLowerCase("pt-BR")}. Selecione e copie manualmente.`);
    }
  };
  const scheduleApprovedQuote = () => {
    if (!tenantId || !selectedQuoteId || !detail.data || detail.data.quote.status !== "approved") return;
    const start = new Date(scheduleStart);
    const duration = Number(scheduleDuration);
    if (!scheduleStart || Number.isNaN(start.getTime()) || !Number.isInteger(duration) || duration < 5 || duration > 1440) {
      toast.error("Informe uma data/hora e duração entre 5 minutos e 24 horas.");
      return;
    }
    scheduleFromApprovedQuote.mutate({ tenantId, quoteId: selectedQuoteId, scheduledStart: start.toISOString(), scheduledEnd: new Date(start.getTime() + duration * 60_000).toISOString(), bay: scheduleBay.trim() || undefined, notes: scheduleNotes.trim() || undefined });
  };
  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Rascunhos e propostas pertencem a uma oficina ativa. A conta Super Admin permanece separada da operação cotidiana.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
    <main className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Orçamentos</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Rascunhos internos criados a partir da fila comercial. Envio, aprovação, reserva, agenda e financeiro continuam em etapas separadas.</p></div><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Leitura comercial</Badge></header>
      <Card className="border-slate-200 shadow-none"><CardHeader className="gap-4 xl:flex-row xl:items-end xl:justify-between"><div><CardTitle>Orçamentos</CardTitle><CardDescription>Propostas já enviadas ao cliente. Pesquise por número, cliente, placa ou veículo. Custos e margens não são exibidos nesta visão comercial.</CardDescription></div><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input className="h-10 min-w-52 pl-8" value={search} onChange={event => { setSearch(event.target.value); resetPage(); }} placeholder="Número, cliente ou placa" aria-label="Buscar orçamentos" /></div></CardHeader><CardContent className="border-t border-slate-100 pt-4"><div className="mb-4 flex flex-wrap gap-2">{(Object.keys(groupLabels) as QuoteGroup[]).map(value => <Button key={value} size="sm" variant={group === value ? "default" : "outline"} className={group === value ? "bg-slate-950 hover:bg-slate-800" : "bg-white"} onClick={() => { setGroup(value); resetPage(); }}>{groupLabels[value]}</Button>)}{hasFilters ? <Button size="sm" variant="ghost" onClick={() => { setSearch(""); resetPage(); }}><FilterX className="mr-1.5 h-3.5 w-3.5" />Limpar busca</Button> : null}</div>
        {quotes.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-28" key={index} />)}</div> : null}
        {quotes.isError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">Não foi possível carregar os orçamentos agora. Tente novamente.</p> : null}
        {!quotes.isLoading && !quotes.isError && (quotes.data?.items.length ?? 0) === 0 ? <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center"><p className="font-medium text-slate-900">{hasFilters ? "Nenhum orçamento neste filtro" : "Nenhum rascunho registrado"}</p><p className="mt-1 text-sm text-slate-500">Crie um rascunho a partir de uma solicitação em orçamento para iniciar a revisão comercial.</p></div> : null}
        <div className="space-y-3">{quotes.data?.items.map(({ quote, customer, vehicle }) => <article className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center" key={quote.id}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">Orçamento #{String(quote.number).padStart(6, "0")}</p><Badge className={statusTones[quote.status]}>{statusLabels[quote.status]}</Badge></div><p className="mt-2 text-sm text-slate-700">{customer.name} <span className="text-slate-400">·</span> {vehicle.make} {vehicle.model}{vehicle.plate ? <span className="text-slate-400"> · {vehicle.plate}</span> : null}</p><p className="mt-1 text-xs text-slate-500">Validade: {new Date(quote.validUntil).toLocaleDateString("pt-BR")} <span className="text-slate-400">·</span> Total: <strong className="text-slate-700">{currency.format(quote.total)}</strong></p></div><Button size="sm" variant="outline" onClick={() => setSelectedQuoteId(quote.id)}>{quote.status === "draft" ? "Revisar rascunho" : "Revisar proposta"}</Button></article>)}</div>
        {quotes.data?.items.length ? <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Página {quotes.data.page}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => current - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button size="sm" variant="outline" disabled={!quotes.data.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div> : null}
      </CardContent></Card>
    </main>
    <Dialog open={Boolean(selectedQuoteId)} onOpenChange={open => { if (!open) { setSelectedQuoteId(null); setShareConfirmationOpen(false); setScheduleDialogOpen(false); } }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{detail.data?.quote.status === "draft" ? "Revisão do rascunho" : "Revisão da proposta"}</DialogTitle><DialogDescription>{detail.data?.quote.status === "ready" ? "A proposta está pronta. Você poderá preparar um link e uma mensagem para cópia manual, sem qualquer envio automático." : detail.data?.quote.status === "approved" ? "A proposta foi aprovada. Agende a execução sem redigitar os dados comerciais; a baixa de estoque e o financeiro permanecem em etapas posteriores." : "Conferência interna e descontos comerciais. Ao finalizar, o estoque será revalidado, mas não será reservado nem movimentado."}</DialogDescription></DialogHeader>{detail.isLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-12" key={index} />)}</div> : null}{detail.isError ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">Não foi possível carregar este rascunho.</p> : null}{detail.data ? <div className="space-y-4"><div className="grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs font-medium text-slate-500">Cliente</p><p className="mt-1 font-medium text-slate-900">{detail.data.customer.name}</p></div><div><p className="text-xs font-medium text-slate-500">Veículo</p><p className="mt-1 font-medium text-slate-900">{detail.data.vehicle.make} {detail.data.vehicle.model}</p></div></div><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium">Quantidade</th><th className="px-3 py-2 font-medium">Unitário</th><th className="px-3 py-2 font-medium">Desconto</th><th className="px-3 py-2 text-right font-medium">Total</th></tr></thead><tbody>{detail.data.items.map(item => { const discount = Number(discounts[item.id] || 0); return <tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3 font-medium text-slate-900">{item.description}</td><td className="px-3 py-3 tabular-nums text-slate-700">{item.quantity}</td><td className="px-3 py-3 tabular-nums text-slate-700">{currency.format(item.unitPrice)}</td><td className="px-3 py-3">{detail.data.quote.status === "draft" ? <Input aria-label={`Desconto para ${item.description}`} className="h-8 w-28" min={0} max={item.quantity * item.unitPrice} step="0.01" type="number" value={discounts[item.id] ?? "0"} onChange={event => setDiscounts(current => ({ ...current, [item.id]: event.target.value }))} /> : currency.format(item.discount)}</td><td className="px-3 py-3 text-right tabular-nums text-slate-900">{currency.format(item.quantity * item.unitPrice - discount)}</td></tr>; })}</tbody></table></div><div className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span className="font-medium text-slate-700">Total da proposta</span><strong className="text-slate-950">{currency.format(detail.data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice - Number(discounts[item.id] || 0), 0))}</strong></div>{detail.data.quote.status === "draft" ? <div className="space-y-2"><Label htmlFor="quote-override-reason">Justificativa de exceção</Label><Textarea id="quote-override-reason" value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Obrigatória apenas quando um gestor autorizar margem abaixo do mínimo." /></div> : null}{detail.data.quote.status === "draft" ? <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-relaxed text-slate-600">Salve descontos pendentes antes de finalizar. A proposta pronta continuará interna: ainda não haverá envio ao cliente ou reserva de estoque.</p><div className="flex gap-2"><Button variant="outline" disabled={updateDraftDiscounts.isPending} onClick={saveDiscounts}>{updateDraftDiscounts.isPending ? "Salvando…" : "Salvar descontos"}</Button><Button disabled={finalizeDraft.isPending || updateDraftDiscounts.isPending || detail.data.items.some(item => Number(discounts[item.id] || 0) !== item.discount)} onClick={finishDraft}>{finalizeDraft.isPending ? "Finalizando…" : "Finalizar proposta"}</Button></div></div> : null}{detail.data.quote.status === "ready" ? <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-relaxed text-slate-600">O preparo revalida o estoque e substitui o token anterior. Nenhuma mensagem será enviada e o cliente poderá decidir pelo link protegido.</p><Button disabled={prepareManualShare.isPending} onClick={() => setShareConfirmationOpen(true)}><Link2 className="mr-2 h-4 w-4" />Preparar link e mensagem</Button></div> : null}{detail.data.quote.status === "approved" ? <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-md text-xs leading-relaxed text-slate-600">A reserva já foi criada na aprovação. Defina data, duração, baia e observações; cliente, veículo, itens e valores serão herdados na nova OS.</p><Button onClick={() => setScheduleDialogOpen(true)}><CalendarClock className="mr-2 h-4 w-4" />Agendar execução</Button></div> : null}</div> : null}</DialogContent></Dialog>
    <Dialog open={shareConfirmationOpen} onOpenChange={setShareConfirmationOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Preparar compartilhamento manual?</DialogTitle><DialogDescription>Esta ação gera um novo link protegido e muda a proposta para enviada. Nenhuma mensagem será disparada: você decide onde e quando copiar o conteúdo preparado.</DialogDescription></DialogHeader><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">O estoque será conferido novamente, mas não será reservado ou baixado. Agenda, OS, financeiro e aprovação pública continuam desligados.</div><div className="flex justify-end gap-2"><Button variant="outline" disabled={prepareManualShare.isPending} onClick={() => setShareConfirmationOpen(false)}>Cancelar</Button><Button disabled={prepareManualShare.isPending} onClick={confirmManualShare}>{prepareManualShare.isPending ? "Preparando…" : "Confirmar e preparar"}</Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(preparedShare)} onOpenChange={open => { if (!open) setPreparedShare(null); }}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Enviar proposta #{String(preparedShare?.quoteNumber ?? 0).padStart(6, "0")}</DialogTitle><DialogDescription>A mensagem já inclui o link da proposta. Ao abrir o WhatsApp, é só conferir e enviar.</DialogDescription></DialogHeader><div className="space-y-5"><Button asChild size="lg" className="w-full" disabled={!preparedShare}><a href={preparedShare?.whatsappLink} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 h-5 w-5" />Enviar pelo WhatsApp</a></Button><div className="space-y-2"><Label htmlFor="prepared-quote-message">Mensagem</Label><Textarea id="prepared-quote-message" readOnly className="min-h-32 text-sm" value={preparedShare?.message ?? ""} /></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={!preparedShare} onClick={() => preparedShare && void copyPreparedText(preparedShare.message, "Mensagem")}><Copy className="mr-2 h-4 w-4" />Copiar mensagem</Button><Button type="button" variant="outline" size="sm" disabled={!preparedShare} onClick={() => preparedShare && void copyPreparedText(preparedShare.publicUrl, "Link")}><Link2 className="mr-2 h-4 w-4" />Copiar só o link</Button></div></div></DialogContent></Dialog>
    <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Agendar execução</DialogTitle><DialogDescription>A agenda e a OS receberão automaticamente os dados da proposta aprovada. Este passo não baixa estoque nem cria lançamento financeiro.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-2"><Label htmlFor="schedule-start">Início</Label><Input id="schedule-start" type="datetime-local" value={scheduleStart} onChange={event => setScheduleStart(event.target.value)} /></div><div className="grid gap-2 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="schedule-duration">Duração (minutos)</Label><Input id="schedule-duration" type="number" min={5} max={1440} step={5} value={scheduleDuration} onChange={event => setScheduleDuration(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="schedule-bay">Baia</Label><Input id="schedule-bay" maxLength={80} value={scheduleBay} onChange={event => setScheduleBay(event.target.value)} placeholder="Ex.: 2" /></div></div><div className="grid gap-2"><Label htmlFor="schedule-notes">Observações operacionais</Label><Textarea id="schedule-notes" maxLength={4000} value={scheduleNotes} onChange={event => setScheduleNotes(event.target.value)} placeholder="Informações para a equipe antes do recebimento." /></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">O profissional pode ser atribuído na OS posteriormente. A reserva existente será vinculada à OS; o estoque físico não será baixado nesta etapa.</div><div className="flex justify-end gap-2"><Button variant="outline" disabled={scheduleFromApprovedQuote.isPending} onClick={() => setScheduleDialogOpen(false)}>Cancelar</Button><Button disabled={scheduleFromApprovedQuote.isPending} onClick={scheduleApprovedQuote}>{scheduleFromApprovedQuote.isPending ? "Agendando…" : "Criar agenda e OS"}</Button></div></div></DialogContent></Dialog>
  </DashboardLayout>;
}
