import { describe, expect, it } from "vitest";
import { resolvePublicServiceLabel } from "./quotes";

describe("rótulo de serviço na solicitação pública", () => {
  it("prioriza o nome canônico do catálogo quando o serviço foi selecionado", () => {
    expect(resolvePublicServiceLabel("Texto alterado pelo navegador", "Revisão de freios")).toBe("Revisão de freios");
  });

  it("mantém a descrição enviada quando a solicitação não referencia um serviço cadastrado", () => {
    expect(resolvePublicServiceLabel("Diagnóstico de ruído")).toBe("Diagnóstico de ruído");
  });
});
