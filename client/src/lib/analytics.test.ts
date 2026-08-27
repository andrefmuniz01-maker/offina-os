import { describe, expect, it } from "vitest";
import { getAnalyticsScriptUrl } from "./analytics";

describe("analytics configuration", () => {
  it("não gera script quando a configuração está ausente ou inválida", () => {
    expect(getAnalyticsScriptUrl()).toBeNull();
    expect(getAnalyticsScriptUrl(" ")).toBeNull();
    expect(getAnalyticsScriptUrl("javascript:alert(1)")).toBeNull();
    expect(getAnalyticsScriptUrl("not-a-url")).toBeNull();
  });

  it("normaliza a URL do script para um endpoint HTTP configurado", () => {
    expect(getAnalyticsScriptUrl("https://analytics.example.com")).toBe("https://analytics.example.com/umami");
    expect(getAnalyticsScriptUrl("https://analytics.example.com/")).toBe("https://analytics.example.com/umami");
  });
});
