import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getInventoryAccessMessage } from "@/lib/inventoryAccess";
import { getInventoryAvailability, getInventoryTone } from "@/lib/inventoryPriority";
import { inventoryBalanceLabels } from "@/lib/inventoryView";
import { trpc } from "@/lib/trpc";
import { getSupportTenantId, isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { AlertTriangle, ArrowLeft, Boxes, CalendarRange, ChevronLeft, ChevronRight, History, PackageCheck, PackageSearch, Search, ShoppingCart, Truck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: PackageSearch, label: "Estoque", path: "/estoque" },
  { icon: ShoppingCart, label: "Compras", path: "/compras" },
];

const movementTypeLabels: Record<string, string> = {
  purchase_entry: "Entrada de compra",
  reservation: "Reserva",
  reservation_release: "Liberação de reserva",
  consumption: "Consumo",
  adjustment: "Ajuste manual",
  return: "Devolução",
};
const movementDateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function MovementHistoryDialog({ tenantId, product, onClose }: { tenantId: number; product: { id: number; name: string }; onClose: () => void }) {
  const movements = trpc.workspaceInventory.movements.useQuery({ tenantId, productId: product.id }, { enabled: Boolean(tenantId) });
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Histórico de movimentação</DialogTitle><DialogDescription>{product.name}</DialogDescription></DialogHeader>
        {movements.isLoading ? <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : null}
        {movements.isError ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-900">Não foi possível carregar o histórico deste produto.</p> : null}
        {!movements.isLoading && !movements.isError && movements.data?.length ? (
          <ul className="space-y-2">{movements.data.map((movement: { id: number; type: string; physicalDelta: number; createdAt: string; notes: string | null }) => (
            <li key={movement.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-slate-900">{movementTypeLabels[movement.type] ?? movement.type}</span><span className={`font-semibold tabular-nums ${Number(movement.physicalDelta) < 0 ? "text-red-600" : "text-emerald-700"}`}>{Number(movement.physicalDelta) > 0 ? "+" : ""}{movement.physicalDelta}</span></div>
              <p className="mt-1 text-xs text-slate-500">{movementDateFormat.format(new Date(movement.createdAt))}</p>
              {movement.notes ? <p className="mt-1 text-xs text-slate-600">{movement.notes}</p> : null}
            </li>
          ))}</ul>
        ) : null}
        {!movements.isLoading && !movements.isError && !movements.data?.length ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma movimentação registrada para este produto.</p> : null}
      </DialogContent>
    </Dialog>
  );
}

function defaultForecastDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export default function Inventory() {
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, isDemoWorkspace(), getSupportTenantId())?.tenant;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [forecastUntil, setForecastUntil] = useState(defaultForecastDate);
  const [adjustment, setAdjustment] = useState({ productId: "", quantityDelta: "", notes: "" });
  const [historyProduct, setHistoryProduct] = useState<{ id: number; name: string } | null>(null);
  const utils = trpc.useUtils();
  const until = useMemo(() => new Date(`${forecastUntil}T23:59:59.999Z`), [forecastUntil]);
  const stockInput = useMemo(() => ({ tenantId: tenant?.id ?? 0, search: search.trim() || undefined, page, pageSize: 20 }), [tenant?.id, search, page]);
  const stock = trpc.workspaceInventory.list.useQuery(stockInput, { enabled: Boolean(tenant?.id) });
  const forecast = trpc.workspaceInventory.forecast.useQuery({ tenantId: tenant?.id ?? 0, until }, { enabled: Boolean(tenant?.id) });
  const stockItems = stock.data?.items ?? [];
  const criticalCount = stockItems.filter(item => item.availableQuantity <= item.minStock).length;
  const reservedCount = stockItems.filter(item => item.reservedQuantity > 0).length;
  const forecastItems = forecast.data ?? [];
  const inventoryForbidden = stock.error?.data?.code === "FORBIDDEN" || forecast.error?.data?.code === "FORBIDDEN";
  const adjust = trpc.workspaceInventory.adjust.useMutation({
    onSuccess: () => {
      toast.success("Ajuste registrado com auditoria.");
      setAdjustment({ productId: "", quantityDelta: "", notes: "" });
      utils.workspaceInventory.list.invalidate();
      utils.workspaceInventory.forecast.invalidate();
      utils.workspaceInventory.movements.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (!mine.isLoading && !tenant) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-7xl space-y-7"><header className="border-b border-slate-200 pb-6"><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Estoque</h1></header><Card className="border-dashed border-slate-300"><CardContent className="p-8 text-center text-sm text-slate-600">Seu acesso ainda não está vinculado a uma oficina. Peça a um Super Admin para associá-lo ao tenant correto antes de consultar inventário, reservas e previsões.</CardContent></Card></main></DashboardLayout>;
  }

  return (
    <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}>
      <main className="mx-auto max-w-7xl space-y-7">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
          <div>
            <Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Estoque</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Controle o saldo que a operação realmente pode usar. A projeção combina reservas, agenda e ordens de serviço ativas.</p>
          </div>
          <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Saldo em tempo real</Badge>
        </header>

        <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white shadow-sm" aria-label="Resumo do estoque"><div className="grid gap-px bg-emerald-100 md:grid-cols-[1.35fr_repeat(3,minmax(0,1fr))]"><div className="bg-white/80 p-5"><p className="text-xs font-semibold text-emerald-700">Pulso de estoque</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Proteja a execução antes que falte peça.</p><p className="mt-1 text-sm text-slate-600">Os indicadores consideram os produtos exibidos nesta página e a projeção selecionada.</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Em nível crítico</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{criticalCount}</p><p className="mt-1 text-xs text-slate-500">Produtos no mínimo ou abaixo dele</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Com reserva ativa</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{reservedCount}</p><p className="mt-1 text-xs text-slate-500">Itens já comprometidos com serviços</p></div><div className="bg-white p-5"><p className="text-xs font-medium text-slate-500">Reposição projetada</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{forecastItems.length}</p><p className="mt-1 text-xs text-slate-500">Necessidades até a data escolhida</p></div></div></section>

        <section className="grid gap-4 lg:grid-cols-[1.6fr_.9fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="inline-flex items-center gap-2 text-lg"><PackageCheck className="h-4 w-4 text-orange-700" />Inventário por produto</CardTitle>
              <CardDescription>Disponível é o saldo físico menos as unidades já reservadas para a operação.</CardDescription>
              <div className="relative mt-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><Input className="pl-9" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por produto ou SKU" aria-label="Buscar produto no estoque" aria-describedby="inventory-search-help" /></div><span id="inventory-search-help" className="sr-only">A busca consulta apenas os produtos desta oficina e reinicia a página.</span>
            </CardHeader>
            <CardContent>
              {stock.isLoading ? <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : null}
              {stock.isError ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-900">{getInventoryAccessMessage(stock.error.data?.code)}</p> : null}
              {!stock.isLoading && !stock.isError && stock.data?.items.length ? <>
                <div className="space-y-3 md:hidden">
                  {stockItems.map(item => {
                    const values = [item.physicalQuantity, item.reservedQuantity, item.availableQuantity];
                    const availability = getInventoryAvailability(item.availableQuantity, item.minStock);
                    return <article className="rounded-xl border border-slate-200 p-3 shadow-sm" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.sku || "Sem SKU"} · {item.unit}</p></div><Badge variant="outline" className={getInventoryTone(availability.tone)}>{availability.label}</Badge></div><dl className="mt-3 grid grid-cols-3 gap-2"><div><dt className="text-[11px] font-medium text-slate-500">{inventoryBalanceLabels[0]}</dt><dd className="mt-1 font-semibold text-slate-700">{values[0]}</dd></div><div><dt className="text-[11px] font-medium text-slate-500">{inventoryBalanceLabels[1]}</dt><dd className="mt-1 font-semibold text-slate-700">{values[1]}</dd></div><div><dt className="text-[11px] font-medium text-slate-500">{inventoryBalanceLabels[2]}</dt><dd className={`mt-1 font-semibold ${availability.tone === "normal" ? "text-emerald-700" : "text-red-600"}`}>{values[2]}</dd></div></dl><Button type="button" size="sm" variant="outline" className="mt-3 w-full" onClick={() => setHistoryProduct({ id: item.id, name: item.name })}><History className="mr-1.5 h-3.5 w-3.5" />Histórico</Button></article>;
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr><th className="pb-3 font-medium">Produto</th><th className="pb-3 text-right font-medium">Físico</th><th className="pb-3 text-right font-medium">Reservado</th><th className="pb-3 text-right font-medium">Disponível</th><th className="pb-3 text-right font-medium">Situação</th><th className="pb-3 text-right font-medium">Histórico</th></tr></thead><tbody>{stockItems.map(item => { const availability = getInventoryAvailability(item.availableQuantity, item.minStock); return <tr className="border-b border-slate-100 last:border-0" key={item.id}><td className="py-3"><p className="font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.sku || "Sem SKU"} · {item.unit}</p></td><td className="py-3 text-right text-slate-600">{item.physicalQuantity}</td><td className="py-3 text-right text-slate-600">{item.reservedQuantity}</td><td className={`py-3 text-right font-semibold ${availability.tone === "normal" ? "text-emerald-700" : "text-red-600"}`}>{item.availableQuantity}</td><td className="py-3 text-right"><Badge variant="outline" className={getInventoryTone(availability.tone)}>{availability.label}</Badge></td><td className="py-3 text-right"><Button type="button" size="sm" variant="ghost" onClick={() => setHistoryProduct({ id: item.id, name: item.name })} aria-label={`Histórico de ${item.name}`}><History className="h-4 w-4" /></Button></td></tr>; })}</tbody></table></div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">Página {stock.data?.page ?? page}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button type="button" size="sm" variant="outline" disabled={!stock.data?.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
              </> : null}
              {!stock.isLoading && !stock.isError && !stock.data?.items.length ? <p className="py-10 text-center text-sm text-slate-500">{search.trim() ? "Nenhum produto neste filtro." : "Nenhum produto cadastrado nesta oficina."}</p> : null}
            </CardContent>
          </Card>

          {!inventoryForbidden ? <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-700" /><CardTitle className="text-lg">Previsão de necessidade</CardTitle></div><CalendarRange className="h-4 w-4 text-slate-500" /></div>
              <CardDescription>Considere reservas, agenda e ordens de serviço ativas até a data escolhida.</CardDescription>
              <div className="mt-3 grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="forecast-until">Projetar até</label><Input id="forecast-until" type="date" value={forecastUntil} min={new Date().toISOString().slice(0, 10)} onChange={event => setForecastUntil(event.target.value)} /></div>
            </CardHeader>
            <CardContent className="space-y-3">
              {forecast.isLoading ? <><Skeleton className="h-16" /><Skeleton className="h-16" /></> : null}
              {forecast.isError ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-900">Não foi possível calcular a previsão de necessidade.</p> : null}
              {!forecast.isLoading && !forecast.isError && forecastItems.length ? forecastItems.map(item => <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-3" key={item.productId}><div className="flex items-start justify-between gap-3"><p className="font-medium text-slate-900">{item.productName}</p><Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Repor</Badge></div><p className="mt-1 text-xs leading-5 text-slate-600">Disponível: {item.available} · Necessidade prevista: {item.futureNeed}</p><p className="text-xs leading-5 text-slate-600">Ainda não coberta por reserva: {item.unreservedFutureNeed} · Reservas ativas: {item.activeReservationDemand}</p><p className="text-xs leading-5 text-slate-600">Agendamentos afetados: {item.affectedAppointmentIds.length} · OS afetadas: {item.affectedWorkOrderIds.length}</p><p className="mt-2 text-sm font-semibold text-orange-800">Compra sugerida: {item.recommendedPurchaseQuantity}</p></div>) : null}
              {!forecast.isLoading && !forecast.isError && !forecast.data?.length ? <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nenhuma necessidade crítica identificada para o período.</p> : null}
            </CardContent>
          </Card> : <Card className="border-amber-200 bg-amber-50/60 shadow-sm"><CardHeader><CardTitle className="text-lg">Inventário restrito</CardTitle><CardDescription>As previsões e os ajustes são exibidos apenas para perfis com responsabilidade de estoque.</CardDescription></CardHeader></Card>}
        </section>

        {!inventoryForbidden ? <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Ajuste controlado de saldo</CardTitle><CardDescription>Use somente para divergências conferidas. O sistema bloqueia qualquer redução que deixe o físico abaixo das reservas ativas.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2"><Label htmlFor="inventory-adjust-product">Produto</Label><select id="inventory-adjust-product" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={adjustment.productId} onChange={event => setAdjustment({ ...adjustment, productId: event.target.value })}><option value="">Selecione um produto da página</option>{stockItems.map(item => <option key={item.id} value={item.id}>{item.name} — disponível {item.availableQuantity}</option>)}</select></div>
              <div className="grid gap-2"><Label htmlFor="inventory-adjust-quantity">Variação física</Label><Input id="inventory-adjust-quantity" type="number" step="0.001" value={adjustment.quantityDelta} onChange={event => setAdjustment({ ...adjustment, quantityDelta: event.target.value })} placeholder="Ex.: 2 ou -1" /><p className="text-xs text-slate-500">Valores positivos adicionam; negativos reduzem o saldo físico.</p></div>
              <div className="grid gap-2"><Label htmlFor="inventory-adjust-notes">Motivo</Label><Input id="inventory-adjust-notes" value={adjustment.notes} onChange={event => setAdjustment({ ...adjustment, notes: event.target.value })} maxLength={1000} placeholder="Ex.: conferência de inventário" /></div>
              <Button disabled={adjust.isPending || !adjustment.productId || !Number(adjustment.quantityDelta) || adjustment.notes.trim().length < 3} onClick={() => adjust.mutate({ tenantId: tenant!.id, productId: Number(adjustment.productId), quantityDelta: Number(adjustment.quantityDelta), notes: adjustment.notes })}>{adjust.isPending ? "Registrando…" : "Registrar ajuste"}</Button>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Regra de disponibilidade</CardTitle><CardDescription>O saldo disponível é calculado no banco como estoque físico menos reservas de orçamentos aprovados e OS em andamento.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600"><p>As movimentações ficam vinculadas ao produto, ao responsável e à origem. Recebimentos de compra atualizam o físico e o custo médio somente após confirmação.</p><p>Uma redução não pode consumir unidades já comprometidas; para liberar reserva, o fluxo correto será a alteração da aprovação ou da ordem de serviço correspondente.</p></CardContent>
          </Card>
        </section> : null}
      </main>
      {historyProduct && tenant ? <MovementHistoryDialog tenantId={tenant.id} product={historyProduct} onClose={() => setHistoryProduct(null)} /> : null}
    </DashboardLayout>
  );
}
