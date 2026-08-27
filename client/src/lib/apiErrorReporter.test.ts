import { describe, expect, it, vi } from "vitest";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { createApiErrorReporter } from "./apiErrorReporter";

describe("relatório de falhas de API", () => {
  it("registra apenas uma vez o mesmo erro tratado de consulta", () => {
    const logger = { warn: vi.fn() };
    const report = createApiErrorReporter(logger);
    const error = new Error("Não foi possível carregar os agendamentos desta oficina.");

    report("query", error);
    report("query", error);
    report("query", new Error(error.message));

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("[API Query Error]", error);
  });

  it("mantém a sessão inválida fora da telemetria de erro repetida", () => {
    const logger = { warn: vi.fn() };
    const report = createApiErrorReporter(logger);

    report("query", { message: UNAUTHED_ERR_MSG, data: { path: "auth.me" } });

    expect(logger.warn).toHaveBeenCalledWith("[Auth State Error] A sessão será reavaliada pela consulta de identidade.");
  });
});
