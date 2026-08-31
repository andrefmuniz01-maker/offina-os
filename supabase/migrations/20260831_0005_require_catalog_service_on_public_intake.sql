-- Regra de negócio: o link público de solicitação de orçamento não deve mais
-- permitir "serviço personalizado ou ainda não definido" — o cliente precisa
-- escolher um serviço já cadastrado no catálogo da oficina. O app (client e
-- tRPC) já passou a exigir serviceId; esta migration reforça a mesma regra
-- na camada de banco, que é o limite de segurança real, para que nenhum
-- caminho consiga criar uma solicitação pública sem um serviço válido do
-- catálogo.

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
  end if;
  if not found then
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
