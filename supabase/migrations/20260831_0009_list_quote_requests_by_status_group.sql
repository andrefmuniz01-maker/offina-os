-- A unificação de Solicitações + Orçamentos em uma aba só precisa listar por
-- GRUPOS de status (ex.: "ainda não enviado ao cliente" = new + in_analysis +
-- awaiting_information + in_quoting + ready), não só um status por vez.
-- Troca o parâmetro de status único por uma lista opcional, mantendo
-- compatibilidade: null continua significando "todos os status".
drop function if exists private.internal_list_workspace_quote_requests(bigint, text, text, integer, integer);

create or replace function private.internal_list_workspace_quote_requests(
  target_tenant_id bigint,
  target_statuses text[],
  search_input text,
  page_input integer,
  page_size_input integer
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare offset_rows integer; filtered_statuses public.quote_request_status[]; rows jsonb;
begin
  if not private.can_quotes_manage(target_tenant_id) then raise exception 'Seu perfil não possui acesso à fila comercial desta oficina.' using errcode = '42501'; end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then raise exception 'Paginação inválida.' using errcode = '22023'; end if;
  if target_statuses is not null then
    begin filtered_statuses := target_statuses::public.quote_request_status[]; exception when invalid_text_representation then raise exception 'Status inválido.' using errcode = '22023'; end;
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
      and (filtered_statuses is null or q.status = any(filtered_statuses))
      and (nullif(trim(search_input), '') is null or c.name ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%' or q.requester_whatsapp ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%' or v.plate ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%' or v.make ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%' or v.model ilike '%' || replace(replace(replace(replace(trim(search_input), '%', ''), '_', ''), ',', ''), '(', '') || '%')
    order by q.created_at desc limit page_size_input + 1 offset offset_rows
  ) r
  left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
  left join public.vehicles v on v.id = r.vehicle_id and v.tenant_id = r.tenant_id
  left join public.profiles p on p.id = r.assigned_to_user_id;
  return jsonb_build_object('items', coalesce(rows, '[]'::jsonb), 'page', page_input, 'pageSize', page_size_input, 'hasMore', jsonb_array_length(coalesce(rows, '[]'::jsonb)) > page_size_input);
end;
$function$;

drop function if exists public.workspace_list_quote_requests(bigint, text, text, integer, integer);

create or replace function public.workspace_list_quote_requests(
  target_tenant_id bigint,
  target_statuses text[] default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 25
) returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.internal_list_workspace_quote_requests(target_tenant_id, target_statuses, search_input, page_input, page_size_input)
$$;

revoke all on function public.workspace_list_quote_requests(bigint, text[], text, integer, integer) from public, anon;
grant execute on function public.workspace_list_quote_requests(bigint, text[], text, integer, integer) to authenticated;
grant execute on function private.internal_list_workspace_quote_requests(bigint, text[], text, integer, integer) to authenticated;
