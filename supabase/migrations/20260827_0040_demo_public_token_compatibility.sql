-- Compatibilidade dos links públicos da Demo com o contrato remoto de token seguro.
-- O seed histórico usava demo-quote-001; este patch mantém links determinísticos
-- e longos sem expor dados pessoais ou alterar outros tenants.

create or replace function private.normalize_full_demo_public_tokens(p_tenant_id bigint)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id and is_demo and slug = 'performance-garage') then
    raise exception 'Somente o tenant Demo permitido pode normalizar tokens.' using errcode = '42501';
  end if;
  update public.quotes q
  set public_token = 'demo-quote-' || lpad(q.number::text, 3, '0') || '-' || encode(digest('performance-garage:' || q.number::text, 'sha256'), 'hex'),
      updated_at = now()
  where q.tenant_id = p_tenant_id;
end;
$$;

update public.quotes q
set public_token = 'demo-quote-' || lpad(q.number::text, 3, '0') || '-' || encode(digest('performance-garage:' || q.number::text, 'sha256'), 'hex'),
    updated_at = now()
where q.tenant_id = (select t.id from public.tenants t where t.slug = 'performance-garage' and t.is_demo limit 1);

create or replace function private.platform_provision_full_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_tenant_id bigint;
  v_actor_profile_id uuid := auth.uid();
  v_is_demo boolean;
begin
  perform private.assert_demo_operator();
  if v_actor_profile_id is null then
    select p.id into v_actor_profile_id from public.profiles p where p.platform_role = 'super_admin' order by p.created_at asc limit 1;
  end if;
  if v_actor_profile_id is null then raise exception 'Não há Super Admin disponível para auditar o provisionamento.' using errcode = '55000'; end if;
  select t.id, t.is_demo into v_tenant_id, v_is_demo from public.tenants t where t.slug = 'performance-garage' for update;
  if found and not v_is_demo then raise exception 'O slug performance-garage pertence a uma oficina que não é demo.' using errcode = '23505'; end if;
  if not found then
    insert into public.tenants(name, slug, status, active, is_demo) values('Auto Prime Centro Automotivo', 'performance-garage', 'active', true, true) returning id into v_tenant_id;
    insert into public.tenant_settings(tenant_id) values(v_tenant_id);
    insert into public.tenant_branding(tenant_id, public_title) values(v_tenant_id, 'Auto Prime Centro Automotivo');
  end if;
  update public.tenants set name = 'Auto Prime Centro Automotivo', updated_at = now() where id = v_tenant_id and is_demo;
  perform private.clear_full_demo(v_tenant_id);
  perform private.seed_full_demo(v_tenant_id, v_actor_profile_id);
  perform private.repair_full_demo_coherence(v_tenant_id, v_actor_profile_id);
  perform private.normalize_full_demo_public_tokens(v_tenant_id);
  return jsonb_build_object('tenantId', v_tenant_id, 'slug', 'performance-garage', 'created', true, 'alreadyProvisioned', false, 'scope', 'full_workflow');
end;
$$;

create or replace function private.platform_reset_full_demo()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_tenant_id bigint;
  v_actor_profile_id uuid := auth.uid();
begin
  perform private.assert_demo_operator();
  select t.id into v_tenant_id from public.tenants t where t.slug = 'performance-garage' and t.is_demo and t.active for update;
  if not found then raise exception 'A Oficina Demo completa não está provisionada.' using errcode = 'P0002'; end if;
  if v_actor_profile_id is null then select p.id into v_actor_profile_id from public.profiles p where p.platform_role = 'super_admin' order by p.created_at asc limit 1; end if;
  if v_actor_profile_id is null then raise exception 'Não há Super Admin disponível para auditar o reset.' using errcode = '55000'; end if;
  update public.tenants set name = 'Auto Prime Centro Automotivo', updated_at = now() where id = v_tenant_id;
  perform private.clear_full_demo(v_tenant_id);
  perform private.seed_full_demo(v_tenant_id, v_actor_profile_id);
  perform private.repair_full_demo_coherence(v_tenant_id, v_actor_profile_id);
  perform private.normalize_full_demo_public_tokens(v_tenant_id);
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, metadata) values(v_tenant_id, v_actor_profile_id, 'demo.full_reset', 'tenant', v_tenant_id, jsonb_build_object('scope', 'full_workflow', 'fictitious', true, 'seedVersion', '20260827-full-v4-token-compatible'));
  return jsonb_build_object('tenantId', v_tenant_id, 'slug', 'performance-garage', 'reset', true, 'scope', 'full_workflow');
end;
$$;

revoke all on function private.normalize_full_demo_public_tokens(bigint) from public, anon, authenticated;
