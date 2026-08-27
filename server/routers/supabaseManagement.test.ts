import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), permission: vi.fn() }));

vi.mock("../_core/supabase", () => ({ createSupabaseClient: vi.fn(() => ({ rpc: mocks.rpc })) }));
vi.mock("../supabaseTenantAccess", () => ({
  requireSupabaseTenantPermission: mocks.permission,
  getSupabaseTenantAccess: vi.fn(),
  hasSupabasePermission: vi.fn(),
}));

import { supabaseManagementRouter } from "./supabaseManagement";

const user = { id: "dbbcbcad-23a2-4c39-ae56-82a159ad5389", accessToken: "test-token", platformRole: "platform_user" };
const team = [{
  member: { userId: "dbbcbcad-23a2-4c39-ae56-82a159ad5389", role: "technician", permissions: ["work_orders.execute"], active: true },
  user: { id: "dbbcbcad-23a2-4c39-ae56-82a159ad5389", name: "Técnico", email: "tecnico@oficina.test" },
}];

describe("workspaceManagement.team.list", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.permission.mockReset();
    mocks.permission.mockResolvedValue({});
  });

  it("exige identidade Supabase materializada antes de consultar a equipe", async () => {
    const caller = supabaseManagementRouter.createCaller({ supabaseUser: null } as never);
    await expect(caller.team.list({ tenantId: 4 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("exige tenant.manage e encaminha somente o tenant solicitado para a RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: team, error: null });
    const caller = supabaseManagementRouter.createCaller({ supabaseUser: user } as never);
    await expect(caller.team.list({ tenantId: 4 })).resolves.toEqual(team);
    expect(mocks.permission).toHaveBeenCalledWith(user, 4, "tenant.manage");
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_list_team_members", { target_tenant_id: 4 });
  });

  it("não consulta a RPC quando o vínculo ou a permissão do tenant é negada", async () => {
    mocks.permission.mockRejectedValueOnce(new TRPCError({ code: "FORBIDDEN", message: "Sem acesso" }));
    const caller = supabaseManagementRouter.createCaller({ supabaseUser: user } as never);
    await expect(caller.team.list({ tenantId: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejeita uma resposta que exponha token, papel de plataforma ou outros campos fora da projeção", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...team[0], user: { ...team[0].user, accessToken: "não-expor" } }], error: null });
    const caller = supabaseManagementRouter.createCaller({ supabaseUser: user } as never);
    await expect(caller.team.list({ tenantId: 4 })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});
