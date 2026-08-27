-- Tokens públicos da Demo usam o mesmo formato curto já seedado pelo tenant.
-- A validação de existência e o limite superior continuam ativos.

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
  if target_token is null or length(trim(target_token)) < 1 or length(trim(target_token)) > 96 then
    return null;
  end if;

  select q.* into quote_row
  from public.quotes q
  join public.tenants t on t.id = q.tenant_id and t.active and t.status = 'active'
  where q.public_token = trim(target_token)
  limit 1;
  if not found then return null; end if;

  if quote_row.public_token_expires_at < now()
     and quote_row.status::text in ('draft', 'ready', 'sent', 'viewed') then
    previous_status := quote_row.status::text;
    update public.quotes
    set status = 'expired', updated_at = now()
    where id = quote_row.id and tenant_id = quote_row.tenant_id and status::text = previous_status
    returning * into quote_row;
    if found then
      insert into public.audit_logs(tenant_id, action, entity_type, entity_id, before, after, metadata)
      values(quote_row.tenant_id, 'quote.expired_public', 'quote', quote_row.id,
        jsonb_build_object('status', previous_status), jsonb_build_object('status', 'expired'),
        jsonb_build_object('source', 'public_link_expiration'));
    end if;
    return jsonb_build_object('expired', true);
  end if;
  if quote_row.status::text = 'expired' then return jsonb_build_object('expired', true); end if;

  if quote_row.viewed_at is null and quote_row.status::text in ('draft', 'ready', 'sent') then
    previous_status := quote_row.status::text;
    update public.quotes
    set status = 'viewed', viewed_at = now(), updated_at = now()
    where id = quote_row.id and tenant_id = quote_row.tenant_id
      and status::text = previous_status and viewed_at is null
    returning * into quote_row;
    if found then
      insert into public.quote_events(tenant_id, quote_id, type, metadata)
      values(quote_row.tenant_id, quote_row.id, 'viewed', jsonb_build_object('source', 'public_link'));
      insert into public.audit_logs(tenant_id, action, entity_type, entity_id, before, after, metadata)
      values(quote_row.tenant_id, 'quote.viewed_public', 'quote', quote_row.id,
        jsonb_build_object('status', previous_status), jsonb_build_object('status', 'viewed'),
        jsonb_build_object('source', 'public_link'));
    end if;
  end if;

  select t.* into workshop_row from public.tenants t where t.id = quote_row.tenant_id limit 1;
  select c.name into customer_name from public.customers c where c.id = quote_row.customer_id and c.tenant_id = quote_row.tenant_id limit 1;
  select v.* into vehicle_row from public.vehicles v where v.id = quote_row.vehicle_id and v.tenant_id = quote_row.tenant_id limit 1;
  select coalesce(jsonb_build_object(
    'logoUrl', b.logo_url, 'primaryColor', b.primary_color, 'secondaryColor', b.secondary_color,
    'accentColor', b.accent_color, 'publicTitle', b.public_title
  ), '{}'::jsonb) into branding_payload
  from public.tenant_branding b where b.tenant_id = quote_row.tenant_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', qi.id, 'description', qi.description, 'quantity', qi.quantity,
    'unitPrice', qi.unit_price, 'total', (qi.quantity * qi.unit_price - qi.discount), 'itemType', qi.item_type
  ) order by qi.sort_order, qi.id), '[]'::jsonb) into items_payload
  from public.quote_items qi where qi.tenant_id = quote_row.tenant_id and qi.quote_id = quote_row.id;

  return jsonb_build_object(
    'workshop', jsonb_build_object('name', workshop_row.name, 'whatsapp', null, 'branding', branding_payload),
    'quote', jsonb_build_object('number', quote_row.number, 'status', quote_row.status, 'total', quote_row.total,
      'validUntil', quote_row.valid_until, 'notes', quote_row.notes, 'terms', quote_row.terms),
    'customer', jsonb_build_object('name', customer_name),
    'vehicle', jsonb_build_object('make', vehicle_row.make, 'model', vehicle_row.model, 'modelYear', vehicle_row.model_year),
    'items', items_payload
  );
end;
$$;
