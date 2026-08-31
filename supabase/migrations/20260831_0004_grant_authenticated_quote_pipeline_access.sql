-- Auditoria completa: todas as fachadas invoker do pipeline comercial
-- (Solicitações -> Orçamento) delegam para funções private.internal_* que
-- nunca receberam EXECUTE para authenticated (só existiam para outras
-- variações do schema). Resultado: a fila de Solicitações, o histórico, a
-- atribuição de responsável, a preparação/criação de rascunho de orçamento a
-- partir de uma solicitação, a atualização de descontos, a finalização do
-- rascunho e o compartilhamento manual falhavam com 42501 (permission
-- denied) para QUALQUER usuário autenticado, incluindo Super Admin.
--
-- private.secure_add_work_order_note foi checada e está corretamente
-- revogada de propósito (coberta por teste em
-- supabaseWorkOrderMigration.test.ts) porque essa ação já é servida pela
-- rota legada em server/routers/operations.ts; não é tocada aqui.
--
-- Esta migration concede apenas o EXECUTE que faltava, sem alterar nenhuma
-- regra de acesso ou de negócio dentro das funções.

grant execute on function private.internal_list_workspace_quote_requests(
  bigint, text, text, integer, integer
) to authenticated;

grant execute on function private.internal_quote_request_assignees(
  bigint
) to authenticated;

grant execute on function private.internal_quote_request_history(
  bigint, bigint
) to authenticated;

grant execute on function private.internal_prepare_quote_from_request(
  bigint, bigint
) to authenticated;

grant execute on function private.internal_create_quote_draft_from_request(
  bigint, bigint, text, text, timestamptz
) to authenticated;

grant execute on function private.internal_update_quote_draft_discounts(
  bigint, bigint, jsonb, timestamptz, text
) to authenticated;

grant execute on function private.internal_finalize_quote_draft(
  bigint, bigint, timestamptz
) to authenticated;

grant execute on function private.internal_prepare_quote_manual_share(
  bigint, bigint, timestamptz
) to authenticated;

grant execute on function private.internal_update_quote_request(
  bigint, bigint, text, uuid
) to authenticated;
