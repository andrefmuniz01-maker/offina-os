-- Corrige a coerência do seed completo da Demo e a paginação das leituras tenant-scoped.
-- O escopo é limitado ao tenant demo existente e não altera RLS nem outros tenants.

create or replace function private.repair_full_demo_coherence(p_tenant_id bigint, p_actor_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_is_demo boolean;
begin
  select t.is_demo into v_is_demo
  from public.tenants t
  where t.id = p_tenant_id
    and t.slug = 'performance-garage'
  for update;

  if not found or not v_is_demo then
    raise exception 'A correção só pode ser executada no tenant demonstrativo permitido.' using errcode = '42501';
  end if;

  update public.tenants
  set name = 'Auto Prime Centro Automotivo'
  where id = p_tenant_id;

  update public.tenant_branding
  set public_title = 'Auto Prime Centro Automotivo'
  where tenant_id = p_tenant_id;

  -- As primeiras 18 solicitações representam a cadeia operacional que já possui agenda/OS.
  update public.quote_requests
  set status = 'approved',
      updated_at = now()
  where tenant_id = p_tenant_id
    and number between 1 and 18;

  update public.quotes
  set status = 'approved',
      sent_at = coalesce(sent_at, created_at),
      viewed_at = coalesce(viewed_at, created_at),
      approved_at = coalesce(approved_at, created_at + interval '1 hour'),
      rejected_at = null,
      valid_until = now() + interval '7 days',
      updated_at = now()
  where tenant_id = p_tenant_id
    and number between 1 and 18;

  -- Toda aprovação com item de produto precisa de uma reserva correspondente.
  insert into public.inventory_reservations(tenant_id, product_id, quote_id, quantity, status, created_at)
  select q.tenant_id, qi.product_id, q.id, qi.quantity, 'active', coalesce(q.approved_at, q.created_at)
  from public.quotes q
  join public.quote_items qi
    on qi.quote_id = q.id
   and qi.tenant_id = q.tenant_id
   and qi.item_type = 'product'
   and qi.product_id is not null
  where q.tenant_id = p_tenant_id
    and q.status = 'approved'
    and not exists (
      select 1
      from public.inventory_reservations ir
      where ir.tenant_id = q.tenant_id
        and ir.quote_id = q.id
        and ir.product_id = qi.product_id
    );

  -- Agenda e OS compartilham o mesmo vínculo, sempre dentro do tenant.
  update public.appointments a
  set work_order_id = wo.id,
      updated_at = now()
  from public.work_orders wo
  where wo.tenant_id = p_tenant_id
    and a.tenant_id = p_tenant_id
    and wo.appointment_id = a.id
    and a.work_order_id is distinct from wo.id;

  update public.inventory_reservations ir
  set work_order_id = wo.id,
      status = case
        when wo.status in ('completed', 'delivered') then 'consumed'::public.reservation_status
        when wo.status = 'cancelled' then 'released'::public.reservation_status
        else 'active'::public.reservation_status
      end,
      released_at = case
        when wo.status in ('completed', 'delivered', 'cancelled') then coalesce(ir.released_at, now())
        else null
      end
  from public.work_orders wo
  where ir.tenant_id = p_tenant_id
    and wo.tenant_id = p_tenant_id
    and ir.quote_id = wo.quote_id
    and ir.product_id in (
      select woi.product_id
      from public.work_order_items woi
      where woi.tenant_id = p_tenant_id
        and woi.work_order_id = wo.id
        and woi.product_id is not null
    );

  update public.work_order_consumption wc
  set reservation_id = ir.id
  from public.inventory_reservations ir
  where wc.tenant_id = p_tenant_id
    and ir.tenant_id = p_tenant_id
    and ir.work_order_id = wc.work_order_id
    and ir.product_id = wc.product_id
    and wc.reservation_id is null;

  -- O saldo reservado é derivado das reservas ativas, nunca de valores de UI.
  update public.inventory_balances b
  set reserved_quantity = coalesce((
    select sum(ir.quantity)
    from public.inventory_reservations ir
    where ir.tenant_id = p_tenant_id
      and ir.product_id = b.product_id
      and ir.status = 'active'
  ), 0)
  where b.tenant_id = p_tenant_id;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after, metadata)
  values (
    p_tenant_id,
    p_actor_profile_id,
    'demo.full_seed_coherence_repaired',
    'tenant',
    p_tenant_id,
    jsonb_build_object('name', 'Auto Prime Centro Automotivo', 'workflow', 'approved_quote_reservation_appointment_work_order'),
    jsonb_build_object('fictitious', true, 'seedVersion', '20260827-full-v4')
  );
end;
$$;

create or replace function private.platform_provision_full_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_tenant_id bigint;
  v_actor_profile_id uuid := auth.uid();
  v_is_demo boolean;
begin
  perform private.assert_demo_operator();
  if v_actor_profile_id is null then
    select p.id into v_actor_profile_id
    from public.profiles p
    where p.platform_role = 'super_admin'
    order by p.created_at asc
    limit 1;
  end if;
  if v_actor_profile_id is null then
    raise exception 'Não há Super Admin disponível para auditar o provisionamento.' using errcode = '55000';
  end if;

  select t.id, t.is_demo into v_tenant_id, v_is_demo
  from public.tenants t
  where t.slug = 'performance-garage'
  for update;

  if found and not v_is_demo then
    raise exception 'O slug performance-garage pertence a uma oficina que não é demo.' using errcode = '23505';
  end if;

  if not found then
    insert into public.tenants(name, slug, status, active, is_demo)
    values('Auto Prime Centro Automotivo', 'performance-garage', 'active', true, true)
    returning id into v_tenant_id;
    insert into public.tenant_settings(tenant_id) values(v_tenant_id);
    insert into public.tenant_branding(tenant_id, public_title) values(v_tenant_id, 'Auto Prime Centro Automotivo');
  end if;

  perform private.clear_full_demo(v_tenant_id);
  perform private.seed_full_demo(v_tenant_id, v_actor_profile_id);
  perform private.repair_full_demo_coherence(v_tenant_id, v_actor_profile_id);

  return jsonb_build_object('tenantId', v_tenant_id, 'slug', 'performance-garage', 'created', true, 'alreadyProvisioned', false, 'scope', 'full_workflow');
end;
$$;

create or replace function private.platform_reset_full_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_tenant_id bigint;
  v_actor_profile_id uuid := auth.uid();
begin
  perform private.assert_demo_operator();
  select t.id into v_tenant_id
  from public.tenants t
  where t.slug = 'performance-garage'
    and t.is_demo
    and t.active
  for update;
  if not found then
    raise exception 'A Oficina Demo completa não está provisionada.' using errcode = 'P0002';
  end if;

  if v_actor_profile_id is null then
    select p.id into v_actor_profile_id
    from public.profiles p
    where p.platform_role = 'super_admin'
    order by p.created_at asc
    limit 1;
  end if;
  if v_actor_profile_id is null then
    raise exception 'Não há Super Admin disponível para auditar o reset.' using errcode = '55000';
  end if;

  perform private.clear_full_demo(v_tenant_id);
  perform private.seed_full_demo(v_tenant_id, v_actor_profile_id);
  perform private.repair_full_demo_coherence(v_tenant_id, v_actor_profile_id);
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values(v_tenant_id, v_actor_profile_id, 'demo.full_reset', 'tenant', v_tenant_id, jsonb_build_object('scope', 'full_workflow', 'fictitious', true, 'seedVersion', '20260827-full-v4'));

  return jsonb_build_object('tenantId', v_tenant_id, 'slug', 'performance-garage', 'reset', true, 'scope', 'full_workflow');
end;
$$;

revoke all on function private.repair_full_demo_coherence(bigint, uuid) from public, anon, authenticated;

create or replace function public.workspace_list_quotes(
  target_tenant_id bigint,
  target_status text default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 10
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  payload jsonb;
  items_payload jsonb;
  total_count integer;
  normalized_search text;
begin
  if not private.is_active_member(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso a esta oficina.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;
  normalized_search := nullif(trim(search_input), '');

  select count(*)::integer into total_count
  from public.quotes q
  join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
  join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
  where q.tenant_id = target_tenant_id
    and (target_status is null or q.status::text = target_status)
    and (
      normalized_search is null
      or q.number::text ilike '%' || normalized_search || '%'
      or c.name ilike '%' || normalized_search || '%'
      or coalesce(v.plate, '') ilike '%' || normalized_search || '%'
      or (v.make || ' ' || v.model) ilike '%' || normalized_search || '%'
    );

  select coalesce(jsonb_agg(item order by created_at desc), '[]'::jsonb)
    into items_payload
  from (
    select jsonb_build_object(
      'quote', jsonb_build_object(
        'id', q.id,
        'tenantId', q.tenant_id,
        'number', q.number,
        'status', q.status,
        'subtotal', q.subtotal,
        'discountTotal', q.discount_total,
        'total', q.total,
        'validUntil', q.valid_until,
        'notes', q.notes,
        'terms', q.terms,
        'createdAt', q.created_at,
        'sentAt', q.sent_at,
        'viewedAt', q.viewed_at,
        'approvedAt', q.approved_at,
        'rejectedAt', q.rejected_at
      ),
      'customer', jsonb_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp, 'email', c.email),
      'vehicle', jsonb_build_object('id', v.id, 'make', v.make, 'model', v.model, 'modelYear', v.model_year, 'plate', v.plate, 'mileage', v.mileage)
    ) as item,
    q.created_at
    from public.quotes q
    join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
    join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
    where q.tenant_id = target_tenant_id
      and (target_status is null or q.status::text = target_status)
      and (
        normalized_search is null
        or q.number::text ilike '%' || normalized_search || '%'
        or c.name ilike '%' || normalized_search || '%'
        or coalesce(v.plate, '') ilike '%' || normalized_search || '%'
        or (v.make || ' ' || v.model) ilike '%' || normalized_search || '%'
      )
    order by q.created_at desc
    limit page_size_input
    offset (page_input - 1) * page_size_input
  ) listed;

  payload := jsonb_build_object(
    'items', items_payload,
    'page', page_input,
    'pageSize', page_size_input,
    'hasMore', total_count > page_input * page_size_input
  );
  return payload;
end;
$$;

create or replace function public.workspace_list_revenues(
  target_tenant_id bigint,
  target_status text default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 10
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  items_payload jsonb;
  total_count integer;
  normalized_search text := nullif(trim(search_input), '');
begin
  if not private.can_view_financial(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso financeiro nesta oficina.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;

  select count(*)::integer into total_count
  from public.revenues r
  where r.tenant_id = target_tenant_id
    and (target_status is null or r.status = target_status)
    and (normalized_search is null or coalesce(r.notes, '') ilike '%' || normalized_search || '%' or coalesce(r.payment_method, '') ilike '%' || normalized_search || '%');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'tenantId', r.tenant_id,
    'workOrderId', r.work_order_id,
    'customerId', r.customer_id,
    'vehicleId', r.vehicle_id,
    'amount', r.amount,
    'paymentMethod', r.payment_method,
    'status', r.status,
    'dueAt', r.due_at,
    'receivedAt', r.received_at,
    'notes', r.notes,
    'createdAt', r.created_at
  ) order by r.created_at desc), '[]'::jsonb) into items_payload
  from (
    select r.*
    from public.revenues r
    where r.tenant_id = target_tenant_id
      and (target_status is null or r.status = target_status)
      and (normalized_search is null or coalesce(r.notes, '') ilike '%' || normalized_search || '%' or coalesce(r.payment_method, '') ilike '%' || normalized_search || '%')
    order by r.created_at desc
    offset (page_input - 1) * page_size_input
    limit page_size_input
  ) r;

  return jsonb_build_object('items', items_payload, 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

create or replace function public.workspace_list_expenses(
  target_tenant_id bigint,
  target_status text default null,
  search_input text default null,
  page_input integer default 1,
  page_size_input integer default 10
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  items_payload jsonb;
  total_count integer;
  normalized_search text := nullif(trim(search_input), '');
begin
  if not private.can_view_financial(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso financeiro nesta oficina.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;

  select count(*)::integer into total_count
  from public.expenses e
  where e.tenant_id = target_tenant_id
    and (target_status is null or e.status = target_status)
    and (normalized_search is null or e.category ilike '%' || normalized_search || '%' or coalesce(e.notes, '') ilike '%' || normalized_search || '%' or coalesce(e.recurrence, '') ilike '%' || normalized_search || '%');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'tenantId', e.tenant_id,
    'category', e.category,
    'amount', e.amount,
    'status', e.status,
    'expenseDate', e.expense_date,
    'dueAt', e.due_at,
    'recurrence', e.recurrence,
    'supplierId', e.supplier_id,
    'notes', e.notes,
    'createdAt', e.created_at
  ) order by e.expense_date desc), '[]'::jsonb) into items_payload
  from (
    select e.*
    from public.expenses e
    where e.tenant_id = target_tenant_id
      and (target_status is null or e.status = target_status)
      and (normalized_search is null or e.category ilike '%' || normalized_search || '%' or coalesce(e.notes, '') ilike '%' || normalized_search || '%' or coalesce(e.recurrence, '') ilike '%' || normalized_search || '%')
    order by e.expense_date desc
    offset (page_input - 1) * page_size_input
    limit page_size_input
  ) e;

  return jsonb_build_object('items', items_payload, 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;
