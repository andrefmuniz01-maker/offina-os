import { describe, expect, it } from "vitest";
import { calculateQuotePricing, discountPolicyViolation, maximumDiscountAmount, suggestedSalePrice } from "./pricing";

describe("regras comerciais", () => {
  it("sugere o preço de venda para atingir a margem bruta configurada", () => {
    expect(suggestedSalePrice(100, 25)).toBe(133.33);
    expect(suggestedSalePrice(100, 0)).toBe(100);
  });

  it("recusa margem impossível para evitar preço indefinido", () => {
    expect(() => suggestedSalePrice(100, 100)).toThrow("99,99%");
  });

  it("recalcula subtotal, desconto, custo e margem pela soma das linhas", () => {
    expect(calculateQuotePricing([
      { quantity: 2, unitPrice: 100, unitCost: 60, discount: 10 },
      { quantity: 1, unitPrice: 50, unitCost: 20, discount: 0 },
    ])).toEqual({ subtotal: 250, discountTotal: 10, total: 240, totalCost: 140, marginPercent: 41.67 });
  });

  it("converte o limite percentual de desconto em valor monetário", () => {
    expect(maximumDiscountAmount(830, 7.5)).toBe(62.25);
  });

  it("bloqueia desconto acima da autonomia do atendente e permite exceção justificada ao gestor", () => {
    const pricing = calculateQuotePricing([{ quantity: 1, unitPrice: 100, unitCost: 80, discount: 15 }]);
    expect(discountPolicyViolation({ pricing, attendantMaxDiscountPercent: 10, minimumMarginPercent: 10, canManageFinancials: false })).toBe("discount_limit");
    expect(discountPolicyViolation({ pricing, attendantMaxDiscountPercent: 10, minimumMarginPercent: 10, canManageFinancials: true })).toBe("minimum_margin");
    expect(discountPolicyViolation({ pricing, attendantMaxDiscountPercent: 10, minimumMarginPercent: 10, canManageFinancials: true, overrideReason: "Condição comercial aprovada" })).toBeNull();
  });
});
