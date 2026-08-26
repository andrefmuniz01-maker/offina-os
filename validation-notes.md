# Registro de validação de interface

## 26/08/2026 — Filas operacionais prioritárias

As telas de solicitações, orçamentos, compras, agenda/pátio, financeiro e auditoria foram verificadas em desktop e, quando aplicável, em viewport móvel. Os campos de busca permanecem rotulados, apresentam foco visível e usam textos de estado vazio coerentes com os filtros ativos.

Na agenda, a busca única alcança a agenda e o pátio, preservando o filtro de período. Nas filas de orçamento, compra, financeiro e auditoria, os controles de busca e status reorganizam-se em uma coluna no mobile sem sobreposição observada. A revisão do console não identificou erro funcional novo; permanece somente o aviso conhecido de conexão WebSocket do HMR do Vite no ambiente de desenvolvimento.

## 26/08/2026 — Revisão estática de escopo por tenant

Foi feita uma varredura das operações de escrita e das consultas diretas por identificador nos roteadores. As ocorrências sem `tenantId` na própria linha pertencem ao Super Admin da plataforma ou usam predicados compostos montados previamente; as mutações comerciais revisadas mantêm `tenantId` no predicado final. Não foi identificado um novo ponto de correção nessa amostragem.

## 26/08/2026 — Mapeamento de filas restantes

O inventário das consultas de páginas identificou que solicitações, orçamentos, compras, agenda/pátio, financeiro, auditoria e clientes já possuem controles específicos revisados. As próximas lacunas candidatas são as listas compactas de produtos e serviços no catálogo operacional e o inventário, que hoje privilegiam carregamento integral ou uma lista limitada, sem paginação visível na mesma tela.

## 26/08/2026 — Itens por categoria

As confirmações de produtos e serviços por categoria foram atualizadas com busca independente, paginação de dez itens e estados de vazio/erro por lista. A revisão em desktop e mobile confirmou que os formulários permanecem utilizáveis e que os controles compactos não introduzem sobreposição no início da tela; os campos de busca ficam disponíveis abaixo da área de cadastro.

## 26/08/2026 — Estoque paginado

A lista de inventário foi verificada em desktop e mobile após a paginação no servidor. O desktop preserva a tabela de saldos físico, reservado e disponível; o mobile mantém os cartões rotulados. Os controles de página ficam no mesmo contexto da lista e o filtro por produto ou SKU reinicia a página sem afetar a previsão de necessidade ao lado ou abaixo da lista.

## 26/08/2026 — Notificações internas paginadas

A central de notificações foi verificada em desktop e mobile. As preferências por usuário continuam no topo da tela, e a fila usa paginação sem alterar o escopo individual nem os filtros de tipo escolhidos. Os estados de fila vazia e de preferências pausadas continuam distintos; a captura atual não continha volume suficiente de avisos para exibir os controles de próxima página.

## 26/08/2026 — Encerramento do mapeamento de filas prioritárias

Foram consolidados controles de busca, filtro, paginação e estados explícitos para solicitações, orçamentos, compras, agenda/pátio, financeiro, auditoria, catálogo, estoque, notificações e clientes. As telas remanescentes são formulários de configuração, listas de referência de pequeno porte, painéis sumarizados ou detalhes de uma única OS/veículo, e não configuram filas operacionais independentes no escopo atual.

## 26/08/2026 — Painel de Super Admin e planos

O painel global foi verificado em desktop e mobile após a inclusão do catálogo de planos. Os indicadores globais, a criação de tenant e a área de planos mantêm separação visual clara. No mobile, os indicadores passam para uma coluna sem corte observado; os formulários e a tabela de tenants permanecem abaixo da primeira dobra para navegação vertical natural.

## 26/08/2026 — Consumo por tenant e limites de plano

O painel global agora exibe, para cada tenant, contagens agregadas de membros ativos e clientes diante dos limites do plano atribuído. A revisão em desktop confirma a leitura dos cartões de consumo e a distinção visual de atenção ao atingir 80% de um limite. No mobile, os indicadores continuam em coluna; a seção de consumo permanece acessível por rolagem vertical sem tentar expor dados operacionais internos.

## 26/08/2026 — Suporte auditável por tenant

A central de suporte do Super Admin foi verificada em desktop e mobile. A seleção de oficina, a busca por metadados e o estado vazio de eventos permanecem separados da operação do tenant. No mobile, o seletor e a busca ficam empilhados; a tela conserva a distinção entre metadados de auditoria permitidos e dados operacionais não acessados.

## 26/08/2026 — Gestão global de usuários

A gestão global de usuários foi verificada em desktop e mobile. A busca, os vínculos por oficina, a identificação do proprietário primário protegido e a paginação permanecem legíveis. A versão móvel empilha as ações de vínculo sem corte; os controles mantêm a distinção entre alteração auditável de um vínculo comum e o bloqueio explícito do proprietário primário.

## 26/08/2026 — Associação global de usuários a tenants

A central de gestão de usuários foi revisada após incluir a associação de usuário existente a uma nova oficina com papel inicial. Os controles preservam o vínculo primário protegido e ficam disponíveis apenas para oficinas ainda não associadas ao usuário. A página continua responsiva em desktop e mobile; o estado atual com um único tenant não exibe a ação adicional, como esperado.

## 26/08/2026 — Relatório consolidado da plataforma

O relatório global foi verificado em desktop e mobile com seleção de período, cartões de totais e tabela por oficina. A tabela usa rolagem horizontal em telas pequenas, evitando a perda de colunas; o resumo por cards continua em coluna. O conteúdo informa que os números são agregados e não abre clientes, veículos, OS ou lançamentos individuais.

## 26/08/2026 — Integridade concorrente de alterações financeiras

As atualizações de custo, preço e margem de produtos e serviços passaram a comparar os valores lidos com os persistidos no momento da escrita, mantendo o predicado de tenant. Se outro usuário alterar os dados antes da confirmação, a operação retorna conflito e não cria evento de auditoria. A validação completa terminou com TypeScript aprovado e 44 arquivos de teste, totalizando 158 testes Vitest aprovados.
