-- Corrige o vínculo inverso agenda -> OS para o tenant demonstrativo existente.
-- Não altera registros fora do slug fixo da Demo.

do $$
begin
  update public.appointments a
  set work_order_id = wo.id,
      updated_at = now()
  from public.work_orders wo
  join public.tenants t on t.id = wo.tenant_id
  where a.tenant_id = wo.tenant_id
    and a.id = wo.appointment_id
    and t.slug = 'performance-garage'
    and t.is_demo
    and a.work_order_id is distinct from wo.id;
end;
$$;
