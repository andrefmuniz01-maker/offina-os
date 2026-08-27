-- A migration remota 0045 substituiu a projeção mínima por campos internos de item/reserva
-- e a 0044 publicou apontamentos antes de existir uma superfície privada aprovada no runtime.
-- Esta reconciliação preserva as funções para compatibilidade de schema, mas bloqueia a escrita
-- de notas e restaura o contrato mínimo usado pela interface atual.

create or replace function private.secure_work_order_detail(target_tenant_id bigint, target_work_order_id bigint)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare wo public.work_orders%rowtype;
begin
  select * into wo from public.work_orders where id = target_work_order_id and tenant_id = target_tenant_id;
  if not found or not private.is_active_member(target_tenant_id) or not private.can_execute_work_order(target_tenant_id, target_work_order_id) then
    raise exception 'Ordem de serviço indisponível para o seu perfil.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'order', jsonb_build_object('id', wo.id, 'number', wo.number, 'status', wo.status, 'notes', wo.notes, 'assignedToUserId', wo.assigned_to_user_id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'description', i.description, 'itemType', i.item_type, 'quantity', i.quantity) order by i.id)
      from public.work_order_items i
      where i.tenant_id = target_tenant_id and i.work_order_id = wo.id
    ), '[]'::jsonb),
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'completed', c.completed) order by c.sort_order, c.id)
      from public.work_order_checklists c
      where c.tenant_id = target_tenant_id and c.work_order_id = wo.id
    ), '[]'::jsonb),
    'reservations', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'description', p.name, 'quantity', r.quantity) order by r.id)
      from public.inventory_reservations r
      join public.products p on p.id = r.product_id and p.tenant_id = r.tenant_id
      where r.tenant_id = target_tenant_id and r.work_order_id = wo.id and r.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.workspace_work_order_detail(target_tenant_id bigint, target_work_order_id bigint)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.secure_work_order_detail(target_tenant_id, target_work_order_id)
$$;

revoke all on function private.secure_work_order_detail(bigint, bigint) from public, anon;
grant execute on function private.secure_work_order_detail(bigint, bigint) to authenticated;
revoke all on function public.workspace_work_order_detail(bigint, bigint) from public, anon;
grant execute on function public.workspace_work_order_detail(bigint, bigint) to authenticated;

revoke all on function private.secure_add_work_order_note(bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.workspace_add_work_order_note(bigint, bigint, text) from public, anon, authenticated;
