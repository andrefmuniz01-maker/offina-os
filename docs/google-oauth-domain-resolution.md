# Resolução de domínio gratuito — Google OAuth + Supabase

## Diagnóstico

O Google OAuth usa três campos diferentes, com regras distintas. O erro informado não exige comprar um domínio `.com` ou `.org`; ele indica que uma URL foi provavelmente adicionada ao campo de **domínios de branding/autorizados**, em vez de ser cadastrada como **origem JavaScript** ou **URI de redirecionamento**.

| Local de configuração | Valor correto nesta arquitetura | Não cadastrar ali |
|---|---|---|
| Google Auth Platform → **Branding** → Domínios autorizados | Nenhum domínio adicional nesta etapa, salvo domínio próprio que seja efetivamente controlado/validado | URL completa do OficinaOS, caminho `/auth/callback`, URL de preview ou `localhost` |
| Google Auth Platform → **Clientes** → Origens JavaScript autorizadas | A origem da aplicação, sem caminho: `https://oficinaos-zu7j2buy.manus.space`; durante desenvolvimento, `http://localhost:3000` | Callback do Supabase e URLs com caminho |
| Google Auth Platform → **Clientes** → URIs de redirecionamento autorizados | `https://jpvvhowgpuinuuputoot.supabase.co/auth/v1/callback` | URL pública do OficinaOS ou `/auth/callback` |
| Supabase Auth → URL Configuration | A URL pública do OficinaOS e seu callback de aplicação | O callback Google/Supabase, que pertence ao cliente Google |

> O fluxo correto é: **OficinaOS → Supabase Auth → Google → callback do Supabase → callback autorizado da aplicação**. O callback que o Google precisa conhecer é exclusivamente o callback do projeto Supabase.

## Estratégia sem custo

Não será adquirido domínio, ativado trial, associado billing ou criada branch paga. O projeto Google `oficinaos-oauth` e a tela de consentimento já foram criados sem essas ações. O domínio gratuito publicado `oficinaos-zu7j2buy.manus.space` deve ser cadastrado somente como origem completa no cliente OAuth se o console o aceitar. Se o Google rejeitá-lo por regra do domínio compartilhado, o cliente OAuth pode ser mantido com o callback Supabase e o desenvolvimento pode ser testado em `http://localhost:3000`; a URL publicada só será ativada após validação explícita do domínio gratuito aceito pelo provider.

## Fontes verificadas

O guia do Supabase para Google determina que clientes Web incluam a URL da aplicação em **Authorized JavaScript origins** e o callback do projeto Supabase em **Authorized redirect URIs**. Também orienta registrar Client ID e Client Secret exclusivamente na configuração do provider Google no Supabase. [1]

O guia de redirects do Supabase estabelece que a URL usada como `redirectTo` precisa estar na allow list de **URL Configuration**, sendo diferente do callback do cliente OAuth no Google. [2]

A documentação do Google exige que a URI de redirecionamento corresponda exatamente a uma URI autorizada, incluindo esquema e barra final quando aplicável, e alerta para não expor o Client Secret. [3]

## Referências

[1]: https://supabase.com/docs/guides/auth/social-login/auth-google "Supabase — Login with Google"
[2]: https://supabase.com/docs/guides/auth/redirect-urls "Supabase — Redirect URLs"
[3]: https://developers.google.com/identity/protocols/oauth2/web-server "Google — OAuth 2.0 for Web Server Applications"
