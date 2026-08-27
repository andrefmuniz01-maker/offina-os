# Reconciliação de migrations aplicadas — 27 de agosto de 2026

## Motivo

Durante a preparação da migração do detalhe de ordem de serviço, o histórico do projeto Supabase apresentou três migrations aplicadas que não possuem arquivo correspondente no repositório sincronizado: `work_order_workspace_rpcs_v2`, `workspace_management_rpcs` e `workspace_team_read_rpc`.

Essa divergência é um risco de portabilidade e de segurança. Não foi criado dado operacional, alterado tenant, usuário ou reserva durante a investigação.

## Inventário observado

| Superfície encontrada | Situação no repositório | Risco identificado | Medida aplicada |
|---|---|---|---|
| Detalhe, checklist, status, consumo e apontamentos de OS | Sem migration-fonte correspondente | Técnico era autorizado por tenant, sem escopo por OS; a mudança de status podia gerar receita esperada | Execução revogada para `anon` e `authenticated` pela migration `0040`. |
| Dashboard de workspace | Sem fonte correspondente | Função `SECURITY DEFINER` executável por usuário autenticado | Lógica movida para `private` e fachada `SECURITY INVOKER` criada pela migration `0041`. |
| Leitura de agenda e pátio | Fonte `0038` existe | Não identificado novo desvio | Mantida com projeções sem custo, margem ou contato. |

> A continuidade da tela de detalhe de OS só pode ocorrer depois de reconstruir contratos de fonte para cada função revogada, incluindo validação por `work_order_id`, transições permitidas, consumo somente de reserva ativa e ausência de lançamento financeiro automático.

## Evidência de privilégios após o bloqueio

| Verificação | Resultado |
|---|---|
| `anon` executa detalhe de OS revogado | Não |
| `authenticated` executa detalhe de OS revogado | Não |
| `anon` executa dashboard | Não |
| `authenticated` executa fachada de dashboard | Sim, somente mediante validação interna de tenant/papel |

O Security Advisor voltou aos dois avisos conhecidos: catálogo público limitado e proteção de senhas vazadas indisponível no plano atual. Nenhuma nova função `SECURITY DEFINER` exposta foi deixada na superfície autenticada.

## Próximo passo obrigatório

Reconstruir em migrations versionadas as rotinas de OS antes de conceder novamente `EXECUTE`. A implementação deverá manter o código privilegiado em `private`, expor apenas fachadas `SECURITY INVOKER`, validar tenant ativo e associação do técnico à OS específica e proibir criação de receita, notificação externa ou baixa sem reserva ativa.
