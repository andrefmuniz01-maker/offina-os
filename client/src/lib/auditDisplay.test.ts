import { describe, expect, it } from "vitest";
import { formatAuditAction } from "./auditDisplay";

describe("auditDisplay", () => {
  it("traduz os eventos técnicos mais frequentes para a operação", () => {
    expect(formatAuditAction("Service.Created")).toBe("Serviço criado");
    expect(formatAuditAction("Product_Category.Created")).toBe("Categoria de produto criado");
  });
});
