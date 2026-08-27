-- A decisão pública é mediada pela API de servidor. A aprovação reserva o saldo
-- disponível na mesma transação; não cria agenda, OS, consumo ou financeiro.
create or replace function public.public_quote_view(token_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quote_row public.quotes%rowtype;
  result jsonb;
begin
  if token_input is null or length(token_input) < 32 or length(token_input) > 128 then
    return null;
  end if;

  select q.* into quote_row
  from public.quotes q
  join public.tenants t on t.id = q.tenant_id and t.active and t.status in ('trial', 'active')
  where q.public_token = token_input
    and q.status in ('sent', 'viewed', 'approved', 'rejected')
    and q.public_token_expires_at > now()
    and q.valid_until > now()
  for update of q;
  if not found then
    return null;
  end if;

  if quote_row.status = 'sent' then
    update public.quotes
    set status = 'viewed', viewed_at = coalesce(viewed_at, now()), updated_at = now()
    where id = quote_row.id and tenant_id = quote_row.tenant_id and status = 'sent';
    if found then
      insert into public.quote_events(tenant_id, quote_id, type, metadata)
      values(quote_row.tenant_id, quote_row.id, 'viewed', jsonb_build_object('channel', 'public_link'));
    end if;
  end if;

  select jsonb_build_object(
    'workshop', jsonb_build_object(
      'name', t.name,
      'branding', jsonb_build_object(
        'primaryColor', b.primary_color,
        'secondaryColor', b.secondary_color,
        'accentColor', b.accent_color,
        'publicTitle', b.public_title
      )
    ),
    'customer', jsonb_build_object('name', c.name),
    'vehicle', jsonb_build_object('make', v.make, 'model', v.model, 'modelYear', v.model_year),
    'quote', jsonb_build_object(
      'number', q.number,
      'status', q.status,
      'validUntil', q.valid_until,
      'total', q.total,
      'notes', q.notes,
      'terms', q.terms
    ),
    'items', coalesce(items.items, '[]'::jsonb)
  ) into result
  from public.quotes q
  join public.tenants t on t.id = q.tenant_id
  join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
  join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id and v.customer_id = c.id
  left join public.tenant_branding b on b.tenant_id = q.tenant_id
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
      'description', qi.description,
      'quantity', qi.quantity,
      'unitPrice', qi.unit_price,
      'discount', qi.discount,
      'total', qi.quantity * qi.unit_price - qi.discount
    ) order by qi.sort_order, qi.id) as items
    from public.quote_items qi
    where qi.tenant_id = q.tenant_id and qi.quote_id = q.id
  ) items
  where q.id = quote_row.id and q.tenant_id = quote_row.tenant_id;

  return result;
end;
$$;

create or replace function private.internal_decide_public_quote(
  token_input text,
  decision_input text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  quote_row public.quotes%rowtype;
  request_row public.quote_requests%rowtype;
  product_plan record;
  insufficient_product_names text;
  reserved_product_count integer := 0;
begin
  if token_input is null or length(token_input) < 32 or length(token_input) > 128
    or decision_input not in ('approved', 'rejected') then
    return null;
  end if;

  select q.* into quote_row
  from public.quotes q
  join public.tenants t on t.id = q.tenant_id and t.active and t.status in ('trial', 'active')
  where q.public_token = token_input
    and q.status in ('sent', 'viewed', 'approved', 'rejected')
    and q.public_token_expires_at > now()
    and q.valid_until > now()
  for update of q;
  if not found then
    return null;
  end if;
  if quote_row.status in ('approved', 'rejected') then
    if quote_row.status::text = decision_input then
      return jsonb_build_object('status', quote_row.status, 'idempotent', true);
    end if;
    return null;
  end if;

  select * into request_row from public.quote_requests
  where id = quote_row.quote_request_id and tenant_id = quote_row.tenant_id
  for update;
  if not found or request_row.status <> 'sent' then
    return null;
  end if;

  if decision_input = 'rejected' then
    update public.quotes
    set status = 'rejected', rejected_at = now(), updated_at = now()
    where id = quote_row.id and tenant_id = quote_row.tenant_id and status in ('sent', 'viewed');
    if not found then
      return null;
    end if;
    update public.quote_requests
    set status = 'rejected', updated_at = now()
    where id = request_row.id and tenant_id = quote_row.tenant_id and status = 'sent';
    if not found then
      raise exception 'A solicitação foi alterada antes da decisão.' using errcode = 'P0001';
    end if;
  else
    perform 1 from public.inventory_balances b
    join public.quote_items qi on qi.tenant_id = b.tenant_id and qi.product_id = b.product_id
    where qi.tenant_id = quote_row.tenant_id and qi.quote_id = quote_row.id and qi.product_id is not null
    for update of b;
    select string_agg(product_name, ', ' order by product_name) into insufficient_product_names
    from (
      select p.name as product_name
      from public.quote_items qi
      join public.products p on p.id = qi.product_id and p.tenant_id = qi.tenant_id
      left join public.inventory_balances b on b.tenant_id = qi.tenant_id and b.product_id = qi.product_id
      where qi.tenant_id = quote_row.tenant_id and qi.quote_id = quote_row.id and qi.product_id is not null
      group by p.id, p.name
      having coalesce(max(b.physical_quantity - b.reserved_quantity), 0) < sum(qi.quantity)
    ) insufficient_products;
    if insufficient_product_names is not null then
      raise exception 'A disponibilidade foi alterada. Fale com a oficina para revisar a proposta.' using errcode = 'P0001';
    end if;

    for product_plan in
      select qi.product_id, sum(qi.quantity) as quantity
      from public.quote_items qi
      where qi.tenant_id = quote_row.tenant_id and qi.quote_id = quote_row.id and qi.product_id is not null
      group by qi.product_id
      order by qi.product_id
    loop
      update public.inventory_balances
      set reserved_quantity = reserved_quantity + product_plan.quantity, updated_at = now()
      where tenant_id = quote_row.tenant_id and product_id = product_plan.product_id
        and physical_quantity - reserved_quantity >= product_plan.quantity;
      if not found then
        raise exception 'A disponibilidade foi alterada. Fale com a oficina para revisar a proposta.' using errcode = 'P0001';
      end if;
      insert into public.inventory_reservations(tenant_id, product_id, quote_id, quantity, status)
      values(quote_row.tenant_id, product_plan.product_id, quote_row.id, product_plan.quantity, 'active');
      insert into public.inventory_movements(
        tenant_id, product_id, type, quantity, physical_delta, reserved_delta, reference_type, reference_id, notes
      ) values (
        quote_row.tenant_id, product_plan.product_id, 'reservation', product_plan.quantity, 0, product_plan.quantity,
        'quote', quote_row.id, 'Reserva criada pela aprovação pública do orçamento.'
      );
      reserved_product_count := reserved_product_count + 1;
    end loop;

    update public.quotes
    set status = 'approved', approved_at = now(), updated_at = now()
    where id = quote_row.id and tenant_id = quote_row.tenant_id and status in ('sent', 'viewed');
    if not found then
      raise exception 'O orçamento foi alterado antes da decisão.' using errcode = 'P0001';
    end if;
    update public.quote_requests
    set status = 'approved', updated_at = now()
    where id = request_row.id and tenant_id = quote_row.tenant_id and status = 'sent';
    if not found then
      raise exception 'A solicitação foi alterada antes da decisão.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.quote_events(tenant_id, quote_id, type, metadata)
  values(quote_row.tenant_id, quote_row.id, decision_input, jsonb_build_object(
    'source', 'public_link', 'reservationCreated', decision_input = 'approved', 'reservedProductCount', reserved_product_count
  ));
  insert into public.quote_request_events(tenant_id, quote_request_id, type, metadata)
  values(quote_row.tenant_id, request_row.id, 'status_changed', jsonb_build_object(
    'from', 'sent', 'to', decision_input, 'quoteId', quote_row.id
  ));
  insert into public.audit_logs(tenant_id, action, entity_type, entity_id, before, after, metadata)
  values(quote_row.tenant_id, 'quote.' || decision_input || '_public', 'quote', quote_row.id,
    jsonb_build_object('status', quote_row.status), jsonb_build_object('status', decision_input),
    jsonb_build_object('source', 'public_link', 'visitorIdentityStored', false, 'stockRevalidated', decision_input = 'approved',
      'reservationCreated', decision_input = 'approved', 'reservedProductCount', reserved_product_count,
      'appointmentCreated', false, 'workOrderCreated', false, 'financialEntryCreated', false));

  return jsonb_build_object('status', decision_input, 'idempotent', false);
end;
$$;

create or replace function public.public_decide_quote(token_input text, decision_input text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.internal_decide_public_quote(token_input, decision_input)
$$;

revoke all on function public.public_quote_view(text) from public, anon, authenticated;
grant execute on function public.public_quote_view(text) to service_role;
revoke all on function public.public_decide_quote(text, text) from public, anon, authenticated;
grant execute on function public.public_decide_quote(text, text) to service_role;
revoke all on function private.internal_decide_public_quote(text, text) from public, anon, authenticated;
