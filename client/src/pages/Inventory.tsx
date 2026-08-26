import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { inventoryBalanceLabels } from "@/lib/inventoryView";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, CalendarRange, ChevronLeft, ChevronRight, PackageSearch, Search } from "lucide-react";
import { useMemo, useState } from "react";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: PackageSearch, label: "Estoque", path: "/estoque" },
];

function defaultForecastDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export default function Inventory() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [forecastUntil, setForecastUntil] = useState(defaultForecastDate);
  const until = useMemo(() => new Date(`${forecastUntil}T23:59:59.999Z`), [forecastUntil]);
  const stockInput = useMemo(() => ({ tenantId: tenant?.id ?? 0, search: search.trim() || undefined, page, pageSize: 20 }), [tenant?.id, search, page]);
  const stock = trpc.inventory.list.useQuery(stockInput, { enabled: Boolean(tenant?.id) });
  const forecast = trpc.inventory.forecast.useQuery({ tenantId: tenant?.id ?? 0, until }, { enabled: Boolean(tenant?.id) });

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
            <p className="mt-1 text-sm text-slate-500">Disponível = físico − reservado. A projeção combina reservas, agenda e ordens de serviço ativas.</p>
          </div>
          <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Saldo em tempo real</Badge>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.6fr_.9fr]">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Inventário por produto</CardTitle>
              <div className="relative mt-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><Input className="pl-9" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por produto ou SKU" aria-label="Buscar produto no estoque" aria-describedby="inventory-search-help" /></div><span id="inventory-search-help" className="sr-only">A busca consulta apenas os produtos desta oficina e reinicia a página.</span>
            </CardHeader>
            <CardContent>
              {stock.isLoading ? <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : null}
              {stock.isError ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-900">Não foi possível carregar o inventário desta oficina.</p> : null}
              {!stock.isLoading && !stock.isError && stock.data?.items.length ? <>
                <div className="space-y-3 md:hidden">
                  {stock.data.items.map(item => {
                    const values = [item.physicalQuantity, item.reservedQuantity, item.availableQuantity];
                    return <article className="rounded-xl border border-slate-200 p-3" key={item.id}><div><p className="font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.sku || "Sem SKU"} · {item.unit}</p></div><dl className="mt-3 grid grid-cols-3 gap-2"><div><dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{inventoryBalanceLabels[0]}</dt><dd className="mt-1 font-semibold text-slate-700">{values[0]}</dd></div><div><dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{inventoryBalanceLabels[1]}</dt><dd className="mt-1 font-semibold text-slate-700">{values[1]}</dd></div><div><dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{inventoryBalanceLabels[2]}</dt><dd className={`mt-1 font-semibold ${item.availableQuantity <= item.minStock ? "text-red-600" : "text-emerald-700"}`}>{values[2]}</dd></div></dl></article>;
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-[.08em] text-slate-500"><tr><th className="pb-3 font-medium">Produto</th><th className="pb-3 text-right font-medium">Físico</th><th className="pb-3 text-right font-medium">Reservado</th><th className="pb-3 text-right font-medium">Disponível</th></tr></thead><tbody>{stock.data.items.map(item => <tr className="border-b border-slate-100 last:border-0" key={item.id}><td className="py-3"><p className="font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.sku || "Sem SKU"} · {item.unit}</p></td><td className="py-3 text-right text-slate-600">{item.physicalQuantity}</td><td className="py-3 text-right text-slate-600">{item.reservedQuantity}</td><td className={`py-3 text-right font-semibold ${item.availableQuantity <= item.minStock ? "text-red-600" : "text-emerald-700"}`}>{item.availableQuantity}</td></tr>)}</tbody></table></div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">Página {stock.data.page}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button type="button" size="sm" variant="outline" disabled={!stock.data.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
              </> : null}
              {!stock.isLoading && !stock.isError && !stock.data?.items.length ? <p className="py-10 text-center text-sm text-slate-500">{search.trim() ? "Nenhum produto neste filtro." : "Nenhum produto cadastrado nesta oficina."}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-700" /><CardTitle className="text-lg">Previsão de necessidade</CardTitle></div><CalendarRange className="h-4 w-4 text-slate-500" /></div>
              <CardDescription>Considere reservas, agenda e ordens de serviço ativas até a data escolhida.</CardDescription>
              <div className="mt-3 grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="forecast-until">Projetar até</label><Input id="forecast-until" type="date" value={forecastUntil} min={new Date().toISOString().slice(0, 10)} onChange={event => setForecastUntil(event.target.value)} /></div>
            </CardHeader>
            <CardContent className="space-y-3">
              {forecast.isLoading ? <><Skeleton className="h-16" /><Skeleton className="h-16" /></> : null}
              {forecast.isError ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-900">Não foi possível calcular a previsão de necessidade.</p> : null}
              {!forecast.isLoading && !forecast.isError && forecast.data?.length ? forecast.data.map(item => <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-3" key={item.productId}><p className="font-medium text-slate-900">{item.productName}</p><p className="mt-1 text-xs leading-5 text-slate-600">Disponível: {item.available} · Necessidade prevista: {item.futureNeed}</p><p className="text-xs leading-5 text-slate-600">Ainda não coberta por reserva: {item.unreservedFutureNeed} · Reservas ativas: {item.activeReservationDemand}</p><p className="text-xs leading-5 text-slate-600">Agendamentos afetados: {item.affectedAppointmentIds.length} · OS afetadas: {item.affectedWorkOrderIds.length}</p><p className="mt-1 text-sm font-semibold text-orange-800">Compra sugerida: {item.recommendedPurchaseQuantity}</p></div>) : null}
              {!forecast.isLoading && !forecast.isError && !forecast.data?.length ? <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nenhuma necessidade crítica identificada para o período.</p> : null}
            </CardContent>
          </Card>
        </section>
      </main>
    </DashboardLayout>
  );
}
