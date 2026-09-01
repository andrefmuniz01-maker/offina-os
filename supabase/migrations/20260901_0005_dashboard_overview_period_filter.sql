-- workspace_dashboard_overview (usada por Financeiro e pela Central do dia) sempre
-- calculava o mês corrente. Adiciona intervalo explícito opcional (dia/semana/mês
-- calculado no cliente); sem intervalo, mantém o comportamento atual (mês corrente).
drop function if exists public.workspace_dashboard_overview(bigint);

create function public.workspace_dashboard_overview(
  target_tenant_id bigint,
  range_start_input timestamptz default null,
  range_end_input timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  period_start timestamptz := coalesce(range_start_input, date_trunc('month', now()));
  period_end timestamptz := coalesce(range_end_input, date_trunc('month', now()) + interval '1 month');
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
  if not private.is_active_member(target_tenant_id) then
    raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501';
  end if;
  if period_end <= period_start then raise exception 'Período inválido.' using errcode = '22023'; end if;

  select private.is_super_admin() or exists (
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
    'inventory', jsonb_build_object('critical', critical_count, 'reservedProducts', reserved_products_count),
    'period', jsonb_build_object('start', period_start, 'end', period_end)
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
$function$;

revoke all on function public.workspace_dashboard_overview(bigint, timestamptz, timestamptz) from public, anon;
grant execute on function public.workspace_dashboard_overview(bigint, timestamptz, timestamptz) to authenticated;
