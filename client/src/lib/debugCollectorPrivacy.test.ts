import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const collectorPath = resolve(import.meta.dirname, "../../public/__manus__/debug-collector.js");
const collectorSource = readFileSync(collectorPath, "utf8");

describe("coletor de depuração", () => {
  it("redige os cabeçalhos de requisição antes de persistir eventos de rede", () => {
    expect(collectorSource).toContain("headers: sanitizeValue(requestHeaders)");
  });

  it("redige os cabeçalhos de resposta antes de persistir eventos de rede", () => {
    expect(collectorSource).toContain("headers: sanitizeValue(Object.fromEntries(response.headers.entries()))");
  });
});
