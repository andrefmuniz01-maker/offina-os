import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, FileText, PlusCircle, Sparkles } from "lucide-react";
import { SafeLink as Link } from "@/components/SafeLink";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: FileText, label: "Solicitações", path: "/solicitacoes" },
];

const labels: Record<string, string> = { new: "Nova", in_analysis: "Em análise", awaiting_information: "Aguardando informação", in_quoting: "Em orçamento", ready: "Pronta", sent: "Enviada", approved: "Aprovada", rejected: "Recusada", expired: "Expirada", cancelled: "Cancelada" };

export default function Requests() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const requests = trpc.quoteRequests.list.useQuery({ tenantId: tenant?.id ?? 0 }, { enabled: Boolean(tenant?.id) });
  const utils = trpc.useUtils();
  const createQuote = trpc.quotes.createFromSuggestion.useMutation({ onSuccess: data => { toast.success(`Orçamento #${String(data.number).padStart(6, "0")} criado. Revise e envie ao cliente.`); utils.quoteRequests.list.invalidate(); }, onError: error => toast.error(error.message) });
  const updateStatus = trpc.quoteRequests.updateStatus.useMutation({ onSuccess: () => { toast.success("Solicitação atualizada."); utils.quoteRequests.list.invalidate(); }, onError: error => toast.error(error.message) });
  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><main className="mx-auto max-w-6xl space-y-7"><header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Solicitações de orçamento</h1><p className="mt-1 text-sm text-slate-500">Solicitações reais enviadas pelos clientes para esta oficina.</p></div><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Fluxo comercial</Badge></header>{mine.isLoading || requests.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-24" key={index} />)}</div> : requests.data?.length ? <div className="space-y-3">{requests.data.map(({ request, customer, vehicle }) => <Card key={request.id} className="border-slate-200 shadow-sm"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">#{String(request.number).padStart(6, "0")} · {request.serviceLabel}</p><Badge variant="outline">{labels[request.status] ?? request.status}</Badge></div><p className="mt-1 text-sm text-slate-600">{customer?.name ?? request.requesterName} · {vehicle ? `${vehicle.make} ${vehicle.model}` : "Veículo a confirmar"}</p><p className="mt-2 max-w-2xl truncate text-sm text-slate-500">{request.description || "Sem observações adicionais."}</p></div><div className="flex flex-wrap gap-2">{request.status === "new" ? <Button variant="outline" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId: tenant!.id, quoteRequestId: request.id, status: "in_analysis" })}>Atender</Button> : null}{["new", "in_analysis", "in_quoting"].includes(request.status) ? <Button variant="ghost" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId: tenant!.id, quoteRequestId: request.id, status: "awaiting_information" })}>Aguardar informação</Button> : null}<Button disabled={!request.serviceId || createQuote.isPending || ["approved", "rejected", "cancelled"].includes(request.status)} onClick={() => createQuote.mutate({ tenantId: tenant!.id, quoteRequestId: request.id })}><Sparkles className="mr-2 h-4 w-4" />{createQuote.isPending ? "Gerando…" : "Gerar orçamento"}</Button></div></CardContent></Card>)}</div> : <Card className="border-dashed border-slate-300"><CardHeader className="items-center py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-50 text-orange-700"><PlusCircle className="h-6 w-6" /></div><CardTitle className="mt-4">Ainda não há solicitações</CardTitle><CardDescription className="max-w-md">Divulgue o link público da sua oficina para começar a receber pedidos de orçamento. Nenhum dado demonstrativo é exibido aqui.</CardDescription></CardHeader></Card>}</main></DashboardLayout>;
}
