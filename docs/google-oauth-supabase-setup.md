# Configuração obrigatória: Google OAuth via Supabase Auth

## Estado atual auditado

O provedor de e-mail está habilitado no Supabase, mas o provedor **Google está desabilitado**. A aplicação ainda possui callback e sessão do Manus OAuth; eles não devem coexistir com o fluxo final do Supabase Auth. Não foi possível alterar URLs no painel Supabase porque a sessão administrativa do navegador não concluiu o login.

## Valores reais a cadastrar

| Local | Campo | Valor |
|---|---|---|
| Google Cloud Console | Tipo de credencial | **OAuth client ID → Web application** |
| Google Cloud Console | Authorized JavaScript origin (produção) | `https://oficinaos-zu7j2buy.manus.space` |
| Google Cloud Console | Authorized JavaScript origin (prévia atual) | `https://3000-iz72k18eidr0qsggp1b3e-6a194bae.us2.manus.computer` |
| Google Cloud Console | Authorized redirect URI | `https://jpvvhowgpuinuuputoot.supabase.co/auth/v1/callback` |
| Supabase → Authentication → URL Configuration | Site URL | `https://oficinaos-zu7j2buy.manus.space` |
| Supabase → Authentication → URL Configuration | Redirect URL (produção) | `https://oficinaos-zu7j2buy.manus.space/auth/callback` |
| Supabase → Authentication → URL Configuration | Redirect URL (prévia atual) | `https://3000-iz72k18eidr0qsggp1b3e-6a194bae.us2.manus.computer/auth/callback` |
| Supabase → Authentication → Providers → Google | Enable Google provider | **Ativo** |
| Supabase → Authentication → Providers → Google | Client ID / Client Secret | Valores gerados pelo Google Cloud Console |

Para desenvolvimento local, adicione também `http://localhost:3000` como origem JavaScript e `http://localhost:3000/auth/callback` como Redirect URL do Supabase. O callback cadastrado no Google continua sendo somente o callback do Supabase.

## Google Cloud Console

1. Abra **Google Cloud Console → Google Auth Platform → Branding**, complete nome do app, e-mail de suporte e contatos.
2. Em **Audience**, selecione os usuários permitidos. Enquanto o app estiver em teste, inclua Felipe e André como test users nas respectivas contas Google.
3. Em **Data Access (Scopes)**, mantenha apenas `openid`, `email` e `profile`. Não solicite escopos adicionais nesta fase.
4. Em **Clients**, crie o cliente OAuth de tipo **Web application** e use exatamente as URLs da tabela.
5. Copie o Client ID e o Client Secret para o provider Google no painel do Supabase. O Client Secret **não deve** ser enviado ao frontend, inserido em `.env` cliente ou versionado no repositório.

## Condição para continuar

Após habilitar o provider Google e cadastrar as URLs, confirme que a configuração foi salva. Em seguida, a aplicação poderá chamar `signInWithOAuth({ provider: 'google' })`, usar o callback `/auth/callback` e validar somente tokens emitidos pelo Supabase Auth.
