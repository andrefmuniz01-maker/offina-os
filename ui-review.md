# Revisão de interface e acessibilidade

Revisão realizada em 26/08/2026 sobre as rotas prioritárias do OficinaOS. O objetivo é registrar os controles existentes e os limites de validação, sem declarar como verificado um estado que não foi exercitado no tenant real.

| Superfície | Carregamento | Vazio | Erro | Acessibilidade observada |
|---|---|---|---|---|
| Solicitações e orçamentos | Skeleton/indicadores de consulta | Mensagem contextual aos filtros | Mensagem da consulta | `main`, filtros rotulados, atalhos em botões e foco global. |
| Agenda, estoque e financeiro | Skeletons por bloco | Lista ou previsão sem itens | Mensagem de consulta e restrição de permissão | `main`, tabelas/cartões responsivos, campos rotulados. |
| Clientes, notificações, relatórios e auditoria | Estados por consulta | Histórico, fila ou evento sem registros | Mensagem de consulta | `main`, busca rotulada, navegação e botões sem ação automática externa. |
| Configurações | Skeleton | Ausência de vínculo com instrução | Mensagem recuperável com recarregamento | `main`, `nav` de âncoras, `label` para campos e foco global. |
| Solicitação pública | Carregamento da oficina | Não se aplica ao formulário inicial | Mensagem de oficina indisponível | Etapas identificadas, campos rotulados e progresso textual. |
| Orçamento público | Carregamento da proposta | Não se aplica | Proposta indisponível para token inválido | Conteúdo objetivo, decisão explicitamente confirmada quando há proposta. |
| Rota não encontrada | Não se aplica | Não se aplica | Estado público em português | Um título de nível um e um único comando de retorno. |

## Controles globais confirmados

O documento declara `lang="pt-BR"`. A estrutura interna oferece um salto para o conteúdo principal, um marco de navegação com nome acessível, foco visível global, respeito a movimento reduzido e redimensionamento da barra lateral por teclado. As telas priorizadas utilizam rótulos associados aos campos e evitam ícones decorativos como único meio de comunicação.

## Limites conhecidos

Os estados visualizados diretamente foram os carregados, os vazios disponíveis e os erros públicos por token/rota inválida. Estados de falha de cada consulta protegida são implementados e revisados estaticamente; sua simulação visual por rota exige interromper ou adulterar consultas do tenant real, o que não foi feito para preservar os dados operacionais. A validação visual por papel permanece dependente de sessões reais de atendente e técnico.
