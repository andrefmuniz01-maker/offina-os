# Diagnóstico do incidente histórico de publicação e acesso

**Status:** concluído em 27 de agosto de 2026. Esta análise não alterou infraestrutura, código de deploy, dados, usuários, credenciais ou configurações de cobrança.

## Conclusão

O erro relatado no histórico de publicação foi uma falha de **leitura de logs da infraestrutura**, identificada por `ResourceExhausted` e `RATE_LIMIT_EXCEEDED` para a métrica `logging.googleapis.com/read_requests`. A mensagem registrou três tentativas de buscar logs sem disponibilizar um erro de build, inicialização ou runtime da aplicação. Portanto, a evidência disponível não atribui o incidente a código do OficinaOS.

Após esse evento, checkpoints sucessivos foram publicados. Na verificação atual, o domínio publicado respondeu com a tela de acesso por e-mail e senha, e os logs de produção registraram apenas a inicialização normal do servidor em `localhost:3000`. A prévia local também recebeu respostas HTTP 200 para a consulta de sessão sem autenticação. Esses resultados mostram que **não há defeito ativo conhecido no caminho de acesso**.

| Aspecto | Evidência observada | Classificação |
|---|---|---|
| Falha histórica | Quota excedida para leitura de logs do provedor | Infraestrutura de observabilidade; não é evidência de erro de aplicação. |
| Build atual | Portabilidade, TypeScript e build aprovados antes dos checkpoints recentes | Aplicação compilável. |
| Produção atual | Domínio público carregou a tela de login; runtime iniciou normalmente | Acesso disponível no momento da verificação. |
| Sessão anônima | Consulta `auth.me` retornou HTTP 200 e usuário nulo | Comportamento esperado antes de login. |

> Não houve correção de código porque o incidente não apresentou causa raiz atribuível à aplicação e a produção atual está respondendo normalmente.

## Prevenção e procedimento futuro

Se a coleta de logs do deploy voltar a ser limitada, não se deve editar a aplicação em resposta a esse erro isolado. Primeiro, confirmar se o checkpoint foi salvo, consultar o domínio publicado e verificar os logs de runtime com uma única leitura limitada. Somente um erro repetível de build, saúde ou runtime deve abrir uma investigação de código.

O aviso de bundle cliente acima de 500 kB permanece uma melhoria de desempenho não bloqueante; ele não explica o incidente de quota de logs nem impede o carregamento atual. Não foram solicitados nem usados aumentos de quota, plano pago, créditos ou outro provedor.
