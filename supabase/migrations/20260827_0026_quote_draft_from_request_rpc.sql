-- Cria somente o rascunho comercial a partir de uma solicitação já triada.
-- A operação não envia proposta, não altera o status da solicitação, não
-- expõe o token interno, não reserva estoque e não gera agenda, OS ou financeiro.
create or replace function private.internal_create_quote_draft_from_request(
  target_tenant_id bigint,
  target_request_id bigint,
  notes_input text default null,
  terms_input text default null,
  valid_until_input timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  request_row public.quote_requests%rowtype;
  customer_row public.customers%rowtype;
  vehicle_row public.vehicles%rowtype;
  service_row public.services%rowtype;
  settings_validity_days integer;
  resolved_valid_until timestamptz;
  next_number integer;
  created_quote_id bigint;
  generated_internal_token text;
  parts_subtotal numeric(12, 2);
  parts_cost_total numeric(12, 2);
  subtotal_total numeric(12, 2);
  estimated_cost_total numeric(12, 2);
  estimated_margin numeric(7, 2);
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso à criação de orçamento desta oficina.' using errcode = '42501';
  end if;
  if length(coalesce(notes_input, '')) > 4000 or length(coalesce(terms_input, '')) > 4000 then
    raise exception 'Observações ou condições comerciais excedem o limite permitido.' using errcode = '22023';
  end if;

  select * into request_row
  from public.quote_requests
  where id = target_request_id and tenant_id = target_tenant_id
  for update;
  if not found then
    raise exception 'Solicitação não encontrada nesta oficina.' using errcode = 'P0002';
  end if;
  if request_row.status <> 'in_quoting' then
    raise exception 'A solicitação precisa estar em orçamento antes de criar o rascunho.' using errcode = '22023';
  end if;
  if request_row.customer_id is null or request_row.vehicle_id is null or request_row.service_id is null then
    raise exception 'A solicitação não possui cliente, veículo e serviço vinculados para criar o rascunho.' using errcode = '22023';
  end if;

  select * into customer_row
  from public.customers
  where id = request_row.customer_id and tenant_id = target_tenant_id and active;
  if not found then
    raise exception 'O cliente vinculado à solicitação não está disponível nesta oficina.' using errcode = '22023';
  end if;
  select * into vehicle_row
  from public.vehicles
  where id = request_row.vehicle_id and tenant_id = target_tenant_id and customer_id = customer_row.id;
  if not found then
    raise exception 'O veículo vinculado à solicitação não pertence ao cliente desta oficina.' using errcode = '22023';
  end if;
  select * into service_row
  from public.services
  where id = request_row.service_id and tenant_id = target_tenant_id and active;
  if not found then
    raise exception 'O serviço vinculado à solicitação não está disponível no catálogo desta oficina.' using errcode = '22023';
  end if;

  select quote_validity_days into settings_validity_days
  from public.tenant_settings
  where tenant_id = target_tenant_id;
  settings_validity_days := coalesce(settings_validity_days, 7);
  if settings_validity_days < 1 or settings_validity_days > 365 then
    raise exception 'A validade padrão de orçamento da oficina é inválida.' using errcode = '22023';
  end if;
  resolved_valid_until := coalesce(valid_until_input, now() + make_interval(days => settings_validity_days));
  if resolved_valid_until <= now() or resolved_valid_until > now() + interval '366 days' then
    raise exception 'A validade do orçamento precisa estar entre agora e os próximos 366 dias.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(target_tenant_id);
  if exists (
    select 1 from public.quotes
    where tenant_id = target_tenant_id and quote_request_id = request_row.id
  ) then
    raise exception 'Esta solicitação já possui um orçamento criado.' using errcode = 'P0001';
  end if;

  select coalesce(sum(sp.quantity * p.sale_price), 0),
    coalesce(sum(sp.quantity * coalesce(nullif(p.average_cost, 0), p.current_cost)), 0)
  into parts_subtotal, parts_cost_total
  from public.service_products sp
  join public.products p on p.id = sp.product_id and p.tenant_id = target_tenant_id and p.active
  where sp.tenant_id = target_tenant_id and sp.service_id = service_row.id;

  subtotal_total := service_row.labor_price + parts_subtotal;
  estimated_cost_total := service_row.estimated_cost + parts_cost_total;
  estimated_margin := case
    when subtotal_total > 0 then round(((subtotal_total - estimated_cost_total) / subtotal_total) * 100, 2)
    else 0
  end;
  select coalesce(max(number), 0) + 1 into next_number
  from public.quotes where tenant_id = target_tenant_id;
  generated_internal_token := encode(gen_random_bytes(32), 'hex');

  insert into public.quotes(
    tenant_id, number, quote_request_id, customer_id, vehicle_id, status,
    subtotal, total, estimated_cost_total, estimated_margin_percent,
    valid_until, public_token, public_token_expires_at, notes, terms, created_by_user_id
  ) values (
    target_tenant_id, next_number, request_row.id, customer_row.id, vehicle_row.id, 'draft',
    subtotal_total, subtotal_total, estimated_cost_total, estimated_margin,
    resolved_valid_until, generated_internal_token, resolved_valid_until,
    nullif(trim(notes_input), ''), nullif(trim(terms_input), ''), auth.uid()
  ) returning id into created_quote_id;

  insert into public.quote_items(
    tenant_id, quote_id, service_id, item_type, description, quantity, unit_price, unit_cost, sort_order
  ) values (
    target_tenant_id, created_quote_id, service_row.id, 'service', service_row.name,
    1, service_row.labor_price, service_row.estimated_cost, 0
  );
  insert into public.quote_items(
    tenant_id, quote_id, product_id, item_type, description, quantity, unit_price, unit_cost, sort_order
  )
  select target_tenant_id, created_quote_id, p.id, 'product', p.name, sp.quantity,
    p.sale_price, coalesce(nullif(p.average_cost, 0), p.current_cost),
    row_number() over (order by p.name asc, sp.id asc)
  from public.service_products sp
  join public.products p on p.id = sp.product_id and p.tenant_id = target_tenant_id and p.active
  where sp.tenant_id = target_tenant_id and sp.service_id = service_row.id;

  insert into public.quote_events(tenant_id, quote_id, type, actor_user_id, metadata)
  values(target_tenant_id, created_quote_id, 'draft_created', auth.uid(), jsonb_build_object('requestId', request_row.id, 'number', next_number));
  insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata)
  values(target_tenant_id, request_row.id, 'quote_draft_created', auth.uid(), jsonb_build_object('quoteId', created_quote_id, 'number', next_number));
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values(target_tenant_id, auth.uid(), 'quote.draft_created', 'quote', created_quote_id,
    jsonb_build_object('number', next_number, 'requestId', request_row.id, 'status', 'draft', 'validUntil', resolved_valid_until, 'total', subtotal_total));

  return jsonb_build_object(
    'id', created_quote_id,
    'tenantId', target_tenant_id,
    'requestId', request_row.id,
    'number', next_number,
    'status', 'draft',
    'validUntil', resolved_valid_until,
    'total', subtotal_total
  );
end;
$$;

create or replace function public.workspace_create_quote_draft_from_request(
  target_tenant_id bigint,
  target_request_id bigint,
  notes_input text default null,
  terms_input text default null,
  valid_until_input timestamptz default null
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.internal_create_quote_draft_from_request(
    target_tenant_id, target_request_id, notes_input, terms_input, valid_until_input
  )
$$;

revoke all on function public.workspace_create_quote_draft_from_request(bigint, bigint, text, text, timestamptz) from public, anon;
grant execute on function public.workspace_create_quote_draft_from_request(bigint, bigint, text, text, timestamptz) to authenticated;
revoke all on function private.internal_create_quote_draft_from_request(bigint, bigint, text, text, timestamptz) from public, anon, authenticated;
