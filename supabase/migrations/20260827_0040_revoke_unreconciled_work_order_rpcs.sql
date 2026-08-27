-- As funções abaixo foram encontradas aplicadas fora das migrations do
-- repositório. Elas concediam operação por tenant ao técnico e uma delas podia
-- criar receita ao concluir a OS. Permanecem bloqueadas até a reconciliação.
revoke all on function public.workspace_work_order_detail(bigint, bigint) from public, anon, authenticated;
revoke all on function public.workspace_toggle_work_order_checklist(bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function public.workspace_update_work_order_status(bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function public.workspace_consume_work_order_product(bigint, bigint, bigint, numeric, bigint) from public, anon, authenticated;
revoke all on function public.workspace_add_work_order_note(bigint, bigint, text) from public, anon, authenticated;
