# Mapa Operacional do OficinaOS

**Data de referência:** 27 de agosto de 2026  
**Escopo:** estado versionado da aplicação, seus fluxos de uso diário e as fronteiras de migração entre Supabase e MySQL legado.

> Este documento descreve o que está implementado e o que permanece transitório. Ele não declara a migração concluída e não presume que um fluxo é seguro apenas por existir uma interface.

## 1. Organização da experiência

O produto já concentra a operação em uma navegação curta. Para usuários de oficina, a **Central do dia** é a entrada e conduz às solicitações, orçamentos, agenda e pátio, estoque, clientes, equipe, financeiro e configurações. O Super Admin não entra nesse contexto operacional: sua Home apresenta somente o acesso ao painel global em `/plataforma`.

| Contexto | Entrada | Objetivo diário | Dados e permissões atuais |
|---|---|---|---|
| Super Admin | `/plataforma` | Acompanhar a plataforma e as oficinas sem operar uma oficina específica | `platform.*`; visão somente leitura na interface; parte do backend ainda depende da ponte MySQL e requer migração antes de mutações globais. |
| Dono/Admin | `/` | Priorizar o comercial, operação, estoque e indicadores da própria oficina | `workspace.*` para contexto/dashboard; demais fluxos são híbridos durante a migração. |
| Atendente | `/` | Receber solicitações, elaborar orçamentos e organizar agenda | A interface restringe a leitura financeira; a autoridade precisa permanecer no backend/RLS em cada router. |
| Técnico | `/operacao`, `/os/:id` | Executar OS, checklist, apontamentos e consumo de itens | Operação e OS ainda usam routers legados; não há acesso financeiro previsto. |
| Cliente sem conta | `/solicitar/:slug`, `/orcamento/:token` | Solicitar, consultar e decidir orçamento | Fluxo público por slug/token; não cria sessão humana. |

## 2. Superfícies de interface e contratos

| Área | Página e rota | Consultas e ações em uso | Situação de dados |
|---|---|---|---|
| Autenticação | `AuthCallback` e tela de acesso no layout | Supabase e-mail/senha, recuperação e `auth.me` | Supabase Auth é a única sessão humana; callback é reservado a convite/recuperação. |
| Central do dia | `Home` em `/` | `workspace.mine`, `workspace.dashboardOverview`, `workspace.notifications` | Contexto e dashboard Supabase; métricas financeiras somente para owner/admin. |
| Plataforma | `Platform` em `/plataforma` | `platform.metrics`, `platform.overview`, `platform.usage`, `platform.plans.list` | Interface somente leitura; router global ainda tem dependências legadas a remover antes de ações administrativas. |
| Solicitações | `Requests` em `/solicitacoes` | listagem, responsáveis, histórico, atualização de status, criação de orçamento sugerido | Router `quoteRequests` legado/transitório. |
| Orçamentos | `Quotes` em `/orcamentos` | listagem/detalhe, envio e descontos | Router `quotes` legado/transitório. |
| Agenda e pátio | `Operations` em rotas de operação | agenda, kanban, agendar a partir de orçamento, membros | `appointments` e `workOrders` legados; consome orçamento e equipe. |
| Ordem de serviço | `WorkOrder` e `WorkOrderNotes` | detalhe, status, checklist, consumo, anexos e apontamentos | `workOrders` legado; consumo afeta estoque e exige preservação de transação/auditoria no corte futuro. |
| Estoque | `Inventory` em `/estoque` | lista, previsão e ajuste controlado | `workspaceInventory`; Supabase para saldo/previsão/ajuste. |
| Compras | `Purchases` em `/compras` | catálogo, pedidos, recebimento | `workspaceCatalog` e `workspaceInventory`; Supabase. |
| Catálogo | `Catalog`, `CatalogItems`, `Categories` | produtos, serviços, categorias e composição | `workspaceCatalog`; Supabase. Routers `catalog` continuam como ponte para consumidores legados. |
| Clientes e veículos | `Clients` em `/clientes` | lista paginada, veículos, histórico e cadastro de veículo | `workspaceCustomers` e `workspaceVehicles`; Supabase. |
| Financeiro | `Finance` em `/financeiro` | resumo, receitas, despesas, recebimento | `dashboard` e `financial` legados; acesso precisa ser protegido no backend além da ocultação da interface. |
| Equipe | `Team` em `/equipe` | listar, vincular usuário existente e atualizar papel | Router `tenant` legado; ainda precisa do corte integral para membership Supabase/RLS. |
| Configurações | `Settings` em `/configuracoes` | dados da oficina e identidade visual | Router `tenant` legado. |
| Notificações | `Notifications` em `/notificacoes` | listar, marcar como lida e preferências | Router `notifications` legado. |
| Auditoria e relatórios | `Audit`, `Reports` | histórico e indicadores mensais | Dependem do backend legado atual; devem seguir como leitura até o corte por domínio. |
| Público | `PublicQuoteRequest` e `PublicQuote` | serviços públicos, envio da solicitação, consulta/decisão por token | Intake e orçamento públicos ainda são legados; há validação de arquivo, normalização de contato e throttle no servidor. |

## 3. Cadeia de negócio atual

| Etapa | Implementação observada | Proteção/regra existente | Lacuna antes de declarar corte completo |
|---|---|---|---|
| Solicitação | Formulário público cria `quote_request` por `quoteRequests.submitPublic` | Serviço canônico, normalização de WhatsApp, limitação por contato/oficina e validação de anexos no backend | Migrar intake para RPC Supabase e Storage privado com rate limit persistido. |
| Triagem e orçamento | Solicitação pode gerar sugestão/orçamento | Histórico e status na superfície comercial | Migrar `quoteRequests` e `quotes` como um fluxo, sem redirecionar consumidores legados isoladamente. |
| Aprovação | Orçamento público decide por token | Token protege a experiência do cliente | Validar na migração as reservas transacionais de estoque e a expiração. |
| Agenda | Agendamento nasce de orçamento | Agenda recebe orçamento e responsável | Migrar junto com OS e regras de duração/baia para evitar redigitação ou estados divididos. |
| OS e execução | Kanban, checklist, anotações, consumo e anexos | Status e ações técnicos disponíveis na UI | Migrar anexos, consumo e auditoria como operação atômica no Supabase. |
| Estoque e compras | Catálogo, saldo, previsão, pedidos e recebimento Supabase | Fachadas autenticadas, validação de tenant e rotinas transacionais no schema privado | Manter ponte para comercial/OS até os consumidores legados serem migrados integralmente. |
| Financeiro | Receitas/despesas e marcação de recebimento | Projeção do dashboard já omite métricas financeiras para papéis não autorizados | Migrar router financeiro e validar permissões/RLS ponta a ponta. |

## 4. Regras de autorização e dados

O caminho de identidade deve ser mantido como **Supabase Auth → profile → membership → tenant → papel → permissões → RLS**. O navegador fornece apenas o Bearer Supabase; a validação do JWT e a materialização mínima do profile ocorrem no servidor. A resposta `auth.me` contém somente identidade mínima e papel global, sem retornar token.

| Regra | Estado observado | Ação de preservação |
|---|---|---|
| Sessão humana única | Supabase Auth por e-mail/senha | Não restaurar OAuth Manus, Magic Link diário, cookies ou JWT próprios. |
| Perfil autenticado | Consulta limitada ao UUID validado no servidor | Não expor UUIDs, token ou Service Role no navegador, logs ou documentos. |
| Isolamento de catálogo/estoque/compras | RPCs privadas e fachadas públicas `SECURITY INVOKER` | Toda composição deve validar `tenant_id` no backend; não abrir REST direto. |
| Financeiro | Dashboard Supabase projeta apenas para owner/admin/Super Admin | Repetir a verificação no router financeiro transitório e no corte definitivo. |
| Acesso público | Somente catálogo/intake anônimos intencionais | Manter `search_path` vazio, ACL mínima e respostas sem identificador interno de tenant. |
| Demo | Entrega concorrente prevista | A oficina demo deve ser marcada e visível apenas em contexto Super Admin, fora de métricas e links comerciais públicos. |

## 5. Diagnóstico de navegação pós-login

As evidências de runtime mostram que a consulta global do painel recebeu erro HTTP 401 em uma sessão que já tinha autenticado. O cliente atual trata **qualquer** `TRPCClientError` com a mensagem genérica de não autenticado como motivo para executar `window.location.href = "/"`. Assim, uma falha transitória de uma consulta do painel derruba a navegação, embora não constitua por si só uma prova de perda da sessão Supabase.

> A correção deve limitar a troca para a tela de acesso ao estado real de `auth.me`/Supabase, ou simplesmente permitir que o layout responda à ausência real do usuário. Erros de módulos devem ser exibidos no próprio módulo, sem realizar logout implícito.

## 6. Lacunas priorizadas

| Prioridade | Lacuna | Próximo passo seguro |
|---|---|---|
| P0 | Redirecionamento por erro não específico de autenticação | Remover o redirecionamento global por qualquer erro de query/mutation; cobrir com teste de regressão e validar sessão real. |
| P0 | Intake/anexos públicos legados | Implementar somente após migração para RPC Supabase, capacidade temporária e controles persistidos definidos no desenho de segurança. |
| P0 | Comercial, agenda e OS em ponte MySQL | Migrar por cadeia inteira: solicitação → orçamento → aprovação/reserva → agenda → OS → consumo. |
| P1 | Administração de equipe/configurações | Migrar membership e configurações ao Supabase com RLS antes de expor novas mutações administrativas. |
| P1 | Financeiro e relatórios | Substituir o router legado apenas com permissões validadas no servidor e testes de isolamento. |
| P1 | Plataforma global | Preservar leitura até que a autorização deixe de depender de usuário MySQL transitório. |

## 7. Critério para próximos incrementos

Cada incremento deve conter contrato de banco, regra de negócio, autorização, estado de carregamento/erro/vazio, auditoria quando houver efeito operacional ou financeiro, testes e validação visual. Uma nova página só é justificável quando não puder ser resolvida pelas seis jornadas consolidadas: **Central do dia; solicitações e orçamentos; agenda e pátio; estoque e compras; clientes e equipe; configurações e plataforma**.
