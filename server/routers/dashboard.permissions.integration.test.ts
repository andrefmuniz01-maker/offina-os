import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn() } as any,
  requirePermission: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => mocks.db), writeAuditLog: vi.fn() }));
vi.mock("../tenantAccess", () => ({ requireTenantPermission: mocks.requirePermission }));

import { dashboardRouter } from "./management";

function createContext(): TrpcContext {
  return {
    user: { id: 9, openId: "attendant", role: "user", platformRole: "platform_user", name: "Atendente", email: "atendente@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("dashboard.overview — permissão financeira e operacional", () => {
  beforeEach(() => {
    mocks.db.select.mockReset();
    mocks.requirePermission.mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não possui acesso a relatórios." }));
  });

  it("não executa agregações nem expõe indicadores para perfil sem reports.view", async () => {
    const caller = dashboardRouter.createCaller(createContext());

    await expect(caller.overview({ tenantId: 4, referenceDate: new Date("2026-08-25T00:00:00.000Z") })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db.select).not.toHaveBeenCalled();
  });
});
