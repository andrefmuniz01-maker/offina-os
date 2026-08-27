import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { requireSupabaseTenantPermission } from "../supabaseTenantAccess";

const tenantInput = z.object({ tenantId: z.number().int().positive() });
const statusInput = z.string().trim().max(32).optional();

type Paginated<T> = { items: T[]; page: number; pageSize: number; hasMore: boolean };

type Revenue = { id: number; tenantId: number; workOrderId: number | null; customerId: number | null; vehicleId: number | null; amount: number | string; paymentMethod: string | null; status: string; dueAt: string | null; receivedAt: string | null; notes: string | null; createdAt: string };
type Expense = { id: number; tenantId: number; category: string; amount: number | string; status: string; expenseDate: string; dueAt: string | null; recurrence: string | null; supplierId: number | null; notes: string | null; createdAt: string };

function databaseError(error: { code?: string | null; message?: string | null } | null) {
  if (error?.code === "42501") return new TRPCError({ code: "FORBIDDEN", message: error.message ?? "Seu perfil não possui acesso financeiro nesta oficina." });
  if (error?.code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error.message ?? "Dados inválidos." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível consultar o financeiro no banco Supabase." });
}

export const supabaseFinanceRouter = router({
  revenues: router({
    list: supabaseProtectedProcedure.input(tenantInput.extend({ status: statusInput, search: z.string().trim().max(120).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(10) })).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "financial.view");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_list_revenues", { target_tenant_id: input.tenantId, target_status: input.status ?? null, search_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize });
      if (error) throw databaseError(error);
      return (data ?? { items: [], page: input.page, pageSize: input.pageSize, hasMore: false }) as Paginated<Revenue>;
    }),
  }),
  expenses: router({
    list: supabaseProtectedProcedure.input(tenantInput.extend({ status: statusInput, search: z.string().trim().max(120).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(10) })).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "financial.view");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_list_expenses", { target_tenant_id: input.tenantId, target_status: input.status ?? null, search_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize });
      if (error) throw databaseError(error);
      return (data ?? { items: [], page: input.page, pageSize: input.pageSize, hasMore: false }) as Paginated<Expense>;
    }),
  }),
});
