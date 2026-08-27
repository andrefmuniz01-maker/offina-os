-- Leitura e mutações da OS para o mesmo detalhe operacional do produto.
-- A camada SQL aplica tenant_id, status e permissão; o router apenas adapta o contrato.

create or replace function private.can_work_order_operate(target_tenant_id bigint)
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
                and tm.role in ('owner', 'admin', 'attendant', 'technician')
            )
          )
        )
    );
$$;

create or replace function public.workspace_work_order_detail(target_tenant_id bigint, target_work_order_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  payload jsonb;
begin
  if not private.can_work_order_operate(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso à operação desta oficina.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'order', jsonb_build_object(
      'id', wo.id, 'tenantId', wo.tenant_id, 'number', wo.number, 'quoteId', wo.quote_id,
      'appointmentId', wo.appointment_id, 'customerId', wo.customer_id, 'vehicleId', wo.vehicle_id,
      'status', wo.status, 'assignedToUserId', wo.assigned_to_user_id,
      'estimatedTotal', wo.estimated_total, 'notes', wo.notes,
      'completedAt', wo.completed_at, 'deliveredAt', wo.delivered_at, 'createdAt', wo.created_at
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', woi.id, 'workOrderId', woi.work_order_id, 'productId', woi.product_id,
        'serviceId', woi.service_id, 'description', woi.description, 'itemType', woi.item_type,
        'quantity', woi.quantity, 'unitPrice', woi.unit_price
      ) order by woi.id)
      from public.work_order_items woi
      where woi.tenant_id = target_tenant_id and woi.work_order_id = wo.id
    ), '[]'::jsonb),
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', wc.id, 'label', wc.label, 'completed', wc.completed,
        'completedAt', wc.completed_at, 'sortOrder', wc.sort_order
      ) order by wc.sort_order, wc.id)
      from public.work_order_checklists wc
      where wc.tenant_id = target_tenant_id and wc.work_order_id = wo.id
    ), '[]'::jsonb),
    'consumption', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', woc.id, 'workOrderId', woc.work_order_id, 'productId', woc.product_id,
        'reservationId', woc.reservation_id, 'quantity', woc.quantity, 'createdAt', woc.created_at
      ) order by woc.created_at desc, woc.id desc)
      from public.work_order_consumption woc
      where woc.tenant_id = target_tenant_id and woc.work_order_id = wo.id
    ), '[]'::jsonb),
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ir.id, 'productId', ir.product_id, 'quoteId', ir.quote_id,
        'workOrderId', ir.work_order_id, 'quantity', ir.quantity, 'status', ir.status
      ) order by ir.id)
      from public.inventory_reservations ir
      where ir.tenant_id = target_tenant_id and ir.work_order_id = wo.id and ir.status = 'active'
    ), '[]'::jsonb),
    'executionAttachments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'filename', a.filename, 'mimeType', a.mime_type,
        'sizeBytes', a.size_bytes, 'url', a.url, 'createdAt', a.created_at
      ) order by a.created_at desc, a.id desc)
      from public.attachments a
      where a.tenant_id = target_tenant_id and a.work_order_id = wo.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'createdAt', n.created_at
      ) order by n.created_at desc, n.id desc)
      from public.work_order_notes n
      where n.tenant_id = target_tenant_id and n.work_order_id = wo.id
    ), '[]'::jsonb)
  ) into payload
  from public.work_orders wo
  where wo.id = target_work_order_id and wo.tenant_id = target_tenant_id
  limit 1;

  if payload is null then
    raise exception 'Ordem de serviço não encontrada nesta oficina.' using errcode = 'P0002';
  end if;
  return payload;
end;
$$;

create or replace function public.workspace_update_work_order_status(
  target_tenant_id bigint,
  target_work_order_id bigint,
  next_status text,
  notes_input text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  order_row public.work_orders%rowtype;
  next_operation_status public.operation_status;
  updated_count integer;
  active_reservation record;
begin
  if not private.can_work_order_operate(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para atualizar a OS.' using errcode = '42501';
  end if;
  begin
    next_operation_status := next_status::public.operation_status;
  exception when invalid_text_representation then
    raise exception 'Status de OS inválido.' using errcode = '22023';
  end;

  select * into order_row
  from public.work_orders wo
  where wo.id = target_work_order_id and wo.tenant_id = target_tenant_id
  for update;
  if not found then raise exception 'Ordem de serviço não encontrada nesta oficina.' using errcode = 'P0002'; end if;

  if order_row.status = next_operation_status then
    return jsonb_build_object('success', true, 'status', next_operation_status, 'idempotent', true);
  end if;
  if not (
    (order_row.status = 'scheduled' and next_operation_status in ('received', 'cancelled')) or
    (order_row.status = 'received' and next_operation_status in ('diagnosis', 'cancelled')) or
    (order_row.status = 'diagnosis' and next_operation_status in ('awaiting_approval', 'awaiting_part', 'in_service', 'cancelled')) or
    (order_row.status = 'awaiting_approval' and next_operation_status in ('awaiting_part', 'in_service', 'cancelled')) or
    (order_row.status = 'awaiting_part' and next_operation_status in ('in_service', 'cancelled')) or
    (order_row.status = 'in_service' and next_operation_status in ('awaiting_part', 'completed')) or
    (order_row.status = 'completed' and next_operation_status = 'delivered')
  ) then
    raise exception 'Não é permitido mudar a OS de %.' , order_row.status || ' -> ' || next_operation_status using errcode = '22023';
  end if;

  if next_operation_status = 'completed' and exists (
    select 1 from public.work_order_checklists wc
    where wc.tenant_id = target_tenant_id and wc.work_order_id = target_work_order_id and not wc.completed
  ) then
    raise exception 'Conclua o checklist antes de finalizar a OS.' using errcode = '22023';
  end if;

  update public.work_orders
  set status = next_operation_status,
      notes = coalesce(notes_input, notes),
      completed_at = case when next_operation_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
      delivered_at = case when next_operation_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
      updated_at = now()
  where id = target_work_order_id and tenant_id = target_tenant_id and status = order_row.status;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Esta ordem de serviço foi alterada em outra sessão.' using errcode = '40001';
  end if;

  if order_row.appointment_id is not null then
    update public.appointments set status = next_operation_status, updated_at = now()
    where id = order_row.appointment_id and tenant_id = target_tenant_id;
  end if;

  if next_operation_status = 'completed' and not exists (
    select 1 from public.revenues r where r.tenant_id = target_tenant_id and r.work_order_id = target_work_order_id
  ) then
    insert into public.revenues(tenant_id, work_order_id, customer_id, vehicle_id, amount, status, due_at, notes)
    values(target_tenant_id, target_work_order_id, order_row.customer_id, order_row.vehicle_id, order_row.estimated_total, 'expected', now(), 'Receita prevista pela OS demonstrativa.');
  end if;

  if next_operation_status in ('delivered', 'cancelled') then
    for active_reservation in
      select ir.id, ir.product_id, ir.quantity
      from public.inventory_reservations ir
      where ir.tenant_id = target_tenant_id and ir.work_order_id = target_work_order_id and ir.status = 'active'
      for update
    loop
      update public.inventory_reservations
      set status = 'released', released_at = now()
      where id = active_reservation.id and tenant_id = target_tenant_id and status = 'active';
      update public.inventory_balances
      set reserved_quantity = greatest(reserved_quantity - active_reservation.quantity, 0)
      where tenant_id = target_tenant_id and product_id = active_reservation.product_id;
      insert into public.inventory_movements(tenant_id, product_id, type, quantity, physical_delta, reserved_delta, reference_type, reference_id, notes, created_by_user_id)
      values(target_tenant_id, active_reservation.product_id, 'reservation_release', active_reservation.quantity, 0, -active_reservation.quantity, 'work_order', target_work_order_id, 'Reserva liberada no encerramento da OS.', auth.uid());
    end loop;
  end if;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after)
  values(target_tenant_id, auth.uid(), 'work_order.status_updated', 'work_order', target_work_order_id,
    jsonb_build_object('status', order_row.status), jsonb_build_object('status', next_operation_status));

  return jsonb_build_object('success', true, 'status', next_operation_status, 'idempotent', false);
end;
$$;

create or replace function public.workspace_toggle_work_order_checklist(
  target_tenant_id bigint,
  target_checklist_id bigint,
  completed_input boolean
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  checklist_row public.work_order_checklists%rowtype;
  updated_count integer;
begin
  if not private.can_work_order_operate(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para atualizar o checklist.' using errcode = '42501';
  end if;
  select * into checklist_row
  from public.work_order_checklists wc
  where wc.id = target_checklist_id and wc.tenant_id = target_tenant_id
  for update;
  if not found then raise exception 'Checklist indisponível para esta oficina.' using errcode = 'P0002'; end if;

  update public.work_order_checklists
  set completed = completed_input,
      completed_by_user_id = case when completed_input then auth.uid() else null end,
      completed_at = case when completed_input then now() else null end
  where id = target_checklist_id and tenant_id = target_tenant_id;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'O checklist foi alterado em outra sessão.' using errcode = '40001'; end if;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after)
  values(target_tenant_id, auth.uid(), 'work_order.checklist_updated', 'work_order_checklist', target_checklist_id,
    jsonb_build_object('completed', checklist_row.completed), jsonb_build_object('completed', completed_input, 'workOrderId', checklist_row.work_order_id));
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.workspace_consume_work_order_product(
  target_tenant_id bigint,
  target_work_order_id bigint,
  target_product_id bigint,
  target_quantity numeric,
  target_reservation_id bigint default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  order_row public.work_orders%rowtype;
  product_row public.products%rowtype;
  balance_row public.inventory_balances%rowtype;
  reservation_row public.inventory_reservations%rowtype;
  aggregate_cost numeric;
  reserved_delta numeric := 0;
  remaining numeric;
  updated_count integer;
begin
  if not private.can_work_order_operate(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para registrar consumo.' using errcode = '42501';
  end if;
  if target_quantity is null or target_quantity <= 0 then raise exception 'A quantidade de consumo é inválida.' using errcode = '22023'; end if;

  select * into order_row from public.work_orders where id = target_work_order_id and tenant_id = target_tenant_id for update;
  if not found then raise exception 'Ordem de serviço não encontrada nesta oficina.' using errcode = 'P0002'; end if;
  select * into product_row from public.products where id = target_product_id and tenant_id = target_tenant_id limit 1;
  select * into balance_row from public.inventory_balances where product_id = target_product_id and tenant_id = target_tenant_id for update;
  if not found or product_row.id is null or balance_row.physical_quantity < target_quantity then
    raise exception 'Estoque físico insuficiente para registrar este consumo.' using errcode = '22023';
  end if;

  if target_reservation_id is not null then
    select * into reservation_row
    from public.inventory_reservations ir
    where ir.id = target_reservation_id and ir.tenant_id = target_tenant_id
      and ir.work_order_id = target_work_order_id and ir.product_id = target_product_id and ir.status = 'active'
    for update;
    if not found or reservation_row.quantity < target_quantity then
      raise exception 'A reserva indicada não cobre este consumo.' using errcode = '22023';
    end if;
    reserved_delta := target_quantity;
    remaining := reservation_row.quantity - target_quantity;
    update public.inventory_reservations
    set quantity = remaining,
        status = case when remaining = 0 then 'consumed'::public.reservation_status else 'active'::public.reservation_status end,
        released_at = case when remaining = 0 then now() else null end
    where id = target_reservation_id and tenant_id = target_tenant_id and status = 'active' and quantity >= target_quantity;
    get diagnostics updated_count = row_count;
    if updated_count <> 1 then raise exception 'A reserva foi alterada antes deste consumo.' using errcode = '40001'; end if;
  end if;

  update public.inventory_balances
  set physical_quantity = physical_quantity - target_quantity,
      reserved_quantity = greatest(reserved_quantity - reserved_delta, 0)
  where id = balance_row.id and tenant_id = target_tenant_id
    and physical_quantity >= target_quantity
    and reserved_quantity >= reserved_delta;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'O saldo foi alterado antes deste consumo.' using errcode = '40001'; end if;

  insert into public.work_order_consumption(tenant_id, work_order_id, product_id, reservation_id, quantity, unit_cost, consumed_by_user_id)
  values(target_tenant_id, target_work_order_id, target_product_id, target_reservation_id, target_quantity, product_row.current_cost, auth.uid());
  insert into public.inventory_movements(tenant_id, product_id, type, quantity, physical_delta, reserved_delta, reference_type, reference_id, notes, created_by_user_id)
  values(target_tenant_id, target_product_id, 'consumption', target_quantity, -target_quantity, -reserved_delta, 'work_order', target_work_order_id, 'Consumo registrado na execução da OS.', auth.uid());

  select coalesce(sum(woc.quantity * woc.unit_cost), 0) into aggregate_cost
  from public.work_order_consumption woc
  where woc.tenant_id = target_tenant_id and woc.work_order_id = target_work_order_id;
  update public.work_orders
  set real_cost_total = aggregate_cost,
      real_margin_percent = case when estimated_total > 0 then ((estimated_total - aggregate_cost) / estimated_total) * 100 else 0 end,
      updated_at = now()
  where id = target_work_order_id and tenant_id = target_tenant_id;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after, metadata)
  values(target_tenant_id, auth.uid(), 'work_order.product_consumed', 'work_order', target_work_order_id,
    jsonb_build_object('physicalQuantity', balance_row.physical_quantity, 'reservedQuantity', balance_row.reserved_quantity),
    jsonb_build_object('physicalQuantity', balance_row.physical_quantity - target_quantity, 'reservedQuantity', balance_row.reserved_quantity - reserved_delta),
    jsonb_build_object('productId', target_product_id, 'quantity', target_quantity, 'reservationId', target_reservation_id));
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.workspace_add_work_order_note(
  target_tenant_id bigint,
  target_work_order_id bigint,
  body_input text
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  note_id bigint;
begin
  if not private.can_work_order_operate(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para adicionar apontamentos.' using errcode = '42501';
  end if;
  if length(trim(body_input)) < 1 or length(trim(body_input)) > 4000 then raise exception 'O apontamento é inválido.' using errcode = '22023'; end if;
  if not exists (select 1 from public.work_orders wo where wo.id = target_work_order_id and wo.tenant_id = target_tenant_id) then
    raise exception 'Ordem de serviço não encontrada nesta oficina.' using errcode = 'P0002';
  end if;
  insert into public.work_order_notes(tenant_id, work_order_id, author_user_id, body)
  values(target_tenant_id, target_work_order_id, auth.uid(), trim(body_input))
  returning id into note_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values(target_tenant_id, auth.uid(), 'work_order.note_added', 'work_order_note', note_id, jsonb_build_object('workOrderId', target_work_order_id));
  return jsonb_build_object('id', note_id);
end;
$$;

revoke all on function private.can_work_order_operate(bigint) from public, anon, authenticated;
revoke all on function public.workspace_work_order_detail(bigint, bigint), public.workspace_update_work_order_status(bigint, bigint, text, text), public.workspace_toggle_work_order_checklist(bigint, bigint, boolean), public.workspace_consume_work_order_product(bigint, bigint, bigint, numeric, bigint), public.workspace_add_work_order_note(bigint, bigint, text) from public, anon;
grant execute on function public.workspace_work_order_detail(bigint, bigint), public.workspace_update_work_order_status(bigint, bigint, text, text), public.workspace_toggle_work_order_checklist(bigint, bigint, boolean), public.workspace_consume_work_order_product(bigint, bigint, bigint, numeric, bigint), public.workspace_add_work_order_note(bigint, bigint, text) to authenticated;
