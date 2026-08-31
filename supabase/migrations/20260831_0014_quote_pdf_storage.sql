-- Proposta em PDF: gerada no servidor no momento do envio (pdfkit), guardada em
-- bucket privado e disponibilizada ao cliente via URL assinada de curta duração
-- na própria página pública de aprovação. wa.me não permite anexar arquivos, então
-- o PDF nunca trafega pelo WhatsApp — apenas o link da página, como já ocorre hoje.

alter table public.quotes add column if not exists pdf_storage_key text;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('quote-proposals', 'quote-proposals', false, 8388608, array['application/pdf'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Sem policies de storage.objects para este bucket: toda escrita e toda leitura
-- (via URL assinada) passam exclusivamente pelo Service Role no servidor.

create or replace function private.internal_attach_quote_pdf(
  target_tenant_id bigint,
  target_quote_id bigint,
  storage_key_input text
) returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso aos orçamentos desta oficina.' using errcode = '42501';
  end if;
  if storage_key_input is null or storage_key_input !~ '^quotes/[0-9]+/[0-9]+\.pdf$' then
    raise exception 'Chave de armazenamento inválida.' using errcode = '22023';
  end if;

  update public.quotes
  set pdf_storage_key = storage_key_input
  where id = target_quote_id and tenant_id = target_tenant_id and status in ('sent', 'viewed', 'approved', 'rejected');

  if not found then
    raise exception 'Orçamento não encontrado ou ainda não enviado ao cliente.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.workspace_attach_quote_pdf(
  target_tenant_id bigint,
  target_quote_id bigint,
  storage_key_input text
) returns void
language sql
security invoker
set search_path = ''
as $$
  select private.internal_attach_quote_pdf(target_tenant_id, target_quote_id, storage_key_input)
$$;

revoke all on function private.internal_attach_quote_pdf(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.workspace_attach_quote_pdf(bigint, bigint, text) from public, anon;
grant execute on function private.internal_attach_quote_pdf(bigint, bigint, text) to authenticated;
grant execute on function public.workspace_attach_quote_pdf(bigint, bigint, text) to authenticated;

-- Inclui a chave do PDF (uso interno do servidor, nunca exposta como URL bruta)
-- na consulta pública por token, para o servidor montar a URL assinada.
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
      'terms', q.terms,
      'pdfStorageKey', q.pdf_storage_key
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

revoke all on function public.public_quote_view(text) from public, anon, authenticated;
grant execute on function public.public_quote_view(text) to service_role;
