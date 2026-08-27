-- A lógica que cria agenda e OS fica privada. A função exposta é SECURITY
-- INVOKER e só encaminha a identidade autenticada para a rotina protegida.
alter function public.workspace_schedule_approved_quote(
  bigint, bigint, timestamptz, timestamptz, uuid, text, text
) set schema private;
alter function private.workspace_schedule_approved_quote(
  bigint, bigint, timestamptz, timestamptz, uuid, text, text
) rename to internal_schedule_approved_quote;

create function public.workspace_schedule_approved_quote(
  target_tenant_id bigint,
  target_quote_id bigint,
  scheduled_start_input timestamptz,
  scheduled_end_input timestamptz,
  assigned_to_user_id_input uuid default null,
  bay_input text default null,
  notes_input text default null
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.internal_schedule_approved_quote(
    target_tenant_id, target_quote_id, scheduled_start_input, scheduled_end_input,
    assigned_to_user_id_input, bay_input, notes_input
  )
$$;

revoke all on function public.workspace_schedule_approved_quote(bigint, bigint, timestamptz, timestamptz, uuid, text, text) from public, anon;
grant execute on function public.workspace_schedule_approved_quote(bigint, bigint, timestamptz, timestamptz, uuid, text, text) to authenticated;
revoke all on function private.internal_schedule_approved_quote(bigint, bigint, timestamptz, timestamptz, uuid, text, text) from public, anon;
grant execute on function private.internal_schedule_approved_quote(bigint, bigint, timestamptz, timestamptz, uuid, text, text) to authenticated;
