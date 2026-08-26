export type PricingLine = {
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount?: number;
};

export type QuotePricing = {
  subtotal: number;
  discountTotal: number;
  total: number;
  totalCost: number;
  marginPercent: number;
};

export function toMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function grossMarginPercent(total: number, totalCost: number) {
  if (total <= 0) return totalCost <= 0 ? 0 : -100;
  return ((total - totalCost) / total) * 100;
}

export function suggestedSalePrice(cost: number, targetMarginPercent: number) {
  if (!Number.isFinite(cost) || cost < 0) throw new Error("O custo deve ser um número não negativo.");
  if (!Number.isFinite(targetMarginPercent) || targetMarginPercent < 0 || targetMarginPercent >= 100) {
    throw new Error("A margem alvo deve estar entre 0% e 99,99%.");
  }
  return toMoney(cost / (1 - targetMarginPercent / 100));
}

export function calculateQuotePricing(lines: PricingLine[]): QuotePricing {
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const discountTotal = lines.reduce((sum, line) => sum + (line.discount ?? 0), 0);
  const totalCost = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  const total = subtotal - discountTotal;
  return {
    subtotal: toMoney(subtotal),
    discountTotal: toMoney(discountTotal),
    total: toMoney(total),
    totalCost: toMoney(totalCost),
    marginPercent: toMoney(grossMarginPercent(total, totalCost)),
  };
}

export function maximumDiscountAmount(subtotal: number, maxDiscountPercent: number) {
  if (maxDiscountPercent < 0 || maxDiscountPercent > 100) throw new Error("O limite de desconto deve estar entre 0% e 100%.");
  return toMoney(subtotal * (maxDiscountPercent / 100));
}

export function discountPolicyViolation(input: {
  pricing: QuotePricing;
  attendantMaxDiscountPercent: number;
  minimumMarginPercent: number;
  canManageFinancials: boolean;
  overrideReason?: string;
}) {
  if (!input.canManageFinancials && input.pricing.discountTotal > maximumDiscountAmount(input.pricing.subtotal, input.attendantMaxDiscountPercent)) {
    return "discount_limit" as const;
  }
  if (input.pricing.marginPercent < input.minimumMarginPercent && (!input.canManageFinancials || !input.overrideReason?.trim())) {
    return "minimum_margin" as const;
  }
  return null;
}
