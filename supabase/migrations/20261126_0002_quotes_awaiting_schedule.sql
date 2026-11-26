-- Propostas aprovadas que ainda não têm horário: a fila de trabalho da Agenda.
create or replace function public.workspace_quotes_awaiting_schedule(target_tenant_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not private.can_appointments_manage(target_tenant_id) then
    raise exception 'Seu perfil não possui permissão para consultar a agenda desta oficina.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'quoteId', q.id, 'quoteNumber', q.number, 'total', q.total, 'approvedAt', q.approved_at,
      'customerName', c.name, 'customerWhatsapp', c.whatsapp,
      'vehicleName', trim(concat_ws(' ', v.make, v.model)), 'workshopName', t.name, 'publicToken', q.public_token
    ) order by q.approved_at asc nulls last, q.id)
    from public.quotes q
    join public.customers c on c.id = q.customer_id and c.tenant_id = q.tenant_id
    join public.vehicles v on v.id = q.vehicle_id and v.tenant_id = q.tenant_id
    join public.tenants t on t.id = q.tenant_id
    where q.tenant_id = target_tenant_id and q.status = 'approved'
      and not exists (select 1 from public.appointments a where a.tenant_id = q.tenant_id and a.quote_id = q.id and a.status <> 'cancelled')
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.workspace_quotes_awaiting_schedule(bigint) from public, anon;
grant execute on function public.workspace_quotes_awaiting_schedule(bigint) to authenticated;
