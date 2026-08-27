-- Leitura financeira tenant-scoped para a mesma tela de Financeiro.

create or replace function public.workspace_list_revenues(
  target_tenant_id bigint,
  target_status text default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 10
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  payload jsonb;
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

  select count(*)::integer into total_count
  from public.revenues r
  where r.tenant_id = target_tenant_id
    and (target_status is null or r.status = target_status)
    and (normalized_search is null or coalesce(r.notes, '') ilike '%' || normalized_search || '%' or coalesce(r.payment_method, '') ilike '%' || normalized_search || '%');

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
  from public.revenues r
  where r.tenant_id = target_tenant_id
    and (target_status is null or r.status = target_status)
    and (normalized_search is null or coalesce(r.notes, '') ilike '%' || normalized_search || '%' or coalesce(r.payment_method, '') ilike '%' || normalized_search || '%')
  offset (page_input - 1) * page_size_input
  limit page_size_input;

  return jsonb_build_object('items', items_payload, 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

create or replace function public.workspace_list_expenses(
  target_tenant_id bigint,
  target_status text default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 10
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  payload jsonb;
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

  select count(*)::integer into total_count
  from public.expenses e
  where e.tenant_id = target_tenant_id
    and (target_status is null or e.status = target_status)
    and (normalized_search is null or e.category ilike '%' || normalized_search || '%' or coalesce(e.notes, '') ilike '%' || normalized_search || '%' or coalesce(e.recurrence, '') ilike '%' || normalized_search || '%');

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
  from public.expenses e
  where e.tenant_id = target_tenant_id
    and (target_status is null or e.status = target_status)
    and (normalized_search is null or e.category ilike '%' || normalized_search || '%' or coalesce(e.notes, '') ilike '%' || normalized_search || '%' or coalesce(e.recurrence, '') ilike '%' || normalized_search || '%')
  offset (page_input - 1) * page_size_input
  limit page_size_input;

  return jsonb_build_object('items', items_payload, 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

revoke all on function public.workspace_list_revenues(bigint, text, text, integer, integer) from public, anon;
revoke all on function public.workspace_list_expenses(bigint, text, text, integer, integer) from public, anon;
grant execute on function public.workspace_list_revenues(bigint, text, text, integer, integer) to authenticated;
grant execute on function public.workspace_list_expenses(bigint, text, text, integer, integer) to authenticated;
