import { describe, expect, it } from "vitest";
import { commercialGroupStatuses, getCommercialGroup, type RequestQueueStatus } from "./requestQueue";

const allStatuses: RequestQueueStatus[] = ["new", "in_analysis", "awaiting_information", "in_quoting", "ready", "sent", "approved", "rejected", "expired", "cancelled"];

describe("getCommercialGroup", () => {
  it("classifica todo status de solicitação em exatamente um grupo comercial", () => {
    for (const status of allStatuses) {
      expect(getCommercialGroup(status)).toBeTruthy();
    }
  });

  it("agrupa tudo que ainda não foi enviado ao cliente como novas solicitações", () => {
    expect(getCommercialGroup("new")).toBe("novas");
    expect(getCommercialGroup("in_analysis")).toBe("novas");
    expect(getCommercialGroup("awaiting_information")).toBe("novas");
    expect(getCommercialGroup("in_quoting")).toBe("novas");
    expect(getCommercialGroup("ready")).toBe("novas");
  });

  it("separa recusadas, expiradas e canceladas no grupo de recusados", () => {
    expect(getCommercialGroup("rejected")).toBe("recusados");
    expect(getCommercialGroup("expired")).toBe("recusados");
    expect(getCommercialGroup("cancelled")).toBe("recusados");
  });

  it("mantém aprovados e aguardando retorno como grupos distintos", () => {
    expect(getCommercialGroup("approved")).toBe("aprovados");
    expect(getCommercialGroup("sent")).toBe("aguardando_retorno");
  });

  it("cobre exatamente os 10 status de solicitação sem sobreposição", () => {
    const covered = Object.values(commercialGroupStatuses).flat();
    expect(covered.sort()).toEqual([...allStatuses].sort());
  });
});
