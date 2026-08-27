-- Consultas operacionais sem dados financeiros. Técnicos só leem agenda e OS
-- atribuídas; atendentes, admins e owners leem o escopo da própria oficina.
create or replace function private.can_work_orders_manage(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private as $$
  select private.can_appointments_manage(target_tenant_id)
$$;

drop policy if exists appointments_read on public.appointments;
create policy appointments_role_read on public.appointments for select to authenticated using (
  private.can_appointments_manage(tenant_id)
  or exists (
    select 1 from public.work_orders wo
    where wo.id = appointments.work_order_id
      and wo.tenant_id = appointments.tenant_id
      and wo.assigned_to_user_id = (select auth.uid())
  )
);
drop policy if exists work_orders_read on public.work_orders;
create policy work_orders_role_read on public.work_orders for select to authenticated using (
  private.can_work_orders_manage(tenant_id) or assigned_to_user_id = (select auth.uid())
);
drop policy if exists work_order_items_read on public.work_order_items;
create policy work_order_items_role_read on public.work_order_items for select to authenticated using (
  private.can_work_orders_manage(tenant_id)
  or exists (select 1 from public.work_orders wo where wo.id = work_order_items.work_order_id and wo.tenant_id = work_order_items.tenant_id and wo.assigned_to_user_id = (select auth.uid()))
);
drop policy if exists work_order_checklists_read on public.work_order_checklists;
create policy work_order_checklists_role_read on public.work_order_checklists for select to authenticated using (
  private.can_work_orders_manage(tenant_id)
  or exists (select 1 from public.work_orders wo where wo.id = work_order_checklists.work_order_id and wo.tenant_id = work_order_checklists.tenant_id and wo.assigned_to_user_id = (select auth.uid()))
);
drop policy if exists work_order_notes_read on public.work_order_notes;
create policy work_order_notes_role_read on public.work_order_notes for select to authenticated using (
  private.can_work_orders_manage(tenant_id)
  or exists (select 1 from public.work_orders wo where wo.id = work_order_notes.work_order_id and wo.tenant_id = work_order_notes.tenant_id and wo.assigned_to_user_id = (select auth.uid()))
);

create or replace function public.workspace_list_appointments(
  target_tenant_id bigint, from_at timestamptz, to_at timestamptz, search_input text default null
) returns jsonb language plpgsql security invoker set search_path = public, private, pg_temp as $$
declare result jsonb;
begin
  if not private.is_active_member(target_tenant_id) then raise exception 'Oficina não encontrada ou inativa.' using errcode = 'P0002'; end if;
  if not private.can_appointments_manage(target_tenant_id) and not exists (select 1 from public.tenant_members where tenant_id = target_tenant_id and user_id = auth.uid() and active and role = 'technician') then
    raise exception 'Seu perfil não possui acesso à operação desta oficina.' using errcode = '42501';
  end if;
  if to_at < from_at then raise exception 'Período de agenda inválido.' using errcode = '22023'; end if;
  if search_input is not null and length(trim(search_input)) > 120 then raise exception 'Busca inválida.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'appointment', jsonb_build_object('id', a.id, 'status', a.status, 'scheduledStart', a.scheduled_start, 'scheduledEnd', a.scheduled_end, 'bay', a.bay, 'assignedToUserId', a.assigned_to_user_id, 'workOrderId', a.work_order_id),
    'customer', jsonb_build_object('name', c.name),
    'vehicle', jsonb_build_object('make', v.make, 'model', v.model, 'plate', v.plate),
    'workOrder', case when wo.id is null then null else jsonb_build_object('id', wo.id, 'number', wo.number, 'status', wo.status) end
  ) order by a.scheduled_start), '[]'::jsonb) into result
  from public.appointments a
  join public.customers c on c.id = a.customer_id and c.tenant_id = a.tenant_id
  join public.vehicles v on v.id = a.vehicle_id and v.tenant_id = a.tenant_id
  left join public.work_orders wo on wo.id = a.work_order_id and wo.tenant_id = a.tenant_id
  where a.tenant_id = target_tenant_id
    and a.scheduled_start >= from_at
    and a.scheduled_start <= to_at
    and (search_input is null or c.name ilike '%' || trim(search_input) || '%' or coalesce(v.plate, '') ilike '%' || trim(search_input) || '%' or v.make ilike '%' || trim(search_input) || '%' or v.model ilike '%' || trim(search_input) || '%');
  return result;
end;
$$;

create or replace function public.workspace_list_work_order_kanban(target_tenant_id bigint, search_input text default null)
returns jsonb language plpgsql security invoker set search_path = public, private, pg_temp as $$
declare result jsonb;
begin
  if not private.is_active_member(target_tenant_id) then raise exception 'Oficina não encontrada ou inativa.' using errcode = 'P0002'; end if;
  if not private.can_work_orders_manage(target_tenant_id) and not exists (select 1 from public.tenant_members where tenant_id = target_tenant_id and user_id = auth.uid() and active and role = 'technician') then
    raise exception 'Seu perfil não possui acesso à operação desta oficina.' using errcode = '42501';
  end if;
  if search_input is not null and length(trim(search_input)) > 120 then raise exception 'Busca inválida.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'workOrder', jsonb_build_object('id', wo.id, 'number', wo.number, 'status', wo.status, 'appointmentId', wo.appointment_id, 'assignedToUserId', wo.assigned_to_user_id),
    'customer', jsonb_build_object('name', c.name),
    'vehicle', jsonb_build_object('make', v.make, 'model', v.model, 'plate', v.plate),
    'appointment', case when a.id is null then null else jsonb_build_object('id', a.id, 'scheduledStart', a.scheduled_start, 'scheduledEnd', a.scheduled_end, 'bay', a.bay, 'status', a.status) end
  ) order by coalesce(a.scheduled_start, wo.created_at) desc), '[]'::jsonb) into result
  from public.work_orders wo
  join public.customers c on c.id = wo.customer_id and c.tenant_id = wo.tenant_id
  join public.vehicles v on v.id = wo.vehicle_id and v.tenant_id = wo.tenant_id
  left join public.appointments a on a.id = wo.appointment_id and a.tenant_id = wo.tenant_id
  where wo.tenant_id = target_tenant_id and wo.status in ('scheduled', 'received', 'diagnosis', 'awaiting_approval', 'awaiting_part', 'in_service', 'completed')
    and (search_input is null or c.name ilike '%' || trim(search_input) || '%' or coalesce(v.plate, '') ilike '%' || trim(search_input) || '%' or v.make ilike '%' || trim(search_input) || '%' or v.model ilike '%' || trim(search_input) || '%');
  return result;
end;
$$;

revoke all on function private.can_work_orders_manage(bigint) from public, anon, authenticated;
revoke all on function public.workspace_list_appointments(bigint, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.workspace_list_appointments(bigint, timestamptz, timestamptz, text) to authenticated;
revoke all on function public.workspace_list_work_order_kanban(bigint, text) from public, anon;
grant execute on function public.workspace_list_work_order_kanban(bigint, text) to authenticated;
