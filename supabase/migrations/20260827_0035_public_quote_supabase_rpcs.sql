-- RPCs públicas por token para o mesmo componente de decisão de orçamento.
-- A função anterior usava outro nome de parâmetro; o DROP permite trocar apenas os nomes.
drop function if exists public.public_decide_quote(text, text);

-- O token é a única credencial do cliente; custos internos nunca são retornados.

create or replace function public.public_view_quote(target_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quote_row public.quotes%rowtype;
  workshop_row public.tenants%rowtype;
  customer_name text;
  vehicle_row public.vehicles%rowtype;
  branding_payload jsonb;
  items_payload jsonb;
  previous_status text;
begin
  if target_token is null or length(trim(target_token)) < 16 or length(trim(target_token)) > 96 then
    return null;
  end if;

  select q.* into quote_row
  from public.quotes q
  join public.tenants t
    on t.id = q.tenant_id
   and t.active
   and t.status = 'active'
  where q.public_token = trim(target_token)
  limit 1;

  if not found then
    return null;
  end if;

  if quote_row.public_token_expires_at < now()
     and quote_row.status::text in ('draft', 'ready', 'sent', 'viewed') then
    previous_status := quote_row.status::text;
    update public.quotes
    set status = 'expired', updated_at = now()
    where id = quote_row.id
      and tenant_id = quote_row.tenant_id
      and status::text = previous_status
    returning * into quote_row;
    if found then
      insert into public.audit_logs(tenant_id, action, entity_type, entity_id, before, after, metadata)
      values(quote_row.tenant_id, 'quote.expired_public', 'quote', quote_row.id,
        jsonb_build_object('status', previous_status),
        jsonb_build_object('status', 'expired'),
        jsonb_build_object('source', 'public_link_expiration'));
    end if;
    return jsonb_build_object('expired', true);
  end if;

  if quote_row.status::text = 'expired' then
    return jsonb_build_object('expired', true);
  end if;

  if quote_row.viewed_at is null and quote_row.status::text in ('draft', 'ready', 'sent') then
    previous_status := quote_row.status::text;
    update public.quotes
    set status = 'viewed', viewed_at = now(), updated_at = now()
    where id = quote_row.id
      and tenant_id = quote_row.tenant_id
      and status::text = previous_status
      and viewed_at is null
    returning * into quote_row;
    if found then
      insert into public.quote_events(tenant_id, quote_id, type, metadata)
      values(quote_row.tenant_id, quote_row.id, 'viewed', jsonb_build_object('source', 'public_link'));
      insert into public.audit_logs(tenant_id, action, entity_type, entity_id, before, after, metadata)
      values(quote_row.tenant_id, 'quote.viewed_public', 'quote', quote_row.id,
        jsonb_build_object('status', previous_status),
        jsonb_build_object('status', 'viewed'),
        jsonb_build_object('source', 'public_link'));
    end if;
  end if;

  select t.* into workshop_row
  from public.tenants t
  where t.id = quote_row.tenant_id
  limit 1;

  select c.name into customer_name
  from public.customers c
  where c.id = quote_row.customer_id
    and c.tenant_id = quote_row.tenant_id
  limit 1;

  select v.* into vehicle_row
  from public.vehicles v
  where v.id = quote_row.vehicle_id
    and v.tenant_id = quote_row.tenant_id
  limit 1;

  select coalesce(jsonb_build_object(
    'logoUrl', b.logo_url,
    'primaryColor', b.primary_color,
    'secondaryColor', b.secondary_color,
    'accentColor', b.accent_color,
    'publicTitle', b.public_title
  ), '{}'::jsonb)
  into branding_payload
  from public.tenant_branding b
  where b.tenant_id = quote_row.tenant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', qi.id,
    'description', qi.description,
    'quantity', qi.quantity,
    'unitPrice', qi.unit_price,
    'total', (qi.quantity * qi.unit_price - qi.discount),
    'itemType', qi.item_type
  ) order by qi.sort_order, qi.id), '[]'::jsonb)
  into items_payload
  from public.quote_items qi
  where qi.tenant_id = quote_row.tenant_id
    and qi.quote_id = quote_row.id;

  return jsonb_build_object(
    'workshop', jsonb_build_object('name', workshop_row.name, 'whatsapp', null, 'branding', branding_payload),
    'quote', jsonb_build_object(
      'number', quote_row.number,
      'status', quote_row.status,
      'total', quote_row.total,
      'validUntil', quote_row.valid_until,
      'notes', quote_row.notes,
      'terms', quote_row.terms
    ),
    'customer', jsonb_build_object('name', customer_name),
    'vehicle', jsonb_build_object('make', vehicle_row.make, 'model', vehicle_row.model, 'modelYear', vehicle_row.model_year),
    'items', items_payload
  );
end;
$$;

create or replace function public.public_decide_quote(target_token text, decision_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quote_row public.quotes%rowtype;
  previous_status text;
  item_row record;
  balance_row public.inventory_balances%rowtype;
  reserved_count integer := 0;
  updated_count integer;
  request_status public.quote_request_status;
begin
  if decision_input not in ('approved', 'rejected') then
    raise exception 'Decisão de orçamento inválida.' using errcode = '22023';
  end if;

  select q.* into quote_row
  from public.quotes q
  join public.tenants t
    on t.id = q.tenant_id
   and t.active
   and t.status = 'active'
  where q.public_token = trim(target_token)
  limit 1;

  if not found then
    raise exception 'Orçamento não encontrado.' using errcode = 'P0002';
  end if;
  if quote_row.public_token_expires_at < now() then
    raise exception 'Este link de orçamento expirou.' using errcode = '22023';
  end if;
  if quote_row.status::text in ('approved', 'rejected') then
    return jsonb_build_object('status', quote_row.status, 'idempotent', true);
  end if;
  if quote_row.status::text not in ('draft', 'ready', 'sent', 'viewed') then
    raise exception 'Este orçamento não está disponível para decisão.' using errcode = '22023';
  end if;

  previous_status := quote_row.status::text;
  update public.quotes
  set status = decision_input::public.quote_status,
      approved_at = case when decision_input = 'approved' then now() else approved_at end,
      rejected_at = case when decision_input = 'rejected' then now() else rejected_at end,
      updated_at = now()
  where id = quote_row.id
    and tenant_id = quote_row.tenant_id
    and status::text = previous_status;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Este orçamento foi decidido em outra sessão. Atualize a página para consultar o estado atual.' using errcode = '40001';
  end if;

  if decision_input = 'approved' then
    for item_row in
      select qi.product_id, sum(qi.quantity)::numeric as quantity
      from public.quote_items qi
      where qi.tenant_id = quote_row.tenant_id
        and qi.quote_id = quote_row.id
        and qi.item_type = 'product'
        and qi.product_id is not null
      group by qi.product_id
    loop
      select * into balance_row
      from public.inventory_balances ib
      where ib.tenant_id = quote_row.tenant_id
        and ib.product_id = item_row.product_id
      for update;
      if not found or balance_row.physical_quantity - balance_row.reserved_quantity < item_row.quantity then
        raise exception 'Um ou mais itens não possuem disponibilidade para reserva. Fale com a oficina.' using errcode = '22023';
      end if;

      update public.inventory_balances
      set reserved_quantity = reserved_quantity + item_row.quantity
      where id = balance_row.id
        and tenant_id = quote_row.tenant_id
        and physical_quantity - reserved_quantity >= item_row.quantity;
      get diagnostics updated_count = row_count;
      if updated_count <> 1 then
        raise exception 'O saldo foi reservado em outra aprovação. Atualize o orçamento e tente novamente.' using errcode = '40001';
      end if;

      insert into public.inventory_reservations(tenant_id, product_id, quote_id, quantity, status)
      values(quote_row.tenant_id, item_row.product_id, quote_row.id, item_row.quantity, 'active');
      insert into public.inventory_movements(tenant_id, product_id, type, quantity, physical_delta, reserved_delta, reference_type, reference_id, notes)
      values(quote_row.tenant_id, item_row.product_id, 'reservation', item_row.quantity, 0, item_row.quantity, 'quote', quote_row.id, 'Reserva criada por aprovação pública do orçamento.');
      reserved_count := reserved_count + 1;
    end loop;
  end if;

  insert into public.quote_events(tenant_id, quote_id, type, metadata)
  values(quote_row.tenant_id, quote_row.id, decision_input, jsonb_build_object('source', 'public_link', 'reservedProductCount', reserved_count));

  if quote_row.quote_request_id is not null then
    begin
      request_status := case when decision_input = 'approved' then 'approved'::public.quote_request_status else 'rejected'::public.quote_request_status end;
      update public.quote_requests
      set status = request_status, updated_at = now()
      where id = quote_row.quote_request_id
        and tenant_id = quote_row.tenant_id
        and status::text not in ('approved', 'rejected', 'cancelled');
    exception when invalid_text_representation then
      null;
    end;
  end if;

  insert into public.audit_logs(tenant_id, action, entity_type, entity_id, before, after, metadata)
  values(quote_row.tenant_id, 'quote.' || decision_input || '_public', 'quote', quote_row.id,
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', decision_input),
    jsonb_build_object('source', 'public_link', 'reservedProductCount', reserved_count));

  return jsonb_build_object('status', decision_input, 'idempotent', false);
end;
$$;

revoke all on function public.public_view_quote(text), public.public_decide_quote(text, text) from public, authenticated;
grant execute on function public.public_view_quote(text), public.public_decide_quote(text, text) to anon, authenticated;
