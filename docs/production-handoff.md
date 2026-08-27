# Handoff para produção — OficinaOS

**Objetivo:** permitir que uma tarefa posterior publique o OficinaOS com segurança, sem depender de conhecimento perdido no contexto atual.  
**Estado de referência:** commit `5b91071` e commits remotos posteriores integrados em `main`.  
**Repositório:** `https://github.com/andrefmuniz01-maker/offina-os`

## 1. Resumo executivo

O repositório contém uma aplicação full-stack com React/Vite/Tailwind no cliente, Express/tRPC no servidor, Supabase Auth/PostgreSQL/RLS como arquitetura-alvo e uma ponte MySQL/TiDB ainda ativa para partes do domínio. O código visual mais recente já está na branch `main`. Esta documentação **não escolhe um provedor de hospedagem**; a tarefa de produção deve escolher o destino e configurar as variáveis no cofre desse provedor.

A aplicação não deve ser considerada pronta para tráfego real apenas porque o bundle foi gerado. O deploy precisa passar pelos gates de ambiente, banco, autenticação, tenant isolation, permissões, Storage privado, fluxo público e rollback descritos abaixo.

> **Regra de segurança:** nenhuma senha, token, chave `service_role`, URL privada de banco, sessão ou dado real de cliente deve ser commitado. O arquivo `.env.example` contém apenas placeholders.

## 2. Estado atual que a tarefa de produção deve respeitar

O runtime é **híbrido**. A Home, Auth e vários módulos usam Supabase, mas alguns routers de domínio ainda dependem da ponte MySQL/TiDB. Não remova `DATABASE_URL` nem elimine o adaptador legado durante o deploy. O corte integral está registrado em `docs/handoff-supabase-cutover.md` e ainda depende de migrações de usuários, plataforma, tenant, orçamento aprovado, agenda, OS, consumo e financeiro.

O intake público utiliza o bucket privado do Supabase para anexos. Alguns fluxos legados de anexos de operações/orçamentos ainda usam `server/storage.ts` e podem depender das variáveis `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY`. Se a tarefa escolher não configurar essa integração, deve validar explicitamente quais telas perderão upload antes de liberar o ambiente.

O endpoint `POST /api/scheduled/operational-scan` está deliberadamente pausado e retorna `503` até existir autenticação de serviço compatível com Supabase. Não configure cron ou monitoramento esperando `2xx` para esse endpoint; a pendência está documentada em `server/scheduled.ts`.

A `Performance Garage` é uma oficina demonstrativa interna marcada com `is_demo=true` e protegida para Super Admin. Não semeie esse tenant nem dados de demonstração no banco de produção. Não copie clientes, usuários, veículos, anexos ou qualquer dado real para o ambiente de desenvolvimento ou demonstração.

## 3. Pré-requisitos do destino

A hospedagem precisa executar Node.js 22 ou superior, pnpm 10 ou superior, um processo HTTP de longa duração e servir a aplicação na porta fornecida por `PORT`. O comando de build é `pnpm build` e o comando de execução é `pnpm start`. O host deve encaminhar HTTPS para o processo e oferecer logs, reinício automático, variáveis secretas e, idealmente, health check.

O repositório não contém `Dockerfile`, `vercel.json`, `render.yaml`, `railway.json` ou outra configuração específica de provedor. Isso é intencional: a tarefa seguinte deve criar somente o adaptador de deploy necessário para o destino confirmado, evitando acoplar o produto a uma plataforma sem decisão explícita.

## 4. Variáveis de ambiente

Configure as variáveis abaixo no ambiente de produção, nunca em arquivo commitado. Use `.env.example` como mapa rápido e `docs/environment-reference.md` como referência completa.

| Variável | Obrigatória no runtime atual | Onde pode aparecer | Observação |
|---|---:|---|---|
| `NODE_ENV=production` | Sim | Servidor e processo de build | Deve ser exatamente `production` |
| `VITE_SUPABASE_URL` | Sim | Build e bundle público | URL HTTPS do projeto Supabase; não é segredo |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim | Build e bundle público | Use somente publishable/anon; nunca `service_role` |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Servidor | Segredo; nunca prefixar com `VITE_` nem enviar ao navegador |
| `DATABASE_URL` | Sim enquanto houver bridge | Servidor | MySQL/TiDB legado; configurar SSL conforme o provedor |
| `PORT` | Conforme o host | Servidor | Normalmente injetada pelo provedor; default local `3000` |
| `BUILT_IN_FORGE_API_URL` | Condicional | Servidor | Necessária para alguns uploads/recursos legados |
| `BUILT_IN_FORGE_API_KEY` | Condicional | Servidor | Segredo correspondente à integração Forge |
| `JWT_SECRET` | Compatibilidade | Servidor | Não representa sessão humana Supabase nova; manter somente se um legado exigir |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` | Compatibilidade | Servidor | Não usar para conceder acesso humano novo |
| Analytics | Opcional | Conforme implementação | Configurar apenas com endpoint HTTP(S) permitido |

> O `SUPABASE_SERVICE_ROLE_KEY` é usado pelo servidor para operações controladas do intake público e perfis. Ele ignora RLS por natureza; portanto, cada chamada precisa continuar validando identidade, tenant, papel e payload no servidor. Nunca reutilize essa chave em React, `VITE_*`, HTML, logs ou mensagens de erro.

## 5. Sequência de implantação

### 5.1. Preparar o código

```bash
gh repo clone andrefmuniz01-maker/offina-os
cd offina-os
pnpm install --frozen-lockfile
```

Confirme que a branch e o commit foram revisados pelo responsável pela produção:

```bash
git fetch origin --prune
git checkout main
git pull --ff-only
git status --short
git log -1 --pretty='%h %s'
```

### 5.2. Configurar Supabase antes da aplicação

Use o projeto Supabase destinado à produção, não a `Performance Garage` demo. Aplique as migrations em ordem cronológica pelo Supabase CLI ou SQL Editor autorizado. Antes de qualquer migration destrutiva ou migração de dados, faça backup e registre o plano de restauração.

No Supabase Auth, mantenha o provider de e-mail ativo, a autoinscrição pública desativada e as URLs de Site e Redirect ajustadas ao domínio real, incluindo `/auth/callback`. Provisione os usuários reais por convite/fluxo administrativo e configure papéis e memberships sob operação controlada. Não promova usuário alterando o frontend.

Confirme as policies RLS, o isolamento por `tenant_id`, o bucket privado `quote-request-attachments` e as policies de objetos. Anexos de clientes não podem receber URL pública, listagem anônima ou acesso por um tenant diferente.

### 5.3. Executar o preflight

Com as variáveis reais carregadas no ambiente de build/execução:

```bash
pnpm production:preflight
```

O comando reprova quando `NODE_ENV`, Supabase público, Service Role ou `DATABASE_URL` estão ausentes, quando a URL do Supabase não usa HTTPS ou quando chaves públicas e privadas parecem invertidas. Ele apenas alerta sobre Forge ausente; a tarefa deve decidir se os fluxos legados de anexos serão aceitos ou migrados.

### 5.4. Validar e construir

```bash
pnpm check
pnpm test
pnpm build
```

O build gera `dist/public` e `dist/index.js`. O servidor deve ser executado com:

```bash
pnpm start
```

O processo precisa escutar em `0.0.0.0` ou na interface exigida pelo host, usar `PORT` injetada e receber HTTPS no proxy da plataforma. Não coloque um servidor de desenvolvimento em produção.

## 6. Smoke tests obrigatórios após publicar

Execute os testes abaixo no domínio real ou em um ambiente de staging equivalente. Registre evidências e horário de cada verificação.

| Área | Verificação de saída |
|---|---|
| Saúde HTTP | A raiz responde e o processo permanece ativo após reinício |
| Bundle | O cliente carrega sem erro de configuração do Supabase no console |
| Login | Convite/recuperação de senha e login por e-mail funcionam no domínio real |
| Tenant | Usuário de uma oficina não consegue consultar, editar ou descobrir dados de outra por URL ou request |
| Papéis | Dono/admin veem dados autorizados; atendente não recebe custo/margem; técnico vê apenas execução atribuída |
| Solicitação pública | `/solicitar/<slug>` carrega sem login, valida campos e cria somente `quote_request` |
| Upload público | Anexo válido vai para Storage privado; MIME/tamanho/quantidade inválidos são recusados |
| Orçamento | Preparação respeita estoque disponível e permissões; não cria aprovação/reserva por acidente |
| Operação | Fluxos que ainda usam a ponte MySQL funcionam com `DATABASE_URL` e não misturam IDs Supabase/MySQL |
| Storage legado | Se mantido, upload de operações/orçamentos funciona com Forge; se não, a limitação está comunicada |
| Jobs | O scheduler pausado não é tratado como sucesso; nenhum cron humano foi configurado |
| Logs | Não aparecem tokens, Service Role, payloads sensíveis ou anexos em logs |
| Mobile | Solicitação pública e ações essenciais são utilizáveis em viewport móvel |

## 7. Rollback e operação

Para uma falha somente de aplicação, faça rollback para a imagem ou commit anterior aprovado e preserve os dados. Não execute `git revert` de migrations como mecanismo automático de rollback; mudanças de banco precisam de plano reverso específico, backup e aprovação. Antes de alterar migrations em produção, registre o snapshot/backup, o horário, o responsável e o procedimento de restauração.

Configure logs com retenção, alertas de erro, reinício automático e domínio HTTPS. O health check do provedor não deve depender de uma consulta mutável ou de um fluxo autenticado. Se a plataforma exigir um endpoint dedicado, a tarefa de produção deve adicioná-lo em uma mudança separada, coberta por teste e sem expor detalhes internos.

## 8. Pendências conhecidas antes de chamar o produto de “produção completa”

O deploy do runtime atual não equivale ao corte integral para Supabase. Permanecem pendentes a remoção da dependência de usuários MySQL no contexto, a migração de endpoints de Platform e tenant, o rascunho transacional de orçamento, envio/decisão segura, aprovação com reserva, agenda, OS, consumo, financeiro e eliminação da bridge. Consulte `docs/handoff-supabase-cutover.md` antes de anunciar uma migração concluída.

A suíte completa de testes também precisa ser executada com as variáveis públicas do Supabase disponíveis. No sandbox sem essas variáveis, `pnpm check`, build e testes focados podem passar, mas suites de Auth e credenciais falham por configuração ausente. Isso não deve ser mascarado com chaves falsas no CI.

## 9. Entrega esperada da próxima tarefa

A tarefa que levar este projeto à produção deve devolver: provedor e URL escolhidos; revisão exata publicada; lista de variáveis configuradas sem revelar valores; confirmação das migrations e policies no projeto correto; resultado dos smoke tests; estratégia de rollback; status dos fluxos legados; e confirmação de que nenhum segredo foi commitado.

## Referências internas

- [README](../README.md)
- [Referência de ambiente](environment-reference.md)
- [Portability inventory](portability-inventory.md)
- [Roteiro de portabilidade](repository-portability.md)
- [Handoff de cutover Supabase](handoff-supabase-cutover.md)
- [Migração MySQL para Supabase](mysql-to-supabase-mapping.md)
- [Configuração de Auth](supabase-magic-link-configuration.md)
