-- Fluxo da página pública do orçamento depois da decisão do cliente.
--
-- 1) public_quote_view só devolvia propostas "sent"/"viewed". Depois que o
--    cliente aprovava ou recusava, a página recarregava a proposta e ela vinha
--    vazia: o cliente via "Orçamento indisponível" logo após aprovar. Agora a
--    proposta decidida continua acessível pelo mesmo link (mostra a confirmação),
--    sem exigir validade; propostas em aberto seguem exigindo link e validade.
-- 2) Avisa a oficina: ao aprovar/recusar, entra uma notificação para toda a
--    equipe (aparece na tela inicial e em Notificações).

create or replace function public.public_quote_view(token_input text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
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
    and (
      q.status in ('approved', 'rejected')
      or (q.status in ('sent', 'viewed') and q.public_token_expires_at > now() and q.valid_until > now())
    )
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

-- Aviso à oficina quando o cliente decide (user_id nulo = visível a toda a equipe).
create or replace function private.notify_quote_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  approved boolean := new.status = 'approved';
  label text := 'Proposta #' || lpad(new.number::text, 6, '0');
  amount text := 'R$ ' || replace(to_char(new.total, 'FM999999990.00'), '.', ',');
begin
  insert into public.notifications (tenant_id, customer_id, vehicle_id, type, title, body, link)
  values (
    new.tenant_id, new.customer_id, new.vehicle_id,
    case when approved then 'quote.approved' else 'quote.rejected' end,
    label || case when approved then ' aprovada pelo cliente' else ' recusada pelo cliente' end,
    case when approved
      then 'O cliente aprovou ' || amount || '. Os itens foram reservados no estoque; agende a execução em Orçamentos.'
      else 'O cliente recusou ' || amount || '. Você pode revisar a proposta e enviar uma nova.' end,
    '/orcamentos'
  );
  return new;
end;
$$;

drop trigger if exists quotes_notify_decision on public.quotes;
create trigger quotes_notify_decision
after update of status on public.quotes
for each row
when (old.status is distinct from new.status and new.status in ('approved', 'rejected'))
execute function private.notify_quote_decision();

-- Propostas decididas hoje antes deste aviso existir também ganham a notificação.
insert into public.notifications (tenant_id, customer_id, vehicle_id, type, title, body, link)
select q.tenant_id, q.customer_id, q.vehicle_id, 'quote.approved',
  'Proposta #' || lpad(q.number::text, 6, '0') || ' aprovada pelo cliente',
  'O cliente aprovou R$ ' || replace(to_char(q.total, 'FM999999990.00'), '.', ',') || '. Os itens foram reservados no estoque; agende a execução em Orçamentos.',
  '/orcamentos'
from public.quotes q
where q.status = 'approved'
  and q.approved_at >= timestamptz '2026-11-25 00:00:00+00'
  and not exists (
    select 1 from public.notifications n
    where n.tenant_id = q.tenant_id and n.type = 'quote.approved' and n.title like 'Proposta #' || lpad(q.number::text, 6, '0') || '%'
  );
