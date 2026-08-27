import { TRPCError } from "@trpc/server";
import { createSupabaseClient } from "../_core/supabase";
import { router, supabaseAdminProcedure } from "../_core/trpc";

type DemoStatus = {
  exists: boolean;
  tenantId?: number;
  slug: string;
  name?: string;
  active?: boolean;
  createdAt?: string;
  memberCount?: number;
  customerCount?: number;
  vehicleCount?: number;
  productCount?: number;
  serviceCount?: number;
  kitCount?: number;
  purchaseOrderCount?: number;
};

function databaseError(error: { message?: string; code?: string } | null) {
  if (error?.code === "42501") return new TRPCError({ code: "FORBIDDEN", message: "Apenas Super Admin pode acessar a Oficina Demo." });
  if (error?.code === "23505") return new TRPCError({ code: "CONFLICT", message: error.message ?? "O slug de demonstração está ocupado por uma oficina que não é demo." });
  if (error?.code === "55000") return new TRPCError({ code: "PRECONDITION_FAILED", message: error.message ?? "O reset não é seguro no estado atual." });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error?.message ?? "Não foi possível concluir a operação da Oficina Demo." });
}

async function demoRpc<T>(accessToken: string, name: "platform_demo_status" | "platform_provision_incremental_demo" | "platform_reset_incremental_demo") {
  const { data, error } = await createSupabaseClient(accessToken).rpc(name);
  if (error) throw databaseError(error);
  return data as T;
}

export const supabaseDemoRouter = router({
  status: supabaseAdminProcedure.query(async ({ ctx }) => {
    return demoRpc<DemoStatus>(ctx.supabaseUser!.accessToken, "platform_demo_status");
  }),

  provisionIncremental: supabaseAdminProcedure.mutation(async ({ ctx }) => {
    return demoRpc<{ tenantId: number; slug: string; created: boolean; alreadyProvisioned: boolean }>(ctx.supabaseUser!.accessToken, "platform_provision_incremental_demo");
  }),

  resetIncremental: supabaseAdminProcedure.mutation(async ({ ctx }) => {
    return demoRpc<{ tenantId: number; slug: string; reset: boolean }>(ctx.supabaseUser!.accessToken, "platform_reset_incremental_demo");
  }),
});
