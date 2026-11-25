import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ChartNoAxesCombined } from "lucide-react";
import { useState } from "react";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: ChartNoAxesCombined, label: "Relatórios", path: "/relatorios" }];

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="border-l-2 border-slate-300 pl-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></div>;
}

export default function Reports() {
  const demoMode = isDemoWorkspace();
  const legacyMine = trpc.tenant.mine.useQuery(undefined, { enabled: !demoMode });
  const workspaceMine = trpc.workspace.mine.useQuery(undefined, { enabled: demoMode });
  const tenant = demoMode ? selectWorkspace(workspaceMine.data, true)?.tenant : legacyMine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const tenantLoading = demoMode ? workspaceMine.isLoading : legacyMine.isLoading;
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const referenceDate = new Date(`${month}-01T12:00:00.000Z`);
  const legacyReport = trpc.dashboard.overview.useQuery({ tenantId, referenceDate }, { enabled: Boolean(tenantId) && !demoMode });
  const demoReport = trpc.workspaceManagement.reports.overview.useQuery({ tenantId, referenceDate }, { enabled: Boolean(tenantId) && demoMode });
  const report = demoMode ? demoReport : legacyReport;
  const stats = report.data;

  if (tenantLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-80" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Indicadores operacionais e financeiros pertencem a uma oficina ativa.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-6"><header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Relatório mensal</h1><p className="mt-1 text-sm text-slate-500">Visão consolidada para decidir o que acompanhar neste mês.</p></div><div className="grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="report-month">Mês de referência</label><Input id="report-month" className="w-44" type="month" value={month} onChange={event => setMonth(event.target.value)} /></div></header>{report.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-32" key={index} />)}</div> : report.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-5 text-sm text-red-900">{report.error.data?.code === "FORBIDDEN" ? "Seu perfil não possui acesso aos relatórios desta oficina." : "Não foi possível carregar este relatório. Tente novamente."}</CardContent></Card> : stats ? <><section className="grid gap-6 border border-slate-200 bg-white p-5 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Recebido" value={money.format(stats.sales.billing)} detail={`${stats.sales.completedOrders} OS concluída(s)`} /><Metric label="Aprovação" value={`${(stats.sales.quoteApprovalRate * 100).toFixed(1)}%`} detail="Orçamentos convertidos" />{stats.finance ? <Metric label="Resultado estimado" value={money.format(stats.finance.estimatedOperationalResult)} detail={`${money.format(stats.finance.expenses)} em despesas`} /> : null}<Metric label="Em execução" value={String(stats.operation.inProgress)} detail={`${stats.operation.yard} veículo(s) no pátio`} /></section><section className="grid gap-4 md:grid-cols-3"><Card className="border-slate-200 shadow-none"><CardHeader><CardTitle className="text-base">Acompanhar comercial</CardTitle><CardDescription>Orçamentos ainda aguardando decisão.</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums text-slate-950">{money.format(stats.commercial.pendingQuoteValue)}</p><p className="mt-1 text-sm text-slate-500">{stats.commercial.pendingQuoteCount} orçamento(s) em aberto</p></CardContent></Card><Card className="border-slate-200 shadow-none"><CardHeader><CardTitle className="text-base">Revisar estoque</CardTitle><CardDescription>Itens que podem afetar novos serviços.</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums text-slate-950">{stats.inventory.critical}</p><p className="mt-1 text-sm text-slate-500">{stats.inventory.reservedProducts} produto(s) com reserva ativa</p></CardContent></Card><Card className="border-slate-200 shadow-none"><CardHeader><CardTitle className="text-base">Confirmar agenda</CardTitle><CardDescription>Compromissos pendentes de confirmação.</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums text-slate-950">{stats.operation.scheduled}</p><p className="mt-1 text-sm text-slate-500">Agendamento(s) aguardando confirmação</p></CardContent></Card></section></> : null}</main></DashboardLayout>;
}
