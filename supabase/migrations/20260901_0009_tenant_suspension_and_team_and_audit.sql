-- 1) Suspender uma oficina precisa bloquear a EQUIPE dela, mas o Super Admin
--    precisa continuar enxergando e operando a oficina suspensa (para poder
--    reativá-la e investigar). Hoje todas as funções de permissão exigem
--    t.status in ('trial','active') incondicionalmente, inclusive para o
--    Super Admin -- então suspender uma oficina a esconderia até de quem
--    precisa reativá-la. Move a checagem de status para dentro do ramo do
--    membro comum; o Super Admin passa a depender só de t.active.
create or replace function private.is_active_member(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.tenants t
      where t.id = target_tenant_id and t.active
        and (
          private.is_super_admin()
          or (
            t.status in ('trial', 'active') and not t.is_demo
            and exists (select 1 from public.tenant_members tm where tm.tenant_id = t.id and tm.user_id = (select auth.uid()) and tm.active)
          )
        )
    )
$$;

create or replace function private.can_manage_tenant(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.tenants t
      where t.id = target_tenant_id and t.active
        and (
          private.is_super_admin()
          or (
            t.status in ('trial', 'active') and not t.is_demo
            and exists (select 1 from public.tenant_members tm where tm.tenant_id = t.id and tm.user_id = (select auth.uid()) and tm.active and tm.role in ('owner', 'admin'))
          )
        )
    )
$$;

create or replace function private.can_catalog_manage(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.tenants t
      where t.id = target_tenant_id and t.active
        and (
          private.is_super_admin()
          or (
            t.status in ('trial', 'active') and not t.is_demo
            and exists (select 1 from public.tenant_members tm where tm.tenant_id = t.id and tm.user_id = (select auth.uid()) and tm.active and tm.role in ('owner', 'admin', 'attendant'))
          )
        )
    )
$$;

create or replace function private.can_manage_financial_catalog(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.tenants t
      where t.id = target_tenant_id and t.active
        and (
          private.is_super_admin()
          or (
            t.status in ('trial', 'active') and not t.is_demo
            and exists (select 1 from public.tenant_members tm where tm.tenant_id = t.id and tm.user_id = (select auth.uid()) and tm.active and tm.role in ('owner', 'admin'))
          )
        )
    )
$$;

create or replace function private.can_purchase_manage(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.tenants t
      where t.id = target_tenant_id and t.active
        and (
          private.is_super_admin()
          or (
            t.status in ('trial', 'active') and not t.is_demo
            and exists (select 1 from public.tenant_members tm where tm.tenant_id = t.id and tm.user_id = (select auth.uid()) and tm.active and tm.role in ('owner', 'admin'))
          )
        )
    )
$$;

create or replace function private.can_quotes_manage(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.tenants t
      where t.id = target_tenant_id and t.active
        and (
          private.is_super_admin()
          or (
            t.status in ('trial', 'active') and not t.is_demo
            and exists (select 1 from public.tenant_members tm where tm.tenant_id = t.id and tm.user_id = (select auth.uid()) and tm.active and tm.role in ('owner', 'admin', 'attendant'))
          )
        )
    )
$$;

create or replace function private.can_inventory_manage(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.tenants t
      where t.id = target_tenant_id and t.active
        and (
          private.is_super_admin()
          or (
            t.status in ('trial', 'active') and not t.is_demo
            and exists (select 1 from public.tenant_members tm where tm.tenant_id = t.id and tm.user_id = (select auth.uid()) and tm.active and tm.role in ('owner', 'admin'))
          )
        )
    )
$$;

create or replace function private.can_appointments_manage(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.tenants t
      where t.id = target_tenant_id and t.active
        and (
          private.is_super_admin()
          or (
            t.status in ('trial', 'active') and not t.is_demo
            and exists (select 1 from public.tenant_members tm where tm.tenant_id = t.id and tm.user_id = (select auth.uid()) and tm.active and tm.role in ('owner', 'admin', 'attendant'))
          )
        )
    )
$$;

create or replace function private.can_work_order_operate(target_tenant_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.tenants t
      where t.id = target_tenant_id and t.active
        and (
          private.is_super_admin()
          or (
            t.status in ('trial', 'active') and not t.is_demo
            and exists (select 1 from public.tenant_members tm where tm.tenant_id = t.id and tm.user_id = (select auth.uid()) and tm.active and tm.role in ('owner', 'admin', 'attendant', 'technician'))
          )
        )
    );
$$;

-- can_execute_work_order tinha um segundo caminho (técnico responsável pela OS)
-- que nunca checava status/demo do tenant -- um técnico continuaria operando
-- a OS mesmo com a oficina suspensa. Fecha essa brecha.
create or replace function private.can_execute_work_order(target_tenant_id bigint, target_work_order_id bigint)
returns boolean language sql security definer set search_path = public, private
as $$
  select private.can_work_orders_manage(target_tenant_id) or exists (
    select 1 from public.work_orders wo
    join public.tenants t on t.id = wo.tenant_id and t.active and t.status in ('trial', 'active') and not t.is_demo
    join public.tenant_members tm on tm.tenant_id = wo.tenant_id and tm.user_id = auth.uid() and tm.active and tm.role = 'technician'
    where wo.id = target_work_order_id and wo.tenant_id = target_tenant_id and wo.assigned_to_user_id = auth.uid()
  )
$$;

-- 2) Super Admin: suspender/reativar oficina.
create or replace function public.platform_set_tenant_status(target_tenant_id bigint, status_input text)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare target_status public.tenant_status; before_status public.tenant_status;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode alterar o status de uma oficina.' using errcode = '42501';
  end if;
  if status_input not in ('active', 'suspended') then
    raise exception 'Use "active" ou "suspended".' using errcode = '22023';
  end if;
  target_status := status_input::public.tenant_status;

  select status into before_status from public.tenants where id = target_tenant_id for update;
  if not found then raise exception 'Oficina não encontrada.' using errcode = 'P0002'; end if;

  update public.tenants set status = target_status, updated_at = now() where id = target_tenant_id;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (target_tenant_id, auth.uid(), 'tenant.status_changed', 'tenant', target_tenant_id, jsonb_build_object('status', before_status), jsonb_build_object('status', target_status));

  return jsonb_build_object('success', true, 'status', target_status);
end;
$$;

-- 3) Dono/Admin convida e revoga a própria equipe (sem poder tocar em
--    Proprietário nem em si mesmo/outro Admin quando quem age é Admin).
--    Reaproveita exatamente a mesma mecânica de vínculo usada pelo Super
--    Admin (tenant_members), só muda quem pode chamar e quais papéis.
create or replace function public.workspace_grant_team_access(target_tenant_id bigint, target_user_id uuid, role_input text)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare target_role public.member_role; upserted public.tenant_members%rowtype;
begin
  if not private.can_manage_tenant(target_tenant_id) then
    raise exception 'Seu perfil não pode convidar integrantes nesta oficina.' using errcode = '42501';
  end if;
  begin
    target_role := role_input::public.member_role;
  exception when invalid_text_representation then
    raise exception 'Papel inválido.' using errcode = '22023';
  end;
  if target_role = 'owner' and not private.is_super_admin() then
    raise exception 'Somente o Super Admin pode conceder o papel de Proprietário.' using errcode = '42501';
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

create or replace function public.workspace_revoke_team_access(target_tenant_id bigint, target_user_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare actor_role public.member_role; target_member public.tenant_members%rowtype;
begin
  if not private.can_manage_tenant(target_tenant_id) then
    raise exception 'Seu perfil não pode revogar integrantes nesta oficina.' using errcode = '42501';
  end if;
  if target_user_id = auth.uid() and not private.is_super_admin() then
    raise exception 'Você não pode revogar seu próprio acesso.' using errcode = '22023';
  end if;

  select * into target_member from public.tenant_members where tenant_id = target_tenant_id and user_id = target_user_id for update;
  if not found then raise exception 'Integrante não encontrado nesta oficina.' using errcode = 'P0002'; end if;

  if not private.is_super_admin() then
    select role into actor_role from public.tenant_members where tenant_id = target_tenant_id and user_id = auth.uid() and active;
    if actor_role = 'admin' and target_member.role in ('owner', 'admin') then
      raise exception 'Um Administrador não pode revogar outro Administrador ou o Proprietário. Isso é exclusivo do Super Admin.' using errcode = '42501';
    end if;
    if actor_role = 'owner' and target_member.role = 'owner' then
      raise exception 'Um Proprietário não pode revogar outro Proprietário. Isso é exclusivo do Super Admin.' using errcode = '42501';
    end if;
  end if;

  if target_member.role = 'owner' and target_member.active and (select count(*) from public.tenant_members where tenant_id = target_tenant_id and role = 'owner' and active) <= 1 then
    raise exception 'A oficina precisa manter ao menos um proprietário ativo.' using errcode = '22023';
  end if;

  update public.tenant_members set active = false, updated_at = now() where id = target_member.id;

  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, before)
  values (target_tenant_id, auth.uid(), 'tenant_member.access_revoked', 'tenant_member', target_member.id, jsonb_build_object('userId', target_user_id, 'role', target_member.role));

  return jsonb_build_object('success', true);
end;
$$;

-- 4) Auditoria por oficina ganha filtro por tipo de ação e por período.
--    A função já existia com 4 parâmetros; como os novos filtros entram no
--    meio da lista (antes de page/pageSize), é uma assinatura nova de fato --
--    é preciso derrubar a antiga para o PostgREST não ficar com duas
--    sobrecargas ambíguas.
drop function if exists public.workspace_list_audit_logs(bigint, text, integer, integer);

create function public.workspace_list_audit_logs(
  target_tenant_id bigint,
  search_input text default null,
  action_prefix_input text default null,
  range_start_input timestamptz default null,
  range_end_input timestamptz default null,
  page_input integer default 1,
  page_size_input integer default 20
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare items_payload jsonb; total_count integer; normalized_search text := nullif(trim(search_input), '');
begin
  if not private.can_manage_tenant(target_tenant_id) then
    raise exception 'Seu perfil não pode consultar a auditoria desta oficina.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;

  select count(*)::integer into total_count
  from public.audit_logs a
  where a.tenant_id = target_tenant_id
    and (action_prefix_input is null or a.action like action_prefix_input || '%')
    and (range_start_input is null or a.created_at >= range_start_input)
    and (range_end_input is null or a.created_at < range_end_input)
    and (normalized_search is null or a.action ilike '%' || normalized_search || '%' or a.entity_type ilike '%' || normalized_search || '%' or a.entity_id::text = normalized_search);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'action', x.action, 'entityType', x.entity_type, 'entityId', x.entity_id,
    'metadata', x.metadata, 'createdAt', x.created_at
  ) order by x.created_at desc), '[]'::jsonb)
  into items_payload
  from (
    select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at
    from public.audit_logs a
    where a.tenant_id = target_tenant_id
      and (action_prefix_input is null or a.action like action_prefix_input || '%')
      and (range_start_input is null or a.created_at >= range_start_input)
      and (range_end_input is null or a.created_at < range_end_input)
      and (normalized_search is null or a.action ilike '%' || normalized_search || '%' or a.entity_type ilike '%' || normalized_search || '%' or a.entity_id::text = normalized_search)
    order by a.created_at desc
    offset (page_input - 1) * page_size_input
    limit page_size_input
  ) x;

  return jsonb_build_object('items', coalesce(items_payload, '[]'::jsonb), 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

-- 5) Super Admin: auditoria cruzada de todas as oficinas.
create or replace function public.platform_list_audit_logs(
  tenant_id_filter bigint default null,
  action_prefix_input text default null,
  range_start_input timestamptz default null,
  range_end_input timestamptz default null,
  page_input integer default 1,
  page_size_input integer default 20
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare items_payload jsonb; total_count integer;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode listar a auditoria da plataforma.' using errcode = '42501';
  end if;
  if page_input < 1 or page_size_input < 1 or page_size_input > 100 then
    raise exception 'Paginação inválida.' using errcode = '22023';
  end if;

  select count(*)::integer into total_count
  from public.audit_logs a
  where (tenant_id_filter is null or a.tenant_id = tenant_id_filter)
    and (action_prefix_input is null or a.action like action_prefix_input || '%')
    and (range_start_input is null or a.created_at >= range_start_input)
    and (range_end_input is null or a.created_at < range_end_input);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'tenantId', x.tenant_id, 'tenantName', x.tenant_name, 'action', x.action,
    'entityType', x.entity_type, 'entityId', x.entity_id, 'actorName', x.actor_name,
    'metadata', x.metadata, 'createdAt', x.created_at
  ) order by x.created_at desc), '[]'::jsonb)
  into items_payload
  from (
    select a.id, a.tenant_id, t.name as tenant_name, a.action, a.entity_type, a.entity_id, p.name as actor_name, a.metadata, a.created_at
    from public.audit_logs a
    join public.tenants t on t.id = a.tenant_id
    left join public.profiles p on p.id = a.actor_user_id
    where (tenant_id_filter is null or a.tenant_id = tenant_id_filter)
      and (action_prefix_input is null or a.action like action_prefix_input || '%')
      and (range_start_input is null or a.created_at >= range_start_input)
      and (range_end_input is null or a.created_at < range_end_input)
    order by a.created_at desc
    offset (page_input - 1) * page_size_input
    limit page_size_input
  ) x;

  return jsonb_build_object('items', coalesce(items_payload, '[]'::jsonb), 'page', page_input, 'pageSize', page_size_input, 'hasMore', total_count > page_input * page_size_input);
end;
$$;

revoke all on function public.platform_set_tenant_status(bigint, text) from public, anon, authenticated;
grant execute on function public.platform_set_tenant_status(bigint, text) to authenticated;
revoke all on function public.workspace_grant_team_access(bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.workspace_grant_team_access(bigint, uuid, text) to authenticated;
revoke all on function public.workspace_revoke_team_access(bigint, uuid) from public, anon, authenticated;
grant execute on function public.workspace_revoke_team_access(bigint, uuid) to authenticated;
revoke all on function public.workspace_list_audit_logs(bigint, text, text, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.workspace_list_audit_logs(bigint, text, text, timestamptz, timestamptz, integer, integer) to authenticated;
revoke all on function public.platform_list_audit_logs(bigint, text, timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.platform_list_audit_logs(bigint, text, timestamptz, timestamptz, integer, integer) to authenticated;
