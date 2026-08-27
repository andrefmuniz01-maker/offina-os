-- Fila interna de solicitações: lógica privilegiada privada e fachadas autenticadas SECURITY INVOKER.
create or replace function private.can_quotes_manage(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private as $$
  select private.is_super_admin() or exists (
    select 1 from public.tenant_members tm join public.tenants t on t.id = tm.tenant_id
    where tm.tenant_id = target_tenant_id and tm.user_id = auth.uid() and tm.active and not t.is_demo
      and (tm.role in ('owner', 'admin', 'attendant') or coalesce(tm.permissions, '[]'::jsonb) ? 'quotes.manage')
  )
$$;

create or replace function private.internal_list_workspace_quote_requests(target_tenant_id bigint, target_status text, search_input text, page_input integer, page_size_input integer)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare offset_rows integer; filtered_status public.quote_request_status; rows jsonb;
begin
  if not private.can_quotes_manage(target_tenant_id) then raise exception 'Seu perfil não possui acesso à fila comercial desta oficina.' using errcode = '42501'; end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then raise exception 'Paginação inválida.' using errcode = '22023'; end if;
  if target_status is not null then
    begin filtered_status := target_status::public.quote_request_status; exception when invalid_text_representation then raise exception 'Status inválido.' using errcode = '22023'; end;
  end if;
  offset_rows := (page_input - 1) * page_size_input;
  select coalesce(jsonb_agg(jsonb_build_object(
    'request', jsonb_build_object('id', r.id, 'tenantId', r.tenant_id, 'number', r.number, 'customerId', r.customer_id, 'vehicleId', r.vehicle_id, 'serviceId', r.service_id, 'requesterName', r.requester_name, 'requesterWhatsapp', r.requester_whatsapp, 'requesterEmail', r.requester_email, 'serviceLabel', r.service_label, 'description', r.description, 'source', r.source, 'status', r.status, 'assignedToUserId', r.assigned_to_user_id, 'createdAt', r.created_at, 'updatedAt', r.updated_at),
    'customer', case when c.id is null then null else jsonb_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp) end,
    'vehicle', case when v.id is null then null else jsonb_build_object('id', v.id, 'make', v.make, 'model', v.model, 'plate', v.plate) end,
    'assignedUser', case when p.id is null then null else jsonb_build_object('id', p.id, 'name', p.name) end,
    'queueMinutes', greatest(0, floor(extract(epoch from now() - coalesce((select max(e.created_at) from public.quote_request_events e where e.tenant_id = r.tenant_id and e.quote_request_id = r.id and e.type = 'status_changed'), r.created_at)) / 60))::integer
  ) order by r.created_at desc), '[]'::jsonb) into rows
  from (
    select q.* from public.quote_requests q
    left join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
    left join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
    where q.tenant_id = target_tenant_id
      and (filtered_status is null or q.status = filtered_status)
      and (nullif(trim(search_input), '') is null or c.name ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%' or q.requester_whatsapp ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%' or v.plate ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%' or v.make ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%' or v.model ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%')
    order by q.created_at desc limit page_size_input + 1 offset offset_rows
  ) r
  left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
  left join public.vehicles v on v.id = r.vehicle_id and v.tenant_id = r.tenant_id
  left join public.profiles p on p.id = r.assigned_to_user_id;
  return jsonb_build_object('items', coalesce(rows, '[]'::jsonb), 'page', page_input, 'pageSize', page_size_input, 'hasMore', jsonb_array_length(coalesce(rows, '[]'::jsonb)) > page_size_input);
end;
$$;

create or replace function private.internal_quote_request_history(target_tenant_id bigint, target_request_id bigint)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if not private.can_quotes_manage(target_tenant_id) then raise exception 'Seu perfil não possui acesso à fila comercial desta oficina.' using errcode = '42501'; end if;
  if not exists(select 1 from public.quote_requests where id = target_request_id and tenant_id = target_tenant_id) then raise exception 'Solicitação não encontrada nesta oficina.' using errcode = 'P0002'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'type', e.type, 'metadata', e.metadata, 'createdAt', e.created_at) order by e.created_at desc) from public.quote_request_events e where e.tenant_id = target_tenant_id and e.quote_request_id = target_request_id), '[]'::jsonb);
end;
$$;

create or replace function private.internal_update_quote_request(target_tenant_id bigint, target_request_id bigint, target_status text, assigned_user uuid)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare request_row public.quote_requests%rowtype; next_status public.quote_request_status; assigned_name text;
begin
  if not private.can_quotes_manage(target_tenant_id) then raise exception 'Seu perfil não possui acesso à fila comercial desta oficina.' using errcode = '42501'; end if;
  select * into request_row from public.quote_requests where id = target_request_id and tenant_id = target_tenant_id for update;
  if not found then raise exception 'Solicitação não encontrada nesta oficina.' using errcode = 'P0002'; end if;
  begin next_status := target_status::public.quote_request_status; exception when invalid_text_representation then raise exception 'Status inválido.' using errcode = '22023'; end;
  if request_row.status <> next_status and not ((request_row.status = 'new' and next_status in ('in_analysis','cancelled')) or (request_row.status = 'in_analysis' and next_status in ('awaiting_information','in_quoting','cancelled')) or (request_row.status = 'awaiting_information' and next_status in ('in_analysis','in_quoting','cancelled')) or (request_row.status = 'in_quoting' and next_status in ('ready','awaiting_information','cancelled')) or (request_row.status = 'ready' and next_status in ('sent','in_quoting','cancelled')) or (request_row.status = 'sent' and next_status in ('approved','rejected','expired','in_quoting')) or (request_row.status = 'rejected' and next_status = 'in_quoting') or (request_row.status = 'expired' and next_status in ('in_quoting','cancelled'))) then raise exception 'Não é permitido mudar a solicitação para o status escolhido.' using errcode = '22023'; end if;
  if assigned_user is not null then
    select p.name into assigned_name from public.tenant_members tm join public.profiles p on p.id = tm.user_id where tm.tenant_id = target_tenant_id and tm.user_id = assigned_user and tm.active;
    if not found then raise exception 'Responsável não pertence a esta oficina.' using errcode = '22023'; end if;
  end if;
  update public.quote_requests set status = next_status, assigned_to_user_id = assigned_user, updated_at = now() where id = request_row.id;
  if request_row.status <> next_status then insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata) values(target_tenant_id, request_row.id, 'status_changed', auth.uid(), jsonb_build_object('from', request_row.status, 'to', next_status)); end if;
  if request_row.assigned_to_user_id is distinct from assigned_user then insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata) values(target_tenant_id, request_row.id, 'assigned', auth.uid(), jsonb_build_object('assignedToUserId', assigned_user, 'assignedToUserName', assigned_name)); end if;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after) values(target_tenant_id, auth.uid(), 'quote_request.updated', 'quote_request', request_row.id, jsonb_build_object('status', request_row.status, 'assignedToUserId', request_row.assigned_to_user_id), jsonb_build_object('status', next_status, 'assignedToUserId', assigned_user));
end;
$$;

create or replace function public.workspace_list_quote_requests(target_tenant_id bigint, target_status text default null, search_input text default null, page_input integer default 1, page_size_input integer default 25)
returns jsonb language sql security invoker set search_path = '' as $$ select private.internal_list_workspace_quote_requests(target_tenant_id, target_status, search_input, page_input, page_size_input) $$;
create or replace function public.workspace_quote_request_history(target_tenant_id bigint, target_request_id bigint)
returns jsonb language sql security invoker set search_path = '' as $$ select private.internal_quote_request_history(target_tenant_id, target_request_id) $$;
create or replace function public.workspace_update_quote_request(target_tenant_id bigint, target_request_id bigint, target_status text, assigned_user uuid default null)
returns void language sql security invoker set search_path = '' as $$ select private.internal_update_quote_request(target_tenant_id, target_request_id, target_status, assigned_user) $$;
revoke all on function public.workspace_list_quote_requests(bigint, text, text, integer, integer), public.workspace_quote_request_history(bigint, bigint), public.workspace_update_quote_request(bigint, bigint, text, uuid) from public, anon;
grant execute on function public.workspace_list_quote_requests(bigint, text, text, integer, integer), public.workspace_quote_request_history(bigint, bigint), public.workspace_update_quote_request(bigint, bigint, text, uuid) to authenticated;
revoke all on function private.can_quotes_manage(bigint), private.internal_list_workspace_quote_requests(bigint, text, text, integer, integer), private.internal_quote_request_history(bigint, bigint), private.internal_update_quote_request(bigint, bigint, text, uuid) from public, anon, authenticated;
