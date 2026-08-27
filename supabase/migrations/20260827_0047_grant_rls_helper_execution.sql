-- As policies de RLS executam estes quatro auxiliares SECURITY DEFINER durante
-- leituras autenticadas. Sem EXECUTE explícito, Postgres interrompe a policy com
-- erro interno e impede a seleção de workspaces e módulos dependentes.
-- O schema private continua fora da API REST e o acesso é limitado a authenticated.

revoke all on function private.is_super_admin() from public, anon;
revoke all on function private.is_active_member(bigint) from public, anon;
revoke all on function private.can_manage_tenant(bigint) from public, anon;
revoke all on function private.can_view_financial(bigint) from public, anon;

grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.is_active_member(bigint) to authenticated;
grant execute on function private.can_manage_tenant(bigint) to authenticated;
grant execute on function private.can_view_financial(bigint) to authenticated;
