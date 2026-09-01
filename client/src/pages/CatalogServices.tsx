import { CategoryField } from "@/components/CategoryField";
import { SafeLink as Link } from "@/components/SafeLink";
import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Boxes, Search, ShoppingCart, Truck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pageSize = 20;

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: Boxes, label: "Produtos", path: "/catalogo/produtos" },
  { icon: Wrench, label: "Serviços", path: "/catalogo/servicos" },
  { icon: Truck, label: "Fornecedores", path: "/catalogo/fornecedores" },
  { icon: ShoppingCart, label: "Compras", path: "/compras" },
];

export default function CatalogServices() {
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, isDemoWorkspace())?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();

  const [form, setForm] = useState({ name: "", categoryId: "none", laborPrice: "0", estimatedMinutes: "60" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const categories = trpc.workspaceCatalog.categories.listServices.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const listInput = useMemo(() => ({ tenantId, page, pageSize: pageSize + 1, ...(search.trim() ? { search: search.trim() } : {}) }), [tenantId, page, search]);
  const services = trpc.workspaceCatalog.services.list.useQuery(listInput, { enabled: Boolean(tenantId) });
  const visibleServices = (services.data ?? []).slice(0, pageSize);
  const hasMore = (services.data?.length ?? 0) > pageSize;

  const createCategory = trpc.workspaceCatalog.categories.createService.useMutation({
    onSuccess: () => { toast.success("Categoria criada."); utils.workspaceCatalog.categories.listServices.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const createService = trpc.workspaceCatalog.services.create.useMutation({
    onSuccess: () => { setForm({ name: "", categoryId: "none", laborPrice: "0", estimatedMinutes: "60" }); toast.success("Serviço cadastrado."); setPage(1); utils.workspaceCatalog.services.list.invalidate(); },
    onError: error => toast.error(error.message),
  });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Serviços pertencem a uma oficina ativa. Peça a associação antes de cadastrar itens.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Serviços</h1><p className="mt-1 text-sm text-slate-500">A duração estimada é usada pela agenda para calcular o horário de término do agendamento.</p></div>
      <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Dados por oficina</Badge>
    </header>

    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Novo serviço</CardTitle></CardHeader><CardContent className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="service-name">Nome</Label><Input id="service-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Troca de óleo" /></div>
        <CategoryField id="service-category" label="Categoria" value={form.categoryId} onChange={value => setForm({ ...form, categoryId: value })} options={categories.data} loading={categories.isLoading} creating={createCategory.isPending} onCreate={async name => { const result = await createCategory.mutateAsync({ tenantId, name }); return result; }} />
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2"><Label htmlFor="service-price">Mão de obra</Label><Input id="service-price" type="number" min="0" step="0.01" value={form.laborPrice} onChange={event => setForm({ ...form, laborPrice: event.target.value })} /></div>
          <div className="grid gap-2"><Label htmlFor="service-minutes">Duração (min.)</Label><Input id="service-minutes" type="number" min="5" value={form.estimatedMinutes} onChange={event => setForm({ ...form, estimatedMinutes: event.target.value })} /></div>
        </div>
        <Button disabled={createService.isPending || form.name.trim().length < 2} onClick={() => createService.mutate({ tenantId, name: form.name, laborPrice: Number(form.laborPrice), estimatedMinutes: Number(form.estimatedMinutes), categoryId: form.categoryId === "none" ? undefined : Number(form.categoryId) })}><Wrench className="mr-2 h-4 w-4" />{createService.isPending ? "Cadastrando…" : "Cadastrar serviço"}</Button>
      </CardContent></Card>

      <Card className="border-slate-200"><CardHeader>
        <CardTitle className="text-lg">Serviços cadastrados</CardTitle>
        <div className="relative mt-2"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input className="pl-8" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por nome" /></div>
      </CardHeader><CardContent>
        {services.isLoading ? <Skeleton className="h-24" /> : null}
        {!services.isLoading && visibleServices.length ? <div className="space-y-2">{visibleServices.map((item: { id: number; name: string; laborPrice: number; estimatedMinutes: number; categoryName: string | null }) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.categoryName ?? "Sem categoria"} · {item.estimatedMinutes} min</p></div><Badge variant="secondary">{money.format(Number(item.laborPrice))}</Badge></div>)}</div> : null}
        {!services.isLoading && !visibleServices.length ? <p className="py-8 text-center text-sm text-slate-500">{search.trim() ? "Nenhum serviço neste filtro." : "Nenhum serviço cadastrado."}</p> : null}
        {!services.isLoading && (page > 1 || hasMore) ? <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">Página {page}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Anterior</Button><Button type="button" size="sm" variant="outline" disabled={!hasMore} onClick={() => setPage(current => current + 1)}>Próxima</Button></div></div> : null}
      </CardContent></Card>
    </div>
  </main></DashboardLayout>;
}
