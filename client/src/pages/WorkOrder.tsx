import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, ClipboardCheck, PackageMinus, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useRoute } from "wouter";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Agenda & pátio", path: "/operacao" },
  { icon: Wrench, label: "Ordem de serviço", path: "/os" },
];

const nextStatus: Record<string, { status: "received" | "diagnosis" | "in_service" | "completed" | "delivered"; label: string }> = {
  scheduled: { status: "received", label: "Receber veículo" },
  received: { status: "diagnosis", label: "Iniciar diagnóstico" },
  diagnosis: { status: "in_service", label: "Iniciar serviço" },
  awaiting_approval: { status: "in_service", label: "Iniciar serviço" },
  awaiting_part: { status: "in_service", label: "Retomar serviço" },
  in_service: { status: "completed", label: "Finalizar OS" },
  completed: { status: "delivered", label: "Registrar entrega" },
};

const statusLabels: Record<string, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  received: "Recebida",
  diagnosis: "Diagnóstico",
  awaiting_approval: "Aguardando aprovação",
  awaiting_part: "Aguardando peça",
  in_service: "Em serviço",
  completed: "Finalizada",
  delivered: "Entregue",
  cancelled: "Cancelada",
};

function renderQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
}

export default function WorkOrder() {
  const [, params] = useRoute("/os/:id");
  const workOrderId = Number(params?.id ?? 0);
  const mine = trpc.workspace.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const detail = trpc.workspaceOperations.workOrderDetail.useQuery({ tenantId, workOrderId }, { enabled: Boolean(tenantId && workOrderId) });
  const [reservationId, setReservationId] = useState("");
  const [consumptionQuantity, setConsumptionQuantity] = useState("1");

  const refreshOperationalData = async () => {
    await Promise.all([
      utils.workspaceOperations.workOrderDetail.invalidate({ tenantId, workOrderId }),
      utils.workspaceOperations.listYard.invalidate({ tenantId }),
      utils.workspaceOperations.listAppointments.invalidate(),
    ]);
  };

  const toggle = trpc.workspaceOperations.toggleWorkOrderChecklist.useMutation({
    onSuccess: async () => {
      await refreshOperationalData();
    },
    onError: error => toast.error(error.message),
  });

  const updateStatus = trpc.workspaceOperations.updateWorkOrderStatus.useMutation({
    onSuccess: async () => {
      toast.success("Status da OS atualizado.");
      await refreshOperationalData();
    },
    onError: error => toast.error(error.message),
  });

  const consume = trpc.workspaceOperations.consumeWorkOrderReservation.useMutation({
    onSuccess: async () => {
      toast.success("Consumo registrado e reserva atualizada.");
      setReservationId("");
      setConsumptionQuantity("1");
      await refreshOperationalData();
    },
    onError: error => toast.error(error.message),
  });

  if (mine.isLoading) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><Skeleton className="mx-auto h-96 max-w-5xl" /></DashboardLayout>;
  }

  if (!tenant || !tenantId) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><Card className="mx-auto max-w-lg"><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Ordens de serviço, consumo e checklist pertencem a uma oficina ativa. Peça a um administrador para associar seu acesso antes de consultar ou alterar esta OS.</CardDescription></CardHeader></Card></DashboardLayout>;
  }

  if (!Number.isSafeInteger(workOrderId) || workOrderId < 1) {
    return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><Card className="mx-auto max-w-lg"><CardHeader><CardTitle>Ordem de serviço inválida</CardTitle><CardDescription>Verifique o endereço informado e retorne à Agenda e pátio para selecionar uma OS disponível.</CardDescription></CardHeader><CardContent><Link href="/operacao"><a><Button variant="outline">Voltar para Agenda e pátio</Button></a></Link></CardContent></Card></DashboardLayout>;
  }

  if (detail.isLoading) {
    return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><Skeleton className="mx-auto h-96 max-w-5xl" /></DashboardLayout>;
  }

  if (detail.error || !detail.data) {
    return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><Card className="mx-auto max-w-lg"><CardHeader><CardTitle>Ordem de serviço indisponível</CardTitle><CardDescription>{detail.error?.message ?? "Não foi possível abrir esta OS."}</CardDescription></CardHeader><CardContent><Link href="/operacao"><a><Button variant="outline">Voltar para Agenda e pátio</Button></a></Link></CardContent></Card></DashboardLayout>;
  }

  const { order, items, checklist, reservations } = detail.data;
  const action = nextStatus[order.status];
  const completedChecklist = checklist.filter(item => item.completed).length;
  const progress = checklist.length ? completedChecklist / checklist.length : 0;
  const selectedReservation = reservations.find(item => item.id === Number(reservationId));
  const isExecutionStatus = ["received", "diagnosis", "awaiting_part", "in_service"].includes(order.status);

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
    <main className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <Link href="/operacao"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Agenda e pátio</a></Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">OS #{String(order.number).padStart(6, "0")}</h1>
          <p className="mt-1 text-sm text-slate-500">Checklist, status e consumo são registrados nesta OS com controle de acesso por oficina.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{statusLabels[order.status] ?? order.status}</Badge>
          {action ? <Button disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId, workOrderId, status: action.status })}>{updateStatus.isPending ? "Atualizando…" : action.label}</Button> : null}
        </div>
      </header>

      {order.notes ? <Card className="border-slate-200 shadow-none"><CardHeader className="pb-3"><CardTitle className="text-base">Observações recebidas</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm text-slate-600">{order.notes}</p></CardContent></Card> : null}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="border-slate-200 shadow-none"><CardHeader><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-orange-700" /><CardTitle>Checklist de execução</CardTitle></div><CardDescription>{checklist.length ? `${completedChecklist} de ${checklist.length} etapa(s) concluída(s) — ${Math.round(progress * 100)}%.` : "Não há etapas cadastradas para esta OS."} A OS só pode ser finalizada após todas as etapas.</CardDescription></CardHeader><CardContent className="space-y-3">{checklist.map(item => <label className="flex cursor-pointer items-center gap-3 border-b border-slate-100 py-3 last:border-0" key={item.id}><Checkbox checked={item.completed} disabled={toggle.isPending} onCheckedChange={checked => toggle.mutate({ tenantId, checklistId: item.id, completed: Boolean(checked) })} /><span className={item.completed ? "text-slate-400 line-through" : "text-slate-800"}>{item.label}</span>{item.completed ? <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" /> : null}</label>)}</CardContent></Card>
        <Card className="border-slate-200 shadow-none"><CardHeader><CardTitle>Itens planejados</CardTitle><CardDescription>Herdados do orçamento aprovado, sem redigitação e sem exposição de valores internos.</CardDescription></CardHeader><CardContent className="space-y-3">{items.length ? items.map(item => <div className="flex justify-between gap-3 border-b border-slate-100 pb-3 last:border-0" key={item.id}><div><p className="font-medium text-slate-900">{item.description}</p><p className="text-xs text-slate-500">Quantidade planejada: {renderQuantity(item.quantity)}</p></div><span className="text-xs capitalize text-slate-500">{item.itemType === "service" ? "Serviço" : item.itemType === "product" ? "Produto" : "Kit"}</span></div>) : <p className="text-sm text-slate-500">Nenhum item planejado foi retornado para esta OS.</p>}</CardContent></Card>
      </div>

      <Card className="border-slate-200 shadow-none"><CardHeader><div className="flex items-center gap-2"><PackageMinus className="h-5 w-5 text-orange-700" /><CardTitle>Consumo de estoque</CardTitle></div><CardDescription>Selecione uma reserva ativa para baixar estoque físico e reduzir apenas o saldo reservado desta OS.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 sm:grid-cols-[1.4fr_.6fr_auto]"><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={reservationId} disabled={!isExecutionStatus || consume.isPending} onChange={event => setReservationId(event.target.value)}><option value="">Selecione uma reserva</option>{reservations.map(item => <option key={item.id} value={item.id}>{item.description} · reservado: {renderQuantity(item.quantity)}</option>)}</select><Input type="number" min="0.001" step="0.001" disabled={!isExecutionStatus || consume.isPending} value={consumptionQuantity} onChange={event => setConsumptionQuantity(event.target.value)} /><Button disabled={consume.isPending || !isExecutionStatus || !selectedReservation || Number(consumptionQuantity) <= 0 || Number(consumptionQuantity) > Number(selectedReservation.quantity)} onClick={() => selectedReservation && consume.mutate({ tenantId, workOrderId, reservationId: selectedReservation.id, quantity: Number(consumptionQuantity) })}>{consume.isPending ? "Registrando…" : "Baixar consumo"}</Button></div>{!reservations.length ? <p className="text-xs text-slate-500">Não há reservas ativas para esta OS.</p> : !isExecutionStatus ? <p className="text-xs text-slate-500">O consumo pode ser registrado quando a OS estiver recebida, em diagnóstico, aguardando peça ou em serviço.</p> : null}</CardContent></Card>

      <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">Anexos e apontamentos permanecem indisponíveis neste recorte da migração até que tenham fluxo privado próprio no Supabase.</p>
    </main>
  </DashboardLayout>;
}
