-- Expõe somente a proposta comercial já enviada por um token de alta entropia.
-- Esta consulta não cria reserva, não modifica estoque, não toma decisão do cliente
-- e não retorna identificadores internos, custo, margem, telefone ou e-mail.
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
    and q.status in ('sent', 'viewed')
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
      'status', case when q.status = 'sent' then 'viewed' else q.status::text end,
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

revoke all on function public.public_quote_view(text) from public, authenticated;
grant execute on function public.public_quote_view(text) to anon;
