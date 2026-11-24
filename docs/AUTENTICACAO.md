# Autenticação (Supabase Auth) — como funciona e diagnóstico

## Fluxo
- Login: `signInWithPassword` em `client/src/components/DashboardLayout.tsx` (tela "Acesse sua oficina").
- Esqueci a senha / primeiro acesso / convite: `resetPasswordForEmail` (ou `inviteUserByEmail` no servidor).
  O e-mail leva a `https://DOMINIO/auth/callback#...type=recovery|invite`, onde `AuthCallback.tsx`
  pede a nova senha (`updateUser`).
- Sessão: o navegador manda `Authorization: Bearer <token>` ao tRPC; `server/_core/context.ts` valida o
  token no Supabase e confere o `profile` (e-mail e papel `super_admin`/`platform_user`).
- `lib/supabase.ts` captura o tipo/erro do link **antes** de iniciar o cliente (que apaga o `#...` da URL)
  e, se o link cair numa rota diferente de `/auth/callback`, encaminha para lá.

## Pré-requisitos no painel do Supabase
- Authentication → URL Configuration: *Site URL* = domínio de produção; *Redirect URLs* deve conter
  `https://DOMINIO/auth/callback` de **cada** domínio usado (Vercel, etc.). Se faltar, o Supabase ignora o
  `redirectTo` e usa o Site URL.
- Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (públicas, em `.env.production`) e
  `SUPABASE_SERVICE_ROLE_KEY` (segredo, só na Vercel).

## Incidente de 24/11/2026 — redefinição de senha e convites falhando (500)
Sintoma: "Primeiro acesso ou esqueceu a senha?" enviava o e-mail, mas o link voltava para a tela de login.

Causa (logs `auth_logs`): o serviço Auth do Supabase está numa versão mais nova que o esquema do banco.
- `Database error creating recovery token: column "expires_at" of relation "one_time_tokens" does not exist`
- `error finding one time token: column one_time_tokens.expires_at does not exist`
- `auth.schema_migrations` termina em `20260625000000`; a migração oficial `20260831180000`
  (`alter table auth.one_time_tokens add column if not exists expires_at timestamptz;`) não foi aplicada.
- O papel `postgres` não é dono de `auth.one_time_tokens` (`42501 must be owner`), então a correção não pode ser
  feita por SQL do projeto: o próprio Supabase precisa aplicar as migrações pendentes do Auth.

Efeito: reset de senha, convite por e-mail (Super Admin e Equipe) e magic link ficam fora do ar; o login com
senha continua funcionando (não usa essa tabela).

Correção: no painel do Supabase, Project Settings → General → **Restart project** (o Auth aplica migrações ao
subir). Se persistir, abrir chamado no suporte do Supabase citando os erros acima e o ref `jpvvhowgpuinuuputoot`.
Depois, testar "esqueci a senha" e conferir em `auth_logs` que não há mais erro 500.

Também apareceram `invalid_credentials` repetidos vindos de `oficinaos-zu7j2buy.manus.space` (site antigo da
Manus): a senha digitada não confere com a cadastrada.
