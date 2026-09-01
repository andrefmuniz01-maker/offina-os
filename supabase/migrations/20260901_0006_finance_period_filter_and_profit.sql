-- 1) workspace_list_revenues e workspace_list_expenses ganham filtro de período opcional,
--    para acompanhar o mesmo seletor Dia/Semana/Mês usado no Resumo financeiro e na Agenda.
--    Receitas filtram por coalesce(received_at, due_at) (data em que o valor entrou ou é esperado);
--    despesas filtram por expense_date (data de competência).
drop function if exists public.workspace_list_revenues(bigint, text, text, integer, integer);

create function public.workspace_list_revenues(
  target_tenant_id bigint,
  target_status text default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 10,
  range_start_input timestamptz default null,
  range_end_input timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  items_payload jsonb;
  total_count integer;
  normalized_search text := nullif(trim(search_input), '');
begin
  if not private.can_view_financial(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso financeiro nesta oficina.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;
  if range_end_input is not null and range_start_input is not null and range_end_input <= range_start_input then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;

  select count(*)::integer into total_count
  from public.revenues r
  where r.tenant_id = target_tenant_id
    and (target_status is null or r.status = target_status)
    and (normalized_search is null or coalesce(r.notes, '') ilike '%' || normalized_search || '%' or coalesce(r.payment_method, '') ilike '%' || normalized_search || '%')
    and (range_start_input is null or coalesce(r.received_at, r.due_at) >= range_start_input)
    and (range_end_input is null or coalesce(r.received_at, r.due_at) < range_end_input);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'tenantId', r.tenant_id,
    'workOrderId', r.work_order_id,
    'customerId', r.customer_id,
    'vehicleId', r.vehicle_id,
    'amount', r.amount,
    'paymentMethod', r.payment_method,
    'status', r.status,
    'dueAt', r.due_at,
    'receivedAt', r.received_at,
    'notes', r.notes,
    'createdAt', r.created_at
  ) order by r.created_at desc), '[]'::jsonb) into items_payload
  from (
    select r.*
    from public.revenues r
    where r.tenant_id = target_tenant_id
      and (target_status is null or r.status = target_status)
      and (normalized_search is null or coalesce(r.notes, '') ilike '%' || normalized_search || '%' or coalesce(r.payment_method, '') ilike '%' || normalized_search || '%')
      and (range_start_input is null or coalesce(r.received_at, r.due_at) >= range_start_input)
      and (range_end_input is null or coalesce(r.received_at, r.due_at) < range_end_input)
    order by r.created_at desc
    offset (page_input - 1) * page_size_input
    limit page_size_input
  ) r;

  return jsonb_build_object('items', items_payload, 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

revoke all on function public.workspace_list_revenues(bigint, text, text, integer, integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.workspace_list_revenues(bigint, text, text, integer, integer, timestamptz, timestamptz) to authenticated;

drop function if exists public.workspace_list_expenses(bigint, text, text, integer, integer);

create function public.workspace_list_expenses(
  target_tenant_id bigint,
  target_status text default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 10,
  range_start_input timestamptz default null,
  range_end_input timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  items_payload jsonb;
  total_count integer;
  normalized_search text := nullif(trim(search_input), '');
begin
  if not private.can_view_financial(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso financeiro nesta oficina.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;
  if range_end_input is not null and range_start_input is not null and range_end_input <= range_start_input then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;

  select count(*)::integer into total_count
  from public.expenses e
  where e.tenant_id = target_tenant_id
    and (target_status is null or e.status = target_status)
    and (normalized_search is null or e.category ilike '%' || normalized_search || '%' or coalesce(e.notes, '') ilike '%' || normalized_search || '%' or coalesce(e.recurrence, '') ilike '%' || normalized_search || '%')
    and (range_start_input is null or e.expense_date >= range_start_input)
    and (range_end_input is null or e.expense_date < range_end_input);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'tenantId', e.tenant_id,
    'category', e.category,
    'amount', e.amount,
    'status', e.status,
    'expenseDate', e.expense_date,
    'dueAt', e.due_at,
    'recurrence', e.recurrence,
    'supplierId', e.supplier_id,
    'notes', e.notes,
    'createdAt', e.created_at
  ) order by e.expense_date desc), '[]'::jsonb) into items_payload
  from (
    select e.*
    from public.expenses e
    where e.tenant_id = target_tenant_id
      and (target_status is null or e.status = target_status)
      and (normalized_search is null or e.category ilike '%' || normalized_search || '%' or coalesce(e.notes, '') ilike '%' || normalized_search || '%' or coalesce(e.recurrence, '') ilike '%' || normalized_search || '%')
      and (range_start_input is null or e.expense_date >= range_start_input)
      and (range_end_input is null or e.expense_date < range_end_input)
    order by e.expense_date desc
    offset (page_input - 1) * page_size_input
    limit page_size_input
  ) e;

  return jsonb_build_object('items', items_payload, 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

revoke all on function public.workspace_list_expenses(bigint, text, text, integer, integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.workspace_list_expenses(bigint, text, text, integer, integer, timestamptz, timestamptz) to authenticated;

-- 2) A oficina demo foi provisionada com datas relativas ao momento do seed. Como o tempo
--    passou, "despesas pagas" e "receitas recebidas" ficaram todas no passado e o filtro
--    padrão (mês corrente) exibia zero, dando a impressão de que os valores não eram
--    contabilizados. Reancora essas datas próximas de "agora" para o tenant demo, preservando
--    a ordem relativa entre os lançamentos.
with paid as (
  select e.id, row_number() over (order by e.amount) as rn
  from public.expenses e
  join public.tenants t on t.id = e.tenant_id
  where t.is_demo and e.status = 'paid'
)
update public.expenses e
set expense_date = now() - (paid.rn * interval '3 hours')
from paid
where e.id = paid.id;

with received as (
  select r.id, row_number() over (order by r.amount) as rn
  from public.revenues r
  join public.tenants t on t.id = r.tenant_id
  where t.is_demo and r.status = 'received'
)
update public.revenues r
set received_at = now() - (received.rn * interval '5 hours')
from received
where r.id = received.id;
