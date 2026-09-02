-- 1) Plano "Padrão": a tabela public.plans já existia pronta e nunca foi
--    usada. Cria um plano inicial com limites folgados (nada trava hoje),
--    atribui em toda oficina sem plano (inclusive a demo) e faz
--    platform_create_tenant atribuir automaticamente daqui pra frente.
insert into public.plans (code, name, description, max_users, max_customers, active)
select 'padrao', 'Padrão', 'Plano inicial sem restrição comercial definida ainda. Ajuste os limites quando a régua de planos for definida.', 50, null, true
where not exists (select 1 from public.plans where code = 'padrao');

update public.tenants
set plan_id = (select id from public.plans where code = 'padrao')
where plan_id is null;

create or replace function public.platform_create_tenant(
  tenant_name text,
  tenant_slug text,
  tenant_whatsapp text default null,
  tenant_primary_color text default '#E84D1C'
) returns bigint
language plpgsql
set search_path to 'public', 'private'
as $function$
declare
  created_tenant_id bigint;
  default_plan_id bigint;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role = 'super_admin'
  ) then
    raise exception 'Apenas o Super Admin pode criar oficinas.' using errcode = '42501';
  end if;

  if length(trim(tenant_name)) < 3 or length(trim(tenant_name)) > 160 then
    raise exception 'Nome comercial inválido.' using errcode = '22023';
  end if;

  if tenant_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Identificador público inválido.' using errcode = '22023';
  end if;

  select id into default_plan_id from public.plans where code = 'padrao';

  insert into public.tenants (name, slug, status, active, primary_owner_user_id, plan_id)
  values (trim(tenant_name), tenant_slug, 'active', true, auth.uid(), default_plan_id)
  returning id into created_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role, active)
  values (created_tenant_id, auth.uid(), 'owner', true);

  insert into public.tenant_settings (tenant_id, whatsapp)
  values (created_tenant_id, nullif(trim(tenant_whatsapp), ''));

  insert into public.tenant_branding (tenant_id, public_title, primary_color)
  values (created_tenant_id, trim(tenant_name), tenant_primary_color);

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (created_tenant_id, auth.uid(), 'tenant.created', 'tenant', created_tenant_id, jsonb_build_object('name', trim(tenant_name), 'slug', tenant_slug));

  return created_tenant_id;
end;
$function$;

-- 2) Super Admin: CRUD simples de planos.
create or replace function public.platform_list_plans()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare payload jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode listar planos.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description,
    'maxUsers', p.max_users, 'maxCustomers', p.max_customers, 'active', p.active,
    'tenantCount', (select count(*) from public.tenants t where t.plan_id = p.id)
  ) order by p.name), '[]'::jsonb)
  into payload
  from public.plans p;

  return coalesce(payload, '[]'::jsonb);
end;
$$;

create or replace function public.platform_upsert_plan(
  target_plan_id bigint default null,
  plan_code text default null,
  plan_name text default null,
  plan_description text default null,
  plan_max_users integer default null,
  plan_max_customers integer default null,
  plan_active boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare upserted public.plans%rowtype;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode gerenciar planos.' using errcode = '42501';
  end if;
  if length(trim(coalesce(plan_name, ''))) < 2 or length(trim(coalesce(plan_name, ''))) > 120 then
    raise exception 'Nome do plano inválido.' using errcode = '22023';
  end if;
  if plan_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Código do plano inválido. Use letras minúsculas, números e hífens.' using errcode = '22023';
  end if;
  if plan_max_users is not null and plan_max_users < 1 then
    raise exception 'Limite de usuários inválido.' using errcode = '22023';
  end if;
  if plan_max_customers is not null and plan_max_customers < 0 then
    raise exception 'Limite de clientes inválido.' using errcode = '22023';
  end if;

  if target_plan_id is null then
    insert into public.plans (code, name, description, max_users, max_customers, active)
    values (trim(plan_code), trim(plan_name), nullif(trim(plan_description), ''), coalesce(plan_max_users, 50), plan_max_customers, coalesce(plan_active, true))
    returning * into upserted;
  else
    update public.plans set
      code = trim(plan_code),
      name = trim(plan_name),
      description = nullif(trim(plan_description), ''),
      max_users = coalesce(plan_max_users, max_users),
      max_customers = plan_max_customers,
      active = coalesce(plan_active, active),
      updated_at = now()
    where id = target_plan_id
    returning * into upserted;
    if not found then raise exception 'Plano não encontrado.' using errcode = 'P0002'; end if;
  end if;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (null, auth.uid(), 'plan.upserted', 'plan', upserted.id, jsonb_build_object('code', upserted.code, 'name', upserted.name));

  return jsonb_build_object('id', upserted.id);
end;
$$;

create or replace function public.platform_set_tenant_plan(target_tenant_id bigint, target_plan_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare before_plan_id bigint;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode atribuir planos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plans where id = target_plan_id) then
    raise exception 'Plano não encontrado.' using errcode = 'P0002';
  end if;

  select plan_id into before_plan_id from public.tenants where id = target_tenant_id for update;
  if not found then raise exception 'Oficina não encontrada.' using errcode = 'P0002'; end if;

  update public.tenants set plan_id = target_plan_id, updated_at = now() where id = target_tenant_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (target_tenant_id, auth.uid(), 'tenant.plan_changed', 'tenant', target_tenant_id, jsonb_build_object('planId', before_plan_id), jsonb_build_object('planId', target_plan_id));

  return jsonb_build_object('success', true);
end;
$$;

-- 3) Super Admin: editar dados gerais/contato/marca da oficina numa chamada só.
--    Trocar o slug é opcional (null = mantém) para permitir que o front peça
--    confirmação separada antes de enviar essa mudança específica.
create or replace function public.platform_update_tenant_details(
  target_tenant_id bigint,
  tenant_name text,
  tenant_slug text default null,
  contact_whatsapp text default null,
  contact_email text default null,
  contact_phone text default null,
  legal_name_input text default null,
  document_input text default null,
  primary_color_input text default null,
  secondary_color_input text default null,
  accent_color_input text default null,
  logo_url_input text default null,
  public_title_input text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode editar oficinas.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tenants where id = target_tenant_id) then
    raise exception 'Oficina não encontrada.' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(tenant_name, ''))) < 3 or length(trim(tenant_name)) > 160 then
    raise exception 'Nome comercial inválido.' using errcode = '22023';
  end if;
  if tenant_slug is not null and tenant_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Identificador público inválido.' using errcode = '22023';
  end if;

  update public.tenants set
    name = trim(tenant_name),
    slug = coalesce(tenant_slug, slug),
    updated_at = now()
  where id = target_tenant_id;

  insert into public.tenant_settings (tenant_id, whatsapp, email, phone, legal_name, document)
  values (target_tenant_id, nullif(trim(contact_whatsapp), ''), nullif(trim(contact_email), ''), nullif(trim(contact_phone), ''), nullif(trim(legal_name_input), ''), nullif(trim(document_input), ''))
  on conflict (tenant_id) do update set
    whatsapp = excluded.whatsapp,
    email = excluded.email,
    phone = excluded.phone,
    legal_name = excluded.legal_name,
    document = excluded.document,
    updated_at = now();

  insert into public.tenant_branding (tenant_id, primary_color, secondary_color, accent_color, logo_url, public_title)
  values (target_tenant_id, coalesce(nullif(trim(primary_color_input), ''), '#E84D1C'), coalesce(nullif(trim(secondary_color_input), ''), '#171717'), coalesce(nullif(trim(accent_color_input), ''), '#F5B33A'), nullif(trim(logo_url_input), ''), nullif(trim(public_title_input), ''))
  on conflict (tenant_id) do update set
    primary_color = coalesce(nullif(trim(primary_color_input), ''), public.tenant_branding.primary_color),
    secondary_color = coalesce(nullif(trim(secondary_color_input), ''), public.tenant_branding.secondary_color),
    accent_color = coalesce(nullif(trim(accent_color_input), ''), public.tenant_branding.accent_color),
    logo_url = excluded.logo_url,
    public_title = excluded.public_title,
    updated_at = now();

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after)
  values (target_tenant_id, auth.uid(), 'tenant.details_updated', 'tenant', target_tenant_id, jsonb_build_object('name', trim(tenant_name), 'slugChanged', tenant_slug is not null));

  return jsonb_build_object('success', true);
end;
$$;

-- 4) platform_list_tenants ganha o plano atual e os dados de contato/marca
--    para preencher o formulário de edição sem uma segunda chamada.
create or replace function public.platform_list_tenants()
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare payload jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'Apenas o Super Admin pode listar as oficinas.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'slug', t.slug,
    'status', t.status,
    'active', t.active,
    'isDemo', t.is_demo,
    'createdAt', t.created_at,
    'publicIntakeLink', '/solicitar/' || t.slug,
    'memberCount', (select count(*) from public.tenant_members tm where tm.tenant_id = t.id and tm.active),
    'ownerName', p.name,
    'ownerEmail', p.email,
    'planId', t.plan_id,
    'planName', pl.name,
    'contact', jsonb_build_object('whatsapp', ts.whatsapp, 'email', ts.email, 'phone', ts.phone, 'legalName', ts.legal_name, 'document', ts.document),
    'branding', jsonb_build_object('primaryColor', tb.primary_color, 'secondaryColor', tb.secondary_color, 'accentColor', tb.accent_color, 'logoUrl', tb.logo_url, 'publicTitle', tb.public_title)
  ) order by t.created_at desc), '[]'::jsonb)
  into payload
  from public.tenants t
  left join public.profiles p on p.id = t.primary_owner_user_id
  left join public.plans pl on pl.id = t.plan_id
  left join public.tenant_settings ts on ts.tenant_id = t.id
  left join public.tenant_branding tb on tb.tenant_id = t.id;

  return coalesce(payload, '[]'::jsonb);
end;
$$;

revoke all on function public.platform_list_plans() from public, anon, authenticated;
grant execute on function public.platform_list_plans() to authenticated;
revoke all on function public.platform_upsert_plan(bigint, text, text, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.platform_upsert_plan(bigint, text, text, text, integer, integer, boolean) to authenticated;
revoke all on function public.platform_set_tenant_plan(bigint, bigint) from public, anon, authenticated;
grant execute on function public.platform_set_tenant_plan(bigint, bigint) to authenticated;
revoke all on function public.platform_update_tenant_details(bigint, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.platform_update_tenant_details(bigint, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
