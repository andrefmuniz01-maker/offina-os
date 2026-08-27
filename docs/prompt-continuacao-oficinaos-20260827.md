# Prompt de Continuidade — OficinaOS

Use este prompt como instrução inicial para a próxima sessão de desenvolvimento do **OficinaOS**. O objetivo é continuar o SaaS B2B multi-tenant para oficinas automotivas de forma incremental, segura e comercializável, preservando a arquitetura e as decisões já validadas.

> Trabalhe somente sobre o repositório privado `andrefmuniz01-maker/offina-os`, a branch `main` e o projeto Supabase existente. Não crie projetos, branches, billing, upgrades, trials, domínios pagos ou serviços pagos. Não execute exclusões, reset forçado, alterações irreversíveis de dados ou disparos de e-mail sem evidência e autorização explícita.

## Contexto obrigatório

O OficinaOS usa **Supabase Auth com e-mail e senha** como única sessão humana. O login diário não pode reintroduzir Magic Link, Google OAuth, Manus OAuth, cookies JWT próprios ou outra sessão paralela. O primeiro acesso e a recuperação de senha usam exclusivamente o fluxo de convite/recuperação do Supabase.

A autoridade de acesso deve permanecer no caminho **Supabase Auth → profile → tenant_membership → tenant → role → permissions → RLS**. O frontend pode adaptar a experiência, mas nunca pode conceder ou alterar tenant, papel ou permissões próprias. O sistema ainda possui partes transitórias em MySQL/Drizzle; não declare cutover completo até que cada fluxo tenha sido migrado, validado e protegido ponta a ponta.

Os únicos Super Admins autorizados são os perfis reais de **Felipe** e **André**. O Super Admin concede acesso inicial aos donos; os donos e administradores gerenciam somente os funcionários do próprio tenant. A **Oficina Demo** é interna e exclusiva do Super Admin: não pode aparecer em listas operacionais, catálogo público, intake público, métricas comerciais ou qualquer contexto de cliente.

## Entregas concluídas que não devem ser refeitas

| Área | Estado atual validado |
|---|---|
| Sessão e Platform | O redirecionamento global por erro de módulo foi removido. `auth.me` não retorna token; a Platform permite leituras globais para Super Admin autenticado somente no Supabase e mantém mutações legadas bloqueadas. |
| Multi-tenancy e demo | A oficina demo está visível apenas na Platform. As RPCs públicas a excluem de catálogo e intake. Usuários operacionais não têm membership da demo. |
| Intake público | O formulário usa RPCs Supabase, cria capacidade temporária de upload para Storage privado, valida MIME e tamanho, finaliza anexos de forma controlada e aplica limitação persistida por tenant, contato e impressão de IP. |
| Experiência diária | A Central do dia limita menu, prioridades e métricas por papel. Técnicos ficam no pátio com suas OS atribuídas; não consultam agenda, escala, equipe, orçamento aprovado ou financeiro. |
| Comercial e operação | Uma solicitação deve estar em **Em orçamento** para gerar proposta. Um orçamento aprovado pode abrir a Agenda e Pátio com a proposta pré-selecionada, sem redigitação. |
| Estoque e financeiro | As interfaces de Estoque e Financeiro diferenciam acesso negado de falha técnica e ocultam controles de ajuste, previsão ou financeiro quando o backend devolve `FORBIDDEN`. |

O último estado publicado e validado antes deste prompt contém também a melhoria de acesso ao Financeiro. O repositório deve ser sempre sincronizado por `git fetch github main`, comparação de histórico, merge normal quando necessário e `git push github main`, **sem force push**.

## Prioridades para a próxima execução

| Prioridade | Resultado esperado | Condição de aceite |
|---|---|---|
| P0 | Validar manualmente a sessão publicada de Super Admin | Permanecer mais de cinco segundos na Platform, trocar seção, atualizar a página, fazer logout explícito e novo login sem redirecionamento falso. Não registrar ou expor tokens. |
| P0 | Consolidar testes de autorização e isolamento | Cobrir usuário sem profile, sem papel, sem membership válido, Tenant A × Tenant B, IDOR, técnico sem financeiro e bloqueio de autoelevação. Executar as provas na camada Supabase/RLS e tRPC, não somente na UI. |
| P1 | Completar o fluxo comercial-operacional | Migrar solicitações, orçamento, aprovação, reserva, agenda, OS e consumo de estoque por fluxo inteiro antes de remover qualquer router legado. A aprovação deve reservar; o consumo de OS deve baixar estoque; cancelamento ou alteração deve liberar/resolver reservas transacionalmente. |
| P1 | Permissões e equipe do tenant | Implementar o fluxo em que apenas Super Admin concede acesso inicial ao dono e owner/admin gerencia funcionários do próprio tenant. Persistir auditoria, impedir convite/alteração fora do tenant e não expor e-mails ou identificadores pessoais desnecessariamente. |
| P1 | Consolidar UX de poucos fluxos | Manter a navegação centrada em Central do dia, solicitações/orçamentos, agenda/pátio, estoque/compras, clientes/equipe/configurações e Platform. Não criar abas redundantes; todo módulo precisa de loading, vazio, erro, bloqueio e caminho de retorno. |
| P2 | Remover pontes legadas depois do corte real | Só migrar/remover MySQL, Drizzle, Manus OAuth e cookies próprios quando rotas consumidoras, políticas RLS, dados, anexos e testes de rollback estiverem completos. Documentar o plano antes de cada corte. |

## Regras técnicas de execução

Antes de editar, leia `docs/handoff-supabase-cutover.md`, `todo.md`, as migrations recentes e os routers/páginas do fluxo alvo. Em toda nova mudança, primeiro adicione uma tarefa `[ ]` específica no `todo.md`; conclua-a como `[x]` somente após validação. Para toda modificação de schema, crie migration versionada, use a operação de migration no projeto Supabase existente, valide com o Security Advisor e não use DDL ad hoc. Não criar seed, reviews, clientes, veículos, custos ou operações fictícias.

Mantenha tabelas sensíveis sem acesso REST direto. A lógica privilegiada deve ficar no schema `private`; interfaces autenticadas expostas devem ser `SECURITY INVOKER`; RPCs públicas intencionais devem ter escopo mínimo, `search_path` vazio, ACL estrita, validação de slug/contexto e retorno sem IDs internos. Para anexos, usar Storage privado, capacidade efêmera, paths isolados, URLs assinadas internas e metadados sem bytes no banco.

Não use timers, `setInterval`, `node-cron` ou processos persistentes. Para qualquer tarefa recorrente, leia a skill de atualizações periódicas e preserve o Heartbeat pausado até haver credencial de serviço compatível com Supabase.

## Validação, documentação e publicação

Após cada marco, atualize a documentação de decisão ou handoff e execute `pnpm portability:check && pnpm test && pnpm check && pnpm build && git diff --check`. Revise também os logs de desenvolvimento sem registrar segredos; cabeçalhos, cookies, tokens e URLs de upload temporárias devem permanecer redigidos. Faça checkpoint somente após ler todo o `todo.md`, depois sincronize normalmente o GitHub privado.

O único aviso de segurança conhecido que ainda exige ação administrativa é a proteção contra senhas vazadas do Supabase Auth. Não ativar planos pagos ou upgrades para resolvê-lo; registre a limitação e confirme a elegibilidade gratuita na documentação oficial antes de qualquer alteração de configuração.

## Forma de trabalho esperada

Trabalhe de maneira autônoma em tarefas reversíveis e de baixo risco, comunicando marcos breves. Pare e solicite confirmação somente para ações irreversíveis, criação de custos, novo envio de e-mail, alteração de identidade/papel, mudança de dados reais, compra, billing, projeto/branch Supabase ou configuração que não possa ser validada com segurança. Não encerrar como cutover concluído enquanto houver dependências transitórias ou validações humanas pendentes.
