-- Torna a RPC de "gerar e enviar" resiliente a solicitações que já tinham
-- avançado antes desta mudança (rascunho ou pronta, criadas pelo fluxo manual
-- antigo, ainda não enviadas ao cliente). Em vez de assumir que sempre parte
-- do zero, ela procura um orçamento já existente vinculado à solicitação e
-- retoma dali, pulando as etapas já concluídas. Continua atômica: qualquer
-- falha no meio do caminho desfaz tudo.
create or replace function private.internal_generate_and_send_quote(
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
  share_result jsonb;
  customer_whatsapp text;
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

  select updated_at into quote_updated_at from public.quotes where id = quote_id;
  share_result := private.internal_prepare_quote_manual_share(target_tenant_id, quote_id, quote_updated_at);

  select c.whatsapp into customer_whatsapp
  from public.quotes q join public.customers c on c.id = q.customer_id
  where q.id = quote_id;

  return share_result || jsonb_build_object('customerWhatsapp', customer_whatsapp);
end;
$function$;
