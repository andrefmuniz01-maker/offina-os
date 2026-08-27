# Handoff — cutover funcional para Supabase

**Atualizado em 26 de agosto de 2026.** Este documento coordena as tarefas que trabalham no repositório `andrefmuniz01-maker/offina-os` após a adoção de Supabase como arquitetura-alvo.

## Estado confirmado

O projeto Supabase **OFFICINA OS** (`jpvvhowgpuinuuputoot`) está ativo em `sa-east-1`. As migrations de fundação, índices e RLS estão aplicadas. O commit `3c6a84b` adicionou e aplicou também o marcador administrativo `public.tenants.is_demo`, com valor padrão `false`, índice parcial e teste automatizado. O commit `fd9226f` aplicou as RPCs seguras de workspace; elas usam o JWT do Supabase Auth e não dependem do adaptador MySQL.

A verificação de schema confirmou que `is_demo` é uma coluna `boolean`, obrigatória e com default `false`. A marcação não altera login, autorização, RLS, tenant isolation nem regras de negócio. O Security Advisor apresentou somente o aviso independente de **proteção contra senhas vazadas desativada** no Supabase Auth; esse controle deve ser habilitado pela administração do projeto antes do lançamento.

## Estado do runtime

A base Supabase é a arquitetura-alvo, mas o runtime operacional ainda é híbrido. `server/_core/supabase.ts`, o cliente de autenticação e as migrations utilizam Supabase Auth/PostgreSQL/RLS. Os commits `eed2c34` e `b1fbcd7` expõem a identidade Supabase no contexto tRPC e fazem `auth.me` priorizá-la. O commit `2404bc6` adiciona uma camada de autorização Supabase com bloqueio explícito de elevação financeira para atendentes e técnicos. O commit `fd9226f` moveu a Home para as RPCs Supabase de listagem de workspace, criação de tenant, dashboard e notificações. Contudo, `server/db.ts`, `server/tenantAccess.ts` e os routers de catálogo, estoque, comercial, operações, financeiro e plataforma ainda consultam o MySQL via Drizzle e IDs numéricos legados.

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

## Sequência de implementação obrigatória

| Ordem | Incremento | Critério de saída |
|---|---|---|
| 1 | Migrar o contrato de usuário interno de `users.id` numérico para `profiles.id` UUID e substituir o fallback MySQL no `createContext`. | Sessão Supabase gera contexto autenticado sem consulta a `users` legada. |
| 2 | Migrar tenancy e permissões em `tenantAccess.ts` e `platform.ts`. | Membership, papel e Super Admin são resolvidos em `profiles`, `tenants` e `tenant_members` sob RLS. |
| 3 | Migrar catálogo, clientes e veículos. | A aplicação lê e grava estes módulos em Supabase, com testes Tenant A × Tenant B. |
| 4 | Migrar solicitações, orçamentos e reserva de estoque em transações/RPCs adequadas. | Solicitação pública, sugestão, aprovação e reserva funcionam no PostgreSQL. |
| 5 | Migrar agenda, OS, consumo, compras e financeiro. | Fluxo operacional completo não depende de MySQL. |
| 6 | Implementar seed/reset da Performance Garage. | Dados demonstrativos, reset auditado e isolamento podem ser testados no Supabase. |
| 7 | Remover adaptador MySQL, dependências Drizzle/MySQL e credenciais legadas somente após cobertura E2E e rollback validado. | Não restam queries de domínio contra MySQL. |

## Regras de segurança para as próximas tarefas

A migração não pode copiar senhas, tokens, e-mails pessoais ou dados reais ao Supabase. Contas de demonstração devem ser provisionadas pelo mecanismo administrativo de Auth com segredos fora do repositório. Todo novo endpoint precisa continuar filtrando `tenant_id` e respeitar as policies RLS; não usar `is_demo` como bypass de acesso. Mutações transacionais de orçamento, reserva e consumo devem ser preferencialmente implementadas por funções PostgreSQL com `SECURITY DEFINER` restrito, `search_path` fixo e permissões revogadas de `anon`/`authenticated` quando necessário.

## Validações disponíveis

Com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` configurados apenas no ambiente local, a última linha de base aprovada foi:

```bash
pnpm check
pnpm test
pnpm build
```

Resultado: **68 arquivos de teste e 216 testes aprovados**. O build ainda mostra avisos preexistentes de placeholders de analytics e bundle de cliente acima de 500 kB.
