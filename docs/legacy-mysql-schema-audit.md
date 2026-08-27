# Auditoria de schema legado MySQL

Gerado em **2026-08-27T01:51:24.987Z** pelo utilitário somente leitura pnpm schema:audit:legacy. O relatório usa exclusivamente INFORMATION_SCHEMA; não lê dados operacionais, não grava no banco e não registra credenciais.

| Indicador | Resultado |
|---|---:|
| Status da conexão | Conexão somente leitura concluída. |
| Tabelas declaradas pelo Drizzle | 39 |
| Tabelas encontradas no banco | 39 |
| Tabelas ausentes | 0 |
| Tabelas extras | 0 |
| Divergências de coluna | 0 |

## Limites da comparação

A classificação compara o tipo SQL declarado, incluindo comprimento, precisão e escala; normaliza apenas as equivalências intencionais boolean/tinyint(1), espaços e CURRENT_TIMESTAMP. Também confronta os defaults e expressões on-update disponíveis no Drizzle e no MySQL. A tabela técnica __drizzle_migrations é excluída por não representar uma entidade da aplicação. Collation, índices compostos, chaves estrangeiras e constraints continuam em uma auditoria própria antes de qualquer migration. O script é um inventário de risco; ele não altera a fonte MySQL nem afirma que uma divergência é segura para corrigir automaticamente.

## Tabelas ausentes no banco

Nenhuma.

## Tabelas extras no banco

Nenhuma.

## Divergências por coluna

| Tabela | Coluna | Categoria | Esperado no Drizzle | Encontrado no MySQL |
|---|---|---|---|---|
| — | — | Nenhuma | — | — |
