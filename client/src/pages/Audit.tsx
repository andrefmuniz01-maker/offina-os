import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: ShieldCheck, label: "Auditoria", path: "/auditoria" }];

export default function Audit() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const [page, setPage] = useState(1);
  const input = useMemo(() => ({ tenantId, page, pageSize: 20 }), [tenantId, page]);
  const audit = trpc.tenant.audit.list.useQuery(input, { enabled: Boolean(tenantId) });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-80" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>A trilha de auditoria é isolada por oficina e só pode ser consultada pela gestão autorizada.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
    <main className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Trilha de auditoria</h1><p className="mt-1 text-sm text-slate-500">Eventos críticos desta oficina, visíveis somente para a gestão autorizada.</p></div><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Registro imutável</Badge></header>
      {audit.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-20" key={index} />)}</div> : audit.isError ? <Card className="border-red-100 bg-red-50"><CardHeader><CardTitle>Acesso indisponível</CardTitle><CardDescription>{audit.error.message}</CardDescription></CardHeader></Card> : audit.data?.items.length ? <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="hidden grid-cols-[1.2fr_.8fr_.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid"><span>Evento</span><span>Entidade</span><span>Quando</span></div>{audit.data.items.map(entry => <div className="grid gap-2 border-b border-slate-100 px-5 py-4 last:border-0 md:grid-cols-[1.2fr_.8fr_.8fr] md:items-center md:gap-4" key={entry.id}><div><p className="font-medium text-slate-900">{entry.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{entry.metadata ? "Dados complementares registrados" : "Alteração registrada"}</p></div><div><Badge variant="outline">{entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ""}</Badge></div><p className="text-sm text-slate-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p></div>)}<div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3"><p className="text-sm text-slate-500">Página {audit.data.page}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => current - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button size="sm" variant="outline" disabled={!audit.data.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div></div> : <Card className="border-dashed border-slate-300"><CardHeader className="items-center py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-50 text-orange-700"><ShieldCheck className="h-6 w-6" /></div><CardTitle className="mt-4">Ainda não há eventos</CardTitle><CardDescription>Alterações críticas de estoque, orçamento, equipe e financeiro aparecerão aqui quando ocorrerem.</CardDescription></CardHeader></Card>}
    </main>
  </DashboardLayout>;
}
