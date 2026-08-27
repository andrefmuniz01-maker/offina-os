# Super Admin — contrato da primeira etapa

## Objetivo

O Super Admin administra a **plataforma SaaS**, não a operação diária de uma oficina. Esta primeira etapa consolida o contrato técnico e de segurança do ambiente global antes de acrescentar novos fluxos administrativos, criar grupos, provisionar tenants ou inserir qualquer dado demonstrativo.

## Contextos explícitos

| Contexto | Quem acessa | Escopo permitido | Regra visual |
|---|---|---|---|
| Plataforma global | Somente `super_admin` | Agregados globais, tenants, planos, uso e auditoria administrativa | Identidade `Platform` distinta de oficina |
| Tenant específico | Super Admin em suporte ou membro ativo | Dados vinculados a um único tenant, conforme regra de acesso | Exibir tenant e modo de suporte de forma inequívoca |
| Operação da oficina | Owner, admin, atendente ou técnico vinculados | Apenas o tenant ao qual pertencem | Nunca reaproveitar como dashboard global |

Não será criada sessão paralela, URL secreta, parâmetro de elevação, mudança de papel no navegador ou troca permanente de role para simular outro usuário.

## Fontes de dados globais disponíveis

O painel atual já possui procedimentos protegidos por `assertPlatformSuperAdmin` em `server/routers/platform.ts`. Eles consultam dados reais da fonte de domínio em transição e devolvem agregados ou metadados necessários ao contexto global.

| Área | Procedure existente | Dados retornados | Limite atual |
|---|---|---|---|
| Indicadores | `platform.metrics` | Contagens de tenants, tenants ativos, usuários e vínculos ativos | Não inventa MRR, churn ou receita de assinatura |
| Diretório de oficinas | `platform.overview` | Tenants ordenados por criação | Sem pesquisa/filtros globais avançados nesta etapa |
| Uso | `platform.usage` | Membros, clientes e limites de plano por tenant | Não inclui Storage real nem telemetria de login |
| Relatório | `platform.report` | Agregados por tenant de clientes, orçamentos, OS entregues e receita recebida | Receita é operacional, não faturamento de assinatura SaaS |
| Usuários | `platform.users.list` | Usuários e memberships de tenant paginados | Não confunde clientes de oficina com usuários internos |
| Auditoria de tenant | `platform.tenantAudit` | Metadados paginados de evento, entidade e data | Não expõe conteúdo sensível de `before`, `after` ou `metadata` |
| Planos | `platform.plans.*` | Limites configuráveis de usuários e clientes | Entitlements e billing real permanecem futuros |

Quando uma fonte não possuir dados suficientes, a interface deve mostrar estado vazio, indisponível ou “não configurado”; ela não pode preencher métricas sintéticas como se fossem reais.

## Guardas de autorização existentes

1. Toda procedure em `platformRouter` exige sessão protegida e `assertPlatformSuperAdmin` no backend.
2. A sessão humana é validada pelo Supabase Auth. O contexto exige correspondência de ID e e-mail entre token e `profile` Supabase antes de materializar a ponte temporária de domínio.
3. Alterações de tenant, plano ou membership registram auditoria. Alterações concorrentes de tenant/membership/plano falham com conflito em vez de sobrescrever estado recente.
4. O proprietário primário de um tenant não pode ser rebaixado, desativado ou reassociado pelos fluxos de equipe comuns.
5. Papéis internos permitidos por fluxos de tenant são `admin`, `attendant` e `technician`; `owner` não é atribuível por esses fluxos.

> A ponte MySQL por e-mail ainda é transitória. A arquitetura final continua sendo Supabase Auth → `profiles` → `tenant_members` → tenant → papel/permissões → RLS. Nenhuma tela deve alegar que esse corte integral já ocorreu.

## Ações deliberadamente fora desta etapa

| Ação | Motivo para adiar |
|---|---|
| Criar grupos, tenants ou tenant demo | Exige fluxo completo, identidade real, isolamento e aprovação; não inserir dados fictícios agora |
| Criar administradores | Depende de provisionamento Supabase Auth por convite e primeiro acesso por senha |
| Cobrança, MRR, ARR, inadimplência e assinaturas reais | Não existe integração de billing aprovada; não simular pagamento |
| Impersonação ou “ver como” | Exige sessão temporária, expiração, indicação visual, confirmação e auditoria específica |
| Reset de demo | Depende de tenant demo isolado e processo idempotente auditado |
| Health score, churn e alertas de risco | Exigem sinais reais e fórmula documentada |
| Jobs e alertas externos | Scheduler permanece pausado até receber credencial de serviço compatível |

## Critérios para encerrar a primeira etapa

- O contrato distingue claramente contexto global, contexto de tenant e operação de oficina.
- As fontes exibíveis no dashboard têm procedures, permissões e limitações registradas.
- As métricas inexistentes não recebem dados fictícios.
- A criação futura de tenant, grupos, suporte e billing possui pré-requisitos de segurança explícitos.
- A rota global depende de autorização no backend, não de visibilidade condicional apenas no frontend.
