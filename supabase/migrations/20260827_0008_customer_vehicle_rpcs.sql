-- Cadastros de atendimento com auditoria na mesma transação e sob RLS.

create or replace function public.workspace_create_customer(
  target_tenant_id bigint,
  customer_name text,
  customer_whatsapp text,
  customer_email text default null,
  customer_document text default null,
  customer_notes text default null
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_customer_id bigint;
begin
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = target_tenant_id and user_id = auth.uid() and active
      and role in ('owner', 'admin', 'attendant')
  ) and not exists (
    select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin'
  ) then
    raise exception 'Seu perfil não possui permissão para gerenciar clientes.' using errcode = '42501';
  end if;

  if length(trim(customer_name)) < 2 or length(trim(customer_name)) > 180 then
    raise exception 'Nome do cliente inválido.' using errcode = '22023';
  end if;
  if length(trim(customer_whatsapp)) < 8 or length(trim(customer_whatsapp)) > 32 then
    raise exception 'WhatsApp do cliente inválido.' using errcode = '22023';
  end if;

  insert into public.customers (tenant_id, name, whatsapp, email, document, notes)
  values (
    target_tenant_id,
    trim(customer_name),
    trim(customer_whatsapp),
    nullif(trim(customer_email), ''),
    nullif(trim(customer_document), ''),
    nullif(trim(customer_notes), '')
  )
  returning id into created_customer_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (
    target_tenant_id,
    auth.uid(),
    'customer.created',
    'customer',
    created_customer_id,
    jsonb_build_object('name', trim(customer_name))
  );

  return created_customer_id;
end;
$$;

create or replace function public.workspace_create_vehicle(
  target_tenant_id bigint,
  target_customer_id bigint,
  vehicle_make text,
  vehicle_model text,
  vehicle_model_year integer default null,
  vehicle_manufacture_year integer default null,
  vehicle_plate text default null,
  vehicle_mileage integer default null,
  vehicle_engine text default null,
  vehicle_notes text default null
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_vehicle_id bigint;
begin
  if not exists (
    select 1 from public.tenant_members
    where tenant_id = target_tenant_id and user_id = auth.uid() and active
      and role in ('owner', 'admin', 'attendant')
  ) and not exists (
    select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin'
  ) then
    raise exception 'Seu perfil não possui permissão para gerenciar clientes.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.customers
    where id = target_customer_id and tenant_id = target_tenant_id
  ) then
    raise exception 'Cliente não encontrado nesta oficina.' using errcode = 'P0002';
  end if;

  if length(trim(vehicle_make)) < 1 or length(trim(vehicle_make)) > 100
    or length(trim(vehicle_model)) < 1 or length(trim(vehicle_model)) > 140 then
    raise exception 'Dados do veículo inválidos.' using errcode = '22023';
  end if;
  if vehicle_model_year is not null and (vehicle_model_year < 1900 or vehicle_model_year > 2100)
    or vehicle_manufacture_year is not null and (vehicle_manufacture_year < 1900 or vehicle_manufacture_year > 2100)
    or vehicle_mileage is not null and vehicle_mileage < 0 then
    raise exception 'Ano ou quilometragem inválidos.' using errcode = '22023';
  end if;

  insert into public.vehicles (
    tenant_id, customer_id, make, model, model_year, manufacture_year, plate, mileage, engine, notes
  ) values (
    target_tenant_id,
    target_customer_id,
    trim(vehicle_make),
    trim(vehicle_model),
    vehicle_model_year,
    vehicle_manufacture_year,
    nullif(trim(vehicle_plate), ''),
    vehicle_mileage,
    nullif(trim(vehicle_engine), ''),
    nullif(trim(vehicle_notes), '')
  )
  returning id into created_vehicle_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (
    target_tenant_id,
    auth.uid(),
    'vehicle.created',
    'vehicle',
    created_vehicle_id,
    jsonb_build_object('make', trim(vehicle_make), 'model', trim(vehicle_model), 'customerId', target_customer_id)
  );

  return created_vehicle_id;
end;
$$;

revoke all on function public.workspace_create_customer(bigint, text, text, text, text, text) from public, anon;
revoke all on function public.workspace_create_vehicle(bigint, bigint, text, text, integer, integer, text, integer, text, text) from public, anon;
grant execute on function public.workspace_create_customer(bigint, text, text, text, text, text) to authenticated;
grant execute on function public.workspace_create_vehicle(bigint, bigint, text, text, integer, integer, text, integer, text, text) to authenticated;
