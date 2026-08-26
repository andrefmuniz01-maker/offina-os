import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Bell, Boxes, CalendarClock, ChartNoAxesCombined, ClipboardList, CircleAlert, CircleDollarSign, ClipboardCheck, PackageSearch, Plus, ReceiptText, Settings2, ShieldCheck, ShoppingCart, UsersRound, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const menuItems: DashboardMenuItem[] = [
  { icon: ChartNoAxesCombined, label: "Visão geral", path: "/" },
  { icon: ClipboardList, label: "Solicitações", path: "/solicitacoes" },
  { icon: ReceiptText, label: "Orçamentos", path: "/orcamentos" },
  { icon: CalendarClock, label: "Agenda & pátio", path: "/operacao" },
  { icon: PackageSearch, label: "Estoque", path: "/estoque" },
  { icon: Boxes, label: "Cadastros", path: "/cadastros" },
  { icon: ShoppingCart, label: "Compras", path: "/compras" },
  { icon: CircleDollarSign, label: "Financeiro", path: "/financeiro" },
  { icon: ChartNoAxesCombined, label: "Relatórios", path: "/relatorios" },
  { icon: UsersRound, label: "Clientes", path: "/clientes" },
  { icon: UsersRound, label: "Equipe", path: "/equipe" },
  { icon: Bell, label: "Notificações", path: "/notificacoes" },
  { icon: ShieldCheck, label: "Auditoria", path: "/auditoria" },
  { icon: Settings2, label: "Configurações", path: "/configuracoes" },
];

function Metric({ label, value, detail }: { label: string; value: string; detail: string; [key: string]: unknown }) {
  return <Card className="border-slate-200 shadow-none"><CardContent className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-slate-950">{value}</p><p className="mt-1.5 text-sm text-slate-500">{detail}</p></CardContent></Card>;
}

function CreateTenant({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const createTenant = trpc.platform.createTenant.useMutation({
    onSuccess: () => { toast.success("Oficina criada com segurança."); onCreated(); },
    onError: error => toast.error(error.message),
  });
  const updateName = (value: string) => {
    setName(value);
    if (!slug || slug === name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")) {
      setSlug(value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  };
  return <Card className="mx-auto mt-16 max-w-2xl border-slate-200 shadow-[0_30px_80px_-40px_rgba(15,23,42,.45)]"><CardHeader className="border-b border-slate-100 pb-5"><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Configuração controlada</Badge><CardTitle className="mt-3 text-2xl text-slate-950">Crie a primeira oficina</CardTitle><CardDescription className="max-w-xl text-base leading-6">A criação é restrita ao Super Admin. Ao concluir, você será vinculado como dono e os dados operacionais permanecerão isolados neste tenant.</CardDescription></CardHeader><CardContent className="grid gap-5 p-6 sm:grid-cols-2"><div className="grid gap-2 sm:col-span-2"><Label htmlFor="tenant-name">Nome comercial</Label><Input id="tenant-name" value={name} onChange={event => updateName(event.target.value)} placeholder="Ex.: Ruidão Performance" /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="tenant-slug">Identificador público</Label><div className="flex items-center rounded-md border border-slate-200 bg-slate-50 px-3"><span className="text-sm text-slate-400">/solicitar/</span><Input id="tenant-slug" className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0" value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} placeholder="ruidao-performance" /></div></div><div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="max-w-md text-xs leading-5 text-slate-500">O formulário público será vinculado a esse identificador. Não há dados demonstrativos sendo criados.</p><Button disabled={name.trim().length < 3 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || createTenant.isPending} onClick={() => createTenant.mutate({ name: name.trim(), slug })}><Plus className="mr-2 h-4 w-4" />{createTenant.isPending ? "Criando…" : "Criar oficina"}</Button></div></CardContent></Card>;
}

function WorkspaceDashboard({ tenantId, tenantName }: { tenantId: number; tenantName: string }) {
  const overview = trpc.dashboard.overview.useQuery({ tenantId });
  const notifications = trpc.notifications.listMine.useQuery({ tenantId, page: 1, pageSize: 5 });
  const stats = overview.data;
  const metrics = useMemo(() => stats ? [
    { label: "Faturamento recebido", value: money.format(stats.sales.billing), detail: `${stats.sales.completedOrders} OS concluída(s) no período`, icon: CircleDollarSign, tone: "green" as const },
    { label: "Orçamentos em aberto", value: money.format(stats.commercial.pendingQuoteValue), detail: `${stats.commercial.pendingQuoteCount} oportunidade(s) aguardando`, icon: ReceiptText, tone: "amber" as const },
    { label: "Operação em andamento", value: String(stats.operation.inProgress), detail: `${stats.operation.yard} veículo(s) no pátio`, icon: Wrench, tone: "default" as const },
    { label: "Estoque crítico", value: String(stats.inventory.critical), detail: `${stats.inventory.reservedProducts} produto(s) com reserva`, icon: CircleAlert, tone: stats.inventory.critical ? "red" as const : "default" as const },
  ] : [], [stats]);
  return <div className="mx-auto max-w-7xl space-y-7"><header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">Operação conectada</span></div><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{tenantName}</h1><p className="mt-1 text-sm text-slate-500">Acompanhe prioridades comerciais, operação e estoque com dados reais.</p></div><Button variant="outline" onClick={() => toast.message("O link público ficará disponível na área de configurações na próxima etapa da interface.")}><ClipboardCheck className="mr-2 h-4 w-4" />Ver fluxo público</Button></header>{overview.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-36" key={index} />)}</div> : <><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{metrics.map(metric => <Metric key={metric.label} {...metric} />)}</section><section className="grid gap-5 lg:grid-cols-[1.4fr_.9fr]"><Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Ações que merecem atenção</CardTitle><CardDescription>Recomendações calculadas a partir do estado atual da oficina.</CardDescription></CardHeader><CardContent className="space-y-3">{[
  { title: `${stats?.commercial.pendingQuoteCount ?? 0} orçamento(s) aguardam resposta`, detail: "Prepare o follow-up no canal preferido do cliente; o sistema não envia mensagens automaticamente.", icon: ReceiptText, tone: "text-amber-600 bg-amber-50" },
  { title: `${stats?.inventory.critical ?? 0} item(ns) precisam de revisão`, detail: "O cálculo considera saldo físico, reservas e estoque mínimo configurado.", icon: PackageSearch, tone: "text-red-600 bg-red-50" },
  { title: `${stats?.operation.scheduled ?? 0} compromisso(s) aguardam confirmação`, detail: "Revise equipe, baia e disponibilidade antes do início do dia.", icon: CalendarClock, tone: "text-sky-600 bg-sky-50" },
  ].map(item => <div key={item.title} className="flex gap-3 rounded-xl border border-slate-100 p-4"><div className={`h-9 w-9 shrink-0 rounded-lg p-2 ${item.tone}`}><item.icon className="h-5 w-5" /></div><div><p className="font-medium text-slate-900">{item.title}</p><p className="mt-1 text-sm leading-5 text-slate-500">{item.detail}</p></div></div>)}</CardContent></Card><Card className="border-slate-200"><CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle className="text-lg">Notificações</CardTitle><CardDescription>Eventos internos da sua oficina.</CardDescription></div><Bell className="h-5 w-5 text-slate-400" /></CardHeader><CardContent className="space-y-3">{notifications.isLoading ? <><Skeleton className="h-16" /><Skeleton className="h-16" /></> : notifications.data?.items.length ? notifications.data.items.map(({ notification }) => <div key={notification.id} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-medium text-slate-900">{notification.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{notification.body}</p></div>) : <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nenhum alerta pendente para este usuário.</div>}</CardContent></Card></section></>}</div>;
}

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const tenantList = trpc.tenant.mine.useQuery(undefined, { enabled: isAuthenticated });
  const [activeTenantId, setActiveTenantId] = useState<number | null>(null);
  const activeTenant = tenantList.data?.find(entry => entry.tenant.id === activeTenantId) ?? tenantList.data?.[0];
  const title = activeTenant?.tenant.name ?? "OficinaOS";
  return <DashboardLayout menuItems={menuItems} workspaceName={title}><div className="min-h-[calc(100vh-2rem)] rounded-2xl bg-[radial-gradient(circle_at_85%_0%,rgba(251,146,60,.10),transparent_28%),#f8fafc] p-1">{user?.platformRole === "super_admin" ? <div className="mx-auto flex max-w-7xl justify-end px-1 pt-1"><a href="/plataforma" className="text-xs font-medium text-slate-500 hover:text-orange-700">Abrir painel da plataforma →</a></div> : null}{tenantList.isLoading ? <div className="mx-auto max-w-7xl p-6"><Skeleton className="h-16 w-72" /><div className="mt-7 grid gap-4 md:grid-cols-4"><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div></div> : activeTenant ? <><div className="mx-auto flex max-w-7xl justify-end px-1 pt-1">{tenantList.data && tenantList.data.length > 1 ? <select aria-label="Selecionar oficina" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" value={activeTenant.tenant.id} onChange={event => setActiveTenantId(Number(event.target.value))}>{tenantList.data.map(entry => <option key={entry.tenant.id} value={entry.tenant.id}>{entry.tenant.name}</option>)}</select> : null}</div><WorkspaceDashboard tenantId={activeTenant.tenant.id} tenantName={activeTenant.tenant.name} /></> : user?.platformRole === "super_admin" ? <CreateTenant onCreated={() => tenantList.refetch()} /> : <Card className="mx-auto mt-16 max-w-xl"><CardHeader><CardTitle>Seu acesso ainda não está vinculado a uma oficina</CardTitle><CardDescription>Peça a um Super Admin para incluí-lo no tenant correto. A associação é obrigatória para proteger os dados de cada oficina.</CardDescription></CardHeader></Card>}</div></DashboardLayout>;
}
