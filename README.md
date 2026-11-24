# OficinaOS

O **OficinaOS** é um SaaS B2B multi-tenant para a operação comercial, operacional, de estoque e financeira de oficinas automotivas. Este repositório reúne o código React/Vite, a API Express/tRPC, o schema legado MySQL/Drizzle, as migrations PostgreSQL/Supabase, testes e documentação de arquitetura.

> **Segurança:** este repositório é privado, mas não contém senhas, tokens, chaves privadas, sessão de usuários ou dados operacionais reais. Configure cada ambiente por variáveis de ambiente e pelo painel seguro dos provedores.

## Estado da arquitetura

| Camada | Tecnologia atual | Estado |
|---|---|---|
| Interface | React 19, Vite, Tailwind e tRPC React Query | Versionada e testada |
| API | Express 4 e tRPC 11 | Versionada e testada |
| Identidade humana | Supabase Auth por e-mail e senha | Em transição; primeiro acesso real ainda requer recuperação de senha |
| Autorização | `auth.users → profiles → papel global`; bridge de domínio temporária em MySQL | Proteções de contexto implementadas; corte integral ainda pendente |
| Dados de domínio | MySQL/TiDB com Drizzle | Preservados; nenhum dado real é exportado por este repositório |
| Foundation futura | Supabase PostgreSQL com RLS e Storage privado | Migrations versionadas em `supabase/migrations/` |

## Inicialização local

Primeiro, instale o Node.js 22+ e o pnpm 10+. Crie um arquivo `.env.local` seguindo a [referência de ambiente](docs/environment-reference.md) e preencha somente os valores do seu ambiente seguro.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm dev
```

O ambiente de desenvolvimento inicia a API e a interface em conjunto. Para gerar o pacote de produção, execute `pnpm build`; para executá-lo, use `pnpm start`. A porta é controlada por `PORT` e não deve ser fixada no código.

## Banco de dados e migrations

O repositório preserva duas trilhas de dados deliberadamente separadas durante a migração. Não execute comandos de banco contra produção sem backup e aprovação de corte.

| Finalidade | Localização | Comando ou operação |
|---|---|---|
| Schema legado de domínio | `drizzle/schema.ts` | Revisar o schema antes de usar Drizzle contra um MySQL/TiDB provisionado |
| Migrations legadas | `drizzle/migrations/` | `pnpm db:push` somente após configurar `DATABASE_URL` e validar backup |
| Foundation Supabase | `supabase/migrations/` | Aplicar em ordem cronológica pelo Supabase CLI ou SQL Editor, em um projeto Supabase seguro |
| Índices e políticas RLS | `supabase/migrations/20260826_0002_*` e `20260826_0003_*` | Aplicar depois da foundation |

As migrations do Supabase criam a estrutura, políticas RLS e bucket privado; elas **não incluem dados de clientes, oficinas, credenciais ou arquivos de produção**. A ligação completa dos routers de domínio ao PostgreSQL/Supabase é um trabalho de corte posterior e está documentada em `docs/mysql-to-supabase-mapping.md`.

## Supabase Auth

O cliente usa apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca exponha uma `service_role`, segredo de provider OAuth ou senha no cliente. No painel Supabase do ambiente de destino, mantenha o provider de e-mail ativo, a autoinscrição pública desativada e as URLs de Site/Redirect alinhadas ao domínio real.

O primeiro acesso administrativo é concedido por convite controlado. Depois da definição de senha por fluxo de recuperação, o login recorrente é feito por e-mail e senha. Papéis globais só podem ser alterados por operação administrativa controlada; a interface não deve aceitar alteração própria de tenant, papel ou permissões.

## APIs e módulos

As chamadas do aplicativo são expostas por tRPC sob `/api/trpc`. Os contratos e regras ficam em `server/routers/`; os procedimentos protegidos recebem o contexto autenticado de `server/_core/context.ts`. O ponto de partida para integrações de domínio é `server/routers.ts`.

| Área | Código principal |
|---|---|
| Sessão Supabase e contexto | `client/src/lib/supabase.ts`, `server/_core/supabase.ts`, `server/_core/context.ts` |
| Autorização de tenant | `server/tenantAccess.ts` |
| Operações e ordens de serviço | `server/routers/operations*` |
| Orçamentos e solicitações | `server/routers/quotes*`, `server/routers/quote-requests*` |
| Estoque e compras | `server/routers/inventory*` |
| Financeiro | `server/routers/management.ts` |
| Plataforma/Super Admin | `server/routers/platform*`, `client/src/pages/Platform.tsx` |

## Qualidade e publicação

Antes de escolher um provedor ou publicar o serviço, leia o [handoff para produção](docs/production-handoff.md), que reúne ambiente, Supabase, secrets, smoke tests, limitações atuais e rollback.

Execute os três comandos abaixo antes de qualquer publicação ou merge:

```bash
pnpm test
pnpm check
pnpm build
```

O repositório também inclui `todo.md`, que registra o estado das entregas e pendências. Mudanças de autenticação, RLS, tenants, papéis, planos, jobs ou integrações devem atualizar testes e documentação antes do deploy.

## Documentação complementar

Leia `docs/repository-portability.md` para o roteiro de continuidade e `docs/environment-reference.md` para a configuração do ambiente. Os documentos de migração e decisões de segurança ficam em `docs/`; a foundation versionada está em `supabase/migrations/`.

## Deploy na Vercel

O projeto é um servidor Express único (API tRPC + front Vite). Na Vercel ele é publicado
como **front estático + função serverless da API**, gerados por `pnpm build:vercel`
(`scripts/build-vercel.mjs`, configurado em `vercel.json`). Não altere o *Output Directory*
nem o *Framework Preset* no painel da Vercel: o `vercel.json` já define tudo.

Variáveis de ambiente obrigatórias (Project Settings → Environment Variables → Production):

| Variável | Uso |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase (embutida no front no build) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publishable/anon (embutida no front no build) |
| `SUPABASE_SERVICE_ROLE_KEY` | chave administrativa, **somente servidor** (convites, intake público) |
| `NODE_ENV` | `production` |

`VITE_*` são lidas no build: ao alterá-las, faça um novo deploy. O build falha de propósito,
com mensagem clara, se `VITE_SUPABASE_URL` ou `VITE_SUPABASE_PUBLISHABLE_KEY` estiverem ausentes.
No Supabase, em Authentication → URL Configuration, cadastre o domínio da Vercel como *Site URL*
e em *Redirect URLs* (`https://SEU-DOMINIO/auth/callback`) para o e-mail de convite funcionar.
