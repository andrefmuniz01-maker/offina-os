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
| Técnico | `/operacao`, `/os/:id` | Executar OS, checklist e consumo de itens reservados | Operação e OS usam fachadas Supabase seguras por OS atribuída; anexos e apontamentos permanecem indisponíveis até haver contratos privados próprios. Não há acesso financeiro previsto. |
| Cliente sem conta | `/solicitar/:slug`, `/orcamento/:token` | Solicitar, consultar e decidir orçamento | Fluxo público por slug/token; não cria sessão humana. |

## 2. Superfícies de interface e contratos

| Área | Página e rota | Consultas e ações em uso | Situação de dados |
|---|---|---|---|
| Autenticação | `AuthCallback` e tela de acesso no layout | Supabase e-mail/senha, recuperação e `auth.me` | Supabase Auth é a única sessão humana; callback é reservado a convite/recuperação. |
| Central do dia | `Home` em `/` | `workspace.mine`, `workspace.dashboardOverview`, `workspace.notifications` | Contexto e dashboard Supabase; métricas financeiras somente para owner/admin. |
| Plataforma | `Platform` em `/plataforma` | `platform.metrics`, `platform.overview`, `platform.usage`, `platform.plans.list` | Interface somente leitura; router global ainda tem dependências legadas a remover antes de ações administrativas. |
| Solicitações | `Requests` em `/solicitacoes` | listagem, responsáveis, histórico, atualização de status, criação de orçamento sugerido | Demo usa `workspaceQuoteRequests` Supabase persistido; demais contextos ainda podem usar a ponte legada. |
| Orçamentos | `Quotes` em `/orcamentos` | listagem/detalhe, envio e descontos | Demo usa `workspaceQuotes` Supabase; mutações ainda são restritas conforme o contrato migrado. |
| Agenda e pátio | `Operations` em rotas de operação | agenda, kanban, agendar a partir de orçamento, membros | Demo usa `workspaceOperations` Supabase para agenda/pátio; agenda nasce de orçamento aprovado e herda a OS. |
| Ordem de serviço | `WorkOrder` e rota de apontamentos bloqueada | detalhe, status, checklist e consumo por reserva | `workspaceOperations.workOrderDetail`, checklist, status e consumo usam Supabase com projeção mínima; anexos e apontamentos não são exibidos nem gravados enquanto não houver contrato privado versionado. |
| Estoque | `Inventory` em `/estoque` | lista, previsão e ajuste controlado | `workspaceInventory`; Supabase para saldo/previsão/ajuste. |
| Compras | `Purchases` em `/compras` | catálogo, pedidos, recebimento | `workspaceCatalog` e `workspaceInventory`; Supabase. |
| Catálogo | `Catalog`, `CatalogItems`, `Categories` | produtos, serviços, categorias e composição | `workspaceCatalog`; Supabase. Routers `catalog` continuam como ponte para consumidores legados. |
| Clientes e veículos | `Clients` em `/clientes` | lista paginada, veículos, histórico e cadastro de veículo | `workspaceCustomers` e `workspaceVehicles`; Supabase. |
| Financeiro | `Finance` em `/financeiro` | resumo, receitas, despesas, recebimento | Demo usa `workspaceFinance` e dashboard Supabase tenant-scoped; fora dela, a ponte financeira legada permanece. |
| Equipe | `Team` em `/equipe` | listar, vincular usuário existente e atualizar papel | Demo lê `tenant_members`/`profiles` reais via Supabase e não cria identidades fictícias; mutações continuam restritas. |
| Configurações | `Settings` em `/configuracoes` | dados da oficina e identidade visual | Demo usa `workspaceManagement` Supabase para settings e branding; fora dela, a ponte legada permanece. |
| Notificações | `Notifications` em `/notificacoes` | listar, marcar como lida e preferências | Demo usa `workspaceManagement` Supabase com paginação, preferências e leitura. |
| Auditoria e relatórios | `Audit`, `Reports` | histórico e indicadores mensais | Demo usa `workspaceManagement` Supabase como leitura tenant-scoped; mutações globais continuam fora do escopo. |
| Público | `PublicQuoteRequest` e `PublicQuote` | serviços públicos, envio da solicitação, consulta/decisão por token | Demo usa catálogo/intake e `publicQuotes` Supabase mediados pelo servidor; há validação de arquivo, normalização de contato, token seguro e throttle. |

## 3. Cadeia de negócio atual

| Etapa | Implementação observada | Proteção/regra existente | Lacuna antes de declarar corte completo |
|---|---|---|---|
| Solicitação | Demo usa formulário público, `publicIntake` e `quote_request` persistido no Supabase | Serviço canônico, normalização de WhatsApp, limitação por contato/oficina e validação de anexos no backend | Completar o corte geral do intake e manter o mesmo contrato para os demais tenants. |
| Triagem e orçamento | Solicitação pode gerar sugestão/orçamento | Histórico e status na superfície comercial | Na Demo, `workspaceQuoteRequests` e `workspaceQuotes` mantêm o vínculo persistido; fora dela, concluir a migração conjunta sem misturar IDs legados. |
| Aprovação | Demo usa decisão pública por token via `publicQuotes` | Token seguro, proposta válida e reserva de estoque transacional; recusa não reserva | Completar o corte geral e validar expiração em todos os tenants. |
| Agenda | Demo agenda a partir de orçamento aprovado e vincula a OS | Agenda herda cliente, veículo, itens, valores e reserva sem redigitação | Completar atribuição de profissional na interface e o corte para os demais tenants. |
| OS e execução | Kanban, detalhe, checklist, status e consumo por reserva usam `workspaceOperations` | Técnico somente atua em OS atribuída; gestão opera tenant ativo; status e consumo são auditados | Upload de anexos, apontamentos privados e eliminação dos consumidores legados remanescentes permanecem pendentes. |
| Estoque e compras | Catálogo, saldo, previsão, pedidos e recebimento Supabase; Demo também reserva e consome por OS | Fachadas autenticadas, validação de tenant e rotinas transacionais no schema privado | Manter ponte para consumidores legados fora da Demo até a migração integral. |
| Financeiro | Receitas/despesas e marcação de recebimento | Projeções Supabase da Demo omitem dados para papéis não autorizados | Completar mutations financeiras e substituir a ponte legada com permissões/RLS ponta a ponta. |

## 4. Regras de autorização e dados

O caminho de identidade deve ser mantido como **Supabase Auth → profile → membership → tenant → papel → permissões → RLS**. O navegador fornece apenas o Bearer Supabase; a validação do JWT e a materialização mínima do profile ocorrem no servidor. A resposta `auth.me` contém somente identidade mínima e papel global, sem retornar token.

| Regra | Estado observado | Ação de preservação |
|---|---|---|
| Sessão humana única | Supabase Auth por e-mail/senha | Não restaurar OAuth Manus, Magic Link diário, cookies ou JWT próprios. |
| Perfil autenticado | Consulta limitada ao UUID validado no servidor | Não expor UUIDs, token ou Service Role no navegador, logs ou documentos. |
| Isolamento de catálogo/estoque/compras | RPCs privadas e fachadas públicas `SECURITY INVOKER` | Toda composição deve validar `tenant_id` no backend; não abrir REST direto. |
| Financeiro | Dashboard Supabase projeta apenas para owner/admin/Super Admin | Repetir a verificação no router financeiro transitório e no corte definitivo. |
| Acesso público | Somente catálogo/intake anônimos intencionais | Manter `search_path` vazio, ACL mínima e respostas sem identificador interno de tenant. |
| Demo | Tenant Supabase marcado com `is_demo`, acessível no backoffice somente por Super Admin e selecionado por `demo=1` | RLS/guards impedem membros comuns; o catálogo/intake público é exceção controlada somente para `performance-garage`, e a navegação usa as mesmas páginas da oficina. |

## 5. Diagnóstico de navegação pós-login

As evidências de runtime mostraram que a consulta global do painel recebeu erro HTTP 401 em uma sessão que já tinha autenticado. O cliente tratava **qualquer** `TRPCClientError` com a mensagem genérica de não autenticado como motivo para executar `window.location.href = "/"`. Assim, uma falha transitória de uma consulta do painel derrubava a navegação, embora não constituísse por si só uma prova de perda da sessão Supabase. A reação global foi removida: a identidade continua sendo determinada por `auth.me`, enquanto erros de módulos permanecem no respectivo módulo.

> As consultas globais de leitura também passaram a exigir diretamente a identidade Supabase de Super Admin. Elas não dependem mais de uma conta MySQL transitória, enquanto as mutações legadas continuam deliberadamente bloqueadas sem essa migração completa.

## 6. Lacunas priorizadas

| Prioridade | Lacuna | Próximo passo seguro |
|---|---|---|
| P0 | Redirecionamento por erro não específico de autenticação | Remover o redirecionamento global por qualquer erro de query/mutation; cobrir com teste de regressão e validar sessão real. |
| P0 | Intake/anexos públicos fora do tenant Demo | Concluir a migração geral mantendo o preview/intake da Demo limitado ao slug permitido, capacidade temporária e controles persistidos. |
| P0 | Consumidores MySQL remanescentes fora do fluxo comercial e operacional migrado | Concluir o corte de cada módulo sem misturar IDs de origem e Supabase; solicitação → orçamento → aprovação/reserva → agenda → OS → consumo já possui caminho Supabase versionado. |
| P1 | Administração de equipe/configurações | Migrar membership e configurações ao Supabase com RLS antes de expor novas mutações administrativas. |
| P1 | Financeiro e relatórios fora da Demo | Substituir o router legado apenas com permissões validadas no servidor e testes de isolamento; a Demo já usa a leitura Supabase. |
| P1 | Plataforma global | Preservar leitura até que a autorização deixe de depender de usuário MySQL transitório. |

## 7. Critério para próximos incrementos

Cada incremento deve conter contrato de banco, regra de negócio, autorização, estado de carregamento/erro/vazio, auditoria quando houver efeito operacional ou financeiro, testes e validação visual. Uma nova página só é justificável quando não puder ser resolvida pelas seis jornadas consolidadas: **Central do dia; solicitações e orçamentos; agenda e pátio; estoque e compras; clientes e equipe; configurações e plataforma**.

## 8. Verificação da demonstração administrativa

O tenant de demonstração existente foi conferido em modo somente leitura. Ele está marcado como demonstração e não possui membros operacionais ativos. A migration `20260827_0018_exclude_demo_from_public_flows.sql` foi aplicada ao projeto Supabase existente: ela exige `not is_demo` tanto no catálogo público como na RPC de intake. Uma chamada anônima ao catálogo para o slug da demonstração retornou resposta vazia, sem expor dados comerciais. O Security Advisor permaneceu com apenas as exceções já conhecidas e intencionais de catálogo/intake anônimos com `SECURITY DEFINER`, além da pendência já registrada de proteção contra senhas vazadas.


## 9. Atualização do workspace Demo

A oficina Demo passou a ser exercitável pelo mesmo workspace operacional, sem dashboard ou páginas exclusivas de demonstração. O gate administrativo `/demo-interna` apenas valida Super Admin e redireciona para `/?demo=1`; a query é preservada nos links internos, enquanto o `tenant_id` é resolvido pelo retorno tenant-scoped de `workspace.mine`.

| Área | Estado atualizado na Demo | Regra preservada |
|---|---|---|
| Home e navegação | Usa a Central do dia, menu e cards reais com tenant `Auto Prime Centro Automotivo` | Não há fallback de tenant por ID no cliente; Demo continua Super Admin-only. |
| Solicitações e orçamentos | Leitura Supabase persistida e decisão pública por token no mesmo componente | Solicitação não cria orçamento final automaticamente; aprovação pública cria reserva de forma atômica. |
| Agenda, pátio e OS | Agenda/kanban e detalhe da OS usam RPCs Supabase; OS mostra itens, checklist, reservas, status e consumo | Status seguem transições permitidas; consumo mantém físico/reservado e registra movimento/auditoria. Anexos e apontamentos ficam bloqueados até novo contrato privado. |
| Financeiro e relatórios | Receitas, despesas, dashboard mensal e relatório usam consultas Supabase paginadas/tenant-scoped | Custos e resultado só aparecem para permissões financeiras autorizadas. |
| Configurações e branding | Formulário real lê e grava `tenant_settings`/`tenant_branding` via RPCs | Alterações administrativas são auditadas e passam por `tenant.manage`. |
| Notificações e auditoria | Lista, preferências, marcação de leitura e trilha de auditoria usam Supabase | Notificações são limitadas ao tenant e ao usuário atual ou alertas globais do tenant. |
| Equipe | Consulta somente vínculos reais de `tenant_members` e `profiles` | Não são criadas contas Auth fictícias; a Demo permanece sem equipe operacional simulada. |
| Público | `/solicitar/performance-garage` e `/orcamento/:token` reutilizam as páginas públicas existentes | O preview público é liberado somente para o slug Demo fixo; outros tenants Demo continuam bloqueados. |

Nenhum dado fictício, identidade, arquivo, execução de OS ou integração externa foi criado neste incremento. Qualquer ambiente de demonstração já existente permanece sujeito às mesmas regras de seleção administrativa, tenant e RLS; ele não deve ser tratado como prova de corte integral ou como substituto dos testes de isolamento entre tenants.

> A Demo operacional não deve ser descrita como um cutover global. Fora de `demo=1`, os módulos ainda indicados como híbridos continuam sujeitos à ponte MySQL até a migração de seus contratos e mutations ser concluída.
