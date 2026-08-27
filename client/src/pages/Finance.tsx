import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { financialErrorMessage, hasFinancialPermissionError } from "@/lib/financialStates";
import { getFinanceWorkspaceAction } from "@/lib/financeWorkspace";
import { trpc } from "@/lib/trpc";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { ArrowLeft, ChevronLeft, ChevronRight, CircleDollarSign, Landmark, Plus, ReceiptText, Search, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: CircleDollarSign, label: "Financeiro", path: "/financeiro" },
];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type RevenueStatus = "all" | "expected" | "received" | "cancelled";
type ExpenseStatus = "all" | "planned" | "paid" | "cancelled";

function Pager({ page, hasMore, onPrevious, onNext }: { page: number; hasMore: boolean; onPrevious: () => void; onNext: () => void }) {
  return <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
    <p className="text-xs text-slate-500">Página {page}</p>
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={page === 1} onClick={onPrevious}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button>
      <Button size="sm" variant="outline" disabled={!hasMore} onClick={onNext}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button>
    </div>
  </div>;
}

export default function Finance() {
  const demoMode = isDemoWorkspace();
  const legacyMine = trpc.tenant.mine.useQuery(undefined, { enabled: !demoMode });
  const workspaceMine = trpc.workspace.mine.useQuery(undefined, { enabled: demoMode });
  const tenant = demoMode ? selectWorkspace(workspaceMine.data, true)?.tenant : legacyMine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const [revenueStatus, setRevenueStatus] = useState<RevenueStatus>("all");
  const [expenseStatus, setExpenseStatus] = useState<ExpenseStatus>("all");
  const [revenueSearch, setRevenueSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [revenuePage, setRevenuePage] = useState(1);
  const [expensePage, setExpensePage] = useState(1);
  const [expense, setExpense] = useState({ category: "", amount: "0", date: new Date().toISOString().slice(0, 10) });

  const legacyDashboard = trpc.dashboard.overview.useQuery({ tenantId }, { enabled: Boolean(tenantId) && !demoMode });
  const demoDashboard = trpc.workspace.dashboardOverview.useQuery({ tenantId }, { enabled: Boolean(tenantId) && demoMode });
  const dashboard = demoMode ? demoDashboard : legacyDashboard;
  const legacyRevenues = trpc.financial.revenues.list.useQuery({ tenantId, status: revenueStatus === "all" ? undefined : revenueStatus, search: revenueSearch.trim() || undefined, page: revenuePage, pageSize: 10 }, { enabled: Boolean(tenantId) && !demoMode });
  const demoRevenues = trpc.workspaceFinance.revenues.list.useQuery({ tenantId, status: revenueStatus === "all" ? undefined : revenueStatus, search: revenueSearch.trim() || undefined, page: revenuePage, pageSize: 10 }, { enabled: Boolean(tenantId) && demoMode });
  const revenues = demoMode ? demoRevenues : legacyRevenues;
  const legacyExpenses = trpc.financial.expenses.list.useQuery({ tenantId, status: expenseStatus === "all" ? undefined : expenseStatus, search: expenseSearch.trim() || undefined, page: expensePage, pageSize: 10 }, { enabled: Boolean(tenantId) && !demoMode });
  const demoExpenses = trpc.workspaceFinance.expenses.list.useQuery({ tenantId, status: expenseStatus === "all" ? undefined : expenseStatus, search: expenseSearch.trim() || undefined, page: expensePage, pageSize: 10 }, { enabled: Boolean(tenantId) && demoMode });
  const expenses = demoMode ? demoExpenses : legacyExpenses;
  const tenantLoading = demoMode ? workspaceMine.isLoading : legacyMine.isLoading;
  const createExpense = trpc.financial.expenses.create.useMutation({
    onSuccess: () => {
      toast.success("Despesa registrada.");
      setExpense({ category: "", amount: "0", date: new Date().toISOString().slice(0, 10) });
      setExpensePage(1);
      utils.financial.expenses.list.invalidate();
      utils.dashboard.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const receiveRevenue = trpc.financial.revenues.markReceived.useMutation({
    onSuccess: () => {
      toast.success("Receita marcada como recebida.");
      utils.financial.revenues.list.invalidate();
      utils.dashboard.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const metrics = dashboard.data?.finance && dashboard.data.sales ? [
    { label: "Recebido no mês", value: money.format(dashboard.data.sales.billing), icon: TrendingUp },
    { label: "Receita prevista", value: money.format(dashboard.data.sales.expectedRevenue), icon: ReceiptText },
    { label: "Despesas pagas", value: money.format(dashboard.data.finance.expenses), icon: CircleDollarSign },
    { label: "Resultado operacional", value: money.format(dashboard.data.finance.estimatedOperationalResult), icon: TrendingUp },
  ] : [];
  const revenueItems = revenues.data?.items ?? [];
  const expenseItems = expenses.data?.items ?? [];
  const expectedRevenueCount = revenueItems.filter(item => item.status === "expected").length;
  const plannedExpenseCount = expenseItems.filter(item => item.status === "planned").length;
  const financeAction = getFinanceWorkspaceAction(expectedRevenueCount, plannedExpenseCount);
  const financeForbidden = hasFinancialPermissionError(dashboard.error?.data?.code, revenues.error?.data?.code, expenses.error?.data?.code);

  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}>
    <main className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Financeiro</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Acompanhe realização, previsão e compromissos do caixa com decisões sempre confirmadas por um usuário autorizado.</p>
        </div>
        <Badge className="w-fit bg-slate-950 text-white hover:bg-slate-950">Acesso financeiro</Badge>
      </header>

      {tenant ? (dashboard.isLoading ? <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-28" key={index} />)}</div> : dashboard.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-5 text-sm text-red-900">{financialErrorMessage("os indicadores financeiros", dashboard.error.data?.code)}</CardContent></Card> : dashboard.data?.finance ? <><section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 shadow-sm"><div className="grid gap-px bg-slate-700 md:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]"><div className="bg-slate-950 p-5 text-white"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">Pulso financeiro</p><p className="mt-2 text-xl font-semibold tracking-tight">Decida com o caixa em contexto.</p><p className="mt-1 text-sm text-slate-300">Somente perfis financeiros visualizam valores e indicadores deste bloco.</p></div><div className="bg-slate-900 p-5 text-white"><p className="text-xs font-medium text-slate-300">Receitas pendentes</p><p className="mt-1 text-2xl font-semibold tabular-nums">{expectedRevenueCount}</p><p className="mt-1 text-xs text-slate-300">Aguardam confirmação de recebimento</p></div><div className="bg-slate-900 p-5 text-white"><p className="text-xs font-medium text-slate-300">Despesas planejadas</p><p className="mt-1 text-2xl font-semibold tabular-nums">{plannedExpenseCount}</p><p className="mt-1 text-xs text-slate-300">Compromissos cadastrados na página</p></div><div className="bg-slate-900 p-5 text-white"><p className="text-xs font-medium text-slate-300">Próxima ação</p><p className="mt-1 text-sm font-semibold">{financeAction.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-300">{financeAction.description}</p></div></div></section><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <Card className="border-slate-200 shadow-sm" key={metric.label}><CardContent className="p-5"><metric.icon className="h-5 w-5 text-orange-700" /><p className="mt-4 text-xs font-semibold uppercase tracking-[.1em] text-slate-500">{metric.label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p></CardContent></Card>)}</section></> : <Card className="border-slate-200"><CardContent className="flex items-center gap-3 p-5 text-sm text-slate-600"><Landmark className="h-5 w-5 text-slate-500" />Seu perfil não possui visualização financeira global nesta oficina.</CardContent></Card>) : null}

      {tenant && !financeForbidden ? <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-lg">Nova despesa</CardTitle><CardDescription>Registre compromissos financeiros reais. Eles não são criados automaticamente.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2"><Label htmlFor="expense-category">Categoria</Label><Input id="expense-category" value={expense.category} onChange={event => setExpense({ ...expense, category: event.target.value })} placeholder="Ex.: aluguel, fornecedor, energia" /></div>
            <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="expense-amount">Valor</Label><Input id="expense-amount" type="number" min="0.01" step="0.01" value={expense.amount} onChange={event => setExpense({ ...expense, amount: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="expense-date">Data</Label><Input id="expense-date" type="date" value={expense.date} onChange={event => setExpense({ ...expense, date: event.target.value })} /></div></div>
            <Button disabled={demoMode || createExpense.isPending || !expense.category || Number(expense.amount) <= 0} onClick={() => createExpense.mutate({ tenantId, category: expense.category, amount: Number(expense.amount), expenseDate: new Date(`${expense.date}T12:00:00`) })}><Plus className="mr-2 h-4 w-4" />Registrar despesa</Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-lg">Receitas</CardTitle><CardDescription>Busque por observação ou forma de recebimento, com paginação por oficina.</CardDescription></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1"><Label className="text-xs" htmlFor="revenue-search">Buscar</Label><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="revenue-search" className="h-9 min-w-0 pl-8" value={revenueSearch} onChange={event => { setRevenueSearch(event.target.value); setRevenuePage(1); }} placeholder="Observação ou forma" aria-describedby="revenue-search-help" /></div><span id="revenue-search-help" className="sr-only">Busca por observação ou forma de recebimento.</span></div><div className="grid gap-1"><Label className="text-xs" htmlFor="revenue-status">Status</Label><select id="revenue-status" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2" value={revenueStatus} onChange={event => { setRevenueStatus(event.target.value as RevenueStatus); setRevenuePage(1); }}><option value="all">Todos</option><option value="expected">Prevista</option><option value="received">Recebida</option><option value="cancelled">Cancelada</option></select></div></div></CardHeader>
          <CardContent>{revenues.isLoading ? <Skeleton className="h-48" /> : revenues.isError ? <p className="py-10 text-center text-sm text-red-700">{financialErrorMessage("as receitas", revenues.error.data?.code)}</p> : revenues.data?.items.length ? <><div className="space-y-2">{revenues.data.items.map(item => <div className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between" key={item.id}><div><p className="font-medium text-slate-900">{money.format(Number(item.amount))}</p><p className="text-xs text-slate-500">{item.notes ?? "Sem observação"}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{item.status}</Badge>{item.status === "expected" ? <Button size="sm" disabled={demoMode || receiveRevenue.isPending} onClick={() => receiveRevenue.mutate({ tenantId, revenueId: item.id, paymentMethod: "manual" })}>Confirmar recebimento</Button> : null}</div></div>)}</div><Pager page={revenuePage} hasMore={revenues.data.hasMore} onPrevious={() => setRevenuePage(page => Math.max(1, page - 1))} onNext={() => setRevenuePage(page => page + 1)} /></> : <p className="py-10 text-center text-sm text-slate-500">Nenhuma receita neste filtro. Ajuste a busca ou o status.</p>}</CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm lg:col-span-2">
          <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-lg">Despesas</CardTitle><CardDescription>Busque por categoria, recorrência ou observação no histórico isolado por tenant.</CardDescription></div><div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-1"><Label className="text-xs" htmlFor="expense-search">Buscar</Label><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="expense-search" className="h-9 min-w-0 pl-8" value={expenseSearch} onChange={event => { setExpenseSearch(event.target.value); setExpensePage(1); }} placeholder="Categoria ou observação" aria-describedby="expense-search-help" /></div><span id="expense-search-help" className="sr-only">Busca por categoria, recorrência ou observação.</span></div><div className="grid gap-1"><Label className="text-xs" htmlFor="expense-status">Status</Label><select id="expense-status" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2" value={expenseStatus} onChange={event => { setExpenseStatus(event.target.value as ExpenseStatus); setExpensePage(1); }}><option value="all">Todos</option><option value="planned">Planejada</option><option value="paid">Paga</option><option value="cancelled">Cancelada</option></select></div></div></CardHeader>
          <CardContent>{expenses.isLoading ? <Skeleton className="h-32" /> : expenses.isError ? <p className="py-10 text-center text-sm text-red-700">{financialErrorMessage("as despesas", expenses.error.data?.code)}</p> : expenses.data?.items.length ? <><div className="grid gap-2 sm:grid-cols-2">{expenses.data.items.map(item => <div className="rounded-xl border border-slate-100 p-3" key={item.id}><div className="flex justify-between gap-3"><p className="font-medium text-slate-900">{item.category}</p><Badge variant="outline">{item.status}</Badge></div><p className="mt-2 text-lg font-semibold text-slate-800">{money.format(Number(item.amount))}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.expenseDate).toLocaleDateString("pt-BR")}</p></div>)}</div><Pager page={expensePage} hasMore={expenses.data.hasMore} onPrevious={() => setExpensePage(page => Math.max(1, page - 1))} onNext={() => setExpensePage(page => page + 1)} /></> : <p className="py-10 text-center text-sm text-slate-500">Nenhuma despesa neste filtro. Ajuste a busca ou o status.</p>}</CardContent>
        </Card>
      </div> : tenant && financeForbidden ? <Card className="border-amber-200 bg-amber-50/60"><CardContent className="flex items-start gap-3 p-6 text-sm text-amber-950"><Landmark className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />Este perfil não pode consultar ou registrar dados financeiros. O acesso é definido pela oficina e validado no servidor.</CardContent></Card> : !tenantLoading ? <Card className="border-dashed border-slate-300"><CardContent className="p-8 text-center text-sm text-slate-600">Seu acesso ainda não está vinculado a uma oficina. Peça a um Super Admin para associá-lo ao tenant correto antes de registrar ou consultar dados financeiros.</CardContent></Card> : null}
    </main>
  </DashboardLayout>;
}
