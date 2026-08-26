# Verificação de custo e bloqueio de acesso — Google OAuth

## Evidência verificada

O Google Cloud informa que a criação de um projeto pode ocorrer sem associação automática a uma conta de faturamento; a própria documentação diferencia a criação do projeto da ação posterior de associar billing. A documentação do Google Workspace trata a habilitação de faturamento como opcional, dependendo das APIs e serviços escolhidos. Para o fluxo planejado do OficinaOS, serão usados somente OAuth/OpenID Connect com `openid`, `email` e `profile`, sem habilitar APIs pagas, Compute, Storage, banco de dados ou Identity Platform. [1] [2]

| Ação | Situação de custo | Decisão adotada |
|---|---|---|
| Criar projeto Google Cloud | Pode ser feito sem associar billing | **Não executar antes de recuperar o acesso** |
| Ativar período de teste/crédito de US$ 300 | Pode exigir criação/associação de faturamento | **Não ativar** |
| Criar OAuth Client Web | Não é uma API de consumo paga | Executar somente depois de confirmar que não há billing associado |
| Google OAuth/OpenID Connect com escopos básicos | Não requer habilitar APIs pagas | Manter somente `openid`, `email`, `profile` |
| Provider Google no Supabase | Usa o Supabase já existente | Sem criar projeto ou branch adicional |

> **Não há garantia honesta de custo zero absoluto para qualquer conta Google Cloud**, pois custos só aparecem quando uma conta de billing é associada ou serviços faturáveis são habilitados/consumidos. O plano seguro adotado é não ativar teste, créditos ou billing e não habilitar serviços pagos.

## Bloqueio atual

O console Google Cloud da conta autenticada de André está exibindo **“Acesso ao Google Cloud bloqueado”** e pede ativação de MFA em duas etapas. Enquanto isso não for concluído pelo titular, a lista de projetos não carrega e não é seguro nem possível criar/selecionar a credencial OAuth.

## Próximo passo seguro

1. O titular habilita MFA na própria conta Google, sem compartilhar senha, código ou dispositivo.
2. Eu confirmo a existência de um projeto sem conta de billing associada.
3. Somente então crio o OAuth Client Web com os redirects do Supabase, sem clicar em "Comece gratuitamente" nem ativar cobrança.
4. Antes de salvar qualquer credencial, apresento o estado de billing e peço confirmação se o console mostrar qualquer associação de pagamento.

## Referências

[1]: https://developers.google.com/workspace/guides/create-project "Google Developers — Create a Google Cloud project"
[2]: https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects "Google Cloud — Create projects"
