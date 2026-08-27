-- O agendamento é uma ação interna. Ele nasce exclusivamente de proposta
-- aprovada, vincula a reserva existente à OS e não registra consumo ou receita.
create or replace function private.can_appointments_manage(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenants t
      where t.id = target_tenant_id
        and t.active
        and t.status in ('trial', 'active')
        and (
          private.is_super_admin()
          or (
            not t.is_demo
            and exists (
              select 1
              from public.tenant_members tm
              where tm.tenant_id = t.id
                and tm.user_id = (select auth.uid())
                and tm.active
                and tm.role in ('owner', 'admin', 'attendant')
            )
          )
        )
    )
$$;

create or replace function public.workspace_schedule_approved_quote(
  target_tenant_id bigint,
  target_quote_id bigint,
  scheduled_start_input timestamptz,
  scheduled_end_input timestamptz,
  assigned_to_user_id_input uuid default null,
  bay_input text default null,
  notes_input text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  quote_row public.quotes%rowtype;
  request_row public.quote_requests%rowtype;
  appointment_id_result bigint;
  work_order_id_result bigint;
  work_order_number_result integer;
  assigned_member_exists boolean;
begin
  if not private.can_appointments_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para agendar nesta oficina.' using errcode = '42501';
  end if;
  if scheduled_start_input is null or scheduled_end_input is null
    or scheduled_end_input <= scheduled_start_input
    or scheduled_end_input > scheduled_start_input + interval '24 hours'
    or (bay_input is not null and length(trim(bay_input)) > 80)
    or (notes_input is not null and length(trim(notes_input)) > 4000) then
    raise exception 'Dados de agendamento inválidos.' using errcode = '22023';
  end if;

  select * into quote_row
  from public.quotes
  where id = target_quote_id and tenant_id = target_tenant_id and status = 'approved'
  for update;
  if not found then
    raise exception 'Somente uma proposta aprovada pode ser agendada.' using errcode = 'P0002';
  end if;
  select * into request_row
  from public.quote_requests
  where id = quote_row.quote_request_id and tenant_id = target_tenant_id and status = 'approved'
  for update;
  if not found then
    raise exception 'A solicitação vinculada não está disponível para agendamento.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.appointments where tenant_id = target_tenant_id and quote_id = quote_row.id) then
    raise exception 'Esta proposta já possui agendamento.' using errcode = '23505';
  end if;

  if assigned_to_user_id_input is not null then
    select exists(
      select 1 from public.tenant_members
      where tenant_id = target_tenant_id and user_id = assigned_to_user_id_input and active
    ) into assigned_member_exists;
    if not assigned_member_exists then
      raise exception 'O profissional selecionado não pertence a esta oficina ou está inativo.' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(target_tenant_id);
  select coalesce(max(number), 0) + 1 into work_order_number_result
  from public.work_orders where tenant_id = target_tenant_id;
  insert into public.work_orders(
    tenant_id, number, quote_id, customer_id, vehicle_id, assigned_to_user_id,
    estimated_total, estimated_cost_total, notes
  ) values (
    target_tenant_id, work_order_number_result, quote_row.id, quote_row.customer_id, quote_row.vehicle_id,
    assigned_to_user_id_input, quote_row.total, quote_row.estimated_cost_total, nullif(trim(coalesce(notes_input, '')), '')
  ) returning id into work_order_id_result;

  insert into public.work_order_items(
    tenant_id, work_order_id, product_id, service_id, description, item_type, quantity, unit_price, expected_unit_cost
  )
  select tenant_id, work_order_id_result, product_id, service_id, description,
    case when item_type = 'kit' then 'custom' else item_type end, quantity, unit_price, unit_cost
  from public.quote_items
  where tenant_id = target_tenant_id and quote_id = quote_row.id
  order by sort_order, id;
  insert into public.work_order_checklists(tenant_id, work_order_id, label, sort_order)
  values
    (target_tenant_id, work_order_id_result, 'Inspeção inicial', 0),
    (target_tenant_id, work_order_id_result, 'Desmontagem', 1),
    (target_tenant_id, work_order_id_result, 'Instalação', 2),
    (target_tenant_id, work_order_id_result, 'Ajuste', 3),
    (target_tenant_id, work_order_id_result, 'Teste', 4),
    (target_tenant_id, work_order_id_result, 'Finalização', 5);

  update public.inventory_reservations
  set work_order_id = work_order_id_result
  where tenant_id = target_tenant_id and quote_id = quote_row.id and status = 'active';
  insert into public.appointments(
    tenant_id, quote_id, customer_id, vehicle_id, work_order_id, assigned_to_user_id,
    bay, scheduled_start, scheduled_end, notes
  ) values (
    target_tenant_id, quote_row.id, quote_row.customer_id, quote_row.vehicle_id, work_order_id_result,
    assigned_to_user_id_input, nullif(trim(coalesce(bay_input, '')), ''), scheduled_start_input, scheduled_end_input,
    nullif(trim(coalesce(notes_input, '')), '')
  ) returning id into appointment_id_result;
  update public.work_orders
  set appointment_id = appointment_id_result, updated_at = now()
  where id = work_order_id_result and tenant_id = target_tenant_id;

  insert into public.quote_events(tenant_id, quote_id, type, metadata)
  values(target_tenant_id, quote_row.id, 'scheduled', jsonb_build_object('appointmentId', appointment_id_result, 'workOrderId', work_order_id_result));
  insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata)
  values(target_tenant_id, request_row.id, 'status_changed', auth.uid(), jsonb_build_object('from', 'approved', 'to', 'approved', 'appointmentId', appointment_id_result, 'workOrderId', work_order_id_result));
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after, metadata)
  values(target_tenant_id, auth.uid(), 'appointment.created_from_quote', 'appointment', appointment_id_result,
    jsonb_build_object('quoteId', quote_row.id, 'workOrderId', work_order_id_result, 'workOrderNumber', work_order_number_result,
      'assignedToUserId', assigned_to_user_id_input, 'bay', nullif(trim(coalesce(bay_input, '')), ''),
      'scheduledStart', scheduled_start_input, 'scheduledEnd', scheduled_end_input),
    jsonb_build_object('quoteId', quote_row.id, 'stockConsumed', false, 'financialEntryCreated', false));

  return jsonb_build_object('appointmentId', appointment_id_result, 'workOrderId', work_order_id_result, 'workOrderNumber', work_order_number_result);
end;
$$;

revoke all on function private.can_appointments_manage(bigint) from public, anon, authenticated;
revoke all on function public.workspace_schedule_approved_quote(bigint, bigint, timestamptz, timestamptz, uuid, text, text) from public, anon;
grant execute on function public.workspace_schedule_approved_quote(bigint, bigint, timestamptz, timestamptz, uuid, text, text) to authenticated;
