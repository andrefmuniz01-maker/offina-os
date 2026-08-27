import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Wrench } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Agenda & pátio", path: "/operacao" }, { icon: Wrench, label: "Ordem de serviço", path: "/os" }];

export default function WorkOrderNotes() {
  const [, params] = useRoute("/os/:id/anotacoes");
  const workOrderId = Number(params?.id ?? 0);
  const demoMode = isDemoWorkspace();
  const legacyMine = trpc.tenant.mine.useQuery(undefined, { enabled: !demoMode });
  const workspaceMine = trpc.workspace.mine.useQuery(undefined, { enabled: demoMode });
  const tenant = demoMode ? selectWorkspace(workspaceMine.data, true)?.tenant : legacyMine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const tenantLoading = demoMode ? workspaceMine.isLoading : legacyMine.isLoading;
  const utils = trpc.useUtils();
  const [body, setBody] = useState("");
  const legacyDetail = trpc.workOrders.detail.useQuery({ tenantId, workOrderId }, { enabled: Boolean(tenantId && workOrderId && !demoMode) });
  const demoDetail = trpc.workspaceOperations.workOrders.detail.useQuery({ tenantId, workOrderId }, { enabled: Boolean(tenantId && workOrderId && demoMode) });
  const detail = demoMode ? demoDetail : legacyDetail;
  const legacyAddNote = trpc.workOrders.addNote.useMutation({ onSuccess: () => { setBody(""); toast.success("Apontamento registrado na OS."); utils.workOrders.detail.invalidate(); }, onError: error => toast.error(error.message) });
  const demoAddNote = trpc.workspaceOperations.workOrders.addNote.useMutation({ onSuccess: () => { setBody(""); toast.success("Apontamento registrado na OS."); utils.workspaceOperations.workOrders.detail.invalidate(); }, onError: error => toast.error(error.message) });
  const addNote = demoMode ? demoAddNote : legacyAddNote;

  if (tenantLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><Skeleton className="mx-auto h-80 max-w-4xl" /></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><Card className="mx-auto max-w-lg"><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Apontamentos técnicos pertencem a uma ordem de serviço da oficina ativa. Peça a um Super Admin para associar seu acesso antes de consultar ou registrar observações.</CardDescription></CardHeader></Card></DashboardLayout>;
  if (detail.isLoading) return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><Skeleton className="mx-auto h-80 max-w-4xl" /></DashboardLayout>;
  if (detail.error || !detail.data) return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><Card className="mx-auto max-w-lg"><CardHeader><CardTitle>OS indisponível</CardTitle><CardDescription>{detail.error?.message ?? "Não foi possível carregar os apontamentos."}</CardDescription></CardHeader></Card></DashboardLayout>;
  const { order, notes } = detail.data;

  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><main className="mx-auto max-w-4xl space-y-6"><header className="border-b border-slate-200 pb-6"><Link href={`/os/${workOrderId}`}><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Voltar à OS</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Apontamentos da OS</h1><p className="mt-1 text-sm text-slate-500">OS #{String(order.number).padStart(6, "0")} · histórico técnico permanente da execução.</p></header><Card className="border-slate-200 shadow-none"><CardHeader><CardTitle>Registrar apontamento</CardTitle><CardDescription>Informe diagnóstico, execução, intercorrência ou recomendação. Registre fatos objetivos para a próxima pessoa da equipe.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea value={body} onChange={event => setBody(event.target.value)} rows={5} maxLength={4000} placeholder="Ex.: verificada folga na abraçadeira; substituída e torque conferido." /><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs text-slate-500">{body.length}/4000 caracteres</p><Button disabled={!body.trim() || addNote.isPending} onClick={() => addNote.mutate({ tenantId, workOrderId, body })}>{addNote.isPending ? "Registrando…" : "Registrar apontamento"}</Button></div></CardContent></Card><section aria-labelledby="historico-os"><div className="mb-3 flex items-baseline justify-between gap-3"><h2 id="historico-os" className="text-base font-semibold text-slate-950">Histórico técnico</h2><span className="text-xs text-slate-500">{notes.length} registro(s)</span></div>{notes.length ? <Card className="border-slate-200 shadow-none"><CardContent className="divide-y divide-slate-100 p-0">{notes.map(note => <article className="p-5" key={note.id}><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.body}</p><p className="mt-3 text-xs text-slate-500">Registrado em {new Date(note.createdAt).toLocaleString("pt-BR")}</p></article>)}</CardContent></Card> : <Card className="border-dashed border-slate-300 shadow-none"><CardContent className="py-12 text-center text-sm text-slate-500">Ainda não há apontamentos técnicos nesta OS.</CardContent></Card>}</section></main></DashboardLayout>;
}
