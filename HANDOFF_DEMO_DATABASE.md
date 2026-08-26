# Handoff — validação real do banco da demonstração

A implementação do tenant demonstrativo está sincronizada na branch `main` do repositório `andrefmuniz01-maker/offina-os`. Os commits relevantes são `01a46fa`, `b1a0b2c`, `53a5867` e `f42a0f4`.

## O que a outra tarefa precisa executar

1. Configurar `DATABASE_URL` com uma conexão MySQL compatível com o projeto. Não registrar a credencial no repositório.
2. Aplicar as migrações do Drizzle, incluindo `drizzle/0013_demo_tenant.sql`, usando o procedimento oficial do ambiente.
3. Executar `pnpm seed:demo` para criar ou atualizar a **Performance Garage** como tenant real, com `isDemo = true`.
4. Confirmar no banco que o tenant possui status ativo, identidade, configurações, usuários demonstrativos, catálogo, estoque, serviços, clientes, veículos e a solicitação nº 182.
5. Validar que a aplicação encontra o tenant pelo slug público `performance-garage` e que o formulário público não exige login.
6. Validar o fluxo operacional real: solicitação pública → fila interna → sugestão/orçamento → envio → visualização pública → aprovação → reserva de estoque → agendamento → OS → consumo → receita/financeiro → histórico.
7. Validar os papéis separadamente: dono/admin pode acessar dados financeiros; atendente não deve visualizar custo, margem ou lucro quando as permissões não permitirem; mecânico deve acessar somente a operação atribuída e não o financeiro; Super Admin deve enxergar o tenant na plataforma e o selo **Ambiente demonstrativo**.
8. Executar o botão **Resetar demonstração** no Painel de Super Admin, confirmar a ação e verificar que somente o tenant `performance-garage` foi limpo e repopulado, com evento `demo.reset` na auditoria.
9. Testar isolamento criando ou utilizando um segundo tenant: nenhum cliente, veículo, produto, orçamento, OS, financeiro, anexo ou auditoria de outro tenant pode ser consultado ou associado por manipulação de IDs ou URL.
10. Repetir a validação em desktop e mobile, registrando estados de carregamento, vazio, erro, foco visível e navegação por teclado nas rotas principais.

## Comandos de validação

```bash
pnpm check
pnpm seed:demo
pnpm test
pnpm build
```

Para restaurar a demonstração pelo terminal, somente em ambiente administrativo controlado:

```bash
pnpm seed:demo -- --reset
```

O reset também está exposto ao Super Admin pelo roteador `platform.resetDemo` e pelo botão da página de plataforma. A rotina bloqueia o reset se o slug não estiver marcado como tenant demonstrativo. A execução do seed/reset deve ser feita apenas depois de confirmar a conexão correta e realizar backup conforme a política do ambiente.

## Resultado esperado

A tarefa só deve marcar o processo como concluído após confirmar no banco e na interface o fluxo completo, os efeitos de estoque/financeiro/histórico, o isolamento entre tenants e o comportamento por papel. Os testes automatizados existentes cobrem 187 casos, mas não substituem a validação operacional com banco configurado.
