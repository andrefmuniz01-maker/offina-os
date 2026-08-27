# Registro de decisão — autenticação humana

**Status:** vigente em 27 de agosto de 2026. Este registro prevalece sobre hipóteses antigas de Magic Link recorrente, Google OAuth e Manus OAuth no backlog histórico.

## Decisão

O OficinaOS adotará **Supabase Auth com e-mail e senha como única identidade e sessão humana**. O acesso diário usa `signInWithPassword`; a recuperação de senha permanece disponível exclusivamente para primeiro acesso e esquecimento de senha, por `resetPasswordForEmail`, com retorno ao callback da aplicação. O Supabase documenta esses dois fluxos e exige que a URL de retorno esteja cadastrada para o fluxo de recuperação.[1]

> A recuperação por e-mail não é um segundo método de login recorrente. Ela é uma etapa excepcional para uma identidade já provisionada definir ou trocar a própria senha.

| Aspecto | Decisão vigente | Limite de segurança |
|---|---|---|
| Sessão humana | Supabase Auth | Não criar cookies próprios, JWT paralelo ou sessão Manus. |
| Entrada diária | E-mail e senha | O cliente nunca escolhe tenant, papel ou permissões. |
| Primeiro acesso | Recuperação de senha por e-mail | Disponível somente após provisionamento administrativo controlado. |
| Inscrição pública | Bloqueada | O frontend não chama `signUp`. |
| Concessão inicial de acesso | Super Admin global | Dono/Admin só gerencia funcionários do tenant próprio. |
| Identidades globais desejadas | Felipe e André | André permanece pendente até existir identidade Auth verificável; nenhum UUID ou senha é inventado. |
| Autorização | profile → tenant_members → tenant → role → permissions → RLS | Backend e RLS são a autoridade; UI é apenas uma camada de apresentação. |

## Estado de implementação observado

O formulário de acesso usa `supabase.auth.signInWithPassword`, exige ao menos dez caracteres na interface e encaminha para `/auth/callback` após a sessão ser criada. A ação “Primeiro acesso ou esqueceu a senha?” chama `resetPasswordForEmail` com a mesma origem e callback. O callback reconhece o modo de recuperação, exige uma nova senha com minúscula, maiúscula e número e só então chama `updateUser`. Esses comportamentos estão no código atual em [DashboardLayout](../client/src/components/DashboardLayout.tsx) e [AuthCallback](../client/src/pages/AuthCallback.tsx).

O fluxo ainda **não está pronto para declarar cutover completo**. A sessão e o contexto Supabase existem, porém routers de domínio e parte da identidade/membership continuam híbridos com MySQL. A remoção do fallback e a validação real no domínio publicado só podem ocorrer depois de login por senha, perfil, membership, autorização e isolamento entre tenants verificados ponta a ponta.

## Reclassificação do backlog histórico

| Itens históricos | Novo status | Motivo |
|---|---|---|
| 38 | Arquivado | Teste de OAuth legado não corresponde à identidade alvo. |
| 53, 68, 80 e 83 | Arquivados | Magic Link recorrente foi substituído por senha; e-mail permanece somente para recuperação/primeiro acesso. |
| 58–67 | Arquivados | Google OAuth não faz parte da decisão vigente e não deve disparar configuração de Cloud, billing ou domínio. |
| 69 | Mantido como evidência histórica | As URLs/callbacks configurados continuam relevantes para recuperação por e-mail, não para Magic Link recorrente. |
| 70 | Reescrito | O provisionamento administrado continua necessário, mas a conclusão de senha será por recuperação. |
| 84–87 | Ativos | Cobrem a migração para e-mail/senha, André real, convite único quando permitido e negativos de autorização. |
| 112 | Ativo e bloqueado por plano | Proteção contra senhas vazadas exige plano não gratuito; não habilitar billing ou upgrade. |

## Próxima sequência segura

Primeiro, Felipe deve completar a recuperação e entrar no domínio publicado com senha, validando persistência de sessão, logout, callback e acesso global sem fallback indevido. Depois, quando o limite de e-mail permitir, André poderá receber **um único** convite/recuperação administrativa; somente uma identidade Supabase Auth real e o profile correspondente podem ser promovidos. Em seguida, os testes de ausência de profile, membership e papel devem negar contexto e procedures protegidas. Nenhuma dessas etapas permite exclusão de dados MySQL, criação de identidades fictícias, coleta de senha em chat ou alteração de papel/tenant pelo usuário autenticado.

## Referências

[1]: https://supabase.com/docs/guides/auth/passwords "Supabase Docs — Password-based Auth"
