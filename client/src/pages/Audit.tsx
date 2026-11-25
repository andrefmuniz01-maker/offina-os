import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { PeriodPicker } from "@/components/PeriodPicker";
import { SafeLink as Link } from "@/components/SafeLink";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAuditAction } from "@/lib/auditDisplay";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { getPeriodRange, startOfDay, type PeriodView } from "@/lib/periodRange";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: ShieldCheck, label: "Auditoria", path: "/auditoria" }];
const actionCategories = [
  { value: "", label: "Todas as ações" },
  { value: "tenant_member.", label: "Acesso de equipe" },
  { value: "tenant.", label: "Oficina" },
  { value: "quote.", label: "Orçamentos" },
  { value: "work_order.", label: "Ordens de serviço" },
];

export default function Audit() {
  const demoMode = isDemoWorkspace();
  const legacyMine = trpc.tenant.mine.useQuery(undefined, { enabled: !demoMode });
  const workspaceMine = trpc.workspace.mine.useQuery(undefined, { enabled: demoMode });
  const tenant = demoMode ? selectWorkspace(workspaceMine.data, true)?.tenant : legacyMine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const tenantLoading = demoMode ? workspaceMine.isLoading : legacyMine.isLoading;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionPrefix, setActionPrefix] = useState("");
  const [view, setView] = useState<PeriodView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const range = getPeriodRange(view, anchor);
  const input = useMemo(() => ({ tenantId, page, pageSize: 20, actionPrefix: actionPrefix || undefined, rangeStart: range.start.toISOString(), rangeEnd: range.end.toISOString(), ...(search.trim() ? { search: search.trim() } : {}) }), [tenantId, page, search, actionPrefix, range.start, range.end]);
  const legacyAudit = trpc.tenant.audit.list.useQuery(input, { enabled: Boolean(tenantId) && !demoMode });
  const demoAudit = trpc.workspaceManagement.audit.list.useQuery(input, { enabled: Boolean(tenantId) && demoMode });
  const audit = demoMode ? demoAudit : legacyAudit;
  if (tenantLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-80" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>A trilha de auditoria é isolada por oficina e só pode ser consultada pela gestão autorizada.</CardDescription></CardHeader></Card></main></DashboardLayout>;
  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-6"><header className="border-b border-slate-200 pb-6"><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Auditoria</h1><p className="mt-1 text-sm text-slate-500">Registro de alterações críticas da oficina, disponível para a gestão autorizada.</p></header>

    <PeriodPicker view={view} onViewChange={next => { setView(next); setPage(1); }} anchor={anchor} onAnchorChange={next => { setAnchor(next); setPage(1); }} />

    <Card className="border-slate-200 shadow-none"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between"><div className="grid gap-1"><Label className="text-xs" htmlFor="audit-search">Buscar</Label><div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input id="audit-search" className="h-9 min-w-64 pl-8" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Ação, entidade ou ID" /></div></div><div className="grid gap-1"><Label className="text-xs" htmlFor="audit-action">Tipo de ação</Label><select id="audit-action" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={actionPrefix} onChange={event => { setActionPrefix(event.target.value); setPage(1); }}>{actionCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></div></CardContent></Card>{audit.isLoading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-20" key={index} />)}</div> : audit.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-5 text-sm text-red-900">{audit.error.message}</CardContent></Card> : audit.data?.items.length ? <section className="overflow-hidden border border-slate-200 bg-white"><div className="hidden grid-cols-[1.3fr_.8fr_.8fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500 md:grid"><span>Alteração</span><span>Registro</span><span>Data</span></div>{audit.data.items.map(entry => <article className="grid gap-2 border-b border-slate-100 px-5 py-4 last:border-0 md:grid-cols-[1.3fr_.8fr_.8fr] md:items-center md:gap-4" key={entry.id}><div><p className="font-medium text-slate-900">{formatAuditAction(entry.action)}</p><p className="mt-1 text-xs text-slate-500">{entry.metadata ? "Detalhes registrados" : "Alteração registrada"}</p></div><p className="text-sm text-slate-600">{entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ""}</p><p className="text-sm text-slate-500">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p></article>)}<div className="flex items-center justify-between bg-slate-50 px-5 py-3"><p className="text-sm text-slate-500">Página {audit.data.page}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => current - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button size="sm" variant="outline" disabled={!audit.data.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div></section> : <Card className="border-dashed border-slate-300"><CardContent className="p-10 text-center"><p className="font-medium text-slate-800">Nenhum evento encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste a busca ou consulte novamente quando houver alterações críticas.</p></CardContent></Card>}</main></DashboardLayout>;
}
