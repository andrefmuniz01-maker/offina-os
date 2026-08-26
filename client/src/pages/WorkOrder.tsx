import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, ClipboardCheck, ImagePlus, NotebookPen, PackageMinus, Wrench } from "lucide-react";
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
  awaiting_part: { status: "in_service", label: "Retomar serviço" },
  in_service: { status: "completed", label: "Finalizar OS" },
  completed: { status: "delivered", label: "Registrar entrega" },
};
const statusLabels: Record<string, string> = { scheduled: "Agendada", received: "Recebida", diagnosis: "Diagnóstico", awaiting_part: "Aguardando peça", in_service: "Em serviço", completed: "Finalizada", delivered: "Entregue" };

async function asBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function WorkOrder() {
  const [, params] = useRoute("/os/:id");
  const workOrderId = Number(params?.id ?? 0);
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const detail = trpc.workOrders.detail.useQuery({ tenantId, workOrderId }, { enabled: Boolean(tenantId && workOrderId) });
  const toggle = trpc.workOrders.toggleChecklist.useMutation({ onSuccess: () => utils.workOrders.detail.invalidate(), onError: error => toast.error(error.message) });
  const updateStatus = trpc.workOrders.updateStatus.useMutation({ onSuccess: () => { toast.success("Status da OS atualizado."); utils.workOrders.detail.invalidate(); utils.workOrders.kanban.invalidate(); }, onError: error => toast.error(error.message) });
  const consume = trpc.workOrders.consumeProduct.useMutation({ onSuccess: () => { toast.success("Consumo registrado e reserva atualizada."); setReservationId(""); setConsumptionQuantity("1"); utils.workOrders.detail.invalidate(); utils.inventory.list.invalidate(); }, onError: error => toast.error(error.message) });
  const upload = trpc.workOrders.uploadExecutionAttachment.useMutation({ onSuccess: () => utils.workOrders.detail.invalidate(), onError: error => toast.error(error.message) });
  const [reservationId, setReservationId] = useState("");
  const [consumptionQuantity, setConsumptionQuantity] = useState("1");
  const [executionFiles, setExecutionFiles] = useState<File[]>([]);

  const sendAttachments = async () => {
    if (!executionFiles.length) return;
    try {
      for (const file of executionFiles) {
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} ultrapassa 5 MB.`);
        await upload.mutateAsync({ tenantId, workOrderId, filename: file.name, mimeType: file.type || "application/octet-stream", base64: await asBase64(file) });
      }
      setExecutionFiles([]);
      toast.success("Evidências de execução adicionadas à OS.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o anexo.");
    }
  };

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><Skeleton className="mx-auto h-96 max-w-5xl" /></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><Card className="mx-auto max-w-lg"><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Ordens de serviço, consumo, checklist e evidências pertencem a uma oficina ativa. Peça a um Super Admin para associar seu acesso antes de consultar ou alterar esta OS.</CardDescription></CardHeader></Card></DashboardLayout>;
  if (detail.isLoading) return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><Skeleton className="mx-auto h-96 max-w-5xl" /></DashboardLayout>;
  if (detail.error || !detail.data) return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><Card className="mx-auto max-w-lg"><CardHeader><CardTitle>Ordem de serviço indisponível</CardTitle><CardDescription>{detail.error?.message ?? "Não foi possível abrir esta OS."}</CardDescription></CardHeader></Card></DashboardLayout>;

  const { order, items, checklist, reservations, executionAttachments } = detail.data;
  const action = nextStatus[order.status];
  const progress = checklist.length ? checklist.filter(item => item.completed).length / checklist.length : 0;
  const selectedReservation = reservations.find(item => item.id === Number(reservationId));

  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}>
    <main className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <Link href="/operacao"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Agenda e pátio</a></Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">OS #{String(order.number).padStart(6, "0")}</h1>
          <p className="mt-1 text-sm text-slate-500">Execute a checklist, registre consumo e mantenha as evidências do serviço neste histórico.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{statusLabels[order.status] ?? order.status}</Badge>
          <Link href={`/os/${workOrderId}/anotacoes`}><a><Button variant="outline"><NotebookPen className="mr-2 h-4 w-4" />Apontamentos</Button></a></Link>
          {action ? <Button disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ tenantId, workOrderId, status: action.status })}>{action.label}</Button> : null}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <Card className="border-slate-200 shadow-none"><CardHeader><CardTitle>Checklist de execução</CardTitle><CardDescription>{Math.round(progress * 100)}% concluído. A OS só pode ser finalizada após todas as etapas.</CardDescription></CardHeader><CardContent className="space-y-3">{checklist.map(item => <label className="flex cursor-pointer items-center gap-3 border-b border-slate-100 py-3 last:border-0" key={item.id}><Checkbox checked={item.completed} disabled={toggle.isPending} onCheckedChange={checked => toggle.mutate({ tenantId, checklistId: item.id, completed: Boolean(checked) })} /><span className={item.completed ? "text-slate-400 line-through" : "text-slate-800"}>{item.label}</span>{item.completed ? <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" /> : null}</label>)}</CardContent></Card>
        <Card className="border-slate-200 shadow-none"><CardHeader><CardTitle>Itens planejados</CardTitle><CardDescription>Herdados do orçamento aprovado, sem redigitação.</CardDescription></CardHeader><CardContent className="space-y-3">{items.map(item => <div className="flex justify-between gap-3 border-b border-slate-100 pb-3 last:border-0" key={item.id}><div><p className="font-medium text-slate-900">{item.description}</p><p className="text-xs text-slate-500">{item.quantity} × {item.unitPrice}</p></div><span className="text-xs text-slate-500">{item.itemType}</span></div>)}</CardContent></Card>
      </div>

      <Card className="border-slate-200 shadow-none"><CardHeader><CardTitle>Consumo de estoque</CardTitle><CardDescription>Selecione uma reserva ativa para baixar o estoque físico e reduzir o saldo reservado.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-[1.4fr_.6fr_auto]"><select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={reservationId} onChange={event => setReservationId(event.target.value)}><option value="">Selecione uma reserva</option>{reservations.map(item => <option key={item.id} value={item.id}>Produto #{item.productId} · saldo reservado {item.quantity}</option>)}</select><Input type="number" min="0.001" step="0.001" value={consumptionQuantity} onChange={event => setConsumptionQuantity(event.target.value)} /><Button disabled={consume.isPending || !selectedReservation || Number(consumptionQuantity) <= 0 || Number(consumptionQuantity) > Number(selectedReservation.quantity)} onClick={() => selectedReservation && consume.mutate({ tenantId, workOrderId, productId: selectedReservation.productId, reservationId: selectedReservation.id, quantity: Number(consumptionQuantity) })}>Baixar consumo</Button></CardContent>{!reservations.length ? <p className="px-6 pb-5 text-xs text-slate-500">Não há reservas ativas para esta OS.</p> : null}</Card>

      <Card className="border-slate-200"><CardHeader><div className="flex items-center gap-2"><ImagePlus className="h-5 w-5 text-orange-700" /><CardTitle>Fotos e vídeos da execução</CardTitle></div><CardDescription>Registre evidências reais do serviço para o histórico da OS.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row"><Input className="flex-1" type="file" accept="image/*,video/*" multiple onChange={event => setExecutionFiles(Array.from(event.target.files ?? []).slice(0, 5))} /><Button disabled={upload.isPending || !executionFiles.length} onClick={sendAttachments}>{upload.isPending ? "Enviando…" : "Adicionar anexos"}</Button></div>{executionFiles.length ? <p className="text-xs text-slate-500">{executionFiles.length} arquivo(s) selecionado(s), com limite de 5 MB por arquivo.</p> : null}{executionAttachments.length ? <div className="grid gap-3 sm:grid-cols-3">{executionAttachments.map(attachment => <a className="rounded-xl border border-slate-100 p-3 text-sm font-medium text-orange-700 hover:border-orange-200" href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}>{attachment.filename}</a>)}</div> : <p className="text-sm text-slate-500">Ainda não há fotos ou vídeos registrados nesta OS.</p>}</CardContent></Card>
    </main>
  </DashboardLayout>;
}
