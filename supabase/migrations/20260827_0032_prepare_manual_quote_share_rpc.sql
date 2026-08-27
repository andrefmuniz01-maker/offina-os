-- Prepara o compartilhamento manual de uma proposta pronta.
-- A transação rotaciona o token e registra o envio, mas não envia mensagem,
-- não reserva ou movimenta estoque e não cria agenda, OS ou financeiro.
create or replace function private.internal_prepare_quote_manual_share(
  target_tenant_id bigint,
  target_quote_id bigint,
  expected_updated_at_input timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  quote_row public.quotes%rowtype;
  request_row public.quote_requests%rowtype;
  customer_name text;
  vehicle_name text;
  workshop_name text;
  configured_template text;
  resolved_template text;
  rotated_token text;
  insufficient_product_names text;
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso ao envio de orçamento desta oficina.' using errcode = '42501';
  end if;

  select * into quote_row from public.quotes
  where id = target_quote_id and tenant_id = target_tenant_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta oficina.' using errcode = 'P0002';
  end if;
  if quote_row.status <> 'ready' then
    raise exception 'Somente propostas prontas podem ser preparadas para envio.' using errcode = '22023';
  end if;
  if quote_row.updated_at is distinct from expected_updated_at_input then
    raise exception 'Este orçamento foi alterado em outra sessão. Atualize antes de preparar o envio.' using errcode = 'P0001';
  end if;
  if quote_row.valid_until <= now() then
    raise exception 'A validade desta proposta expirou. Revise os valores antes de compartilhar.' using errcode = '22023';
  end if;
  if quote_row.quote_request_id is null then
    raise exception 'Esta proposta não está vinculada a uma solicitação comercial.' using errcode = '22023';
  end if;

  select * into request_row from public.quote_requests
  where id = quote_row.quote_request_id and tenant_id = target_tenant_id
  for update;
  if not found or request_row.status <> 'ready' then
    raise exception 'A solicitação vinculada foi alterada e não pode ser compartilhada agora.' using errcode = 'P0001';
  end if;

  perform 1 from public.inventory_balances b
  join public.quote_items qi on qi.tenant_id = b.tenant_id and qi.product_id = b.product_id
  where qi.tenant_id = target_tenant_id and qi.quote_id = quote_row.id and qi.product_id is not null
  for update of b;
  select string_agg(product_name, ', ' order by product_name) into insufficient_product_names
  from (
    select p.name as product_name
    from public.quote_items qi
    join public.products p on p.id = qi.product_id and p.tenant_id = qi.tenant_id
    left join public.inventory_balances b on b.tenant_id = qi.tenant_id and b.product_id = qi.product_id
    where qi.tenant_id = target_tenant_id and qi.quote_id = quote_row.id and qi.product_id is not null
    group by p.id, p.name
    having coalesce(max(b.physical_quantity - b.reserved_quantity), 0) < sum(qi.quantity)
  ) insufficient_products;
  if insufficient_product_names is not null then
    raise exception 'Estoque indisponível para compartilhar a proposta: %', insufficient_product_names using errcode = 'P0001';
  end if;

  select c.name, trim(concat_ws(' ', v.make, v.model, v.model_year::text)), t.name, s.quote_message_template
  into customer_name, vehicle_name, workshop_name, configured_template
  from public.quotes q
  join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
  join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id and v.customer_id = c.id
  join public.tenants t on t.id = q.tenant_id
  left join public.tenant_settings s on s.tenant_id = q.tenant_id
  where q.id = quote_row.id and q.tenant_id = target_tenant_id;
  if customer_name is null or vehicle_name is null or workshop_name is null then
    raise exception 'A proposta não possui os dados comerciais necessários para compartilhamento.' using errcode = '22023';
  end if;

  resolved_template := coalesce(nullif(trim(configured_template), ''),
    'Olá {{cliente}}, sua proposta para {{veiculo}} está pronta. Total: {{total}}. Confira: {{link}}. {{oficina}}');
  if length(resolved_template) > 1600 then
    raise exception 'O modelo de mensagem comercial excede o limite permitido.' using errcode = '22023';
  end if;

  rotated_token := encode(gen_random_bytes(32), 'hex');
  update public.quotes
  set status = 'sent', sent_at = now(), public_token = rotated_token,
      public_token_expires_at = valid_until, updated_at = now()
  where id = quote_row.id and tenant_id = target_tenant_id and status = 'ready';
  if not found then
    raise exception 'Este orçamento foi alterado antes da preparação do envio. Atualize a fila.' using errcode = 'P0001';
  end if;
  update public.quote_requests
  set status = 'sent', updated_at = now()
  where id = request_row.id and tenant_id = target_tenant_id and status = 'ready';
  if not found then
    raise exception 'A solicitação foi alterada antes da preparação do envio. Atualize a fila.' using errcode = 'P0001';
  end if;
  select * into quote_row from public.quotes where id = quote_row.id and tenant_id = target_tenant_id;

  insert into public.quote_events(tenant_id, quote_id, type, actor_user_id, metadata)
  values(target_tenant_id, quote_row.id, 'sent', auth.uid(), jsonb_build_object(
    'channel', 'manual_copy', 'stockRevalidated', true, 'tokenRotated', true, 'externalMessageSent', false
  ));
  insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata)
  values(target_tenant_id, request_row.id, 'status_changed', auth.uid(), jsonb_build_object('from', 'ready', 'to', 'sent', 'quoteId', quote_row.id));
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after, metadata)
  values(target_tenant_id, auth.uid(), 'quote.manual_share_prepared', 'quote', quote_row.id,
    jsonb_build_object('status', 'ready'), jsonb_build_object('status', 'sent'),
    jsonb_build_object('requestId', request_row.id, 'channel', 'manual_copy', 'stockRevalidated', true,
      'tokenRotated', true, 'reservationCreated', false, 'externalMessageSent', false));

  return jsonb_build_object(
    'id', quote_row.id, 'tenantId', target_tenant_id, 'requestId', request_row.id, 'status', 'sent',
    'updatedAt', quote_row.updated_at, 'publicToken', rotated_token, 'messageTemplate', resolved_template,
    'customerName', customer_name, 'vehicleName', vehicle_name, 'workshopName', workshop_name, 'total', quote_row.total
  );
end;
$$;

create or replace function public.workspace_prepare_quote_manual_share(
  target_tenant_id bigint,
  target_quote_id bigint,
  expected_updated_at_input timestamptz
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.internal_prepare_quote_manual_share(target_tenant_id, target_quote_id, expected_updated_at_input)
$$;

revoke all on function public.workspace_prepare_quote_manual_share(bigint, bigint, timestamptz) from public, anon;
grant execute on function public.workspace_prepare_quote_manual_share(bigint, bigint, timestamptz) to authenticated;
revoke all on function private.internal_prepare_quote_manual_share(bigint, bigint, timestamptz) from public, anon, authenticated;
