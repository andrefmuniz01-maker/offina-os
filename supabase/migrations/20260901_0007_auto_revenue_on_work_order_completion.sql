-- private.secure_update_work_order_status nunca criava uma receita ao concluir a OS
-- (o metadata do audit log inclusive registrava 'financialEntryCreated', false
-- explicitamente). Isso significa que, fora da oficina demo (que tem receitas
-- fabricadas via seed), nenhuma OS concluída gerava lançamento financeiro: o
-- Financeiro dependia de alguém cadastrar a receita manualmente, o que nunca
-- acontece no fluxo real. Agora, ao concluir a OS (status -> 'completed'), uma
-- receita "prevista" é criada automaticamente no valor orçado da OS; o
-- recebimento efetivo continua sendo confirmado manualmente em Financeiro >
-- Receitas (workspace_mark_revenue_received), pois é ali que o valor realmente
-- entrou no caixa.
create or replace function private.secure_update_work_order_status(target_tenant_id bigint, target_work_order_id bigint, next_status_input text, notes_input text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare wo public.work_orders%rowtype; next_status public.operation_status; r record; v_revenue_created boolean := false; v_rows integer;
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
  if next_status='completed' and wo.status<>'completed' then
    insert into public.revenues(tenant_id, work_order_id, customer_id, vehicle_id, amount, status, due_at, notes)
    values(target_tenant_id, wo.id, wo.customer_id, wo.vehicle_id, wo.estimated_total, 'expected', now() + interval '7 days', 'Receita gerada automaticamente ao concluir a OS #' || wo.number || '.')
    on conflict (tenant_id, work_order_id) do nothing;
    get diagnostics v_rows = row_count;
    v_revenue_created := v_rows > 0;
  end if;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,before,after,metadata) values(target_tenant_id,auth.uid(),'work_order.status_updated','work_order',wo.id,jsonb_build_object('status',wo.status),jsonb_build_object('status',next_status),jsonb_build_object('financialEntryCreated',v_revenue_created));
  return jsonb_build_object('success',true,'status',next_status);
end;
$$;
