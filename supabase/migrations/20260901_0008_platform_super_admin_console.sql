-- Console do Super Admin, todo sobre Supabase (fonte única, substitui o antigo
-- painel de leitura ligado ao banco MySQL legado). Permite listar todas as
-- oficinas com seus links públicos, ver/gerir integrantes e conceder ou
-- revogar acesso. A concessão de acesso é feita pelo backend (Node), que
-- resolve/])cria o usuário via Supabase Auth Admin e então chama
-- platform_grant_tenant_access para vincular o papel na oficina.

create or replace function public.platform_list_tenants()
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare payload jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode listar as oficinas.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'slug', t.slug,
    'status', t.status,
    'active', t.active,
    'isDemo', t.is_demo,
    'createdAt', t.created_at,
    'publicIntakeLink', '/solicitar/' || t.slug,
    'memberCount', (select count(*) from public.tenant_members tm where tm.tenant_id = t.id and tm.active),
    'ownerName', p.name,
    'ownerEmail', p.email
  ) order by t.created_at desc), '[]'::jsonb)
  into payload
  from public.tenants t
  left join public.profiles p on p.id = t.primary_owner_user_id;

  return coalesce(payload, '[]'::jsonb);
end;
$$;

create or replace function public.platform_list_tenant_members(target_tenant_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare payload jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode listar integrantes.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tm.id,
    'userId', tm.user_id,
    'name', p.name,
    'email', p.email,
    'role', tm.role,
    'active', tm.active,
    'createdAt', tm.created_at
  ) order by tm.created_at asc), '[]'::jsonb)
  into payload
  from public.tenant_members tm
  join public.profiles p on p.id = tm.user_id
  where tm.tenant_id = target_tenant_id;

  return coalesce(payload, '[]'::jsonb);
end;
$$;

create or replace function public.platform_grant_tenant_access(target_tenant_id bigint, target_user_id uuid, role_input text)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare target_role public.member_role; upserted public.tenant_members%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode conceder acesso.' using errcode = '42501';
  end if;
  begin
    target_role := role_input::public.member_role;
  exception when invalid_text_representation then
    raise exception 'Papel inválido.' using errcode = '22023';
  end;
  if not exists (select 1 from public.tenants where id = target_tenant_id) then
    raise exception 'Oficina não encontrada.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role, active)
  values (target_tenant_id, target_user_id, target_role, true)
  on conflict (tenant_id, user_id) do update set role = excluded.role, active = true, updated_at = now()
  returning * into upserted;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (target_tenant_id, auth.uid(), 'tenant_member.access_granted', 'tenant_member', upserted.id, jsonb_build_object('userId', target_user_id, 'role', target_role));

  return jsonb_build_object('success', true, 'memberId', upserted.id, 'role', target_role);
end;
$$;

create or replace function public.platform_revoke_tenant_access(target_tenant_id bigint, target_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare target_member public.tenant_members%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode revogar acesso.' using errcode = '42501';
  end if;
  select * into target_member from public.tenant_members where tenant_id = target_tenant_id and user_id = target_user_id for update;
  if not found then raise exception 'Integrante não encontrado nesta oficina.' using errcode = 'P0002'; end if;
  if target_member.role = 'owner' and target_member.active and (select count(*) from public.tenant_members where tenant_id = target_tenant_id and role = 'owner' and active) <= 1 then
    raise exception 'A oficina precisa manter ao menos um proprietário ativo.' using errcode = '22023';
  end if;

  update public.tenant_members set active = false, updated_at = now() where id = target_member.id;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before)
  values (target_tenant_id, auth.uid(), 'tenant_member.access_revoked', 'tenant_member', target_member.id, jsonb_build_object('userId', target_user_id, 'role', target_member.role));

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.platform_list_public_links(status_filter text[] default array['sent','viewed'], page_input integer default 1, page_size_input integer default 20)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare items_payload jsonb; total_count integer;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode listar links públicos.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;

  select count(*)::integer into total_count
  from public.quotes q
  where status_filter is null or q.status::text = any(status_filter);

  select coalesce(jsonb_agg(jsonb_build_object(
    'quoteId', x.id,
    'number', x.number,
    'status', x.status,
    'total', x.total,
    'tenantId', x.tenant_id,
    'tenantName', x.tenant_name,
    'tenantSlug', x.tenant_slug,
    'customerName', x.customer_name,
    'publicUrl', '/orcamento/' || x.public_token,
    'sentAt', x.sent_at,
    'viewedAt', x.viewed_at,
    'validUntil', x.valid_until
  ) order by x.sent_at desc nulls last), '[]'::jsonb)
  into items_payload
  from (
    select q.id, q.number, q.status, q.total, q.tenant_id, t.name as tenant_name, t.slug as tenant_slug,
           c.name as customer_name, q.public_token, q.sent_at, q.viewed_at, q.valid_until
    from public.quotes q
    join public.tenants t on t.id = q.tenant_id
    left join public.customers c on c.id = q.customer_id
    where status_filter is null or q.status::text = any(status_filter)
    order by q.sent_at desc nulls last
    offset (page_input - 1) * page_size_input
    limit page_size_input
  ) x;

  return jsonb_build_object('items', coalesce(items_payload, '[]'::jsonb), 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

revoke all on function public.platform_list_tenants() from public, anon, authenticated;
grant execute on function public.platform_list_tenants() to authenticated;
revoke all on function public.platform_list_tenant_members(bigint) from public, anon, authenticated;
grant execute on function public.platform_list_tenant_members(bigint) to authenticated;
revoke all on function public.platform_grant_tenant_access(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.platform_grant_tenant_access(bigint, uuid, text) to authenticated;
revoke all on function public.platform_revoke_tenant_access(bigint, uuid) from public, anon, authenticated;
grant execute on function public.platform_revoke_tenant_access(bigint, uuid) to authenticated;
revoke all on function public.platform_list_public_links(text[], integer, integer) from public, anon, authenticated;
grant execute on function public.platform_list_public_links(text[], integer, integer) to authenticated;
