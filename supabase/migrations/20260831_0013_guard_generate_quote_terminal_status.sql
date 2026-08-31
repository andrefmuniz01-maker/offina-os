-- Robustez descoberta ao testar: se a solicitação já tem um orçamento
-- vinculado em status terminal (sent/approved/rejected/expired/cancelled) por
-- alguma inconsistência de dado anterior, a função retornava 'ready' de
-- qualquer forma em vez de recusar com uma mensagem clara. Adiciona a guarda
-- que faltava.
create or replace function private.internal_generate_quote_from_request(
  target_tenant_id bigint,
  target_request_id bigint
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  request_row public.quote_requests%rowtype;
  existing_quote_id bigint;
  existing_quote_status public.quote_status;
  draft_result jsonb;
  quote_id bigint;
  quote_updated_at timestamptz;
  quote_total numeric(12, 2);
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso à fila comercial desta oficina.' using errcode = '42501';
  end if;

  select * into request_row from public.quote_requests
  where id = target_request_id and tenant_id = target_tenant_id
  for update;
  if not found then
    raise exception 'Solicitação não encontrada nesta oficina.' using errcode = 'P0002';
  end if;
  if request_row.status not in ('new', 'in_analysis', 'awaiting_information', 'in_quoting', 'ready') then
    raise exception 'Esta solicitação já foi enviada ao cliente.' using errcode = '22023';
  end if;

  select q.id, q.status into existing_quote_id, existing_quote_status
  from public.quotes q
  where q.tenant_id = target_tenant_id and q.quote_request_id = request_row.id
  order by q.id desc
  limit 1;

  if existing_quote_id is not null and existing_quote_status not in ('draft', 'ready') then
    raise exception 'O orçamento vinculado a esta solicitação está em um status que não permite gerar novamente. Fale com o suporte para revisar esta solicitação.' using errcode = '22023';
  end if;

  if existing_quote_id is null then
    if request_row.status = 'new' then
      update public.quote_requests set status = 'in_analysis', updated_at = now() where id = request_row.id;
      insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata)
        values(target_tenant_id, request_row.id, 'status_changed', auth.uid(), jsonb_build_object('from', 'new', 'to', 'in_analysis'));
      request_row.status := 'in_analysis';
    end if;
    if request_row.status in ('in_analysis', 'awaiting_information') then
      update public.quote_requests set status = 'in_quoting', updated_at = now() where id = request_row.id;
      insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata)
        values(target_tenant_id, request_row.id, 'status_changed', auth.uid(), jsonb_build_object('from', request_row.status, 'to', 'in_quoting'));
    end if;

    draft_result := private.internal_create_quote_draft_from_request(target_tenant_id, target_request_id, null, null, null);
    quote_id := (draft_result->>'id')::bigint;
    existing_quote_status := 'draft';
  else
    quote_id := existing_quote_id;
  end if;

  if existing_quote_status = 'draft' then
    select updated_at into quote_updated_at from public.quotes where id = quote_id;
    perform private.internal_finalize_quote_draft(target_tenant_id, quote_id, quote_updated_at);
  end if;

  select updated_at, total into quote_updated_at, quote_total from public.quotes where id = quote_id;

  return jsonb_build_object(
    'id', quote_id,
    'tenantId', target_tenant_id,
    'requestId', target_request_id,
    'status', 'ready',
    'updatedAt', quote_updated_at,
    'total', quote_total
  );
end;
$function$;
