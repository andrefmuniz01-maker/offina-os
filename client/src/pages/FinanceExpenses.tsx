import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { PeriodPicker } from "@/components/PeriodPicker";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { financialErrorMessage, hasFinancialPermissionError } from "@/lib/financialStates";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { getPeriodRange, startOfDay, type PeriodView } from "@/lib/periodRange";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, CircleDollarSign, Landmark, Plus, Search, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: CircleDollarSign, label: "Resumo", path: "/financeiro" },
  { icon: Wallet, label: "Despesas", path: "/financeiro/despesas" },
  { icon: TrendingUp, label: "Receitas", path: "/financeiro/receitas" },
];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type ExpenseStatus = "all" | "planned" | "paid" | "cancelled";
const statusLabels: Record<string, string> = { planned: "Planejada", paid: "Paga", cancelled: "Cancelada" };

export default function FinanceExpenses() {
  const demoMode = isDemoWorkspace();
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, demoMode)?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();

  const [status, setStatus] = useState<ExpenseStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ category: "", amount: "0", date: new Date().toISOString().slice(0, 10) });
  const [view, setView] = useState<PeriodView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const range = getPeriodRange(view, anchor);

  const expenses = trpc.workspaceFinance.expenses.list.useQuery({ tenantId, status: status === "all" ? undefined : status, search: search.trim() || undefined, page, pageSize: 15, rangeStart: range.start.toISOString(), rangeEnd: range.end.toISOString() }, { enabled: Boolean(tenantId) });
  const financeForbidden = hasFinancialPermissionError(expenses.error?.data?.code);

  const invalidate = () => { utils.workspaceFinance.expenses.list.invalidate(); utils.workspace.dashboardOverview.invalidate(); };
  const createExpense = trpc.workspaceFinance.expenses.create.useMutation({
    onSuccess: () => { toast.success("Despesa registrada."); setForm({ category: "", amount: "0", date: new Date().toISOString().slice(0, 10) }); setPage(1); invalidate(); },
    onError: error => toast.error(error.message),
  });
  const markPaid = trpc.workspaceFinance.expenses.markPaid.useMutation({
    onSuccess: () => { toast.success("Despesa marcada como paga."); invalidate(); },
    onError: error => toast.error(error.message),
  });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-64" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardContent className="p-8 text-center text-sm text-slate-600">Seu acesso ainda não está vinculado a uma oficina.</CardContent></Card></main></DashboardLayout>;
  if (financeForbidden) return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-3xl"><Card className="border-amber-200 bg-amber-50/60"><CardContent className="flex items-start gap-3 p-6 text-sm text-amber-950"><Landmark className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />Este perfil não pode consultar ou registrar despesas.</CardContent></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Despesas</h1><p className="mt-1 text-sm text-slate-500">Registre compromissos financeiros reais. Eles não são criados automaticamente.</p></div>
      <Badge className="w-fit bg-slate-950 text-white hover:bg-slate-950">Acesso financeiro</Badge>
    </header>

    <PeriodPicker view={view} onViewChange={next => { setView(next); setPage(1); }} anchor={anchor} onAnchorChange={next => { setAnchor(next); setPage(1); }} />

    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-lg">Nova despesa</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2"><Label htmlFor="expense-category">Categoria</Label><Input id="expense-category" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} placeholder="Ex.: aluguel, fornecedor, energia" /></div>
          <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="expense-amount">Valor</Label><Input id="expense-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="expense-date">Data</Label><Input id="expense-date" type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></div></div>
          <Button disabled={createExpense.isPending || !form.category.trim() || Number(form.amount) <= 0} onClick={() => createExpense.mutate({ tenantId, category: form.category, amount: Number(form.amount), expenseDate: new Date(`${form.date}T12:00:00`) })}><Plus className="mr-2 h-4 w-4" />{createExpense.isPending ? "Registrando…" : "Registrar despesa"}</Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><CardTitle className="text-lg">Despesas registradas</CardTitle><CardDescription>Busque por categoria ou observação.</CardDescription></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1"><Label className="text-xs" htmlFor="expense-search">Buscar</Label><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="expense-search" className="h-9 min-w-0 pl-8" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Categoria ou observação" /></div></div>
            <div className="grid gap-1"><Label className="text-xs" htmlFor="expense-status">Status</Label><select id="expense-status" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={status} onChange={event => { setStatus(event.target.value as ExpenseStatus); setPage(1); }}><option value="all">Todos</option><option value="planned">Planejada</option><option value="paid">Paga</option><option value="cancelled">Cancelada</option></select></div>
          </div>
        </CardHeader>
        <CardContent>
          {expenses.isLoading ? <Skeleton className="h-48" /> : null}
          {expenses.isError ? <p className="py-10 text-center text-sm text-red-700">{financialErrorMessage("as despesas", expenses.error.data?.code)}</p> : null}
          {!expenses.isLoading && !expenses.isError && expenses.data?.items.length ? <>
            <div className="space-y-2">{expenses.data.items.map(item => <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><p className="font-medium text-slate-900">{item.category}</p><Badge variant="outline">{statusLabels[item.status] ?? item.status}</Badge></div><p className="mt-1 text-lg font-semibold text-slate-800">{money.format(Number(item.amount))}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.expenseDate).toLocaleDateString("pt-BR")}{item.notes ? ` · ${item.notes}` : ""}</p></div>{item.status === "planned" ? <Button size="sm" disabled={markPaid.isPending} onClick={() => markPaid.mutate({ tenantId, expenseId: item.id })}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Marcar como paga</Button> : null}</div>)}</div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Página {page}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Anterior</Button><Button size="sm" variant="outline" disabled={!expenses.data.hasMore} onClick={() => setPage(current => current + 1)}>Próxima</Button></div></div>
          </> : null}
          {!expenses.isLoading && !expenses.isError && !expenses.data?.items.length ? <p className="py-10 text-center text-sm text-slate-500">Nenhuma despesa neste filtro.</p> : null}
        </CardContent>
      </Card>
    </div>
  </main></DashboardLayout>;
}
