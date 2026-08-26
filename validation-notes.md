# Registro de validação de interface

## 26/08/2026 — Filas operacionais prioritárias

As telas de solicitações, orçamentos, compras, agenda/pátio, financeiro e auditoria foram verificadas em desktop e, quando aplicável, em viewport móvel. Os campos de busca permanecem rotulados, apresentam foco visível e usam textos de estado vazio coerentes com os filtros ativos.

Na agenda, a busca única alcança a agenda e o pátio, preservando o filtro de período. Nas filas de orçamento, compra, financeiro e auditoria, os controles de busca e status reorganizam-se em uma coluna no mobile sem sobreposição observada. A revisão do console não identificou erro funcional novo; permanece somente o aviso conhecido de conexão WebSocket do HMR do Vite no ambiente de desenvolvimento.

## 26/08/2026 — Revisão estática de escopo por tenant

Foi feita uma varredura das operações de escrita e das consultas diretas por identificador nos roteadores. As ocorrências sem `tenantId` na própria linha pertencem ao Super Admin da plataforma ou usam predicados compostos montados previamente; as mutações comerciais revisadas mantêm `tenantId` no predicado final. Não foi identificado um novo ponto de correção nessa amostragem.
