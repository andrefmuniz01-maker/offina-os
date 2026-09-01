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
    markReceived: supabaseProtectedProcedure.input(tenantInput.extend({ revenueId: z.number().int().positive(), paymentMethod: z.string().trim().max(60).optional() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "financial.manage");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_mark_revenue_received", { target_tenant_id: input.tenantId, target_revenue_id: input.revenueId, payment_method_input: input.paymentMethod ?? null });
      if (error || !data) throw databaseError(error);
      return { success: true } as const;
    }),
  }),
  expenses: router({
    list: supabaseProtectedProcedure.input(tenantInput.extend({ status: statusInput, search: z.string().trim().max(120).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(10) })).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "financial.view");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_list_expenses", { target_tenant_id: input.tenantId, target_status: input.status ?? null, search_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize });
      if (error) throw databaseError(error);
      return (data ?? { items: [], page: input.page, pageSize: input.pageSize, hasMore: false }) as Paginated<Expense>;
    }),
    create: supabaseProtectedProcedure.input(tenantInput.extend({ category: z.string().trim().min(1).max(120), amount: z.number().finite().positive(), expenseDate: z.date(), notes: z.string().trim().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "financial.manage");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_create_expense", { target_tenant_id: input.tenantId, category_input: input.category, amount_input: input.amount, expense_date_input: input.expenseDate.toISOString(), notes_input: input.notes ?? null });
      if (error || !data) throw databaseError(error);
      return { id: Number((data as { id: number }).id) };
    }),
    markPaid: supabaseProtectedProcedure.input(tenantInput.extend({ expenseId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "financial.manage");
      const { data, error } = await createSupabaseClient(ctx.supabaseUser!.accessToken).rpc("workspace_mark_expense_paid", { target_tenant_id: input.tenantId, target_expense_id: input.expenseId });
      if (error || !data) throw databaseError(error);
      return { success: true } as const;
    }),
  }),
});
