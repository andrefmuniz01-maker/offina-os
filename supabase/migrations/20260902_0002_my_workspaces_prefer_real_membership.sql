-- my_workspaces() devolve toda oficina ativa para um Super Admin (o bypass de
-- is_active_member em private.is_active_member não se limita à oficina demo),
-- com role="owner" fabricado quando não há vínculo real. Páginas que pegam
-- "a oficina atual" como mine.data[0] (ordenado por nome) acabam escolhendo
-- uma oficina arbitrária para o Super Admin -- foi assim que /equipe abriu
-- "Auto Prime Centro Automotivo" em vez da oficina onde o Super Admin
-- realmente tinha acabado de conceder/revogar acesso. Expõe is_member para
-- que o cliente possa preferir um vínculo real antes de cair no primeiro
-- item da lista.
drop function if exists public.my_workspaces();

create function public.my_workspaces()
returns table(tenant_id bigint, name text, slug text, status public.tenant_status, active boolean, is_demo boolean, role public.member_role, permissions jsonb, is_member boolean)
language sql
security invoker
set search_path = 'public'
as $$
  select t.id, t.name, t.slug, t.status, t.active, t.is_demo, coalesce(tm.role, 'owner'::public.member_role), tm.permissions, (tm.tenant_id is not null)
  from public.tenants t
  left join public.tenant_members tm on tm.tenant_id = t.id and tm.user_id = auth.uid() and tm.active
  where t.active and t.status in ('trial', 'active')
  order by t.name;
$$;
