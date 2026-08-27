-- Leitura tenant-scoped de agenda e pátio para o mesmo fluxo operacional.

create or replace function public.workspace_list_appointments(
  target_tenant_id bigint,
  from_at timestamptz,
  to_at timestamptz,
  search_input text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  payload jsonb;
  normalized_search text := nullif(trim(search_input), '');
begin
  if not private.is_active_member(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso a esta oficina.' using errcode = '42501';
  end if;
  if to_at < from_at then
    raise exception 'O período da agenda é inválido.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(item order by scheduled_start), '[]'::jsonb) into payload
  from (
    select jsonb_build_object(
      'appointment', jsonb_build_object(
        'id', a.id,
        'tenantId', a.tenant_id,
        'quoteId', a.quote_id,
        'customerId', a.customer_id,
        'vehicleId', a.vehicle_id,
        'assignedToUserId', a.assigned_to_user_id,
        'bay', a.bay,
        'scheduledStart', a.scheduled_start,
        'scheduledEnd', a.scheduled_end,
        'status', a.status,
        'notes', a.notes
      ),
      'customer', jsonb_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp),
      'vehicle', jsonb_build_object('id', v.id, 'make', v.make, 'model', v.model, 'modelYear', v.model_year, 'plate', v.plate, 'mileage', v.mileage),
      'workOrder', case when wo.id is null then null else jsonb_build_object('id', wo.id, 'number', wo.number, 'status', wo.status) end
    ) as item,
    a.scheduled_start
    from public.appointments a
    join public.customers c on c.id = a.customer_id and c.tenant_id = a.tenant_id
    join public.vehicles v on v.id = a.vehicle_id and v.tenant_id = a.tenant_id
    left join public.work_orders wo on wo.id = a.work_order_id and wo.tenant_id = a.tenant_id
    where a.tenant_id = target_tenant_id
      and a.scheduled_start >= from_at
      and a.scheduled_start <= to_at
      and (
        normalized_search is null
        or c.name ilike '%' || normalized_search || '%'
        or c.whatsapp ilike '%' || normalized_search || '%'
        or coalesce(v.plate, '') ilike '%' || normalized_search || '%'
        or (v.make || ' ' || v.model) ilike '%' || normalized_search || '%'
      )
  ) listed;
  return payload;
end;
$$;

create or replace function public.workspace_work_orders_kanban(
  target_tenant_id bigint,
  search_input text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  payload jsonb;
  normalized_search text := nullif(trim(search_input), '');
begin
  if not private.is_active_member(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso a esta oficina.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'workOrder', jsonb_build_object(
      'id', wo.id,
      'tenantId', wo.tenant_id,
      'number', wo.number,
      'quoteId', wo.quote_id,
      'appointmentId', wo.appointment_id,
      'customerId', wo.customer_id,
      'vehicleId', wo.vehicle_id,
      'status', wo.status,
      'assignedToUserId', wo.assigned_to_user_id,
      'estimatedTotal', wo.estimated_total,
      'estimatedCostTotal', wo.estimated_cost_total,
      'realCostTotal', wo.real_cost_total,
      'realMarginPercent', wo.real_margin_percent,
      'notes', wo.notes,
      'completedAt', wo.completed_at,
      'deliveredAt', wo.delivered_at,
      'createdAt', wo.created_at
    ),
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp),
    'vehicle', jsonb_build_object('id', v.id, 'make', v.make, 'model', v.model, 'modelYear', v.model_year, 'plate', v.plate, 'mileage', v.mileage)
  ) order by wo.created_at desc), '[]'::jsonb) into payload
  from public.work_orders wo
  join public.customers c on c.id = wo.customer_id and c.tenant_id = wo.tenant_id
  join public.vehicles v on v.id = wo.vehicle_id and v.tenant_id = wo.tenant_id
  where wo.tenant_id = target_tenant_id
    and (
      normalized_search is null
      or c.name ilike '%' || normalized_search || '%'
      or c.whatsapp ilike '%' || normalized_search || '%'
      or coalesce(v.plate, '') ilike '%' || normalized_search || '%'
      or (v.make || ' ' || v.model) ilike '%' || normalized_search || '%'
    );
  return payload;
end;
$$;

revoke all on function public.workspace_list_appointments(bigint, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.workspace_work_orders_kanban(bigint, text) from public, anon;
grant execute on function public.workspace_list_appointments(bigint, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.workspace_work_orders_kanban(bigint, text) to authenticated;
