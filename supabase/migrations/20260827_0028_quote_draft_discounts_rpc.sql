-- Descontos de rascunho são uma alteração comercial interna. Esta transação
-- não altera solicitação, estoque, reserva, agenda, OS, financeiro realizado
-- ou qualquer fluxo público do cliente.
create or replace function private.internal_update_quote_draft_discounts(
  target_tenant_id bigint,
  target_quote_id bigint,
  discounts_input jsonb,
  expected_updated_at_input timestamptz,
  override_reason_input text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  quote_row public.quotes%rowtype;
  quote_item_row public.quote_items%rowtype;
  raw_item jsonb;
  item_id_input bigint;
  discount_input numeric(12, 2);
  seen_item_ids bigint[] := '{}';
  item_count integer;
  subtotal_total numeric(12, 2) := 0;
  discount_total numeric(12, 2) := 0;
  cost_total numeric(12, 2) := 0;
  total_value numeric(12, 2);
  margin_percent numeric(7, 2);
  previous_total numeric(12, 2);
  previous_discount_total numeric(12, 2);
  attendant_max_discount numeric(7, 2);
  minimum_margin numeric(7, 2);
  financial_manager boolean;
begin
  if not private.can_quotes_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso à edição de orçamento desta oficina.' using errcode = '42501';
  end if;
  if jsonb_typeof(discounts_input) <> 'array' or jsonb_array_length(discounts_input) < 1 or jsonb_array_length(discounts_input) > 100 then
    raise exception 'Informe os descontos de todos os itens do orçamento.' using errcode = '22023';
  end if;
  if length(coalesce(override_reason_input, '')) > 1000 then
    raise exception 'A justificativa de exceção excede o limite permitido.' using errcode = '22023';
  end if;

  select * into quote_row from public.quotes
  where id = target_quote_id and tenant_id = target_tenant_id
  for update;
  if not found then
    raise exception 'Orçamento não encontrado nesta oficina.' using errcode = 'P0002';
  end if;
  if quote_row.status <> 'draft' then
    raise exception 'Descontos só podem ser ajustados em rascunhos internos.' using errcode = '22023';
  end if;
  if quote_row.updated_at is distinct from expected_updated_at_input then
    raise exception 'Este orçamento foi alterado em outra sessão. Atualize o rascunho antes de salvar.' using errcode = 'P0001';
  end if;
  previous_total := quote_row.total;
  previous_discount_total := quote_row.discount_total;

  select count(*) into item_count from public.quote_items
  where tenant_id = target_tenant_id and quote_id = quote_row.id;
  if item_count <> jsonb_array_length(discounts_input) then
    raise exception 'Informe exatamente os descontos dos itens atuais do orçamento.' using errcode = '22023';
  end if;

  for raw_item in select value from jsonb_array_elements(discounts_input) loop
    if jsonb_typeof(raw_item) <> 'object' then
      raise exception 'Cada desconto precisa identificar um item do orçamento.' using errcode = '22023';
    end if;
    begin
      item_id_input := (raw_item->>'quoteItemId')::bigint;
      discount_input := (raw_item->>'discount')::numeric;
    exception when invalid_text_representation then
      raise exception 'Um desconto informado possui formato inválido.' using errcode = '22023';
    end;
    if item_id_input is null or discount_input is null or discount_input < 0 or discount_input > 9999999999.99 then
      raise exception 'Um desconto informado é inválido.' using errcode = '22023';
    end if;
    if item_id_input = any(seen_item_ids) then
      raise exception 'Cada item pode receber somente um desconto por atualização.' using errcode = '22023';
    end if;
    select * into quote_item_row from public.quote_items
    where id = item_id_input and tenant_id = target_tenant_id and quote_id = quote_row.id
    for update;
    if not found then
      raise exception 'Um item não pertence a este orçamento.' using errcode = '22023';
    end if;
    if discount_input > quote_item_row.quantity * quote_item_row.unit_price then
      raise exception 'O desconto não pode superar o valor do item.' using errcode = '22023';
    end if;
    seen_item_ids := array_append(seen_item_ids, item_id_input);
    subtotal_total := subtotal_total + quote_item_row.quantity * quote_item_row.unit_price;
    discount_total := discount_total + discount_input;
    cost_total := cost_total + quote_item_row.quantity * quote_item_row.unit_cost;
  end loop;

  financial_manager := private.can_manage_financial_catalog(target_tenant_id);
  select coalesce(attendant_max_discount_percent, 0), coalesce(minimum_margin_percent, 0)
  into attendant_max_discount, minimum_margin
  from public.tenant_settings where tenant_id = target_tenant_id;
  attendant_max_discount := coalesce(attendant_max_discount, 0);
  minimum_margin := coalesce(minimum_margin, 0);
  total_value := subtotal_total - discount_total;
  margin_percent := case when total_value > 0 then round(((total_value - cost_total) / total_value) * 100, 2) else case when cost_total > 0 then -100 else 0 end end;

  if not financial_manager and discount_total > round(subtotal_total * attendant_max_discount / 100, 2) then
    raise exception 'O desconto solicitado ultrapassa o limite permitido para seu perfil.' using errcode = '42501';
  end if;
  if margin_percent < minimum_margin and (not financial_manager or length(trim(coalesce(override_reason_input, ''))) < 3) then
    raise exception 'A margem estimada ficaria abaixo do mínimo configurado. Um gestor financeiro deve justificar a exceção.' using errcode = '22023';
  end if;

  for raw_item in select value from jsonb_array_elements(discounts_input) loop
    update public.quote_items set discount = (raw_item->>'discount')::numeric
    where id = (raw_item->>'quoteItemId')::bigint and tenant_id = target_tenant_id and quote_id = quote_row.id;
  end loop;
  update public.quotes set subtotal = subtotal_total, discount_total = discount_total, total = total_value,
    estimated_cost_total = cost_total, estimated_margin_percent = margin_percent, updated_at = now()
  where id = quote_row.id and tenant_id = target_tenant_id;
  select * into quote_row from public.quotes where id = quote_row.id and tenant_id = target_tenant_id;

  insert into public.quote_events(tenant_id, quote_id, type, actor_user_id, metadata)
  values(target_tenant_id, quote_row.id, 'discounts_updated', auth.uid(), jsonb_build_object('discountTotal', discount_total));
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after, metadata)
  values(target_tenant_id, auth.uid(), 'quote.discounts_updated', 'quote', quote_row.id,
    jsonb_build_object('total', previous_total, 'discountTotal', previous_discount_total),
    jsonb_build_object('total', total_value, 'discountTotal', discount_total),
    jsonb_build_object('overrideReason', nullif(trim(override_reason_input), '')));

  return jsonb_build_object('id', quote_row.id, 'tenantId', target_tenant_id, 'status', quote_row.status,
    'subtotal', subtotal_total, 'discountTotal', discount_total, 'total', total_value, 'updatedAt', quote_row.updated_at);
end;
$$;

create or replace function public.workspace_update_quote_draft_discounts(
  target_tenant_id bigint,
  target_quote_id bigint,
  discounts_input jsonb,
  expected_updated_at_input timestamptz,
  override_reason_input text default null
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.internal_update_quote_draft_discounts(target_tenant_id, target_quote_id, discounts_input, expected_updated_at_input, override_reason_input)
$$;

revoke all on function public.workspace_update_quote_draft_discounts(bigint, bigint, jsonb, timestamptz, text) from public, anon;
grant execute on function public.workspace_update_quote_draft_discounts(bigint, bigint, jsonb, timestamptz, text) to authenticated;
revoke all on function private.internal_update_quote_draft_discounts(bigint, bigint, jsonb, timestamptz, text) from public, anon, authenticated;
