create or replace function private.internal_quote_request_assignees(target_tenant_id bigint)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if not private.can_quotes_manage(target_tenant_id) then raise exception 'Seu perfil não possui acesso à fila comercial desta oficina.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', tm.user_id, 'name', coalesce(p.name, 'Usuário interno'), 'role', tm.role) order by coalesce(p.name, ''), tm.user_id)
    from public.tenant_members tm join public.profiles p on p.id = tm.user_id
    where tm.tenant_id = target_tenant_id and tm.active), '[]'::jsonb);
end;
$$;
create or replace function public.workspace_quote_request_assignees(target_tenant_id bigint)
returns jsonb language sql security invoker set search_path = '' as $$ select private.internal_quote_request_assignees(target_tenant_id) $$;
revoke all on function public.workspace_quote_request_assignees(bigint) from public, anon;
grant execute on function public.workspace_quote_request_assignees(bigint) to authenticated;
revoke all on function private.internal_quote_request_assignees(bigint) from public, anon, authenticated;
