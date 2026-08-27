# Passo a passo — Google OAuth no OficinaOS via Supabase Auth

Este guia configura o **Google OAuth por meio do Supabase Auth**, que será a única origem de identidade e sessão do OficinaOS. O Google autentica o usuário; o Supabase emite a sessão; a aplicação aplicará membership, tenant, papel, permissões e RLS.

> **Não crie uma chave, token ou sessão manual no código.** O único segredo deste fluxo é o **Google OAuth Client Secret**, que deve ficar exclusivamente no provider Google do Supabase.

## 1. Criar ou selecionar o projeto no Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com/).
2. No seletor de projeto no topo, crie um projeto ou selecione o que será usado pela empresa.
3. Abra **Google Auth Platform → Branding** e preencha, no mínimo, o nome do aplicativo, e-mail de suporte e e-mail de contato do desenvolvedor.
4. Abra **Google Auth Platform → Audience**. Para teste inicial, mantenha o app em modo de teste e adicione as contas Google de Felipe e André em **Test users**. Quando o produto estiver pronto para clientes, será necessário publicar/verificar a audiência de acordo com a política do Google.
5. Abra **Google Auth Platform → Data Access**. Mantenha somente `openid`, `email` e `profile`. Não adicione escopos de Gmail, Drive ou outros serviços nesta etapa.

## 2. Criar as credenciais Web OAuth no Google

1. Em **Google Auth Platform → Clients**, clique em **Create client**.
2. Escolha **Web application**.
3. Dê um nome identificável, por exemplo: `OficinaOS Web — Produção`.
4. Em **Authorized JavaScript origins**, cadastre exatamente as seguintes origens, sem caminho adicional:

| Ambiente | Origem JavaScript autorizada |
|---|---|
| Produção | `https://oficinaos-zu7j2buy.manus.space` |
| Prévia atual | `https://3000-iz72k18eidr0qsggp1b3e-6a194bae.us2.manus.computer` |
| Desenvolvimento local opcional | `http://localhost:3000` |

5. Em **Authorized redirect URIs**, cadastre **somente** o callback do Supabase:

```text
https://jpvvhowgpuinuuputoot.supabase.co/auth/v1/callback
```

6. Clique em **Create**. Copie o **Client ID** e o **Client Secret**. Não envie o Client Secret pelo chat nem o salve no repositório.

## 3. Configurar o provider Google no Supabase

1. Entre no projeto Supabase **OFFICINA OS**.
2. Abra diretamente: [Authentication → Providers → Google](https://supabase.com/dashboard/project/jpvvhowgpuinuuputoot/auth/providers?provider=Google).
3. Ative **Enable Sign in with Google**.
4. Cole o **Client ID** e o **Client Secret** criados no passo anterior.
5. Deixe **Skip nonce check** desativado.
6. Salve as alterações.

O Client Secret fica guardado pelo Supabase no provider. Ele **não** será configurado como variável `VITE_*`, não será enviado ao navegador e não será versionado.

## 4. Configurar URLs de retorno no Supabase

1. Abra [Authentication → URL Configuration](https://supabase.com/dashboard/project/jpvvhowgpuinuuputoot/auth/url-configuration).
2. Em **Site URL**, configure:

```text
https://oficinaos-zu7j2buy.manus.space
```

3. Em **Redirect URLs**, adicione uma entrada por linha:

```text
https://oficinaos-zu7j2buy.manus.space/auth/callback
https://3000-iz72k18eidr0qsggp1b3e-6a194bae.us2.manus.computer/auth/callback
http://localhost:3000/auth/callback
```

4. Salve.

O callback do **Google** continua sendo o endereço `...supabase.co/auth/v1/callback`. Já `/auth/callback` é o retorno permitido do **Supabase para a aplicação** depois que a pessoa conclui a autorização no Google.

## 5. Confirmar para continuar

Depois de concluir, responda **“Google configurado”**. Não envie valores secretos. Eu validarei se o provider foi ativado e então implementarei o botão Google, o callback `/auth/callback`, a validação dos tokens Supabase no backend e os testes de sessão, papéis e RLS.

## Limite atual do conector

O conector atual conversa com o Supabase para operações de banco, migrations, RLS, Storage, tipos, auditorias e documentação. Ele **não expõe** neste ambiente a operação administrativa de editar o provider Google nem as Redirect URLs. Por isso, estes dois blocos precisam ser alterados no painel administrativo autenticado do Supabase.

## Referências

[1]: https://supabase.com/docs/guides/auth/social-login/auth-google "Supabase — Login with Google"
[2]: https://supabase.com/docs/guides/auth/redirect-urls "Supabase — Redirect URLs"
[3]: https://developers.google.com/identity/openid-connect/openid-connect "Google — OpenID Connect"
