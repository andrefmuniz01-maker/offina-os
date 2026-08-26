# Evidências de permissão por papel

Esta revisão não cria membros, sessões ou dados adicionais no tenant Ruidão Performance. As evidências abaixo usam os testes de integração tRPC existentes, que exercitam os papéis e permissões no servidor, onde a autorização é efetivamente aplicada.

| Papel | Fluxo principal verificado | Evidência |
|---|---|---|
| Dono / administrador | Configurações da oficina, membros, planos e decisões financeiras | `tenant-settings.integration.test.ts`, `platform.management.integration.test.ts` e `quote.discounts.integration.test.ts`. |
| Atendente | Consulta comercial e acesso sem visualização financeira | `dashboard.permissions.integration.test.ts`, `customer.pagination.integration.test.ts` e `dashboard.financial-visibility.integration.test.ts`. |
| Técnico | Consumo e execução da OS somente com permissão de execução e escopo da ordem atribuída | `operations.consume.integration.test.ts`, `operations.checklist.integration.test.ts` e `operations.finalization.integration.test.ts`. |

## Limitação de validação visual

O tenant real possui somente a sessão administrativa atual. Para não introduzir membros ou dados fictícios de produção, a validação de interface foi executada com a sessão administrativa e a validação por papel permanece comprovada no servidor por testes de integração. Quando houver contas reais de atendente e técnico, a mesma matriz deve ser repetida em desktop e mobile com as respectivas sessões.
