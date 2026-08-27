# Referência de ambiente

Crie um arquivo local chamado `.env.local` no diretório raiz. Ele é ignorado pelo Git e não deve ser compartilhado. A tabela abaixo descreve todas as variáveis lidas pelo código sem fornecer valores reais.

| Variável | Necessária | Uso | Segurança |
|---|---:|---|---|
| `NODE_ENV` | Sim | Define `development` ou `production` | Não secreta |
| `PORT` | Não | Porta HTTP; padrão controlado pelo host | Não secreta |
| `DATABASE_URL` | Sim durante a ponte legada | Conexão MySQL/TiDB de domínio e Drizzle | **Segredo** |
| `VITE_SUPABASE_URL` | Sim | URL pública do projeto Supabase | Pública |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim | Chave pública de autenticação Supabase para o cliente | Pública, nunca usar `service_role` |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim no runtime atual | Operações administrativas controladas do servidor, intake público validado e leitura de perfis | **Segredo; somente servidor** |
| `JWT_SECRET` | Somente compatibilidade legada | Não usar para sessões humanas; substituir antes de reativar legados | **Segredo** |
| `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID` | Somente compatibilidade transitória | Não usar para autenticação humana | Tratar como configuração sensível |
| `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Opcional | Recursos internos de ambiente gerenciado | Chave é **segredo** |
| `VITE_FRONTEND_FORGE_API_URL`, `VITE_FRONTEND_FORGE_API_KEY` | Opcional | Recursos expostos pelo ambiente gerenciado ao frontend | Configurar pelo provedor; nunca copiar chaves privadas |

> O prefixo `VITE_` torna o valor disponível ao navegador. Portanto, somente URL pública e Publishable Key do Supabase podem ser usadas nesse grupo. Nunca inclua senha, `DATABASE_URL`, token administrativo ou `service_role` em uma variável `VITE_`.

## Exemplo de estrutura local

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=<url-segura-do-banco-legado>
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-do-servidor>
```

Os placeholders acima não são valores funcionais. Configure os valores reais somente no cofre de segredos do seu ambiente ou em um arquivo local não versionado. A `SUPABASE_SERVICE_ROLE_KEY` nunca pode receber o prefixo `VITE_`, nunca deve ser enviada ao navegador e não deve aparecer em logs.
