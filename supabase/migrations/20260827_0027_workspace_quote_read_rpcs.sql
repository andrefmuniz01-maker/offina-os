-- Leitura interna de orçamentos: somente dados comerciais para quem gerencia
-- propostas. Custos e margem só entram na projeção de owner, admin ou Super Admin.
create or replace function private.internal_list_workspace_quotes(
  target_tenant_id bigint,
  target_status text default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 25
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  filtered_status public.quote_status;
  offset_rows integer;
  include_financial boolean;
  rows jsonb;
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso à fila de orçamentos desta oficina.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;
  if target_status is not null then
    begin
      filtered_status := target_status::public.quote_status;
    exception when invalid_text_representation then
      raise exception 'Status de orçamento inválido.' using errcode = '22023';
    end;
  end if;

  include_financial := private.can_manage_financial_catalog(target_tenant_id);
  offset_rows := (page_input - 1) * page_size_input;
  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb)
  into rows
  from (
    select q.created_at,
      jsonb_build_object(
        'quote', case when include_financial then
          jsonb_build_object('id', q.id, 'tenantId', q.tenant_id, 'number', q.number, 'requestId', q.quote_request_id, 'status', q.status, 'subtotal', q.subtotal, 'discountTotal', q.discount_total, 'total', q.total, 'validUntil', q.valid_until, 'createdAt', q.created_at, 'updatedAt', q.updated_at, 'estimatedCostTotal', q.estimated_cost_total, 'estimatedMarginPercent', q.estimated_margin_percent)
        else
          jsonb_build_object('id', q.id, 'tenantId', q.tenant_id, 'number', q.number, 'requestId', q.quote_request_id, 'status', q.status, 'subtotal', q.subtotal, 'discountTotal', q.discount_total, 'total', q.total, 'validUntil', q.valid_until, 'createdAt', q.created_at, 'updatedAt', q.updated_at)
        end,
        'customer', jsonb_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp),
        'vehicle', jsonb_build_object('id', v.id, 'make', v.make, 'model', v.model, 'plate', v.plate)
      ) as row_data
    from public.quotes q
    join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
    join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id and v.customer_id = c.id
    where q.tenant_id = target_tenant_id
      and (filtered_status is null or q.status = filtered_status)
      and (
        nullif(trim(search_input), '') is null
        or c.name ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%'
        or v.plate ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%'
        or v.make ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%'
        or v.model ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%'
        or q.number::text ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%'
      )
    order by q.created_at desc
    limit page_size_input + 1 offset offset_rows
  ) selected_rows;

  return jsonb_build_object(
    'items', rows,
    'page', page_input,
    'pageSize', page_size_input,
    'hasMore', jsonb_array_length(rows) > page_size_input
  );
end;
$$;

create or replace function private.internal_get_workspace_quote_detail(
  target_tenant_id bigint,
  target_quote_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  quote_row public.quotes%rowtype;
  customer_row public.customers%rowtype;
  vehicle_row public.vehicles%rowtype;
  include_financial boolean;
  item_rows jsonb;
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso ao orçamento desta oficina.' using errcode = '42501';
  end if;
  select * into quote_row from public.quotes
  where id = target_quote_id and tenant_id = target_tenant_id;
  if not found then
    raise exception 'Orçamento não encontrado nesta oficina.' using errcode = 'P0002';
  end if;
  select * into customer_row from public.customers
  where id = quote_row.customer_id and tenant_id = target_tenant_id;
  if not found then
    raise exception 'O cliente deste orçamento não está disponível nesta oficina.' using errcode = '22023';
  end if;
  select * into vehicle_row from public.vehicles
  where id = quote_row.vehicle_id and tenant_id = target_tenant_id and customer_id = customer_row.id;
  if not found then
    raise exception 'O veículo deste orçamento não pertence ao cliente desta oficina.' using errcode = '22023';
  end if;

  include_financial := private.can_manage_financial_catalog(target_tenant_id);
  select coalesce(jsonb_agg(
    case when include_financial then
      jsonb_build_object('id', qi.id, 'itemType', qi.item_type, 'description', qi.description, 'quantity', qi.quantity, 'unitPrice', qi.unit_price, 'unitCost', qi.unit_cost, 'discount', qi.discount, 'sortOrder', qi.sort_order)
    else
      jsonb_build_object('id', qi.id, 'itemType', qi.item_type, 'description', qi.description, 'quantity', qi.quantity, 'unitPrice', qi.unit_price, 'discount', qi.discount, 'sortOrder', qi.sort_order)
    end order by qi.sort_order asc, qi.id asc
  ), '[]'::jsonb)
  into item_rows
  from public.quote_items qi
  where qi.tenant_id = target_tenant_id and qi.quote_id = quote_row.id;

  return jsonb_build_object(
    'quote', case when include_financial then
      jsonb_build_object('id', quote_row.id, 'tenantId', quote_row.tenant_id, 'number', quote_row.number, 'requestId', quote_row.quote_request_id, 'status', quote_row.status, 'subtotal', quote_row.subtotal, 'discountTotal', quote_row.discount_total, 'total', quote_row.total, 'validUntil', quote_row.valid_until, 'notes', quote_row.notes, 'terms', quote_row.terms, 'createdAt', quote_row.created_at, 'updatedAt', quote_row.updated_at, 'estimatedCostTotal', quote_row.estimated_cost_total, 'estimatedMarginPercent', quote_row.estimated_margin_percent)
    else
      jsonb_build_object('id', quote_row.id, 'tenantId', quote_row.tenant_id, 'number', quote_row.number, 'requestId', quote_row.quote_request_id, 'status', quote_row.status, 'subtotal', quote_row.subtotal, 'discountTotal', quote_row.discount_total, 'total', quote_row.total, 'validUntil', quote_row.valid_until, 'notes', quote_row.notes, 'terms', quote_row.terms, 'createdAt', quote_row.created_at, 'updatedAt', quote_row.updated_at)
    end,
    'customer', jsonb_build_object('id', customer_row.id, 'name', customer_row.name, 'whatsapp', customer_row.whatsapp),
    'vehicle', jsonb_build_object('id', vehicle_row.id, 'make', vehicle_row.make, 'model', vehicle_row.model, 'plate', vehicle_row.plate),
    'items', item_rows
  );
end;
$$;

create or replace function public.workspace_list_quotes(
  target_tenant_id bigint,
  target_status text default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 25
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.internal_list_workspace_quotes(target_tenant_id, target_status, search_input, page_input, page_size_input)
$$;

create or replace function public.workspace_quote_detail(
  target_tenant_id bigint,
  target_quote_id bigint
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.internal_get_workspace_quote_detail(target_tenant_id, target_quote_id)
$$;

revoke all on function public.workspace_list_quotes(bigint, text, text, integer, integer), public.workspace_quote_detail(bigint, bigint) from public, anon;
grant execute on function public.workspace_list_quotes(bigint, text, text, integer, integer), public.workspace_quote_detail(bigint, bigint) to authenticated;
revoke all on function private.internal_list_workspace_quotes(bigint, text, text, integer, integer), private.internal_get_workspace_quote_detail(bigint, bigint) from public, anon, authenticated;
