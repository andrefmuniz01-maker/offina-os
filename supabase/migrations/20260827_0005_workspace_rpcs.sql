-- Funções de workspace chamadas pelo backend com o JWT do Supabase Auth.
-- Cada função fixa o search_path, valida auth.uid() e não concede execução a anon.

create or replace function public.platform_create_tenant(
  tenant_name text,
  tenant_slug text,
  tenant_whatsapp text default null,
  tenant_primary_color text default '#E84D1C'
) returns bigint
language plpgsql
security definer
set search_path = public, private
as $$
declare
  created_tenant_id bigint;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode criar oficinas.' using errcode = '42501';
  end if;

  if length(trim(tenant_name)) < 3 or length(trim(tenant_name)) > 160 then
    raise exception 'Nome comercial inválido.' using errcode = '22023';
  end if;

  if tenant_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Identificador público inválido.' using errcode = '22023';
  end if;

  insert into public.tenants (name, slug, status, active, primary_owner_user_id)
  values (trim(tenant_name), tenant_slug, 'active', true, auth.uid())
  returning id into created_tenant_id;

  insert into public.tenant_settings (tenant_id, whatsapp)
  values (created_tenant_id, nullif(trim(tenant_whatsapp), ''));

  insert into public.tenant_branding (tenant_id, public_title, primary_color)
  values (created_tenant_id, trim(tenant_name), tenant_primary_color);

  insert into public.tenant_members (tenant_id, user_id, role, active)
  values (created_tenant_id, auth.uid(), 'owner', true);

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (
    created_tenant_id,
    auth.uid(),
    'tenant.created',
    'tenant',
    created_tenant_id,
    jsonb_build_object('name', trim(tenant_name), 'slug', tenant_slug)
  );

  return created_tenant_id;
end;
$$;

create or replace function public.my_workspaces()
returns table (
  tenant_id bigint,
  name text,
  slug text,
  status public.tenant_status,
  active boolean,
  is_demo boolean,
  role public.member_role,
  permissions jsonb
)
language sql
security definer
set search_path = public, private
as $$
  select t.id, t.name, t.slug, t.status, t.active, t.is_demo, 'owner'::public.member_role, null::jsonb
  from public.tenants t
  where private.is_super_admin() and t.active and t.status in ('trial', 'active')

  union all

  select t.id, t.name, t.slug, t.status, t.active, t.is_demo, tm.role, tm.permissions
  from public.tenant_members tm
  join public.tenants t on t.id = tm.tenant_id
  where not private.is_super_admin()
    and tm.user_id = auth.uid()
    and tm.active
    and t.active
    and t.status in ('trial', 'active')
  order by name;
$$;

create or replace function public.workspace_dashboard_overview(target_tenant_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  period_start timestamptz := date_trunc('month', now());
  period_end timestamptz := date_trunc('month', now()) + interval '1 month';
  billing numeric := 0;
  expected_revenue numeric := 0;
  expenses_total numeric := 0;
  completed_orders integer := 0;
  quote_count integer := 0;
  approved_quotes integer := 0;
  pending_quote_value numeric := 0;
  pending_quote_count integer := 0;
  scheduled_count integer := 0;
  in_progress_count integer := 0;
  yard_count integer := 0;
  critical_count integer := 0;
  reserved_products_count integer := 0;
  payload jsonb;
begin
  if not private.is_active_member(target_tenant_id) then
    raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501';
  end if;

  select coalesce(sum(amount), 0) into billing
  from public.revenues
  where tenant_id = target_tenant_id and status = 'received'
    and received_at >= period_start and received_at < period_end;

  select coalesce(sum(amount), 0) into expected_revenue
  from public.revenues
  where tenant_id = target_tenant_id and status = 'expected';

  select count(*) into completed_orders
  from public.work_orders
  where tenant_id = target_tenant_id and status = 'completed'
    and completed_at >= period_start and completed_at < period_end;

  select count(*), count(*) filter (where status = 'approved')
  into quote_count, approved_quotes
  from public.quotes
  where tenant_id = target_tenant_id and created_at >= period_start and created_at < period_end;

  select coalesce(sum(total), 0), count(*)
  into pending_quote_value, pending_quote_count
  from public.quotes
  where tenant_id = target_tenant_id and status in ('ready', 'sent', 'viewed');

  select count(*) filter (where status in ('scheduled', 'confirmed'))
  into scheduled_count
  from public.appointments
  where tenant_id = target_tenant_id;

  select count(*) into in_progress_count
  from public.work_orders
  where tenant_id = target_tenant_id and status = 'in_service';

  select count(*) into yard_count
  from public.work_orders
  where tenant_id = target_tenant_id
    and status in ('received', 'diagnosis', 'awaiting_approval', 'awaiting_part', 'in_service');

  select count(*) filter (where ib.physical_quantity - ib.reserved_quantity <= p.min_stock),
         count(*) filter (where ib.reserved_quantity > 0)
  into critical_count, reserved_products_count
  from public.inventory_balances ib
  join public.products p on p.id = ib.product_id and p.tenant_id = ib.tenant_id
  where ib.tenant_id = target_tenant_id;

  payload := jsonb_build_object(
    'sales', jsonb_build_object(
      'billing', billing,
      'expectedRevenue', expected_revenue,
      'averageTicket', case when completed_orders > 0 then billing / completed_orders else 0 end,
      'completedOrders', completed_orders,
      'quoteApprovalRate', case when quote_count > 0 then approved_quotes::numeric / quote_count else 0 end
    ),
    'commercial', jsonb_build_object('pendingQuoteValue', pending_quote_value, 'pendingQuoteCount', pending_quote_count),
    'operation', jsonb_build_object('scheduled', scheduled_count, 'inProgress', in_progress_count, 'yard', yard_count),
    'inventory', jsonb_build_object('critical', critical_count, 'reservedProducts', reserved_products_count)
  );

  if private.can_view_financial(target_tenant_id) then
    select coalesce(sum(amount), 0) into expenses_total
    from public.expenses
    where tenant_id = target_tenant_id and status = 'paid'
      and expense_date >= period_start and expense_date < period_end;
    payload := payload || jsonb_build_object('finance', jsonb_build_object('expenses', expenses_total, 'estimatedOperationalResult', billing - expenses_total));
  end if;

  return payload;
end;
$$;

create or replace function public.workspace_notifications(target_tenant_id bigint, max_items integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_active_member(target_tenant_id) then
    raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501';
  end if;

  if max_items < 1 or max_items > 30 then
    raise exception 'Limite de notificações inválido.' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(item) order by item.created_at desc)
    from (
      select n.id, n.type, n.title, n.body, n.link, n.read_at, n.created_at
      from public.notifications n
      where n.tenant_id = target_tenant_id
        and (n.user_id = auth.uid() or n.user_id is null)
      order by n.created_at desc
      limit max_items
    ) item
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.platform_create_tenant(text, text, text, text) from public, anon;
revoke all on function public.my_workspaces() from public, anon;
revoke all on function public.workspace_dashboard_overview(bigint) from public, anon;
revoke all on function public.workspace_notifications(bigint, integer) from public, anon;
grant execute on function public.platform_create_tenant(text, text, text, text) to authenticated;
grant execute on function public.my_workspaces() to authenticated;
grant execute on function public.workspace_dashboard_overview(bigint) to authenticated;
grant execute on function public.workspace_notifications(bigint, integer) to authenticated;
