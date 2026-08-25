import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CalendarRange, ChartNoAxesCombined, CircleAlert, CircleDollarSign, ClipboardCheck, ReceiptText, Wrench } from "lucide-react";
import { useState } from "react";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: ChartNoAxesCombined, label: "Relatórios", path: "/relatorios" }];

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof CircleDollarSign }) {
  return <Card className="border-slate-200"><CardContent className="p-5"><Icon className="h-5 w-5 text-orange-700" /><p className="mt-4 text-xs font-semibold uppercase tracking-[.1em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></CardContent></Card>;
}

export default function Reports() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const referenceDate = new Date(`${month}-01T12:00:00.000Z`);
  const report = trpc.dashboard.overview.useQuery({ tenantId, referenceDate }, { enabled: Boolean(tenantId) });
  const stats = report.data;
  const metrics = stats ? [
    { label: "Faturamento recebido", value: money.format(stats.sales.billing), detail: `${stats.sales.completedOrders} OS concluída(s) no mês`, icon: CircleDollarSign },
    { label: "Aprovação de orçamentos", value: `${(stats.sales.quoteApprovalRate * 100).toFixed(1)}%`, detail: "Conversão dos orçamentos criados no período", icon: ReceiptText },
    ...(stats.finance ? [{ label: "Resultado operacional", value: money.format(stats.finance.estimatedOperationalResult), detail: `${money.format(stats.finance.expenses)} em despesas pagas`, icon: ChartNoAxesCombined }] : []),
    { label: "Operação em andamento", value: String(stats.operation.inProgress), detail: `${stats.operation.yard} veículo(s) no pátio`, icon: Wrench },
  ] : [];

  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><main className="mx-auto max-w-7xl space-y-7">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Relatório mensal</h1><p className="mt-1 text-sm text-slate-500">Indicadores comerciais, financeiros e operacionais da oficina selecionada.</p></div><Badge className="w-fit bg-slate-950 text-white hover:bg-slate-950">Dados restritos</Badge></header>
    <Card className="border-slate-200"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-medium text-slate-900">Período de referência</p><p className="mt-1 text-sm text-slate-500">Todos os valores recebidos, despesas e conversões usam o mês selecionado.</p></div><div className="grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="report-month">Mês</label><div className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-slate-500" /><Input id="report-month" className="w-44" type="month" value={month} onChange={event => setMonth(event.target.value)} /></div></div></CardContent></Card>
    {report.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-40" key={index} />)}</div> : report.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-5 text-sm text-red-900">{report.error.data?.code === "FORBIDDEN" ? "Seu perfil não possui acesso aos relatórios desta oficina." : "Não foi possível carregar este relatório. Tente novamente."}</CardContent></Card> : !tenant ? <Card className="border-dashed border-slate-300"><CardContent className="p-8 text-center text-sm text-slate-600">Seu acesso ainda não está vinculado a uma oficina. Peça a um Super Admin para associá-lo ao tenant correto antes de consultar relatórios.</CardContent></Card> : <><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <Metric key={metric.label} {...metric} />)}</section>{stats ? <section className="grid gap-4 md:grid-cols-3"><Card className="border-slate-200"><CardHeader><CardTitle className="text-base">Comercial</CardTitle><CardDescription>Oportunidades ainda em acompanhamento.</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold text-slate-950">{money.format(stats.commercial.pendingQuoteValue)}</p><p className="mt-1 text-sm text-slate-500">{stats.commercial.pendingQuoteCount} orçamento(s) em aberto</p></CardContent></Card><Card className="border-slate-200"><CardHeader><CardTitle className="text-base">Estoque</CardTitle><CardDescription>Sinais para revisão de disponibilidade.</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold text-slate-950">{stats.inventory.critical}</p><p className="mt-1 text-sm text-slate-500">{stats.inventory.reservedProducts} produto(s) com reserva ativa</p></CardContent></Card><Card className="border-slate-200"><CardHeader><CardTitle className="text-base">Agenda</CardTitle><CardDescription>Próximos compromissos da operação.</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold text-slate-950">{stats.operation.scheduled}</p><p className="mt-1 text-sm text-slate-500">Agendamento(s) aguardando confirmação</p></CardContent></Card></section> : null}</>}
  </main></DashboardLayout>;
}
