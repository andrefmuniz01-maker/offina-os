import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { createConnection } from "mysql2/promise";
import * as schema from "../drizzle/schema.ts";

const outputPath = resolve(process.cwd(), "docs/legacy-mysql-constraints-audit.md");

function cell(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function names(columns) {
  return columns.map(column => column.name).join(",");
}

function action(value) {
  const normalized = String(value ?? "restrict").toLowerCase().replaceAll(" ", "_");
  return normalized === "no_action" ? "restrict" : normalized;
}

function expectedTables() {
  return Object.values(schema).flatMap(value => {
    try {
      const tableName = getTableName(value);
      const config = getTableConfig(value);
      const indexes = [];
      const primaryColumns = config.columns.filter(column => column.primary);
      if (primaryColumns.length) indexes.push({ tableName, name: "PRIMARY", columns: names(primaryColumns), unique: true, kind: "primary key" });
      for (const index of config.indexes) {
        indexes.push({ tableName, name: index.config.name, columns: names(index.config.columns), unique: Boolean(index.config.unique), kind: index.config.unique ? "unique index" : "index" });
      }
      for (const constraint of config.uniqueConstraints) {
        indexes.push({ tableName, name: constraint.getName(), columns: names(constraint.columns), unique: true, kind: "unique constraint" });
      }
      for (const column of config.columns.filter(column => column.isUnique)) {
        indexes.push({ tableName, name: column.uniqueName, columns: column.name, unique: true, kind: "unique column" });
      }
      const uniqueIndexes = [...new Map(indexes.map(index => [`${index.name}:${index.columns}`, index])).values()];
      const foreignKeys = config.foreignKeys.map(key => {
        const reference = key.reference();
        return {
          tableName,
          name: key.getName(),
          columns: names(reference.columns),
          referencedTable: getTableName(reference.foreignTable),
          referencedColumns: names(reference.foreignColumns),
          updateRule: action(key.onUpdate),
          deleteRule: action(key.onDelete),
        };
      });
      return [{ tableName, indexes: uniqueIndexes, foreignKeys }];
    } catch {
      return [];
    }
  });
}

function key(tableName, name) {
  return `${tableName}:${name}`;
}

function indexSignature(item) {
  return `${item.tableName}:${item.columns}:${item.unique}`;
}

function foreignKeySignature(item) {
  return `${item.tableName}:${item.columns}:${item.referencedTable}:${item.referencedColumns}:${item.updateRule}:${item.deleteRule}`;
}

function compareIndexes(expected, actual) {
  const actualBySignature = new Map(actual.map(index => [indexSignature(index), index]));
  const expectedBySignature = new Map(expected.map(index => [indexSignature(index), index]));
  const missing = [];
  const nameDifferences = [];
  const unexpected = [];
  for (const item of expected) {
    const found = actualBySignature.get(indexSignature(item));
    if (!found) {
      missing.push(item);
      continue;
    }
    if (item.name !== found.name) nameDifferences.push({ expected: item, actual: found });
  }
  for (const item of actual) if (!expectedBySignature.has(indexSignature(item))) unexpected.push(item);
  return { missing, nameDifferences, unexpected };
}

function compareForeignKeys(expected, actual) {
  const actualBySignature = new Map(actual.map(foreignKey => [foreignKeySignature(foreignKey), foreignKey]));
  const expectedBySignature = new Map(expected.map(foreignKey => [foreignKeySignature(foreignKey), foreignKey]));
  const missing = [];
  const nameDifferences = [];
  const unexpected = [];
  for (const item of expected) {
    const found = actualBySignature.get(foreignKeySignature(item));
    if (!found) {
      missing.push(item);
      continue;
    }
    if (item.name !== found.name) nameDifferences.push({ expected: item, actual: found });
  }
  for (const item of actual) if (!expectedBySignature.has(foreignKeySignature(item))) unexpected.push(item);
  return { missing, nameDifferences, unexpected };
}

function buildReport({ expectedTables, actualIndexes, actualForeignKeys, indexStatus, foreignKeyStatus, generatedAt }) {
  const expectedIndexes = expectedTables.flatMap(table => table.indexes);
  const expectedForeignKeys = expectedTables.flatMap(table => table.foreignKeys);
  const foreignKeyResult = compareForeignKeys(expectedForeignKeys, actualForeignKeys);
  const indexResult = compareIndexes(expectedIndexes, actualIndexes);
  const foreignKeySupportIndexes = new Set(actualForeignKeys.map(foreignKey => `${foreignKey.tableName}:${foreignKey.columns}`));
  indexResult.unexpected = indexResult.unexpected.filter(index => !foreignKeySupportIndexes.has(`${index.tableName}:${index.columns}`));
  const missingCriticalIndexes = indexResult.missing.filter(index => index.unique || index.kind === "primary key");
  const missingQueryIndexes = indexResult.missing.filter(index => !index.unique && index.kind !== "primary key");
  const differences = indexResult.missing.length + indexResult.unexpected.length + foreignKeyResult.missing.length + foreignKeyResult.unexpected.length;
  const lines = [
    "# Auditoria estrutural do MySQL legado",
    "",
    `Gerado em **${generatedAt}**. Esta verificação consulta apenas INFORMATION_SCHEMA e não lê tabelas operacionais, não grava no banco e não registra credenciais.`,
    "",
    "| Indicador | Resultado |",
    "|---|---:|",
    `| Índices declarados pelo Drizzle | ${expectedIndexes.length} |`,
    `| Índices encontrados no MySQL | ${actualIndexes.length} |`,
    `| Chaves estrangeiras declaradas pelo Drizzle | ${expectedForeignKeys.length} |`,
    `| Chaves estrangeiras encontradas no MySQL | ${actualForeignKeys.length} |`,
    `| Status da consulta de índices | ${cell(indexStatus)} |`,
    `| Status da consulta de chaves estrangeiras | ${cell(foreignKeyStatus)} |`,
    `| Índices primários/únicos ausentes | ${missingCriticalIndexes.length} |`,
    `| Índices de consulta declarados e ausentes | ${missingQueryIndexes.length} |`,
    `| Chaves estrangeiras funcionalmente ausentes | ${foreignKeyResult.missing.length} |`,
    `| Itens que exigem revisão | ${differences} |`,
    "",
    "## Critério de comparação",
    "",
    "Os índices são comparados por tabela, ordem das colunas e unicidade; diferença de nome é registrada separadamente como compatível em comportamento. Índices não únicos que o InnoDB cria apenas para suportar uma chave estrangeira são excluídos exclusivamente da lista de adicionais; eles nunca ocultam um índice de consulta declarado e ausente. As chaves estrangeiras são comparadas por colunas locais, tabela/colunas referenciadas e regras de atualização/remoção; diferença de nome também é registrada separadamente. A equivalência intencional de regra omitida no Drizzle para RESTRICT e de NO ACTION para RESTRICT no InnoDB é normalizada [1]. Collation, checks e particionamento permanecem fora deste escopo e não devem ser alterados sem revisão humana.",
    "",
    "> Nenhuma migration é executada por este utilitário. Um índice de consulta ausente é uma divergência a ser priorizada e revisada, não uma autorização para alteração automática na fonte MySQL.",
    "",
    "## Índices ausentes ou funcionalmente divergentes",
    "",
    "| Situação | Tabela | Nome | Esperado | Encontrado |",
    "|---|---|---|---|---|",
    ...(indexResult.missing.map(item => `| Ausente | ${cell(item.tableName)} | ${cell(item.name)} | ${cell(`${item.kind}; ${item.columns}; ${item.unique ? "único" : "não único"}`)} | — |`)),
    ...(!indexResult.missing.length ? ["| Nenhum | — | — | — | — |"] : []),
    "",
    "## Índices adicionais para revisão",
    "",
    "| Tabela | Nome | Colunas | Unicidade |",
    "|---|---|---|---|",
    ...(indexResult.unexpected.length ? indexResult.unexpected.map(item => `| ${cell(item.tableName)} | ${cell(item.name)} | ${cell(item.columns)} | ${item.unique ? "único" : "não único"} |`) : ["| Nenhum | — | — | — |"]),
    "",
    "## Diferenças de nome de índice sem impacto funcional",
    "",
    "| Tabela | Nome declarado no Drizzle | Nome existente no MySQL | Cobertura |",
    "|---|---|---|---|",
    ...(indexResult.nameDifferences.length ? indexResult.nameDifferences.map(item => `| ${cell(item.expected.tableName)} | ${cell(item.expected.name)} | ${cell(item.actual.name)} | ${cell(`${item.expected.columns}; ${item.expected.unique ? "único" : "não único"}`)} |`) : ["| Nenhuma | — | — | — |"]),
    "",
    "## Chaves estrangeiras ausentes ou funcionalmente divergentes",
    "",
    "| Situação | Tabela | Nome | Esperado | Encontrado |",
    "|---|---|---|---|---|",
    ...(foreignKeyResult.missing.map(item => `| Ausente | ${cell(item.tableName)} | ${cell(item.name)} | ${cell(`${item.columns} → ${item.referencedTable}.${item.referencedColumns}; update ${item.updateRule}; delete ${item.deleteRule}`)} | — |`)),
    ...(!foreignKeyResult.missing.length ? ["| Nenhuma | — | — | — | — |"] : []),
    "",
    "## Chaves estrangeiras adicionais para revisão",
    "",
    "| Tabela | Nome | Relacionamento |",
    "|---|---|---|",
    ...(foreignKeyResult.unexpected.length ? foreignKeyResult.unexpected.map(item => `| ${cell(item.tableName)} | ${cell(item.name)} | ${cell(`${item.columns} → ${item.referencedTable}.${item.referencedColumns}`)} |`) : ["| Nenhuma | — | — |"]),
    "",
    "## Diferenças de nome de chave estrangeira sem impacto funcional",
    "",
    "| Tabela | Nome inferido pelo Drizzle | Nome existente no MySQL | Relacionamento |",
    "|---|---|---|---|",
    ...(foreignKeyResult.nameDifferences.length ? foreignKeyResult.nameDifferences.map(item => `| ${cell(item.expected.tableName)} | ${cell(item.expected.name)} | ${cell(item.actual.name)} | ${cell(`${item.expected.columns} → ${item.expected.referencedTable}.${item.expected.referencedColumns}`)} |`) : ["| Nenhuma | — | — | — |"]),
    "",
    "## Referências",
    "",
    "[1]: https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html \"MySQL 8.4 Reference Manual — FOREIGN KEY Constraints\"",
    "",
  ];
  return lines.join("\n");
}

const expected = expectedTables();
let indexes = [];
let foreignKeys = [];
let indexStatus = "DATABASE_URL não disponível; comparação não executada.";
let foreignKeyStatus = "DATABASE_URL não disponível; comparação não executada.";

if (process.env.DATABASE_URL) {
  try {
    const connection = await createConnection(process.env.DATABASE_URL);
    try {
      const [rows] = await connection.query(`
        select table_name as tableName, index_name as name, max(non_unique) as nonUnique,
          group_concat(column_name order by seq_in_index separator ',') as columns
        from information_schema.statistics
        where table_schema = database() and table_name <> '__drizzle_migrations'
        group by table_name, index_name
        order by table_name, index_name
      `);
      indexes = rows.map(row => ({ ...row, unique: Number(row.nonUnique) === 0 }));
      indexStatus = "Conexão somente leitura concluída.";
    } catch {
      indexStatus = "Não foi possível consultar os índices no banco legado.";
    }
    try {
      const [rows] = await connection.query(`
        select kcu.table_name as tableName, kcu.constraint_name as name,
          group_concat(kcu.column_name order by kcu.ordinal_position separator ',') as columns,
          max(kcu.referenced_table_name) as referencedTable,
          group_concat(kcu.referenced_column_name order by kcu.ordinal_position separator ',') as referencedColumns,
          max(rc.update_rule) as updateRule, max(rc.delete_rule) as deleteRule
        from information_schema.key_column_usage kcu
        join information_schema.referential_constraints rc
          on rc.constraint_schema = kcu.constraint_schema and rc.constraint_name = kcu.constraint_name and rc.table_name = kcu.table_name
        where kcu.table_schema = database() and kcu.referenced_table_name is not null and kcu.table_name <> '__drizzle_migrations'
        group by kcu.table_name, kcu.constraint_name
        order by kcu.table_name, kcu.constraint_name
      `);
      foreignKeys = rows.map(row => ({ ...row, updateRule: action(row.updateRule), deleteRule: action(row.deleteRule) }));
      foreignKeyStatus = "Conexão somente leitura concluída.";
    } catch {
      foreignKeyStatus = "Não foi possível consultar as chaves estrangeiras no banco legado.";
    }
    await connection.end();
  } catch {
    indexStatus = "Não foi possível conectar ao banco legado; comparação não executada.";
    foreignKeyStatus = "Não foi possível conectar ao banco legado; comparação não executada.";
  }
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, buildReport({ expectedTables: expected, actualIndexes: indexes, actualForeignKeys: foreignKeys, indexStatus, foreignKeyStatus, generatedAt: new Date().toISOString() }));
console.log(`Auditoria estrutural registrada em ${outputPath}`);
