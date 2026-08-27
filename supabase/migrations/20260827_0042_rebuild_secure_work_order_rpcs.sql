create or replace function private.can_execute_work_order(target_tenant_id bigint, target_work_order_id bigint)
returns boolean language sql security definer set search_path = public, private as $$
  select private.can_work_orders_manage(target_tenant_id) or exists (
    select 1 from public.work_orders wo join public.tenant_members tm on tm.tenant_id = wo.tenant_id and tm.user_id = auth.uid() and tm.active and tm.role = 'technician'
    where wo.id = target_work_order_id and wo.tenant_id = target_tenant_id and wo.assigned_to_user_id = auth.uid()
  )
$$;

create or replace function private.secure_work_order_detail(target_tenant_id bigint, target_work_order_id bigint)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare wo public.work_orders%rowtype;
begin
  select * into wo from public.work_orders where id = target_work_order_id and tenant_id = target_tenant_id;
  if not found or not private.is_active_member(target_tenant_id) or not private.can_execute_work_order(target_tenant_id, target_work_order_id) then raise exception 'Ordem de serviço indisponível para o seu perfil.' using errcode='42501'; end if;
  return jsonb_build_object(
    'order', jsonb_build_object('id',wo.id,'number',wo.number,'status',wo.status,'notes',wo.notes,'assignedToUserId',wo.assigned_to_user_id),
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'description',i.description,'itemType',i.item_type,'quantity',i.quantity) order by i.id) from public.work_order_items i where i.tenant_id=target_tenant_id and i.work_order_id=wo.id),'[]'::jsonb),
    'checklist',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'completed',c.completed) order by c.sort_order,c.id) from public.work_order_checklists c where c.tenant_id=target_tenant_id and c.work_order_id=wo.id),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'description',p.name,'quantity',r.quantity) order by r.id) from public.inventory_reservations r join public.products p on p.id=r.product_id and p.tenant_id=r.tenant_id where r.tenant_id=target_tenant_id and r.work_order_id=wo.id and r.status='active'),'[]'::jsonb)
  );
end;
$$;

create or replace function private.secure_toggle_work_order_checklist(target_tenant_id bigint, target_checklist_id bigint, completed_input boolean)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare item public.work_order_checklists%rowtype;
begin
  select * into item from public.work_order_checklists where id=target_checklist_id and tenant_id=target_tenant_id for update;
  if not found or not private.can_execute_work_order(target_tenant_id,item.work_order_id) then raise exception 'Checklist indisponível para o seu perfil.' using errcode='42501'; end if;
  update public.work_order_checklists set completed=completed_input, completed_by_user_id=case when completed_input then auth.uid() else null end, completed_at=case when completed_input then now() else null end where id=item.id and tenant_id=target_tenant_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,before,after) values(target_tenant_id,auth.uid(),'work_order.checklist_updated','work_order_checklist',item.id,jsonb_build_object('completed',item.completed),jsonb_build_object('completed',completed_input,'workOrderId',item.work_order_id));
  return jsonb_build_object('success',true);
end;
$$;

create or replace function private.secure_update_work_order_status(target_tenant_id bigint, target_work_order_id bigint, next_status_input text, notes_input text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare wo public.work_orders%rowtype; next_status public.operation_status; r record;
begin
  begin next_status:=next_status_input::public.operation_status; exception when invalid_text_representation then raise exception 'Status de OS inválido.' using errcode='22023'; end;
  select * into wo from public.work_orders where id=target_work_order_id and tenant_id=target_tenant_id for update;
  if not found or not private.can_execute_work_order(target_tenant_id,target_work_order_id) then raise exception 'Ordem de serviço indisponível para o seu perfil.' using errcode='42501'; end if;
  if wo.status<>next_status and not ((wo.status='scheduled' and next_status in ('received','cancelled')) or (wo.status='received' and next_status in ('diagnosis','cancelled')) or (wo.status='diagnosis' and next_status in ('awaiting_approval','awaiting_part','in_service','cancelled')) or (wo.status='awaiting_approval' and next_status in ('awaiting_part','in_service','cancelled')) or (wo.status='awaiting_part' and next_status in ('in_service','cancelled')) or (wo.status='in_service' and next_status in ('awaiting_part','completed')) or (wo.status='completed' and next_status='delivered')) then raise exception 'Transição de status não permitida.' using errcode='22023'; end if;
  if next_status='completed' and exists(select 1 from public.work_order_checklists where tenant_id=target_tenant_id and work_order_id=wo.id and not completed) then raise exception 'Conclua o checklist antes de finalizar a OS.' using errcode='22023'; end if;
  update public.work_orders set status=next_status, notes=coalesce(notes_input,notes), completed_at=case when next_status='completed' then coalesce(completed_at,now()) else completed_at end, delivered_at=case when next_status='delivered' then coalesce(delivered_at,now()) else delivered_at end, updated_at=now() where id=wo.id and tenant_id=target_tenant_id;
  update public.appointments set status=next_status,updated_at=now() where id=wo.appointment_id and tenant_id=target_tenant_id;
  if next_status in ('delivered','cancelled') and wo.status<>next_status then for r in select * from public.inventory_reservations where tenant_id=target_tenant_id and work_order_id=wo.id and status='active' for update loop
    update public.inventory_balances set reserved_quantity=reserved_quantity-r.quantity,updated_at=now() where tenant_id=target_tenant_id and product_id=r.product_id and reserved_quantity>=r.quantity; if not found then raise exception 'Saldo reservado incompatível.' using errcode='P0001'; end if;
    update public.inventory_reservations set status='released',released_at=now() where id=r.id and tenant_id=target_tenant_id;
    insert into public.inventory_movements(tenant_id,product_id,type,quantity,physical_delta,reserved_delta,reference_type,reference_id,created_by_user_id,notes) values(target_tenant_id,r.product_id,'reservation_release',r.quantity,0,-r.quantity,'work_order',wo.id,auth.uid(),'Reserva liberada no encerramento da OS.');
  end loop; end if;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,before,after,metadata) values(target_tenant_id,auth.uid(),'work_order.status_updated','work_order',wo.id,jsonb_build_object('status',wo.status),jsonb_build_object('status',next_status),jsonb_build_object('financialEntryCreated',false));
  return jsonb_build_object('success',true,'status',next_status);
end;
$$;

create or replace function private.secure_consume_work_order_reservation(target_tenant_id bigint, target_work_order_id bigint, target_reservation_id bigint, quantity_input numeric)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare wo public.work_orders%rowtype; r public.inventory_reservations%rowtype; cost numeric; remaining numeric;
begin
  if quantity_input is null or quantity_input<=0 then raise exception 'Quantidade de consumo inválida.' using errcode='22023'; end if;
  select * into wo from public.work_orders where id=target_work_order_id and tenant_id=target_tenant_id for update;
  if not found or not private.can_execute_work_order(target_tenant_id,target_work_order_id) then raise exception 'Ordem de serviço indisponível para o seu perfil.' using errcode='42501'; end if;
  if wo.status not in ('received','diagnosis','awaiting_part','in_service') then raise exception 'A OS ainda não está em execução para registrar consumo.' using errcode='22023'; end if;
  select * into r from public.inventory_reservations where id=target_reservation_id and tenant_id=target_tenant_id and work_order_id=wo.id and status='active' for update;
  if not found or r.quantity<quantity_input then raise exception 'A reserva indicada não cobre este consumo.' using errcode='22023'; end if;
  select current_cost into cost from public.products where id=r.product_id and tenant_id=target_tenant_id;
  update public.inventory_balances set physical_quantity=physical_quantity-quantity_input,reserved_quantity=reserved_quantity-quantity_input,updated_at=now() where tenant_id=target_tenant_id and product_id=r.product_id and physical_quantity>=quantity_input and reserved_quantity>=quantity_input; if not found then raise exception 'O saldo de estoque foi alterado antes do consumo.' using errcode='P0001'; end if;
  remaining:=r.quantity-quantity_input; update public.inventory_reservations set quantity=remaining,status=case when remaining=0 then 'consumed'::public.reservation_status else 'active'::public.reservation_status end,released_at=case when remaining=0 then now() else null end where id=r.id and tenant_id=target_tenant_id;
  insert into public.work_order_consumption(tenant_id,work_order_id,product_id,reservation_id,quantity,unit_cost,consumed_by_user_id) values(target_tenant_id,wo.id,r.product_id,r.id,quantity_input,cost,auth.uid());
  insert into public.inventory_movements(tenant_id,product_id,type,quantity,physical_delta,reserved_delta,reference_type,reference_id,created_by_user_id) values(target_tenant_id,r.product_id,'consumption',quantity_input,-quantity_input,-quantity_input,'work_order',wo.id,auth.uid());
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after,metadata) values(target_tenant_id,auth.uid(),'work_order.product_consumed','work_order',wo.id,jsonb_build_object('reservationId',r.id,'quantity',quantity_input),jsonb_build_object('financialEntryCreated',false));
  return jsonb_build_object('success',true);
end;
$$;

create or replace function public.workspace_work_order_detail(target_tenant_id bigint,target_work_order_id bigint) returns jsonb language sql security invoker set search_path='' as $$ select private.secure_work_order_detail(target_tenant_id,target_work_order_id) $$;
create or replace function public.workspace_toggle_work_order_checklist(target_tenant_id bigint,target_checklist_id bigint,completed_input boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.secure_toggle_work_order_checklist(target_tenant_id,target_checklist_id,completed_input) $$;
create or replace function public.workspace_update_work_order_status(target_tenant_id bigint,target_work_order_id bigint,next_status text,notes_input text default null) returns jsonb language sql security invoker set search_path='' as $$ select private.secure_update_work_order_status(target_tenant_id,target_work_order_id,next_status,notes_input) $$;
create function public.workspace_consume_work_order_reservation(target_tenant_id bigint,target_work_order_id bigint,target_reservation_id bigint,quantity_input numeric) returns jsonb language sql security invoker set search_path='' as $$ select private.secure_consume_work_order_reservation(target_tenant_id,target_work_order_id,target_reservation_id,quantity_input) $$;
revoke all on function private.can_execute_work_order(bigint,bigint),private.secure_work_order_detail(bigint,bigint),private.secure_toggle_work_order_checklist(bigint,bigint,boolean),private.secure_update_work_order_status(bigint,bigint,text,text),private.secure_consume_work_order_reservation(bigint,bigint,bigint,numeric) from public,anon;
grant execute on function private.secure_work_order_detail(bigint,bigint),private.secure_toggle_work_order_checklist(bigint,bigint,boolean),private.secure_update_work_order_status(bigint,bigint,text,text),private.secure_consume_work_order_reservation(bigint,bigint,bigint,numeric) to authenticated;
grant execute on function public.workspace_work_order_detail(bigint,bigint),public.workspace_toggle_work_order_checklist(bigint,bigint,boolean),public.workspace_update_work_order_status(bigint,bigint,text,text),public.workspace_consume_work_order_reservation(bigint,bigint,bigint,numeric) to authenticated;
