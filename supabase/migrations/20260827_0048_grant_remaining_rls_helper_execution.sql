-- As policies de RLS dos módulos operacionais chamam estes auxiliares
-- SECURITY DEFINER. O banco exige EXECUTE para avaliar a policy; sem isso,
-- a consulta autenticada falha antes de retornar qualquer projeção.
-- As funções permanecem no schema private e anon continua sem acesso.

revoke all on function private.can_catalog_manage(bigint) from public, anon;
revoke all on function private.can_manage_financial_catalog(bigint) from public, anon;
revoke all on function private.can_inventory_manage(bigint) from public, anon;
revoke all on function private.can_purchase_manage(bigint) from public, anon;
revoke all on function private.can_quotes_manage(bigint) from public, anon;
revoke all on function private.can_appointments_manage(bigint) from public, anon;
revoke all on function private.can_work_order_operate(bigint) from public, anon;
revoke all on function private.can_work_orders_manage(bigint) from public, anon;
revoke all on function private.can_execute_work_order(bigint, bigint) from public, anon;

grant execute on function private.can_catalog_manage(bigint) to authenticated;
grant execute on function private.can_manage_financial_catalog(bigint) to authenticated;
grant execute on function private.can_inventory_manage(bigint) to authenticated;
grant execute on function private.can_purchase_manage(bigint) to authenticated;
grant execute on function private.can_quotes_manage(bigint) to authenticated;
grant execute on function private.can_appointments_manage(bigint) to authenticated;
grant execute on function private.can_work_order_operate(bigint) to authenticated;
grant execute on function private.can_work_orders_manage(bigint) to authenticated;
grant execute on function private.can_execute_work_order(bigint, bigint) to authenticated;
