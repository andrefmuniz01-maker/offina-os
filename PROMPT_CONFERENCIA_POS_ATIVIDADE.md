# Prompt para conferir a conclusão da atividade

Use este prompt quando a outra tarefa informar que terminou:

```text
A atividade foi realmente concluída e validada de ponta a ponta? Não responda apenas com “sim”. Apresente evidências objetivas e separadas por tópico.

1. Banco e migrações
- A conexão com o banco foi configurada sem expor credenciais?
- As migrações foram aplicadas, incluindo `drizzle/0013_demo_tenant.sql`?
- O comando `pnpm seed:demo` foi executado com sucesso?
- Qual é o ID do tenant `performance-garage` e ele está com `isDemo = true`, status ativo e dados persistidos?

2. Dados da demonstração
- Foram criados os usuários demonstrativos Rafael Martins, Camila Souza e Carlos Henrique sem senha hardcoded?
- Existem configurações, branding, fornecedores, categorias, produtos, saldos de estoque, serviços, clientes, veículos e a solicitação nº 182?
- Os dados estão no tenant correto e não são apenas dados mockados no frontend?

3. Fluxo comercial e operacional
- Foi testado o fluxo real: página pública → solicitação → fila interna → sugestão de orçamento → envio → página pública do orçamento → aprovação → reserva → agendamento → OS → consumo → financeiro → histórico?
- Para cada etapa, informe o registro criado ou atualizado e o resultado observado.
- A aprovação reservou estoque sem dar baixa física? O consumo da OS deu baixa somente na execução?
- O cliente, veículo, serviço, itens e observações foram herdados sem redigitação?

4. Estoque
- O produto “Abafador Esportivo Inox 3\"” ficou com físico 5, reservado 2, disponível 3, necessidade 5 e déficit 2, ou quais foram os valores calculados pela regra real?
- Foram testados compra, recebimento, reserva, consumo, ajuste e inventário?
- Houve alguma inconsistência de saldo ou dupla contagem?

5. Permissões e isolamento
- O dono/admin visualizou dados financeiros e margem?
- O atendente ficou sem custo, margem, lucro e despesas quando a permissão não permite?
- O mecânico acessou apenas a operação permitida e não o financeiro?
- Foi usado um segundo tenant para tentar acessar dados por ID, URL ou request manipulado? O resultado foi negado em todos os casos?
- As mutações validaram o tenant de todos os IDs relacionados?

6. Reset da demonstração
- O botão protegido do Super Admin “Resetar demonstração” foi testado com confirmação?
- O reset registrou o evento `demo.reset` na auditoria?
- Ele apagou e recriou somente os dados da Performance Garage sem afetar outros tenants?
- O reset foi bloqueado caso o tenant não estivesse marcado como demo?

7. Interface e acessibilidade
- As rotas principais foram verificadas em desktop e mobile?
- Foram conferidos carregamento, vazio, erro, foco visível, labels, landmarks e navegação por teclado?
- Houve algum erro no console ou no runtime?

8. Testes finais
- Informe o resultado de `pnpm check`, `pnpm test` e `pnpm build`.
- Informe quantos arquivos e testes passaram.
- Liste qualquer aviso, falha, limitação ou etapa que ainda dependa de ação manual.

Conclua com uma classificação inequívoca:
A) Concluído e validado ponta a ponta;
B) Implementado, mas validação operacional incompleta;
C) Há falhas pendentes.
Não classifique como A se o banco, o fluxo completo, o isolamento entre tenants ou os papéis ainda não tiverem sido testados com evidências.
```

A classificação **A** só deve ser aceita quando houver evidência prática do banco e da interface. Testes automatizados e build aprovados, sozinhos, não comprovam a validação operacional completa.
