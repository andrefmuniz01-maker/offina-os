import { SafeLink as Link } from "@/components/SafeLink";
import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Boxes, Pencil, Plus, Save, Tags, Trash2, Wrench, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: Boxes, label: "Cadastros", path: "/cadastros" },
  { icon: Tags, label: "Categorias", path: "/categorias" },
];

type CategoryForm = { name: string; description: string };
type Category = { id: number; name: string; description: string | null };
const blankForm: CategoryForm = { name: "", description: "" };

type CategoryPanelProps = {
  title: string;
  description: string;
  icon: typeof Tags;
  form: CategoryForm;
  setForm: (value: CategoryForm) => void;
  categories: Category[] | undefined;
  loading: boolean;
  error: boolean;
  creating: boolean;
  updating: boolean;
  deleting: boolean;
  onCreate: () => void;
  onUpdate: (categoryId: number, form: CategoryForm) => void;
  onDelete: (categoryId: number) => void;
};

function CategoryPanel({ title, description, icon: Icon, form, setForm, categories, loading, error, creating, updating, deleting, onCreate, onUpdate, onDelete }: CategoryPanelProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingForm, setEditingForm] = useState<CategoryForm>(blankForm);

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditingForm({ name: category.name, description: category.description ?? "" });
  };

  const count = categories?.length ?? 0;
  return <Card className="border-slate-200 shadow-sm">
    <CardHeader>
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-orange-700"><Icon className="h-5 w-5" /></span><CardTitle className="text-lg">{title}</CardTitle></div><Badge variant="secondary">{count} {count === 1 ? "categoria" : "categorias"}</Badge></div>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 rounded-xl border border-orange-100 bg-orange-50/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-orange-700">Novo agrupamento</p>
        <div className="grid gap-2"><Label htmlFor={`${title}-name`}>Nome</Label><Input id={`${title}-name`} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Performance" /></div>
        <div className="grid gap-2"><Label htmlFor={`${title}-description`}>Descrição opcional</Label><Textarea id={`${title}-description`} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} maxLength={1000} rows={3} placeholder="Agrupamento interno para o catálogo." /></div>
        <Button disabled={creating || form.name.trim().length < 2} onClick={onCreate}><Plus className="mr-2 h-4 w-4" />{creating ? "Criando…" : "Criar categoria"}</Button>
      </div>

      {loading ? <Skeleton className="h-32" /> : error ? <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700" role="alert">Não foi possível carregar as categorias desta oficina.</p> : categories?.length ? <div className="space-y-2">
        {categories.map(category => editingId === category.id ? <div className="grid gap-3 rounded-xl border border-orange-200 bg-orange-50/40 p-3" key={category.id}>
          <div className="grid gap-2"><Label htmlFor={`${title}-edit-${category.id}`}>Nome da categoria</Label><Input id={`${title}-edit-${category.id}`} value={editingForm.name} onChange={event => setEditingForm({ ...editingForm, name: event.target.value })} /></div>
          <div className="grid gap-2"><Label htmlFor={`${title}-edit-description-${category.id}`}>Descrição</Label><Textarea id={`${title}-edit-description-${category.id}`} value={editingForm.description} onChange={event => setEditingForm({ ...editingForm, description: event.target.value })} maxLength={1000} rows={2} /></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={updating || editingForm.name.trim().length < 2} onClick={() => onUpdate(category.id, editingForm)}><Save className="mr-2 h-3.5 w-3.5" />{updating ? "Salvando…" : "Salvar"}</Button><Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="mr-2 h-3.5 w-3.5" />Cancelar</Button></div>
        </div> : <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm sm:flex-row sm:items-start sm:justify-between" key={category.id}>
          <div><p className="font-medium text-slate-900">{category.name}</p>{category.description ? <p className="mt-1 text-sm text-slate-500">{category.description}</p> : <p className="mt-1 text-xs text-slate-400">Sem descrição.</p>}</div>
          <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" onClick={() => startEdit(category)}><Pencil className="mr-2 h-3.5 w-3.5" />Editar</Button><AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Excluir categoria?</AlertDialogTitle><AlertDialogDescription>Esta ação só será concluída se a categoria não estiver vinculada a nenhum item do catálogo.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={deleting} onClick={() => onDelete(category.id)} className="bg-red-700 hover:bg-red-800">{deleting ? "Excluindo…" : "Excluir categoria"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
        </div>)}
      </div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center"><p className="text-sm font-medium text-slate-700">Ainda não há categorias cadastradas.</p><p className="mt-1 text-xs text-slate-500">Comece criando um agrupamento para facilitar a busca e a composição dos orçamentos.</p></div>}
    </CardContent>
  </Card>;
}

export default function Categories() {
  const mine = trpc.workspace.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const [productForm, setProductForm] = useState<CategoryForm>(blankForm);
  const [serviceForm, setServiceForm] = useState<CategoryForm>(blankForm);
  const products = trpc.workspaceCatalog.categories.listProducts.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const services = trpc.workspaceCatalog.categories.listServices.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const invalidateProducts = () => utils.workspaceCatalog.categories.listProducts.invalidate();
  const invalidateServices = () => utils.workspaceCatalog.categories.listServices.invalidate();
  const createProduct = trpc.workspaceCatalog.categories.createProduct.useMutation({ onSuccess: () => { setProductForm(blankForm); toast.success("Categoria de produto criada."); invalidateProducts(); }, onError: error => toast.error(error.message) });
  const createService = trpc.workspaceCatalog.categories.createService.useMutation({ onSuccess: () => { setServiceForm(blankForm); toast.success("Categoria de serviço criada."); invalidateServices(); }, onError: error => toast.error(error.message) });
  const updateProduct = trpc.workspaceCatalog.categories.updateProduct.useMutation({ onSuccess: () => { toast.success("Categoria de produto atualizada."); invalidateProducts(); }, onError: error => toast.error(error.message) });
  const updateService = trpc.workspaceCatalog.categories.updateService.useMutation({ onSuccess: () => { toast.success("Categoria de serviço atualizada."); invalidateServices(); }, onError: error => toast.error(error.message) });
  const deleteProduct = trpc.workspaceCatalog.categories.deleteProduct.useMutation({ onSuccess: () => { toast.success("Categoria de produto excluída."); invalidateProducts(); }, onError: error => toast.error(error.message) });
  const deleteService = trpc.workspaceCatalog.categories.deleteService.useMutation({ onSuccess: () => { toast.success("Categoria de serviço excluída."); invalidateServices(); }, onError: error => toast.error(error.message) });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-80" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Categorias de produtos e serviços pertencem a uma oficina ativa. Peça a um Super Admin para associar seu acesso antes de alterar o catálogo.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-7"><header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/cadastros"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Cadastros</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Categorias do catálogo</h1><p className="mt-1 text-sm text-slate-500">Organize produtos e serviços dentro desta oficina. O servidor valida o tenant ao criar, alterar, excluir e associar categorias.</p></div><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Dados por tenant</Badge></header><div className="grid gap-5 lg:grid-cols-2"><CategoryPanel title="Categorias de produto" description="Use para separar peças, insumos e componentes no catálogo." icon={Tags} form={productForm} setForm={setProductForm} categories={products.data} loading={products.isLoading} error={products.isError} creating={createProduct.isPending} updating={updateProduct.isPending} deleting={deleteProduct.isPending} onCreate={() => createProduct.mutate({ tenantId, name: productForm.name, description: productForm.description || undefined })} onUpdate={(categoryId, nextForm) => updateProduct.mutate({ tenantId, categoryId, name: nextForm.name, description: nextForm.description || null })} onDelete={categoryId => deleteProduct.mutate({ tenantId, categoryId })} /><CategoryPanel title="Categorias de serviço" description="Use para organizar serviços, diagnósticos e instalações." icon={Wrench} form={serviceForm} setForm={setServiceForm} categories={services.data} loading={services.isLoading} error={services.isError} creating={createService.isPending} updating={updateService.isPending} deleting={deleteService.isPending} onCreate={() => createService.mutate({ tenantId, name: serviceForm.name, description: serviceForm.description || undefined })} onUpdate={(categoryId, nextForm) => updateService.mutate({ tenantId, categoryId, name: nextForm.name, description: nextForm.description || null })} onDelete={categoryId => deleteService.mutate({ tenantId, categoryId })} /></div></main></DashboardLayout>;
}
