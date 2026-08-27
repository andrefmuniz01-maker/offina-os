-- Remove view SECURITY DEFINER exposta e limita o catálogo público a uma função com saída controlada.
drop view if exists public.public_workshop_catalog;

create or replace function public.public_get_workshop_catalog(target_tenant_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_tenant public.tenants%rowtype;
  payload jsonb;
begin
  if target_tenant_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Identificador público inválido.' using errcode = '22023';
  end if;

  select * into target_tenant
  from public.tenants
  where slug = trim(lower(target_tenant_slug)) and active and status = 'active';
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'workshop', jsonb_build_object(
      'id', target_tenant.id,
      'name', target_tenant.name,
      'slug', target_tenant.slug,
      'branding', coalesce((
        select jsonb_build_object(
          'logoUrl', b.logo_url,
          'primaryColor', b.primary_color,
          'secondaryColor', b.secondary_color,
          'accentColor', b.accent_color,
          'publicTitle', b.public_title
        )
        from public.tenant_branding b
        where b.tenant_id = target_tenant.id
      ), '{}'::jsonb)
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'quoteQuestions', s.quote_questions
      ) order by s.name)
      from public.services s
      where s.tenant_id = target_tenant.id and s.active
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

revoke all on function public.public_get_workshop_catalog(text) from public, authenticated;
grant execute on function public.public_get_workshop_catalog(text) to anon;
