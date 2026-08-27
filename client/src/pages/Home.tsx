import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
// Regras reutilizáveis ficam fora do componente para manter a atualização rápida estável.
import { getHomeNavigationContext, getWorkspaceMenuKeys, getWorkspaceMetrics, getWorkspaceNoTenantState, getWorkspacePriorityKeys, type WorkspaceDailyMenuKey, type WorkspaceRole } from "@/lib/homeWorkspace";
import { isDemoWorkspace, selectWorkspace, withDemoContext } from "@/lib/demoWorkspace";
import { ArrowRight, Bell, CalendarClock, ChartNoAxesCombined, CircleAlert, CircleDollarSign, ClipboardCheck, ClipboardList, PackageSearch, Plus, ReceiptText, Settings2, ShieldCheck, Store, UsersRound, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const workspaceMenuDefinitions: Array<DashboardMenuItem & { key: WorkspaceDailyMenuKey }> = [
  { key: "today", icon: ChartNoAxesCombined, label: "Hoje", path: "/" },
  { key: "requests", icon: ClipboardList, label: "Solicitações", path: "/solicitacoes" },
  { key: "quotes", icon: ReceiptText, label: "Orçamentos", path: "/orcamentos" },
  { key: "operations", icon: CalendarClock, label: "Agenda & pátio", path: "/operacao" },
  { key: "inventory", icon: PackageSearch, label: "Estoque", path: "/estoque" },
  { key: "customers", icon: UsersRound, label: "Clientes", path: "/clientes" },
  { key: "team", icon: UsersRound, label: "Equipe", path: "/equipe" },
  { key: "finance", icon: CircleDollarSign, label: "Financeiro", path: "/financeiro" },
  { key: "settings", icon: Settings2, label: "Configurações", path: "/configuracoes" },
];

function getWorkspaceMenuItems(role: WorkspaceRole) {
  const allowed = new Set(getWorkspaceMenuKeys(role));
  return workspaceMenuDefinitions.filter(item => allowed.has(item.key));
}

const platformMenuItems: DashboardMenuItem[] = [
  { icon: ShieldCheck, label: "Plataforma", path: "/plataforma" },
];

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="border-slate-200 shadow-none"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-slate-950">{value}</p><p className="mt-1.5 text-sm text-slate-500">{detail}</p></CardContent></Card>;
}

function CreateTenant({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const createTenant = trpc.workspace.createTenant.useMutation({ onSuccess: () => { toast.success("Oficina criada com segurança."); onCreated(); }, onError: error => toast.error(error.message) });
  const normalizeSlug = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const updateName = (value: string) => { setName(value); if (!slug || slug === normalizeSlug(name)) setSlug(normalizeSlug(value)); };
  return <Card className="mx-auto mt-16 max-w-2xl border-slate-200 shadow-[0_30px_80px_-40px_rgba(15,23,42,.45)]"><CardHeader className="border-b border-slate-100 pb-5"><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Configuração controlada</Badge><CardTitle className="mt-3 text-2xl text-slate-950">Crie a primeira oficina</CardTitle><CardDescription className="max-w-xl text-base leading-6">A criação é restrita ao Super Admin. Ao concluir, você será vinculado como dono e os dados operacionais permanecerão isolados neste tenant.</CardDescription></CardHeader><CardContent className="grid gap-5 p-6 sm:grid-cols-2"><div className="grid gap-2 sm:col-span-2"><Label htmlFor="tenant-name">Nome comercial</Label><Input id="tenant-name" value={name} onChange={event => updateName(event.target.value)} placeholder="Ex.: Ruidão Performance" /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="tenant-slug">Identificador público</Label><div className="flex items-center rounded-md border border-slate-200 bg-slate-50 px-3"><span className="text-sm text-slate-400">/solicitar/</span><Input id="tenant-slug" className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0" value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} placeholder="ruidao-performance" /></div></div><div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="max-w-md text-xs leading-5 text-slate-500">O formulário público será vinculado a esse identificador. Não há dados demonstrativos sendo criados.</p><Button disabled={name.trim().length < 3 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || createTenant.isPending} onClick={() => createTenant.mutate({ name: name.trim(), slug })}><Plus className="mr-2 h-4 w-4" />{createTenant.isPending ? "Criando…" : "Criar oficina"}</Button></div></CardContent></Card>;
}

function WorkspaceDashboard({ tenantId, tenantName, tenantSlug, role }: { tenantId: number; tenantName: string; tenantSlug: string; role: WorkspaceRole }) {
  const overview = trpc.workspace.dashboardOverview.useQuery({ tenantId });
  const notifications = trpc.workspace.notifications.useQuery({ tenantId, maxItems: 5 });
  const stats = overview.data;
  const metrics = useMemo(() => stats ? getWorkspaceMetrics(stats, role) : [], [role, stats]);
  const priorities = useMemo(() => {
    if (!stats) return [];
    const allowed = new Set(getWorkspacePriorityKeys(role));
    return [
      { key: "commercial" as const, title: `${stats.commercial.pendingQuoteCount} orçamento(s) aguardam resposta`, detail: "Priorize os retornos comerciais antes de iniciar novos atendimentos.", href: withDemoContext("/orcamentos"), icon: ReceiptText, tone: "bg-amber-50 text-amber-700" },
      { key: "operation" as const, title: `${stats.operation.scheduled} compromisso(s) aguardam confirmação`, detail: "Revise agenda, baia e disponibilidade da equipe para o dia.", href: withDemoContext("/operacao"), icon: CalendarClock, tone: "bg-sky-50 text-sky-700" },
      { key: "inventory" as const, title: `${stats.inventory.critical} item(ns) precisam de revisão`, detail: "O cálculo considera saldo físico, reservas e estoque mínimo configurado.", href: withDemoContext("/estoque"), icon: PackageSearch, tone: "bg-red-50 text-red-700" },
    ].filter(item => allowed.has(item.key));
  }, [role, stats]);

  return <div className="mx-auto max-w-7xl space-y-6"><header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-100 bg-orange-50/80 px-2.5 py-1"><span className="h-1.5 w-1.5 rounded-full bg-orange-600" /><span className="workshop-eyebrow text-xs font-semibold uppercase">Central do dia</span></div><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{tenantName}</h1><p className="mt-1 text-sm text-slate-500">Comece pelas prioridades comerciais, operacionais e de estoque da oficina.</p></div><Button asChild variant="outline"><a href={withDemoContext(`/solicitar/${tenantSlug}`)}><ClipboardCheck className="mr-2 h-4 w-4" />Solicitação pública</a></Button></header>{overview.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-36" key={index} />)}</div> : overview.isError ? <Card className="border-red-200 bg-red-50"><CardContent className="p-6"><p className="font-medium text-red-950">A central do dia está indisponível</p><p className="mt-1 text-sm text-red-900">Não foi possível consultar os dados da oficina. Nenhum resultado foi interpretado como zero.</p></CardContent></Card> : <><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do dia">{metrics.map(metric => <Metric key={metric.label} {...metric} />)}</section><section className="grid gap-5 lg:grid-cols-[1.4fr_.9fr]"><Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Prioridades de hoje</CardTitle><CardDescription>Atalhos para os fluxos que merecem atenção agora.</CardDescription></CardHeader><CardContent className="space-y-3">{priorities.map(item => <a className="group flex gap-3 rounded-xl border border-slate-100 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50" href={item.href} key={item.href}><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.tone}`}><item.icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="font-medium text-slate-900">{item.title}</p><p className="mt-1 text-sm leading-5 text-slate-500">{item.detail}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" /></a>)}</CardContent></Card><Card className="border-slate-200"><CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle className="text-lg">Notificações</CardTitle><CardDescription>Eventos internos que exigem acompanhamento.</CardDescription></div><Bell className="h-5 w-5 text-slate-400" /></CardHeader><CardContent className="space-y-3">{notifications.isLoading ? <><Skeleton className="h-16" /><Skeleton className="h-16" /></> : notifications.isError ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">Não foi possível carregar as notificações agora.</p> : notifications.data?.items.length ? notifications.data.items.map(({ notification }) => <div key={notification.id} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-medium text-slate-900">{notification.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{notification.body}</p></div>) : <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nenhum alerta pendente para este usuário.</div>}</CardContent></Card></section></>}</div>;
}

function PlatformReadOnlyStart() {
  return <Card className="mx-auto mt-16 max-w-2xl border-slate-200 shadow-[0_30px_80px_-40px_rgba(15,23,42,.45)]"><CardHeader><Badge className="w-fit bg-slate-100 text-slate-700 hover:bg-slate-100">Contexto global</Badge><CardTitle className="mt-3 text-2xl text-slate-950">Central administrativa</CardTitle><CardDescription className="max-w-xl text-base leading-6">Seu acesso é global. A operação de tenants permanece separada; acesse a central da plataforma ou a Oficina Demo interna, sempre sob a guarda de Super Admin.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3 border-t border-slate-100 pt-5"><Button asChild><a href="/plataforma">Abrir central Platform <ArrowRight className="ml-2 h-4 w-4" /></a></Button><Button asChild variant="outline"><a href="/demo-interna"><Store className="mr-2 h-4 w-4" />Abrir Oficina Demo</a></Button></CardContent></Card>;
}

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const navigationContext = getHomeNavigationContext(user?.platformRole);
  const isDemoMode = isDemoWorkspace();
  const isPlatformAdmin = navigationContext === "platform" && !isDemoMode;
  const tenantList = trpc.workspace.mine.useQuery(undefined, { enabled: isAuthenticated && !isPlatformAdmin });
  const [activeTenantId, setActiveTenantId] = useState<number | null>(null);
  const activeTenant = selectWorkspace(tenantList.data, isDemoMode, activeTenantId);
  const title = activeTenant?.tenant.name ?? "OficinaOS";
  const workspaceMenuItems = getWorkspaceMenuItems((activeTenant?.membership.role ?? "technician") as WorkspaceRole);
  const noTenantState = getWorkspaceNoTenantState(user?.platformRole);
  if (isPlatformAdmin) {
    return <DashboardLayout menuItems={platformMenuItems} workspaceName="OficinaOS Platform"><div className="workshop-surface min-h-[calc(100vh-2rem)] rounded-2xl p-1"><div className="mx-auto max-w-7xl px-1 pt-1"><p className="text-right text-xs text-slate-500">Contexto Platform separado do ambiente operacional.</p></div><PlatformReadOnlyStart /></div></DashboardLayout>;
  }
  return <DashboardLayout menuItems={workspaceMenuItems} workspaceName={title}><div className="workshop-surface min-h-[calc(100vh-2rem)] rounded-2xl p-1">{tenantList.isLoading ? <div className="mx-auto max-w-7xl p-6"><Skeleton className="h-16 w-72" /><div className="mt-7 grid gap-4 md:grid-cols-4"><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div></div> : activeTenant ? <><div className="mx-auto flex max-w-7xl justify-end px-1 pt-1">{tenantList.data && tenantList.data.length > 1 ? <select aria-label="Selecionar oficina" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" value={activeTenant.tenant.id} onChange={event => setActiveTenantId(Number(event.target.value))}>{tenantList.data.map(entry => <option key={entry.tenant.id} value={entry.tenant.id}>{entry.tenant.name}</option>)}</select> : null}</div><WorkspaceDashboard tenantId={activeTenant.tenant.id} tenantName={activeTenant.tenant.name} tenantSlug={activeTenant.tenant.slug} role={activeTenant.membership.role as WorkspaceRole} /></> : noTenantState === "platform" ? <PlatformReadOnlyStart /> : <Card className="mx-auto mt-16 max-w-xl"><CardHeader><CardTitle>Seu acesso ainda não está vinculado a uma oficina</CardTitle><CardDescription>Peça a um Super Admin para incluí-lo no tenant correto. A associação é obrigatória para proteger os dados de cada oficina.</CardDescription></CardHeader></Card>}</div></DashboardLayout>;
}
