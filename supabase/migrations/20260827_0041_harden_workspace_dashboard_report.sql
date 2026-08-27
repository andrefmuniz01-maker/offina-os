-- A agregação do dashboard permanece privada; a superfície REST passa a ser
-- uma fachada SECURITY INVOKER que preserva a identidade e RLS do solicitante.
alter function public.workspace_dashboard_report(bigint, timestamptz) set schema private;
alter function private.workspace_dashboard_report(bigint, timestamptz) rename to internal_workspace_dashboard_report;
create function public.workspace_dashboard_report(target_tenant_id bigint, reference_at timestamptz default now())
returns jsonb language sql security invoker set search_path = '' as $$
  select private.internal_workspace_dashboard_report(target_tenant_id, reference_at)
$$;
revoke all on function private.internal_workspace_dashboard_report(bigint, timestamptz) from public, anon;
grant execute on function private.internal_workspace_dashboard_report(bigint, timestamptz) to authenticated;
revoke all on function public.workspace_dashboard_report(bigint, timestamptz) from public, anon;
grant execute on function public.workspace_dashboard_report(bigint, timestamptz) to authenticated;
