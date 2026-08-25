import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Boxes, Plus, Tags, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: Boxes, label: "Cadastros", path: "/cadastros" }, { icon: Tags, label: "Categorias", path: "/categorias" }];

type CategoryForm = { name: string; description: string };
const blankForm: CategoryForm = { name: "", description: "" };

function CategoryPanel({ title, description, icon: Icon, form, setForm, categories, loading, error, pending, onCreate }: { title: string; description: string; icon: typeof Tags; form: CategoryForm; setForm: (value: CategoryForm) => void; categories: Array<{ id: number; name: string; description: string | null }> | undefined; loading: boolean; error: boolean; pending: boolean; onCreate: () => void }) {
  return <Card className="border-slate-200"><CardHeader><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-orange-700" /><CardTitle className="text-lg">{title}</CardTitle></div><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4"><div className="grid gap-2"><Label htmlFor={`${title}-name`}>Nome</Label><Input id={`${title}-name`} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Performance" /></div><div className="grid gap-2"><Label htmlFor={`${title}-description`}>Descrição opcional</Label><Textarea id={`${title}-description`} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} maxLength={1000} rows={3} placeholder="Agrupamento interno para o catálogo." /></div><Button disabled={pending || form.name.trim().length < 2} onClick={onCreate}><Plus className="mr-2 h-4 w-4" />{pending ? "Criando…" : "Criar categoria"}</Button></div>{loading ? <Skeleton className="h-32" /> : error ? <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700" role="alert">Não foi possível carregar as categorias desta oficina.</p> : categories?.length ? <div className="space-y-2">{categories.map(category => <div className="rounded-xl border border-slate-100 p-3" key={category.id}><p className="font-medium text-slate-900">{category.name}</p>{category.description ? <p className="mt-1 text-sm text-slate-500">{category.description}</p> : <p className="mt-1 text-xs text-slate-400">Sem descrição.</p>}</div>)}</div> : <p className="py-6 text-center text-sm text-slate-500">Ainda não há categorias cadastradas.</p>}</CardContent></Card>;
}

export default function Categories() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const [productForm, setProductForm] = useState<CategoryForm>(blankForm);
  const [serviceForm, setServiceForm] = useState<CategoryForm>(blankForm);
  const products = trpc.catalog.categories.listProducts.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const services = trpc.catalog.categories.listServices.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const createProduct = trpc.catalog.categories.createProduct.useMutation({ onSuccess: () => { setProductForm(blankForm); toast.success("Categoria de produto criada."); utils.catalog.categories.listProducts.invalidate(); }, onError: error => toast.error(error.message) });
  const createService = trpc.catalog.categories.createService.useMutation({ onSuccess: () => { setServiceForm(blankForm); toast.success("Categoria de serviço criada."); utils.catalog.categories.listServices.invalidate(); }, onError: error => toast.error(error.message) });

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-80" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Categorias de produtos e serviços pertencem a uma oficina ativa. Peça a um Super Admin para associar seu acesso antes de alterar o catálogo.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-7"><header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/cadastros"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Cadastros</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Categorias do catálogo</h1><p className="mt-1 text-sm text-slate-500">Organize produtos e serviços dentro desta oficina. O servidor valida o tenant ao criar e associar categorias.</p></div><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Dados por tenant</Badge></header><div className="grid gap-5 lg:grid-cols-2"><CategoryPanel title="Categorias de produto" description="Use para separar peças, insumos e componentes no catálogo." icon={Tags} form={productForm} setForm={setProductForm} categories={products.data} loading={products.isLoading} error={products.isError} pending={createProduct.isPending} onCreate={() => createProduct.mutate({ tenantId, name: productForm.name, description: productForm.description || undefined })} /><CategoryPanel title="Categorias de serviço" description="Use para organizar serviços, diagnósticos e instalações." icon={Wrench} form={serviceForm} setForm={setServiceForm} categories={services.data} loading={services.isLoading} error={services.isError} pending={createService.isPending} onCreate={() => createService.mutate({ tenantId, name: serviceForm.name, description: serviceForm.description || undefined })} /></div></main></DashboardLayout>;
}
