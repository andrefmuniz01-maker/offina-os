-- RPCs tenant-scoped para relatórios, notificações, auditoria e configurações.

create or replace function public.workspace_dashboard_report(target_tenant_id bigint, reference_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  period_start timestamptz := date_trunc('month', reference_at);
  period_end timestamptz := date_trunc('month', reference_at) + interval '1 month';
  billing numeric := 0;
  expected_revenue numeric := 0;
  expenses_total numeric := 0;
  completed_orders integer := 0;
  quote_count integer := 0;
  approved_quotes integer := 0;
  pending_quote_value numeric := 0;
  pending_quote_count integer := 0;
  scheduled_count integer := 0;
  in_progress_count integer := 0;
  yard_count integer := 0;
  critical_count integer := 0;
  reserved_products_count integer := 0;
  payload jsonb;
begin
  if not private.is_active_member(target_tenant_id) then raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501'; end if;
  select coalesce(sum(amount), 0) into billing from public.revenues where tenant_id = target_tenant_id and status = 'received' and received_at >= period_start and received_at < period_end;
  select coalesce(sum(amount), 0) into expected_revenue from public.revenues where tenant_id = target_tenant_id and status = 'expected';
  select count(*) into completed_orders from public.work_orders where tenant_id = target_tenant_id and status in ('completed', 'delivered') and coalesce(completed_at, delivered_at) >= period_start and coalesce(completed_at, delivered_at) < period_end;
  select count(*), count(*) filter (where status = 'approved') into quote_count, approved_quotes from public.quotes where tenant_id = target_tenant_id and created_at >= period_start and created_at < period_end;
  select coalesce(sum(total), 0), count(*) into pending_quote_value, pending_quote_count from public.quotes where tenant_id = target_tenant_id and status in ('ready', 'sent', 'viewed');
  select count(*) filter (where status in ('scheduled', 'confirmed')) into scheduled_count from public.appointments where tenant_id = target_tenant_id;
  select count(*) into in_progress_count from public.work_orders where tenant_id = target_tenant_id and status = 'in_service';
  select count(*) into yard_count from public.work_orders where tenant_id = target_tenant_id and status in ('received', 'diagnosis', 'awaiting_approval', 'awaiting_part', 'in_service');
  select count(*) filter (where ib.physical_quantity - ib.reserved_quantity <= p.min_stock), count(*) filter (where ib.reserved_quantity > 0) into critical_count, reserved_products_count from public.inventory_balances ib join public.products p on p.id = ib.product_id and p.tenant_id = ib.tenant_id where ib.tenant_id = target_tenant_id;
  payload := jsonb_build_object(
    'sales', jsonb_build_object('billing', billing, 'expectedRevenue', expected_revenue, 'averageTicket', case when completed_orders > 0 then billing / completed_orders else 0 end, 'completedOrders', completed_orders, 'quoteApprovalRate', case when quote_count > 0 then approved_quotes::numeric / quote_count else 0 end),
    'commercial', jsonb_build_object('pendingQuoteValue', pending_quote_value, 'pendingQuoteCount', pending_quote_count),
    'operation', jsonb_build_object('scheduled', scheduled_count, 'inProgress', in_progress_count, 'yard', yard_count),
    'inventory', jsonb_build_object('critical', critical_count, 'reservedProducts', reserved_products_count)
  );
  if private.can_view_financial(target_tenant_id) then
    select coalesce(sum(amount), 0) into expenses_total from public.expenses where tenant_id = target_tenant_id and status = 'paid' and expense_date >= period_start and expense_date < period_end;
    payload := payload || jsonb_build_object('finance', jsonb_build_object('expenses', expenses_total, 'estimatedOperationalResult', billing - expenses_total));
  end if;
  return payload;
end;
$$;

create or replace function public.workspace_notification_preferences(target_tenant_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare row_data public.notification_preferences%rowtype;
begin
  if not private.is_active_member(target_tenant_id) then raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501'; end if;
  select * into row_data from public.notification_preferences np where np.tenant_id = target_tenant_id and np.user_id = auth.uid() limit 1;
  return jsonb_build_object('inAppEnabled', coalesce(row_data.in_app_enabled, true), 'emailEnabled', coalesce(row_data.email_enabled, false), 'enabledTypes', coalesce(row_data.enabled_types, '[]'::jsonb));
end;
$$;

create or replace function public.workspace_update_notification_preferences(target_tenant_id bigint, in_app_enabled_input boolean, enabled_types_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if not private.is_active_member(target_tenant_id) then raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501'; end if;
  if jsonb_typeof(enabled_types_input) <> 'array' then raise exception 'Tipos de notificação inválidos.' using errcode = '22023'; end if;
  insert into public.notification_preferences(tenant_id, user_id, in_app_enabled, email_enabled, enabled_types)
  values(target_tenant_id, auth.uid(), coalesce(in_app_enabled_input, true), false, enabled_types_input)
  on conflict (tenant_id, user_id) do update set in_app_enabled = excluded.in_app_enabled, enabled_types = excluded.enabled_types, updated_at = now();
  return public.workspace_notification_preferences(target_tenant_id);
end;
$$;

create or replace function public.workspace_list_notifications(target_tenant_id bigint, page_input integer default 1, page_size_input integer default 15)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  total_count integer;
  items_payload jsonb;
begin
  if not private.is_active_member(target_tenant_id) then raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501'; end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then raise exception 'Paginação inválida.' using errcode = '22023'; end if;
  select count(*) into total_count from public.notifications n where n.tenant_id = target_tenant_id and (n.user_id = auth.uid() or n.user_id is null);
  select coalesce(jsonb_agg(jsonb_build_object(
    'notification', jsonb_build_object('id', listed.id, 'tenantId', listed.tenant_id, 'userId', listed.user_id, 'customerId', listed.customer_id, 'vehicleId', listed.vehicle_id, 'workOrderId', listed.work_order_id, 'type', listed.type, 'title', listed.title, 'body', listed.body, 'link', listed.link, 'readAt', listed.read_at, 'createdAt', listed.created_at),
    'customer', case when listed.customer_id is null then null else jsonb_build_object('id', listed.customer_id, 'name', listed.customer_name) end,
    'vehicle', case when listed.vehicle_id is null then null else jsonb_build_object('id', listed.vehicle_id, 'make', listed.vehicle_make, 'model', listed.vehicle_model, 'plate', listed.vehicle_plate) end
  ) order by listed.created_at desc, listed.id desc), '[]'::jsonb) into items_payload
  from (
    select n.id, n.tenant_id, n.user_id, n.customer_id, n.vehicle_id, n.work_order_id, n.type, n.title, n.body, n.link, n.read_at, n.created_at,
      c.name as customer_name, v.make as vehicle_make, v.model as vehicle_model, v.plate as vehicle_plate
    from public.notifications n
    left join public.customers c on c.id = n.customer_id and c.tenant_id = n.tenant_id
    left join public.vehicles v on v.id = n.vehicle_id and v.tenant_id = n.tenant_id
    where n.tenant_id = target_tenant_id and (n.user_id = auth.uid() or n.user_id is null)
    order by n.created_at desc, n.id desc offset (page_input - 1) * page_size_input limit page_size_input
  ) listed;
  return jsonb_build_object('items', items_payload, 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

create or replace function public.workspace_mark_notification_read(target_tenant_id bigint, target_notification_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare updated_count integer;
begin
  if not private.is_active_member(target_tenant_id) then raise exception 'Você não possui acesso a esta oficina.' using errcode = '42501'; end if;
  update public.notifications set read_at = coalesce(read_at, now()) where id = target_notification_id and tenant_id = target_tenant_id and (user_id = auth.uid() or user_id is null);
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'Notificação não encontrada nesta oficina.' using errcode = 'P0002'; end if;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.workspace_list_audit_logs(target_tenant_id bigint, search_input text default null, page_input integer default 1, page_size_input integer default 20)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare total_count integer; items_payload jsonb; normalized_search text := nullif(trim(search_input), '');
begin
  if not private.can_manage_tenant(target_tenant_id) then raise exception 'Seu perfil não possui acesso à auditoria desta oficina.' using errcode = '42501'; end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then raise exception 'Paginação inválida.' using errcode = '22023'; end if;
  select count(*) into total_count from public.audit_logs a where a.tenant_id = target_tenant_id and (normalized_search is null or a.action ilike '%' || normalized_search || '%' or a.entity_type ilike '%' || normalized_search || '%' or a.entity_id::text ilike '%' || normalized_search || '%');
  select coalesce(jsonb_agg(jsonb_build_object('id', listed.id, 'action', listed.action, 'entityType', listed.entity_type, 'entityId', listed.entity_id, 'metadata', listed.metadata, 'createdAt', listed.created_at) order by listed.created_at desc, listed.id desc), '[]'::jsonb) into items_payload
  from (
    select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at
    from public.audit_logs a
    where a.tenant_id = target_tenant_id and (normalized_search is null or a.action ilike '%' || normalized_search || '%' or a.entity_type ilike '%' || normalized_search || '%' or a.entity_id::text ilike '%' || normalized_search || '%')
    order by a.created_at desc, a.id desc offset (page_input - 1) * page_size_input limit page_size_input
  ) listed;
  return jsonb_build_object('items', items_payload, 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

create or replace function public.workspace_get_tenant_settings(target_tenant_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare s public.tenant_settings%rowtype;
begin
  if not private.can_manage_tenant(target_tenant_id) then raise exception 'Seu perfil não pode consultar estas configurações.' using errcode = '42501'; end if;
  select * into s from public.tenant_settings where tenant_id = target_tenant_id limit 1;
  return jsonb_build_object('legalName', s.legal_name, 'document', s.document, 'phone', s.phone, 'whatsapp', s.whatsapp, 'email', s.email, 'defaultLaborHourlyRate', s.default_labor_hourly_rate, 'defaultPartsMarginPercent', s.default_parts_margin_percent, 'defaultPartsMarkupPercent', s.default_parts_markup_percent, 'quoteValidityDays', s.quote_validity_days, 'minimumMarginPercent', s.minimum_margin_percent, 'attendantMaxDiscountPercent', s.attendant_max_discount_percent, 'quoteMessageTemplate', s.quote_message_template);
end;
$$;

create or replace function public.workspace_update_tenant_settings(target_tenant_id bigint, payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if not private.can_manage_tenant(target_tenant_id) then raise exception 'Seu perfil não pode alterar estas configurações.' using errcode = '42501'; end if;
  update public.tenant_settings set legal_name = nullif(payload->>'legalName', ''), document = nullif(payload->>'document', ''), phone = nullif(payload->>'phone', ''), whatsapp = nullif(payload->>'whatsapp', ''), email = nullif(payload->>'email', ''), default_labor_hourly_rate = coalesce((payload->>'defaultLaborHourlyRate')::numeric, 0), default_parts_margin_percent = coalesce((payload->>'defaultPartsMarginPercent')::numeric, 0), default_parts_markup_percent = coalesce((payload->>'defaultPartsMarkupPercent')::numeric, 0), quote_validity_days = coalesce((payload->>'quoteValidityDays')::integer, 7), minimum_margin_percent = coalesce((payload->>'minimumMarginPercent')::numeric, 0), attendant_max_discount_percent = coalesce((payload->>'attendantMaxDiscountPercent')::numeric, 0), quote_message_template = nullif(payload->>'quoteMessageTemplate', ''), updated_at = now() where tenant_id = target_tenant_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after) values(target_tenant_id, auth.uid(), 'tenant.settings_updated', 'tenant_settings', target_tenant_id, payload);
  return public.workspace_get_tenant_settings(target_tenant_id);
end;
$$;

create or replace function public.workspace_get_tenant_branding(target_tenant_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare b public.tenant_branding%rowtype;
begin
  if not private.can_manage_tenant(target_tenant_id) then raise exception 'Seu perfil não pode consultar esta identidade.' using errcode = '42501'; end if;
  select * into b from public.tenant_branding where tenant_id = target_tenant_id limit 1;
  return jsonb_build_object('logoUrl', b.logo_url, 'publicTitle', b.public_title, 'primaryColor', b.primary_color, 'secondaryColor', b.secondary_color, 'accentColor', b.accent_color);
end;
$$;

create or replace function public.workspace_update_tenant_branding(target_tenant_id bigint, payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if not private.can_manage_tenant(target_tenant_id) then raise exception 'Seu perfil não pode alterar esta identidade.' using errcode = '42501'; end if;
  update public.tenant_branding set public_title = nullif(payload->>'publicTitle', ''), primary_color = coalesce(payload->>'primaryColor', primary_color), secondary_color = coalesce(payload->>'secondaryColor', secondary_color), accent_color = coalesce(payload->>'accentColor', accent_color), updated_at = now() where tenant_id = target_tenant_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after) values(target_tenant_id, auth.uid(), 'tenant.branding_updated', 'tenant_branding', target_tenant_id, payload);
  return public.workspace_get_tenant_branding(target_tenant_id);
end;
$$;

revoke all on function public.workspace_dashboard_report(bigint, timestamptz), public.workspace_notification_preferences(bigint), public.workspace_update_notification_preferences(bigint, boolean, jsonb), public.workspace_list_notifications(bigint, integer, integer), public.workspace_mark_notification_read(bigint, bigint), public.workspace_list_audit_logs(bigint, text, integer, integer), public.workspace_get_tenant_settings(bigint), public.workspace_update_tenant_settings(bigint, jsonb), public.workspace_get_tenant_branding(bigint), public.workspace_update_tenant_branding(bigint, jsonb) from public, anon;
grant execute on function public.workspace_dashboard_report(bigint, timestamptz), public.workspace_notification_preferences(bigint), public.workspace_update_notification_preferences(bigint, boolean, jsonb), public.workspace_list_notifications(bigint, integer, integer), public.workspace_mark_notification_read(bigint, bigint), public.workspace_list_audit_logs(bigint, text, integer, integer), public.workspace_get_tenant_settings(bigint), public.workspace_update_tenant_settings(bigint, jsonb), public.workspace_get_tenant_branding(bigint), public.workspace_update_tenant_branding(bigint, jsonb) to authenticated;
