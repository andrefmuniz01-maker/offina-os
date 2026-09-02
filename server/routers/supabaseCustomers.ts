import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseProtectedProcedure } from "../_core/trpc";
import { requireSupabaseTenantPermission } from "../supabaseTenantAccess";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const pageInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
});

function clientForContext(supabaseUser: { accessToken: string } | null) {
  if (!supabaseUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação Supabase obrigatória." });
  return createSupabaseClient(supabaseUser.accessToken);
}

function databaseError(error: { message?: string } | null) {
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error?.message?.includes("permissão") || error?.message?.includes("não encontrado")
      ? error.message
      : "Não foi possível concluir esta operação no banco Supabase.",
  });
}

function mapCustomer(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    tenantId: Number(row.tenant_id),
    name: String(row.name),
    whatsapp: String(row.whatsapp),
    email: row.email ? String(row.email) : null,
    document: row.document ? String(row.document) : null,
    notes: row.notes ? String(row.notes) : null,
    active: Boolean(row.active),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function mapVehicle(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    tenantId: Number(row.tenant_id),
    customerId: Number(row.customer_id),
    make: String(row.make),
    model: String(row.model),
    modelYear: row.model_year === null ? null : Number(row.model_year),
    manufactureYear: row.manufacture_year === null ? null : Number(row.manufacture_year),
    plate: row.plate ? String(row.plate) : null,
    mileage: row.mileage === null ? null : Number(row.mileage),
    engine: row.engine ? String(row.engine) : null,
    notes: row.notes ? String(row.notes) : null,
    active: Boolean(row.active),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

async function assertCustomerInTenant(
  supabase: ReturnType<typeof createSupabaseClient>,
  tenantId: number,
  customerId: number,
) {
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado nesta oficina." });
}

async function orderHistory(
  supabase: ReturnType<typeof createSupabaseClient>,
  tenantId: number,
  field: "customer_id" | "vehicle_id",
  entityId: number,
  includeVehicle: boolean,
) {
  const { data: orders, error: orderError } = await supabase
    .from("work_orders")
    .select("id, number, status, completed_at, delivered_at, created_at, vehicle_id")
    .eq("tenant_id", tenantId)
    .eq(field, entityId)
    .order("created_at", { ascending: false });
  if (orderError) throw databaseError(orderError);

  const orderRows = (orders ?? []) as Array<Record<string, unknown>>;
  const orderIds = orderRows.map(order => Number(order.id));
  const vehicleIds = Array.from(new Set(orderRows.map(order => Number(order.vehicle_id))));
  const [vehicleResult, notificationResult] = await Promise.all([
    includeVehicle && vehicleIds.length
      ? supabase.from("vehicles").select("id, make, model, plate").eq("tenant_id", tenantId).in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase.from("notifications").select("id, work_order_id, title, body, created_at, link").eq("tenant_id", tenantId).eq("type", "post_sale_suggested").in("work_order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (vehicleResult.error) throw databaseError(vehicleResult.error);
  if (notificationResult.error) throw databaseError(notificationResult.error);

  const vehicles = new Map((vehicleResult.data ?? []).map((vehicle: Record<string, unknown>) => [Number(vehicle.id), vehicle]));
  const notifications = new Map((notificationResult.data ?? []).map((notification: Record<string, unknown>) => [Number(notification.work_order_id), notification]));
  return orderRows.map(order => {
    const vehicle = vehicles.get(Number(order.vehicle_id));
    const notification = notifications.get(Number(order.id));
    return {
      id: Number(order.id),
      number: Number(order.number),
      status: String(order.status),
      completedAt: order.completed_at ? new Date(String(order.completed_at)) : null,
      deliveredAt: order.delivered_at ? new Date(String(order.delivered_at)) : null,
      createdAt: new Date(String(order.created_at)),
      ...(includeVehicle && vehicle
        ? { vehicleId: Number(vehicle.id), vehicleMake: String(vehicle.make), vehicleModel: String(vehicle.model), vehiclePlate: vehicle.plate ? String(vehicle.plate) : null }
        : {}),
      ...(notification
        ? {
            postSaleNotificationId: Number(notification.id),
            postSaleTitle: String(notification.title),
            postSaleBody: String(notification.body),
            postSaleCreatedAt: new Date(String(notification.created_at)),
            postSaleLink: notification.link ? String(notification.link) : null,
          }
        : {}),
    };
  });
}

export const supabaseCustomerRouter = router({
  listPaged: supabaseProtectedProcedure.input(tenantIdInput.merge(pageInput)).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    const offset = (input.page - 1) * input.pageSize;
    let query = supabase.from("customers").select("id, tenant_id, name, whatsapp, email, document, notes, active, created_at, updated_at").eq("tenant_id", input.tenantId).order("name").range(offset, offset + input.pageSize);
    if (input.search) {
      const pattern = `%${input.search.replace(/[%_,()]/g, "")}%`;
      query = query.or(`name.ilike.${pattern},whatsapp.ilike.${pattern}`);
    }
    const { data, error } = await query;
    if (error) throw databaseError(error);
    const rows = (data ?? []).map(row => mapCustomer(row as Record<string, unknown>));
    return { items: rows.slice(0, input.pageSize), page: input.page, pageSize: input.pageSize, hasMore: rows.length > input.pageSize };
  }),

  create: supabaseProtectedProcedure.input(tenantIdInput.extend({
    name: z.string().trim().min(2).max(180),
    whatsapp: z.string().trim().min(8).max(32),
    email: z.string().email().optional(),
    document: z.string().max(32).optional(),
    notes: z.string().max(4000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("workspace_create_customer", {
      target_tenant_id: input.tenantId,
      customer_name: input.name,
      customer_whatsapp: input.whatsapp,
      customer_email: input.email ?? null,
      customer_document: input.document ?? null,
      customer_notes: input.notes ?? null,
    });
    if (error || !data) throw databaseError(error);
    return { id: Number(data) };
  }),

  update: supabaseProtectedProcedure.input(tenantIdInput.extend({
    customerId: z.number().int().positive(),
    name: z.string().trim().min(2).max(180),
    whatsapp: z.string().trim().min(8).max(32),
    email: z.string().email().optional(),
    document: z.string().max(32).optional(),
    notes: z.string().max(4000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("workspace_update_customer", {
      target_tenant_id: input.tenantId,
      target_customer_id: input.customerId,
      customer_name: input.name,
      customer_whatsapp: input.whatsapp,
      customer_email: input.email ?? null,
      customer_document: input.document ?? null,
      customer_notes: input.notes ?? null,
    });
    if (error || !data) throw databaseError(error);
    return { success: true as const };
  }),

  setActive: supabaseProtectedProcedure.input(tenantIdInput.extend({ customerId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("workspace_set_customer_active", { target_tenant_id: input.tenantId, target_customer_id: input.customerId, active_input: input.active });
    if (error || !data) throw databaseError(error);
    return { success: true as const, active: input.active };
  }),

  workOrderHistory: supabaseProtectedProcedure.input(tenantIdInput.extend({ customerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    await assertCustomerInTenant(supabase, input.tenantId, input.customerId);
    return orderHistory(supabase, input.tenantId, "customer_id", input.customerId, true);
  }),
});

export const supabaseVehicleRouter = router({
  listByCustomer: supabaseProtectedProcedure.input(tenantIdInput.extend({ customerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    await assertCustomerInTenant(supabase, input.tenantId, input.customerId);
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, tenant_id, customer_id, make, model, model_year, manufacture_year, plate, mileage, engine, notes, active, created_at, updated_at")
      .eq("tenant_id", input.tenantId)
      .eq("customer_id", input.customerId)
      .order("created_at", { ascending: false });
    if (error) throw databaseError(error);
    return (data ?? []).map(row => mapVehicle(row as Record<string, unknown>));
  }),

  create: supabaseProtectedProcedure.input(tenantIdInput.extend({
    customerId: z.number().int().positive(),
    make: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(140),
    modelYear: z.number().int().min(1900).max(2100).optional(),
    manufactureYear: z.number().int().min(1900).max(2100).optional(),
    plate: z.string().trim().max(16).optional(),
    mileage: z.number().int().nonnegative().optional(),
    engine: z.string().trim().max(120).optional(),
    notes: z.string().max(4000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("workspace_create_vehicle", {
      target_tenant_id: input.tenantId,
      target_customer_id: input.customerId,
      vehicle_make: input.make,
      vehicle_model: input.model,
      vehicle_model_year: input.modelYear ?? null,
      vehicle_manufacture_year: input.manufactureYear ?? null,
      vehicle_plate: input.plate ?? null,
      vehicle_mileage: input.mileage ?? null,
      vehicle_engine: input.engine ?? null,
      vehicle_notes: input.notes ?? null,
    });
    if (error || !data) throw databaseError(error);
    return { id: Number(data) };
  }),

  update: supabaseProtectedProcedure.input(tenantIdInput.extend({
    vehicleId: z.number().int().positive(),
    make: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(140),
    modelYear: z.number().int().min(1900).max(2100).optional(),
    manufactureYear: z.number().int().min(1900).max(2100).optional(),
    plate: z.string().trim().max(16).optional(),
    mileage: z.number().int().nonnegative().optional(),
    engine: z.string().trim().max(120).optional(),
    notes: z.string().max(4000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("workspace_update_vehicle", {
      target_tenant_id: input.tenantId,
      target_vehicle_id: input.vehicleId,
      vehicle_make: input.make,
      vehicle_model: input.model,
      vehicle_model_year: input.modelYear ?? null,
      vehicle_manufacture_year: input.manufactureYear ?? null,
      vehicle_plate: input.plate ?? null,
      vehicle_mileage: input.mileage ?? null,
      vehicle_engine: input.engine ?? null,
      vehicle_notes: input.notes ?? null,
    });
    if (error || !data) throw databaseError(error);
    return { success: true as const };
  }),

  setActive: supabaseProtectedProcedure.input(tenantIdInput.extend({ vehicleId: z.number().int().positive(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("workspace_set_vehicle_active", { target_tenant_id: input.tenantId, target_vehicle_id: input.vehicleId, active_input: input.active });
    if (error || !data) throw databaseError(error);
    return { success: true as const, active: input.active };
  }),

  workOrderHistory: supabaseProtectedProcedure.input(tenantIdInput.extend({ vehicleId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    await requireSupabaseTenantPermission(ctx.supabaseUser!, input.tenantId, "customers.manage");
    const supabase = clientForContext(ctx.supabaseUser);
    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.vehicleId)
      .maybeSingle();
    if (error) throw databaseError(error);
    if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Veículo não encontrado nesta oficina." });
    return orderHistory(supabase, input.tenantId, "vehicle_id", input.vehicleId, false);
  }),
});
