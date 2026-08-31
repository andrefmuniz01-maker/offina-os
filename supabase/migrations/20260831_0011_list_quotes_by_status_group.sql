-- Mesma extensão aplicada a workspace_list_quote_requests: a aba Orçamentos
-- agora filtra por GRUPO (Aprovados / Recusados / Aguardando retorno), não
-- por um único status por vez.
drop function if exists public.workspace_list_quotes(bigint, text, text, integer, integer);

create or replace function public.workspace_list_quotes(
  target_tenant_id bigint,
  target_statuses text[] default null,
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
  normalized_search text;
  filtered_statuses public.quote_status[];
begin
  if not private.is_active_member(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso a esta oficina.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;
  if target_statuses is not null then
    begin filtered_statuses := target_statuses::public.quote_status[]; exception when invalid_text_representation then raise exception 'Status inválido.' using errcode = '22023'; end;
  end if;
  normalized_search := nullif(trim(search_input), '');

  select count(*)::integer into total_count
  from public.quotes q
  join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
  join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
  where q.tenant_id = target_tenant_id
    and (filtered_statuses is null or q.status = any(filtered_statuses))
    and (
      normalized_search is null
      or q.number::text ilike '%' || normalized_search || '%'
      or c.name ilike '%' || normalized_search || '%'
      or coalesce(v.plate, '') ilike '%' || normalized_search || '%'
      or (v.make || ' ' || v.model) ilike '%' || normalized_search || '%'
    );

  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
    into items_payload
  from (
    select jsonb_build_object(
      'quote', jsonb_build_object(
        'id', q.id,
        'tenantId', q.tenant_id,
        'number', q.number,
        'requestId', q.quote_request_id,
        'status', q.status,
        'subtotal', q.subtotal,
        'discountTotal', q.discount_total,
        'total', q.total,
        'validUntil', q.valid_until,
        'createdAt', q.created_at,
        'updatedAt', q.updated_at
      ),
      'customer', jsonb_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp),
      'vehicle', jsonb_build_object('id', v.id, 'make', v.make, 'model', v.model, 'plate', v.plate)
    ) as item,
    q.created_at
    from public.quotes q
    join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
    join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
    where q.tenant_id = target_tenant_id
      and (filtered_statuses is null or q.status = any(filtered_statuses))
      and (
        normalized_search is null
        or q.number::text ilike '%' || normalized_search || '%'
        or c.name ilike '%' || normalized_search || '%'
        or coalesce(v.plate, '') ilike '%' || normalized_search || '%'
        or (v.make || ' ' || v.model) ilike '%' || normalized_search || '%'
      )
    order by q.created_at desc
    limit page_size_input
    offset (page_input - 1) * page_size_input
  ) listed;

  payload := jsonb_build_object(
    'items', items_payload,
    'page', page_input,
    'pageSize', page_size_input,
    'hasMore', total_count > page_input * page_size_input
  );
  return payload;
end;
$$;

revoke all on function public.workspace_list_quotes(bigint, text[], text, integer, integer) from public, anon;
grant execute on function public.workspace_list_quotes(bigint, text[], text, integer, integer) to authenticated;
