# Project TODO

- [x] Migrar a base funcional do ZIP do OficinaOS para o projeto web gerenciado, preservando React, Express, tRPC, Drizzle e o domínio multi-tenant.
- [x] Criar um shell administrativo refinado com navegação para painel, solicitações, orçamentos, agenda, estoque e ordem de serviço.
- [x] Implementar um modo de demonstração navegável explicitamente identificado, sem criar ou persistir dados fictícios de clientes, avaliações ou operações.
- [x] Exibir separação visual por oficina ativa e papel de usuário, com opções de dono, atendente e técnico.
- [x] Implementar estados demonstráveis de carregamento, ausência de dados, erro e bloqueio de acesso para os módulos prioritários.
- [x] Conectar a prévia às estruturas reais de tenants, permissões e fluxos comerciais e operacionais do código migrado.
- [x] Preservar e testar a cadeia solicitação, orçamento, aprovação, reserva, agenda, ordem de serviço, consumo e financeiro.
- [x] Preparar checklist de validação em staging por papel, desktop e mobile, sem popular dados de produção.
- [x] Implementar o endpoint idempotente de varredura operacional em /api/scheduled/ para alertas internos de estoque crítico e follow-up sugerido.
- [ ] Preparar a configuração do job periódico após publicação, sem habilitar comunicações externas automáticas.
- [x] Adicionar ou atualizar testes Vitest para a experiência de demonstração, controle de acesso e rotina operacional.
- [x] Verificar tipos, testes, build, console e visualização responsiva antes da entrega.
- [ ] Reduzir o bundle inicial com divisão dinâmica de rotas antes da publicação comercial definitiva.
