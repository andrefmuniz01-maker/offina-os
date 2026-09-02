import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseAdminProcedure, supabaseProtectedProcedure } from "../_core/trpc";

const tenantIdInput = z.object({ tenantId: z.number().int().positive() });
const tenantSlug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífens.");

type WorkspaceRow = {
  tenant_id: number;
  name: string;
  slug: string;
  status: "trial" | "active" | "suspended" | "inactive";
  active: boolean;
  is_demo: boolean;
  role: "owner" | "admin" | "attendant" | "technician";
  permissions: string[] | null;
  is_member: boolean;
};

type DashboardOverview = {
  sales?: {
    billing: number | string;
    expectedRevenue: number | string;
    averageTicket: number | string;
    completedOrders: number;
    quoteApprovalRate: number | string;
  };
  finance?: { expenses: number | string; estimatedOperationalResult: number | string };
  commercial: { pendingQuoteValue: number | string; pendingQuoteCount: number };
  operation: { scheduled: number; inProgress: number; yard: number };
  inventory: { critical: number; reservedProducts: number };
};

type WorkspaceNotification = {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function databaseError(error: { message?: string } | null) {
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: error?.message?.includes("Apenas o Super Admin") || error?.message?.includes("acesso")
      ? error.message
      : "Não foi possível concluir esta operação no banco Supabase.",
  });
}

function supabaseForContext(supabaseUser: { accessToken: string } | null) {
  if (!supabaseUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação Supabase obrigatória." });
  return createSupabaseClient(supabaseUser.accessToken);
}

function mapWorkspace(row: WorkspaceRow) {
  return {
    tenant: {
      id: Number(row.tenant_id),
      name: row.name,
      slug: row.slug,
      status: row.status,
      active: row.active,
      isDemo: row.is_demo,
    },
    membership: {
      role: row.role,
      permissions: row.permissions ?? [],
      active: true,
    },
    isMember: row.is_member,
  };
}

function numeric(value: number | string) {
  return Number(value ?? 0);
}

function mapDashboard(value: DashboardOverview) {
  return {
    ...(value.sales
      ? {
          sales: {
            billing: numeric(value.sales.billing),
            expectedRevenue: numeric(value.sales.expectedRevenue),
            averageTicket: numeric(value.sales.averageTicket),
            completedOrders: Number(value.sales.completedOrders ?? 0),
            quoteApprovalRate: numeric(value.sales.quoteApprovalRate),
          },
        }
      : {}),
    ...(value.finance
      ? {
          finance: {
            expenses: numeric(value.finance.expenses),
            estimatedOperationalResult: numeric(value.finance.estimatedOperationalResult),
          },
        }
      : {}),
    commercial: {
      pendingQuoteValue: numeric(value.commercial.pendingQuoteValue),
      pendingQuoteCount: Number(value.commercial.pendingQuoteCount ?? 0),
    },
    operation: {
      scheduled: Number(value.operation.scheduled ?? 0),
      inProgress: Number(value.operation.inProgress ?? 0),
      yard: Number(value.operation.yard ?? 0),
    },
    inventory: {
      critical: Number(value.inventory.critical ?? 0),
      reservedProducts: Number(value.inventory.reservedProducts ?? 0),
    },
  };
}

export const supabaseWorkspaceRouter = router({
  mine: supabaseProtectedProcedure.query(async ({ ctx }) => {
    const supabase = supabaseForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("my_workspaces");
    if (error) throw databaseError(error);
    return ((data ?? []) as WorkspaceRow[]).map(mapWorkspace);
  }),

  createTenant: supabaseAdminProcedure.input(z.object({
    name: z.string().trim().min(3).max(160),
    slug: tenantSlug,
    whatsapp: z.string().trim().max(32).optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  })).mutation(async ({ ctx, input }) => {
    const supabase = supabaseForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("platform_create_tenant", {
      tenant_name: input.name,
      tenant_slug: input.slug,
      tenant_whatsapp: input.whatsapp ?? null,
      tenant_primary_color: input.primaryColor ?? "#E84D1C",
    });
    if (error || !data) throw databaseError(error);
    return { tenantId: Number(data) };
  }),

  dashboardOverview: supabaseProtectedProcedure.input(tenantIdInput.extend({ rangeStart: z.string().datetime({ offset: true }).optional(), rangeEnd: z.string().datetime({ offset: true }).optional() })).query(async ({ ctx, input }) => {
    const supabase = supabaseForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("workspace_dashboard_overview", { target_tenant_id: input.tenantId, range_start_input: input.rangeStart ?? null, range_end_input: input.rangeEnd ?? null });
    if (error || !data) throw databaseError(error);
    return mapDashboard(data as DashboardOverview);
  }),

  notifications: supabaseProtectedProcedure.input(tenantIdInput.extend({ maxItems: z.number().int().min(1).max(30).default(5) })).query(async ({ ctx, input }) => {
    const supabase = supabaseForContext(ctx.supabaseUser);
    const { data, error } = await supabase.rpc("workspace_notifications", {
      target_tenant_id: input.tenantId,
      max_items: input.maxItems,
    });
    if (error) throw databaseError(error);
    return { items: ((data ?? []) as WorkspaceNotification[]).map(notification => ({ notification })) };
  }),
});
