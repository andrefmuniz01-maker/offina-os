# Handoff — cutover funcional para Supabase

**Atualizado em 26 de agosto de 2026.** Este documento coordena as tarefas que trabalham no repositório `andrefmuniz01-maker/offina-os` após a adoção de Supabase como arquitetura-alvo.

## Estado confirmado

O projeto Supabase **OFFICINA OS** (`jpvvhowgpuinuuputoot`) está ativo em `sa-east-1`. As migrations de fundação, índices e RLS estão aplicadas. O commit `3c6a84b` adicionou e aplicou também o marcador administrativo `public.tenants.is_demo`, com valor padrão `false`, índice parcial e teste automatizado. O commit `fd9226f` aplicou as RPCs seguras de workspace; elas usam o JWT do Supabase Auth e não dependem do adaptador MySQL. O commit `a9466e3` converteu essas RPCs para `SECURITY INVOKER`, preservando RLS sem funções públicas de privilégio elevado. A revisão posterior confirmou que não restaram avisos para essas quatro funções.

A verificação de schema confirmou que `is_demo` é uma coluna `boolean`, obrigatória e com default `false`. A marcação não altera login, autorização, RLS, tenant isolation nem regras de negócio. O commit `7db5d3b` adicionou uma exceção de segurança explícita para o único tenant demonstrativo interno: quando `is_demo=true`, **somente Super Admins** podem lê-lo ou operá-lo. Esse bloqueio existe nas funções RLS, nos guardas de catálogo/estoque/compras e nas RPCs públicas, portanto a flag não constitui bypass nem pode expor o ambiente por associação de membro, URL ou formulário público. Após as migrations de catálogo, estoque e compras, o Security Advisor permanece com somente três avisos: as duas RPCs anônimas intencionais de catálogo/intake público e a **proteção contra senhas vazadas desativada** no Supabase Auth. As funções internas do catálogo, estoque e compras foram movidas ao schema `private`; o schema `public` contém apenas fachadas `SECURITY INVOKER` autenticadas.

## Estado do runtime

A base Supabase é a arquitetura-alvo, mas o runtime operacional ainda é híbrido. `server/_core/supabase.ts`, o cliente de autenticação e as migrations utilizam Supabase Auth/PostgreSQL/RLS. Os commits `eed2c34` e `b1fbcd7` expõem a identidade Supabase no contexto tRPC e fazem `auth.me` priorizá-la. O commit `2404bc6` adiciona uma camada de autorização Supabase com bloqueio explícito de elevação financeira para atendentes e técnicos. O commit `fd9226f` moveu a Home para as RPCs Supabase de listagem de workspace, criação de tenant, dashboard e notificações. O commit `1788d90` adicionou os namespaces `workspaceCatalog` e `workspaceInventory`: as telas de catálogo, categorias, itens por categoria, estoque e compras já usam o PostgreSQL. Os routers legados `catalog` e `inventory` continuam montados temporariamente para que comercial, orçamentos, operações e outros consumidores ainda não migrados não misturem IDs MySQL com registros Supabase.

> Não inserir a Performance Garage no Supabase até que pelo menos os caminhos de tenancy e os routers que a interface usa estejam migrados. Caso contrário, a aplicação atual não exibirá os dados criados no novo banco.

## Incrementos publicados nesta tarefa

| Commit | Conteúdo | Validação |
|---|---|---|
| `3c6a84b` | Marker `tenants.is_demo` no Supabase, índice parcial e teste. | Migração aplicada e coluna conferida no schema. |
| `548ec30` | Procedure administrativa vinculada ao `platform_role` Supabase. | Teste de regressão aprovado. |
| `eed2c34` | Identidade Supabase explícita no contexto tRPC. | Testes de contexto aprovados. |
| `b1fbcd7` | `auth.me` prioriza sessão Supabase. | Tipos e testes de login aprovados. |
| `2404bc6` | Camada Supabase de tenant access e bloqueio de escalada financeira. | Testes de permissões aprovados. |
| `fd9226f` | RPCs de workspace e Home conectada a Supabase. | Tipos, 71 arquivos/221 testes e build aprovados. |
| `5ee0f55` | Link da Home abre a solicitação pública real do tenant. | Tipos e testes de navegação aprovados. |
| `a9466e3` | RPCs de workspace convertidas para `SECURITY INVOKER`. | Advisor não aponta mais execução autenticada de função elevada. |
| `638d6d4` | Super Admin passa a iniciar pela Home Supabase durante a migração. | Evita o Painel de Plataforma ainda dependente de MySQL. |
| `24f3959` | Clientes e veículos migram para Supabase, com histórico e auditoria atômica. | Policies RLS e 72 arquivos/222 testes aprovados. |
| `7cf4506` | Catálogo público limitado e intake anônimo de solicitações no Supabase. | View com alerta crítico removida; funções anônimas permanecem intencionais e limitadas. |
| `b85528f` | Ajuste de estoque transacional migrado para Supabase. | Físico não pode cair abaixo do reservado; movimento e auditoria são atômicos. |
| `1788d90` | Catálogo, fornecedores, produtos, serviços, kits, estoque, previsão e compras migrados sob `workspaceCatalog`/`workspaceInventory`. | Migrations `0014`–`0016` aplicadas, ACLs diretas de tabelas sensíveis revogadas, Advisor sem novos avisos e 87 arquivos/261 testes aprovados. |
| `7db5d3b` | Oficina Demo interna `Performance Garage` provisionada no Supabase e tela `/demo-interna` exclusiva de Super Admin. | Tenant `performance-garage` ativo com `is_demo=true`, zero membros de tenant, 3 produtos/saldos, 2 serviços, 1 kit, 2 clientes/veículos e 1 compra; catálogo público bloqueado, reset incremental auditado e negação a perfil não administrativo confirmada. A simulação posterior confirmou cinco negações para usuário autenticado não administrativo e cinco permissões para Super Admin. |

## Sequência de implementação obrigatória

| Ordem | Incremento | Critério de saída |
|---|---|---|
| 1 | Migrar o contrato de usuário interno de `users.id` numérico para `profiles.id` UUID e substituir o fallback MySQL no `createContext`. | Sessão Supabase gera contexto autenticado sem consulta a `users` legada. |
| 2 | Migrar os endpoints remanescentes do Painel de Super Admin em `platform.ts`. | Planos, usuários, auditoria, relatórios e gestão global usam Supabase sob RLS. |
| 3 | Migrar os endpoints de tenant remanescentes em `tenantAccess.ts` e `platform.ts`. | Branding, configurações, equipe e auditoria interna usam Supabase e IDs UUID. |
| 4 | Migrar catálogo, fornecedores, produtos, serviços, kits, estoque e compras. | **Concluído para as telas de workspace.** As migrations `0014`–`0016` aplicaram RPCs auditadas, projeções sem custo para perfis restritos, previsão e recebimento com custo médio. Routers legados persistem como ponte, sem compartilhar o namespace Supabase. |
| 5 | Conectar o intake público e migrar a fila interna de solicitações, orçamentos e reserva de estoque em transações/RPCs adequadas. | Solicitação pública, sugestão, aprovação e reserva funcionam no PostgreSQL. O schema do intake já está aplicado; Storage e UI ainda precisam de migração. |
| 6 | Migrar agenda, OS, consumo e financeiro. | Fluxo operacional completo não depende de MySQL; a baixa de reserva/consumo precisa preservar `físico >= reservado`. |
| 7 | Migrar consumidores legados restantes e eliminar o adaptador MySQL. | Comercial, operações, plataforma, configurações e todos os routers usam Supabase sob RLS. |
| 8 | Implementar seed/reset da Performance Garage. | **Concluído para o escopo incremental.** Tenant interno Supabase-only, dados de catálogo/estoque/compras/clientes/veículos, reset auditado e interface exclusiva de Super Admin foram validados. Não semear ainda solicitações, orçamentos, reservas, agenda, OS, consumo ou financeiro. |

## Regras de segurança para as próximas tarefas

A migração não pode copiar senhas, tokens, e-mails pessoais ou dados reais ao Supabase. A demonstração interna não cria contas de tenant nem `tenant_members`; ela é acessada exclusivamente pelos Super Admins globais existentes. Se forem necessárias identidades demo futuramente, elas devem ser provisionadas pelo mecanismo administrativo de Auth com segredos fora do repositório e nunca podem receber acesso ao tenant `is_demo=true`. Todo novo endpoint precisa continuar filtrando `tenant_id` e respeitar as policies RLS; não usar `is_demo` como bypass de acesso. As funções públicas `public_get_workshop_catalog` e `public_submit_quote_request` usam `SECURITY DEFINER` por necessidade do fluxo sem login, mas aceitam apenas input validado, retornam dados comerciais limitados e não concedem `SELECT` anônimo às tabelas internas. Antes de liberar publicamente, acrescentar rate limit e migrar uploads para o bucket privado do Supabase; anexos não devem ser misturados ao Forge/S3 legado.

Para os anexos, criar bucket **privado** `quote-request-attachments`, limites de 5 MB e MIME explícito. O upload anônimo deve exigir um token de upload de uso curto, vinculado a uma única solicitação e validado por policy/RPC; acesso interno deve usar RLS com associação ao `tenant_id`, e arquivos de cliente nunca devem usar URLs públicas. A estratégia decorre da documentação de buckets privados e policies de objetos do Supabase.[1][2]

[1]: https://supabase.com/docs/guides/storage/buckets/fundamentals "Supabase Storage Buckets"
[2]: https://supabase.com/docs/guides/storage/security/access-control "Supabase Storage Access Control"

## Validações disponíveis

Com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` configurados apenas no ambiente local, a última linha de base aprovada foi:

```bash
pnpm check
pnpm test
pnpm build
```

Resultado integrado mais recente: **98 arquivos de teste aprovados, 1 ignorado e 291 testes aprovados**. A divisão de rotas não críticas reduziu o JavaScript inicial de **1.146.750 bytes para 740.140 bytes** (aproximadamente 35%); cada página não crítica passou a ser carregada sob demanda. Os placeholders de analytics foram removidos do HTML estático: o script somente é carregado após configuração pública HTTP(S) válida, eliminando os avisos de build e requisições inválidas quando analytics não está configurado. Permanece apenas o aviso de chunk inicial acima de 500 kB.
