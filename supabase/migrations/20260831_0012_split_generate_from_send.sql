-- Correção de comportamento: o clique único misturava "montar a proposta" com
-- "enviar de fato ao cliente" em uma única ação irreversível. Ao só abrir a
-- confirmação para conferir a proposta, o operador já disparava o envio, e a
-- solicitação contava como "orçamento" (Aguardando retorno) mesmo sem o link
-- ter sido realmente enviado ao cliente.
--
-- Separação: gerar a proposta agora só cria e finaliza o orçamento (chega até
-- "pronta"/ready) e a solicitação continua em Novas Solicitações. Só quando o
-- operador confirma explicitamente o envio (abrindo o WhatsApp) é que o
-- orçamento vira "sent" e a solicitação passa a contar como Aguardando
-- retorno — reaproveitando private.internal_prepare_quote_manual_share, que
-- já fazia exatamente essa transição no fluxo manual antigo.

drop function if exists public.workspace_generate_and_send_quote(bigint, bigint);
drop function if exists private.internal_generate_and_send_quote(bigint, bigint);

create or replace function private.internal_generate_quote_from_request(
  target_tenant_id bigint,
  target_request_id bigint
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  request_row public.quote_requests%rowtype;
  existing_quote_id bigint;
  existing_quote_status public.quote_status;
  draft_result jsonb;
  quote_id bigint;
  quote_updated_at timestamptz;
  quote_total numeric(12, 2);
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso à fila comercial desta oficina.' using errcode = '42501';
  end if;

  select * into request_row from public.quote_requests
  where id = target_request_id and tenant_id = target_tenant_id
  for update;
  if not found then
    raise exception 'Solicitação não encontrada nesta oficina.' using errcode = 'P0002';
  end if;
  if request_row.status not in ('new', 'in_analysis', 'awaiting_information', 'in_quoting', 'ready') then
    raise exception 'Esta solicitação já foi enviada ao cliente.' using errcode = '22023';
  end if;

  select q.id, q.status into existing_quote_id, existing_quote_status
  from public.quotes q
  where q.tenant_id = target_tenant_id and q.quote_request_id = request_row.id
  order by q.id desc
  limit 1;

  if existing_quote_id is null then
    if request_row.status = 'new' then
      update public.quote_requests set status = 'in_analysis', updated_at = now() where id = request_row.id;
      insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata)
        values(target_tenant_id, request_row.id, 'status_changed', auth.uid(), jsonb_build_object('from', 'new', 'to', 'in_analysis'));
      request_row.status := 'in_analysis';
    end if;
    if request_row.status in ('in_analysis', 'awaiting_information') then
      update public.quote_requests set status = 'in_quoting', updated_at = now() where id = request_row.id;
      insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata)
        values(target_tenant_id, request_row.id, 'status_changed', auth.uid(), jsonb_build_object('from', request_row.status, 'to', 'in_quoting'));
    end if;

    draft_result := private.internal_create_quote_draft_from_request(target_tenant_id, target_request_id, null, null, null);
    quote_id := (draft_result->>'id')::bigint;
    existing_quote_status := 'draft';
  else
    quote_id := existing_quote_id;
  end if;

  if existing_quote_status = 'draft' then
    select updated_at into quote_updated_at from public.quotes where id = quote_id;
    perform private.internal_finalize_quote_draft(target_tenant_id, quote_id, quote_updated_at);
  end if;

  select updated_at, total into quote_updated_at, quote_total from public.quotes where id = quote_id;

  return jsonb_build_object(
    'id', quote_id,
    'tenantId', target_tenant_id,
    'requestId', target_request_id,
    'status', 'ready',
    'updatedAt', quote_updated_at,
    'total', quote_total
  );
end;
$function$;

create or replace function public.workspace_generate_quote_from_request(
  target_tenant_id bigint,
  target_request_id bigint
) returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.internal_generate_quote_from_request(target_tenant_id, target_request_id)
$$;

revoke all on function public.workspace_generate_quote_from_request(bigint, bigint) from public, anon;
grant execute on function public.workspace_generate_quote_from_request(bigint, bigint) to authenticated;
grant execute on function private.internal_generate_quote_from_request(bigint, bigint) to authenticated;

-- Adiciona o WhatsApp do cliente ao retorno do preparo de compartilhamento,
-- para o cliente montar o link wa.me sem uma segunda consulta.
create or replace function private.internal_prepare_quote_manual_share(
  target_tenant_id bigint,
  target_quote_id bigint,
  expected_updated_at_input timestamp with time zone
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'extensions', 'pg_temp'
as $function$
declare
  quote_row public.quotes%rowtype;
  request_row public.quote_requests%rowtype;
  customer_name text;
  customer_whatsapp text;
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

  select c.name, c.whatsapp, trim(concat_ws(' ', v.make, v.model, v.model_year::text)), t.name, s.quote_message_template
  into customer_name, customer_whatsapp, vehicle_name, workshop_name, configured_template
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
    'customerName', customer_name, 'customerWhatsapp', customer_whatsapp, 'vehicleName', vehicle_name,
    'workshopName', workshop_name, 'total', quote_row.total
  );
end;
$function$;
