-- Atendimento: membros ativos podem cadastrar e atualizar clientes e veículos.
-- Auditoria: registros são somente append, com leitura restrita à gestão do tenant.

 drop policy if exists customers_insert on public.customers;
 drop policy if exists customers_update on public.customers;
 create policy customers_insert on public.customers for insert to authenticated
   with check (private.is_active_member(tenant_id));
 create policy customers_update on public.customers for update to authenticated
   using (private.is_active_member(tenant_id))
   with check (private.is_active_member(tenant_id));

 drop policy if exists vehicles_insert on public.vehicles;
 drop policy if exists vehicles_update on public.vehicles;
 create policy vehicles_insert on public.vehicles for insert to authenticated
   with check (private.is_active_member(tenant_id));
 create policy vehicles_update on public.vehicles for update to authenticated
   using (private.is_active_member(tenant_id))
   with check (private.is_active_member(tenant_id));

 drop policy if exists audit_logs_read on public.audit_logs;
 drop policy if exists audit_logs_insert on public.audit_logs;
 drop policy if exists audit_logs_update on public.audit_logs;
 drop policy if exists audit_logs_delete on public.audit_logs;
 create policy audit_logs_read on public.audit_logs for select to authenticated
   using (private.can_manage_tenant(tenant_id));
 create policy audit_logs_append on public.audit_logs for insert to authenticated
   with check (private.is_active_member(tenant_id) and actor_user_id = auth.uid());
