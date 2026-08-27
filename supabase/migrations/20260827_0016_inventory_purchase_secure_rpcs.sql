-- Estoque e compras: retira acesso REST direto aos saldos e custos. A implementação
-- privilegiada fica no schema privado e as rotas públicas tornam-se fachadas invoker.
revoke all on table public.inventory_balances, public.inventory_movements, public.inventory_reservations,
  public.purchase_orders, public.purchase_order_items from anon, authenticated;

create or replace function private.can_inventory_manage(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private as $$
  select private.is_super_admin() or exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = target_tenant_id and tm.user_id = auth.uid() and tm.active
      and (tm.role in ('owner', 'admin') or coalesce(tm.permissions, '[]'::jsonb) ? 'inventory.manage')
  )
$$;

create or replace function private.can_purchase_manage(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private as $$
  select private.is_super_admin() or exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = target_tenant_id and tm.user_id = auth.uid() and tm.active
      and (tm.role in ('owner', 'admin') or coalesce(tm.permissions, '[]'::jsonb) ? 'purchases.manage')
  )
$$;

create or replace function private.assert_inventory_access(target_tenant_id bigint, needs_financial boolean default false)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not private.can_inventory_manage(target_tenant_id) then raise exception 'Seu perfil não possui permissão para administrar estoque.' using errcode = '42501'; end if;
  if needs_financial and not private.can_manage_financial_catalog(target_tenant_id) then raise exception 'Seu perfil não pode registrar ou consultar custos de estoque.' using errcode = '42501'; end if;
end;
$$;

create or replace function private.assert_purchase_access(target_tenant_id bigint, needs_financial boolean default false)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  if not private.can_purchase_manage(target_tenant_id) then raise exception 'Seu perfil não possui permissão para administrar compras.' using errcode = '42501'; end if;
  if needs_financial and not private.can_manage_financial_catalog(target_tenant_id) then raise exception 'Seu perfil não pode registrar custos de compra.' using errcode = '42501'; end if;
end;
$$;

create or replace function private.workspace_list_inventory(target_tenant_id bigint, query_input text, page_input integer, page_size_input integer)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare result jsonb; include_financial boolean;
begin
  perform private.assert_inventory_access(target_tenant_id);
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then raise exception 'Paginação inválida.' using errcode = '22023'; end if;
  include_financial := private.can_manage_financial_catalog(target_tenant_id);
  select coalesce(jsonb_agg(row_data order by sort_name), '[]'::jsonb) into result from (
    select p.name sort_name, jsonb_build_object('id', p.id, 'name', p.name, 'sku', p.sku, 'unit', p.unit, 'minStock', p.min_stock, 'physicalQuantity', b.physical_quantity, 'reservedQuantity', b.reserved_quantity, 'availableQuantity', b.physical_quantity - b.reserved_quantity)
      || case when include_financial then jsonb_build_object('currentCost', p.current_cost, 'averageCost', p.average_cost, 'salePrice', p.sale_price) else '{}'::jsonb end row_data
    from public.products p join public.inventory_balances b on b.tenant_id = p.tenant_id and b.product_id = p.id
    where p.tenant_id = target_tenant_id and (nullif(trim(query_input), '') is null or p.name ilike '%' || trim(query_input) || '%' or coalesce(p.sku, '') ilike '%' || trim(query_input) || '%')
    order by p.name offset (page_input - 1) * page_size_input limit page_size_input + 1
  ) rows;
  return result;
end;
$$;

create or replace function private.workspace_list_inventory_movements(target_tenant_id bigint, target_product_id bigint, result_limit integer)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare result jsonb;
begin
  perform private.assert_inventory_access(target_tenant_id);
  if result_limit < 1 or result_limit > 100 then raise exception 'Limite inválido.' using errcode = '22023'; end if;
  if not exists(select 1 from public.products where id = target_product_id and tenant_id = target_tenant_id) then raise exception 'Produto não encontrado nesta oficina.' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(row_data order by sort_date desc), '[]'::jsonb) into result from (
    select m.created_at sort_date, jsonb_build_object('id', m.id, 'tenantId', m.tenant_id, 'productId', m.product_id, 'type', m.type, 'quantity', m.quantity, 'physicalDelta', m.physical_delta, 'reservedDelta', m.reserved_delta, 'referenceType', m.reference_type, 'referenceId', m.reference_id, 'notes', m.notes, 'createdByUserId', m.created_by_user_id, 'createdAt', m.created_at) row_data
    from public.inventory_movements m where m.tenant_id = target_tenant_id and m.product_id = target_product_id order by m.created_at desc limit result_limit
  ) rows;
  return result;
end;
$$;

alter function public.workspace_adjust_inventory(bigint, bigint, numeric, text) set schema private;
alter function private.workspace_adjust_inventory(bigint, bigint, numeric, text) security definer;
alter function private.workspace_adjust_inventory(bigint, bigint, numeric, text) set search_path = public, private, pg_temp;

create or replace function private.workspace_inventory_forecast(target_tenant_id bigint, until_input timestamptz)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare result jsonb; forecast_until timestamptz := coalesce(until_input, now() + interval '7 days');
begin
  perform private.assert_inventory_access(target_tenant_id);
  if forecast_until < now() - interval '1 day' or forecast_until > now() + interval '730 days' then raise exception 'Data de previsão inválida.' using errcode = '22023'; end if;
  with demand as (
    select qi.product_id, qi.quantity, 'quote:' || a.quote_id || ':product:' || qi.product_id source_key, a.id appointment_id, null::bigint work_order_id
      from public.appointments a join public.quote_items qi on qi.tenant_id = a.tenant_id and qi.quote_id = a.quote_id
      where a.tenant_id = target_tenant_id and qi.product_id is not null and a.scheduled_start >= now() and a.scheduled_start <= forecast_until and a.status in ('scheduled','confirmed','received','diagnosis','awaiting_part','in_service')
    union all
    select wi.product_id, wi.quantity, 'work_order:' || wo.id || ':product:' || wi.product_id source_key, null::bigint, wo.id
      from public.work_orders wo join public.work_order_items wi on wi.tenant_id = wo.tenant_id and wi.work_order_id = wo.id
      where wo.tenant_id = target_tenant_id and wi.product_id is not null and wo.appointment_id is null and wo.status in ('scheduled','received','diagnosis','awaiting_approval','awaiting_part','in_service')
  ), coverage as (
    select r.product_id, case when r.quote_id is not null then 'quote:' || r.quote_id || ':product:' || r.product_id else 'work_order:' || r.work_order_id || ':product:' || r.product_id end source_key, sum(r.quantity) quantity
      from public.inventory_reservations r where r.tenant_id = target_tenant_id and r.status = 'active' group by r.product_id, case when r.quote_id is not null then 'quote:' || r.quote_id || ':product:' || r.product_id else 'work_order:' || r.work_order_id || ':product:' || r.product_id end
  ), demand_summary as (
    select d.product_id, sum(d.quantity) future_need, sum(greatest(d.quantity - coalesce(c.quantity, 0), 0)) unreserved_future_need, coalesce(array_agg(distinct d.appointment_id) filter (where d.appointment_id is not null), '{}') affected_appointment_ids, coalesce(array_agg(distinct d.work_order_id) filter (where d.work_order_id is not null), '{}') affected_work_order_ids
      from demand d left join coverage c on c.product_id = d.product_id and c.source_key = d.source_key group by d.product_id
  ), reservations as (
    select product_id, sum(quantity) quantity from public.inventory_reservations where tenant_id = target_tenant_id and status = 'active' group by product_id
  )
  select coalesce(jsonb_agg(row_data order by projected_deficit desc, available asc), '[]'::jsonb) into result from (
    select greatest(0, coalesce(ds.unreserved_future_need, 0) - (b.physical_quantity - b.reserved_quantity)) projected_deficit, b.physical_quantity - b.reserved_quantity available,
      jsonb_build_object('productId', p.id, 'productName', p.name, 'physical', b.physical_quantity, 'reserved', b.reserved_quantity, 'available', b.physical_quantity - b.reserved_quantity, 'futureNeed', coalesce(ds.future_need, 0), 'unreservedFutureNeed', coalesce(ds.unreserved_future_need, 0), 'activeReservationDemand', coalesce(r.quantity, 0), 'projectedDeficit', greatest(0, coalesce(ds.unreserved_future_need, 0) - (b.physical_quantity - b.reserved_quantity)), 'recommendedPurchaseQuantity', greatest(0, coalesce(ds.unreserved_future_need, 0) - (b.physical_quantity - b.reserved_quantity)), 'affectedAppointmentIds', coalesce(to_jsonb(ds.affected_appointment_ids), '[]'::jsonb), 'affectedWorkOrderIds', coalesce(to_jsonb(ds.affected_work_order_ids), '[]'::jsonb), 'critical', ((b.physical_quantity - b.reserved_quantity) <= p.min_stock or greatest(0, coalesce(ds.unreserved_future_need, 0) - (b.physical_quantity - b.reserved_quantity)) > 0)) row_data
    from public.products p join public.inventory_balances b on b.tenant_id = p.tenant_id and b.product_id = p.id left join demand_summary ds on ds.product_id = p.id left join reservations r on r.product_id = p.id
    where p.tenant_id = target_tenant_id and ((b.physical_quantity - b.reserved_quantity) <= p.min_stock or coalesce(ds.future_need, 0) > 0)
  ) rows;
  return result;
end;
$$;

create or replace function private.workspace_list_purchase_orders(target_tenant_id bigint, status_input text, query_input text, page_input integer, page_size_input integer)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare result jsonb; include_financial boolean;
begin
  perform private.assert_purchase_access(target_tenant_id);
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 or (status_input is not null and status_input not in ('draft','ordered','partially_received','received','cancelled')) then raise exception 'Filtro de pedido inválido.' using errcode = '22023'; end if;
  include_financial := private.can_manage_financial_catalog(target_tenant_id);
  select coalesce(jsonb_agg(row_data order by sort_date desc), '[]'::jsonb) into result from (
    select po.created_at sort_date, jsonb_build_object('order', jsonb_build_object('id', po.id, 'tenantId', po.tenant_id, 'number', po.number, 'supplierId', po.supplier_id, 'status', po.status, 'orderedAt', po.ordered_at, 'receivedAt', po.received_at, 'notes', po.notes, 'createdByUserId', po.created_by_user_id, 'createdAt', po.created_at, 'updatedAt', po.updated_at), 'supplier', case when s.id is null then null else jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone) end, 'items', coalesce((select jsonb_agg(jsonb_build_object('id', poi.id, 'tenantId', poi.tenant_id, 'purchaseOrderId', poi.purchase_order_id, 'productId', poi.product_id, 'orderedQuantity', poi.ordered_quantity, 'receivedQuantity', poi.received_quantity) || case when include_financial then jsonb_build_object('unitCost', poi.unit_cost) else '{}'::jsonb end order by poi.id) from public.purchase_order_items poi where poi.tenant_id = target_tenant_id and poi.purchase_order_id = po.id), '[]'::jsonb)) row_data
    from public.purchase_orders po left join public.suppliers s on s.id = po.supplier_id and s.tenant_id = po.tenant_id
    where po.tenant_id = target_tenant_id and (status_input is null or po.status = status_input) and (nullif(trim(query_input), '') is null or coalesce(s.name, '') ilike '%' || trim(query_input) || '%' or po.number::text ilike '%' || trim(query_input) || '%' or coalesce(po.notes, '') ilike '%' || trim(query_input) || '%')
    order by po.created_at desc offset (page_input - 1) * page_size_input limit page_size_input + 1
  ) rows;
  return result;
end;
$$;

create or replace function private.workspace_create_purchase_order(target_tenant_id bigint, supplier_id_input bigint, notes_input text, items_input jsonb)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare created_id bigint; next_number integer; item jsonb; product_ref bigint; quantity_ref numeric; unit_cost_ref numeric;
begin
  perform private.assert_purchase_access(target_tenant_id, true);
  if length(coalesce(notes_input, '')) > 4000 or jsonb_typeof(items_input) <> 'array' or jsonb_array_length(items_input) < 1 or jsonb_array_length(items_input) > 100 then raise exception 'Dados do pedido inválidos.' using errcode = '22023'; end if;
  if supplier_id_input is not null and not exists(select 1 from public.suppliers where id = supplier_id_input and tenant_id = target_tenant_id) then raise exception 'O fornecedor não pertence a esta oficina.' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(items_input) loop
    product_ref := nullif(item->>'productId', '')::bigint; quantity_ref := nullif(item->>'quantity', '')::numeric; unit_cost_ref := nullif(item->>'unitCost', '')::numeric;
    if product_ref is null or quantity_ref is null or quantity_ref <= 0 or quantity_ref > 1000000 or unit_cost_ref is null or unit_cost_ref < 0 or unit_cost_ref > 1000000000 or not exists(select 1 from public.products where id = product_ref and tenant_id = target_tenant_id) then raise exception 'Um ou mais produtos não pertencem a esta oficina ou possuem valores inválidos.' using errcode = '22023'; end if;
  end loop;
  perform pg_advisory_xact_lock(target_tenant_id);
  select coalesce(max(number), 0) + 1 into next_number from public.purchase_orders where tenant_id = target_tenant_id;
  insert into public.purchase_orders(tenant_id, number, supplier_id, notes, created_by_user_id) values(target_tenant_id, next_number, supplier_id_input, nullif(trim(notes_input), ''), auth.uid()) returning id into created_id;
  for item in select value from jsonb_array_elements(items_input) loop
    insert into public.purchase_order_items(tenant_id, purchase_order_id, product_id, ordered_quantity, unit_cost) values(target_tenant_id, created_id, (item->>'productId')::bigint, (item->>'quantity')::numeric, (item->>'unitCost')::numeric);
  end loop;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after) values(target_tenant_id, auth.uid(), 'purchase_order.created', 'purchase_order', created_id, jsonb_build_object('number', next_number, 'supplierId', supplier_id_input, 'itemCount', jsonb_array_length(items_input), 'items', items_input));
  return jsonb_build_object('id', created_id, 'number', next_number);
end;
$$;

create or replace function private.workspace_receive_purchase_order(target_tenant_id bigint, target_purchase_order_id bigint, received_items_input jsonb)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare order_row public.purchase_orders%rowtype; item_input jsonb; target_item public.purchase_order_items%rowtype; balance_row public.inventory_balances%rowtype; old_average numeric; next_average numeric; received_quantity_input numeric; audit_items jsonb := '[]'::jsonb; next_status text;
begin
  perform private.assert_purchase_access(target_tenant_id, true);
  if jsonb_typeof(received_items_input) <> 'array' or jsonb_array_length(received_items_input) < 1 or jsonb_array_length(received_items_input) > 100 then raise exception 'Itens de recebimento inválidos.' using errcode = '22023'; end if;
  select * into order_row from public.purchase_orders where id = target_purchase_order_id and tenant_id = target_tenant_id for update;
  if not found or order_row.status in ('cancelled', 'received') then raise exception 'Pedido indisponível para recebimento.' using errcode = '22023'; end if;
  for item_input in select value from jsonb_array_elements(received_items_input) loop
    received_quantity_input := nullif(item_input->>'receivedQuantity', '')::numeric;
    if nullif(item_input->>'itemId', '') is null or received_quantity_input is null or received_quantity_input <= 0 or received_quantity_input > 1000000 then raise exception 'Item de recebimento inválido.' using errcode = '22023'; end if;
    select * into target_item from public.purchase_order_items where id = (item_input->>'itemId')::bigint and tenant_id = target_tenant_id and purchase_order_id = target_purchase_order_id for update;
    if not found then raise exception 'Item de compra inválido.' using errcode = '22023'; end if;
    if target_item.received_quantity + received_quantity_input > target_item.ordered_quantity then raise exception 'Recebimento supera a quantidade pedida.' using errcode = '22023'; end if;
    select * into balance_row from public.inventory_balances where tenant_id = target_tenant_id and product_id = target_item.product_id for update;
    if not found then raise exception 'Saldo de estoque não encontrado.' using errcode = '22023'; end if;
    select average_cost into old_average from public.products where id = target_item.product_id and tenant_id = target_tenant_id for update;
    next_average := round(((balance_row.physical_quantity * coalesce(old_average, 0)) + (received_quantity_input * target_item.unit_cost)) / (balance_row.physical_quantity + received_quantity_input), 2);
    update public.purchase_order_items set received_quantity = received_quantity + received_quantity_input where id = target_item.id and tenant_id = target_tenant_id;
    update public.inventory_balances set physical_quantity = physical_quantity + received_quantity_input where id = balance_row.id and tenant_id = target_tenant_id;
    update public.products set current_cost = target_item.unit_cost, average_cost = next_average where id = target_item.product_id and tenant_id = target_tenant_id;
    insert into public.inventory_movements(tenant_id, product_id, type, quantity, physical_delta, reserved_delta, reference_type, reference_id, created_by_user_id) values(target_tenant_id, target_item.product_id, 'purchase_entry', received_quantity_input, received_quantity_input, 0, 'purchase_order', target_purchase_order_id, auth.uid());
    audit_items := audit_items || jsonb_build_array(jsonb_build_object('itemId', target_item.id, 'productId', target_item.product_id, 'quantity', received_quantity_input, 'previousPhysical', balance_row.physical_quantity, 'nextPhysical', balance_row.physical_quantity + received_quantity_input, 'previousAverageCost', coalesce(old_average, 0), 'nextAverageCost', next_average, 'currentCost', target_item.unit_cost));
  end loop;
  select case when bool_and(received_quantity >= ordered_quantity) then 'received' else 'partially_received' end into next_status from public.purchase_order_items where tenant_id = target_tenant_id and purchase_order_id = target_purchase_order_id;
  update public.purchase_orders set status = next_status, received_at = case when next_status = 'received' then now() else null end where id = target_purchase_order_id and tenant_id = target_tenant_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after) values(target_tenant_id, auth.uid(), 'purchase_order.received', 'purchase_order', target_purchase_order_id, jsonb_build_object('status', order_row.status), jsonb_build_object('status', next_status, 'receivedItems', audit_items));
end;
$$;

grant usage on schema private to authenticated;
grant execute on function private.workspace_list_inventory(bigint, text, integer, integer), private.workspace_list_inventory_movements(bigint, bigint, integer), private.workspace_adjust_inventory(bigint, bigint, numeric, text), private.workspace_inventory_forecast(bigint, timestamptz), private.workspace_list_purchase_orders(bigint, text, text, integer, integer), private.workspace_create_purchase_order(bigint, bigint, text, jsonb), private.workspace_receive_purchase_order(bigint, bigint, jsonb) to authenticated;
revoke all on function private.workspace_list_inventory(bigint, text, integer, integer), private.workspace_list_inventory_movements(bigint, bigint, integer), private.workspace_adjust_inventory(bigint, bigint, numeric, text), private.workspace_inventory_forecast(bigint, timestamptz), private.workspace_list_purchase_orders(bigint, text, text, integer, integer), private.workspace_create_purchase_order(bigint, bigint, text, jsonb), private.workspace_receive_purchase_order(bigint, bigint, jsonb) from anon, public;

create or replace function public.workspace_list_inventory(target_tenant_id bigint, query_input text, page_input integer, page_size_input integer) returns jsonb language sql security invoker set search_path = '' as $$ select private.workspace_list_inventory($1, $2, $3, $4) $$;
create or replace function public.workspace_list_inventory_movements(target_tenant_id bigint, target_product_id bigint, result_limit integer) returns jsonb language sql security invoker set search_path = '' as $$ select private.workspace_list_inventory_movements($1, $2, $3) $$;
create or replace function public.workspace_adjust_inventory(target_tenant_id bigint, target_product_id bigint, quantity_delta_input numeric, notes_input text) returns jsonb language sql security invoker set search_path = '' as $$ select private.workspace_adjust_inventory($1, $2, $3, $4) $$;
create or replace function public.workspace_inventory_forecast(target_tenant_id bigint, until_input timestamptz) returns jsonb language sql security invoker set search_path = '' as $$ select private.workspace_inventory_forecast($1, $2) $$;
create or replace function public.workspace_list_purchase_orders(target_tenant_id bigint, status_input text, query_input text, page_input integer, page_size_input integer) returns jsonb language sql security invoker set search_path = '' as $$ select private.workspace_list_purchase_orders($1, $2, $3, $4, $5) $$;
create or replace function public.workspace_create_purchase_order(target_tenant_id bigint, supplier_id_input bigint, notes_input text, items_input jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select private.workspace_create_purchase_order($1, $2, $3, $4) $$;
create or replace function public.workspace_receive_purchase_order(target_tenant_id bigint, target_purchase_order_id bigint, received_items_input jsonb) returns void language plpgsql security invoker set search_path = '' as $$ begin perform private.workspace_receive_purchase_order(target_tenant_id, target_purchase_order_id, received_items_input); end; $$;

revoke all on function public.workspace_list_inventory(bigint, text, integer, integer), public.workspace_list_inventory_movements(bigint, bigint, integer), public.workspace_adjust_inventory(bigint, bigint, numeric, text), public.workspace_inventory_forecast(bigint, timestamptz), public.workspace_list_purchase_orders(bigint, text, text, integer, integer), public.workspace_create_purchase_order(bigint, bigint, text, jsonb), public.workspace_receive_purchase_order(bigint, bigint, jsonb) from public, anon;
grant execute on function public.workspace_list_inventory(bigint, text, integer, integer), public.workspace_list_inventory_movements(bigint, bigint, integer), public.workspace_adjust_inventory(bigint, bigint, numeric, text), public.workspace_inventory_forecast(bigint, timestamptz), public.workspace_list_purchase_orders(bigint, text, text, integer, integer), public.workspace_create_purchase_order(bigint, bigint, text, jsonb), public.workspace_receive_purchase_order(bigint, bigint, jsonb) to authenticated;
