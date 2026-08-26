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

Os logs do Auth registram `mail.send` apenas para o convite inicial às **21:58 UTC**. Eles também mostram tentativas posteriores de `/verify` recusadas com `403: Email link is invalid or has expired`, o que impede reutilizar links antigos. Não houve um novo evento `mail.send` visível após o comando de reenvio no painel. O limite do projeto está configurado em **2 e-mails por hora**; portanto, não serão disparadas novas tentativas até concluir a verificação de template e do mecanismo de entrega, evitando consumir o limite e invalidar links anteriores.

## Referências

[1]: https://supabase.com/docs/guides/auth/auth-email-passwordless "Supabase — Passwordless email logins"
[2]: https://supabase.com/docs/guides/auth/redirect-urls "Supabase — Redirect URLs"
