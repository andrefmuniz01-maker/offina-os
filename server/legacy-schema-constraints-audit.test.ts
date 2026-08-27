import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const script = await readFile(new URL("../scripts/audit-legacy-mysql-constraints.mjs", import.meta.url), "utf8");

describe("auditoria estrutural do schema legado", () => {
  it("consulta somente as visões de metadados necessárias", () => {
    expect(script).toContain("information_schema.statistics");
    expect(script).toContain("information_schema.key_column_usage");
    expect(script).toContain("information_schema.referential_constraints");
    expect(script).not.toMatch(/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|alter\s+table|drop\s+table|create\s+table)\b/i);
  });

  it("compara a unicidade e a ordem dos índices, além de referências e regras das chaves estrangeiras", () => {
    expect(script).toContain("function indexSignature");
    expect(script).toContain("function foreignKeySignature");
    expect(script).toContain("foreignKeySupportIndexes");
    expect(script).toContain("missingCriticalIndexes");
    expect(script).toContain("missingQueryIndexes");
    expect(script).toContain('normalized === "no_action" ? "restrict"');
  });
});
