import { SafeLink as Link } from "@/components/SafeLink";
import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardPlus, PackageCheck, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: ShoppingCart, label: "Compras", path: "/compras" },
];

const labels: Record<string, string> = {
  draft: "Rascunho",
  ordered: "Pedido enviado",
  partially_received: "Recebido parcialmente",
  received: "Recebido",
  cancelled: "Cancelado",
};

const statuses = ["draft", "ordered", "partially_received", "received", "cancelled"] as const;

export default function Purchases() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<(typeof statuses)[number] | "all">("all");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ productId: "", quantity: "1", unitCost: "0", notes: "" });

  const productQueryInput = useMemo(() => ({ tenantId, page: 1, pageSize: 100 }), [tenantId]);
  const orderQueryInput = useMemo(
    () => ({ tenantId, page, pageSize: 10, ...(status === "all" ? {} : { status }) }),
    [tenantId, page, status],
  );
  const products = trpc.catalog.products.list.useQuery(productQueryInput, { enabled: Boolean(tenantId) });
  const orders = trpc.inventory.purchaseOrders.list.useQuery(orderQueryInput, { enabled: Boolean(tenantId) });

  const create = trpc.inventory.purchaseOrders.create.useMutation({
    onSuccess: data => {
      toast.success(`Pedido #${String(data.number).padStart(6, "0")} criado.`);
      setForm({ productId: "", quantity: "1", unitCost: "0", notes: "" });
      setPage(1);
      utils.inventory.purchaseOrders.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const receive = trpc.inventory.purchaseOrders.receive.useMutation({
    onSuccess: () => {
      toast.success("Recebimento registrado e estoque atualizado.");
      utils.inventory.purchaseOrders.list.invalidate();
      utils.inventory.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const changeStatus = (value: (typeof statuses)[number] | "all") => {
    setStatus(value);
    setPage(1);
  };

  if (mine.isLoading) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  }

  if (!tenantId || !tenant) {
    return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Os pedidos de compra só podem ser consultados e criados dentro de uma oficina ativa.</CardDescription></CardHeader></Card></main></DashboardLayout>;
  }

  return (
    <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
      <main className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
          <div>
            <Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Compras</h1>
            <p className="mt-1 text-sm text-slate-500">Registre pedidos reais para atender déficits e manter o custo médio do estoque.</p>
          </div>
          <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Entrada controlada</Badge>
        </header>

        <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
          <Card className="border-slate-200">
            <CardHeader><CardTitle className="text-lg">Novo pedido</CardTitle><CardDescription>O recebimento posterior será a única ação que altera o estoque físico.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="purchase-product">Produto</Label>
                <select id="purchase-product" className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.productId} onChange={event => setForm({ ...form, productId: event.target.value })}>
                  <option value="">Selecione um produto</option>
                  {products.data?.map(product => <option value={product.id} key={product.id}>{product.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2"><Label htmlFor="purchase-quantity">Quantidade</Label><Input id="purchase-quantity" type="number" min="0.001" step="0.001" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.target.value })} /></div>
                <div className="grid gap-2"><Label htmlFor="purchase-cost">Custo unitário</Label><Input id="purchase-cost" type="number" min="0" step="0.01" value={form.unitCost} onChange={event => setForm({ ...form, unitCost: event.target.value })} /></div>
              </div>
              <div className="grid gap-2"><Label htmlFor="purchase-notes">Observação</Label><Input id="purchase-notes" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Ex.: recomposição para agenda da semana" /></div>
              <Button disabled={create.isPending || !form.productId || Number(form.quantity) <= 0} onClick={() => create.mutate({ tenantId, notes: form.notes || undefined, items: [{ productId: Number(form.productId), quantity: Number(form.quantity), unitCost: Number(form.unitCost) }] })}>
                <ClipboardPlus className="mr-2 h-4 w-4" />{create.isPending ? "Criando…" : "Criar pedido"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><CardTitle className="text-lg">Pedidos de compra</CardTitle><CardDescription>Histórico deste tenant. O recebimento baixa o pedido e aumenta o saldo físico.</CardDescription></div>
              <div className="grid gap-1"><Label htmlFor="purchase-status" className="text-xs">Status</Label><select id="purchase-status" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm" value={status} onChange={event => changeStatus(event.target.value as (typeof statuses)[number] | "all")}><option value="all">Todos</option>{statuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></div>
            </CardHeader>
            <CardContent>
              {orders.isLoading ? <Skeleton className="h-52" /> : orders.isError ? <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Não foi possível carregar os pedidos. Atualize a página e tente novamente.</div> : orders.data?.items.length ? <div className="space-y-2">
                {orders.data.items.map(({ order, supplier, items }) => <div className="flex flex-col gap-3 rounded-xl border border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between" key={order.id}>
                  <div><p className="font-medium text-slate-900">Pedido #{String(order.number).padStart(6, "0")}</p><p className="mt-1 text-xs text-slate-500">{supplier?.name ?? "Fornecedor a definir"} · {new Date(order.createdAt).toLocaleDateString("pt-BR")}</p><p className="mt-1 text-xs text-slate-500">{items.map(item => `${item.orderedQuantity} un`).join(" · ")}</p></div>
                  <div className="flex items-center gap-2"><Badge variant="outline">{labels[order.status] ?? order.status}</Badge>{["draft", "ordered", "partially_received"].includes(order.status) ? <Button size="sm" disabled={receive.isPending} onClick={() => receive.mutate({ tenantId, purchaseOrderId: order.id, items: items.filter(item => Number(item.receivedQuantity) < Number(item.orderedQuantity)).map(item => ({ itemId: item.id, receivedQuantity: Number(item.orderedQuantity) - Number(item.receivedQuantity) })) })}>Receber</Button> : null}</div>
                </div>)}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-sm text-slate-500">Página {orders.data.page}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(current => current - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" disabled={!orders.data.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
              </div> : <div className="py-12 text-center text-sm text-slate-500"><PackageCheck className="mx-auto mb-3 h-6 w-6 text-slate-400" />Nenhum pedido de compra encontrado para este filtro.</div>}
            </CardContent>
          </Card>
        </div>
      </main>
    </DashboardLayout>
  );
}
