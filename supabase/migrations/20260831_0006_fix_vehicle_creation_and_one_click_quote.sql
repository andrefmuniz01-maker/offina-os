-- 1) Corrige o bug real do link público: quando a solicitação chega sem placa,
-- o bloco "if not found then insert veículo" nunca executava, porque a
-- variável implícita FOUND do PL/pgSQL ficava com o valor da consulta
-- anterior (a busca/criação do cliente, que sempre "encontra" algo) quando o
-- bloco de busca por placa era pulado. O resultado: toda solicitação pública
-- sem placa nascia sem veículo vinculado, e a preparação de orçamento
-- (que exige cliente + veículo + serviço) rejeitava com "dados não vinculados".
-- A correção usa uma variável explícita em vez de depender do FOUND implícito
-- atravessando um bloco condicional.
create or replace function public.public_submit_quote_request(
  target_tenant_slug text,
  requester_name_input text,
  requester_whatsapp_input text,
  requester_email_input text,
  vehicle_make_input text,
  vehicle_model_input text,
  vehicle_model_year_input integer,
  vehicle_plate_input text,
  vehicle_mileage_input integer,
  selected_service_id bigint,
  service_label_input text,
  description_input text,
  answers_input jsonb default null::jsonb
) returns table(request_id bigint, request_number integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_tenant public.tenants%rowtype;
  target_service public.services%rowtype;
  customer_record public.customers%rowtype;
  vehicle_record public.vehicles%rowtype;
  vehicle_found boolean := false;
  next_number integer;
  created_request_id bigint;
begin
  select * into target_tenant
  from public.tenants
  where slug = trim(lower(target_tenant_slug))
    and active
    and status = 'active'
    and (not is_demo or slug = 'performance-garage');
  if not found then
    raise exception 'A oficina solicitada não está disponível.' using errcode = 'P0002';
  end if;

  if length(trim(requester_name_input)) < 2 or length(trim(requester_name_input)) > 180
    or length(trim(requester_whatsapp_input)) < 8 or length(trim(requester_whatsapp_input)) > 32
    or length(trim(vehicle_make_input)) < 1 or length(trim(vehicle_make_input)) > 100
    or length(trim(vehicle_model_input)) < 1 or length(trim(vehicle_model_input)) > 140 then
    raise exception 'Dados obrigatórios da solicitação são inválidos.' using errcode = '22023';
  end if;
  if vehicle_model_year_input is not null and (vehicle_model_year_input < 1900 or vehicle_model_year_input > 2100)
    or vehicle_mileage_input is not null and vehicle_mileage_input < 0 then
    raise exception 'Ano ou quilometragem inválidos.' using errcode = '22023';
  end if;

  if selected_service_id is null then
    raise exception 'Selecione um serviço cadastrado da oficina.' using errcode = '22023';
  end if;
  select * into target_service from public.services
  where id = selected_service_id and tenant_id = target_tenant.id and active;
  if not found then
    raise exception 'O serviço selecionado não pertence a esta oficina.' using errcode = '22023';
  end if;

  select * into customer_record from public.customers
  where tenant_id = target_tenant.id and whatsapp = trim(requester_whatsapp_input)
  order by id asc limit 1;
  if not found then
    insert into public.customers (tenant_id, name, whatsapp, email)
    values (target_tenant.id, trim(requester_name_input), trim(requester_whatsapp_input), nullif(trim(requester_email_input), ''))
    returning * into customer_record;
  end if;

  if nullif(trim(vehicle_plate_input), '') is not null then
    select * into vehicle_record from public.vehicles
    where tenant_id = target_tenant.id and customer_id = customer_record.id and plate = trim(vehicle_plate_input)
    order by id asc limit 1;
    vehicle_found := found;
  end if;
  if not vehicle_found then
    insert into public.vehicles (tenant_id, customer_id, make, model, model_year, plate, mileage)
    values (target_tenant.id, customer_record.id, trim(vehicle_make_input), trim(vehicle_model_input), vehicle_model_year_input, nullif(trim(vehicle_plate_input), ''), vehicle_mileage_input)
    returning * into vehicle_record;
  end if;

  perform pg_advisory_xact_lock(target_tenant.id);
  select coalesce(max(number), 0) + 1 into next_number
  from public.quote_requests where tenant_id = target_tenant.id;

  insert into public.quote_requests (
    tenant_id, number, customer_id, vehicle_id, service_id, requester_name, requester_whatsapp,
    requester_email, vehicle_snapshot, service_label, answers, description, source, status
  ) values (
    target_tenant.id, next_number, customer_record.id, vehicle_record.id, selected_service_id,
    trim(requester_name_input), trim(requester_whatsapp_input), nullif(trim(requester_email_input), ''),
    jsonb_build_object('make', trim(vehicle_make_input), 'model', trim(vehicle_model_input), 'modelYear', vehicle_model_year_input, 'plate', nullif(trim(vehicle_plate_input), ''), 'mileage', vehicle_mileage_input),
    target_service.name, answers_input, nullif(trim(description_input), ''), 'public_link', 'new'
  ) returning id into created_request_id;

  insert into public.quote_request_events (tenant_id, quote_request_id, type, metadata)
  values (target_tenant.id, created_request_id, 'created', jsonb_build_object('source', 'public_link'));

  insert into public.notifications (tenant_id, user_id, type, title, body, link)
  select target_tenant.id, tm.user_id, 'quote_request.created', 'Nova solicitação de orçamento',
    trim(requester_name_input) || ' solicitou ' || target_service.name || '.', '/solicitacoes/' || created_request_id
  from public.tenant_members tm
  where tm.tenant_id = target_tenant.id and tm.active;

  return query select created_request_id, next_number;
end;
$function$;

-- 2) Backfill: recria o veículo das 9 solicitações já afetadas pelo bug,
-- usando o snapshot que cada uma já guarda desde a criação. Nenhum dado é
-- inventado — só materializa o que a solicitação já registrou.
do $$
declare
  affected record;
  new_customer_id_check bigint;
  new_vehicle_id bigint;
begin
  for affected in
    select id, tenant_id, customer_id, vehicle_snapshot
    from public.quote_requests
    where vehicle_id is null and vehicle_snapshot is not null
  loop
    select id into new_customer_id_check from public.customers where id = affected.customer_id and tenant_id = affected.tenant_id;
    if new_customer_id_check is null then continue; end if;

    insert into public.vehicles (tenant_id, customer_id, make, model, model_year, plate, mileage)
    values (
      affected.tenant_id,
      affected.customer_id,
      coalesce(affected.vehicle_snapshot->>'make', 'Não informado'),
      coalesce(affected.vehicle_snapshot->>'model', 'Não informado'),
      (affected.vehicle_snapshot->>'modelYear')::integer,
      nullif(affected.vehicle_snapshot->>'plate', ''),
      (affected.vehicle_snapshot->>'mileage')::integer
    )
    returning id into new_vehicle_id;

    update public.quote_requests set vehicle_id = new_vehicle_id where id = affected.id;
  end loop;
end $$;

-- 3) Nova RPC de "gerar e enviar proposta" em uma única ação atômica: avança
-- os estados internos da solicitação (new -> in_analysis -> in_quoting),
-- cria o rascunho, valida estoque, finaliza e já prepara o compartilhamento
-- manual (token rotacionado + mensagem). Se qualquer etapa falhar (ex.:
-- estoque insuficiente), a transação inteira desfaz tudo — nada fica
-- pela metade.
create or replace function private.internal_generate_and_send_quote(
  target_tenant_id bigint,
  target_request_id bigint
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  request_row public.quote_requests%rowtype;
  draft_result jsonb;
  quote_id bigint;
  quote_updated_at timestamptz;
  share_result jsonb;
  customer_whatsapp text;
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
  if request_row.status not in ('new', 'in_analysis', 'awaiting_information', 'in_quoting') then
    raise exception 'Esta solicitação já foi enviada ao cliente.' using errcode = '22023';
  end if;

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

  select updated_at into quote_updated_at from public.quotes where id = quote_id;
  perform private.internal_finalize_quote_draft(target_tenant_id, quote_id, quote_updated_at);

  select updated_at into quote_updated_at from public.quotes where id = quote_id;
  share_result := private.internal_prepare_quote_manual_share(target_tenant_id, quote_id, quote_updated_at);

  select c.whatsapp into customer_whatsapp
  from public.quotes q join public.customers c on c.id = q.customer_id
  where q.id = quote_id;

  return share_result || jsonb_build_object('customerWhatsapp', customer_whatsapp);
end;
$function$;

create or replace function public.workspace_generate_and_send_quote(
  target_tenant_id bigint,
  target_request_id bigint
) returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.internal_generate_and_send_quote(target_tenant_id, target_request_id)
$$;

revoke all on function public.workspace_generate_and_send_quote(bigint, bigint) from public, anon;
grant execute on function public.workspace_generate_and_send_quote(bigint, bigint) to authenticated;
grant execute on function private.internal_generate_and_send_quote(bigint, bigint) to authenticated;
