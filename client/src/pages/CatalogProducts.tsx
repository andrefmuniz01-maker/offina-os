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
import { ArrowLeft, Boxes, PackagePlus, Search, Truck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pageSize = 20;

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: Boxes, label: "Produtos", path: "/catalogo/produtos" },
  { icon: Wrench, label: "Serviços", path: "/catalogo/servicos" },
  { icon: Truck, label: "Fornecedores", path: "/catalogo/fornecedores" },
];

export default function CatalogProducts() {
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, isDemoWorkspace())?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();

  const [form, setForm] = useState({ name: "", categoryId: "none", salePrice: "0" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const categories = trpc.workspaceCatalog.categories.listProducts.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const listInput = useMemo(() => ({ tenantId, page, pageSize: pageSize + 1, ...(search.trim() ? { search: search.trim() } : {}) }), [tenantId, page, search]);
  const products = trpc.workspaceCatalog.products.list.useQuery(listInput, { enabled: Boolean(tenantId) });
  const visibleProducts = (products.data ?? []).slice(0, pageSize);
  const hasMore = (products.data?.length ?? 0) > pageSize;

  const createCategory = trpc.workspaceCatalog.categories.createProduct.useMutation({
    onSuccess: () => { toast.success("Categoria criada."); utils.workspaceCatalog.categories.listProducts.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const createProduct = trpc.workspaceCatalog.products.create.useMutation({
    onSuccess: () => { setForm({ name: "", categoryId: "none", salePrice: "0" }); toast.success("Produto cadastrado."); setPage(1); utils.workspaceCatalog.products.list.invalidate(); },
    onError: error => toast.error(error.message),
  });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Produtos pertencem a uma oficina ativa. Peça a associação antes de cadastrar itens.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Produtos</h1><p className="mt-1 text-sm text-slate-500">Cadastre peças e insumos. Depois de cadastrado, o produto já aparece pronto na hora de registrar uma compra.</p></div>
      <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Dados por oficina</Badge>
    </header>

    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Novo produto</CardTitle></CardHeader><CardContent className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="product-name">Nome</Label><Input id="product-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Filtro de ar esportivo" /></div>
        <CategoryField id="product-category" label="Categoria" value={form.categoryId} onChange={value => setForm({ ...form, categoryId: value })} options={categories.data} loading={categories.isLoading} creating={createCategory.isPending} onCreate={async name => { const result = await createCategory.mutateAsync({ tenantId, name }); return result; }} />
        <div className="grid gap-2"><Label htmlFor="product-price">Preço de venda</Label><Input id="product-price" type="number" min="0" step="0.01" value={form.salePrice} onChange={event => setForm({ ...form, salePrice: event.target.value })} /></div>
        <Button disabled={createProduct.isPending || form.name.trim().length < 2} onClick={() => createProduct.mutate({ tenantId, name: form.name, salePrice: Number(form.salePrice), categoryId: form.categoryId === "none" ? undefined : Number(form.categoryId) })}><PackagePlus className="mr-2 h-4 w-4" />{createProduct.isPending ? "Cadastrando…" : "Cadastrar produto"}</Button>
      </CardContent></Card>

      <Card className="border-slate-200"><CardHeader>
        <CardTitle className="text-lg">Produtos cadastrados</CardTitle>
        <div className="relative mt-2"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><Input className="pl-8" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar por nome" /></div>
      </CardHeader><CardContent>
        {products.isLoading ? <Skeleton className="h-24" /> : null}
        {!products.isLoading && visibleProducts.length ? <div className="space-y-2">{visibleProducts.map((item: { id: number; name: string; salePrice: number; categoryName: string | null }) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div><p className="font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.categoryName ?? "Sem categoria"}</p></div><Badge variant="secondary">{money.format(Number(item.salePrice))}</Badge></div>)}</div> : null}
        {!products.isLoading && !visibleProducts.length ? <p className="py-8 text-center text-sm text-slate-500">{search.trim() ? "Nenhum produto neste filtro." : "Nenhum produto cadastrado."}</p> : null}
        {!products.isLoading && (page > 1 || hasMore) ? <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><p className="text-xs text-slate-500">Página {page}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Anterior</Button><Button type="button" size="sm" variant="outline" disabled={!hasMore} onClick={() => setPage(current => current + 1)}>Próxima</Button></div></div> : null}
      </CardContent></Card>
    </div>
  </main></DashboardLayout>;
}
