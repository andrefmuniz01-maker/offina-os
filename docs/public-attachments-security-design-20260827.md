# Desenho de segurança — anexos públicos e limitação de abuso

**Status:** decisão técnica preparada em 27 de agosto de 2026. Nenhuma migration, bucket adicional, policy nova, upload ou dado operacional foi criado por este documento.

## Diagnóstico confirmado

O formulário público atual envia no máximo cinco anexos de 5 MB como Data URLs à procedure tRPC transitória `quoteRequests.submitPublic`. O backend valida MIME, base64 e tamanho, mas persiste os bytes no Storage legado por `storagePut`. O bloqueio de reenvio atual usa apenas o WhatsApp normalizado e uma janela de dez minutos. O caminho Supabase de solicitação pública está aplicado como RPC, porém a interface ainda usa o router legado; portanto uma migration de Storage isolada agora criaria dois caminhos de gravação e não resolveria o risco de forma completa.

O projeto Supabase gratuito já possui o bucket privado `oficina-private`, sem limite de tamanho ou lista de MIME configurados. Buckets privados submetem downloads e operações às policies RLS; uploads não são permitidos sem uma policy explícita em `storage.objects`.[1] [2]

| Risco atual | Estado | Decisão |
|---|---|---|
| Bytes de anexos no Storage legado | Transitório | Não criar anexos novos nesse caminho após a virada do intake Supabase. |
| Upload público direto | Ainda inexistente | Não criar policy `anon` ampla em `storage.objects`. |
| Reenvio repetido | Mitigação básica por WhatsApp | Adicionar limitação por tenant, contato, IP normalizado e janela persistida no caminho Supabase. |
| URL de anexo | Storage legado devolve URL interna | No Supabase, manter bucket privado e gerar URL assinada somente para usuário interno autorizado. |
| Limites de arquivo | Validação no cliente e servidor legado | Reforçar no bucket Supabase com 5 MB e lista de MIME, mantendo a validação de aplicação. |

## Arquitetura de destino

O destino é um único fluxo Supabase, sem passagem de bytes pelo MySQL ou pelo Storage legado. A solicitação pública cria primeiro a `quote_request` por RPC limitada e devolve apenas o protocolo ao usuário. Quando houver anexos, a RPC retorna também uma **capacidade de upload efêmera**, aleatória e opaca, associada exclusivamente àquela solicitação, ao tenant e a no máximo cinco objetos. A capacidade expira em dez minutos e nunca é usada para leitura.

O navegador envia cada arquivo a um prefixo não enumerável no bucket privado. Uma policy de `INSERT` para `anon` valida bucket, prefixo, expiração, escopo e contagem mediante função `SECURITY DEFINER` privada com `search_path=''`; ela não concede `SELECT`, `UPDATE`, `DELETE`, listagem, nem acesso a outro prefixo. A capacidade de upload é verificada por hash no banco e não é devolvida aos usuários internos ou persistida em logs/auditoria.

| Etapa | Autoridade | Entrada permitida | Saída limitada |
|---|---|---|---|
| 1. Criar solicitação | RPC pública Supabase | Campos comerciais validados e contato normalizado | Protocolo público e capacidade efêmera somente se necessário. |
| 2. Enviar anexo | Storage privado + RLS | MIME permitido, até 5 MB, prefixo da capacidade válida | Objeto privado; nenhum URL público. |
| 3. Registrar metadado | RPC interna transacional | Objeto já validado no prefixo da solicitação | Registro `attachments` com tenant, request, chave, MIME e tamanho. |
| 4. Consultar internamente | RLS do workspace | Sessão Supabase + membership ativo | URL assinada de curta duração por objeto autorizado. |

> O token de upload não substitui a autorização do usuário interno. Ele é uma capacidade transitória, de uso estrito para anexar arquivos a uma solicitação pública recém-criada.

## Rate limit necessário

O throttle persistido deve rejeitar antes de gerar solicitações, notificações ou capacidades de upload. A chave de limitação deve combinar `tenant_id`, WhatsApp normalizado e uma impressão do IP que não fique exposta ao cliente. O limite inicial proposto é de uma criação por contato/tenant a cada dez minutos, com um teto adicional por IP/tenant em janela curta. Os números finais devem ser adotados apenas junto da migration e cobertos por testes de expiração, concorrência e isolamento entre tenants.

A implementação não pode depender de memória de processo, `setInterval` ou cron. Em ambiente escalável, a contagem e a expiração devem ser validadas transacionalmente em PostgreSQL, para que instâncias paralelas apliquem a mesma regra. A limpeza de registros expirados não é pré-requisito: consultas indexadas por expiração podem ignorá-los e a remoção futura, se necessária, seguirá o mecanismo agendado aprovado do projeto.

## Sequência de implementação bloqueada

1. Migrar o formulário público e o router tRPC para a RPC Supabase de intake, removendo o caminho duplo antes de desligar o legado.
2. Criar migration versionada para tabela privada de capacidades, índice de expiração, bucket privado com restrições de MIME/tamanho e policies mínimas de `storage.objects`.
3. Aplicar a migration exclusivamente no projeto existente e gratuito, reexecutar o Security Advisor e registrar o resultado. Não criar branch, projeto, billing, bucket público ou policy de leitura anônima.
4. Implementar a emissão, o consumo e a expiração da capacidade; testar tentativas entre tenants, token expirado, MIME/tamanho proibidos, sexto arquivo e leitura anônima negada.
5. Criar endpoint interno autorizado para URL assinada temporária e só então remover novos uploads do Storage legado.

## Critérios de saída

O fluxo só pode ser considerado migrado quando o navegador não enviar bytes para o router legado, o bucket não permitir URL pública/listagem/leitura anônima, cada anexo estiver ligado a uma solicitação e tenant reais, o upload expirado ou fora de escopo falhar, e a equipe autorizada conseguir abrir o arquivo por URL temporária. Até lá, o risco de anexos públicos continua documentado e o MySQL/Storage legado não será removido.

## Referências

[1]: https://supabase.com/docs/guides/storage/buckets/fundamentals "Supabase Storage Buckets"
[2]: https://supabase.com/docs/guides/storage/security/access-control "Supabase Storage Access Control"
