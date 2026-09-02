-- Clientes e veículos só podiam ser criados e lidos -- não havia edição nem
-- forma de "excluir". Como quotes/OS/agendamentos/receitas referenciam
-- customers/vehicles sem "on delete cascade" (RESTRICT por padrão), um DELETE
-- real quebraria assim que existisse qualquer histórico. Por isso "excluir"
-- aqui é desativar (mesmo padrão já usado em bays: active=false, nunca um
-- DELETE de verdade) -- os dados e o histórico continuam intactos e podem ser
-- reativados a qualquer momento.

alter table public.vehicles add column if not exists active boolean not null default true;

create or replace function public.workspace_update_customer(
  target_tenant_id bigint,
  target_customer_id bigint,
  customer_name text,
  customer_whatsapp text,
  customer_email text default null,
  customer_document text default null,
  customer_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if not private.can_catalog_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para gerenciar clientes.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers where id = target_customer_id and tenant_id = target_tenant_id) then
    raise exception 'Cliente não encontrado nesta oficina.' using errcode = 'P0002';
  end if;
  if length(trim(customer_name)) < 2 or length(trim(customer_name)) > 180 then
    raise exception 'Nome do cliente inválido.' using errcode = '22023';
  end if;
  if length(trim(customer_whatsapp)) < 8 or length(trim(customer_whatsapp)) > 32 then
    raise exception 'WhatsApp do cliente inválido.' using errcode = '22023';
  end if;

  update public.customers set
    name = trim(customer_name),
    whatsapp = trim(customer_whatsapp),
    email = nullif(trim(customer_email), ''),
    document = nullif(trim(customer_document), ''),
    notes = nullif(trim(customer_notes), ''),
    updated_at = now()
  where id = target_customer_id and tenant_id = target_tenant_id;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (target_tenant_id, auth.uid(), 'customer.updated', 'customer', target_customer_id, jsonb_build_object('name', trim(customer_name)));

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.workspace_set_customer_active(target_tenant_id bigint, target_customer_id bigint, active_input boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if not private.can_catalog_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para gerenciar clientes.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers where id = target_customer_id and tenant_id = target_tenant_id) then
    raise exception 'Cliente não encontrado nesta oficina.' using errcode = 'P0002';
  end if;

  update public.customers set active = active_input, updated_at = now() where id = target_customer_id and tenant_id = target_tenant_id;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (target_tenant_id, auth.uid(), case when active_input then 'customer.reactivated' else 'customer.deactivated' end, 'customer', target_customer_id, jsonb_build_object('active', active_input));

  return jsonb_build_object('success', true, 'active', active_input);
end;
$$;

create or replace function public.workspace_update_vehicle(
  target_tenant_id bigint,
  target_vehicle_id bigint,
  vehicle_make text,
  vehicle_model text,
  vehicle_model_year integer default null,
  vehicle_manufacture_year integer default null,
  vehicle_plate text default null,
  vehicle_mileage integer default null,
  vehicle_engine text default null,
  vehicle_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if not private.can_catalog_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para gerenciar clientes.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vehicles where id = target_vehicle_id and tenant_id = target_tenant_id) then
    raise exception 'Veículo não encontrado nesta oficina.' using errcode = 'P0002';
  end if;
  if length(trim(vehicle_make)) < 1 or length(trim(vehicle_make)) > 100
    or length(trim(vehicle_model)) < 1 or length(trim(vehicle_model)) > 140 then
    raise exception 'Dados do veículo inválidos.' using errcode = '22023';
  end if;
  if vehicle_model_year is not null and (vehicle_model_year < 1900 or vehicle_model_year > 2100) then
    raise exception 'Ano do veículo inválido.' using errcode = '22023';
  end if;

  update public.vehicles set
    make = trim(vehicle_make),
    model = trim(vehicle_model),
    model_year = vehicle_model_year,
    manufacture_year = vehicle_manufacture_year,
    plate = nullif(trim(vehicle_plate), ''),
    mileage = vehicle_mileage,
    engine = nullif(trim(vehicle_engine), ''),
    notes = nullif(trim(vehicle_notes), ''),
    updated_at = now()
  where id = target_vehicle_id and tenant_id = target_tenant_id;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (target_tenant_id, auth.uid(), 'vehicle.updated', 'vehicle', target_vehicle_id, jsonb_build_object('make', trim(vehicle_make), 'model', trim(vehicle_model)));

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.workspace_set_vehicle_active(target_tenant_id bigint, target_vehicle_id bigint, active_input boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if not private.can_catalog_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para gerenciar clientes.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vehicles where id = target_vehicle_id and tenant_id = target_tenant_id) then
    raise exception 'Veículo não encontrado nesta oficina.' using errcode = 'P0002';
  end if;

  update public.vehicles set active = active_input, updated_at = now() where id = target_vehicle_id and tenant_id = target_tenant_id;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (target_tenant_id, auth.uid(), case when active_input then 'vehicle.reactivated' else 'vehicle.deactivated' end, 'vehicle', target_vehicle_id, jsonb_build_object('active', active_input));

  return jsonb_build_object('success', true, 'active', active_input);
end;
$$;

revoke all on function public.workspace_update_customer(bigint, bigint, text, text, text, text, text) from public, anon;
grant execute on function public.workspace_update_customer(bigint, bigint, text, text, text, text, text) to authenticated;
revoke all on function public.workspace_set_customer_active(bigint, bigint, boolean) from public, anon;
grant execute on function public.workspace_set_customer_active(bigint, bigint, boolean) to authenticated;
revoke all on function public.workspace_update_vehicle(bigint, bigint, text, text, integer, integer, text, integer, text, text) from public, anon;
grant execute on function public.workspace_update_vehicle(bigint, bigint, text, text, integer, integer, text, integer, text, text) to authenticated;
revoke all on function public.workspace_set_vehicle_active(bigint, bigint, boolean) from public, anon;
grant execute on function public.workspace_set_vehicle_active(bigint, bigint, boolean) to authenticated;
