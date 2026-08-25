import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: null as any,
  audit: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => mocks.db),
  writeAuditLog: mocks.audit,
  createTenantForOwner: vi.fn(),
  listUserTenants: vi.fn(),
}));

vi.mock("../tenantAccess", () => ({
  assertPlatformSuperAdmin: vi.fn(),
  getTenantAccess: vi.fn(),
  requireTenantPermission: mocks.requirePermission,
}));

import { tenantBranding, tenantSettings } from "../../drizzle/schema";
import { tenantRouter } from "./platform";

function buildDb() {
  const records = { settings: new Map<number, Record<string, unknown>>(), branding: new Map<number, Record<string, unknown>>() };
  const query: any = {};
  query.from = vi.fn((table: unknown) => { query.table = table; return query; });
  query.where = vi.fn(() => query);
  query.limit = vi.fn(async () => query.table === tenantSettings ? [records.settings.get(4)].filter(Boolean) : [records.branding.get(4)].filter(Boolean));

  return {
    select: vi.fn(() => query),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((value: Record<string, unknown>) => ({
        onDuplicateKeyUpdate: vi.fn(async ({ set }: { set: Record<string, unknown> }) => {
          const target = table === tenantSettings ? records.settings : records.branding;
          const tenantId = Number(value.tenantId);
          target.set(tenantId, { ...(target.get(tenantId) ?? value), ...set });
        }),
      })),
    })),
  };
}

function createContext(): TrpcContext {
  return {
    user: { id: 7, openId: "tenant-owner", role: "user", platformRole: "platform_user", name: "Gestor", email: "gestor@example.com", loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("tenant settings e branding — upsert e recarregamento", () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.requirePermission.mockResolvedValue({ permissions: ["tenant.manage"] });
    mocks.db = buildDb();
  });

  it("cria os registros ausentes via upsert e os devolve no recarregamento do tenant", async () => {
    const caller = tenantRouter.createCaller(createContext());

    await expect(caller.settings.update({ tenantId: 4, legalName: "Oficina Centro LTDA", defaultLaborHourlyRate: 185.5, defaultPartsMarginPercent: 35, defaultPartsMarkupPercent: 42, minimumMarginPercent: 20, attendantMaxDiscountPercent: 8, quoteValidityDays: 10 })).resolves.toEqual({ success: true });
    await expect(caller.branding.update({ tenantId: 4, publicTitle: "Oficina Centro", primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455" })).resolves.toEqual({ success: true });

    await expect(caller.settings.get({ tenantId: 4 })).resolves.toEqual(expect.objectContaining({ tenantId: 4, legalName: "Oficina Centro LTDA", defaultLaborHourlyRate: "185.50", defaultPartsMarginPercent: "35.00", defaultPartsMarkupPercent: "42.00", minimumMarginPercent: "20.00", attendantMaxDiscountPercent: "8.00", quoteValidityDays: 10 }));
    await expect(caller.branding.get({ tenantId: 4 })).resolves.toEqual(expect.objectContaining({ tenantId: 4, publicTitle: "Oficina Centro", primaryColor: "#112233", secondaryColor: "#223344", accentColor: "#334455" }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "tenant.settings_updated" }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 4, actorUserId: 7, action: "tenant.branding_updated" }));
  });
});
