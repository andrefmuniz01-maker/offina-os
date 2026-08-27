-- A central operacional serve atendentes e técnicos. Valores de venda, receita e
-- resultado só integram o JSON quando a identidade autenticada for owner/admin.
create or replace function public.workspace_dashboard_overview(target_tenant_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
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
  can_view_finance boolean := false;
  payload jsonb;
begin
  if not exists (select 1 from public.tenants where id = target_tenant_id) then
    raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin'
  ) or exists (
    select 1 from public.tenant_members
    where tenant_id = target_tenant_id and user_id = auth.uid() and active and role in ('owner', 'admin')
  ) into can_view_finance;

  select coalesce(sum(total), 0), count(*)
  into pending_quote_value, pending_quote_count
  from public.quotes
  where tenant_id = target_tenant_id and status in ('ready', 'sent', 'viewed');

  select count(*) filter (where status in ('scheduled', 'confirmed'))
  into scheduled_count from public.appointments where tenant_id = target_tenant_id;

  select count(*) into in_progress_count
  from public.work_orders where tenant_id = target_tenant_id and status = 'in_service';

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
    'commercial', jsonb_build_object('pendingQuoteValue', pending_quote_value, 'pendingQuoteCount', pending_quote_count),
    'operation', jsonb_build_object('scheduled', scheduled_count, 'inProgress', in_progress_count, 'yard', yard_count),
    'inventory', jsonb_build_object('critical', critical_count, 'reservedProducts', reserved_products_count)
  );

  if can_view_finance then
    select coalesce(sum(amount), 0) into billing
    from public.revenues
    where tenant_id = target_tenant_id and status = 'received'
      and received_at >= period_start and received_at < period_end;

    select coalesce(sum(amount), 0) into expected_revenue
    from public.revenues where tenant_id = target_tenant_id and status = 'expected';

    select count(*) into completed_orders
    from public.work_orders
    where tenant_id = target_tenant_id and status = 'completed'
      and completed_at >= period_start and completed_at < period_end;

    select count(*), count(*) filter (where status = 'approved')
    into quote_count, approved_quotes
    from public.quotes
    where tenant_id = target_tenant_id and created_at >= period_start and created_at < period_end;

    select coalesce(sum(amount), 0) into expenses_total
    from public.expenses
    where tenant_id = target_tenant_id and status = 'paid'
      and expense_date >= period_start and expense_date < period_end;

    payload := payload || jsonb_build_object(
      'sales', jsonb_build_object(
        'billing', billing,
        'expectedRevenue', expected_revenue,
        'averageTicket', case when completed_orders > 0 then billing / completed_orders else 0 end,
        'completedOrders', completed_orders,
        'quoteApprovalRate', case when quote_count > 0 then approved_quotes::numeric / quote_count else 0 end
      ),
      'finance', jsonb_build_object('expenses', expenses_total, 'estimatedOperationalResult', billing - expenses_total)
    );
  end if;

  return payload;
end;
$$;

revoke all on function public.workspace_dashboard_overview(bigint) from public, anon;
grant execute on function public.workspace_dashboard_overview(bigint) to authenticated;
