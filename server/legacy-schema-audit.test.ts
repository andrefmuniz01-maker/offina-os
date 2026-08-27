import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const script = await readFile(new URL("../scripts/audit-legacy-mysql-schema.mjs", import.meta.url), "utf8");

describe("auditoria de schema legado", () => {
  it("consulta somente INFORMATION_SCHEMA e não contém comandos de escrita", () => {
    expect(script).toContain("from information_schema.columns");
    expect(script).not.toMatch(/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|alter\s+table|drop\s+table|create\s+table)\b/i);
  });

  it("documenta colunas ausentes, extras, nulidade, tipo, default e on-update", () => {
    expect(script).toContain("coluna ausente");
    expect(script).toContain("coluna extra");
    expect(script).toContain("nulidade");
    expect(script).toContain("tipo SQL");
    expect(script).toContain("default SQL");
    expect(script).toContain("on-update SQL");
  });

  it("reconhece booleanos MySQL e ignora a metadata técnica de migrations", () => {
    expect(script).toContain('"tinyint(1)"');
    expect(script).toContain("table_name <> '__drizzle_migrations'");
  });

  it("normaliza o tipo e os defaults comparáveis antes de confrontar o banco", () => {
    expect(script).toContain("function canonicalSqlType");
    expect(script).toContain("function canonicalDefault");
    expect(script).toContain("column.getSQLType?.()");
    expect(script).toContain("column.hasOnUpdateNow");
    expect(script).toContain("now\\(\\)");
  });
});
