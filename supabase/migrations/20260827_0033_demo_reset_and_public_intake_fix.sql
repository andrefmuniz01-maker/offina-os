-- Corrige o reset idempotente e o intake interno do único preview público da Demo.

create or replace function private.clear_full_demo(p_tenant_id bigint)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.is_demo) then
    raise exception 'A limpeza só pode ser executada no tenant demonstrativo.' using errcode = '42501';
  end if;

  delete from public.notification_preferences where tenant_id = p_tenant_id;
  delete from public.notifications where tenant_id = p_tenant_id;
  delete from public.attachments where tenant_id = p_tenant_id;
  delete from public.work_order_items where tenant_id = p_tenant_id;
  delete from public.work_order_notes where tenant_id = p_tenant_id;
  delete from public.work_order_checklists where tenant_id = p_tenant_id;
  delete from public.work_order_consumption where tenant_id = p_tenant_id;
  delete from public.inventory_reservations where tenant_id = p_tenant_id;
  delete from public.quote_events where tenant_id = p_tenant_id;
  delete from public.quote_items where tenant_id = p_tenant_id;
  delete from public.quote_request_events where tenant_id = p_tenant_id;
  delete from public.revenues where tenant_id = p_tenant_id;
  delete from public.expenses where tenant_id = p_tenant_id;

  -- A agenda e a OS possuem FKs em ambas as direções.
  update public.appointments set work_order_id = null where tenant_id = p_tenant_id;
  update public.work_orders set appointment_id = null where tenant_id = p_tenant_id;
  delete from public.work_orders where tenant_id = p_tenant_id;
  delete from public.appointments where tenant_id = p_tenant_id;

  delete from public.quotes where tenant_id = p_tenant_id;
  delete from public.quote_requests where tenant_id = p_tenant_id;
  delete from public.purchase_order_items where tenant_id = p_tenant_id;
  delete from public.purchase_orders where tenant_id = p_tenant_id;
  delete from public.inventory_movements where tenant_id = p_tenant_id;
  delete from public.inventory_balances where tenant_id = p_tenant_id;
  delete from public.kit_items where tenant_id = p_tenant_id;
  delete from public.kits where tenant_id = p_tenant_id;
  delete from public.service_products where tenant_id = p_tenant_id;
  delete from public.services where tenant_id = p_tenant_id;
  delete from public.products where tenant_id = p_tenant_id;
  delete from public.vehicles where tenant_id = p_tenant_id;
  delete from public.customers where tenant_id = p_tenant_id;
  delete from public.suppliers where tenant_id = p_tenant_id;
  delete from public.product_categories where tenant_id = p_tenant_id;
  delete from public.service_categories where tenant_id = p_tenant_id;
  delete from public.scheduled_tasks where tenant_id = p_tenant_id;
  delete from public.audit_logs where tenant_id = p_tenant_id;
end;
$$;

create or replace function private.internal_submit_public_quote_request(
  target_tenant_slug text,
  requester_name_input text,
  requester_whatsapp_input text,
  requester_email_input text,
  vehicle_make_input text,
  vehicle_model_input text,
  vehicle_model_year_input integer,
  vehicle_plate_input text,
  vehicle_mileage_input integer,
  selected_service_id bigint,
  service_label_input text,
  description_input text,
  answers_input jsonb,
  attachment_count_input integer,
  source_ip_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_tenant_id bigint;
  normalized_whatsapp text;
  created_request_id bigint;
  created_request_number integer;
  upload_token text;
begin
  perform private.assert_internal_public_intake_caller();

  select id into target_tenant_id
  from public.tenants
  where slug = trim(lower(target_tenant_slug))
    and active
    and status = 'active'
    and (not is_demo or slug = 'performance-garage');
  if not found then
    raise exception 'A oficina solicitada não está disponível.' using errcode = 'P0002';
  end if;

  normalized_whatsapp := regexp_replace(trim(requester_whatsapp_input), '\\D', '', 'g');
  perform private.assert_public_intake_throttle(target_tenant_id, normalized_whatsapp, source_ip_fingerprint);

  select request_id, request_number into created_request_id, created_request_number
  from public.public_submit_quote_request(
    target_tenant_slug,
    requester_name_input,
    normalized_whatsapp,
    requester_email_input,
    vehicle_make_input,
    vehicle_model_input,
    vehicle_model_year_input,
    vehicle_plate_input,
    vehicle_mileage_input,
    selected_service_id,
    service_label_input,
    description_input,
    answers_input
  );

  upload_token := private.create_public_quote_upload_capability(target_tenant_id, created_request_id, attachment_count_input);
  insert into public.audit_logs(tenant_id, action, entity_type, entity_id, metadata)
  values(target_tenant_id, 'quote_request.public_intake_submitted', 'quote_request', created_request_id, jsonb_build_object('attachmentsRequested', attachment_count_input, 'source', 'public_link'));

  return jsonb_build_object('requestNumber', created_request_number, 'uploadCapability', upload_token);
end;
$$;
