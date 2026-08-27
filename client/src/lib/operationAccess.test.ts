import { describe, expect, it } from "vitest";
import { canManageAppointments, getOperationsScopeCopy } from "./operationAccess";

describe("escopo operacional por papel", () => {
  it("permite que owner, admin e atendente gerenciem agendamentos", () => {
    expect(canManageAppointments("owner")).toBe(true);
    expect(canManageAppointments("admin")).toBe(true);
    expect(canManageAppointments("attendant")).toBe(true);
  });

  it("mantém o técnico no fluxo de execução das OS atribuídas", () => {
    expect(canManageAppointments("technician")).toBe(false);
    expect(getOperationsScopeCopy("technician")).toEqual({ heading: "Suas OS atribuídas", description: "Acompanhe e atualize somente os veículos atribuídos a você." });
  });
});
