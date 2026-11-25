import { SafeLink as Link } from "@/components/SafeLink";
import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getSupportTenantId, isDemoWorkspace, selectWorkspace } from "@/lib/demoWorkspace";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Boxes, CheckCircle2, PackageCheck, PackagePlus, ShoppingCart, Truck, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: PackageCheck, label: "Estoque", path: "/estoque" },
  { icon: ShoppingCart, label: "Compras", path: "/compras" },
];

const pendingStatuses = ["draft", "ordered", "partially_received"] as const;

export default function Purchases() {
  const mine = trpc.workspace.mine.useQuery();
  const tenant = selectWorkspace(mine.data, isDemoWorkspace(), getSupportTenantId())?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();

  const [arrival, setArrival] = useState<"now" | "later">("now");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState("");

  const products = trpc.workspaceCatalog.products.list.useQuery({ tenantId, page: 1, pageSize: 100 }, { enabled: Boolean(tenantId) });
  const suppliers = trpc.workspaceCatalog.suppliers.list.useQuery({ tenantId, page: 1, pageSize: 100 }, { enabled: Boolean(tenantId) });
  const pendingOrders = trpc.workspaceInventory.purchaseOrders.list.useQuery({ tenantId, page: 1, pageSize: 25 }, { enabled: Boolean(tenantId) });
  const pendingItems = (pendingOrders.data?.items ?? []).filter(({ order }: { order: { status: string } }) => (pendingStatuses as readonly string[]).includes(order.status));

  const resetForm = () => { setProductId(""); setQuantity("1"); setUnitCost("0"); setSupplierId(undefined); setNotes(""); };
  const invalidateAfterChange = () => {
    utils.workspaceInventory.purchaseOrders.list.invalidate();
    utils.workspaceInventory.list.invalidate();
    utils.workspaceInventory.forecast.invalidate();
  };

  const createAndReceive = trpc.workspaceInventory.purchaseOrders.createAndReceive.useMutation({
    onSuccess: data => { toast.success(`Compra #${String(data.number).padStart(6, "0")} registrada. Estoque atualizado.`); resetForm(); invalidateAfterChange(); },
    onError: error => toast.error(error.message),
  });
  const createPending = trpc.workspaceInventory.purchaseOrders.create.useMutation({
    onSuccess: data => { toast.success(`Compra #${String(data.number).padStart(6, "0")} registrada. Aguardando chegar.`); resetForm(); invalidateAfterChange(); },
    onError: error => toast.error(error.message),
  });
  const receive = trpc.workspaceInventory.purchaseOrders.receive.useMutation({
    onSuccess: () => { toast.success("Chegada confirmada. Estoque atualizado."); invalidateAfterChange(); },
    onError: error => toast.error(error.message),
  });

  const isPending = createAndReceive.isPending || createPending.isPending;
  const submit = () => {
    const item = { productId: Number(productId), quantity: Number(quantity), unitCost: Number(unitCost) };
    const payload = { tenantId, supplierId: supplierId ? Number(supplierId) : undefined, notes: notes.trim() || undefined, items: [item] };
    if (arrival === "now") createAndReceive.mutate(payload);
    else createPending.mutate(payload);
  };
  const confirmArrival = (order: { id: number }, items: Array<{ id: number; orderedQuantity: number; receivedQuantity: number }>) => {
    const remaining = items.filter(item => Number(item.receivedQuantity) < Number(item.orderedQuantity)).map(item => ({ itemId: item.id, receivedQuantity: Number(item.orderedQuantity) - Number(item.receivedQuantity) }));
    if (!remaining.length) return;
    receive.mutate({ tenantId, purchaseOrderId: order.id, items: remaining });
  };

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Compras pertencem a uma oficina ativa. Peça a associação antes de registrar uma compra.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}><main className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
      <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Compras</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Escolha o produto já cadastrado, informe a quantidade e diga se a peça já chegou ou vai chegar depois.</p></div>
      <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Atualiza o estoque</Badge>
    </header>

    <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-lg">Nova compra</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="purchase-product">Produto</Label>
            <Select value={productId || undefined} onValueChange={setProductId}>
              <SelectTrigger id="purchase-product"><SelectValue placeholder={products.isLoading ? "Carregando…" : "Selecione um produto"} /></SelectTrigger>
              <SelectContent>{(products.data ?? []).map((product: { id: number; name: string }) => <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>)}</SelectContent>
            </Select>
            {!products.isLoading && !products.data?.length ? <p className="text-xs text-slate-500">Nenhum produto cadastrado ainda. Cadastre em Catálogo → Produtos antes de registrar uma compra.</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label htmlFor="purchase-quantity">Quantidade</Label><Input id="purchase-quantity" type="number" min="0.001" step="0.001" value={quantity} onChange={event => setQuantity(event.target.value)} /></div>
            <div className="grid gap-2"><Label htmlFor="purchase-cost">Custo unitário</Label><Input id="purchase-cost" type="number" min="0" step="0.01" value={unitCost} onChange={event => setUnitCost(event.target.value)} /></div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="purchase-supplier">Fornecedor (opcional)</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="purchase-supplier"><SelectValue placeholder="Sem fornecedor definido" /></SelectTrigger>
              <SelectContent>{(suppliers.data ?? []).map((supplier: { id: number; name: string }) => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label htmlFor="purchase-notes">Observação (opcional)</Label><Input id="purchase-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Ex.: compra de balcão para reposição" /></div>

          <div className="grid gap-2 rounded-xl border border-slate-200 p-3">
            <Label className="text-xs font-semibold text-slate-500">Quando a peça chega</Label>
            <RadioGroup value={arrival} onValueChange={value => setArrival(value as "now" | "later")} className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 has-[:checked]:border-orange-400 has-[:checked]:bg-orange-50"><RadioGroupItem value="now" id="arrival-now" className="mt-0.5" /><span><span className="block text-sm font-medium text-slate-900">Já chegou</span><span className="block text-xs text-slate-500">A peça já está na oficina. O estoque sobe agora mesmo.</span></span></label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 has-[:checked]:border-orange-400 has-[:checked]:bg-orange-50"><RadioGroupItem value="later" id="arrival-later" className="mt-0.5" /><span><span className="block text-sm font-medium text-slate-900">Vai chegar depois</span><span className="block text-xs text-slate-500">Pedido feito a um fornecedor. Fica pendente até você confirmar a chegada.</span></span></label>
            </RadioGroup>
          </div>

          <Button disabled={isPending || !productId || Number(quantity) <= 0} onClick={submit}><PackagePlus className="mr-2 h-4 w-4" />{isPending ? "Salvando…" : "Salvar compra"}</Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-lg">Aguardando chegar</CardTitle><CardDescription>Pedidos feitos a fornecedor que ainda não entraram no estoque físico.</CardDescription></CardHeader>
        <CardContent>
          {pendingOrders.isLoading ? <Skeleton className="h-40" /> : null}
          {!pendingOrders.isLoading && pendingItems.length ? <div className="space-y-2">{pendingItems.map(({ order, supplier, items }: { order: { id: number; number: number; createdAt: string }; supplier: { name: string } | null; items: Array<{ id: number; orderedQuantity: number; receivedQuantity: number }> }) => (
            <div key={order.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium text-slate-900">Compra #{String(order.number).padStart(6, "0")}</p><p className="mt-1 text-xs text-slate-500">{supplier?.name ?? "Fornecedor não informado"} · {new Date(order.createdAt).toLocaleDateString("pt-BR")}</p><p className="mt-1 text-xs text-slate-500">{items.map(item => `${item.orderedQuantity} un`).join(" · ")}</p></div>
              <Button size="sm" disabled={receive.isPending} onClick={() => confirmArrival(order, items)}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Chegou</Button>
            </div>
          ))}</div> : null}
          {!pendingOrders.isLoading && !pendingItems.length ? <p className="py-10 text-center text-sm text-slate-500">Nenhuma compra aguardando chegar.</p> : null}
        </CardContent>
      </Card>
    </div>
  </main></DashboardLayout>;
}
