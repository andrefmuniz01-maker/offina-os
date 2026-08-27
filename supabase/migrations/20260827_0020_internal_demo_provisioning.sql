-- Provisionamento incremental da demonstração. O tenant é exclusivamente interno e não
-- cria tenant_members: somente Super Admins podem acessá-lo pelas policies e RPCs.
create or replace function private.assert_demo_operator()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.role() <> 'service_role' and not private.is_super_admin() then
    raise exception 'Apenas Super Admin pode provisionar ou resetar a demonstração.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.seed_incremental_demo(target_tenant_id bigint, actor_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  product_category_id bigint;
  service_category_id bigint;
  exhaust_supplier_id bigint;
  parts_supplier_id bigint;
  downpipe_product_id bigint;
  intake_product_id bigint;
  spark_plug_product_id bigint;
  install_service_id bigint;
  diagnostic_service_id bigint;
  kit_id bigint;
  customer_one_id bigint;
  customer_two_id bigint;
  vehicle_one_id bigint;
  vehicle_two_id bigint;
  purchase_order_id bigint;
begin
  update public.tenant_settings
  set legal_name = 'Performance Garage Demonstração Interna',
      phone = '+55 00 0000-0000',
      whatsapp = '+55 00 00000-0000',
      email = 'demo-interna@invalid.example',
      address = jsonb_build_object('city', 'São Paulo', 'state', 'SP', 'country', 'BR'),
      opening_hours = jsonb_build_object('mondayToFriday', '08:00-18:00', 'saturday', '09:00-13:00'),
      default_labor_hourly_rate = 220,
      default_parts_margin_percent = 35,
      default_parts_markup_percent = 55,
      minimum_margin_percent = 20,
      attendant_max_discount_percent = 5,
      quote_validity_days = 7,
      quote_message_template = 'Olá, {{cliente}}. Preparamos uma sugestão para seu veículo. Consulte o link seguro para revisar e aprovar.'
  where tenant_id = target_tenant_id;

  update public.tenant_branding
  set public_title = 'Performance Garage',
      logo_url = null,
      primary_color = '#E84D1C',
      secondary_color = '#171717',
      accent_color = '#F5B33A'
  where tenant_id = target_tenant_id;

  insert into public.product_categories(tenant_id, name, description)
  values(target_tenant_id, 'Escapamento e admissão', 'Componentes de performance para fluxo e resposta do motor')
  returning id into product_category_id;
  insert into public.service_categories(tenant_id, name, description)
  values(target_tenant_id, 'Performance e diagnóstico', 'Serviços técnicos com checklist e diagnóstico especializado')
  returning id into service_category_id;

  insert into public.suppliers(tenant_id, name, contact_name, phone, email, notes)
  values(target_tenant_id, 'Forge Parts Demo', 'Comercial Demo', '+55 00 0000-0001', 'fornecedor-a@invalid.example', 'Fornecedor fictício para ambiente de demonstração')
  returning id into exhaust_supplier_id;
  insert into public.suppliers(tenant_id, name, contact_name, phone, email, notes)
  values(target_tenant_id, 'Apex Components Demo', 'Comercial Demo', '+55 00 0000-0002', 'fornecedor-b@invalid.example', 'Fornecedor fictício para ambiente de demonstração')
  returning id into parts_supplier_id;

  insert into public.products(tenant_id, category_id, supplier_id, name, sku, brand, unit, current_cost, average_cost, sale_price, desired_margin_percent, min_stock, max_stock, location, description)
  values(target_tenant_id, product_category_id, exhaust_supplier_id, 'Downpipe inox B48', 'DEMO-DP-B48', 'Forge Demo', 'un', 950, 950, 1590, 35, 2, 8, 'A-01', 'Componente demonstrativo para BMW 320i B48')
  returning id into downpipe_product_id;
  insert into public.products(tenant_id, category_id, supplier_id, name, sku, brand, unit, current_cost, average_cost, sale_price, desired_margin_percent, min_stock, max_stock, location, description)
  values(target_tenant_id, product_category_id, parts_supplier_id, 'Filtro de ar de alto fluxo', 'DEMO-INT-001', 'Apex Demo', 'un', 180, 180, 329, 35, 3, 12, 'A-02', 'Filtro reutilizável demonstrativo')
  returning id into intake_product_id;
  insert into public.products(tenant_id, category_id, supplier_id, name, sku, brand, unit, current_cost, average_cost, sale_price, desired_margin_percent, min_stock, max_stock, location, description)
  values(target_tenant_id, product_category_id, parts_supplier_id, 'Jogo de velas iridium', 'DEMO-SP-IR', 'Apex Demo', 'jogo', 420, 420, 690, 30, 2, 6, 'B-03', 'Jogo demonstrativo de velas para manutenção de performance')
  returning id into spark_plug_product_id;

  insert into public.inventory_balances(tenant_id, product_id, physical_quantity, reserved_quantity)
  values(target_tenant_id, downpipe_product_id, 4, 0), (target_tenant_id, intake_product_id, 8, 0), (target_tenant_id, spark_plug_product_id, 5, 0);

  insert into public.services(tenant_id, category_id, name, description, estimated_minutes, labor_price, estimated_cost, desired_margin_percent, quote_questions)
  values(target_tenant_id, service_category_id, 'Instalação de downpipe', 'Instalação, conferência de vedação e checklist pós-serviço.', 240, 980, 420, 30, jsonb_build_array(jsonb_build_object('id', 'combustivel', 'label', 'Qual combustível o veículo utiliza?', 'type', 'select', 'required', true, 'options', jsonb_build_array('Gasolina', 'Etanol', 'Flex')), jsonb_build_object('id', 'luz_painel', 'label', 'Há luz de injeção acesa?', 'type', 'boolean', 'required', true)))
  returning id into install_service_id;
  insert into public.services(tenant_id, category_id, name, description, estimated_minutes, labor_price, estimated_cost, desired_margin_percent, quote_questions)
  values(target_tenant_id, service_category_id, 'Diagnóstico de performance', 'Leitura técnica, inspeção visual e recomendação de próximos passos.', 90, 320, 90, 25, jsonb_build_array(jsonb_build_object('id', 'sintoma', 'label', 'Qual sintoma principal?', 'type', 'text', 'required', true)))
  returning id into diagnostic_service_id;

  insert into public.service_products(tenant_id, service_id, product_id, quantity, required)
  values(target_tenant_id, install_service_id, downpipe_product_id, 1, true);

  insert into public.kits(tenant_id, category_id, name, description, sale_price_override, active)
  values(target_tenant_id, service_category_id, 'Stage 1 Fluxo B48', 'Kit demonstrativo com downpipe, filtro e instalação.', 2790, true)
  returning id into kit_id;
  insert into public.kit_items(tenant_id, kit_id, product_id, service_id, quantity)
  values(target_tenant_id, kit_id, downpipe_product_id, null, 1), (target_tenant_id, kit_id, intake_product_id, null, 1), (target_tenant_id, kit_id, null, install_service_id, 1);

  insert into public.customers(tenant_id, name, whatsapp, email, notes)
  values(target_tenant_id, 'Cliente Demo Horizonte', '+55 00 00000-0101', 'cliente-01@invalid.example', 'Cadastro exclusivamente demonstrativo')
  returning id into customer_one_id;
  insert into public.customers(tenant_id, name, whatsapp, email, notes)
  values(target_tenant_id, 'Cliente Demo Aurora', '+55 00 00000-0102', 'cliente-02@invalid.example', 'Cadastro exclusivamente demonstrativo')
  returning id into customer_two_id;
  insert into public.vehicles(tenant_id, customer_id, make, model, model_year, manufacture_year, plate, mileage, engine, notes)
  values(target_tenant_id, customer_one_id, 'BMW', '320i', 2020, 2020, 'DEM0A01', 41800, 'B48', 'Veículo de demonstração')
  returning id into vehicle_one_id;
  insert into public.vehicles(tenant_id, customer_id, make, model, model_year, manufacture_year, plate, mileage, engine, notes)
  values(target_tenant_id, customer_two_id, 'Volkswagen', 'Golf GTI', 2019, 2019, 'DEM0B02', 53700, 'EA888', 'Veículo de demonstração')
  returning id into vehicle_two_id;

  insert into public.purchase_orders(tenant_id, number, supplier_id, status, ordered_at, received_at, notes, created_by_user_id)
  values(target_tenant_id, 1, exhaust_supplier_id, 'received', now() - interval '10 days', now() - interval '9 days', 'Entrada inicial do ambiente demonstrativo.', actor_profile_id)
  returning id into purchase_order_id;
  insert into public.purchase_order_items(tenant_id, purchase_order_id, product_id, ordered_quantity, received_quantity, unit_cost)
  values(target_tenant_id, purchase_order_id, downpipe_product_id, 4, 4, 950), (target_tenant_id, purchase_order_id, intake_product_id, 8, 8, 180), (target_tenant_id, purchase_order_id, spark_plug_product_id, 5, 5, 420);
  insert into public.inventory_movements(tenant_id, product_id, type, quantity, physical_delta, reserved_delta, reference_type, reference_id, notes, created_by_user_id)
  values(target_tenant_id, downpipe_product_id, 'purchase_entry', 4, 4, 0, 'purchase_order', purchase_order_id, 'Entrada inicial do ambiente demonstrativo.', actor_profile_id),
        (target_tenant_id, intake_product_id, 'purchase_entry', 8, 8, 0, 'purchase_order', purchase_order_id, 'Entrada inicial do ambiente demonstrativo.', actor_profile_id),
        (target_tenant_id, spark_plug_product_id, 'purchase_entry', 5, 5, 0, 'purchase_order', purchase_order_id, 'Entrada inicial do ambiente demonstrativo.', actor_profile_id);

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after, metadata)
  values(target_tenant_id, actor_profile_id, 'demo.incremental_provisioned', 'tenant', target_tenant_id, jsonb_build_object('scope', 'catalog_inventory_purchases_customers_vehicles', 'visibility', 'super_admin_only'), jsonb_build_object('seedVersion', '20260827-incremental-v1'));
end;
$$;

create or replace function private.platform_provision_incremental_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare target_tenant_id bigint; actor_profile_id uuid := auth.uid(); existing_demo boolean; existing_data boolean;
begin
  perform private.assert_demo_operator();
  if actor_profile_id is null then
    select id into actor_profile_id from public.profiles where platform_role = 'super_admin' order by created_at asc limit 1;
  end if;
  if actor_profile_id is null then raise exception 'Não há Super Admin disponível para auditar o provisionamento.' using errcode = '55000'; end if;
  select id, is_demo into target_tenant_id, existing_demo from public.tenants where slug = 'performance-garage' for update;
  if found and not existing_demo then raise exception 'O slug performance-garage já pertence a uma oficina não demonstrativa.' using errcode = '23505'; end if;
  if not found then
    insert into public.tenants(name, slug, status, active, is_demo, primary_owner_user_id)
    values('Performance Garage', 'performance-garage', 'active', true, true, null)
    returning id into target_tenant_id;
    insert into public.tenant_settings(tenant_id) values(target_tenant_id);
    insert into public.tenant_branding(tenant_id, public_title) values(target_tenant_id, 'Performance Garage');
  end if;
  select exists(select 1 from public.products where tenant_id = target_tenant_id) or exists(select 1 from public.customers where tenant_id = target_tenant_id) into existing_data;
  if existing_data then
    return jsonb_build_object('tenantId', target_tenant_id, 'slug', 'performance-garage', 'created', false, 'alreadyProvisioned', true);
  end if;
  perform private.seed_incremental_demo(target_tenant_id, actor_profile_id);
  return jsonb_build_object('tenantId', target_tenant_id, 'slug', 'performance-garage', 'created', true, 'alreadyProvisioned', false);
end;
$$;

create or replace function private.platform_reset_incremental_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare target_tenant_id bigint; actor_profile_id uuid := auth.uid();
begin
  perform private.assert_demo_operator();
  if actor_profile_id is null then
    select id into actor_profile_id from public.profiles where platform_role = 'super_admin' order by created_at asc limit 1;
  end if;
  if actor_profile_id is null then raise exception 'Não há Super Admin disponível para auditar o reset.' using errcode = '55000'; end if;
  select id into target_tenant_id from public.tenants where slug = 'performance-garage' and is_demo and active for update;
  if not found then raise exception 'A demonstração interna não está provisionada.' using errcode = 'P0002'; end if;
  if exists(select 1 from public.quote_requests where tenant_id = target_tenant_id)
     or exists(select 1 from public.quotes where tenant_id = target_tenant_id)
     or exists(select 1 from public.appointments where tenant_id = target_tenant_id)
     or exists(select 1 from public.work_orders where tenant_id = target_tenant_id)
     or exists(select 1 from public.revenues where tenant_id = target_tenant_id)
     or exists(select 1 from public.expenses where tenant_id = target_tenant_id)
     or exists(select 1 from public.attachments where tenant_id = target_tenant_id) then
    raise exception 'Reset incremental bloqueado: a demonstração contém dados de domínios ainda não migrados.' using errcode = '55000';
  end if;
  delete from public.purchase_order_items where tenant_id = target_tenant_id;
  delete from public.purchase_orders where tenant_id = target_tenant_id;
  delete from public.inventory_movements where tenant_id = target_tenant_id;
  delete from public.inventory_reservations where tenant_id = target_tenant_id;
  delete from public.kit_items where tenant_id = target_tenant_id;
  delete from public.kits where tenant_id = target_tenant_id;
  delete from public.service_products where tenant_id = target_tenant_id;
  delete from public.services where tenant_id = target_tenant_id;
  delete from public.inventory_balances where tenant_id = target_tenant_id;
  delete from public.products where tenant_id = target_tenant_id;
  delete from public.vehicles where tenant_id = target_tenant_id;
  delete from public.customers where tenant_id = target_tenant_id;
  delete from public.suppliers where tenant_id = target_tenant_id;
  delete from public.product_categories where tenant_id = target_tenant_id;
  delete from public.service_categories where tenant_id = target_tenant_id;
  perform private.seed_incremental_demo(target_tenant_id, actor_profile_id);
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values(target_tenant_id, actor_profile_id, 'demo.incremental_reset', 'tenant', target_tenant_id, jsonb_build_object('scope', 'catalog_inventory_purchases_customers_vehicles'));
  return jsonb_build_object('tenantId', target_tenant_id, 'slug', 'performance-garage', 'reset', true);
end;
$$;

create or replace function private.platform_demo_status()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare target_tenant_id bigint; target_active boolean; target_created_at timestamptz;
begin
  perform private.assert_demo_operator();
  select id, active, created_at into target_tenant_id, target_active, target_created_at from public.tenants where slug = 'performance-garage' and is_demo;
  if not found then return jsonb_build_object('exists', false, 'slug', 'performance-garage'); end if;
  return jsonb_build_object('exists', true, 'tenantId', target_tenant_id, 'slug', 'performance-garage', 'name', 'Performance Garage', 'active', target_active, 'createdAt', target_created_at, 'memberCount', (select count(*) from public.tenant_members where tenant_id = target_tenant_id), 'customerCount', (select count(*) from public.customers where tenant_id = target_tenant_id), 'vehicleCount', (select count(*) from public.vehicles where tenant_id = target_tenant_id), 'productCount', (select count(*) from public.products where tenant_id = target_tenant_id), 'serviceCount', (select count(*) from public.services where tenant_id = target_tenant_id), 'kitCount', (select count(*) from public.kits where tenant_id = target_tenant_id), 'purchaseOrderCount', (select count(*) from public.purchase_orders where tenant_id = target_tenant_id));
end;
$$;

create or replace function public.platform_provision_incremental_demo()
returns jsonb language sql security invoker set search_path = '' as $$ select private.platform_provision_incremental_demo() $$;
create or replace function public.platform_reset_incremental_demo()
returns jsonb language sql security invoker set search_path = '' as $$ select private.platform_reset_incremental_demo() $$;
create or replace function public.platform_demo_status()
returns jsonb language sql security invoker set search_path = '' as $$ select private.platform_demo_status() $$;

grant usage on schema private to authenticated;
grant execute on function private.platform_provision_incremental_demo(), private.platform_reset_incremental_demo(), private.platform_demo_status() to authenticated;
revoke all on function private.platform_provision_incremental_demo(), private.platform_reset_incremental_demo(), private.platform_demo_status() from public, anon;
revoke all on function public.platform_provision_incremental_demo(), public.platform_reset_incremental_demo(), public.platform_demo_status() from public, anon;
grant execute on function public.platform_provision_incremental_demo(), public.platform_reset_incremental_demo(), public.platform_demo_status() to authenticated;
