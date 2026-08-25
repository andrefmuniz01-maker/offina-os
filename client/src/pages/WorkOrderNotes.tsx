import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, MessageSquareText, Wrench } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Agenda & pátio", path: "/operacao" }, { icon: Wrench, label: "Ordem de serviço", path: "/os" }];

export default function WorkOrderNotes() {
  const [, params] = useRoute("/os/:id/anotacoes"); const workOrderId = Number(params?.id ?? 0);
  const mine = trpc.tenant.mine.useQuery(); const tenant = mine.data?.[0]?.tenant; const tenantId = tenant?.id ?? 0; const utils = trpc.useUtils(); const [body, setBody] = useState("");
  const detail = trpc.workOrders.detail.useQuery({ tenantId, workOrderId }, { enabled: Boolean(tenantId && workOrderId) });
  const addNote = trpc.workOrders.addNote.useMutation({ onSuccess: () => { setBody(""); toast.success("Apontamento registrado na OS."); utils.workOrders.detail.invalidate(); }, onError: error => toast.error(error.message) });
  if (detail.isLoading) return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><Skeleton className="mx-auto h-80 max-w-4xl" /></DashboardLayout>;
  if (detail.error || !detail.data) return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><Card className="mx-auto max-w-lg"><CardHeader><CardTitle>OS indisponível</CardTitle><CardDescription>{detail.error?.message ?? "Não foi possível carregar os apontamentos."}</CardDescription></CardHeader></Card></DashboardLayout>;
  const { order, notes } = detail.data;
  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><main className="mx-auto max-w-4xl space-y-6"><header className="border-b border-slate-200 pb-6"><Link href={`/os/${workOrderId}`}><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Voltar à OS</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Apontamentos técnicos</h1><p className="mt-1 text-sm text-slate-500">OS #{String(order.number).padStart(6, "0")} · registros operacionais imutáveis da equipe.</p></header><Card className="border-slate-200"><CardHeader><div className="flex items-center gap-2"><MessageSquareText className="h-5 w-5 text-orange-700" /><CardTitle>Novo apontamento</CardTitle></div><CardDescription>Descreva diagnóstico, execução, intercorrência ou recomendação técnica.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea value={body} onChange={event => setBody(event.target.value)} rows={5} maxLength={4000} placeholder="Ex.: verificada folga na abraçadeira; substituída e torque conferido." /><div className="flex justify-between gap-3"><p className="text-xs text-slate-500">{body.length}/4000</p><Button disabled={!body.trim() || addNote.isPending} onClick={() => addNote.mutate({ tenantId, workOrderId, body })}>{addNote.isPending ? "Registrando…" : "Registrar apontamento"}</Button></div></CardContent></Card><section className="space-y-3">{notes.length ? notes.map(note => <Card className="border-slate-200" key={note.id}><CardContent className="p-5"><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.body}</p><p className="mt-3 text-xs text-slate-500">Registrado em {new Date(note.createdAt).toLocaleString("pt-BR")}</p></CardContent></Card>) : <Card className="border-dashed border-slate-300"><CardContent className="py-14 text-center text-sm text-slate-500">Ainda não há apontamentos técnicos nesta OS.</CardContent></Card>}</section></main></DashboardLayout>;
}
