# Matriz de isolamento multi-tenant

Atualizado em 26/08/2026 durante a revisão dos roteadores comerciais. Esta matriz registra o padrão observado nas mutações protegidas: autorização pela oficina, leitura da entidade-base com `tenantId`, validação de IDs relacionados no mesmo tenant e escrita com predicado de tenant.

| Domínio | Operações revisadas | Controle de tenant e IDs relacionados | Auditoria e testes existentes |
|---|---|---|---|
| Clientes e veículos | Criação de cliente e veículo; histórico por cliente ou veículo | A criação de veículo confirma o cliente no tenant; históricos validam a entidade-base antes dos joins. | `customer.pagination.integration.test.ts` e testes de histórico. |
| Catálogo | Categorias, fornecedores, produtos, serviços, composição e kits | Categoria, fornecedor, produto e serviço são consultados no tenant antes de associação, alteração ou composição. | Testes de auditoria, composição, precificação e isolamento financeiro do catálogo. |
| Estoque e compras | Ajuste, movimentação, pedido e recebimento | Saldo, produto, fornecedor, pedido e itens de compra são restringidos por tenant; recebimento mantém predicates por item, saldo e produto. | Testes de auditoria, previsão, paginação e pedidos de compra. |
| Solicitações e orçamentos | Atendimento, sugestão, criação, envio, desconto e decisão pública | Solicitação, orçamento, itens, responsável, serviço e reserva são consultados no tenant; fluxos públicos derivam o tenant do slug ou token seguro. | Testes de solicitações, aprovação, descontos, paginação, envio e visualização pública. |
| Agenda e Ordem de Serviço | Agendamento, status, checklist, anexos, notas e consumo | Orçamento aprovado, profissional, OS, checklist, reserva e produto são validados no tenant; técnico é limitado à OS atribuída. | Testes de agenda, checklist, consumo, finalização e busca operacional. |
| Financeiro e notificações | Receitas, despesas, preferências e leitura | Lançamentos e notificações filtram tenant e visibilidade do usuário; leitura usa atualização condicional por tenant. | Testes de despesas, paginação financeira e preferências de notificação. |
| Plataforma e equipe | Tenant, plano, vínculos, settings e branding | Super Admin valida tenant, usuário e plano; operações de equipe usam `tenantId` e preservam o proprietário primário. | Testes de gestão, planos, usuários, uso, relatórios e auditoria por tenant. |

## Critérios aplicados

As consultas internas exigem `getTenantAccess` ou `requireTenantPermission` antes do acesso comercial. As mutações que recebem IDs externos validam a entidade relacionável dentro do tenant antes de inserir ou atualizar o vínculo. Atualizações críticas combinam `tenantId` e estado persistido quando há risco de concorrência.

Eventos críticos usam `writeAuditLog` após a escrita confirmada. A auditoria registra estados anterior e posterior quando há alteração material e evita incluir conteúdo de notificações ou custos em fluxos que não precisam expô-los.

## Inventário de ações auditadas

| Domínio | Ações auditadas verificadas |
|---|---|
| Comercial | Solicitação atualizada, orçamento criado, enviado, visualizado, expirado, aprovado ou recusado por link público e descontos atualizados. |
| Operação | Agendamento criado a partir do orçamento, status de OS, checklist, consumo de produto, anexo de execução e apontamento técnico. |
| Estoque e compras | Ajuste de estoque, pedido criado e pedido recebido. |
| Financeiro | Receita recebida, despesa criada e despesa paga. |
| Catálogo | Criação e atualização financeira de produto/serviço, composição de serviço, kit, categorias e fornecedor. |
| Pessoas e configuração | Cliente, veículo, membro, preferências de notificação, branding e configurações da oficina. |
| Plataforma | Tenant, plano e vínculos globais de usuário. |

As ações materialmente mutáveis observadas nessas rotas possuem evento de auditoria correspondente. Operações de consulta, paginação e interface não geram evento por não alterarem dados de negócio.
