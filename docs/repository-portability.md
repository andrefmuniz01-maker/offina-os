# Guia de portabilidade do repositório

Este documento permite continuar o desenvolvimento do OficinaOS em outro computador, provedor ou equipe, sem transportar credenciais ou dados reais.

## Conteúdo que deve acompanhar o código

| Item | Está no repositório | Observação |
|---|---|---|
| Aplicação cliente e API | Sim | Pastas `client/`, `server/` e `shared/` |
| Dependências reproduzíveis | Sim | `package.json` e `pnpm-lock.yaml` |
| Testes e configuração | Sim | `vitest.config.ts`, `tsconfig.json` e arquivos `*.test.ts` |
| Schema MySQL/Drizzle | Sim | `drizzle/schema.ts` e migrations legadas |
| Foundation Supabase, RLS e Storage | Sim | `supabase/migrations/` |
| Documentação de decisões | Sim | Pasta `docs/` |
| Credenciais e dados de produção | Não | Devem ser configurados no destino, nunca copiados para Git |

## Configuração do novo ambiente

Crie um arquivo `.env.local` usando a lista segura em `docs/environment-reference.md`. A aplicação precisa de uma URL de banco MySQL/TiDB enquanto os routers de domínio ainda usam Drizzle. Para autenticação, configure um projeto Supabase e informe apenas a URL pública e a Publishable Key no cliente.

O segredo administrativo do Supabase, segredos OAuth, tokens de integração e quaisquer senhas devem permanecer exclusivamente em um cofre de segredos do provedor. Eles não são necessários para clonar, compilar ou testar a maior parte do repositório.

## Ordem segura para configurar o Supabase

1. Crie ou selecione um projeto Supabase no ambiente de destino.
2. Aplique as migrations de `supabase/migrations/` em ordem cronológica.
3. Verifique RLS, políticas e o bucket privado criados pelas migrations.
4. Configure Site URL e Redirect URLs do domínio do novo ambiente.
5. Ative o provider de e-mail, mantenha autoinscrição pública desativada e defina a política de senha adequada.
6. Provisione identidades administrativas reais por convite e só então conceda `super_admin` por operação controlada.

> Não use UUID inventado, e não use o frontend para atribuir tenant, papel ou permissão.

## Estado de migração e limitações importantes

O Supabase já contém a foundation de dados multi-tenant com `profiles`, `tenant_members`, RLS e Storage privado. O código de domínio, porém, ainda utiliza MySQL/Drizzle durante a transição. O contexto de sessão valida um token Supabase e exige correspondência por ID/e-mail com o profile antes de usar a ponte temporária por e-mail.

Antes de um corte integral, preserve o banco MySQL, execute reconciliação de dados e valide isolamento Tenant A × Tenant B, acesso financeiro, manipulação de papel/tenant e rollback. Não trate a existência das migrations como prova de que a migração operacional está concluída.

## Regras para integrações e APIs

As APIs internas usam tRPC; não há contrato REST paralelo obrigatório. Integrações com IA, mapas, notificações, Storage ou automações dependem do provedor que hospedar o projeto. Ao migrar de ambiente, avalie cada integração e configure as respectivas variáveis de ambiente ou conectores no novo provedor.

O scheduler legado está pausado até receber uma credencial de serviço compatível com a arquitetura Supabase. Não reative jobs com uma sessão humana, cookie antigo ou segredo exposto no cliente.

## Verificação antes de continuar desenvolvimento

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm build
```

Depois, valide manualmente o login com uma identidade real, o logout, a proteção de `/platform`, uma operação de tenant sem membership e o bloqueio de um técnico em ação financeira. Registre qualquer diferença entre o novo ambiente e esta arquitetura antes de criar dados de domínio.
