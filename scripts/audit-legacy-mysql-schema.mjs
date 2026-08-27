import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getTableColumns, getTableName } from "drizzle-orm";
import { createConnection } from "mysql2/promise";
import * as schema from "../drizzle/schema.ts";

const outputPath = resolve(process.cwd(), "docs/legacy-mysql-schema-audit.md");

function markdownCell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function canonicalSqlType(type) {
  return String(type ?? "")
    .toLowerCase()
    .replaceAll(/\s+/g, "")
    .replace(/^boolean$/, "tinyint(1)")
    .replace(/^bool$/, "tinyint(1)")
    .replace(/^integer$/, "int");
}

function sqlText(value, seen = new Set()) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => sqlText(item, seen) ?? "").join("");
  if ("queryChunks" in value) return sqlText(value.queryChunks, seen);
  if ("value" in value) return sqlText(value.value, seen);
  return null;
}

function canonicalDefault(value) {
  const raw = sqlText(value);
  if (raw === null) return null;
  const normalized = raw.trim().toLowerCase().replaceAll(/\s+/g, " ");
  if (normalized === "true") return "1";
  if (normalized === "false") return "0";
  if (/^\(?now\(\)\)?$/.test(normalized) || /^current_timestamp(?:\(\))?$/.test(normalized)) return "current_timestamp";
  if (normalized.startsWith("'") && normalized.endsWith("'")) return normalized.slice(1, -1);
  return normalized;
}

function expectedOnUpdate(column) {
  if (column.hasOnUpdateNow) return "current_timestamp";
  if (typeof column.onUpdateFn !== "function") return null;
  try {
    return canonicalDefault(column.onUpdateFn());
  } catch {
    return "declared_by_drizzle";
  }
}

function actualOnUpdate(extra) {
  const match = String(extra ?? "").match(/on update\s+(.+)$/i);
  return match ? canonicalDefault(match[1]) : null;
}

function expectedTables() {
  return Object.values(schema).flatMap(value => {
    try {
      const tableName = getTableName(value);
      const columns = getTableColumns(value);
      return [{
        tableName,
        columns: Object.entries(columns).map(([columnName, column]) => ({
          columnName,
          nullable: !column.notNull,
          defaultValue: canonicalDefault(column.default),
          onUpdateValue: expectedOnUpdate(column),
          primaryKey: Boolean(column.primary),
          sqlType: canonicalSqlType(column.getSQLType?.()),
        })),
      }];
    } catch {
      return [];
    }
  });
}

function buildReport({ expected, actual, status, generatedAt }) {
  const actualByTable = new Map();
  for (const row of actual) {
    const columns = actualByTable.get(row.tableName) ?? [];
    columns.push(row);
    actualByTable.set(row.tableName, columns);
  }

  const missingTables = expected.filter(table => !actualByTable.has(table.tableName));
  const unexpectedTables = [...actualByTable.keys()].filter(tableName => !expected.some(table => table.tableName === tableName));
  const differences = [];

  for (const table of expected) {
    const actualColumns = actualByTable.get(table.tableName) ?? [];
    const actualByColumn = new Map(actualColumns.map(column => [column.columnName, column]));
    const expectedNames = new Set(table.columns.map(column => column.columnName));
    for (const expectedColumn of table.columns) {
      const actualColumn = actualByColumn.get(expectedColumn.columnName);
      if (!actualColumn) {
        differences.push({ tableName: table.tableName, columnName: expectedColumn.columnName, kind: "coluna ausente", expected: expectedColumn.sqlType, actual: "—" });
        continue;
      }
      const actualType = canonicalSqlType(actualColumn.columnType);
      if (expectedColumn.sqlType !== actualType) {
        differences.push({ tableName: table.tableName, columnName: expectedColumn.columnName, kind: "tipo SQL", expected: expectedColumn.sqlType, actual: actualType });
      }
      if (expectedColumn.nullable !== (actualColumn.isNullable === "YES")) {
        differences.push({ tableName: table.tableName, columnName: expectedColumn.columnName, kind: "nulidade", expected: expectedColumn.nullable ? "aceita nulo" : "não nulo", actual: actualColumn.isNullable === "YES" ? "aceita nulo" : "não nulo" });
      }
      const actualDefault = canonicalDefault(actualColumn.columnDefault);
      if (expectedColumn.defaultValue !== actualDefault) {
        differences.push({ tableName: table.tableName, columnName: expectedColumn.columnName, kind: "default SQL", expected: expectedColumn.defaultValue, actual: actualDefault });
      }
      const actualUpdate = actualOnUpdate(actualColumn.extra);
      if (expectedColumn.onUpdateValue !== actualUpdate) {
        differences.push({ tableName: table.tableName, columnName: expectedColumn.columnName, kind: "on-update SQL", expected: expectedColumn.onUpdateValue, actual: actualUpdate });
      }
    }
    for (const actualColumn of actualColumns) {
      if (!expectedNames.has(actualColumn.columnName)) {
        differences.push({ tableName: table.tableName, columnName: actualColumn.columnName, kind: "coluna extra", expected: "—", actual: actualColumn.columnType });
      }
    }
  }

  const lines = [
    "# Auditoria de schema legado MySQL",
    "",
    `Gerado em **${generatedAt}** pelo utilitário somente leitura pnpm schema:audit:legacy. O relatório usa exclusivamente INFORMATION_SCHEMA; não lê dados operacionais, não grava no banco e não registra credenciais.`,
    "",
    "| Indicador | Resultado |",
    "|---|---:|",
    `| Status da conexão | ${markdownCell(status)} |`,
    `| Tabelas declaradas pelo Drizzle | ${expected.length} |`,
    `| Tabelas encontradas no banco | ${actualByTable.size} |`,
    `| Tabelas ausentes | ${missingTables.length} |`,
    `| Tabelas extras | ${unexpectedTables.length} |`,
    `| Divergências de coluna | ${differences.length} |`,
    "",
    "## Limites da comparação",
    "",
    "A classificação compara o tipo SQL declarado, incluindo comprimento, precisão e escala; normaliza apenas as equivalências intencionais boolean/tinyint(1), espaços e CURRENT_TIMESTAMP. Também confronta os defaults e expressões on-update disponíveis no Drizzle e no MySQL. A tabela técnica __drizzle_migrations é excluída por não representar uma entidade da aplicação. Collation, índices compostos, chaves estrangeiras e constraints continuam em uma auditoria própria antes de qualquer migration. O script é um inventário de risco; ele não altera a fonte MySQL nem afirma que uma divergência é segura para corrigir automaticamente.",
    "",
    "## Tabelas ausentes no banco",
    "",
    missingTables.length ? missingTables.map(table => `- ${table.tableName}`).join("\n") : "Nenhuma.",
    "",
    "## Tabelas extras no banco",
    "",
    unexpectedTables.length ? unexpectedTables.map(tableName => `- ${tableName}`).join("\n") : "Nenhuma.",
    "",
    "## Divergências por coluna",
    "",
    "| Tabela | Coluna | Categoria | Esperado no Drizzle | Encontrado no MySQL |",
    "|---|---|---|---|---|",
    ...(differences.length ? differences.map(item => `| ${markdownCell(item.tableName)} | ${markdownCell(item.columnName)} | ${markdownCell(item.kind)} | ${markdownCell(item.expected)} | ${markdownCell(item.actual)} |`) : ["| — | — | Nenhuma | — | — |"]),
    "",
  ];
  return lines.join("\n");
}

const expected = expectedTables();
let actual = [];
let status = "DATABASE_URL não disponível; comparação não executada.";

if (process.env.DATABASE_URL) {
  try {
    const connection = await createConnection(process.env.DATABASE_URL);
    const [rows] = await connection.query(`
      select table_name as tableName, column_name as columnName, column_type as columnType,
        is_nullable as isNullable, column_default as columnDefault, extra
      from information_schema.columns
      where table_schema = database()
        and table_name <> '__drizzle_migrations'
      order by table_name, ordinal_position
    `);
    actual = rows;
    status = "Conexão somente leitura concluída.";
    await connection.end();
  } catch {
    status = "Não foi possível conectar ao banco legado; comparação não executada.";
  }
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, buildReport({ expected, actual, status, generatedAt: new Date().toISOString() }));
console.log(`Auditoria de schema registrada em ${outputPath}`);
