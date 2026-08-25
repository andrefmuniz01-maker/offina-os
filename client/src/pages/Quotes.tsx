import DashboardLayout, { type DashboardMenuItem } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Copy, FileText, Send, Tag } from "lucide-react";
import { SafeLink as Link } from "@/components/SafeLink";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const menu: DashboardMenuItem[] = [{ icon: ArrowLeft, label: "Visão geral", path: "/" }, { icon: FileText, label: "Orçamentos", path: "/orcamentos" }];
const labels: Record<string, string> = { draft: "Rascunho", ready: "Pronto", sent: "Enviado", viewed: "Visualizado", approved: "Aprovado", rejected: "Recusado", expired: "Expirado", cancelled: "Cancelado" };

export default function Quotes() {
  const mine = trpc.tenant.mine.useQuery();
  const tenant = mine.data?.[0]?.tenant;
  const list = trpc.quotes.list.useQuery({ tenantId: tenant?.id ?? 0 }, { enabled: Boolean(tenant?.id) });
  const utils = trpc.useUtils();
  const [editingQuoteId, setEditingQuoteId] = useState<number | null>(null);
  const [discounts, setDiscounts] = useState<Record<number, string>>({});
  const [overrideReason, setOverrideReason] = useState("");
  const detail = trpc.quotes.detail.useQuery({ tenantId: tenant?.id ?? 0, quoteId: editingQuoteId ?? 0 }, { enabled: Boolean(tenant?.id && editingQuoteId) });
  useEffect(() => {
    if (detail.data) {
      setDiscounts(Object.fromEntries(detail.data.items.map(item => [item.id, String(Number(item.discount))])));
      setOverrideReason("");
    }
  }, [detail.data]);
  const send = trpc.quotes.send.useMutation({ onSuccess: async result => { await navigator.clipboard.writeText(result.preparedMessage); toast.success("Mensagem preparada e copiada. Revise antes de enviar no WhatsApp."); utils.quotes.list.invalidate(); }, onError: error => toast.error(error.message) });
  const applyDiscounts = trpc.quotes.applyDiscounts.useMutation({ onSuccess: async () => { toast.success("Descontos e margem atualizados."); setEditingQuoteId(null); await Promise.all([utils.quotes.list.invalidate(), utils.quotes.detail.invalidate()]); }, onError: error => toast.error(error.message) });
  const draftDiscount = useMemo(() => detail.data?.items.reduce((sum, item) => sum + Number(discounts[item.id] || 0), 0) ?? 0, [detail.data, discounts]);
  const draftTotal = detail.data ? Number(detail.data.quote.subtotal) - draftDiscount : 0;
  const submitDiscounts = () => {
    if (!tenant || !editingQuoteId || !detail.data) return;
    applyDiscounts.mutate({ tenantId: tenant.id, quoteId: editingQuoteId, items: detail.data.items.map(item => ({ quoteItemId: item.id, discount: Number(discounts[item.id] || 0) })), overrideReason: overrideReason.trim() || undefined });
  };
  return <DashboardLayout menuItems={menu} workspaceName={tenant?.name ?? "OficinaOS"}><main className="mx-auto max-w-6xl space-y-7"><header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><Link href="/"><a className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-3.5 w-3.5" />Visão geral</a></Link><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Orçamentos</h1><p className="mt-1 text-sm text-slate-500">Revise valores calculados, descontos autorizados e prepare a mensagem para o cliente.</p></div><Badge className="w-fit bg-orange-100 text-orange-800 hover:bg-orange-100">Sem disparos automáticos</Badge></header>{list.isLoading ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-24" key={index} />)}</div> : list.data?.length ? <div className="space-y-3">{list.data.map(({ quote, customer, vehicle }) => <Card key={quote.id} className="border-slate-200"><CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">Orçamento #{String(quote.number).padStart(6, "0")}</p><Badge variant="outline">{labels[quote.status] ?? quote.status}</Badge></div><p className="mt-1 text-sm text-slate-600">{customer.name} · {vehicle.make} {vehicle.model} · <strong>{money.format(Number(quote.total))}</strong></p><p className="mt-1 text-xs text-slate-500">Válido até {new Date(quote.validUntil).toLocaleDateString("pt-BR")}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!['draft', 'ready'].includes(quote.status)} onClick={() => setEditingQuoteId(quote.id)}><Tag className="mr-2 h-4 w-4" />Desconto</Button><Button disabled={send.isPending || ["approved", "rejected", "expired", "cancelled"].includes(quote.status)} onClick={() => send.mutate({ tenantId: tenant!.id, quoteId: quote.id })}><Send className="mr-2 h-4 w-4" />{send.isPending ? "Preparando…" : "Preparar envio"}</Button></div></CardContent></Card>)}</div> : <Card className="border-dashed border-slate-300"><CardHeader className="items-center py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-xl bg-orange-50 text-orange-700"><FileText className="h-6 w-6" /></div><CardTitle className="mt-4">Nenhum orçamento criado</CardTitle><CardDescription className="max-w-md">Gere um orçamento a partir de uma solicitação com serviço vinculado. Os valores serão calculados com base no catálogo e no estoque da oficina.</CardDescription></CardHeader></Card>}<p className="flex items-center gap-2 text-xs text-slate-500"><Copy className="h-3.5 w-3.5" />Ao preparar o envio, o texto é apenas copiado para revisão no WhatsApp; o sistema não dispara mensagens.</p></main><Dialog open={Boolean(editingQuoteId)} onOpenChange={open => { if (!open) setEditingQuoteId(null); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Revisar descontos do orçamento</DialogTitle><DialogDescription>Os limites do seu perfil e a margem mínima configurada serão validados antes de salvar.</DialogDescription></DialogHeader>{detail.isLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton className="h-12" key={index} />)}</div> : detail.data ? <div className="space-y-4"><div className="max-h-64 space-y-3 overflow-y-auto pr-1">{detail.data.items.map(item => { const gross = Number(item.quantity) * Number(item.unitPrice); return <div className="grid grid-cols-[1fr_8rem] items-center gap-4 rounded-lg border border-slate-200 p-3" key={item.id}><div><p className="text-sm font-medium text-slate-900">{item.description}</p><p className="text-xs text-slate-500">{Number(item.quantity)} × {money.format(Number(item.unitPrice))} · máximo {money.format(gross)}</p></div><Input aria-label={`Desconto para ${item.description}`} min={0} max={gross} step="0.01" type="number" value={discounts[item.id] ?? "0"} onChange={event => setDiscounts(current => ({ ...current, [item.id]: event.target.value }))} /></div>; })}</div><div className="rounded-lg bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Desconto total</span><strong>{money.format(draftDiscount)}</strong></div><div className="mt-1 flex justify-between text-base text-slate-950"><span>Novo total</span><strong>{money.format(draftTotal)}</strong></div></div><div className="space-y-2"><label className="text-sm font-medium text-slate-800" htmlFor="override-reason">Justificativa de exceção</label><Textarea id="override-reason" value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Obrigatória somente quando um gestor autorizar margem abaixo do mínimo." /></div></div> : <p className="text-sm text-red-700">Não foi possível carregar os itens deste orçamento.</p>}<DialogFooter><Button variant="outline" onClick={() => setEditingQuoteId(null)}>Cancelar</Button><Button disabled={!detail.data || applyDiscounts.isPending} onClick={submitDiscounts}>{applyDiscounts.isPending ? "Validando…" : "Aplicar descontos"}</Button></DialogFooter></DialogContent></Dialog></DashboardLayout>;
}
