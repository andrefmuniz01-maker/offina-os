# Priorização de índices de consulta do MySQL legado

**Status:** revisão concluída em 27 de agosto de 2026. Este documento não executa DDL, não lê linhas operacionais, não altera o MySQL e não autoriza a criação automática de índices.

## Base de decisão

O auditor estrutural versionado encontrou **42** índices de consulta declarados no Drizzle e ausentes no MySQL legado, sem divergências de colunas, tipos, defaults, chaves primárias, índices únicos ou chaves estrangeiras funcionais. O número atual de 42 substitui a referência histórica de 43 no backlog; a fonte de verdade é o relatório gerado em [legacy-mysql-constraints-audit.md](legacy-mysql-constraints-audit.md).

Os níveis abaixo expressam a importância dos **fluxos consumidores no código**, e não uma prova de ganho de desempenho. Antes de qualquer alteração, o MySQL recomenda usar `EXPLAIN` para verificar o plano da consulta e orientar a necessidade de índice.[1]

| Prioridade | Índices | Fluxo afetado | Decisão |
|---|---:|---|---|
| P0 — validar primeiro | 13 | Intake público, fila comercial, agenda/pátio, estoque reservado e OS | Rodar `EXPLAIN` em consultas representativas antes de qualquer DDL. |
| P1 — revisar após P0 | 16 | Detalhes de orçamento/OS, anexos e compras | Verificar apenas se o caminho legado continuar ativo após a migração Supabase. |
| P2 — melhoria administrativa | 9 | Busca, notificações, custos/receitas, kits e fornecedores | Manter em backlog; não priorizar sem evidência de volume ou lentidão. |
| P3 — baixa urgência | 4 | Auditoria, tarefas técnicas e listagem de tenants | Não aplicar durante o cutover; reavaliar após remover consumidores legados. |

## P0 — caminhos operacionais e comerciais

| Tabela | Índice declarado ausente | Justificativa observada | Verificação obrigatória |
|---|---|---|---|
| appointments | `appointments_tenant_start_idx`, `appointments_tenant_status_idx` | Agenda e pátio filtram a oficina, período e estado de atendimento. | `EXPLAIN` por data e status, incluindo ordenação real. |
| customers | `customers_tenant_phone_idx` | O intake público procura cliente por tenant e WhatsApp normalizado antes de inserir. | `EXPLAIN` da deduplicação de contato. |
| inventory_balances | `inventory_balances_tenant_idx` | Saldo disponível alimenta decisão de estoque e orçamento. | `EXPLAIN` de leitura por produto/tenant. |
| inventory_movements | `inventory_movements_tenant_product_date_idx` | Histórico de movimentação é consultado por tenant, produto e data. | `EXPLAIN` com janela temporal usada pela interface. |
| inventory_reservations | `inventory_reservations_tenant_product_idx`, `inventory_reservations_tenant_quote_idx` | Aprovação de orçamento e consumo dependem de reservas corretas. | `EXPLAIN` do cálculo de disponível e transição de reserva. |
| quote_requests | `quote_requests_tenant_status_idx` | A fila comercial filtra tenant e status, ordenando por criação. | `EXPLAIN` da listagem paginada e confirmar se a ordenação pede cobertura adicional. |
| quotes | `quotes_tenant_status_idx` | A lista de orçamentos filtra tenant/status e tem transições concorrentes. | `EXPLAIN` da lista paginada e das atualizações condicionais. |
| service_products | `service_products_tenant_service_idx` | A sugestão de orçamento expande o serviço em produtos do tenant. | `EXPLAIN` da montagem de sugestão e disponibilidade. |
| vehicles | `vehicles_tenant_customer_idx`, `vehicles_tenant_plate_idx` | Intake e histórico localizam veículo por cliente ou placa dentro do tenant. | `EXPLAIN` das duas formas de busca. |
| work_orders | `work_orders_tenant_status_idx` | Kanban/pátio operacional depende de estado por oficina. | `EXPLAIN` da coluna do pátio e da agenda atribuída. |

## P1 — detalhes e fluxos de apoio

| Grupo | Índices declarados ausentes | Regra de priorização |
|---|---|---|
| Anexos | `attachments_tenant_request_idx`, `attachments_tenant_quote_idx`, `attachments_tenant_work_order_idx` | Implementar somente após o intake abandonar o Storage legado e o acesso interno de anexos existir no Supabase. |
| Catálogo e compras | `products_tenant_name_idx`, `products_tenant_category_idx`, `purchase_order_items_tenant_order_idx`, `purchase_orders_tenant_status_idx`, `services_tenant_name_idx`, `services_tenant_category_idx` | As telas de workspace já têm caminho Supabase; não ampliar o legado sem comprovar consumidor remanescente. |
| Linhas e eventos de orçamento | `quote_events_tenant_quote_idx`, `quote_items_tenant_quote_idx`, `quote_request_events_tenant_request_idx` | Revisar se o histórico detalhado for lento na fonte legada durante a transição. |
| OS detalhada | `work_order_checklists_tenant_order_idx`, `work_order_consumption_tenant_order_idx`, `work_order_items_tenant_order_idx`, `work_order_notes_tenant_order_idx` | Validar junto da migração de OS/consumo; não criar índices isolados antes dela. |

## P2 e P3 — manter observação

| Nível | Índices declarados ausentes |
|---|---|
| P2 | `customers_tenant_name_idx`, `expenses_tenant_status_date_idx`, `kit_items_tenant_kit_idx`, `kits_tenant_name_idx`, `notifications_tenant_user_read_idx`, `notifications_tenant_customer_idx`, `notifications_tenant_vehicle_idx`, `revenues_tenant_status_date_idx`, `suppliers_tenant_name_idx` |
| P3 | `audit_logs_tenant_entity_idx`, `audit_logs_actor_date_idx`, `scheduled_tasks_uid_idx`, `tenants_status_idx` |

## Gate obrigatório antes de DDL

1. Confirmar que o índice ainda atende a um consumidor MySQL ativo e não foi substituído por RPC/tabela Supabase.
2. Coletar apenas metadados de volume e executar `EXPLAIN` para a consulta exata, com filtros e ordenação reais.
3. Registrar o plano anterior e a hipótese de melhoria; escolher uma janela de mudança e plano de rollback aprovado.
4. Aplicar no máximo um grupo de índices por migration revisada, reexecutar o auditor e medir o plano posterior.

> Ausência no Drizzle não prova degradação, e presença no Drizzle não justifica DDL na fonte legada. O objetivo é preservar estabilidade enquanto o corte para Supabase elimina gradualmente esses consumidores.

## Referências

[1]: https://dev.mysql.com/doc/refman/8.4/en/explain.html "MySQL 8.4 Reference Manual — EXPLAIN Statement"
