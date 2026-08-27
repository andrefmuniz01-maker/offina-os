-- Complementa o evento público de visualização com uma trilha de auditoria sem PII do visitante.
create or replace function private.audit_public_quote_view_event()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.type = 'viewed'
    and new.actor_user_id is null
    and coalesce(new.metadata ->> 'channel', '') = 'public_link' then
    insert into public.audit_logs(tenant_id, action, entity_type, entity_id, after, metadata)
    values(
      new.tenant_id,
      'quote.public_viewed',
      'quote',
      new.quote_id,
      jsonb_build_object('status', 'viewed'),
      jsonb_build_object('channel', 'public_link', 'visitorIdentityStored', false)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists quote_events_audit_public_view on public.quote_events;
create trigger quote_events_audit_public_view
after insert on public.quote_events
for each row execute function private.audit_public_quote_view_event();

revoke all on function private.audit_public_quote_view_event() from public, anon, authenticated;
