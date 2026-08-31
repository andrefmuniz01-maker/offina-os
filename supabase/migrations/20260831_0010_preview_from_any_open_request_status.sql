-- A tela de confirmação do clique único precisa mostrar uma prévia (itens
-- sugeridos, cliente, veículo, total) para qualquer solicitação ainda não
-- enviada ao cliente, não só as que já foram manualmente movidas para
-- "em orçamento". Alinha a checagem de status com a mesma faixa aceita por
-- private.internal_generate_and_send_quote.
create or replace function private.internal_prepare_quote_from_request(target_tenant_id bigint, target_request_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  request_row public.quote_requests%rowtype;
  customer_row public.customers%rowtype;
  vehicle_row public.vehicles%rowtype;
  service_row public.services%rowtype;
  product_items jsonb;
  parts_subtotal numeric(12, 2);
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso à preparação de orçamento desta oficina.' using errcode = '42501';
  end if;

  select * into request_row
  from public.quote_requests
  where id = target_request_id and tenant_id = target_tenant_id;
  if not found then
    raise exception 'Solicitação não encontrada nesta oficina.' using errcode = 'P0002';
  end if;

  if request_row.status not in ('new', 'in_analysis', 'awaiting_information', 'in_quoting', 'ready') then
    raise exception 'Esta solicitação já foi enviada ao cliente.' using errcode = '22023';
  end if;
  if request_row.customer_id is null or request_row.vehicle_id is null or request_row.service_id is null then
    raise exception 'A solicitação não possui cliente, veículo e serviço vinculados para preparar o orçamento.' using errcode = '22023';
  end if;

  select * into customer_row
  from public.customers
  where id = request_row.customer_id and tenant_id = target_tenant_id and active;
  if not found then
    raise exception 'O cliente vinculado à solicitação não está disponível nesta oficina.' using errcode = '22023';
  end if;

  select * into vehicle_row
  from public.vehicles
  where id = request_row.vehicle_id
    and tenant_id = target_tenant_id
    and customer_id = customer_row.id;
  if not found then
    raise exception 'O veículo vinculado à solicitação não pertence ao cliente desta oficina.' using errcode = '22023';
  end if;

  select * into service_row
  from public.services
  where id = request_row.service_id and tenant_id = target_tenant_id and active;
  if not found then
    raise exception 'O serviço vinculado à solicitação não está disponível no catálogo desta oficina.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'itemType', 'product',
    'productId', p.id,
    'serviceId', null,
    'description', p.name,
    'quantity', sp.quantity,
    'unitPrice', p.sale_price,
    'availability', case
      when coalesce(balance.physical_quantity, 0) - coalesce(balance.reserved_quantity, 0) >= sp.quantity then 'available'
      when coalesce(balance.physical_quantity, 0) - coalesce(balance.reserved_quantity, 0) > 0 then 'insufficient'
      else 'unavailable'
    end
  ) order by p.name asc, sp.id asc), '[]'::jsonb),
  coalesce(sum(sp.quantity * p.sale_price), 0)
  into product_items, parts_subtotal
  from public.service_products sp
  join public.products p on p.id = sp.product_id and p.tenant_id = target_tenant_id and p.active
  left join public.inventory_balances balance on balance.tenant_id = target_tenant_id and balance.product_id = p.id
  where sp.tenant_id = target_tenant_id and sp.service_id = service_row.id;

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', request_row.id,
      'tenantId', request_row.tenant_id,
      'number', request_row.number,
      'status', request_row.status,
      'serviceLabel', request_row.service_label,
      'description', request_row.description,
      'createdAt', request_row.created_at
    ),
    'customer', jsonb_build_object(
      'id', customer_row.id,
      'name', customer_row.name,
      'whatsapp', customer_row.whatsapp,
      'email', customer_row.email
    ),
    'vehicle', jsonb_build_object(
      'id', vehicle_row.id,
      'make', vehicle_row.make,
      'model', vehicle_row.model,
      'modelYear', vehicle_row.model_year,
      'manufactureYear', vehicle_row.manufacture_year,
      'plate', vehicle_row.plate,
      'mileage', vehicle_row.mileage,
      'engine', vehicle_row.engine,
      'notes', vehicle_row.notes
    ),
    'service', jsonb_build_object(
      'id', service_row.id,
      'name', service_row.name,
      'description', service_row.description,
      'estimatedMinutes', service_row.estimated_minutes,
      'laborPrice', service_row.labor_price
    ),
    'suggestedItems', jsonb_build_array(jsonb_build_object(
      'itemType', 'service',
      'productId', null,
      'serviceId', service_row.id,
      'description', service_row.name,
      'quantity', 1,
      'unitPrice', service_row.labor_price,
      'availability', 'not_applicable'
    )) || product_items,
    'subtotal', service_row.labor_price + parts_subtotal,
    'total', service_row.labor_price + parts_subtotal
  );
end;
$function$;
