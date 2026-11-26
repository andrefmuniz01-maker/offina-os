-- Agendamento por horários livres (cliente escolhe pelo link; oficina vê sugestões).
--
-- Regras (padrão de mercado: horário de funcionamento + capacidade + duração):
--   * horário de funcionamento = tenant_settings.opening_hours (fuso America/Sao_Paulo);
--     sem configuração usa seg-sex 08-18 e sáb 08-12;
--   * capacidade = baias ativas (mínimo 1): o horário está livre se há menos
--     agendamentos sobrepostos do que baias;
--   * duração = soma da duração estimada dos serviços da proposta (padrão 60 min);
--   * antecedência mínima de 2 horas; horários de hora em hora; janela de 14 dias;
--   * serviço mais longo que o expediente só oferece o primeiro horário do dia.

create or replace function private.default_opening_hours()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'monday', jsonb_build_object('open', '08:00', 'close', '18:00'),
    'tuesday', jsonb_build_object('open', '08:00', 'close', '18:00'),
    'wednesday', jsonb_build_object('open', '08:00', 'close', '18:00'),
    'thursday', jsonb_build_object('open', '08:00', 'close', '18:00'),
    'friday', jsonb_build_object('open', '08:00', 'close', '18:00'),
    'saturday', jsonb_build_object('open', '08:00', 'close', '12:00'),
    'sunday', jsonb_build_object('closed', true)
  )
$$;

create or replace function private.quote_duration_minutes(p_tenant_id bigint, p_quote_id bigint)
returns integer language sql stable security definer set search_path = public, private as $$
  select coalesce(nullif(sum(s.estimated_minutes), 0), 60)::integer
  from public.quote_items qi
  join public.services s on s.id = qi.service_id and s.tenant_id = qi.tenant_id
  where qi.tenant_id = p_tenant_id and qi.quote_id = p_quote_id and qi.service_id is not null
$$;

create or replace function private.available_slots(p_tenant_id bigint, p_duration_minutes integer, p_days integer default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  tz constant text := 'America/Sao_Paulo';
  lead constant interval := interval '2 hours';
  weekdays constant text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  hours jsonb;
  capacity integer;
  duration interval := make_interval(mins => greatest(coalesce(p_duration_minutes, 60), 15));
  local_today date := (now() at time zone tz)::date;
  d date;
  day_cfg jsonb;
  open_t time;
  close_t time;
  day_end timestamp;
  slot_local timestamp;
  slot_start timestamptz;
  slot_end timestamptz;
  fits boolean;
  busy integer;
  day_slots jsonb;
  result jsonb := '[]'::jsonb;
begin
  select ts.opening_hours into hours from public.tenant_settings ts where ts.tenant_id = p_tenant_id;
  hours := coalesce(hours, private.default_opening_hours());
  select greatest(count(*), 1) into capacity from public.bays b where b.tenant_id = p_tenant_id and b.active;

  for i in 0 .. least(greatest(coalesce(p_days, 14), 1), 30) - 1 loop
    d := local_today + i;
    day_cfg := hours -> weekdays[extract(dow from d)::int + 1];
    continue when day_cfg is null or coalesce((day_cfg ->> 'closed')::boolean, false);
    continue when day_cfg ->> 'open' is null or day_cfg ->> 'close' is null;
    open_t := (day_cfg ->> 'open')::time;
    close_t := (day_cfg ->> 'close')::time;
    day_end := d + close_t;
    day_slots := '[]'::jsonb;
    slot_local := d + open_t;

    while slot_local < day_end loop
      slot_start := slot_local at time zone tz;
      slot_end := slot_start + duration;
      -- cabe no expediente? Serviço maior que o expediente só começa na abertura.
      if (day_end - (d + open_t)) >= duration then
        fits := slot_local + duration <= day_end;
      else
        fits := slot_local = d + open_t;
      end if;
      if fits and slot_start >= now() + lead then
        select count(*) into busy from public.appointments a
        where a.tenant_id = p_tenant_id
          and a.status not in ('cancelled', 'delivered')
          and a.scheduled_start < slot_end and a.scheduled_end > slot_start;
        if busy < capacity then
          day_slots := day_slots || jsonb_build_object('start', slot_start, 'label', to_char(slot_local, 'HH24:MI'));
        end if;
      end if;
      slot_local := slot_local + interval '60 minutes';
    end loop;

    if jsonb_array_length(day_slots) > 0 then
      result := result || jsonb_build_object('date', d, 'slots', day_slots);
    end if;
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Equipe: horários livres para um orçamento aprovado (ou para serviços avulsos).
-- ---------------------------------------------------------------------------
create or replace function public.workspace_available_slots(
  target_tenant_id bigint,
  target_quote_id bigint default null,
  service_ids_input bigint[] default null,
  days_input integer default 14
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare minutes integer;
begin
  if not private.can_appointments_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para consultar a agenda desta oficina.' using errcode = '42501';
  end if;
  if target_quote_id is not null then
    if not exists (select 1 from public.quotes where id = target_quote_id and tenant_id = target_tenant_id) then
      raise exception 'Proposta não encontrada nesta oficina.' using errcode = 'P0002';
    end if;
    minutes := private.quote_duration_minutes(target_tenant_id, target_quote_id);
  elsif service_ids_input is not null and array_length(service_ids_input, 1) is not null then
    select coalesce(nullif(sum(estimated_minutes), 0), 60)::integer into minutes
    from public.services where tenant_id = target_tenant_id and id = any(service_ids_input) and active;
  else
    minutes := 60;
  end if;
  return jsonb_build_object('durationMinutes', minutes, 'days', private.available_slots(target_tenant_id, minutes, days_input));
end;
$$;

revoke all on function public.workspace_available_slots(bigint, bigint, bigint[], integer) from public, anon;
grant execute on function public.workspace_available_slots(bigint, bigint, bigint[], integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Equipe: dados para a mensagem de agendamento de uma proposta aprovada.
-- ---------------------------------------------------------------------------
create or replace function public.workspace_quote_scheduling_link(target_tenant_id bigint, target_quote_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare r record;
begin
  if not private.can_appointments_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para agendar nesta oficina.' using errcode = '42501';
  end if;
  select q.number, q.public_token, c.name as customer_name, c.whatsapp, t.name as workshop_name,
         trim(concat_ws(' ', v.make, v.model)) as vehicle_name,
         exists (select 1 from public.appointments a where a.tenant_id = q.tenant_id and a.quote_id = q.id) as already_scheduled
    into r
  from public.quotes q
  join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
  join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
  join public.tenants t on t.id = q.tenant_id
  where q.id = target_quote_id and q.tenant_id = target_tenant_id and q.status = 'approved';
  if not found then
    raise exception 'Somente uma proposta aprovada pode receber o link de agendamento.' using errcode = 'P0002';
  end if;
  return jsonb_build_object('quoteNumber', r.number, 'publicToken', r.public_token, 'customerName', r.customer_name,
    'customerWhatsapp', r.whatsapp, 'vehicleName', r.vehicle_name, 'workshopName', r.workshop_name, 'alreadyScheduled', r.already_scheduled);
end;
$$;

revoke all on function public.workspace_quote_scheduling_link(bigint, bigint) from public, anon;
grant execute on function public.workspace_quote_scheduling_link(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Cliente (via servidor, service_role): ver horários livres e agendar pelo link.
-- ---------------------------------------------------------------------------
create or replace function public.public_quote_scheduling_info(token_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  q public.quotes%rowtype;
  appt public.appointments%rowtype;
  minutes integer;
  info record;
begin
  if token_input is null or length(token_input) < 32 or length(token_input) > 128 then return null; end if;
  select qq.* into q from public.quotes qq
  join public.tenants t on t.id = qq.tenant_id and t.active and t.status in ('trial', 'active')
  where qq.public_token = token_input and qq.status = 'approved';
  if not found then return null; end if;

  select t.name as workshop_name, trim(concat_ws(' ', v.make, v.model)) as vehicle_name, split_part(c.name, ' ', 1) as first_name
    into info
  from public.tenants t
  join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
  join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
  where t.id = q.tenant_id;

  select * into appt from public.appointments where tenant_id = q.tenant_id and quote_id = q.id and status <> 'cancelled' order by id desc limit 1;
  if found then
    return jsonb_build_object('state', 'scheduled', 'workshopName', info.workshop_name, 'quoteNumber', q.number,
      'vehicleName', info.vehicle_name, 'firstName', info.first_name,
      'scheduledStart', appt.scheduled_start, 'scheduledEnd', appt.scheduled_end);
  end if;

  minutes := private.quote_duration_minutes(q.tenant_id, q.id);
  return jsonb_build_object('state', 'open', 'workshopName', info.workshop_name, 'quoteNumber', q.number,
    'vehicleName', info.vehicle_name, 'firstName', info.first_name, 'durationMinutes', minutes,
    'days', private.available_slots(q.tenant_id, minutes, 14));
end;
$$;

revoke all on function public.public_quote_scheduling_info(text) from public, anon, authenticated;
grant execute on function public.public_quote_scheduling_info(text) to service_role;

create or replace function public.public_book_quote_slot(token_input text, slot_start_input timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  q public.quotes%rowtype;
  request_row public.quote_requests%rowtype;
  minutes integer;
  slot_end timestamptz;
  chosen_bay_id bigint;
  chosen_bay_name text;
  work_order_id_result bigint;
  work_order_number_result integer;
  appointment_id_result bigint;
  vehicle_label text;
begin
  if token_input is null or length(token_input) < 32 or length(token_input) > 128 or slot_start_input is null then return null; end if;

  select qq.* into q from public.quotes qq
  join public.tenants t on t.id = qq.tenant_id and t.active and t.status in ('trial', 'active')
  where qq.public_token = token_input and qq.status = 'approved'
  for update of qq;
  if not found then return null; end if;

  select * into request_row from public.quote_requests where id = q.quote_request_id and tenant_id = q.tenant_id and status = 'approved' for update;
  if not found then
    raise exception 'Esta proposta não está disponível para agendamento. Fale com a oficina.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.appointments where tenant_id = q.tenant_id and quote_id = q.id and status <> 'cancelled') then
    raise exception 'Esta proposta já possui um horário agendado.' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(q.tenant_id);
  minutes := private.quote_duration_minutes(q.tenant_id, q.id);
  slot_end := slot_start_input + make_interval(mins => minutes);

  if not exists (
    select 1
    from jsonb_array_elements(private.available_slots(q.tenant_id, minutes, 14)) day_entry,
         jsonb_array_elements(day_entry -> 'slots') slot_entry
    where (slot_entry ->> 'start')::timestamptz = slot_start_input
  ) then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro horário.' using errcode = 'P0001';
  end if;

  select b.id, b.name into chosen_bay_id, chosen_bay_name
  from public.bays b
  where b.tenant_id = q.tenant_id and b.active
    and not exists (
      select 1 from public.appointments a
      where a.tenant_id = q.tenant_id and a.bay_id = b.id and a.status not in ('cancelled', 'delivered')
        and a.scheduled_start < slot_end and a.scheduled_end > slot_start_input
    )
  order by b.sort_order, b.id
  limit 1;

  select coalesce(max(number), 0) + 1 into work_order_number_result from public.work_orders where tenant_id = q.tenant_id;
  insert into public.work_orders(tenant_id, number, quote_id, customer_id, vehicle_id, estimated_total, estimated_cost_total)
  values (q.tenant_id, work_order_number_result, q.id, q.customer_id, q.vehicle_id, q.total, q.estimated_cost_total)
  returning id into work_order_id_result;

  insert into public.work_order_items(tenant_id, work_order_id, product_id, service_id, description, item_type, quantity, unit_price, expected_unit_cost)
  select tenant_id, work_order_id_result, product_id, service_id, description,
    case when item_type = 'kit' then 'custom' else item_type end, quantity, unit_price, unit_cost
  from public.quote_items where tenant_id = q.tenant_id and quote_id = q.id order by sort_order, id;
  insert into public.work_order_checklists(tenant_id, work_order_id, label, sort_order) values
    (q.tenant_id, work_order_id_result, 'Inspeção inicial', 0), (q.tenant_id, work_order_id_result, 'Desmontagem', 1),
    (q.tenant_id, work_order_id_result, 'Instalação', 2), (q.tenant_id, work_order_id_result, 'Ajuste', 3),
    (q.tenant_id, work_order_id_result, 'Teste', 4), (q.tenant_id, work_order_id_result, 'Finalização', 5);
  update public.inventory_reservations set work_order_id = work_order_id_result
  where tenant_id = q.tenant_id and quote_id = q.id and status = 'active';

  insert into public.appointments(tenant_id, quote_id, customer_id, vehicle_id, work_order_id, bay, bay_id, scheduled_start, scheduled_end, notes)
  values (q.tenant_id, q.id, q.customer_id, q.vehicle_id, work_order_id_result, chosen_bay_name, chosen_bay_id, slot_start_input, slot_end, 'Horário escolhido pelo cliente no link de agendamento.')
  returning id into appointment_id_result;
  update public.work_orders set appointment_id = appointment_id_result, updated_at = now() where id = work_order_id_result and tenant_id = q.tenant_id;

  insert into public.quote_events(tenant_id, quote_id, type, metadata)
  values (q.tenant_id, q.id, 'scheduled', jsonb_build_object('appointmentId', appointment_id_result, 'workOrderId', work_order_id_result, 'source', 'public_link'));
  insert into public.audit_logs(tenant_id, action, entity_type, entity_id, after, metadata)
  values (q.tenant_id, 'appointment.created_by_customer', 'appointment', appointment_id_result,
    jsonb_build_object('quoteId', q.id, 'workOrderId', work_order_id_result, 'scheduledStart', slot_start_input, 'scheduledEnd', slot_end, 'bayId', chosen_bay_id),
    jsonb_build_object('source', 'public_link'));

  select trim(concat_ws(' ', v.make, v.model)) into vehicle_label from public.vehicles v where v.id = q.vehicle_id and v.tenant_id = q.tenant_id;
  insert into public.notifications(tenant_id, customer_id, vehicle_id, work_order_id, type, title, body, link)
  values (q.tenant_id, q.customer_id, q.vehicle_id, work_order_id_result, 'appointment.scheduled',
    'Cliente agendou o horário (proposta #' || lpad(q.number::text, 6, '0') || ')',
    coalesce(vehicle_label, 'Veículo') || ' — ' || to_char(slot_start_input at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '. A OS #' || lpad(work_order_number_result::text, 6, '0') || ' foi criada.',
    '/operacao');

  return jsonb_build_object('appointmentId', appointment_id_result, 'workOrderNumber', work_order_number_result,
    'scheduledStart', slot_start_input, 'scheduledEnd', slot_end);
end;
$$;

revoke all on function public.public_book_quote_slot(text, timestamptz) from public, anon, authenticated;
grant execute on function public.public_book_quote_slot(text, timestamptz) to service_role;
