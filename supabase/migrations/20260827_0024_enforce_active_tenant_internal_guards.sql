-- Guardas internos devem respeitar o mesmo limite comercial do backend:
-- apenas tenants ativos em trial/active podem ser operados. Demonstração é
-- exclusiva do Super Admin e não herda acesso por vínculo de membro.

create or replace function private.is_active_member(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenants t
      where t.id = target_tenant_id
        and t.active
        and t.status in ('trial', 'active')
        and (
          private.is_super_admin()
          or (
            not t.is_demo
            and exists (
              select 1
              from public.tenant_members tm
              where tm.tenant_id = t.id
                and tm.user_id = (select auth.uid())
                and tm.active
            )
          )
        )
    )
$$;

create or replace function private.can_manage_tenant(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenants t
      where t.id = target_tenant_id
        and t.active
        and t.status in ('trial', 'active')
        and (
          private.is_super_admin()
          or (
            not t.is_demo
            and exists (
              select 1
              from public.tenant_members tm
              where tm.tenant_id = t.id
                and tm.user_id = (select auth.uid())
                and tm.active
                and tm.role in ('owner', 'admin')
            )
          )
        )
    )
$$;

create or replace function private.can_catalog_manage(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenants t
      where t.id = target_tenant_id
        and t.active
        and t.status in ('trial', 'active')
        and (
          private.is_super_admin()
          or (
            not t.is_demo
            and exists (
              select 1
              from public.tenant_members tm
              where tm.tenant_id = t.id
                and tm.user_id = (select auth.uid())
                and tm.active
                and tm.role in ('owner', 'admin', 'attendant')
            )
          )
        )
    )
$$;

create or replace function private.can_manage_financial_catalog(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenants t
      where t.id = target_tenant_id
        and t.active
        and t.status in ('trial', 'active')
        and (
          private.is_super_admin()
          or (
            not t.is_demo
            and exists (
              select 1
              from public.tenant_members tm
              where tm.tenant_id = t.id
                and tm.user_id = (select auth.uid())
                and tm.active
                and tm.role in ('owner', 'admin')
            )
          )
        )
    )
$$;

create or replace function private.can_inventory_manage(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenants t
      where t.id = target_tenant_id
        and t.active
        and t.status in ('trial', 'active')
        and (
          private.is_super_admin()
          or (
            not t.is_demo
            and exists (
              select 1
              from public.tenant_members tm
              where tm.tenant_id = t.id
                and tm.user_id = (select auth.uid())
                and tm.active
                and tm.role in ('owner', 'admin')
            )
          )
        )
    )
$$;

create or replace function private.can_purchase_manage(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenants t
      where t.id = target_tenant_id
        and t.active
        and t.status in ('trial', 'active')
        and (
          private.is_super_admin()
          or (
            not t.is_demo
            and exists (
              select 1
              from public.tenant_members tm
              where tm.tenant_id = t.id
                and tm.user_id = (select auth.uid())
                and tm.active
                and tm.role in ('owner', 'admin')
            )
          )
        )
    )
$$;

create or replace function private.can_quotes_manage(target_tenant_id bigint)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.tenants t
      where t.id = target_tenant_id
        and t.active
        and t.status in ('trial', 'active')
        and (
          private.is_super_admin()
          or (
            not t.is_demo
            and exists (
              select 1
              from public.tenant_members tm
              where tm.tenant_id = t.id
                and tm.user_id = (select auth.uid())
                and tm.active
                and tm.role in ('owner', 'admin', 'attendant')
            )
          )
        )
    )
$$;

revoke all on function private.is_active_member(bigint), private.can_manage_tenant(bigint),
  private.can_catalog_manage(bigint), private.can_manage_financial_catalog(bigint),
  private.can_inventory_manage(bigint), private.can_purchase_manage(bigint),
  private.can_quotes_manage(bigint)
from public, anon, authenticated;
