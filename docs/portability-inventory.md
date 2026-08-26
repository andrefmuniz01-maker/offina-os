# Inventário auditável de portabilidade

Este inventário relaciona tudo que é necessário para reconstruir o **código e a arquitetura** do OficinaOS em outro ambiente. Ele intencionalmente não exporta credenciais, senhas, sessões, objetos privados de Storage ou dados operacionais de produção.

| Camada | Artefato versionado | Configuração externa necessária | Como validar |
|---|---|---|---|
| Aplicação web | `client/`, `vite.config.ts`, `client/index.html` | Nenhuma além das variáveis públicas | `pnpm build` |
| API e contratos | `server/`, `shared/`, `server/routers.ts` | Porta HTTP e variáveis do ambiente | `pnpm test` e `pnpm check` |
| Dependências | `package.json`, `pnpm-lock.yaml`, `patches/` | Node 22+ e pnpm 10+ | `pnpm install --frozen-lockfile` |
| Ambiente | `docs/environment-reference.md` | Criar `.env.local` e cofre de segredos no destino | Revisar a tabela de variáveis |
| Banco legado | `drizzle/schema.ts`, `drizzle/migrations/`, `drizzle.config.ts` | `DATABASE_URL` de MySQL/TiDB; backup antes de qualquer migração | `pnpm db:push` somente em ambiente autorizado |
| Foundation Supabase | `supabase/migrations/20260826_0001_oficinaos_foundation.sql` | Projeto Supabase de destino | Aplicar a migration inicial |
| Índices de FK | `supabase/migrations/20260826_0002_foreign_key_indexes.sql` | Mesmo projeto Supabase | Aplicar depois da foundation |
| RLS de profiles | `supabase/migrations/20260826_0003_profile_rls_initplan.sql` | Mesmo projeto Supabase | Aplicar depois dos índices |
| Auth Supabase | `client/src/lib/supabase.ts`, `server/_core/supabase.ts`, `server/_core/context.ts` | Provider de e-mail ativo, autoinscrição desativada, política de senha e URLs reais | Login com identidade real e teste de rota protegida |
| Site e redirects | `docs/supabase-magic-link-configuration.md` | Site URL e Redirect URLs do domínio do destino, incluindo `/auth/callback` | Fluxo de recuperação de senha no domínio correto |
| Papéis e tenants | Foundation SQL, `server/tenantAccess.ts`, `docs/mysql-to-supabase-mapping.md` | Provisionar identidades reais e memberships de tenant por operação controlada | Testes de tenant, papel e RLS |
| Storage privado | Foundation SQL e `server/storage.ts` | Bucket `oficina-private` criado pela migration e credenciais do provedor | Teste com objeto prefixado por tenant |
| Scheduler | `server/scheduled.ts`, `server/_core/heartbeat.ts` | Credencial de serviço compatível antes de ativar jobs | Manter pausado até teste de serviço |
| APIs e integrações | `server/_core/`, `server/routers/`, `docs/repository-portability.md` | Conectores e segredos específicos do ambiente | Validar cada integração separadamente |
| Qualidade | `vitest.config.ts`, arquivos `*.test.ts`, `tsconfig.json` | Nenhuma | `pnpm test && pnpm check && pnpm build` |
| Deploy | `README.md`, `template.json`, `server/_core/index.ts` | Host Node compatível e segredo configurado fora do Git | `pnpm build && pnpm start` |

## Configurações manuais que não podem ser versionadas

| Sistema | Configuração manual | Motivo |
|---|---|---|
| Supabase Auth | Provider de e-mail, autoinscrição, política de senha, Site URL e Redirect URLs | Depende do domínio e do projeto de cada ambiente |
| Supabase Auth | Convites, usuários e promoção de Super Admin | São identidades reais e dados de acesso; não devem ser semeados via Git |
| MySQL/TiDB | URL de conexão, usuário, senha, SSL e backup | Credenciais e dados privados |
| Storage/S3 | Credenciais, política do provedor e objetos | Segredos e arquivos privados |
| Serviços externos | Tokens de e-mail, WhatsApp, pagamentos, Analytics, mapas e IA | Segredos e contratos por ambiente |
| Jobs | Credencial de serviço e agendamento do provedor | Não usar sessão humana ou segredo no frontend |

## Checagem automatizada

O comando abaixo confirma que os arquivos e documentos indicados neste inventário continuam presentes no repositório:

```bash
pnpm portability:check
```

Ele verifica apenas a completude de código e documentação. Não tenta validar credenciais, bancos remotos, usuários Auth, objetos Storage ou dados de produção.
