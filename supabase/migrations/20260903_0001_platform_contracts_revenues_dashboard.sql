-- Contratos comerciais (prospect -> oficina), receitas avulsas lançadas
-- manualmente e um painel de métricas (Visão Geral) para o Super Admin.
-- Decisões (fechadas via /grill-me com o usuário em 2026-09-03):
--   * Contrato nasce como prospect (sem tenant_id) ou já vinculado a uma
--     oficina existente (renovação/reajuste). Ao ser fechado sem oficina
--     vinculada, o Super Admin pode gerar a oficina a partir dele.
--   * Fluxo de status é só pra frente: negotiating -> closed -> cancelled.
--     Valor mensal não muda depois de fechado (reajuste = novo contrato).
--   * Faturamento do período = soma do valor mensal de cada contrato
--     fechado, proporcional aos meses em que esteve ativo dentro do
--     intervalo, mais as receitas avulsas lançadas no intervalo.
--   * Cancelar contrato nunca suspende a oficina sozinho — o front pergunta
--     e chama platform_set_tenant_status separadamente quando confirmado.
--   * Cards da Visão Geral nunca tocam a tabela public.customers (dado
--     privado de cada oficina) nem contam a oficina demo.

create table public.platform_contracts (
  id bigint generated always as identity primary key,
  tenant_id bigint references public.tenants(id),
  prospect_name text not null,
  contact_whatsapp text,
  contact_email text,
  contact_phone text,
  plan_id bigint references public.plans(id),
  monthly_value numeric(12,2) not null,
  status text not null default 'negotiating' check (status in ('negotiating', 'closed', 'cancelled')),
  notes text,
  closed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_contracts_monthly_value_check check (monthly_value >= 0)
);
create index platform_contracts_status_idx on public.platform_contracts(status);
create index platform_contracts_tenant_id_idx on public.platform_contracts(tenant_id);
alter table public.platform_contracts enable row level security;

create table public.platform_revenues (
  id bigint generated always as identity primary key,
  contract_id bigint references public.platform_contracts(id),
  tenant_id bigint references public.tenants(id),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  received_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index platform_revenues_received_at_idx on public.platform_revenues(received_at);
alter table public.platform_revenues enable row level security;

-- Toda leitura/escrita passa pelas funções abaixo (security definer, checam
-- private.is_super_admin()); nenhuma policy é criada de propósito, então
-- acesso direto à tabela via PostgREST fica bloqueado por padrão.

create or replace function public.platform_list_contracts()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare payload jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode listar contratos.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'prospectName', c.prospect_name,
    'contactWhatsapp', c.contact_whatsapp,
    'contactEmail', c.contact_email,
    'contactPhone', c.contact_phone,
    'planId', c.plan_id,
    'planName', pl.name,
    'monthlyValue', c.monthly_value,
    'status', c.status,
    'notes', c.notes,
    'tenantId', c.tenant_id,
    'tenantName', t.name,
    'closedAt', c.closed_at,
    'cancelledAt', c.cancelled_at,
    'createdAt', c.created_at
  ) order by c.created_at desc), '[]'::jsonb)
  into payload
  from public.platform_contracts c
  left join public.plans pl on pl.id = c.plan_id
  left join public.tenants t on t.id = c.tenant_id;

  return coalesce(payload, '[]'::jsonb);
end;
$$;

create or replace function public.platform_create_contract(
  prospect_name_input text,
  monthly_value_input numeric,
  plan_id_input bigint default null,
  contact_whatsapp_input text default null,
  contact_email_input text default null,
  contact_phone_input text default null,
  notes_input text default null,
  tenant_id_input bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare created public.platform_contracts%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode registrar contratos.' using errcode = '42501';
  end if;
  if length(trim(coalesce(prospect_name_input, ''))) < 2 then
    raise exception 'Nome do prospect/oficina inválido.' using errcode = '22023';
  end if;
  if monthly_value_input is null or monthly_value_input < 0 then
    raise exception 'Valor mensal inválido.' using errcode = '22023';
  end if;
  if tenant_id_input is not null and not exists (select 1 from public.tenants where id = tenant_id_input) then
    raise exception 'Oficina não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.platform_contracts (
    tenant_id, prospect_name, contact_whatsapp, contact_email, contact_phone,
    plan_id, monthly_value, notes, created_by
  ) values (
    tenant_id_input, trim(prospect_name_input), nullif(trim(contact_whatsapp_input), ''), nullif(trim(contact_email_input), ''), nullif(trim(contact_phone_input), ''),
    plan_id_input, monthly_value_input, nullif(trim(notes_input), ''), auth.uid()
  ) returning * into created;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (created.tenant_id, auth.uid(), 'contract.created', 'platform_contract', created.id, jsonb_build_object('prospectName', created.prospect_name, 'monthlyValue', created.monthly_value));

  return jsonb_build_object('id', created.id);
end;
$$;

create or replace function public.platform_close_contract(contract_id_input bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare target public.platform_contracts%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode fechar contratos.' using errcode = '42501';
  end if;

  select * into target from public.platform_contracts where id = contract_id_input for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  if target.status <> 'negotiating' then
    raise exception 'Só é possível fechar um contrato em negociação.' using errcode = '22023';
  end if;

  update public.platform_contracts set status = 'closed', closed_at = now(), updated_at = now() where id = contract_id_input;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (target.tenant_id, auth.uid(), 'contract.closed', 'platform_contract', contract_id_input, jsonb_build_object('monthlyValue', target.monthly_value));

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.platform_cancel_contract(contract_id_input bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare target public.platform_contracts%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode cancelar contratos.' using errcode = '42501';
  end if;

  select * into target from public.platform_contracts where id = contract_id_input for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  if target.status = 'cancelled' then
    raise exception 'Este contrato já está cancelado.' using errcode = '22023';
  end if;

  update public.platform_contracts set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = contract_id_input;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (target.tenant_id, auth.uid(), 'contract.cancelled', 'platform_contract', contract_id_input, jsonb_build_object('tenantId', target.tenant_id));

  return jsonb_build_object('success', true, 'tenantId', target.tenant_id);
end;
$$;

-- Gera a oficina a partir de um contrato fechado sem oficina vinculada:
-- cria o tenant (mesmo formato de platform_create_tenant), aplica o plano
-- negociado e linka o contrato à oficina recém-criada.
create or replace function public.platform_generate_tenant_from_contract(
  contract_id_input bigint,
  tenant_slug_input text
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target public.platform_contracts%rowtype;
  created_tenant_id bigint;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode gerar oficinas.' using errcode = '42501';
  end if;

  select * into target from public.platform_contracts where id = contract_id_input for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  if target.status <> 'closed' then
    raise exception 'Só é possível gerar a oficina de um contrato fechado.' using errcode = '22023';
  end if;
  if target.tenant_id is not null then
    raise exception 'Este contrato já está vinculado a uma oficina.' using errcode = '22023';
  end if;
  if tenant_slug_input !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Identificador público inválido.' using errcode = '22023';
  end if;

  insert into public.tenants (name, slug, status, active, primary_owner_user_id, plan_id)
  values (target.prospect_name, tenant_slug_input, 'active', true, auth.uid(), target.plan_id)
  returning id into created_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role, active)
  values (created_tenant_id, auth.uid(), 'owner', true);

  insert into public.tenant_settings (tenant_id, whatsapp, email, phone)
  values (created_tenant_id, target.contact_whatsapp, target.contact_email, target.contact_phone);

  insert into public.tenant_branding (tenant_id, public_title)
  values (created_tenant_id, target.prospect_name);

  update public.platform_contracts set tenant_id = created_tenant_id, updated_at = now() where id = contract_id_input;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (created_tenant_id, auth.uid(), 'tenant.created', 'tenant', created_tenant_id, jsonb_build_object('name', target.prospect_name, 'slug', tenant_slug_input, 'fromContractId', contract_id_input));

  return jsonb_build_object('tenantId', created_tenant_id);
end;
$$;

create or replace function public.platform_list_revenues(range_start_input timestamptz default null, range_end_input timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare payload jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode listar receitas.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'contractId', r.contract_id,
    'contractProspectName', c.prospect_name,
    'tenantId', r.tenant_id,
    'tenantName', t.name,
    'description', r.description,
    'amount', r.amount,
    'receivedAt', r.received_at
  ) order by r.received_at desc), '[]'::jsonb)
  into payload
  from public.platform_revenues r
  left join public.platform_contracts c on c.id = r.contract_id
  left join public.tenants t on t.id = r.tenant_id
  where (range_start_input is null or r.received_at >= range_start_input)
    and (range_end_input is null or r.received_at < range_end_input);

  return coalesce(payload, '[]'::jsonb);
end;
$$;

create or replace function public.platform_create_revenue(
  description_input text,
  amount_input numeric,
  received_at_input timestamptz default now(),
  contract_id_input bigint default null,
  tenant_id_input bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare created public.platform_revenues%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode lançar receitas.' using errcode = '42501';
  end if;
  if length(trim(coalesce(description_input, ''))) < 2 then
    raise exception 'Descrição da receita inválida.' using errcode = '22023';
  end if;
  if amount_input is null or amount_input <= 0 then
    raise exception 'Valor da receita inválido.' using errcode = '22023';
  end if;
  if contract_id_input is not null and not exists (select 1 from public.platform_contracts where id = contract_id_input) then
    raise exception 'Contrato não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.platform_revenues (contract_id, tenant_id, description, amount, received_at, created_by)
  values (contract_id_input, tenant_id_input, trim(description_input), amount_input, coalesce(received_at_input, now()), auth.uid())
  returning * into created;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (created.tenant_id, auth.uid(), 'revenue.created', 'platform_revenue', created.id, jsonb_build_object('amount', created.amount, 'description', created.description));

  return jsonb_build_object('id', created.id);
end;
$$;

-- Métricas da Visão Geral. Nunca consulta public.customers (dado privado de
-- cada oficina) — "usuários da plataforma" soma tenant_members ativos.
create or replace function public.platform_dashboard_stats(range_start_input timestamptz, range_end_input timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  active_tenants integer;
  platform_users integer;
  negotiating_contracts integer;
  manual_revenue numeric;
  contract_revenue numeric;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode ver as métricas da plataforma.' using errcode = '42501';
  end if;

  select count(*) into active_tenants
  from public.tenants t
  where t.active and not t.is_demo and t.status in ('trial', 'active');

  select count(*) into platform_users
  from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id
  where tm.active and not t.is_demo;

  select count(*) into negotiating_contracts
  from public.platform_contracts
  where status = 'negotiating';

  select coalesce(sum(r.amount), 0) into manual_revenue
  from public.platform_revenues r
  where r.received_at >= range_start_input and r.received_at < range_end_input;

  -- Meses contados: do mês em que o contrato foi fechado (dentro do
  -- intervalo) até o mês anterior ao cancelamento (exclusive), limitado ao
  -- fim do intervalo. O período informado já vem alinhado a mês (ver
  -- getPeriodRange no front), então range_end_input truncado é o próprio
  -- limite exclusivo do intervalo.
  select coalesce(sum(
    c.monthly_value * greatest(0, (
      extract(year from age(
        least(coalesce(date_trunc('month', c.cancelled_at), date_trunc('month', range_end_input)), date_trunc('month', range_end_input)),
        greatest(date_trunc('month', c.closed_at), date_trunc('month', range_start_input))
      )) * 12
      + extract(month from age(
        least(coalesce(date_trunc('month', c.cancelled_at), date_trunc('month', range_end_input)), date_trunc('month', range_end_input)),
        greatest(date_trunc('month', c.closed_at), date_trunc('month', range_start_input))
      ))
    )::numeric)
  ), 0) into contract_revenue
  from public.platform_contracts c
  where c.closed_at is not null
    and c.closed_at < range_end_input
    and (c.cancelled_at is null or c.cancelled_at > range_start_input);

  return jsonb_build_object(
    'activeTenants', active_tenants,
    'platformUsers', platform_users,
    'negotiatingContracts', negotiating_contracts,
    'periodRevenue', manual_revenue + contract_revenue,
    'manualRevenue', manual_revenue,
    'contractRevenue', contract_revenue
  );
end;
$$;

revoke all on function public.platform_list_contracts() from public, anon, authenticated;
grant execute on function public.platform_list_contracts() to authenticated;
revoke all on function public.platform_create_contract(text, numeric, bigint, text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.platform_create_contract(text, numeric, bigint, text, text, text, text, bigint) to authenticated;
revoke all on function public.platform_close_contract(bigint) from public, anon, authenticated;
grant execute on function public.platform_close_contract(bigint) to authenticated;
revoke all on function public.platform_cancel_contract(bigint) from public, anon, authenticated;
grant execute on function public.platform_cancel_contract(bigint) to authenticated;
revoke all on function public.platform_generate_tenant_from_contract(bigint, text) from public, anon, authenticated;
grant execute on function public.platform_generate_tenant_from_contract(bigint, text) to authenticated;
revoke all on function public.platform_list_revenues(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_list_revenues(timestamptz, timestamptz) to authenticated;
revoke all on function public.platform_create_revenue(text, numeric, timestamptz, bigint, bigint) from public, anon, authenticated;
grant execute on function public.platform_create_revenue(text, numeric, timestamptz, bigint, bigint) to authenticated;
revoke all on function public.platform_dashboard_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_dashboard_stats(timestamptz, timestamptz) to authenticated;
