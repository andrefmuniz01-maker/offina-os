-- Lista somente vínculos de equipe apoiados por perfis Auth reais.
-- Não cria nem simula identidades para o tenant demonstrativo.

create or replace function public.workspace_list_team_members(target_tenant_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  if not private.can_manage_tenant(target_tenant_id) then
    raise exception 'Seu perfil não possui acesso à equipe desta oficina.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'member', jsonb_build_object('userId', tm.user_id, 'role', tm.role, 'permissions', tm.permissions, 'active', tm.active),
      'user', jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email)
    ) order by p.name nulls last, p.email nulls last)
    from public.tenant_members tm
    join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = target_tenant_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.workspace_list_team_members(bigint) from public, anon;
grant execute on function public.workspace_list_team_members(bigint) to authenticated;
