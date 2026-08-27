# Auditoria estrutural do MySQL legado

Gerado em **2026-08-27T01:51:26.979Z**. Esta verificação consulta apenas INFORMATION_SCHEMA e não lê tabelas operacionais, não grava no banco e não registra credenciais.

| Indicador | Resultado |
|---|---:|
| Índices declarados pelo Drizzle | 106 |
| Índices encontrados no MySQL | 153 |
| Chaves estrangeiras declaradas pelo Drizzle | 108 |
| Chaves estrangeiras encontradas no MySQL | 108 |
| Status da consulta de índices | Conexão somente leitura concluída. |
| Status da consulta de chaves estrangeiras | Conexão somente leitura concluída. |
| Índices primários/únicos ausentes | 0 |
| Índices de consulta declarados e ausentes | 42 |
| Chaves estrangeiras funcionalmente ausentes | 0 |
| Itens que exigem revisão | 42 |

## Critério de comparação

Os índices são comparados por tabela, ordem das colunas e unicidade; diferença de nome é registrada separadamente como compatível em comportamento. Índices não únicos que o InnoDB cria apenas para suportar uma chave estrangeira são excluídos exclusivamente da lista de adicionais; eles nunca ocultam um índice de consulta declarado e ausente. As chaves estrangeiras são comparadas por colunas locais, tabela/colunas referenciadas e regras de atualização/remoção; diferença de nome também é registrada separadamente. A equivalência intencional de regra omitida no Drizzle para RESTRICT e de NO ACTION para RESTRICT no InnoDB é normalizada [1]. Collation, checks e particionamento permanecem fora deste escopo e não devem ser alterados sem revisão humana.

> Nenhuma migration é executada por este utilitário. Um índice de consulta ausente é uma divergência a ser priorizada e revisada, não uma autorização para alteração automática na fonte MySQL.

## Índices ausentes ou funcionalmente divergentes

| Situação | Tabela | Nome | Esperado | Encontrado |
|---|---|---|---|---|
| Ausente | appointments | appointments_tenant_start_idx | index; tenantId,scheduledStart; não único | — |
| Ausente | appointments | appointments_tenant_status_idx | index; tenantId,status; não único | — |
| Ausente | attachments | attachments_tenant_request_idx | index; tenantId,quoteRequestId; não único | — |
| Ausente | attachments | attachments_tenant_quote_idx | index; tenantId,quoteId; não único | — |
| Ausente | attachments | attachments_tenant_work_order_idx | index; tenantId,workOrderId; não único | — |
| Ausente | audit_logs | audit_logs_tenant_entity_idx | index; tenantId,entityType,entityId; não único | — |
| Ausente | audit_logs | audit_logs_actor_date_idx | index; actorUserId,createdAt; não único | — |
| Ausente | customers | customers_tenant_name_idx | index; tenantId,name; não único | — |
| Ausente | customers | customers_tenant_phone_idx | index; tenantId,whatsapp; não único | — |
| Ausente | expenses | expenses_tenant_status_date_idx | index; tenantId,status,expenseDate; não único | — |
| Ausente | inventory_balances | inventory_balances_tenant_idx | index; tenantId; não único | — |
| Ausente | inventory_movements | inventory_movements_tenant_product_date_idx | index; tenantId,productId,createdAt; não único | — |
| Ausente | inventory_reservations | inventory_reservations_tenant_product_idx | index; tenantId,productId; não único | — |
| Ausente | inventory_reservations | inventory_reservations_tenant_quote_idx | index; tenantId,quoteId; não único | — |
| Ausente | kit_items | kit_items_tenant_kit_idx | index; tenantId,kitId; não único | — |
| Ausente | kits | kits_tenant_name_idx | index; tenantId,name; não único | — |
| Ausente | notifications | notifications_tenant_user_read_idx | index; tenantId,userId,readAt; não único | — |
| Ausente | notifications | notifications_tenant_customer_idx | index; tenantId,customerId; não único | — |
| Ausente | notifications | notifications_tenant_vehicle_idx | index; tenantId,vehicleId; não único | — |
| Ausente | products | products_tenant_name_idx | index; tenantId,name; não único | — |
| Ausente | products | products_tenant_category_idx | index; tenantId,categoryId; não único | — |
| Ausente | purchase_order_items | purchase_order_items_tenant_order_idx | index; tenantId,purchaseOrderId; não único | — |
| Ausente | purchase_orders | purchase_orders_tenant_status_idx | index; tenantId,status; não único | — |
| Ausente | quote_events | quote_events_tenant_quote_idx | index; tenantId,quoteId; não único | — |
| Ausente | quote_items | quote_items_tenant_quote_idx | index; tenantId,quoteId; não único | — |
| Ausente | quote_request_events | quote_request_events_tenant_request_idx | index; tenantId,quoteRequestId; não único | — |
| Ausente | quote_requests | quote_requests_tenant_status_idx | index; tenantId,status; não único | — |
| Ausente | quotes | quotes_tenant_status_idx | index; tenantId,status; não único | — |
| Ausente | revenues | revenues_tenant_status_date_idx | index; tenantId,status,receivedAt; não único | — |
| Ausente | scheduled_tasks | scheduled_tasks_uid_idx | index; scheduleCronTaskUid; não único | — |
| Ausente | service_products | service_products_tenant_service_idx | index; tenantId,serviceId; não único | — |
| Ausente | services | services_tenant_name_idx | index; tenantId,name; não único | — |
| Ausente | services | services_tenant_category_idx | index; tenantId,categoryId; não único | — |
| Ausente | suppliers | suppliers_tenant_name_idx | index; tenantId,name; não único | — |
| Ausente | tenants | tenants_status_idx | index; status; não único | — |
| Ausente | vehicles | vehicles_tenant_customer_idx | index; tenantId,customerId; não único | — |
| Ausente | vehicles | vehicles_tenant_plate_idx | index; tenantId,plate; não único | — |
| Ausente | work_order_checklists | work_order_checklists_tenant_order_idx | index; tenantId,workOrderId; não único | — |
| Ausente | work_order_consumption | work_order_consumption_tenant_order_idx | index; tenantId,workOrderId; não único | — |
| Ausente | work_order_items | work_order_items_tenant_order_idx | index; tenantId,workOrderId; não único | — |
| Ausente | work_order_notes | work_order_notes_tenant_order_idx | index; tenantId,workOrderId; não único | — |
| Ausente | work_orders | work_orders_tenant_status_idx | index; tenantId,status; não único | — |

## Índices adicionais para revisão

| Tabela | Nome | Colunas | Unicidade |
|---|---|---|---|
| Nenhum | — | — | — |

## Diferenças de nome de índice sem impacto funcional

| Tabela | Nome declarado no Drizzle | Nome existente no MySQL | Cobertura |
|---|---|---|---|
| tenant_members | tenant_members_user_idx | tenant_members_userId_users_id_fk | userId; não único |

## Chaves estrangeiras ausentes ou funcionalmente divergentes

| Situação | Tabela | Nome | Esperado | Encontrado |
|---|---|---|---|---|
| Nenhuma | — | — | — | — |

## Chaves estrangeiras adicionais para revisão

| Tabela | Nome | Relacionamento |
|---|---|---|
| Nenhuma | — | — |

## Diferenças de nome de chave estrangeira sem impacto funcional

| Tabela | Nome inferido pelo Drizzle | Nome existente no MySQL | Relacionamento |
|---|---|---|---|
| work_order_consumption | work_order_consumption_reservationId_inventory_reservations_id_fk | wo_consumption_reservation_fk | reservationId → inventory_reservations.id |
| work_order_consumption | work_order_consumption_consumedByUserId_users_id_fk | wo_consumption_user_fk | consumedByUserId → users.id |

## Referências

[1]: https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html "MySQL 8.4 Reference Manual — FOREIGN KEY Constraints"
