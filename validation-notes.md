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

## 26/08/2026 — Barreira central para tenants suspensos

A camada compartilhada de autorização passou a aceitar somente oficinas ativas em período de teste ou ativas comercialmente. Tenants suspensos, inativos ou marcados como inativos são rejeitados antes da consulta de vínculo, inclusive em chamadas internas feitas por Super Admin. A validação completa terminou com TypeScript aprovado e 45 arquivos de teste, totalizando 161 testes Vitest aprovados.

## 26/08/2026 — Proteção do proprietário primário

As mutações internas de equipe agora impedem rebaixar, desativar ou reativar o proprietário primário com um papel inferior a dono. O bloqueio acontece antes de escrita e auditoria, preservando o controle da oficina mesmo quando a ação parte de outro perfil com gestão de equipe. A validação completa terminou com TypeScript aprovado e 45 arquivos de teste, totalizando 163 testes Vitest aprovados.

## 26/08/2026 — Links públicos de tenant comercialmente ativo

A visualização e a decisão públicas de orçamento exigem que a oficina esteja marcada como ativa e com status comercial `active`. Links de tenants em teste, suspensos ou inativos não expõem dados, não alteram o status para expirado e não produzem auditoria. A validação completa terminou com TypeScript aprovado e 45 arquivos de teste, totalizando 165 testes Vitest aprovados.

## 26/08/2026 — Chaves privadas para anexos

Novos anexos de solicitações públicas e de execução de OS recebem um segmento aleatório de 24 caracteres em sua chave de armazenamento, preservando o prefixo do tenant e do registro para rastreabilidade. Os nomes são normalizados antes da persistência, e cada upload recebe chave distinta mesmo para o mesmo arquivo. A validação completa terminou com TypeScript aprovado e 46 arquivos de teste, totalizando 167 testes Vitest aprovados.

## 26/08/2026 — Integridade concorrente de descontos

As atualizações de desconto agora confirmam os valores anteriores de cada item e dos totais do orçamento no momento da escrita, sempre no tenant correto. Havendo alteração concorrente, a transação retorna conflito e não registra uma auditoria que não corresponda ao estado persistido. A validação completa terminou com TypeScript aprovado e 46 arquivos de teste, totalizando 168 testes Vitest aprovados.

## 26/08/2026 — Tipos de mídia permitidos para anexos

Os uploads públicos de solicitação e os anexos de execução de OS agora aceitam somente JPEG, PNG, WEBP, GIF, MP4, WEBM e MOV. Tipos ativos ou genéricos, como SVG e PDF, são recusados antes do armazenamento; o MIME é normalizado antes da persistência e da auditoria. A validação completa terminou com TypeScript aprovado e 46 arquivos de teste, totalizando 169 testes Vitest aprovados.

## 26/08/2026 — Fila comercial de solicitações

A interface de solicitações passou a destacar o trabalho pendente na página atual, itens sem responsável, filas em atenção e a próxima ação de cada solicitação. Filtros rápidos, limpeza de filtros e estado vazio contextual foram adicionados sem alterar o contrato operacional. A tela foi conferida em desktop e mobile; TypeScript e a suíte completa aprovaram 47 arquivos e 171 testes Vitest.

## 26/08/2026 — Central de orçamentos

A fila de orçamentos agora evidencia propostas em preparação, respostas aguardadas e validade em atenção, além de orientar o próximo passo comercial por status. Filtros rápidos, indicadores contextualizados à página, estados vazios e cartões de proposta foram validados em desktop e mobile. TypeScript e a suíte completa aprovaram 48 arquivos e 173 testes Vitest.

## 26/08/2026 — Agenda e pátio operacional

Agenda e pátio passaram a expor pulso operacional por período, capacidade atribuída, OS em execução e bloqueios de avanço. Os cards da agenda e as colunas do pátio agora mostram próxima ação contextual, mantendo a rolagem horizontal acessível no mobile. A validação visual ocorreu em desktop e mobile; TypeScript e a suíte completa aprovaram 49 arquivos e 175 testes Vitest.

## 26/08/2026 — Gestão de estoque

O estoque agora destaca criticidade, itens indisponíveis, reservas e necessidades de reposição no período escolhido. Produtos exibem situação operacional sem revelar custos, enquanto a previsão reforça quantidade sugerida e vínculos com agenda e OS. A tela foi validada em desktop e mobile; TypeScript e a suíte completa aprovaram 50 arquivos e 177 testes Vitest.

## 26/08/2026 — Clientes e veículos

A jornada de atendimento passou a destacar a seleção segura de cliente, veículos vinculados e a próxima ação para avançar no histórico operacional. A interface conecta cadastro, consulta de veículos, histórico de OS e pós-venda em um mesmo contexto do tenant. A tela foi validada em desktop e mobile; TypeScript e a suíte completa aprovaram 51 arquivos e 178 testes Vitest.

## 26/08/2026 — Painel financeiro

O painel financeiro agora evidencia recebimentos pendentes, despesas planejadas e a próxima ação sem alterar a política de permissão nem expor valores a perfis restritos. Receitas e despesas preservam filtros, paginação e confirmações manuais. A interface foi validada em desktop e mobile; TypeScript e a suíte completa aprovaram 52 arquivos e 179 testes Vitest.

## 26/08/2026 — Gestão de compras

A gestão de compras agora evidencia pedidos em aberto, recebimentos parciais e a próxima ação de reposição. O recebimento segue como a única operação que altera o saldo físico, enquanto filtros, paginação e escopo por tenant foram preservados. A interface foi validada em desktop e mobile; TypeScript e a suíte completa aprovaram 53 arquivos e 180 testes Vitest.

## 26/08/2026 — Solicitação pública de orçamento

O cliente agora percorre uma jornada de três etapas: contato, veículo e necessidade. O fluxo mantém o token público seguro, valida somente os campos obrigatórios da etapa, deixa anexos opcionais e usa tipos de mídia explicitamente permitidos. A interface foi validada em desktop e mobile; TypeScript e a suíte completa aprovaram 54 arquivos e 181 testes Vitest.

## 26/08/2026 — Visualização pública de orçamento

A proposta pública agora separa revisão, decisão e próximo passo, apresenta itens e validade de forma mais clara e exige uma confirmação explícita antes de aprovar ou recusar. O link continua sem expor custos internos e preserva a decisão pública existente. TypeScript e a suíte completa aprovaram 55 arquivos e 182 testes Vitest.

## 26/08/2026 — Categorias do catálogo

Os cadastros de categorias agora evidenciam cobertura de produto e serviço, separam o novo agrupamento do conteúdo persistido e oferecem vazio orientado à ação. As operações de criar, editar e excluir preservam a validação por tenant e as confirmações existentes. A interface foi validada em desktop e mobile; TypeScript e a suíte completa aprovaram 56 arquivos e 183 testes Vitest.

## 26/08/2026 — Equipe e permissões

A gestão de equipe agora diferencia membros ativos, administradores e acessos desativados, descreve o alcance de cada papel e identifica o proprietário primário protegido. Convites e alterações continuam executados pelo servidor. A interface foi validada em desktop e mobile; TypeScript e a suíte completa aprovaram 57 arquivos e 184 testes Vitest.

## 26/08/2026 — Revisão transversal de acessibilidade

A navegação ganhou salto direto para o conteúdo principal, foco visível global, seleção com contraste, redução de movimento e controle de redimensionamento lateral por teclado. A navegação principal passou a ter marco semântico e as telas prioritárias continuaram estáveis em desktop e mobile. TypeScript e a suíte completa aprovaram 58 arquivos e 185 testes Vitest.

## 26/08/2026 — Configurações objetivas e linguagem sóbria

Configurações da Oficina foi reorganizada em seções diretas para dados, regras comerciais, mensagem e página pública, com navegação por âncoras e comandos de salvamento claros. Emojis foram removidos das fontes de cliente, mantendo ícones funcionais e uma linguagem visual mais sóbria. A interface foi validada em desktop e mobile; TypeScript e a suíte completa aprovaram 58 arquivos e 185 testes Vitest.
