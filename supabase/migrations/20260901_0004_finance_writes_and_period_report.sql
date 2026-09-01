-- O financeiro em Supabase só tinha leitura (list de receitas/despesas);
-- criar despesa e confirmar receita só existiam no lado legado (MySQL),
-- então funcionavam apenas fora do fluxo de demonstração. Adiciona as
-- mesmas ações do lado Supabase, para o resumo financeiro passar a ter
-- um "Despesas" e "Receitas" funcionais de verdade.

create or replace function public.workspace_create_expense(
  target_tenant_id bigint,
  category_input text,
  amount_input numeric,
  expense_date_input timestamptz,
  notes_input text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare created_id bigint;
begin
  if not private.can_view_financial(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso financeiro nesta oficina.' using errcode = '42501';
  end if;
  if category_input is null or length(trim(category_input)) < 1 or length(trim(category_input)) > 120 then
    raise exception 'Informe uma categoria válida.' using errcode = '22023';
  end if;
  if amount_input is null or amount_input <= 0 or amount_input > 1000000000 then
    raise exception 'Informe um valor válido.' using errcode = '22023';
  end if;
  if expense_date_input is null then
    raise exception 'Informe a data da despesa.' using errcode = '22023';
  end if;
  insert into public.expenses(tenant_id, category, amount, expense_date, notes, created_by_user_id)
  values(target_tenant_id, trim(category_input), amount_input, expense_date_input, nullif(trim(coalesce(notes_input, '')), ''), auth.uid())
  returning id into created_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values(target_tenant_id, auth.uid(), 'expense.created', 'expense', created_id, jsonb_build_object('category', category_input, 'amount', amount_input));
  return jsonb_build_object('id', created_id);
end;
$$;

create or replace function public.workspace_mark_expense_paid(
  target_tenant_id bigint,
  target_expense_id bigint
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare updated_count integer;
begin
  if not private.can_view_financial(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso financeiro nesta oficina.' using errcode = '42501';
  end if;
  update public.expenses set status = 'paid', updated_at = now()
  where id = target_expense_id and tenant_id = target_tenant_id and status = 'planned';
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'Despesa não encontrada ou já paga nesta oficina.' using errcode = 'P0002'; end if;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values(target_tenant_id, auth.uid(), 'expense.paid', 'expense', target_expense_id, jsonb_build_object('status', 'paid'));
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.workspace_mark_revenue_received(
  target_tenant_id bigint,
  target_revenue_id bigint,
  payment_method_input text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare updated_count integer;
begin
  if not private.can_view_financial(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso financeiro nesta oficina.' using errcode = '42501';
  end if;
  update public.revenues set status = 'received', received_at = now(), payment_method = coalesce(nullif(trim(payment_method_input), ''), payment_method), updated_at = now()
  where id = target_revenue_id and tenant_id = target_tenant_id and status = 'expected';
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'Receita não encontrada ou já recebida nesta oficina.' using errcode = 'P0002'; end if;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values(target_tenant_id, auth.uid(), 'revenue.received', 'revenue', target_revenue_id, jsonb_build_object('status', 'received', 'paymentMethod', payment_method_input));
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.workspace_create_expense(bigint, text, numeric, timestamptz, text), public.workspace_mark_expense_paid(bigint, bigint), public.workspace_mark_revenue_received(bigint, bigint, text) from public, anon;
grant execute on function public.workspace_create_expense(bigint, text, numeric, timestamptz, text), public.workspace_mark_expense_paid(bigint, bigint), public.workspace_mark_revenue_received(bigint, bigint, text) to authenticated;

-- Resumo financeiro por período: o relatório existente sempre calculava o
-- mês corrente. Agora aceita um intervalo explícito (dia/semana/mês, ou
-- qualquer intervalo) calculado no cliente; sem intervalo, continua usando
-- o mês corrente por padrão (compatível com quem já chama sem esse parâmetro).
-- Dois parâmetros novos mudam a assinatura da função: sem o drop explícito,
-- o Postgres cria um segundo overload em vez de substituir, e o PostgREST
-- não consegue mais escolher qual chamar.
drop function if exists public.workspace_dashboard_report(bigint, timestamptz);

create function public.workspace_dashboard_report(
  target_tenant_id bigint,
  reference_at timestamptz default now(),
  range_start_input timestamptz default null,
  range_end_input timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  period_start timestamptz := coalesce(range_start_input, date_trunc('month', reference_at));
  period_end timestamptz := coalesce(range_end_input, date_trunc('month', reference_at) + interval '1 month');
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
  if not private.is_active_member(target_tenant_id) then raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501'; end if;
  if period_end <= period_start then raise exception 'Período inválido.' using errcode = '22023'; end if;
  select coalesce(sum(amount), 0) into billing from public.revenues where tenant_id = target_tenant_id and status = 'received' and received_at >= period_start and received_at < period_end;
  select coalesce(sum(amount), 0) into expected_revenue from public.revenues where tenant_id = target_tenant_id and status = 'expected';
  select count(*) into completed_orders from public.work_orders where tenant_id = target_tenant_id and status in ('completed', 'delivered') and coalesce(completed_at, delivered_at) >= period_start and coalesce(completed_at, delivered_at) < period_end;
  select count(*), count(*) filter (where status = 'approved') into quote_count, approved_quotes from public.quotes where tenant_id = target_tenant_id and created_at >= period_start and created_at < period_end;
  select coalesce(sum(total), 0), count(*) into pending_quote_value, pending_quote_count from public.quotes where tenant_id = target_tenant_id and status in ('ready', 'sent', 'viewed');
  select count(*) filter (where status in ('scheduled', 'confirmed')) into scheduled_count from public.appointments where tenant_id = target_tenant_id;
  select count(*) into in_progress_count from public.work_orders where tenant_id = target_tenant_id and status = 'in_service';
  select count(*) into yard_count from public.work_orders where tenant_id = target_tenant_id and status in ('received', 'diagnosis', 'awaiting_approval', 'awaiting_part', 'in_service');
  select count(*) filter (where ib.physical_quantity - ib.reserved_quantity <= p.min_stock), count(*) filter (where ib.reserved_quantity > 0) into critical_count, reserved_products_count from public.inventory_balances ib join public.products p on p.id = ib.product_id and p.tenant_id = ib.tenant_id where ib.tenant_id = target_tenant_id;
  payload := jsonb_build_object(
    'sales', jsonb_build_object('billing', billing, 'expectedRevenue', expected_revenue, 'averageTicket', case when completed_orders > 0 then billing / completed_orders else 0 end, 'completedOrders', completed_orders, 'quoteApprovalRate', case when quote_count > 0 then approved_quotes::numeric / quote_count else 0 end),
    'commercial', jsonb_build_object('pendingQuoteValue', pending_quote_value, 'pendingQuoteCount', pending_quote_count),
    'operation', jsonb_build_object('scheduled', scheduled_count, 'inProgress', in_progress_count, 'yard', yard_count),
    'inventory', jsonb_build_object('critical', critical_count, 'reservedProducts', reserved_products_count),
    'period', jsonb_build_object('start', period_start, 'end', period_end)
  );
  if private.can_view_financial(target_tenant_id) then
    select coalesce(sum(amount), 0) into expenses_total from public.expenses where tenant_id = target_tenant_id and status = 'paid' and expense_date >= period_start and expense_date < period_end;
    payload := payload || jsonb_build_object('finance', jsonb_build_object('expenses', expenses_total, 'estimatedOperationalResult', billing - expenses_total));
  end if;
  return payload;
end;
$$;

revoke all on function public.workspace_dashboard_report(bigint, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.workspace_dashboard_report(bigint, timestamptz, timestamptz, timestamptz) to authenticated;
