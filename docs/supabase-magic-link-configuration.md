# Configuração ativa — Supabase Magic Link

## Decisão de autenticação

O Google OAuth foi interrompido após falhas externas do Google Cloud na criação do cliente Web. O OficinaOS adotará **Magic Link de e-mail nativo do Supabase Auth** como única fonte de identidade e sessão. Não foram ativados billing, testes, créditos, domínio pago ou provider externo.

## Configuração verificada no Supabase

| Configuração | Valor aplicado |
|---|---|
| Provider de e-mail | Habilitado |
| Site URL | `https://oficinaos-zu7j2buy.manus.space` |
| Redirect URL de produção | `https://oficinaos-zu7j2buy.manus.space/auth/callback` |
| Redirect URL da prévia atual | `https://3000-iz72k18eidr0qsggp1b3e-6a194bae.us2.manus.computer/auth/callback` |
| Google provider | Desativado |
| Cadastro automático de identidade no Magic Link | Será bloqueado no cliente com `shouldCreateUser: false` |
| Autoinscrição pública no Supabase Auth | Desativada no painel em 26/08/2026; após recarregar, o próprio controle carregado retornou `aria-checked=false` / `data-state=unchecked` para “Allow new users to sign up” |

## Regra de segurança

O Magic Link será solicitado com `shouldCreateUser: false`. Além dessa proteção no cliente, o Supabase Auth está com a autoinscrição pública desativada e o provider de e-mail permanece habilitado. Assim, uma pessoa sem identidade Supabase já provisionada não ganha conta por simplesmente informar um e-mail. A associação posterior continuará exigindo `auth.users → profiles → tenant_members → tenant → role → RLS`; a interface nunca definirá tenant, papel ou permissão.

## Diagnóstico de entrega — 26/08/2026

Os logs do Auth registram `mail.send` para o Magic Link solicitado pelo formulário oficial às **22:41 UTC**, seguido de `/verify` com `303` e evento de login às **22:42 UTC**. Eles também mostram tentativas posteriores de `/verify` recusadas com `403: Email link is invalid or has expired`, o que impede reutilizar links antigos. No domínio publicado, novas solicitações de `/otp` foram registradas e bloqueadas por `429: email rate limit exceeded`; depois do limite, o Auth também registrou `422: Signups not allowed for otp`. O limite do projeto está configurado em **2 e-mails por hora**; portanto, não serão disparadas novas tentativas até a janela de envio liberar, evitando consumir o limite e invalidar links anteriores.

Após o primeiro login, confirmou-se que a ponte temporária MySQL ainda associava Felipe ao papel legado `platform_user`, embora seu perfil Supabase real já fosse `super_admin`. O registro legado existente foi atualizado de forma controlada, por e-mail verificado e sem criar identidade, tenant ou permissão nova. A correção definitiva continua sendo a migração integral para `profiles` e `tenant_members` no Supabase.

## Referências

[1]: https://supabase.com/docs/guides/auth/auth-email-passwordless "Supabase — Passwordless email logins"
[2]: https://supabase.com/docs/guides/auth/redirect-urls "Supabase — Redirect URLs"
