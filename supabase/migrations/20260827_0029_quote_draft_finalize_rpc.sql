-- Finaliza a proposta interna após uma nova conferência de disponibilidade.
-- A transação não reserva ou movimenta estoque e não disponibiliza link público.
create or replace function private.internal_finalize_quote_draft(
  target_tenant_id bigint,
  target_quote_id bigint,
  expected_updated_at_input timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  quote_row public.quotes%rowtype;
  request_row public.quote_requests%rowtype;
  insufficient_product_names text;
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso à finalização de orçamento desta oficina.' using errcode = '42501';
  end if;
  select * into quote_row from public.quotes
  where id = target_quote_id and tenant_id = target_tenant_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta oficina.' using errcode = 'P0002';
  end if;
  if quote_row.status <> 'draft' then
    raise exception 'Somente rascunhos internos podem ser finalizados.' using errcode = '22023';
  end if;
  if quote_row.updated_at is distinct from expected_updated_at_input then
    raise exception 'Este orçamento foi alterado em outra sessão. Atualize o rascunho antes de finalizar.' using errcode = 'P0001';
  end if;
  if quote_row.quote_request_id is null then
    raise exception 'Este rascunho não está vinculado a uma solicitação comercial.' using errcode = '22023';
  end if;
  select * into request_row from public.quote_requests
  where id = quote_row.quote_request_id and tenant_id = target_tenant_id
  for update;
  if not found or request_row.status <> 'in_quoting' then
    raise exception 'A solicitação vinculada não está disponível para finalizar a proposta.' using errcode = 'P0001';
  end if;

  perform 1 from public.inventory_balances b
  join public.quote_items qi on qi.tenant_id = b.tenant_id and qi.product_id = b.product_id
  where qi.tenant_id = target_tenant_id and qi.quote_id = quote_row.id and qi.product_id is not null
  for update of b;

  select string_agg(product_name, ', ' order by product_name) into insufficient_product_names
  from (
    select p.name as product_name
    from public.quote_items qi
    join public.products p on p.id = qi.product_id and p.tenant_id = qi.tenant_id
    left join public.inventory_balances b on b.tenant_id = qi.tenant_id and b.product_id = qi.product_id
    where qi.tenant_id = target_tenant_id and qi.quote_id = quote_row.id and qi.product_id is not null
    group by p.id, p.name
    having coalesce(max(b.physical_quantity - b.reserved_quantity), 0) < sum(qi.quantity)
  ) insufficient_products;
  if insufficient_product_names is not null then
    raise exception 'Estoque indisponível para finalizar a proposta: %', insufficient_product_names using errcode = 'P0001';
  end if;

  update public.quotes set status = 'ready', updated_at = now()
  where id = quote_row.id and tenant_id = target_tenant_id;
  update public.quote_requests set status = 'ready', updated_at = now()
  where id = request_row.id and tenant_id = target_tenant_id and status = 'in_quoting';
  if not found then
    raise exception 'A solicitação foi alterada em outra sessão. Atualize antes de finalizar.' using errcode = 'P0001';
  end if;
  select * into quote_row from public.quotes where id = quote_row.id and tenant_id = target_tenant_id;

  insert into public.quote_events(tenant_id, quote_id, type, actor_user_id, metadata)
  values(target_tenant_id, quote_row.id, 'ready', auth.uid(), jsonb_build_object('stockRevalidated', true));
  insert into public.quote_request_events(tenant_id, quote_request_id, type, actor_user_id, metadata)
  values(target_tenant_id, request_row.id, 'status_changed', auth.uid(), jsonb_build_object('from', 'in_quoting', 'to', 'ready', 'quoteId', quote_row.id));
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after, metadata)
  values(target_tenant_id, auth.uid(), 'quote.ready', 'quote', quote_row.id,
    jsonb_build_object('status', 'draft'), jsonb_build_object('status', 'ready'),
    jsonb_build_object('requestId', request_row.id, 'stockRevalidated', true, 'reservationCreated', false));

  return jsonb_build_object('id', quote_row.id, 'tenantId', target_tenant_id, 'requestId', request_row.id,
    'status', 'ready', 'updatedAt', quote_row.updated_at);
end;
$$;

create or replace function public.workspace_finalize_quote_draft(
  target_tenant_id bigint,
  target_quote_id bigint,
  expected_updated_at_input timestamptz
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.internal_finalize_quote_draft(target_tenant_id, target_quote_id, expected_updated_at_input)
$$;

revoke all on function public.workspace_finalize_quote_draft(bigint, bigint, timestamptz) from public, anon;
grant execute on function public.workspace_finalize_quote_draft(bigint, bigint, timestamptz) to authenticated;
revoke all on function private.internal_finalize_quote_draft(bigint, bigint, timestamptz) from public, anon, authenticated;
