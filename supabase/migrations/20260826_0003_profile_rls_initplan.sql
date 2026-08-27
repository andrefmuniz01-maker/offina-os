-- Cache row-invariant Auth and security-definer lookups once per statement.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security
drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_super_insert on public.profiles;

create policy profiles_self_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_super_admin()));

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_super_admin()))
  with check (
    (select private.is_super_admin())
    or (
      id = (select auth.uid())
      and platform_role = (select platform_role from public.profiles where id = (select auth.uid()))
    )
  );

create policy profiles_super_insert on public.profiles
  for insert to authenticated
  with check ((select private.is_super_admin()));
