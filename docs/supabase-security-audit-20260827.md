# Auditoria de segurança Supabase — 27 de agosto de 2026

## Escopo e evidência

Esta auditoria é **somente leitura** e foi realizada no projeto Supabase `OFFICINA OS` (`jpvvhowgpuinuuputoot`). O Security Advisor confirmou três avisos externos. Nenhuma migration, dado, identidade, segredo ou configuração foi alterado nesta etapa.

| Aviso | Escopo | Situação confirmada | Tratamento exigido |
|---|---|---|---|
| `anon_security_definer_function_executable` | `public_get_workshop_catalog(text)` | A função é `SECURITY DEFINER` e pode ser chamada por `anon`. | Manter apenas se o catálogo público for estritamente necessário; revisar validação de slug, `search_path`, permissões e retorno comercial mínimo. |
| `anon_security_definer_function_executable` | `public_submit_quote_request(...)` | A função é `SECURITY DEFINER` e pode ser chamada por `anon`. | Manter apenas para a solicitação sem login; validar todos os parâmetros, limitar efeitos, proteger contra abuso e restringir privilégios. |
| `auth_leaked_password_protection` | Supabase Auth | A proteção contra senhas vazadas está desligada. | Habilitar no painel do Supabase antes de liberar acesso comercial por senha e registrar a confirmação. |

> Os dois primeiros avisos não são automaticamente uma vulnerabilidade: eles decorrem de um fluxo público intencional. Ainda assim, são uma exceção ao padrão de menor privilégio e exigem controles explícitos e revisão antes da liberação comercial.

## Limites confirmados

O catálogo público deve expor apenas itens comerciais permitidos para o tenant resolvido pelo slug. A criação pública deve se limitar a `quote_request`, nunca conceder seleção anônima das tabelas internas, aceitar `tenant_id` fornecido pelo cliente nem criar orçamento, reserva, ordem de serviço ou movimento financeiro.

O painel Platform não deve construir URL pública de orçamento. A visualização de orçamento do cliente continua dependente de token individual e não deve ser inferida a partir de um slug de tenant.

## Próximo passo controlado

A correção técnica deve revisar a migration `20260827_0009_public_quote_requests.sql` e a migration `20260827_0010_public_catalog_security.sql` contra a documentação oficial do Supabase. A alteração deverá preservar o acesso sem conta do cliente, limitar o escopo de `SECURITY DEFINER`, manter `search_path` fixo, conceder somente o `EXECUTE` inevitável e acrescentar proteção contra abuso antes de qualquer exposição comercial.

## Resultado da correção aplicada

A migration `20260827_0012_harden_public_rpc_context.sql` foi aplicada ao projeto `OFFICINA OS`. A consulta de catálogo PostgreSQL confirmou que `public_get_workshop_catalog` e `public_submit_quote_request` possuem `search_path=""`; suas ACLs mantêm `EXECUTE` apenas para `anon`, `service_role` e o proprietário técnico, sem concessão a `PUBLIC` ou `authenticated`.

O Advisor continua emitindo os dois avisos de `SECURITY DEFINER` porque ambos os endpoints permanecem corretamente acessíveis a visitantes sem sessão. Isso é uma exceção intencional e não uma aprovação de segurança automática: a limitação de retorno, as validações de entrada, o escopo fixo e uma camada de rate limit ainda são obrigatórios antes da exposição comercial ampla.

A proteção contra senhas vazadas continua desligada. Essa opção é administrada no Supabase Auth e não foi modificada por migration nem pelo código do repositório.

## Referências

[1]: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable "Supabase Database Linter — Public Can Execute SECURITY DEFINER Function"
[2]: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection "Supabase Auth — Password security and leaked-password protection"
