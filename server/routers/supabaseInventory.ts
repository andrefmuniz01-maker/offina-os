import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { hasSupabasePermission, requireSupabaseTenantPermission } from "../supabaseTenantAccess";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const quantityInput = z.coerce.number().finite().positive().max(1_000_000);
const moneyInput = z.coerce.number().finite().nonnegative().max(1_000_000_000);
const pageInput = z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) });

function rows(value: unknown): Array<any> {
  return Array.isArray(value) ? value : [];
}

function databaseError(error: { message?: string; code?: string } | null) {
  if (error?.code === "42501") return new TRPCError({ code: "FORBIDDEN", message: error.message ?? "Seu perfil não possui permissão para esta ação." });
  if (error?.code === "P0002") return new TRPCError({ code: "NOT_FOUND", message: error.message ?? "Registro não encontrado nesta oficina." });
  if (["23503", "23505", "40001"].includes(error?.code ?? "")) return new TRPCError({ code: "CONFLICT", message: error?.message ?? "Conflito ao persistir os dados." });
  if (error?.code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error.message ?? "Dados inválidos." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir esta operação no banco Supabase." });
}

async function runRpc<T>(accessToken: string, name: string, args: Record<string, unknown>) {
  const { data, error } = await createSupabaseClient(accessToken).rpc(name, args);
  if (error) throw databaseError(error);
  return data as T;
}

export const supabaseInventoryRouter = router({
  list: supabaseProtectedProcedure.input(tenantIdInput.extend({ search: z.string().trim().min(1).max(120).optional() }).merge(pageInput)).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "inventory.manage");
    const result = rows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_list_inventory", { target_tenant_id: input.tenantId, query_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize }));
    return { items: result.slice(0, input.pageSize), page: input.page, pageSize: input.pageSize, hasMore: result.length > input.pageSize };
  }),

  movements: supabaseProtectedProcedure.input(tenantIdInput.extend({ productId: z.number().int().positive(), limit: z.number().int().min(1).max(100).default(50) })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "inventory.manage");
    return rows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_list_inventory_movements", { target_tenant_id: input.tenantId, target_product_id: input.productId, result_limit: input.limit }));
  }),

  adjust: supabaseProtectedProcedure.input(tenantIdInput.extend({ productId: z.number().int().positive(), quantityDelta: z.coerce.number().finite().min(-1_000_000).max(1_000_000).refine(value => value !== 0), notes: z.string().trim().min(3).max(1000) })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "inventory.manage");
    const result = await runRpc<Record<string, unknown>>(ctx.supabaseUser!.accessToken, "workspace_adjust_inventory", { target_tenant_id: input.tenantId, target_product_id: input.productId, quantity_delta_input: input.quantityDelta, notes_input: input.notes });
    return { success: true, previousPhysical: Number(result.previousPhysical), nextPhysical: Number(result.nextPhysical) };
  }),

  forecast: supabaseProtectedProcedure.input(tenantIdInput.extend({ until: z.date().optional() })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "inventory.manage");
    return rows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_inventory_forecast", { target_tenant_id: input.tenantId, until_input: input.until?.toISOString() ?? null }));
  }),

  purchaseOrders: router({
    list: supabaseProtectedProcedure.input(tenantIdInput.extend({ status: z.enum(["draft", "ordered", "partially_received", "received", "cancelled"]).optional(), search: z.string().trim().min(1).max(120).optional() }).merge(pageInput)).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "purchases.manage");
      const result = rows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_list_purchase_orders", { target_tenant_id: input.tenantId, status_input: input.status ?? null, query_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize }));
      return { items: result.slice(0, input.pageSize), page: input.page, pageSize: input.pageSize, hasMore: result.length > input.pageSize };
    }),
    create: supabaseProtectedProcedure.input(tenantIdInput.extend({ supplierId: z.number().int().positive().optional(), notes: z.string().max(4000).optional(), items: z.array(z.object({ productId: z.number().int().positive(), quantity: quantityInput, unitCost: moneyInput })).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      const access = await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "purchases.manage");
      if (!hasSupabasePermission(access, "financial.manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode registrar custos de compra." });
      const result = await runRpc<Record<string, unknown>>(ctx.supabaseUser!.accessToken, "workspace_create_purchase_order", { target_tenant_id: input.tenantId, supplier_id_input: input.supplierId ?? null, notes_input: input.notes ?? null, items_input: input.items.map(item => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost })) });
      return { id: Number(result.id), number: Number(result.number) };
    }),
    // Compra de balcão: a peça já chegou, então cria e recebe o pedido na mesma
    // chamada (uma transação no banco), sem o passo intermediário de "receber".
    createAndReceive: supabaseProtectedProcedure.input(tenantIdInput.extend({ supplierId: z.number().int().positive().optional(), notes: z.string().max(4000).optional(), items: z.array(z.object({ productId: z.number().int().positive(), quantity: quantityInput, unitCost: moneyInput })).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      const access = await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "purchases.manage");
      if (!hasSupabasePermission(access, "financial.manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode registrar custos de compra." });
      const result = await runRpc<Record<string, unknown>>(ctx.supabaseUser!.accessToken, "workspace_create_and_receive_purchase_order", { target_tenant_id: input.tenantId, supplier_id_input: input.supplierId ?? null, notes_input: input.notes ?? null, items_input: input.items.map(item => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost })) });
      return { id: Number(result.id), number: Number(result.number) };
    }),
    receive: supabaseProtectedProcedure.input(tenantIdInput.extend({ purchaseOrderId: z.number().int().positive(), items: z.array(z.object({ itemId: z.number().int().positive(), receivedQuantity: quantityInput })).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      const access = await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "purchases.manage");
      if (!hasSupabasePermission(access, "financial.manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode concluir recebimentos com custo." });
      await runRpc(ctx.supabaseUser!.accessToken, "workspace_receive_purchase_order", { target_tenant_id: input.tenantId, target_purchase_order_id: input.purchaseOrderId, received_items_input: input.items.map(item => ({ itemId: item.itemId, receivedQuantity: item.receivedQuantity })) });
      return { success: true };
    }),
  }),
});
