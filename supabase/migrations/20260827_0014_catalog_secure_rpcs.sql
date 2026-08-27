-- Catálogo interno: a API autenticada usa RPCs auditadas para impedir que o cliente
-- consulte colunas de custo diretamente pela API REST com a chave publicável.
revoke all on table public.product_categories, public.service_categories, public.suppliers,
  public.products, public.inventory_balances, public.services, public.service_products,
  public.kits, public.kit_items from anon, authenticated;

create or replace function private.can_catalog_manage(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select private.is_super_admin() or exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = auth.uid()
      and tm.active
      and (
        tm.role in ('owner', 'admin', 'attendant')
        or coalesce(tm.permissions, '[]'::jsonb) ? 'catalog.manage'
      )
  )
$$;

create or replace function private.can_manage_financial_catalog(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select private.is_super_admin() or exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = auth.uid()
      and tm.active
      and (
        tm.role in ('owner', 'admin')
        or (tm.role not in ('attendant', 'technician') and coalesce(tm.permissions, '[]'::jsonb) ? 'financial.manage')
      )
  )
$$;

create or replace function private.assert_catalog_access(target_tenant_id bigint, needs_financial boolean default false)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.can_catalog_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para administrar o catálogo.' using errcode = '42501';
  end if;
  if needs_financial and not private.can_manage_financial_catalog(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para informar ou alterar custo e margem.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.catalog_price(
  target_tenant_id bigint,
  cost_input numeric,
  requested_price_input numeric,
  desired_margin_input numeric,
  fallback_price_input numeric default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  configured_margin numeric := 0;
  configured_markup numeric := 0;
  minimum_margin numeric := 0;
  target_margin numeric := 0;
  policy_price numeric := 0;
  resolved_price numeric := 0;
  gross_margin numeric := 0;
begin
  if cost_input is null or requested_price_input is null or desired_margin_input is null
    or cost_input < 0 or requested_price_input < 0 or desired_margin_input < 0 or desired_margin_input >= 100 then
    raise exception 'Custo, preço ou margem alvo inválidos.' using errcode = '22023';
  end if;
  select coalesce(default_parts_margin_percent, 0), coalesce(default_parts_markup_percent, 0), coalesce(minimum_margin_percent, 0)
    into configured_margin, configured_markup, minimum_margin
    from public.tenant_settings where tenant_id = target_tenant_id;
  target_margin := case when desired_margin_input > 0 then desired_margin_input else coalesce(configured_margin, 0) end;
  policy_price := case when cost_input > 0 then
    case when target_margin > 0 then cost_input / (1 - target_margin / 100)
      else cost_input * (1 + coalesce(configured_markup, 0) / 100) end
    else 0 end;
  resolved_price := round(greatest(requested_price_input, policy_price, coalesce(fallback_price_input, 0)), 2);
  gross_margin := case when resolved_price > 0 then ((resolved_price - cost_input) / resolved_price) * 100 else 0 end;
  if cost_input > 0 and gross_margin < coalesce(minimum_margin, 0) then
    raise exception 'O preço informado não atinge a margem mínima configurada para a oficina.' using errcode = '22023';
  end if;
  return jsonb_build_object('price', resolved_price, 'targetMarginPercent', round(target_margin, 2));
end;
$$;

create or replace function public.workspace_list_catalog_categories(target_tenant_id bigint, category_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare result jsonb;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if category_kind = 'product' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'tenantId', tenant_id, 'name', name, 'description', description, 'createdAt', created_at, 'updatedAt', updated_at) order by name), '[]'::jsonb)
      into result from public.product_categories where tenant_id = target_tenant_id;
  elsif category_kind = 'service' then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'tenantId', tenant_id, 'name', name, 'description', description, 'createdAt', created_at, 'updatedAt', updated_at) order by name), '[]'::jsonb)
      into result from public.service_categories where tenant_id = target_tenant_id;
  else
    raise exception 'Tipo de categoria inválido.' using errcode = '22023';
  end if;
  return result;
end;
$$;

create or replace function public.workspace_create_catalog_category(target_tenant_id bigint, category_kind text, category_name text, category_description text default null)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare created_id bigint;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if length(trim(category_name)) < 2 or length(trim(category_name)) > 120 or length(coalesce(category_description, '')) > 1000 then
    raise exception 'Dados da categoria inválidos.' using errcode = '22023';
  end if;
  if category_kind = 'product' then
    insert into public.product_categories(tenant_id, name, description) values(target_tenant_id, trim(category_name), nullif(trim(category_description), '')) returning id into created_id;
  elsif category_kind = 'service' then
    insert into public.service_categories(tenant_id, name, description) values(target_tenant_id, trim(category_name), nullif(trim(category_description), '')) returning id into created_id;
  else
    raise exception 'Tipo de categoria inválido.' using errcode = '22023';
  end if;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values(target_tenant_id, auth.uid(), category_kind || '_category.created', category_kind || '_category', created_id, jsonb_build_object('name', trim(category_name), 'description', nullif(trim(category_description), '')));
  return created_id;
end;
$$;

create or replace function public.workspace_update_catalog_category(target_tenant_id bigint, category_kind text, target_category_id bigint, category_name text, category_description text default null)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare previous jsonb;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if length(trim(category_name)) < 2 or length(trim(category_name)) > 120 or length(coalesce(category_description, '')) > 1000 then raise exception 'Dados da categoria inválidos.' using errcode = '22023'; end if;
  if category_kind = 'product' then
    select jsonb_build_object('name', name, 'description', description) into previous from public.product_categories where id = target_category_id and tenant_id = target_tenant_id for update;
    if not found then raise exception 'Categoria de produto não encontrada nesta oficina.' using errcode = 'P0002'; end if;
    update public.product_categories set name = trim(category_name), description = nullif(trim(category_description), '') where id = target_category_id and tenant_id = target_tenant_id;
  elsif category_kind = 'service' then
    select jsonb_build_object('name', name, 'description', description) into previous from public.service_categories where id = target_category_id and tenant_id = target_tenant_id for update;
    if not found then raise exception 'Categoria de serviço não encontrada nesta oficina.' using errcode = 'P0002'; end if;
    update public.service_categories set name = trim(category_name), description = nullif(trim(category_description), '') where id = target_category_id and tenant_id = target_tenant_id;
  else raise exception 'Tipo de categoria inválido.' using errcode = '22023'; end if;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after)
  values(target_tenant_id, auth.uid(), category_kind || '_category.updated', category_kind || '_category', target_category_id, previous, jsonb_build_object('name', trim(category_name), 'description', nullif(trim(category_description), '')));
end;
$$;

create or replace function public.workspace_delete_catalog_category(target_tenant_id bigint, category_kind text, target_category_id bigint)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare previous jsonb;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if category_kind = 'product' then
    select jsonb_build_object('name', name, 'description', description) into previous from public.product_categories where id = target_category_id and tenant_id = target_tenant_id for update;
    if not found then raise exception 'Categoria de produto não encontrada nesta oficina.' using errcode = 'P0002'; end if;
    if exists(select 1 from public.products where tenant_id = target_tenant_id and category_id = target_category_id) then raise exception 'Não é possível excluir uma categoria vinculada a produtos.' using errcode = '23503'; end if;
    delete from public.product_categories where id = target_category_id and tenant_id = target_tenant_id;
  elsif category_kind = 'service' then
    select jsonb_build_object('name', name, 'description', description) into previous from public.service_categories where id = target_category_id and tenant_id = target_tenant_id for update;
    if not found then raise exception 'Categoria de serviço não encontrada nesta oficina.' using errcode = 'P0002'; end if;
    if exists(select 1 from public.services where tenant_id = target_tenant_id and category_id = target_category_id) or exists(select 1 from public.kits where tenant_id = target_tenant_id and category_id = target_category_id) then raise exception 'Não é possível excluir uma categoria vinculada a serviços ou kits.' using errcode = '23503'; end if;
    delete from public.service_categories where id = target_category_id and tenant_id = target_tenant_id;
  else raise exception 'Tipo de categoria inválido.' using errcode = '22023'; end if;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before)
  values(target_tenant_id, auth.uid(), category_kind || '_category.deleted', category_kind || '_category', target_category_id, previous);
end;
$$;

create or replace function public.workspace_list_catalog_suppliers(target_tenant_id bigint, query_input text default null, page_input integer default 1, page_size_input integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare result jsonb;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then raise exception 'Paginação inválida.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(row_data order by sort_name), '[]'::jsonb) into result from (
    select s.name as sort_name, jsonb_build_object('id', s.id, 'tenantId', s.tenant_id, 'name', s.name, 'document', s.document, 'contactName', s.contact_name, 'phone', s.phone, 'email', s.email, 'notes', s.notes, 'active', s.active, 'createdAt', s.created_at, 'updatedAt', s.updated_at) row_data
    from public.suppliers s where s.tenant_id = target_tenant_id and (nullif(trim(query_input), '') is null or s.name ilike '%' || trim(query_input) || '%')
    order by s.name offset (page_input - 1) * page_size_input limit page_size_input + 1
  ) rows;
  return result;
end;
$$;

create or replace function public.workspace_create_catalog_supplier(target_tenant_id bigint, supplier_name text, supplier_document text default null, supplier_contact_name text default null, supplier_phone text default null, supplier_email text default null, supplier_notes text default null)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare created_id bigint;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if length(trim(supplier_name)) < 2 or length(trim(supplier_name)) > 180 or length(coalesce(supplier_document, '')) > 32 or length(coalesce(supplier_contact_name, '')) > 160 or length(coalesce(supplier_phone, '')) > 32 or length(coalesce(supplier_notes, '')) > 4000 or (nullif(trim(supplier_email), '') is not null and nullif(trim(supplier_email), '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Dados do fornecedor inválidos.' using errcode = '22023';
  end if;
  insert into public.suppliers(tenant_id, name, document, contact_name, phone, email, notes)
  values(target_tenant_id, trim(supplier_name), nullif(trim(supplier_document), ''), nullif(trim(supplier_contact_name), ''), nullif(trim(supplier_phone), ''), nullif(trim(supplier_email), ''), nullif(trim(supplier_notes), '')) returning id into created_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values(target_tenant_id, auth.uid(), 'supplier.created', 'supplier', created_id, jsonb_build_object('name', trim(supplier_name), 'document', nullif(trim(supplier_document), ''), 'phone', nullif(trim(supplier_phone), '')));
  return created_id;
end;
$$;

create or replace function public.workspace_list_catalog_products(target_tenant_id bigint, query_input text default null, page_input integer default 1, page_size_input integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare result jsonb; include_financial boolean;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then raise exception 'Paginação inválida.' using errcode = '22023'; end if;
  include_financial := private.can_manage_financial_catalog(target_tenant_id);
  select coalesce(jsonb_agg(row_data order by sort_name), '[]'::jsonb) into result from (
    select p.name as sort_name,
      jsonb_build_object('id', p.id, 'tenantId', p.tenant_id, 'categoryId', p.category_id, 'supplierId', p.supplier_id, 'name', p.name, 'sku', p.sku, 'brand', p.brand, 'unit', p.unit, 'salePrice', p.sale_price, 'minStock', p.min_stock, 'maxStock', p.max_stock, 'location', p.location, 'barcode', p.barcode, 'imageUrl', p.image_url, 'description', p.description, 'active', p.active, 'physicalQuantity', coalesce(b.physical_quantity, 0), 'reservedQuantity', coalesce(b.reserved_quantity, 0), 'availableQuantity', coalesce(b.physical_quantity, 0) - coalesce(b.reserved_quantity, 0), 'categoryName', c.name, 'createdAt', p.created_at, 'updatedAt', p.updated_at)
      || case when include_financial then jsonb_build_object('currentCost', p.current_cost, 'averageCost', p.average_cost, 'desiredMarginPercent', p.desired_margin_percent) else '{}'::jsonb end as row_data
    from public.products p left join public.inventory_balances b on b.tenant_id = p.tenant_id and b.product_id = p.id left join public.product_categories c on c.id = p.category_id and c.tenant_id = p.tenant_id
    where p.tenant_id = target_tenant_id and (nullif(trim(query_input), '') is null or p.name ilike '%' || trim(query_input) || '%' or coalesce(p.sku, '') ilike '%' || trim(query_input) || '%')
    order by p.name offset (page_input - 1) * page_size_input limit page_size_input + 1
  ) rows;
  return result;
end;
$$;

create or replace function public.workspace_create_catalog_product(target_tenant_id bigint, category_id_input bigint, supplier_id_input bigint, product_name text, product_sku text, product_brand text, product_unit text, current_cost_input numeric, sale_price_input numeric, desired_margin_input numeric, min_stock_input numeric, max_stock_input numeric, product_location text, product_barcode text, product_description text)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare created_id bigint; pricing jsonb;
begin
  perform private.assert_catalog_access(target_tenant_id, coalesce(current_cost_input, 0) > 0 or coalesce(desired_margin_input, 0) > 0);
  if length(trim(product_name)) < 2 or length(trim(product_name)) > 180 or length(trim(coalesce(product_unit, ''))) < 1 or length(trim(product_unit)) > 16 or length(coalesce(product_sku, '')) > 96 or length(coalesce(product_brand, '')) > 100 or length(coalesce(product_location, '')) > 120 or length(coalesce(product_barcode, '')) > 96 or length(coalesce(product_description, '')) > 4000 or min_stock_input < 0 or (max_stock_input is not null and (max_stock_input < 0 or max_stock_input < min_stock_input)) then raise exception 'Dados do produto inválidos.' using errcode = '22023'; end if;
  if category_id_input is not null and not exists(select 1 from public.product_categories where id = category_id_input and tenant_id = target_tenant_id) then raise exception 'A categoria não pertence a esta oficina.' using errcode = '22023'; end if;
  if supplier_id_input is not null and not exists(select 1 from public.suppliers where id = supplier_id_input and tenant_id = target_tenant_id) then raise exception 'O fornecedor não pertence a esta oficina.' using errcode = '22023'; end if;
  pricing := private.catalog_price(target_tenant_id, coalesce(current_cost_input, 0), coalesce(sale_price_input, 0), coalesce(desired_margin_input, 0));
  insert into public.products(tenant_id, category_id, supplier_id, name, sku, brand, unit, current_cost, average_cost, sale_price, desired_margin_percent, min_stock, max_stock, location, barcode, description)
  values(target_tenant_id, category_id_input, supplier_id_input, trim(product_name), nullif(trim(product_sku), ''), nullif(trim(product_brand), ''), trim(product_unit), coalesce(current_cost_input, 0), coalesce(current_cost_input, 0), (pricing->>'price')::numeric, (pricing->>'targetMarginPercent')::numeric, min_stock_input, max_stock_input, nullif(trim(product_location), ''), nullif(trim(product_barcode), ''), nullif(trim(product_description), '')) returning id into created_id;
  insert into public.inventory_balances(tenant_id, product_id) values(target_tenant_id, created_id);
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values(target_tenant_id, auth.uid(), 'product.created', 'product', created_id, jsonb_build_object('name', trim(product_name), 'sku', nullif(trim(product_sku), ''), 'categoryId', category_id_input, 'supplierId', supplier_id_input, 'currentCost', coalesce(current_cost_input, 0), 'salePrice', (pricing->>'price')::numeric, 'desiredMarginPercent', (pricing->>'targetMarginPercent')::numeric));
  return created_id;
end;
$$;

create or replace function public.workspace_update_catalog_product_financial(target_tenant_id bigint, target_product_id bigint, current_cost_input numeric, sale_price_input numeric, desired_margin_input numeric, expected_updated_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare previous jsonb; pricing jsonb; actual_updated_at timestamptz;
begin
  perform private.assert_catalog_access(target_tenant_id, true);
  select jsonb_build_object('currentCost', current_cost, 'salePrice', sale_price, 'desiredMarginPercent', desired_margin_percent), updated_at into previous, actual_updated_at from public.products where id = target_product_id and tenant_id = target_tenant_id for update;
  if not found then raise exception 'Produto não encontrado nesta oficina.' using errcode = 'P0002'; end if;
  if expected_updated_at is not null and actual_updated_at <> expected_updated_at then raise exception 'Os valores financeiros foram alterados por outro usuário. Atualize o catálogo e tente novamente.' using errcode = '40001'; end if;
  pricing := private.catalog_price(target_tenant_id, current_cost_input, sale_price_input, desired_margin_input);
  update public.products set current_cost = current_cost_input, sale_price = (pricing->>'price')::numeric, desired_margin_percent = (pricing->>'targetMarginPercent')::numeric where id = target_product_id and tenant_id = target_tenant_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after) values(target_tenant_id, auth.uid(), 'product.financial_updated', 'product', target_product_id, previous, jsonb_build_object('currentCost', current_cost_input, 'salePrice', (pricing->>'price')::numeric, 'desiredMarginPercent', (pricing->>'targetMarginPercent')::numeric));
end;
$$;

create or replace function public.workspace_list_catalog_services(target_tenant_id bigint, query_input text default null, page_input integer default 1, page_size_input integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare result jsonb; include_financial boolean;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then raise exception 'Paginação inválida.' using errcode = '22023'; end if;
  include_financial := private.can_manage_financial_catalog(target_tenant_id);
  select coalesce(jsonb_agg(row_data order by sort_name), '[]'::jsonb) into result from (
    select s.name as sort_name, jsonb_build_object('id', s.id, 'tenantId', s.tenant_id, 'categoryId', s.category_id, 'name', s.name, 'description', s.description, 'estimatedMinutes', s.estimated_minutes, 'laborPrice', s.labor_price, 'quoteQuestions', s.quote_questions, 'active', s.active, 'categoryName', c.name, 'createdAt', s.created_at, 'updatedAt', s.updated_at) || case when include_financial then jsonb_build_object('estimatedCost', s.estimated_cost, 'desiredMarginPercent', s.desired_margin_percent) else '{}'::jsonb end as row_data from public.services s left join public.service_categories c on c.id = s.category_id and c.tenant_id = s.tenant_id where s.tenant_id = target_tenant_id and (nullif(trim(query_input), '') is null or s.name ilike '%' || trim(query_input) || '%') order by s.name offset (page_input - 1) * page_size_input limit page_size_input + 1
  ) rows;
  return result;
end;
$$;

create or replace function public.workspace_create_catalog_service(target_tenant_id bigint, category_id_input bigint, service_name text, service_description text, estimated_minutes_input integer, labor_price_input numeric, estimated_cost_input numeric, desired_margin_input numeric, quote_questions_input jsonb default null)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare created_id bigint; pricing jsonb; labor_floor numeric := 0;
begin
  perform private.assert_catalog_access(target_tenant_id, coalesce(estimated_cost_input, 0) > 0 or coalesce(desired_margin_input, 0) > 0);
  if length(trim(service_name)) < 2 or length(trim(service_name)) > 180 or length(coalesce(service_description, '')) > 4000 or estimated_minutes_input < 5 or estimated_minutes_input > 1440 or coalesce(estimated_cost_input, 0) < 0 or coalesce(labor_price_input, 0) < 0 or coalesce(desired_margin_input, 0) < 0 or coalesce(desired_margin_input, 0) >= 100 or (quote_questions_input is not null and jsonb_typeof(quote_questions_input) <> 'array') then raise exception 'Dados do serviço inválidos.' using errcode = '22023'; end if;
  if category_id_input is not null and not exists(select 1 from public.service_categories where id = category_id_input and tenant_id = target_tenant_id) then raise exception 'A categoria não pertence a esta oficina.' using errcode = '22023'; end if;
  select coalesce(default_labor_hourly_rate, 0) * estimated_minutes_input / 60 into labor_floor from public.tenant_settings where tenant_id = target_tenant_id;
  pricing := private.catalog_price(target_tenant_id, coalesce(estimated_cost_input, 0), coalesce(labor_price_input, 0), coalesce(desired_margin_input, 0), coalesce(labor_floor, 0));
  insert into public.services(tenant_id, category_id, name, description, estimated_minutes, labor_price, estimated_cost, desired_margin_percent, quote_questions) values(target_tenant_id, category_id_input, trim(service_name), nullif(trim(service_description), ''), estimated_minutes_input, (pricing->>'price')::numeric, coalesce(estimated_cost_input, 0), (pricing->>'targetMarginPercent')::numeric, quote_questions_input) returning id into created_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after) values(target_tenant_id, auth.uid(), 'service.created', 'service', created_id, jsonb_build_object('name', trim(service_name), 'categoryId', category_id_input, 'estimatedMinutes', estimated_minutes_input, 'laborPrice', (pricing->>'price')::numeric, 'estimatedCost', coalesce(estimated_cost_input, 0), 'desiredMarginPercent', (pricing->>'targetMarginPercent')::numeric));
  return created_id;
end;
$$;

create or replace function public.workspace_update_catalog_service_financial(target_tenant_id bigint, target_service_id bigint, labor_price_input numeric, estimated_cost_input numeric, desired_margin_input numeric, expected_updated_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare previous jsonb; pricing jsonb; actual_updated_at timestamptz;
begin
  perform private.assert_catalog_access(target_tenant_id, true);
  select jsonb_build_object('laborPrice', labor_price, 'estimatedCost', estimated_cost, 'desiredMarginPercent', desired_margin_percent), updated_at into previous, actual_updated_at from public.services where id = target_service_id and tenant_id = target_tenant_id for update;
  if not found then raise exception 'Serviço não encontrado nesta oficina.' using errcode = 'P0002'; end if;
  if expected_updated_at is not null and actual_updated_at <> expected_updated_at then raise exception 'Os valores financeiros foram alterados por outro usuário. Atualize o catálogo e tente novamente.' using errcode = '40001'; end if;
  pricing := private.catalog_price(target_tenant_id, estimated_cost_input, labor_price_input, desired_margin_input);
  update public.services set labor_price = (pricing->>'price')::numeric, estimated_cost = estimated_cost_input, desired_margin_percent = (pricing->>'targetMarginPercent')::numeric where id = target_service_id and tenant_id = target_tenant_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after) values(target_tenant_id, auth.uid(), 'service.financial_updated', 'service', target_service_id, previous, jsonb_build_object('laborPrice', (pricing->>'price')::numeric, 'estimatedCost', estimated_cost_input, 'desiredMarginPercent', (pricing->>'targetMarginPercent')::numeric));
end;
$$;

create or replace function public.workspace_set_catalog_service_products(target_tenant_id bigint, target_service_id bigint, items_input jsonb)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare previous jsonb; item jsonb; item_product_id bigint; item_quantity numeric; item_required boolean;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if jsonb_typeof(items_input) <> 'array' or jsonb_array_length(items_input) < 1 or jsonb_array_length(items_input) > 100 then raise exception 'Composição de serviço inválida.' using errcode = '22023'; end if;
  if not exists(select 1 from public.services where id = target_service_id and tenant_id = target_tenant_id) then raise exception 'Serviço não encontrado nesta oficina.' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('productId', product_id, 'quantity', quantity, 'required', required) order by id), '[]'::jsonb) into previous from public.service_products where tenant_id = target_tenant_id and service_id = target_service_id;
  for item in select value from jsonb_array_elements(items_input) loop
    item_product_id := nullif(item->>'productId', '')::bigint; item_quantity := nullif(item->>'quantity', '')::numeric; item_required := coalesce((item->>'required')::boolean, true);
    if item_product_id is null or item_quantity is null or item_quantity <= 0 or not exists(select 1 from public.products where id = item_product_id and tenant_id = target_tenant_id) then raise exception 'Um ou mais produtos não pertencem a esta oficina.' using errcode = '22023'; end if;
  end loop;
  delete from public.service_products where tenant_id = target_tenant_id and service_id = target_service_id;
  for item in select value from jsonb_array_elements(items_input) loop
    insert into public.service_products(tenant_id, service_id, product_id, quantity, required) values(target_tenant_id, target_service_id, (item->>'productId')::bigint, (item->>'quantity')::numeric, coalesce((item->>'required')::boolean, true));
  end loop;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after) values(target_tenant_id, auth.uid(), 'service.products_updated', 'service', target_service_id, jsonb_build_object('items', previous), jsonb_build_object('items', items_input));
end;
$$;

create or replace function public.workspace_list_catalog_kits(target_tenant_id bigint, query_input text default null, page_input integer default 1, page_size_input integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare result jsonb;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then raise exception 'Paginação inválida.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(row_data order by sort_name), '[]'::jsonb) into result from (select k.name sort_name, jsonb_build_object('id', k.id, 'tenantId', k.tenant_id, 'categoryId', k.category_id, 'name', k.name, 'description', k.description, 'salePriceOverride', k.sale_price_override, 'active', k.active, 'createdAt', k.created_at, 'updatedAt', k.updated_at) row_data from public.kits k where k.tenant_id = target_tenant_id and (nullif(trim(query_input), '') is null or k.name ilike '%' || trim(query_input) || '%') order by k.name offset (page_input - 1) * page_size_input limit page_size_input + 1) rows;
  return result;
end;
$$;

create or replace function public.workspace_create_catalog_kit(target_tenant_id bigint, category_id_input bigint, kit_name text, kit_description text, sale_price_override_input numeric, items_input jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare created_id bigint; item jsonb; product_ref bigint; service_ref bigint; quantity_ref numeric;
begin
  perform private.assert_catalog_access(target_tenant_id);
  if length(trim(kit_name)) < 2 or length(trim(kit_name)) > 180 or length(coalesce(kit_description, '')) > 4000 or coalesce(sale_price_override_input, 0) < 0 or jsonb_typeof(items_input) <> 'array' or jsonb_array_length(items_input) < 1 or jsonb_array_length(items_input) > 100 then raise exception 'Dados do kit inválidos.' using errcode = '22023'; end if;
  if category_id_input is not null and not exists(select 1 from public.service_categories where id = category_id_input and tenant_id = target_tenant_id) then raise exception 'A categoria não pertence a esta oficina.' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(items_input) loop
    product_ref := nullif(item->>'productId', '')::bigint; service_ref := nullif(item->>'serviceId', '')::bigint; quantity_ref := nullif(item->>'quantity', '')::numeric;
    if quantity_ref is null or quantity_ref <= 0 or (product_ref is null and service_ref is null) or (product_ref is not null and service_ref is not null) then raise exception 'Cada item do kit deve ser um produto ou serviço com quantidade positiva.' using errcode = '22023'; end if;
    if product_ref is not null and not exists(select 1 from public.products where id = product_ref and tenant_id = target_tenant_id) then raise exception 'O kit possui produto de outra oficina.' using errcode = '22023'; end if;
    if service_ref is not null and not exists(select 1 from public.services where id = service_ref and tenant_id = target_tenant_id) then raise exception 'O kit possui serviço de outra oficina.' using errcode = '22023'; end if;
  end loop;
  insert into public.kits(tenant_id, category_id, name, description, sale_price_override) values(target_tenant_id, category_id_input, trim(kit_name), nullif(trim(kit_description), ''), sale_price_override_input) returning id into created_id;
  for item in select value from jsonb_array_elements(items_input) loop
    insert into public.kit_items(tenant_id, kit_id, product_id, service_id, quantity) values(target_tenant_id, created_id, nullif(item->>'productId', '')::bigint, nullif(item->>'serviceId', '')::bigint, (item->>'quantity')::numeric);
  end loop;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after) values(target_tenant_id, auth.uid(), 'kit.created', 'kit', created_id, jsonb_build_object('name', trim(kit_name), 'categoryId', category_id_input, 'salePriceOverride', sale_price_override_input, 'items', items_input));
  return created_id;
end;
$$;

revoke all on function public.workspace_list_catalog_categories(bigint, text), public.workspace_create_catalog_category(bigint, text, text, text), public.workspace_update_catalog_category(bigint, text, bigint, text, text), public.workspace_delete_catalog_category(bigint, text, bigint), public.workspace_list_catalog_suppliers(bigint, text, integer, integer), public.workspace_create_catalog_supplier(bigint, text, text, text, text, text, text), public.workspace_list_catalog_products(bigint, text, integer, integer), public.workspace_create_catalog_product(bigint, bigint, bigint, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, text), public.workspace_update_catalog_product_financial(bigint, bigint, numeric, numeric, numeric, timestamptz), public.workspace_list_catalog_services(bigint, text, integer, integer), public.workspace_create_catalog_service(bigint, bigint, text, text, integer, numeric, numeric, numeric, jsonb), public.workspace_update_catalog_service_financial(bigint, bigint, numeric, numeric, numeric, timestamptz), public.workspace_set_catalog_service_products(bigint, bigint, jsonb), public.workspace_list_catalog_kits(bigint, text, integer, integer), public.workspace_create_catalog_kit(bigint, bigint, text, text, numeric, jsonb) from public, anon;
grant execute on function public.workspace_list_catalog_categories(bigint, text), public.workspace_create_catalog_category(bigint, text, text, text), public.workspace_update_catalog_category(bigint, text, bigint, text, text), public.workspace_delete_catalog_category(bigint, text, bigint), public.workspace_list_catalog_suppliers(bigint, text, integer, integer), public.workspace_create_catalog_supplier(bigint, text, text, text, text, text, text), public.workspace_list_catalog_products(bigint, text, integer, integer), public.workspace_create_catalog_product(bigint, bigint, bigint, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, text), public.workspace_update_catalog_product_financial(bigint, bigint, numeric, numeric, numeric, timestamptz), public.workspace_list_catalog_services(bigint, text, integer, integer), public.workspace_create_catalog_service(bigint, bigint, text, text, integer, numeric, numeric, numeric, jsonb), public.workspace_update_catalog_service_financial(bigint, bigint, numeric, numeric, numeric, timestamptz), public.workspace_set_catalog_service_products(bigint, bigint, jsonb), public.workspace_list_catalog_kits(bigint, text, integer, integer), public.workspace_create_catalog_kit(bigint, bigint, text, text, numeric, jsonb) to authenticated;

comment on function public.workspace_list_catalog_products(bigint, text, integer, integer) is 'Catálogo interno autenticado; SECURITY DEFINER por proteção de colunas financeiras, com autorização por tenant e search_path fixo.';
comment on function public.workspace_list_catalog_services(bigint, text, integer, integer) is 'Catálogo interno autenticado; SECURITY DEFINER por proteção de colunas financeiras, com autorização por tenant e search_path fixo.';
