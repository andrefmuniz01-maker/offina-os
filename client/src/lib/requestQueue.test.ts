import { describe, expect, it } from "vitest";
import { getQueueUrgency, getRequestNextAction, getRequestStatusTone } from "./requestQueue";

describe("requestQueue", () => {
  it("indica a próxima ação conforme o estado comercial", () => {
    expect(getRequestNextAction("new", true).title).toBe("Iniciar atendimento");
    expect(getRequestNextAction("in_analysis", false).title).toBe("Confirmar serviço");
    expect(getRequestNextAction("approved", true).title).toBe("Agendar execução");
  });

  it("classifica o tempo de fila sem depender da interface", () => {
    expect(getQueueUrgency(30)).toBe("normal");
    expect(getQueueUrgency(240)).toBe("atenção");
    expect(getQueueUrgency(1440)).toBe("critica");
    expect(getRequestStatusTone("new")).toContain("orange");
    expect(getRequestStatusTone("in_analysis")).toContain("sky");
    expect(getRequestStatusTone("approved")).toContain("emerald");
    expect(getRequestStatusTone("rejected")).toContain("red");
  });
});
