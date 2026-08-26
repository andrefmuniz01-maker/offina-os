# Status da foundation Supabase no plano gratuito

## Regra de custo

Esta migração não criou branch, projeto adicional nem outro recurso pago do Supabase. As migrations foram aplicadas diretamente ao projeto gratuito já existente, que não possuía dados de domínio antes da execução.

## Resultado aplicado

| Verificação | Resultado |
|---|---:|
| Migrations de foundation aplicadas | 3 |
| Tabelas públicas de domínio | 39 |
| Tabelas públicas com RLS habilitado | 39 |
| Dados de domínio criados por esta etapa | 0 |
| Bucket de Storage | `oficina-private` (privado) |
| Alertas do Security Advisor | 0 |

As migrations versionadas estão em `supabase/migrations/`. Elas estabelecem perfis vinculados a `auth.users`, memberships por tenant, políticas RLS, bucket de arquivos privado com prefixo de tenant e índices de FKs. A origem MySQL não foi excluída, alterada nem tratada como fonte de dados a ser recriada.

## Limites deliberados desta etapa

O Supabase ainda não contém uma identidade Auth verificada para Felipe ou Andref. Por isso, nenhuma conta foi criada, promovida ou associada a Super Admin por suposição. A adaptação integral da aplicação de Manus OAuth/MySQL para Supabase Auth/PostgreSQL exige a primeira autenticação real do Super Admin no Supabase e uma troca coordenada de todos os procedimentos tRPC, pois o código ainda referencia chaves numéricas de usuário MySQL enquanto o Supabase usa UUIDs de `auth.users`.

> Não existe corte de produção nesta etapa. A aplicação publicada continua usando a implementação anterior enquanto a foundation Supabase permanece vazia de dados operacionais e protegida por RLS.

## Rollback gratuito

Como não havia dados de domínio no Supabase antes da foundation, a reversão técnica consiste em restaurar um checkpoint do projeto de código e remover as migrations/tabelas somente mediante aprovação explícita. A origem MySQL permanece preservada como referência histórica até uma reconciliação de dados aprovada.
