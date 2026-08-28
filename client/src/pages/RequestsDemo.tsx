import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { getQueueUrgency, getRequestNextAction, getRequestStatusTone, requestStatusLabels, type RequestQueueStatus } from "@/lib/requestQueue";
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Clock3, FileText, FilterX, History, ListChecks, PlusCircle, Search, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: FileText, label: "Solicitações", path: "/solicitacoes" },
];

const labels: Record<string, string> = requestStatusLabels;
const eventLabels: Record<string, string> = {
  created: "Solicitação criada",
  status_changed: "Status atualizado",
  assigned: "Responsável atualizado",
  note_added: "Observação registrada",
  quote_created: "Orçamento criado",
  quote_draft_created: "Rascunho de orçamento criado",
};
const availabilityLabels = {
  available: "Disponível",
  insufficient: "Estoque insuficiente",
  unavailable: "Indisponível",
  not_applicable: "Serviço",
} as const;
const availabilityTones = {
  available: "bg-emerald-50 text-emerald-800 hover:bg-emerald-50",
  insufficient: "bg-amber-50 text-amber-900 hover:bg-amber-50",
  unavailable: "bg-red-50 text-red-800 hover:bg-red-50",
  not_applicable: "bg-slate-100 text-slate-700 hover:bg-slate-100",
} as const;
type RequestStatus = "all" | "new" | "in_analysis" | "awaiting_information" | "in_quoting" | "ready" | "sent" | "approved" | "rejected" | "expired" | "cancelled";

function eventDetail(event: { type: string; metadata: unknown }) {
  const metadata = (event.metadata ?? {}) as Record<string, unknown>;
  if (event.type === "status_changed") return `${labels[String(metadata.from)] ?? metadata.from ?? ""} → ${labels[String(metadata.to)] ?? metadata.to ?? ""}`;
  if (event.type === "assigned") return metadata.assignedToUserId ? `Responsável definido: ${String(metadata.assignedToUserName ?? `usuário interno #${metadata.assignedToUserId}`)}` : "Responsável removido";
  if (event.type === "note_added") return String(metadata.note ?? "");
  if (event.type === "created") return metadata.source === "public_link" ? "Recebida pelo link público" : "Registrada internamente";
  return "Registro operacional da solicitação";
}

function formatQueueMinutes(queueMinutes: number) {
  if (queueMinutes < 1) return "Atualizada agora";
  if (queueMinutes < 60) return `Há ${queueMinutes} min`;
  const hours = Math.floor(queueMinutes / 60);
  const minutes = queueMinutes % 60;
  return minutes ? `Há ${hours} h ${minutes} min` : `Há ${hours} h`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function Requests() {
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, isDemoWorkspace())?.tenant;
  const tenantId = tenant?.id ?? 0;
  const [status, setStatus] = useState<RequestStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [historyRequestId, setHistoryRequestId] = useState<number | null>(null);
  const [preparationRequestId, setPreparationRequestId] = useState<number | null>(null);
  const [createdDrafts, setCreatedDrafts] = useState<Record<number, { number: number; total: number }>>({});
  const utils = trpc.useUtils();
  const requests = trpc.workspaceQuoteRequests.list.useQuery(
    { tenantId, status: status === "all" ? undefined : status, search: search.trim() || undefined, page, pageSize: 12 },
    { enabled: Boolean(tenantId) },
  );
  const assignees = trpc.workspaceQuoteRequests.assignees.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const history = trpc.workspaceQuoteRequests.history.useQuery(
    { tenantId, quoteRequestId: historyRequestId ?? 0 },
    { enabled: Boolean(tenantId && historyRequestId) },
  );
  const preparation = trpc.workspaceQuoteRequests.prepare.useQuery(
    { tenantId, quoteRequestId: preparationRequestId ?? 0 },
    { enabled: Boolean(tenantId && preparationRequestId) },
  );
  const updateStatus = trpc.workspaceQuoteRequests.update.useMutation({
    onSuccess: () => {
      toast.success("Solicitação atualizada.");
      utils.workspaceQuoteRequests.list.invalidate();
      utils.workspaceQuoteRequests.history.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const createDraft = trpc.workspaceQuoteRequests.createDraft.useMutation({
    onSuccess: (draft, variables) => {
      setCreatedDrafts(current => ({ ...current, [variables.quoteRequestId]: { number: draft.number, total: draft.total } }));
      toast.success(`Rascunho #${String(draft.number).padStart(6, "0")} criado para conferência.`);
      utils.workspaceQuoteRequests.history.invalidate();
      utils.workspaceQuoteRequests.prepare.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const items = requests.data?.items ?? [];
  const unassignedCount = items.filter(({ request }) => !request.assignedToUserId).length;
  const urgentCount = items.filter(({ queueMinutes }) => getQueueUrgency(queueMinutes) !== "normal").length;
  const activeCount = items.filter(({ request }) => ["new", "in_analysis", "awaiting_information", "in_quoting", "ready"].includes(request.status)).length;
  const hasFilters = status !== "all" || Boolean(search.trim());

  if (mine.isLoading) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  }

  if (!tenant || !tenantId) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Solicitações, atribuições e preparação de orçamento pertencem a uma oficina ativa. Peça a um Super Admin para associar seu acesso antes de atuar nesta fila.</CardDescription></CardHeader></Card></main></DashboardLayout>;
  }

  return (
    <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
      <main className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
          <div>
            <Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Solicitações de orçamento</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Central de entrada comercial: priorize atendimentos, defina responsáveis e conduza cada solicitação até a conferência da composição.</p>
          </div>
          <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Fluxo comercial</Badge>
        </header>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-none" aria-label="Resumo da fila comercial">
          <div className="grid gap-px bg-slate-200 md:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]">
            <div className="bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Painel da fila</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Organize o que precisa de ação agora.</p><p className="mt-1 text-sm text-slate-600">Os indicadores consideram os itens exibidos nesta página e preservam os filtros aplicados.</p></div>
            <div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Em tratamento</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{activeCount}</p><p className="mt-1 text-xs text-slate-500">Solicitações ainda no fluxo comercial</p></div>
            <div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Sem responsável</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{unassignedCount}</p><p className="mt-1 text-xs text-slate-500">Distribua a próxima ação para a equipe</p></div>
            <div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Em atenção</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{urgentCount}</p><p className="mt-1 text-xs text-slate-500">Itens há mais de quatro horas na fila</p></div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-none" aria-label="Filtros da fila comercial">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div><p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950"><ListChecks className="h-4 w-4 text-orange-700" />Fila comercial</p><p className="mt-1 text-xs text-slate-500">Busque por cliente, WhatsApp, placa ou veículo e filtre por etapa.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="request-search">Buscar</label><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input id="request-search" className="h-10 min-w-52 pl-8" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setHistoryRequestId(null); setPreparationRequestId(null); }} placeholder="Cliente, WhatsApp ou placa" /></div></div>
              <div className="grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="request-status">Status</label><select id="request-status" className="h-10 min-w-52 rounded-md border border-slate-200 bg-white px-2 text-sm" value={status} onChange={event => { setStatus(event.target.value as RequestStatus); setPage(1); setHistoryRequestId(null); setPreparationRequestId(null); }}><option value="all">Todos os status</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><span className="text-xs font-medium text-slate-500">Atalhos:</span>{(["new", "in_analysis", "awaiting_information", "ready", "sent"] as RequestStatus[]).map(value => <Button key={value} size="sm" variant={status === value ? "default" : "outline"} className={status === value ? "bg-slate-950 hover:bg-slate-800" : "bg-white"} onClick={() => { setStatus(value); setPage(1); setHistoryRequestId(null); setPreparationRequestId(null); }}>{labels[value]}</Button>)}{hasFilters ? <Button size="sm" variant="ghost" onClick={() => { setStatus("all"); setSearch(""); setPage(1); setHistoryRequestId(null); setPreparationRequestId(null); }}><FilterX className="mr-1.5 h-3.5 w-3.5" />Limpar filtros</Button> : null}</div>
        </section>

        {requests.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-32" key={index} />)}</div> : null}
        {requests.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-5 text-sm text-red-900">{requests.error.data?.code === "FORBIDDEN" ? "Seu perfil não possui acesso à fila comercial desta oficina." : "Não foi possível carregar as solicitações. Tente novamente."}</CardContent></Card> : null}

        {!requests.isLoading && !requests.isError && items.length ? <div className="space-y-3">
          {items.map(({ request, customer, vehicle, assignedUser, queueMinutes }) => {
            const nextAction = getRequestNextAction(request.status as RequestQueueStatus, Boolean(request.serviceId));
            const urgency = getQueueUrgency(queueMinutes);
            const isPreparationOpen = preparationRequestId === request.id;
            const createdDraft = createdDrafts[request.id];
            return <Card key={request.id} className="overflow-hidden border-slate-200 shadow-sm transition-shadow hover:shadow-md">
              <div className={urgency === "critica" ? "h-1 bg-red-500" : urgency === "atenção" ? "h-1 bg-amber-400" : "h-1 bg-slate-200"} />
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">#{String(request.number).padStart(6, "0")} · {request.serviceLabel}</p><Badge variant="outline" className={getRequestStatusTone(request.status as RequestQueueStatus)}>{labels[request.status] ?? request.status}</Badge><Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{request.source === "public_link" ? "Link público" : request.source}</Badge></div><p className="mt-2 text-sm font-medium text-slate-700">{customer?.name ?? request.requesterName} <span className="font-normal text-slate-400">·</span> {vehicle ? `${vehicle.make} ${vehicle.model}` : "Veículo a confirmar"}</p><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span className={urgency === "normal" ? "inline-flex items-center gap-1" : "inline-flex items-center gap-1 font-semibold text-amber-800"}><Clock3 className="h-3.5 w-3.5" />Em fila: {formatQueueMinutes(queueMinutes)}</span><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />Responsável: {assignedUser?.name ?? "Não atribuído"}</span></div><p className="mt-3 max-w-2xl text-sm text-slate-500">{request.description || "Sem observações adicionais."}</p></div>
                  <div className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3 xl:max-w-xs"><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><AlertCircle className="h-3.5 w-3.5 text-orange-700" />Próxima ação</p><p className="mt-1 text-sm font-semibold text-slate-900">{nextAction.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{nextAction.description}</p></div>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setHistoryRequestId(current => current === request.id ? null : request.id)}><History className="mr-2 h-4 w-4" />{historyRequestId === request.id ? "Ocultar trilha" : "Ver trilha"}</Button>
                    {request.status === "new" ? <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId, quoteRequestId: request.id, status: "in_analysis" })}>Iniciar atendimento</Button> : null}
                    {request.status === "awaiting_information" ? <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId, quoteRequestId: request.id, status: "in_analysis" })}>Retomar análise</Button> : null}
                    {request.status === "in_analysis" && request.serviceId ? <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId, quoteRequestId: request.id, status: "in_quoting" }, { onSuccess: () => setPreparationRequestId(request.id) })}>Preparar orçamento</Button> : null}
                    {request.status === "in_quoting" ? <Button size="sm" variant="outline" disabled={isPreparationOpen && preparation.isFetching} onClick={() => setPreparationRequestId(current => current === request.id ? null : request.id)}><Sparkles className="mr-2 h-4 w-4" />{isPreparationOpen ? "Ocultar composição" : "Revisar composição"}</Button> : null}
                    {["new", "in_analysis", "in_quoting"].includes(request.status) ? <Button size="sm" variant="ghost" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId, quoteRequestId: request.id, status: "awaiting_information" })}>Aguardar informação</Button> : null}
                  </div>
                  <div className="flex w-full items-center gap-3 lg:w-auto"><p className="whitespace-nowrap text-xs font-medium text-slate-600">Responsável</p><Select disabled={assignees.isLoading || updateStatus.isPending} value={request.assignedToUserId ? String(request.assignedToUserId) : "unassigned"} onValueChange={value => updateStatus.mutate({ tenantId, quoteRequestId: request.id, status: request.status, assignedToUserId: value === "unassigned" ? null : value })}><SelectTrigger className="w-full lg:w-64"><SelectValue placeholder="Selecionar responsável" /></SelectTrigger><SelectContent><SelectItem value="unassigned">Não atribuído</SelectItem>{assignees.data?.map(member => <SelectItem key={member.id} value={String(member.id)}>{member.name} · {member.role}</SelectItem>)}</SelectContent></Select></div>
                </div>

                {isPreparationOpen ? <section className="border-t border-slate-100 pt-4" aria-live="polite"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-slate-950">Composição sugerida</p><p className="mt-1 text-xs leading-relaxed text-slate-600">Revise catálogo e disponibilidade antes de registrar o rascunho. Esta ação não envia proposta, não reserva estoque e não gera lançamento.</p></div>{preparation.data ? <p className="text-base font-semibold tabular-nums text-slate-950">{formatCurrency(preparation.data.total)}</p> : null}</div>{preparation.isLoading ? <Skeleton className="mt-4 h-28" /> : null}{preparation.isError ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">Não foi possível preparar esta composição agora. Confirme os dados vinculados à solicitação e tente novamente.</p> : null}{preparation.data ? <><div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs font-medium text-slate-500">Cliente</p><p className="mt-1 font-medium text-slate-900">{preparation.data.customer.name}</p></div><div><p className="text-xs font-medium text-slate-500">Veículo</p><p className="mt-1 font-medium text-slate-900">{preparation.data.vehicle.make} {preparation.data.vehicle.model}</p></div><div><p className="text-xs font-medium text-slate-500">Serviço</p><p className="mt-1 font-medium text-slate-900">{preparation.data.service.name}</p></div></div><div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2 font-medium">Composição</th><th className="px-3 py-2 font-medium">Quantidade</th><th className="px-3 py-2 font-medium">Valor unitário</th><th className="px-3 py-2 font-medium">Estoque</th></tr></thead><tbody>{preparation.data.suggestedItems.map((item, index) => <tr className="border-b border-slate-100 last:border-0" key={`${item.itemType}-${item.productId ?? item.serviceId}-${index}`}><td className="px-3 py-3 font-medium text-slate-900">{item.description}</td><td className="px-3 py-3 tabular-nums text-slate-700">{item.quantity}</td><td className="px-3 py-3 tabular-nums text-slate-700">{formatCurrency(item.unitPrice)}</td><td className="px-3 py-3"><Badge className={availabilityTones[item.availability]}>{availabilityLabels[item.availability]}</Badge></td></tr>)}</tbody></table></div>{createdDraft ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950"><p className="font-semibold">Rascunho #{String(createdDraft.number).padStart(6, "0")} registrado</p><p className="mt-1 text-xs text-emerald-900">Total de {formatCurrency(createdDraft.total)}. Edição, envio ao cliente, aprovação e reserva permanecem em etapas separadas da migração.</p></div> : <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl text-xs leading-relaxed text-slate-600">Ao criar, a composição será salva como rascunho auditado e continuará interna. Nenhum link público ou compromisso de estoque será criado.</p><Button size="sm" disabled={createDraft.isPending} onClick={() => createDraft.mutate({ tenantId, quoteRequestId: request.id })}>{createDraft.isPending ? "Criando rascunho…" : "Criar rascunho"}</Button></div>}</> : null}</div></section> : null}
                {historyRequestId === request.id ? <div className="border-t border-slate-100 pt-4">{history.isLoading ? <Skeleton className="h-20" /> : history.data?.length ? <ol className="space-y-3">{history.data.map(event => <li className="rounded-lg bg-slate-50 px-3 py-2" key={event.id}><p className="text-sm font-medium text-slate-800">{eventLabels[event.type] ?? event.type}</p><p className="mt-1 text-xs text-slate-600">{eventDetail(event)}</p><p className="mt-1 text-xs text-slate-400">{new Date(event.createdAt).toLocaleString("pt-BR")}</p></li>)}</ol> : <p className="text-sm text-slate-500">Ainda não há eventos registrados para esta solicitação.</p>}</div> : null}
              </CardContent>
            </Card>;
          })}
          <div className="flex items-center justify-between border-t border-slate-200 pt-4"><p className="text-xs text-slate-500">Página {page}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button size="sm" variant="outline" disabled={!requests.data?.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
        </div> : null}

        {!requests.isLoading && !requests.isError && !items.length ? <Card className="border-dashed border-slate-300 bg-white shadow-none"><CardHeader className="items-center py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-50 text-orange-700"><PlusCircle className="h-6 w-6" /></div><CardTitle className="mt-4">{hasFilters ? "Nenhuma solicitação neste filtro" : "A fila está pronta para receber clientes"}</CardTitle><CardDescription className="max-w-md">{hasFilters ? "Ajuste a busca ou os status para reencontrar solicitações desta oficina." : "Divulgue o link público da oficina para começar a receber pedidos. Nenhum dado demonstrativo é exibido aqui."}</CardDescription>{hasFilters ? <Button variant="outline" className="mt-4" onClick={() => { setStatus("all"); setSearch(""); setPage(1); setHistoryRequestId(null); setPreparationRequestId(null); }}><FilterX className="mr-2 h-4 w-4" />Limpar filtros</Button> : null}</CardHeader></Card> : null}
      </main>
    </DashboardLayout>
  );
}
