-- Ajuste de estoque protegido: saldo físico nunca pode ficar abaixo do reservado.
create or replace function public.workspace_adjust_inventory(
  target_tenant_id bigint,
  target_product_id bigint,
  quantity_delta_input numeric,
  notes_input text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  prior_physical numeric;
  next_physical numeric;
begin
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = target_tenant_id and user_id = auth.uid() and active
      and (role in ('owner', 'admin') or coalesce(permissions, '[]'::jsonb) ? 'inventory.manage')
  ) and not exists (
    select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin'
  ) then
    raise exception 'Seu perfil não possui permissão para ajustar estoque.' using errcode = '42501';
  end if;

  if quantity_delta_input is null or quantity_delta_input = 0
    or quantity_delta_input < -1000000 or quantity_delta_input > 1000000
    or length(trim(notes_input)) < 3 or length(trim(notes_input)) > 1000 then
    raise exception 'Dados de ajuste inválidos.' using errcode = '22023';
  end if;

  select physical_quantity into prior_physical
  from public.inventory_balances
  where tenant_id = target_tenant_id and product_id = target_product_id
  for update;
  if not found then
    raise exception 'Produto não encontrado nesta oficina.' using errcode = 'P0002';
  end if;

  update public.inventory_balances
  set physical_quantity = physical_quantity + quantity_delta_input
  where tenant_id = target_tenant_id
    and product_id = target_product_id
    and physical_quantity + quantity_delta_input >= reserved_quantity
  returning physical_quantity into next_physical;
  if not found then
    raise exception 'O ajuste não pode deixar o estoque físico abaixo do estoque reservado.' using errcode = '22023';
  end if;

  insert into public.inventory_movements (
    tenant_id, product_id, type, quantity, physical_delta, reserved_delta, notes, created_by_user_id
  ) values (
    target_tenant_id, target_product_id, 'adjustment', abs(quantity_delta_input), quantity_delta_input, 0, trim(notes_input), auth.uid()
  );
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, before, after, metadata)
  values (
    target_tenant_id, auth.uid(), 'inventory.adjusted', 'product', target_product_id,
    jsonb_build_object('physicalQuantity', prior_physical),
    jsonb_build_object('physicalQuantity', next_physical),
    jsonb_build_object('quantityDelta', quantity_delta_input, 'notes', trim(notes_input))
  );

  return jsonb_build_object('previousPhysical', prior_physical, 'nextPhysical', next_physical);
end;
$$;

revoke all on function public.workspace_adjust_inventory(bigint, bigint, numeric, text) from public, anon;
grant execute on function public.workspace_adjust_inventory(bigint, bigint, numeric, text) to authenticated;
