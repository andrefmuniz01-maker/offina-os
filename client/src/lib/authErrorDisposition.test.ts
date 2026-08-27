import { describe, expect, it } from "vitest";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { getApiErrorDisposition } from "./authErrorDisposition";

describe("getApiErrorDisposition", () => {
  it("mantém uma falha não autenticada de módulo como erro local, sem tratar como logout", () => {
    expect(
      getApiErrorDisposition({
        message: UNAUTHED_ERR_MSG,
        data: { path: "platform.metrics" },
      }),
    ).toBe("module-error");
  });

  it("identifica somente auth.me como sinal para reavaliar o estado autenticado", () => {
    expect(
      getApiErrorDisposition({
        message: UNAUTHED_ERR_MSG,
        data: { path: "auth.me" },
      }),
    ).toBe("auth-state");
  });

  it("mantém erros desconhecidos no módulo que os originou", () => {
    expect(getApiErrorDisposition(new Error("timeout"))).toBe("module-error");
  });
});
