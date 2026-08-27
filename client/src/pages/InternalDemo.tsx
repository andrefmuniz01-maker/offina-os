import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArchiveRestore, ArrowLeft, Boxes, Building2, CarFront, CheckCircle2, LockKeyhole, PackageCheck, ShieldCheck, UsersRound, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

const number = new Intl.NumberFormat("pt-BR");

export default function InternalDemo() {
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();
  const [resetArmed, setResetArmed] = useState(false);
  const status = trpc.platformDemo.status.useQuery(undefined, { enabled: !authLoading && user?.platformRole === "super_admin" });
  const tenantId = status.data?.exists ? status.data.tenantId : undefined;
  const products = trpc.workspaceCatalog.products.list.useQuery({ tenantId: tenantId ?? 0, page: 1, pageSize: 6 }, { enabled: Boolean(tenantId) });
  const services = trpc.workspaceCatalog.services.list.useQuery({ tenantId: tenantId ?? 0, page: 1, pageSize: 4 }, { enabled: Boolean(tenantId) });
  const inventory = trpc.workspaceInventory.list.useQuery({ tenantId: tenantId ?? 0, page: 1, pageSize: 6 }, { enabled: Boolean(tenantId) });
  const provision = trpc.platformDemo.provisionIncremental.useMutation({
    onSuccess: result => {
      toast.success(result.alreadyProvisioned ? "A Oficina Demo já estava provisionada." : "Oficina Demo provisionada com dados incrementais.");
      utils.platformDemo.status.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const reset = trpc.platformDemo.resetIncremental.useMutation({
    onSuccess: () => {
      toast.success("Demonstração restaurada com sucesso.");
      setResetArmed(false);
      utils.platformDemo.status.invalidate();
      utils.workspaceCatalog.invalidate();
      utils.workspaceInventory.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  if (authLoading || status.isLoading) return <Loading />;
  if (!user || user.platformRole !== "super_admin" || status.isError) return <Restricted />;

  const demo = status.data;
  const stats = demo?.exists ? [
    { icon: UsersRound, label: "Membros de tenant", value: number.format(demo.memberCount ?? 0), detail: "A demo não vincula usuários comuns" },
    { icon: CarFront, label: "Clientes e veículos", value: `${number.format(demo.customerCount ?? 0)} / ${number.format(demo.vehicleCount ?? 0)}`, detail: "Cadastros de demonstração" },
    { icon: Boxes, label: "Catálogo", value: `${number.format(demo.productCount ?? 0)} produtos`, detail: `${number.format(demo.serviceCount ?? 0)} serviços · ${number.format(demo.kitCount ?? 0)} kit(s)` },
    { icon: PackageCheck, label: "Compras", value: number.format(demo.purchaseOrderCount ?? 0), detail: "Entrada registrada no estoque" },
  ] : [];

  return <main className="min-h-screen bg-[#f6f7f9] text-slate-950"><div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
    <header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end"><div><Link href="/plataforma"><a className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Central da plataforma</a></Link><div className="mt-4 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-orange-400"><ShieldCheck className="h-6 w-6" /></div><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-orange-700">Ambiente interno</p><h1 className="text-3xl font-semibold tracking-tight">Oficina Demo</h1></div></div><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">Performance Garage é um tenant Supabase real para demonstração de catálogo, estoque e compras. O acesso é limitado a Super Admins no banco e nesta interface.</p></div><Badge className="w-fit border border-slate-700 bg-slate-950 px-3 py-1.5 text-white hover:bg-slate-950"><LockKeyhole className="mr-1.5 h-3.5 w-3.5" />Somente Super Admin</Badge></header>

    {!demo?.exists ? <section className="mt-8 grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><Card className="border-orange-100 bg-gradient-to-br from-orange-50 via-white to-white shadow-sm"><CardHeader><CardTitle>Pronta para provisionar</CardTitle><CardDescription>O ambiente ainda não possui tenant nem dados. A criação é idempotente e não cria usuários ou vínculos de tenant.</CardDescription></CardHeader><CardContent><Button disabled={provision.isPending} onClick={() => provision.mutate()}>{provision.isPending ? "Provisionando…" : "Criar Oficina Demo incremental"}</Button></CardContent></Card><SafetyCard /></section> : <>
      <section className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 md:grid-cols-2 xl:grid-cols-4">{stats.map(({ icon: Icon, label, value, detail }) => <article className="bg-white p-5" key={label}><Icon className="h-4 w-4 text-orange-700" /><p className="mt-5 text-xs font-semibold uppercase tracking-[.12em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>)}</section>
      <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_.85fr]"><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5 text-orange-700" />Visão operacional</CardTitle><CardDescription>Dados consultados diretamente dos módulos Supabase já migrados.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><Metric label="Produtos com saldo" value={inventory.data?.items.length ?? 0} loading={inventory.isLoading} /><Metric label="Itens críticos" value={inventory.data?.items.filter(item => item.availableQuantity <= item.minStock).length ?? 0} loading={inventory.isLoading} /><Metric label="Pedidos registrados" value={demo.purchaseOrderCount ?? 0} loading={false} /></CardContent></Card><Card className="border-emerald-100 bg-emerald-50/50 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2 text-emerald-950"><CheckCircle2 className="h-5 w-5" />Isolamento ativo</CardTitle><CardDescription className="text-emerald-800">Sem membros de tenant, sem rota pública e sem acesso por perfis operacionais.</CardDescription></CardHeader><CardContent><p className="text-sm leading-6 text-emerald-900">As policies RLS e as RPCs privadas negam a demonstração para qualquer perfil que não tenha papel global de Super Admin.</p></CardContent></Card></section>
      <section className="mt-6 grid gap-5 lg:grid-cols-2"><CatalogCard title="Produtos em estoque" icon={PackageCheck} loading={products.isLoading || inventory.isLoading} rows={(products.data ?? []).map(product => ({ title: product.name, detail: `${product.sku || "Sem SKU"} · disponível ${inventory.data?.items.find(item => item.id === product.id)?.availableQuantity ?? 0}` }))} empty="Nenhum produto foi encontrado." /><CatalogCard title="Serviços configurados" icon={Wrench} loading={services.isLoading} rows={(services.data ?? []).map(service => ({ title: service.name, detail: `${service.estimatedMinutes} min estimados` }))} empty="Nenhum serviço foi encontrado." /></section>
      <section className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><SafetyCard /><Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><ArchiveRestore className="h-5 w-5 text-orange-700" />Restaurar demonstração</CardTitle><CardDescription>O reset limpa e recria apenas dados dos módulos incrementais. Ele é bloqueado se houver dados nos domínios ainda não migrados.</CardDescription></CardHeader><CardContent className="space-y-3">{resetArmed ? <><p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Confirmação armada. Nenhum tenant comercial será alterado.</p><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={reset.isPending} onClick={() => reset.mutate()}>{reset.isPending ? "Restaurando…" : "Confirmar restauração"}</Button><Button variant="outline" onClick={() => setResetArmed(false)}>Cancelar</Button></div></> : <Button variant="outline" onClick={() => setResetArmed(true)}>Preparar restauração</Button>}</CardContent></Card></section>
    </>}
  </div></main>;
}

function Loading() { return <main className="min-h-screen bg-[#f6f7f9] p-8"><div className="mx-auto max-w-7xl space-y-5"><Skeleton className="h-28" /><Skeleton className="h-32" /><Skeleton className="h-64" /></div></main>; }
function Restricted() { return <main className="grid min-h-screen place-items-center bg-[#f6f7f9] p-5"><Card className="w-full max-w-md border-slate-200"><CardHeader><LockKeyhole className="mb-2 h-6 w-6 text-orange-700" /><CardTitle>Acesso restrito</CardTitle><CardDescription>A Oficina Demo é um ambiente interno exclusivo de Super Admin.</CardDescription></CardHeader><CardContent><Link href="/"><a><Button variant="outline">Voltar</Button></a></Link></CardContent></Card></main>; }
function Metric({ label, value, loading }: { label: string; value: number; loading: boolean }) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-medium text-slate-500">{label}</p>{loading ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-2 text-2xl font-semibold">{number.format(value)}</p>}</div>; }
function CatalogCard({ title, icon: Icon, loading, rows, empty }: { title: string; icon: typeof PackageCheck; loading: boolean; rows: Array<{ title: string; detail: string }>; empty: string }) { return <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-orange-700" />{title}</CardTitle></CardHeader><CardContent>{loading ? <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : rows.length ? <div className="space-y-2">{rows.map(row => <div className="rounded-xl border border-slate-100 p-3" key={row.title}><p className="font-medium text-slate-900">{row.title}</p><p className="mt-1 text-xs text-slate-500">{row.detail}</p></div>)}</div> : <p className="py-5 text-sm text-slate-500">{empty}</p>}</CardContent></Card>; }
function SafetyCard() { return <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-orange-700" />Limites da demonstração</CardTitle><CardDescription>O ambiente representa somente os módulos já migrados para Supabase.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm leading-6 text-slate-600"><p>Não há formulário público, contas de cliente ou vínculos operacionais para este tenant.</p><p>Solicitações, orçamentos, reservas, agenda, OS, consumo e financeiro não são semeados até terem fluxo Supabase completo.</p><p>Os contatos usam domínios reservados e não representam dados pessoais ou oficinas reais.</p></CardContent></Card>; }
