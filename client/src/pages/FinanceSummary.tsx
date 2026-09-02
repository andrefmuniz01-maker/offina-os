import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { PeriodPicker } from "@/components/PeriodPicker";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { financialErrorMessage } from "@/lib/financialStates";
import { getSupportTenantId, isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { getPeriodRange, startOfDay, type PeriodView } from "@/lib/periodRange";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CircleDollarSign, Landmark, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: CircleDollarSign, label: "Resumo", path: "/financeiro" },
  { icon: Wallet, label: "Despesas", path: "/financeiro/despesas" },
  { icon: TrendingUp, label: "Receitas", path: "/financeiro/receitas" },
];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function FinanceSummary() {
  const demoMode = isDemoWorkspace();
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, demoMode, getSupportTenantId())?.tenant;
  const tenantId = tenant?.id ?? 0;

  const [view, setView] = useState<PeriodView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const range = getPeriodRange(view, anchor);

  const dashboard = trpc.workspace.dashboardOverview.useQuery(
    { tenantId, rangeStart: range.start.toISOString(), rangeEnd: range.end.toISOString() },
    { enabled: Boolean(tenantId) },
  );

  const profit = dashboard.data?.finance?.estimatedOperationalResult ?? 0;
  const metrics = dashboard.data?.finance && dashboard.data.sales ? [
    { label: "Recebido no período", value: money.format(dashboard.data.sales.billing), icon: TrendingUp },
    { label: "Receita prevista", value: money.format(dashboard.data.sales.expectedRevenue), icon: ReceiptText },
    { label: "Despesas pagas", value: money.format(dashboard.data.finance.expenses), icon: CircleDollarSign },
    { label: "Lucro do período", value: money.format(profit), icon: TrendingUp, highlight: true },
  ] : [];
  const financeForbidden = dashboard.error?.data?.code === "FORBIDDEN";

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-64" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardContent className="p-8 text-center text-sm text-slate-600">Seu acesso ainda não está vinculado a uma oficina. Peça a um Super Admin para associá-lo ao tenant correto antes de consultar dados financeiros.</CardContent></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Financeiro</h1><p className="mt-1 text-sm text-slate-500">Resumo do período selecionado. Consulte o detalhe em Despesas ou Receitas.</p></div>
      <Badge className="w-fit bg-slate-950 text-white hover:bg-slate-950">Acesso financeiro</Badge>
    </header>

    <PeriodPicker view={view} onViewChange={setView} anchor={anchor} onAnchorChange={setAnchor} />

    {dashboard.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-28" key={index} />)}</div> : null}
    {dashboard.isError && !financeForbidden ? <Card className="border-red-200 bg-red-50"><CardContent className="p-5 text-sm text-red-900">{financialErrorMessage("os indicadores financeiros", dashboard.error.data?.code)}</CardContent></Card> : null}
    {financeForbidden ? <Card className="border-amber-200 bg-amber-50/60"><CardContent className="flex items-start gap-3 p-6 text-sm text-amber-950"><Landmark className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />Este perfil não pode consultar dados financeiros. O acesso é definido pela oficina e validado no servidor.</CardContent></Card> : null}
    {!dashboard.isLoading && !dashboard.isError && metrics.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <Card className={metric.highlight ? (profit >= 0 ? "border-emerald-200 bg-emerald-50/60 shadow-sm" : "border-red-200 bg-red-50/60 shadow-sm") : "border-slate-200 shadow-sm"} key={metric.label}><CardContent className="p-5"><metric.icon className={metric.highlight ? (profit >= 0 ? "h-5 w-5 text-emerald-700" : "h-5 w-5 text-red-700") : "h-5 w-5 text-orange-700"} /><p className="mt-4 text-xs font-semibold uppercase tracking-[.1em] text-slate-500">{metric.label}</p><p className={metric.highlight ? (profit >= 0 ? "mt-2 text-2xl font-semibold text-emerald-900" : "mt-2 text-2xl font-semibold text-red-900") : "mt-2 text-2xl font-semibold text-slate-950"}>{metric.value}</p></CardContent></Card>)}</section> : null}
  </main></DashboardLayout>;
}
