-- Marca tenants de demonstração sem alterar sua elegibilidade às políticas RLS.
-- A flag serve apenas para identificação administrativa e para rotinas futuras de reset seguro.

alter table public.tenants
  add column if not exists is_demo boolean not null default false;

create index if not exists tenants_is_demo_idx
  on public.tenants (is_demo)
  where is_demo;

comment on column public.tenants.is_demo is
  'Identifica um tenant de demonstração. Não altera autenticação, autorização, RLS ou regras de negócio.';
