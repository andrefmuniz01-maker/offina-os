import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { hasSupabasePermission, requireSupabaseTenantPermission } from "../supabaseTenantAccess";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const decimalInput = z.coerce.number().finite().nonnegative();
const pageInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});
const quoteQuestionsInput = z.array(z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
  required: z.boolean().optional(),
  type: z.string().trim().max(40).optional(),
  options: z.array(z.string().trim().max(120)).max(20).optional(),
})).max(30);

function client(accessToken: string) {
  return createSupabaseClient(accessToken);
}

function asRows(value: unknown): Array<any> {
  // As RPCs retornam JSONB com formatos intencionalmente diferentes por domínio.
  // A validação de entrada, a autorização e a projeção de campos ocorrem no banco.
  return Array.isArray(value) ? value : [];
}

function databaseError(error: { message?: string; code?: string } | null) {
  const code = error?.code;
  if (code === "42501") return new TRPCError({ code: "FORBIDDEN", message: error?.message ?? "Seu perfil não possui permissão para esta ação." });
  if (code === "P0002") return new TRPCError({ code: "NOT_FOUND", message: error?.message ?? "Registro não encontrado nesta oficina." });
  if (code === "23503" || code === "23505" || code === "40001") return new TRPCError({ code: "CONFLICT", message: error?.message ?? "Conflito ao persistir os dados." });
  if (code === "22023") return new TRPCError({ code: "BAD_REQUEST", message: error?.message ?? "Dados inválidos." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir esta operação no banco Supabase." });
}

function catalogRows(data: unknown, page: number, pageSize: number) {
  const rows = asRows(data);
  return { items: rows.slice(0, pageSize), page, pageSize, hasMore: rows.length > pageSize };
}

async function runRpc<T>(accessToken: string, name: string, args: Record<string, unknown>) {
  const { data, error } = await client(accessToken).rpc(name, args);
  if (error) throw databaseError(error);
  return data as T;
}

const categoryInput = tenantIdInput.extend({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  description: z.string().max(1000).nullable().optional(),
});

export const supabaseCatalogRouter = router({
  categories: router({
    listProducts: supabaseProtectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      return asRows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_list_catalog_categories", { target_tenant_id: input.tenantId, category_kind: "product" }));
    }),
    listServices: supabaseProtectedProcedure.input(tenantIdInput).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      return asRows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_list_catalog_categories", { target_tenant_id: input.tenantId, category_kind: "service" }));
    }),
    createProduct: supabaseProtectedProcedure.input(tenantIdInput.extend({ name: z.string().trim().min(2).max(120), description: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      const id = await runRpc<number>(ctx.supabaseUser!.accessToken, "workspace_create_catalog_category", { target_tenant_id: input.tenantId, category_kind: "product", category_name: input.name, category_description: input.description ?? null });
      return { id: Number(id) };
    }),
    createService: supabaseProtectedProcedure.input(tenantIdInput.extend({ name: z.string().trim().min(2).max(120), description: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      const id = await runRpc<number>(ctx.supabaseUser!.accessToken, "workspace_create_catalog_category", { target_tenant_id: input.tenantId, category_kind: "service", category_name: input.name, category_description: input.description ?? null });
      return { id: Number(id) };
    }),
    updateProduct: supabaseProtectedProcedure.input(categoryInput).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      await runRpc(ctx.supabaseUser!.accessToken, "workspace_update_catalog_category", { target_tenant_id: input.tenantId, category_kind: "product", target_category_id: input.categoryId, category_name: input.name, category_description: input.description ?? null });
      return { success: true };
    }),
    updateService: supabaseProtectedProcedure.input(categoryInput).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      await runRpc(ctx.supabaseUser!.accessToken, "workspace_update_catalog_category", { target_tenant_id: input.tenantId, category_kind: "service", target_category_id: input.categoryId, category_name: input.name, category_description: input.description ?? null });
      return { success: true };
    }),
    deleteProduct: supabaseProtectedProcedure.input(tenantIdInput.extend({ categoryId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      await runRpc(ctx.supabaseUser!.accessToken, "workspace_delete_catalog_category", { target_tenant_id: input.tenantId, category_kind: "product", target_category_id: input.categoryId });
      return { success: true };
    }),
    deleteService: supabaseProtectedProcedure.input(tenantIdInput.extend({ categoryId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      await runRpc(ctx.supabaseUser!.accessToken, "workspace_delete_catalog_category", { target_tenant_id: input.tenantId, category_kind: "service", target_category_id: input.categoryId });
      return { success: true };
    }),
  }),

  suppliers: router({
    list: supabaseProtectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      return asRows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_list_catalog_suppliers", { target_tenant_id: input.tenantId, query_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize }));
    }),
    create: supabaseProtectedProcedure.input(tenantIdInput.extend({ name: z.string().trim().min(2).max(180), document: z.string().max(32).optional(), contactName: z.string().max(160).optional(), phone: z.string().max(32).optional(), email: z.string().email().optional(), notes: z.string().max(4000).optional() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      const id = await runRpc<number>(ctx.supabaseUser!.accessToken, "workspace_create_catalog_supplier", { target_tenant_id: input.tenantId, supplier_name: input.name, supplier_document: input.document ?? null, supplier_contact_name: input.contactName ?? null, supplier_phone: input.phone ?? null, supplier_email: input.email ?? null, supplier_notes: input.notes ?? null });
      return { id: Number(id) };
    }),
  }),

  products: router({
    list: supabaseProtectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      return asRows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_list_catalog_products", { target_tenant_id: input.tenantId, query_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize }));
    }),
    create: supabaseProtectedProcedure.input(tenantIdInput.extend({
      categoryId: z.number().int().positive().optional(), supplierId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(180), sku: z.string().trim().max(96).optional(), brand: z.string().trim().max(100).optional(), unit: z.string().trim().min(1).max(16).default("un"), currentCost: decimalInput.default(0), salePrice: decimalInput.default(0), desiredMarginPercent: decimalInput.max(99.99).default(0), minStock: decimalInput.default(0), maxStock: decimalInput.optional(), location: z.string().trim().max(120).optional(), barcode: z.string().trim().max(96).optional(), description: z.string().max(4000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const access = await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      if ((input.currentCost > 0 || input.desiredMarginPercent > 0) && !hasSupabasePermission(access, "financial.manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode informar custo ou margem." });
      const id = await runRpc<number>(ctx.supabaseUser!.accessToken, "workspace_create_catalog_product", { target_tenant_id: input.tenantId, category_id_input: input.categoryId ?? null, supplier_id_input: input.supplierId ?? null, product_name: input.name, product_sku: input.sku ?? null, product_brand: input.brand ?? null, product_unit: input.unit, current_cost_input: input.currentCost, sale_price_input: input.salePrice, desired_margin_input: input.desiredMarginPercent, min_stock_input: input.minStock, max_stock_input: input.maxStock ?? null, product_location: input.location ?? null, product_barcode: input.barcode ?? null, product_description: input.description ?? null });
      return { id: Number(id) };
    }),
    updateFinancial: supabaseProtectedProcedure.input(tenantIdInput.extend({ productId: z.number().int().positive(), currentCost: decimalInput, salePrice: decimalInput, desiredMarginPercent: decimalInput.max(99.99), expectedUpdatedAt: z.string().datetime().optional() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "financial.manage");
      await runRpc(ctx.supabaseUser!.accessToken, "workspace_update_catalog_product_financial", { target_tenant_id: input.tenantId, target_product_id: input.productId, current_cost_input: input.currentCost, sale_price_input: input.salePrice, desired_margin_input: input.desiredMarginPercent, expected_updated_at: input.expectedUpdatedAt ?? null });
      return { success: true };
    }),
  }),

  services: router({
    list: supabaseProtectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      return asRows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_list_catalog_services", { target_tenant_id: input.tenantId, query_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize }));
    }),
    create: supabaseProtectedProcedure.input(tenantIdInput.extend({ categoryId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(180), description: z.string().max(4000).optional(), estimatedMinutes: z.number().int().min(5).max(1440).default(60), laborPrice: decimalInput.default(0), estimatedCost: decimalInput.default(0), desiredMarginPercent: decimalInput.max(99.99).default(0), quoteQuestions: quoteQuestionsInput.optional() })).mutation(async ({ ctx, input }) => {
      const access = await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      if ((input.estimatedCost > 0 || input.desiredMarginPercent > 0) && !hasSupabasePermission(access, "financial.manage")) throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não pode informar custo ou margem." });
      const id = await runRpc<number>(ctx.supabaseUser!.accessToken, "workspace_create_catalog_service", { target_tenant_id: input.tenantId, category_id_input: input.categoryId ?? null, service_name: input.name, service_description: input.description ?? null, estimated_minutes_input: input.estimatedMinutes, labor_price_input: input.laborPrice, estimated_cost_input: input.estimatedCost, desired_margin_input: input.desiredMarginPercent, quote_questions_input: input.quoteQuestions ?? null });
      return { id: Number(id) };
    }),
    updateFinancial: supabaseProtectedProcedure.input(tenantIdInput.extend({ serviceId: z.number().int().positive(), laborPrice: decimalInput, estimatedCost: decimalInput, desiredMarginPercent: decimalInput.max(99.99), expectedUpdatedAt: z.string().datetime().optional() })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "financial.manage");
      await runRpc(ctx.supabaseUser!.accessToken, "workspace_update_catalog_service_financial", { target_tenant_id: input.tenantId, target_service_id: input.serviceId, labor_price_input: input.laborPrice, estimated_cost_input: input.estimatedCost, desired_margin_input: input.desiredMarginPercent, expected_updated_at: input.expectedUpdatedAt ?? null });
      return { success: true };
    }),
    setProducts: supabaseProtectedProcedure.input(tenantIdInput.extend({ serviceId: z.number().int().positive(), items: z.array(z.object({ productId: z.number().int().positive(), quantity: decimalInput.positive(), required: z.boolean().default(true) })).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      await runRpc(ctx.supabaseUser!.accessToken, "workspace_set_catalog_service_products", { target_tenant_id: input.tenantId, target_service_id: input.serviceId, items_input: input.items.map(item => ({ productId: item.productId, quantity: item.quantity, required: item.required })) });
      return { success: true };
    }),
  }),

  kits: router({
    list: supabaseProtectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      return asRows(await runRpc<unknown>(ctx.supabaseUser!.accessToken, "workspace_list_catalog_kits", { target_tenant_id: input.tenantId, query_input: input.search ?? null, page_input: input.page, page_size_input: input.pageSize }));
    }),
    create: supabaseProtectedProcedure.input(tenantIdInput.extend({ categoryId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(180), description: z.string().max(4000).optional(), salePriceOverride: decimalInput.optional(), items: z.array(z.object({ productId: z.number().int().positive().optional(), serviceId: z.number().int().positive().optional(), quantity: decimalInput.positive() }).refine(value => Boolean(value.productId) !== Boolean(value.serviceId), "Cada item deve ser um produto ou um serviço.")).min(1).max(100) })).mutation(async ({ ctx, input }) => {
      await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "catalog.manage");
      const id = await runRpc<number>(ctx.supabaseUser!.accessToken, "workspace_create_catalog_kit", { target_tenant_id: input.tenantId, category_id_input: input.categoryId ?? null, kit_name: input.name, kit_description: input.description ?? null, sale_price_override_input: input.salePriceOverride ?? null, items_input: input.items.map(item => ({ productId: item.productId ?? null, serviceId: item.serviceId ?? null, quantity: item.quantity })) });
      return { id: Number(id) };
    }),
  }),
});
