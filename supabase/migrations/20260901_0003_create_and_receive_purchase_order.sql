-- Compra de balcão: a peça já chegou junto com quem foi comprar. Fazer
-- criar-pedido e receber-pedido como duas chamadas separadas deixaria a
-- compra "pela metade" se a segunda falhasse. Esta função faz as duas coisas
-- numa transação só. O fluxo de encomenda ao fornecedor (chega depois)
-- continua usando workspace_create_purchase_order + workspace_receive_purchase_order,
-- sem mudança.
create function private.workspace_create_and_receive_purchase_order(
  target_tenant_id bigint,
  supplier_id_input bigint,
  notes_input text,
  items_input jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  created_id bigint;
  next_number integer;
  item jsonb;
  product_ref bigint;
  quantity_ref numeric;
  unit_cost_ref numeric;
  balance_row public.inventory_balances%rowtype;
  old_average numeric;
  next_average numeric;
begin
  perform private.assert_purchase_access(target_tenant_id, true);
  if length(coalesce(notes_input, '')) > 4000 or jsonb_typeof(items_input) <> 'array' or jsonb_array_length(items_input) < 1 or jsonb_array_length(items_input) > 100 then
    raise exception 'Dados da compra inválidos.' using errcode = '22023';
  end if;
  if supplier_id_input is not null and not exists(select 1 from public.suppliers where id = supplier_id_input and tenant_id = target_tenant_id) then
    raise exception 'O fornecedor não pertence a esta oficina.' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(items_input) loop
    product_ref := nullif(item->>'productId', '')::bigint;
    quantity_ref := nullif(item->>'quantity', '')::numeric;
    unit_cost_ref := nullif(item->>'unitCost', '')::numeric;
    if product_ref is null or quantity_ref is null or quantity_ref <= 0 or quantity_ref > 1000000
      or unit_cost_ref is null or unit_cost_ref < 0 or unit_cost_ref > 1000000000
      or not exists(select 1 from public.products where id = product_ref and tenant_id = target_tenant_id) then
      raise exception 'Um ou mais produtos não pertencem a esta oficina ou possuem valores inválidos.' using errcode = '22023';
    end if;
  end loop;

  perform pg_advisory_xact_lock(target_tenant_id);
  select coalesce(max(number), 0) + 1 into next_number from public.purchase_orders where tenant_id = target_tenant_id;
  insert into public.purchase_orders(tenant_id, number, supplier_id, notes, status, received_at, created_by_user_id)
  values(target_tenant_id, next_number, supplier_id_input, nullif(trim(notes_input), ''), 'received', now(), auth.uid())
  returning id into created_id;

  for item in select value from jsonb_array_elements(items_input) loop
    product_ref := (item->>'productId')::bigint;
    quantity_ref := (item->>'quantity')::numeric;
    unit_cost_ref := (item->>'unitCost')::numeric;

    insert into public.purchase_order_items(tenant_id, purchase_order_id, product_id, ordered_quantity, unit_cost, received_quantity)
    values(target_tenant_id, created_id, product_ref, quantity_ref, unit_cost_ref, quantity_ref);

    select * into balance_row from public.inventory_balances where tenant_id = target_tenant_id and product_id = product_ref for update;
    if not found then raise exception 'Saldo de estoque não encontrado.' using errcode = '22023'; end if;
    select average_cost into old_average from public.products where id = product_ref and tenant_id = target_tenant_id for update;
    next_average := round(((balance_row.physical_quantity * coalesce(old_average, 0)) + (quantity_ref * unit_cost_ref)) / (balance_row.physical_quantity + quantity_ref), 2);

    update public.inventory_balances set physical_quantity = physical_quantity + quantity_ref where id = balance_row.id and tenant_id = target_tenant_id;
    update public.products set current_cost = unit_cost_ref, average_cost = next_average where id = product_ref and tenant_id = target_tenant_id;
    insert into public.inventory_movements(tenant_id, product_id, type, quantity, physical_delta, reserved_delta, reference_type, reference_id, created_by_user_id)
    values(target_tenant_id, product_ref, 'purchase_entry', quantity_ref, quantity_ref, 0, 'purchase_order', created_id, auth.uid());
  end loop;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values(target_tenant_id, auth.uid(), 'purchase_order.created_and_received', 'purchase_order', created_id, jsonb_build_object('number', next_number, 'supplierId', supplier_id_input, 'items', items_input));

  return jsonb_build_object('id', created_id, 'number', next_number);
end;
$$;

create function public.workspace_create_and_receive_purchase_order(target_tenant_id bigint, supplier_id_input bigint, notes_input text, items_input jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.workspace_create_and_receive_purchase_order($1, $2, $3, $4)
$$;

grant execute on function private.workspace_create_and_receive_purchase_order(bigint, bigint, text, jsonb) to authenticated;
revoke all on function private.workspace_create_and_receive_purchase_order(bigint, bigint, text, jsonb) from anon, public;
grant execute on function public.workspace_create_and_receive_purchase_order(bigint, bigint, text, jsonb) to authenticated;
revoke all on function public.workspace_create_and_receive_purchase_order(bigint, bigint, text, jsonb) from anon, public;
