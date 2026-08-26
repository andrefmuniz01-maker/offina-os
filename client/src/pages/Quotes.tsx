import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { SafeLink as Link } from "@/components/SafeLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, FileText, Send, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const menu: DashboardMenuItem[] = [
  { icon: ArrowLeft, label: "Visão geral", path: "/" },
  { icon: FileText, label: "Orçamentos", path: "/orcamentos" },
];
const labels: Record<string, string> = { draft: "Rascunho", ready: "Pronto", sent: "Enviado", viewed: "Visualizado", approved: "Aprovado", rejected: "Recusado", expired: "Expirado", cancelled: "Cancelado" };
const statuses = ["draft", "ready", "sent", "viewed", "approved", "rejected", "expired", "cancelled"] as const;

export default function Quotes() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const tenantId = tenant?.id ?? 0;
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<(typeof statuses)[number] | "all">("all");
  const [page, setPage] = useState(1);
  const [editingQuoteId, setEditingQuoteId] = useState<number | null>(null);
  const [discounts, setDiscounts] = useState<Record<number, string>>({});
  const [overrideReason, setOverrideReason] = useState("");

  const listInput = useMemo(() => ({ tenantId, page, pageSize: 10, ...(status === "all" ? {} : { status }) }), [tenantId, page, status]);
  const detailInput = useMemo(() => ({ tenantId, quoteId: editingQuoteId ?? 0 }), [tenantId, editingQuoteId]);
  const list = trpc.quotes.list.useQuery(listInput, { enabled: Boolean(tenantId) });
  const detail = trpc.quotes.detail.useQuery(detailInput, { enabled: Boolean(tenantId && editingQuoteId) });

  useEffect(() => {
    if (detail.data) {
      setDiscounts(Object.fromEntries(detail.data.items.map(item => [item.id, String(Number(item.discount))])));
      setOverrideReason("");
    }
  }, [detail.data]);

  const send = trpc.quotes.send.useMutation({
    onSuccess: async result => {
      await navigator.clipboard.writeText(result.preparedMessage);
      toast.success("Mensagem preparada e copiada. Revise antes de enviar no WhatsApp.");
      utils.quotes.list.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const applyDiscounts = trpc.quotes.applyDiscounts.useMutation({
    onSuccess: async () => {
      toast.success("Descontos e margem atualizados.");
      setEditingQuoteId(null);
      await Promise.all([utils.quotes.list.invalidate(), utils.quotes.detail.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const draftDiscount = useMemo(() => detail.data?.items.reduce((sum, item) => sum + Number(discounts[item.id] || 0), 0) ?? 0, [detail.data, discounts]);
  const draftTotal = detail.data ? Number(detail.data.quote.subtotal) - draftDiscount : 0;

  const submitDiscounts = () => {
    if (!tenant || !editingQuoteId || !detail.data) return;
    applyDiscounts.mutate({ tenantId: tenant.id, quoteId: editingQuoteId, items: detail.data.items.map(item => ({ quoteItemId: item.id, discount: Number(discounts[item.id] || 0) })), overrideReason: overrideReason.trim() || undefined });
  };
  const changeStatus = (value: (typeof statuses)[number] | "all") => { setStatus(value); setPage(1); };

  if (mine.isLoading) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-6xl"><Skeleton className="h-96" /></main></DashboardLayout>;
  if (!tenant || !tenantId) return <DashboardLayout menuItems={menu} workspaceName="OficinaOS"><main className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Associe-se a uma oficina</CardTitle><CardDescription>Orçamentos, descontos e mensagens preparadas só podem ser gerenciados dentro de uma oficina ativa.</CardDescription></CardHeader></Card></main></DashboardLayout>;

  return <DashboardLayout menuItems={menu} workspaceName={tenant.name}>
    <main className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Orçamentos</h1><p className="mt-1 text-sm text-slate-500">Revise valores calculados, descontos autorizados e prepare a mensagem para o cliente.</p></div>
        <Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Sem disparos automáticos</Badge>
      </header>

      <Card className="border-slate-200">
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-lg">Fila de orçamentos</CardTitle><CardDescription>Listagem paginada por tenant. Custos e margens só são retornados para perfis financeiros.</CardDescription></div><div className="grid gap-1"><Label htmlFor="quote-status" className="text-xs">Status</Label><select id="quote-status" className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" value={status} onChange={event => changeStatus(event.target.value as (typeof statuses)[number] | "all")} aria-busy={list.isLoading} aria-invalid={list.isError} disabled={list.isLoading || list.isError}><option value="all">Todos</option>{statuses.map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></div></CardHeader>
        <CardContent>
          {list.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-24" key={index} />)}</div> : list.isError ? <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" role="alert">Não foi possível carregar os orçamentos. Atualize a página e tente novamente.</div> : list.data?.items.length ? <div className="space-y-3">
            {list.data.items.map(({ quote, customer, vehicle }) => <Card key={quote.id} className="border-slate-200"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">Orçamento #{String(quote.number).padStart(6, "0")}</p><Badge variant="outline">{labels[quote.status] ?? quote.status}</Badge></div><p className="mt-1 text-sm text-slate-600">{customer.name} · {vehicle.make} {vehicle.model} · <strong>{money.format(Number(quote.total))}</strong></p><p className="mt-1 text-xs text-slate-500">Válido até {new Date(quote.validUntil).toLocaleDateString("pt-BR")}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!['draft', 'ready'].includes(quote.status)} onClick={() => setEditingQuoteId(quote.id)}><Tag className="mr-2 h-4 w-4" />Desconto</Button><Button disabled={send.isPending || ["approved", "rejected", "expired", "cancelled"].includes(quote.status)} onClick={() => send.mutate({ tenantId, quoteId: quote.id })}><Send className="mr-2 h-4 w-4" />{send.isPending ? "Preparando…" : "Preparar envio"}</Button></div></CardContent></Card>)}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-sm text-slate-500">Página {list.data.page}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(current => current - 1)}><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button><Button variant="outline" size="sm" disabled={!list.data.hasMore} onClick={() => setPage(current => current + 1)}>Próxima<ChevronRight className="ml-1 h-4 w-4" /></Button></div></div>
          </div> : <div className="py-12 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-orange-50 text-orange-700"><FileText className="h-6 w-6" /></div><p className="mt-4 font-medium text-slate-900">Nenhum orçamento encontrado</p><p className="mt-1 text-sm text-slate-500">Ajuste o filtro ou gere um orçamento a partir de uma solicitação com serviço vinculado.</p></div>}
        </CardContent>
      </Card>
      <p className="flex items-center gap-2 text-xs text-slate-500"><Copy className="h-3.5 w-3.5" />Ao preparar o envio, o texto é apenas copiado para revisão no WhatsApp; o sistema não dispara mensagens.</p>
    </main>

    <Dialog open={Boolean(editingQuoteId)} onOpenChange={open => { if (!open) setEditingQuoteId(null); }}>
      <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Revisar descontos do orçamento</DialogTitle><DialogDescription>Os limites do seu perfil e a margem mínima configurada serão validados antes de salvar.</DialogDescription></DialogHeader>{detail.isLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-12" key={index} />)}</div> : detail.isError ? <p className="text-sm text-red-700" role="alert">Não foi possível carregar os itens deste orçamento.</p> : detail.data ? <div className="space-y-4"><div className="max-h-64 space-y-3 overflow-y-auto pr-1">{detail.data.items.map(item => { const gross = Number(item.quantity) * Number(item.unitPrice); return <div className="grid grid-cols-[1fr_8rem] items-center gap-4 rounded-lg border border-slate-200 p-3" key={item.id}><div><p className="text-sm font-medium text-slate-900">{item.description}</p><p className="text-xs text-slate-500">{Number(item.quantity)} × {money.format(Number(item.unitPrice))} · máximo {money.format(gross)}</p></div><Input aria-label={`Desconto para ${item.description}`} min={0} max={gross} step="0.01" type="number" value={discounts[item.id] ?? "0"} onChange={event => setDiscounts(current => ({ ...current, [item.id]: event.target.value }))} /></div>; })}</div><div className="rounded-lg bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Desconto total</span><strong>{money.format(draftDiscount)}</strong></div><div className="mt-1 flex justify-between text-base text-slate-950"><span>Novo total</span><strong>{money.format(draftTotal)}</strong></div></div><div className="space-y-2"><Label htmlFor="override-reason">Justificativa de exceção</Label><Textarea id="override-reason" value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Obrigatória somente quando um gestor autorizar margem abaixo do mínimo." /></div></div> : null}<DialogFooter><Button variant="outline" onClick={() => setEditingQuoteId(null)}>Cancelar</Button><Button disabled={!detail.data || applyDiscounts.isPending} onClick={submitDiscounts}>{applyDiscounts.isPending ? "Validando…" : "Aplicar descontos"}</Button></DialogFooter></DialogContent>
    </Dialog>
  </DashboardLayout>;
}
