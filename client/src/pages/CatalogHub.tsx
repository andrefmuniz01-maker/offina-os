import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SafeLink as Link } from "@/components/SafeLink";
import { isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Boxes, PackagePlus, Pencil, Plus, Save, Tags, Trash2, Truck, Wrench, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: Boxes, label: "Catálogo", path: "/catalogo" }];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function CategorySelect({ id, label, value, onChange, options, loading }: { id: string; label: string; value: string; onChange: (value: string) => void; options: Array<{ id: number; name: string }> | undefined; loading: boolean }) {
  return <div className="grid gap-2"><Label htmlFor={id}>{label}</Label><select id={id} disabled={loading} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-60" value={value} onChange={event => onChange(event.target.value)}><option value="none">{loading ? "Carregando categorias…" : "Sem categoria"}</option>{options?.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>;
}

function ItemList({ items, empty, renderMeta }: { items: Array<{ id: number; name: string }> | undefined; empty: string; renderMeta: (item: any) => React.ReactNode }) {
  if (!items?.length) return <p className="py-8 text-center text-sm text-slate-500">{empty}</p>;
  return <div className="space-y-2">{items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><p className="font-medium text-slate-900">{item.name}</p>{renderMeta(item)}</div>)}</div>;
}

type CategoryForm = { name: string; description: string };
const blankCategoryForm: CategoryForm = { name: "", description: "" };

function CategoryPanel({ title, icon: Icon, form, setForm, categories, loading, creating, updating, deleting, onCreate, onUpdate, onDelete }: {
  title: string; icon: typeof Tags; form: CategoryForm; setForm: (value: CategoryForm) => void;
  categories: Array<{ id: number; name: string; description: string | null }> | undefined; loading: boolean;
  creating: boolean; updating: boolean; deleting: boolean;
  onCreate: () => void; onUpdate: (categoryId: number, form: CategoryForm) => void; onDelete: (categoryId: number) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingForm, setEditingForm] = useState<CategoryForm>(blankCategoryForm);
  return <Card className="border-slate-200 shadow-sm">
    <CardHeader><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-orange-700" /><CardTitle className="text-lg">{title}</CardTitle></div></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-2 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
        <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Nome da categoria" />
        <Textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Descrição opcional" rows={2} maxLength={1000} />
        <Button size="sm" disabled={creating || form.name.trim().length < 2} onClick={onCreate}><Plus className="mr-2 h-3.5 w-3.5" />{creating ? "Criando…" : "Criar categoria"}</Button>
      </div>
      {loading ? <Skeleton className="h-24" /> : categories?.length ? <div className="space-y-2">{categories.map(category => editingId === category.id ? (
        <div key={category.id} className="grid gap-2 rounded-xl border border-orange-200 bg-orange-50/40 p-3">
          <Input value={editingForm.name} onChange={event => setEditingForm({ ...editingForm, name: event.target.value })} />
          <Textarea value={editingForm.description} onChange={event => setEditingForm({ ...editingForm, description: event.target.value })} rows={2} maxLength={1000} />
          <div className="flex gap-2"><Button size="sm" disabled={updating || editingForm.name.trim().length < 2} onClick={() => onUpdate(category.id, editingForm)}><Save className="mr-2 h-3.5 w-3.5" />Salvar</Button><Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="mr-2 h-3.5 w-3.5" />Cancelar</Button></div>
        </div>
      ) : (
        <div key={category.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
          <div><p className="font-medium text-slate-900">{category.name}</p>{category.description ? <p className="text-xs text-slate-500">{category.description}</p> : null}</div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditingId(category.id); setEditingForm({ name: category.name, description: category.description ?? "" }); }}><Pencil className="h-3.5 w-3.5" /></Button>
            <AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir categoria?</AlertDialogTitle><AlertDialogDescription>Só é possível excluir categorias sem itens vinculados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={() => onDelete(category.id)} className="bg-red-700 hover:bg-red-800">Excluir</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
          </div>
        </div>
      ))}</div> : <p className="py-6 text-center text-sm text-slate-500">Nenhuma categoria criada.</p>}
    </CardContent>
  </Card>;
}

export default function CatalogHub() {
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, isDemoWorkspace())?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();

  const [product, setProduct] = useState({ name: "", categoryId: "none", salePrice: "0" });
  const [service, setService] = useState({ name: "", categoryId: "none", laborPrice: "0", estimatedMinutes: "60" });
  const [kit, setKit] = useState({ name: "", productId: "", quantity: "1" });
  const [supplier, setSupplier] = useState({ name: "", phone: "" });
  const [productCategoryForm, setProductCategoryForm] = useState<CategoryForm>(blankCategoryForm);
  const [serviceCategoryForm, setServiceCategoryForm] = useState<CategoryForm>(blankCategoryForm);

  const productCategories = trpc.workspaceCatalog.categories.listProducts.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const serviceCategories = trpc.workspaceCatalog.categories.listServices.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const products = trpc.workspaceCatalog.products.list.useQuery({ tenantId, page: 1, pageSize: 50 }, { enabled: Boolean(tenantId) });
  const services = trpc.workspaceCatalog.services.list.useQuery({ tenantId, page: 1, pageSize: 50 }, { enabled: Boolean(tenantId) });
  const kits = trpc.workspaceCatalog.kits.list.useQuery({ tenantId, page: 1, pageSize: 50 }, { enabled: Boolean(tenantId) });
  const suppliers = trpc.workspaceCatalog.suppliers.list.useQuery({ tenantId, page: 1, pageSize: 50 }, { enabled: Boolean(tenantId) });

  const createProduct = trpc.workspaceCatalog.products.create.useMutation({ onSuccess: () => { setProduct({ name: "", categoryId: "none", salePrice: "0" }); toast.success("Produto cadastrado."); utils.workspaceCatalog.products.list.invalidate(); }, onError: error => toast.error(error.message) });
  const createService = trpc.workspaceCatalog.services.create.useMutation({ onSuccess: () => { setService({ name: "", categoryId: "none", laborPrice: "0", estimatedMinutes: "60" }); toast.success("Serviço cadastrado."); utils.workspaceCatalog.services.list.invalidate(); }, onError: error => toast.error(error.message) });
  const createKit = trpc.workspaceCatalog.kits.create.useMutation({ onSuccess: () => { setKit({ name: "", productId: "", quantity: "1" }); toast.success("Kit cadastrado."); utils.workspaceCatalog.kits.list.invalidate(); }, onError: error => toast.error(error.message) });
  const createSupplier = trpc.workspaceCatalog.suppliers.create.useMutation({ onSuccess: () => { setSupplier({ name: "", phone: "" }); toast.success("Fornecedor cadastrado."); utils.workspaceCatalog.suppliers.list.invalidate(); }, onError: error => toast.error(error.message) });

  const invalidateProductCategories = () => utils.workspaceCatalog.categories.listProducts.invalidate();
  const invalidateServiceCategories = () => utils.workspaceCatalog.categories.listServices.invalidate();
  const createProductCategory = trpc.workspaceCatalog.categories.createProduct.useMutation({ onSuccess: () => { setProductCategoryForm(blankCategoryForm); toast.success("Categoria criada."); invalidateProductCategories(); }, onError: error => toast.error(error.message) });
  const createServiceCategory = trpc.workspaceCatalog.categories.createService.useMutation({ onSuccess: () => { setServiceCategoryForm(blankCategoryForm); toast.success("Categoria criada."); invalidateServiceCategories(); }, onError: error => toast.error(error.message) });
  const updateProductCategory = trpc.workspaceCatalog.categories.updateProduct.useMutation({ onSuccess: () => { toast.success("Categoria atualizada."); invalidateProductCategories(); }, onError: error => toast.error(error.message) });
  const updateServiceCategory = trpc.workspaceCatalog.categories.updateService.useMutation({ onSuccess: () => { toast.success("Categoria atualizada."); invalidateServiceCategories(); }, onError: error => toast.error(error.message) });
  const deleteProductCategory = trpc.workspaceCatalog.categories.deleteProduct.useMutation({ onSuccess: () => { toast.success("Categoria excluída."); invalidateProductCategories(); }, onError: error => toast.error(error.message) });
  const deleteServiceCategory = trpc.workspaceCatalog.categories.deleteService.useMutation({ onSuccess: () => { toast.success("Categoria excluída."); invalidateServiceCategories(); }, onError: error => toast.error(error.message) });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-7xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Produtos, serviços, kits e fornecedores pertencem a uma oficina ativa. Peça a associação antes de cadastrar itens.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-7xl space-y-7">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Catálogo</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Produtos, serviços, kits, fornecedores e categorias desta oficina, num só lugar. Clientes têm tela própria em "Clientes".</p></div>
      <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Dados por oficina</Badge>
    </header>

    <Tabs defaultValue="products">
      <TabsList className="flex h-auto flex-wrap justify-start">
        <TabsTrigger value="products">Produtos</TabsTrigger>
        <TabsTrigger value="services">Serviços</TabsTrigger>
        <TabsTrigger value="kits">Kits</TabsTrigger>
        <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
        <TabsTrigger value="categories">Categorias</TabsTrigger>
      </TabsList>

      <TabsContent value="products" className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Novo produto</CardTitle></CardHeader><CardContent className="grid gap-3">
          <div className="grid gap-2"><Label htmlFor="product-name">Nome</Label><Input id="product-name" value={product.name} onChange={event => setProduct({ ...product, name: event.target.value })} placeholder="Ex.: Filtro de ar esportivo" /></div>
          <CategorySelect id="product-category" label="Categoria" value={product.categoryId} onChange={value => setProduct({ ...product, categoryId: value })} options={productCategories.data} loading={productCategories.isLoading} />
          <div className="grid gap-2"><Label htmlFor="product-price">Preço de venda</Label><Input id="product-price" type="number" min="0" step="0.01" value={product.salePrice} onChange={event => setProduct({ ...product, salePrice: event.target.value })} /></div>
          <Button disabled={createProduct.isPending || product.name.trim().length < 2} onClick={() => createProduct.mutate({ tenantId, name: product.name, salePrice: Number(product.salePrice), categoryId: product.categoryId === "none" ? undefined : Number(product.categoryId) })}><PackagePlus className="mr-2 h-4 w-4" />{createProduct.isPending ? "Cadastrando…" : "Cadastrar produto"}</Button>
        </CardContent></Card>
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Produtos cadastrados</CardTitle></CardHeader><CardContent>{products.isLoading ? <Skeleton className="h-24" /> : <ItemList items={products.data} empty="Nenhum produto cadastrado." renderMeta={item => <Badge variant="secondary">{money.format(Number(item.salePrice))}</Badge>} />}</CardContent></Card>
      </TabsContent>

      <TabsContent value="services" className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Novo serviço</CardTitle></CardHeader><CardContent className="grid gap-3">
          <div className="grid gap-2"><Label htmlFor="service-name">Nome</Label><Input id="service-name" value={service.name} onChange={event => setService({ ...service, name: event.target.value })} placeholder="Ex.: Troca de óleo" /></div>
          <CategorySelect id="service-category" label="Categoria" value={service.categoryId} onChange={value => setService({ ...service, categoryId: value })} options={serviceCategories.data} loading={serviceCategories.isLoading} />
          <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="service-price">Mão de obra</Label><Input id="service-price" type="number" min="0" step="0.01" value={service.laborPrice} onChange={event => setService({ ...service, laborPrice: event.target.value })} /></div><div className="grid gap-2"><Label htmlFor="service-minutes">Duração (min.)</Label><Input id="service-minutes" type="number" min="5" value={service.estimatedMinutes} onChange={event => setService({ ...service, estimatedMinutes: event.target.value })} /></div></div>
          <Button disabled={createService.isPending || service.name.trim().length < 2} onClick={() => createService.mutate({ tenantId, name: service.name, laborPrice: Number(service.laborPrice), estimatedMinutes: Number(service.estimatedMinutes), categoryId: service.categoryId === "none" ? undefined : Number(service.categoryId) })}><Wrench className="mr-2 h-4 w-4" />{createService.isPending ? "Cadastrando…" : "Cadastrar serviço"}</Button>
        </CardContent></Card>
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Serviços cadastrados</CardTitle></CardHeader><CardContent>{services.isLoading ? <Skeleton className="h-24" /> : <ItemList items={services.data} empty="Nenhum serviço cadastrado." renderMeta={item => <Badge variant="secondary">{item.estimatedMinutes} min · {money.format(Number(item.laborPrice))}</Badge>} />}</CardContent></Card>
      </TabsContent>

      <TabsContent value="kits" className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Novo kit</CardTitle><CardDescription>O kit expande seus componentes ao ser usado no orçamento.</CardDescription></CardHeader><CardContent className="grid gap-3">
          <div className="grid gap-2"><Label htmlFor="kit-name">Nome do kit</Label><Input id="kit-name" value={kit.name} onChange={event => setKit({ ...kit, name: event.target.value })} /></div>
          <div className="grid gap-2"><Label htmlFor="kit-product">Produto componente</Label><select id="kit-product" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={kit.productId} onChange={event => setKit({ ...kit, productId: event.target.value })}><option value="">Selecione um produto</option>{products.data?.map((item: { id: number; name: string }) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="grid gap-2"><Label htmlFor="kit-quantity">Quantidade</Label><Input id="kit-quantity" type="number" min="0.001" step="0.001" value={kit.quantity} onChange={event => setKit({ ...kit, quantity: event.target.value })} /></div>
          <Button disabled={createKit.isPending || !kit.name.trim() || !kit.productId} onClick={() => createKit.mutate({ tenantId, name: kit.name, items: [{ productId: Number(kit.productId), quantity: Number(kit.quantity) }] })}><PackagePlus className="mr-2 h-4 w-4" />{createKit.isPending ? "Cadastrando…" : "Cadastrar kit"}</Button>
        </CardContent></Card>
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Kits cadastrados</CardTitle></CardHeader><CardContent>{kits.isLoading ? <Skeleton className="h-24" /> : <ItemList items={kits.data} empty="Nenhum kit cadastrado." renderMeta={item => <Badge variant="secondary">{item.salePriceOverride ? money.format(Number(item.salePriceOverride)) : "Preço pelos componentes"}</Badge>} />}</CardContent></Card>
      </TabsContent>

      <TabsContent value="suppliers" className="mt-5 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Novo fornecedor</CardTitle></CardHeader><CardContent className="grid gap-3">
          <div className="grid gap-2"><Label htmlFor="supplier-name">Nome</Label><Input id="supplier-name" value={supplier.name} onChange={event => setSupplier({ ...supplier, name: event.target.value })} /></div>
          <div className="grid gap-2"><Label htmlFor="supplier-phone">Telefone</Label><Input id="supplier-phone" value={supplier.phone} onChange={event => setSupplier({ ...supplier, phone: event.target.value })} /></div>
          <Button disabled={createSupplier.isPending || !supplier.name.trim()} onClick={() => createSupplier.mutate({ tenantId, name: supplier.name, phone: supplier.phone || undefined })}><Truck className="mr-2 h-4 w-4" />{createSupplier.isPending ? "Cadastrando…" : "Cadastrar fornecedor"}</Button>
        </CardContent></Card>
        <Card className="border-slate-200"><CardHeader><CardTitle className="text-lg">Fornecedores cadastrados</CardTitle></CardHeader><CardContent>{suppliers.isLoading ? <Skeleton className="h-24" /> : <ItemList items={suppliers.data} empty="Nenhum fornecedor cadastrado." renderMeta={item => <span className="text-sm text-slate-500">{item.phone || "Sem telefone"}</span>} />}</CardContent></Card>
      </TabsContent>

      <TabsContent value="categories" className="mt-5 grid gap-5 lg:grid-cols-2">
        <CategoryPanel title="Categorias de produto" icon={Tags} form={productCategoryForm} setForm={setProductCategoryForm} categories={productCategories.data} loading={productCategories.isLoading} creating={createProductCategory.isPending} updating={updateProductCategory.isPending} deleting={deleteProductCategory.isPending} onCreate={() => createProductCategory.mutate({ tenantId, name: productCategoryForm.name, description: productCategoryForm.description || undefined })} onUpdate={(categoryId, form) => updateProductCategory.mutate({ tenantId, categoryId, name: form.name, description: form.description || null })} onDelete={categoryId => deleteProductCategory.mutate({ tenantId, categoryId })} />
        <CategoryPanel title="Categorias de serviço" icon={Wrench} form={serviceCategoryForm} setForm={setServiceCategoryForm} categories={serviceCategories.data} loading={serviceCategories.isLoading} creating={createServiceCategory.isPending} updating={updateServiceCategory.isPending} deleting={deleteServiceCategory.isPending} onCreate={() => createServiceCategory.mutate({ tenantId, name: serviceCategoryForm.name, description: serviceCategoryForm.description || undefined })} onUpdate={(categoryId, form) => updateServiceCategory.mutate({ tenantId, categoryId, name: form.name, description: form.description || null })} onDelete={categoryId => deleteServiceCategory.mutate({ tenantId, categoryId })} />
      </TabsContent>
    </Tabs>
  </main></DashboardLayout>;
}
