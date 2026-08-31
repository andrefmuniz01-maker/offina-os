-- workspace_list_quotes e workspace_quote_detail devolviam campos que os schemas
-- Zod .strict() de server/routers/supabaseQuoteContract.ts não conhecem (email do
-- cliente; modelYear/mileage do veículo; e no list: notes/terms/sentAt/viewedAt/
-- approvedAt/rejectedAt do orçamento) e omitiam campos exigidos (requestId,
-- updatedAt do orçamento; sortOrder de cada item no detail). O resultado era
-- TRPCError INTERNAL_SERVER_ERROR "recebeu dados em formato inválido" sempre que
-- a fila ou o detalhe de orçamentos era aberto. Esta migration alinha a forma
-- retornada pelas RPCs ao contrato já esperado pela aplicação, sem alterar
-- nenhuma regra de acesso ou de negócio.

create or replace function public.workspace_list_quotes(
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
  normalized_search text;
begin
  if not private.is_active_member(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso a esta oficina.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;
  normalized_search := nullif(trim(search_input), '');

  select count(*)::integer into total_count
  from public.quotes q
  join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
  join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
  where q.tenant_id = target_tenant_id
    and (target_status is null or q.status::text = target_status)
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
      and (target_status is null or q.status::text = target_status)
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

create or replace function public.workspace_quote_detail(target_tenant_id bigint, target_quote_id bigint)
returns jsonb
language plpgsql
set search_path to 'public', 'private'
as $function$
declare
  payload jsonb;
begin
  if not private.is_active_member(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso a esta oficina.' using errcode = '42501';
  end if;

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
      'notes', q.notes,
      'terms', q.terms,
      'createdAt', q.created_at,
      'updatedAt', q.updated_at
    ),
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp),
    'vehicle', jsonb_build_object('id', v.id, 'make', v.make, 'model', v.model, 'plate', v.plate),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qi.id,
        'description', qi.description,
        'quantity', qi.quantity,
        'unitPrice', qi.unit_price,
        'discount', qi.discount,
        'itemType', qi.item_type,
        'sortOrder', qi.sort_order
      ) order by qi.sort_order, qi.id)
      from public.quote_items qi
      where qi.quote_id = q.id and qi.tenant_id = q.tenant_id
    ), '[]'::jsonb)
  ) into payload
  from public.quotes q
  join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
  join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
  where q.id = target_quote_id and q.tenant_id = target_tenant_id
  limit 1;

  if payload is null then
    raise exception 'Orçamento não encontrado nesta oficina.' using errcode = 'P0002';
  end if;
  return payload;
end;
$function$;
