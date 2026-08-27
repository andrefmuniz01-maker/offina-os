# Auditoria da primeira etapa — Super Admin

Esta auditoria registra o estado encontrado antes de expandir o painel global. Ela não cria tenant, grupo, plano, usuário ou dado demonstrativo.

## Rotas e interface existentes

| Elemento | Estado observado | Decisão para a próxima etapa |
|---|---|---|
| Rota global | `/plataforma` em `client/src/App.tsx` | Manter como destino exclusivo de `super_admin` |
| Redirecionamento pós-login | `getPostLoginPath()` envia `super_admin` para `/plataforma` | Revalidar em login real quando o limite de e-mail liberar |
| Página global | `client/src/pages/Platform.tsx` | Reestruturar gradualmente como plataforma, sem misturar agenda/estoque de tenant |
| Relatórios agregados | `PlatformReportCard` | Reutilizar apenas dados agregados por tenant e estados vazios |
| Usuários globais | `PlatformUserManagementCard` | Preservar bloqueio de owner e não permitir autoelevação |
| Auditoria de tenant | `PlatformTenantAuditCard` | Preservar metadados paginados sem expor conteúdo operacional sensível |
| Layout | `DashboardLayout` é genérico | Criar navegação de Platform sem reutilizar semântica operacional de oficina |

## Backend e autorização existentes

| Procedure ou regra | Proteção encontrada | Evidência de auditoria/concorrência |
|---|---|---|
| `platform.metrics`, `overview`, `usage`, `report` | `assertPlatformSuperAdmin` | Apenas agregados globais |
| `platform.tenantAudit` | `assertPlatformSuperAdmin` | Paginação e resposta sem payloads `before`, `after` e `metadata` |
| `platform.users.*` | `assertPlatformSuperAdmin` | Alterações de membership registram auditoria |
| `platform.updateTenant` | `assertPlatformSuperAdmin` | Atualização condicional evita sobrescrita concorrente e escreve audit log |
| `platform.createTenant` | `assertPlatformSuperAdmin` | Slug único e owner existente antes de criação |
| `platform.plans.*` | `assertPlatformSuperAdmin` | Código único, atualização condicional e auditoria |
| Gestão de equipe por tenant | `requireTenantPermission` | Owner primário não pode ser rebaixado/desativado pelos fluxos comuns |

## Cobertura automatizada encontrada

Os testes `server/routers/platform.management.integration.test.ts`, `platform.plans.integration.test.ts`, `platform.report.integration.test.ts`, `platform.tenant-audit.integration.test.ts`, `platform.usage.integration.test.ts` e `platform.users.integration.test.ts` cobrem o inventário atual de procedimentos. Os testes também confirmam criação de tenant controlada, métricas agregadas, mudança de status auditada, bloqueio de owner e paginação de auditoria.

## Lacunas que permanecem bloqueadas

| Lacuna | Risco | Pré-requisito |
|---|---|---|
| Sessão real por senha e redirecionamento final | Não afirmar fluxo concluído sem teste humano | Limite de e-mail Supabase liberar; Felipe definir senha |
| Corte de dados para Supabase | Bridge por e-mail/MySQL não é a arquitetura final | Reconciliação, routers PostgreSQL e testes RLS ponta a ponta |
| Criação de admin | Não criar identidade fictícia nem senha transitória | Convite Supabase e primeiro acesso real |
| Grupos, tenants e demo | Não inserir dados de domínio sem fluxo completo | Aprovação da criação, owner real, plano, auditoria e teste de isolamento |
| Suporte/impersonação | Risco de sessão paralela e bypass | Token temporário, expiração, confirmação, banner e auditoria específica |
| Billing, saúde, churn e MRR | Não apresentar métricas fictícias | Fonte de billing e fórmulas reais documentadas |

## Resultado da etapa

O repositório já contém uma base de plataforma global protegida e auditável, mas a primeira ampliação visual deve partir de procedimentos globais existentes, dados agregados reais e estados vazios. A próxima etapa pode definir o shell de navegação Platform e o contrato de cada seção, sem habilitar ações irreversíveis ou criar dados.
