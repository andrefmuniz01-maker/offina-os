-- Separa a Visão Geral em duas fontes: totais sem filtro (sempre o estado
-- atual, refletindo na hora qualquer cancelamento/suspensão) e faturamento
-- por período (único indicador que realmente depende de um intervalo).
-- Motivo: o filtro de período no topo da página estava sendo aplicado a
-- métricas que não deveriam depender de data (oficinas ativas, usuários,
-- contratos em negociação), o que confundia a leitura e podia demorar mais
-- para carregar do que o necessário.
create or replace function public.platform_dashboard_totals()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  active_tenants integer;
  platform_users integer;
  negotiating_contracts integer;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode ver as métricas da plataforma.' using errcode = '42501';
  end if;

  select count(*) into active_tenants
  from public.tenants t
  where t.active and t.status in ('trial', 'active');

  select count(*) into platform_users
  from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id
  where tm.active and not t.is_demo;

  select count(*) into negotiating_contracts
  from public.platform_contracts
  where status = 'negotiating';

  return jsonb_build_object(
    'activeTenants', active_tenants,
    'platformUsers', platform_users,
    'negotiatingContracts', negotiating_contracts
  );
end;
$$;

create or replace function public.platform_dashboard_period_revenue(range_start_input timestamptz, range_end_input timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  manual_revenue numeric;
  contract_revenue numeric;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode ver o faturamento da plataforma.' using errcode = '42501';
  end if;

  select coalesce(sum(r.amount), 0) into manual_revenue
  from public.platform_revenues r
  where r.received_at >= range_start_input and r.received_at < range_end_input;

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
    'periodRevenue', manual_revenue + contract_revenue,
    'manualRevenue', manual_revenue,
    'contractRevenue', contract_revenue
  );
end;
$$;

drop function if exists public.platform_dashboard_stats(timestamptz, timestamptz);

revoke all on function public.platform_dashboard_totals() from public, anon, authenticated;
grant execute on function public.platform_dashboard_totals() to authenticated;
revoke all on function public.platform_dashboard_period_revenue(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.platform_dashboard_period_revenue(timestamptz, timestamptz) to authenticated;
