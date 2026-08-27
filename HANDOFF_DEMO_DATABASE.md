# Handoff — Oficina Demo Interna (Supabase-only)

A Oficina Demo já foi provisionada no projeto Supabase **OFFICINA OS** como o tenant interno **Performance Garage**, com slug `performance-garage` e `is_demo=true`.

> Este ambiente é **exclusivo de Super Admins**. Ele não possui `tenant_members`, não aparece por fluxo público e não pode ser acessado por dono, atendente, técnico, cliente ou visitante anônimo. Essa regra está aplicada em RLS, funções privadas de autorização, RPCs de catálogo/estoque/compras e nas RPCs públicas de catálogo e intake.

## Estado comprovado

| Item | Estado |
|---|---:|
| Tenant ativo e demonstrativo | Sim |
| Membros de tenant | 0 |
| Produtos e saldos | 3 / 3 |
| Serviços e kits | 2 / 1 |
| Clientes e veículos fictícios | 2 / 2 |
| Pedido de compra demonstrativo | 1 |
| Catálogo público pelo slug demo | Bloqueado |
| Reset incremental auditado | Validado |

A interface interna é a rota `/demo-interna`, protegida no cliente e por `supabaseAdminProcedure` no backend. O acesso de plataforma parte de `/plataforma`.

## Escopo do seed atual

A demonstração contém apenas domínios cujo fluxo de workspace já usa Supabase: configurações e branding, categorias, fornecedores, produtos, saldos, serviços, kits, clientes, veículos, pedido de compra, itens e movimentações de estoque.

Não foram criados nem devem ser criados por enquanto: solicitações públicas, anexos, orçamentos, reservas, agenda, OS, consumo, receitas, despesas ou contas de usuários demonstrativos. Esses domínios aguardam migração completa para Supabase.

## Operação administrativa

As operações abaixo usam RPCs Supabase autenticadas e somente permitem `platform_role = super_admin`:

| Operação | RPC | Comportamento |
|---|---|---|
| Consultar estado | `platform_demo_status` | Retorna contagens do tenant interno. |
| Provisionar | `platform_provision_incremental_demo` | Idempotente; cria somente se o slug não existir como tenant não-demo. |
| Restaurar | `platform_reset_incremental_demo` | Preserva o tenant e auditoria; apaga/recria somente o escopo incremental. Bloqueia se houver dados nos domínios ainda não migrados. |

A política é deliberada: **não executar `pnpm seed:demo`, migrations Drizzle ou scripts MySQL**. Eles pertencem ao fluxo descontinuado e não representam o estado atual.

## Regras para tarefas futuras

1. Nunca adicionar `tenant_members` ao tenant `performance-garage`; a demonstração deve continuar exclusiva de Super Admin.
2. Nunca permitir `is_demo` como bypass de RLS, acesso de API ou rota pública.
3. Ao ampliar o seed para um novo domínio, migrar e validar primeiro o fluxo desse domínio no Supabase.
4. Manter o reset por ordem de chaves estrangeiras, com lock, escopo fixo pelo slug e auditoria append-only.
5. Antes de publicar mudanças relacionadas, rodar `pnpm check`, `pnpm test` e `pnpm build`, revisar o Security Advisor e atualizar `docs/handoff-supabase-cutover.md`.
