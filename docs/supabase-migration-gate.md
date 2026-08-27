# Marco de decisão pré-migração — Supabase

**Registrado em 26 de agosto de 2026.** Este documento bloqueia novas alterações estruturais de autenticação, banco, RLS, Storage ou integração Supabase até decisão explícita do responsável pelo produto.

## Estado observado

O repositório atual utiliza Manus OAuth, sessão JWT da aplicação, Drizzle com dialeto MySQL e Forge/S3 para arquivos. O projeto Supabase `OFFICINA OS` está ativo, mas não possui tabelas de domínio em `public`, migrations de produto, usuários de aplicação, policies de negócio, buckets configurados ou integração do código-fonte.

## Correção aplicada antes deste marco

Durante a inspeção do Supabase, foi identificada a função interna `public.rls_auto_enable()` com `SECURITY DEFINER` e privilégio de execução herdado pelos papéis de API. Foram aplicadas as migrations `revoke_public_execution_rls_auto_enable` e `revoke_public_role_rls_auto_enable`; a verificação posterior confirmou que `anon` e `authenticated` não conseguem mais executar a função. Essa correção pontual não criou tabelas de negócio, dados, telas ou fluxos.

## Riscos e incompatibilidades que impedem a migração imediata

1. O código e as migrations atuais são MySQL, enquanto Supabase usa PostgreSQL.
2. A identidade atual é baseada em `openId`/Manus OAuth, enquanto a arquitetura-alvo deve se vincular a `auth.users` com UUID.
3. O isolamento atual é feito no backend; não há RLS por tenant no Supabase.
4. O armazenamento atual é Forge/S3, sem buckets e policies Supabase.
5. O banco Supabase não possui o domínio de oficinas, dados históricos ou migrations da aplicação.

## Próxima decisão necessária

Nenhuma migração adicional será executada até autorização explícita para iniciar um plano de corte que inclua: backup e mapeamento do MySQL, schema PostgreSQL, estratégia de IDs, Supabase Auth, RLS, Storage, testes Tenant A × Tenant B, staging e rollback.
