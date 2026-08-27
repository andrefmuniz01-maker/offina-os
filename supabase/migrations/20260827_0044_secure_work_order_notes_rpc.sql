-- Reconstrói a escrita de apontamentos com o mesmo guard seguro das demais ações de OS.
create or replace function private.secure_add_work_order_note(
  target_tenant_id bigint,
  target_work_order_id bigint,
  body_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  note_id bigint;
begin
  if not private.can_execute_work_order(target_tenant_id, target_work_order_id) then
    raise exception 'Ordem de serviço indisponível para o seu perfil.' using errcode = '42501';
  end if;
  if body_input is null or length(trim(body_input)) < 1 or length(trim(body_input)) > 4000 then
    raise exception 'O apontamento é inválido.' using errcode = '22023';
  end if;
  insert into public.work_order_notes(tenant_id, work_order_id, author_user_id, body)
  values(target_tenant_id, target_work_order_id, auth.uid(), trim(body_input))
  returning id into note_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  values(target_tenant_id, auth.uid(), 'work_order.note_added', 'work_order_note', note_id, jsonb_build_object('workOrderId', target_work_order_id));
  return jsonb_build_object('id', note_id);
end;
$$;

create or replace function public.workspace_add_work_order_note(
  target_tenant_id bigint,
  target_work_order_id bigint,
  body_input text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.secure_add_work_order_note(target_tenant_id, target_work_order_id, body_input)
$$;

revoke all on function private.secure_add_work_order_note(bigint, bigint, text) from public, anon, authenticated;
grant execute on function private.secure_add_work_order_note(bigint, bigint, text) to authenticated;
revoke all on function public.workspace_add_work_order_note(bigint, bigint, text) from public, anon;
grant execute on function public.workspace_add_work_order_note(bigint, bigint, text) to authenticated;
