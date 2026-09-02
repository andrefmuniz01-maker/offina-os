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
import { getSupportTenantId, isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { getPeriodRange, startOfDay, type PeriodView } from "@/lib/periodRange";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CircleDollarSign, Landmark, Search, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: CircleDollarSign, label: "Resumo", path: "/financeiro" },
  { icon: Wallet, label: "Despesas", path: "/financeiro/despesas" },
  { icon: TrendingUp, label: "Receitas", path: "/financeiro/receitas" },
];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type RevenueStatus = "all" | "expected" | "received" | "cancelled";
const statusLabels: Record<string, string> = { expected: "Prevista", received: "Recebida", cancelled: "Cancelada" };

export default function FinanceRevenues() {
  const demoMode = isDemoWorkspace();
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, demoMode, getSupportTenantId())?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();

  const [status, setStatus] = useState<RevenueStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<PeriodView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const range = getPeriodRange(view, anchor);

  const revenues = trpc.workspaceFinance.revenues.list.useQuery({ tenantId, status: status === "all" ? undefined : status, search: search.trim() || undefined, page, pageSize: 15, rangeStart: range.start.toISOString(), rangeEnd: range.end.toISOString() }, { enabled: Boolean(tenantId) });
  const financeForbidden = hasFinancialPermissionError(revenues.error?.data?.code);

  const receiveRevenue = trpc.workspaceFinance.revenues.markReceived.useMutation({
    onSuccess: () => { toast.success("Receita marcada como recebida."); utils.workspaceFinance.revenues.list.invalidate(); utils.workspace.dashboardOverview.invalidate(); },
    onError: error => toast.error(error.message),
  });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-64" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardContent className="p-8 text-center text-sm text-slate-600">Seu acesso ainda não está vinculado a uma oficina.</CardContent></Card></main></DashboardLayout>;
  if (financeForbidden) return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-3xl"><Card className="border-amber-200 bg-amber-50/60"><CardContent className="flex items-start gap-3 p-6 text-sm text-amber-950"><Landmark className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />Este perfil não pode consultar receitas.</CardContent></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Receitas</h1><p className="mt-1 text-sm text-slate-500">Receitas nascem de orçamentos aprovados e ordens de serviço concluídas. Confirme o recebimento quando o pagamento cair.</p></div>
      <Badge className="w-fit bg-slate-950 text-white hover:bg-slate-950">Acesso financeiro</Badge>
    </header>

    <PeriodPicker view={view} onViewChange={next => { setView(next); setPage(1); }} anchor={anchor} onAnchorChange={next => { setAnchor(next); setPage(1); }} />

    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><CardTitle className="text-lg">Receitas</CardTitle><CardDescription>Busque por observação ou forma de recebimento.</CardDescription></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1"><Label className="text-xs" htmlFor="revenue-search">Buscar</Label><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="revenue-search" className="h-9 min-w-0 pl-8" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Observação ou forma" /></div></div>
          <div className="grid gap-1"><Label className="text-xs" htmlFor="revenue-status">Status</Label><select id="revenue-status" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={status} onChange={event => { setStatus(event.target.value as RevenueStatus); setPage(1); }}><option value="all">Todos</option><option value="expected">Prevista</option><option value="received">Recebida</option><option value="cancelled">Cancelada</option></select></div>
        </div>
      </CardHeader>
      <CardContent>
        {revenues.isLoading ? <Skeleton className="h-48" /> : null}
        {revenues.isError ? <p className="py-10 text-center text-sm text-red-700">{financialErrorMessage("as receitas", revenues.error.data?.code)}</p> : null}
        {!revenues.isLoading && !revenues.isError && revenues.data?.items.length ? <>
          <div className="space-y-2">{revenues.data.items.map(item => <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-slate-900">{money.format(Number(item.amount))}</p><p className="text-xs text-slate-500">{item.notes ?? "Sem observação"}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{statusLabels[item.status] ?? item.status}</Badge>{item.status === "expected" ? <Button size="sm" disabled={receiveRevenue.isPending} onClick={() => receiveRevenue.mutate({ tenantId, revenueId: item.id, paymentMethod: "manual" })}>Confirmar recebimento</Button> : null}</div></div>)}</div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Página {page}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Anterior</Button><Button size="sm" variant="outline" disabled={!revenues.data.hasMore} onClick={() => setPage(current => current + 1)}>Próxima</Button></div></div>
        </> : null}
        {!revenues.isLoading && !revenues.isError && !revenues.data?.items.length ? <p className="py-10 text-center text-sm text-slate-500">Nenhuma receita neste filtro.</p> : null}
      </CardContent>
    </Card>
  </main></DashboardLayout>;
}
