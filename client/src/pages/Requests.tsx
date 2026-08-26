import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, FileText, History, PlusCircle, Search, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: FileText, label: "Solicitações", path: "/solicitacoes" }];
const labels: Record<string, string> = { new: "Nova", in_analysis: "Em análise", awaiting_information: "Aguardando informação", in_quoting: "Em orçamento", ready: "Pronta", sent: "Enviada", approved: "Aprovada", rejected: "Recusada", expired: "Expirada", cancelled: "Cancelada" };
const eventLabels: Record<string, string> = { created: "Solicitação criada", status_changed: "Status atualizado", assigned: "Responsável atualizado", note_added: "Observação registrada", quote_created: "Orçamento criado" };
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

export default function Requests() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const [status, setStatus] = useState<RequestStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const requests = trpc.quoteRequests.list.useQuery({ tenantId, status: status === "all" ? undefined : status, search: search.trim() || undefined, page, pageSize: 12 }, { enabled: Boolean(tenantId) });
  const assignees = trpc.quoteRequests.assignees.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const [historyRequestId, setHistoryRequestId] = useState<number | null>(null);
  const history = trpc.quoteRequests.history.useQuery({ tenantId, quoteRequestId: historyRequestId ?? 0 }, { enabled: Boolean(tenantId && historyRequestId) });
  const utils = trpc.useUtils();
  const createQuote = trpc.quotes.createFromSuggestion.useMutation({ onSuccess: data => { toast.success(`Orçamento #${String(data.number).padStart(6, "0")} criado. Revise e envie ao cliente.`); utils.quoteRequests.list.invalidate(); }, onError: error => toast.error(error.message) });
  const updateStatus = trpc.quoteRequests.updateStatus.useMutation({ onSuccess: () => { toast.success("Solicitação atualizada."); utils.quoteRequests.list.invalidate(); utils.quoteRequests.history.invalidate(); }, onError: error => toast.error(error.message) });
  const items = requests.data?.items ?? [];

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Solicitações, atribuições e geração de orçamento pertencem a uma oficina ativa. Peça a um Super Admin para associar seu acesso antes de atuar nesta fila.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}>
    <main className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Solicitações de orçamento</h1><p className="mt-1 text-sm text-slate-500">Solicitações reais enviadas pelos clientes para esta oficina, com origem, responsável e histórico rastreáveis.</p></div>
        <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Fluxo comercial</Badge>
      </header>

      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-slate-900">Fila comercial</p><p className="mt-1 text-xs text-slate-500">Busque por cliente, WhatsApp, placa ou veículo e filtre por etapa.</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="request-search">Buscar</label><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input id="request-search" className="h-9 min-w-52 pl-8" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setHistoryRequestId(null); }} placeholder="Cliente, WhatsApp ou placa" /></div></div><div className="grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="request-status">Status</label><select id="request-status" className="h-9 min-w-52 rounded-md border border-slate-200 bg-white px-2 text-sm" value={status} onChange={event => { setStatus(event.target.value as RequestStatus); setPage(1); setHistoryRequestId(null); }}><option value="all">Todos os status</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div></div>

      {mine.isLoading || requests.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-32" key={index} />)}</div> : null}
      {requests.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-5 text-sm text-red-900">{requests.error.data?.code === "FORBIDDEN" ? "Seu perfil não possui acesso à fila comercial desta oficina." : "Não foi possível carregar as solicitações. Tente novamente."}</CardContent></Card> : null}

      {!mine.isLoading && !requests.isLoading && !requests.isError && items.length ? <div className="space-y-3">
        {items.map(({ request, customer, vehicle, assignedUser, queueMinutes }) => <Card key={request.id} className="border-slate-200 shadow-sm"><CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">#{String(request.number).padStart(6, "0")} · {request.serviceLabel}</p><Badge variant="outline">{labels[request.status] ?? request.status}</Badge><Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">{request.source === "public_link" ? "Link público" : request.source}</Badge></div><p className="mt-1 text-sm text-slate-600">{customer?.name ?? request.requesterName} · {vehicle ? `${vehicle.make} ${vehicle.model}` : "Veículo a confirmar"}</p><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Em fila: {formatQueueMinutes(queueMinutes)}</span><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />Responsável: {assignedUser?.name ?? "Não atribuído"}</span></div><p className="mt-2 max-w-2xl truncate text-sm text-slate-500">{request.description || "Sem observações adicionais."}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => setHistoryRequestId(current => current === request.id ? null : request.id)}><History className="mr-2 h-4 w-4" />{historyRequestId === request.id ? "Ocultar trilha" : "Ver trilha"}</Button>{request.status === "new" ? <Button variant="outline" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId, quoteRequestId: request.id, status: "in_analysis" })}>Atender</Button> : null}{["new", "in_analysis", "in_quoting"].includes(request.status) ? <Button variant="ghost" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId, quoteRequestId: request.id, status: "awaiting_information" })}>Aguardar informação</Button> : null}<Button disabled={!request.serviceId || createQuote.isPending || ["approved", "rejected", "cancelled"].includes(request.status)} onClick={() => createQuote.mutate({ tenantId, quoteRequestId: request.id })}><Sparkles className="mr-2 h-4 w-4" />{createQuote.isPending ? "Gerando…" : "Gerar orçamento"}</Button></div></div>
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-medium text-slate-600">Atribuição interna</p><Select disabled={assignees.isLoading || updateStatus.isPending} value={request.assignedToUserId ? String(request.assignedToUserId) : "unassigned"} onValueChange={value => updateStatus.mutate({ tenantId, quoteRequestId: request.id, status: request.status, assignedToUserId: value === "unassigned" ? null : Number(value) })}><SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Selecionar responsável" /></SelectTrigger><SelectContent><SelectItem value="unassigned">Não atribuído</SelectItem>{assignees.data?.map(member => <SelectItem key={member.id} value={String(member.id)}>{member.name} · {member.role}</SelectItem>)}</SelectContent></Select></div>
          {historyRequestId === request.id ? <div className="border-t border-slate-100 pt-4">{history.isLoading ? <Skeleton className="h-20" /> : history.data?.length ? <ol className="space-y-3">{history.data.map(event => <li className="rounded-lg bg-slate-50 px-3 py-2" key={event.id}><p className="text-sm font-medium text-slate-800">{eventLabels[event.type] ?? event.type}</p><p className="mt-1 text-xs text-slate-600">{eventDetail(event)}</p><p className="mt-1 text-xs text-slate-400">{new Date(event.createdAt).toLocaleString("pt-BR")}</p></li>)}</ol> : <p className="text-sm text-slate-500">Ainda não há eventos registrados para esta solicitação.</p>}</div> : null}
        </CardContent></Card>)}
        <div className="flex items-center justify-between border-t border-slate-200 pt-4"><p className="text-xs text-slate-500">Página {page}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button size="sm" variant="outline" disabled={!requests.data?.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
      </div> : null}

      {!mine.isLoading && !requests.isLoading && !requests.isError && !items.length ? <Card className="border-dashed border-slate-300"><CardHeader className="items-center py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-50 text-orange-700"><PlusCircle className="h-6 w-6" /></div><CardTitle className="mt-4">Nenhuma solicitação neste filtro</CardTitle><CardDescription className="max-w-md">Ajuste o status selecionado ou divulgue o link público da oficina para começar a receber pedidos. Nenhum dado demonstrativo é exibido aqui.</CardDescription></CardHeader></Card> : null}
    </main>
  </DashboardLayout>;
}
