import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { BarChart3, CircleDollarSign, ClipboardCheck, UsersRound, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function defaultFromDate() { const date = new Date(); date.setUTCDate(date.getUTCDate() - 30); return isoDate(date); }

export function PlatformReportCard() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(() => isoDate(new Date()));
  const input = useMemo(() => ({ from: new Date(`${fromDate}T00:00:00.000Z`), to: new Date(`${toDate}T23:59:59.999Z`) }), [fromDate, toDate]);
  const report = trpc.platform.report.useQuery(input, { enabled: fromDate <= toDate });
  const totals = report.data?.totals;
  const metrics = totals ? [
    { label: "Receita recebida", value: money.format(totals.receivedRevenue), icon: CircleDollarSign, tone: "text-emerald-700 bg-emerald-50" },
    { label: "Clientes novos", value: String(totals.newCustomers), icon: UsersRound, tone: "text-sky-700 bg-sky-50" },
    { label: "Orçamentos aprovados", value: `${totals.approvedQuotes} / ${totals.quotes}`, icon: ClipboardCheck, tone: "text-orange-700 bg-orange-50" },
    { label: "OS entregues", value: String(totals.deliveredWorkOrders), icon: Wrench, tone: "text-violet-700 bg-violet-50" },
  ] : [];

  return <Card className="border-slate-200"><CardHeader><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-orange-700" /><CardTitle className="text-lg">Relatório consolidado da plataforma</CardTitle></div><CardDescription>Indicadores agregados por tenant no período escolhido. Não exibe clientes, veículos, ordens ou lançamentos individuais.</CardDescription><div className="mt-2 grid gap-3 sm:grid-cols-2"><div className="grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="platform-report-from">De</label><Input id="platform-report-from" type="date" value={fromDate} max={toDate} onChange={event => setFromDate(event.target.value)} /></div><div className="grid gap-1"><label className="text-xs font-medium text-slate-600" htmlFor="platform-report-to">Até</label><Input id="platform-report-to" type="date" min={fromDate} value={toDate} onChange={event => setToDate(event.target.value)} /></div></div></CardHeader><CardContent>{fromDate > toDate ? <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Informe um período inicial anterior ou igual ao final.</p> : report.isLoading ? <div className="grid gap-3 md:grid-cols-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : report.isError ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-900">Não foi possível consolidar os indicadores da plataforma.</p> : <><div className="grid gap-3 md:grid-cols-4">{metrics.map(metric => <div className="rounded-xl border border-slate-200 p-4" key={metric.label}><div className={`grid h-8 w-8 place-items-center rounded-lg ${metric.tone}`}><metric.icon className="h-4 w-4" /></div><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p><p className="mt-1 text-xl font-semibold text-slate-950">{metric.value}</p></div>)}</div><div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-[.08em] text-slate-500"><tr><th className="pb-3 font-medium">Oficina</th><th className="pb-3 text-right font-medium">Clientes</th><th className="pb-3 text-right font-medium">Orçamentos</th><th className="pb-3 text-right font-medium">OS entregues</th><th className="pb-3 text-right font-medium">Recebido</th></tr></thead><tbody>{report.data?.items.map(item => <tr className="border-b border-slate-100 last:border-0" key={item.id}><td className="py-3"><p className="font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.slug} · <Badge variant="outline" className="align-middle">{item.active ? item.status : "inativa"}</Badge></p></td><td className="py-3 text-right text-slate-700">{item.newCustomers}</td><td className="py-3 text-right text-slate-700">{item.approvedQuotes} / {item.quotes}</td><td className="py-3 text-right text-slate-700">{item.deliveredWorkOrders}</td><td className="py-3 text-right font-semibold text-slate-900">{money.format(item.receivedRevenue)}</td></tr>)}</tbody></table></div>{!report.data?.items.length ? <p className="py-8 text-center text-sm text-slate-500">Nenhuma oficina disponível para consolidação.</p> : null}</>}</CardContent></Card>;
}
