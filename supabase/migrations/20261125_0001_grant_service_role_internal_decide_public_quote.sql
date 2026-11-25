-- A fachada public.public_decide_quote (security invoker) chama
-- private.internal_decide_public_quote como service_role, mas esse papel nunca
-- recebeu EXECUTE na função interna: toda aprovação/recusa pela página pública
-- do orçamento voltava 403 (permission denied). A função interna já é
-- security definer e valida token, validade, status e estoque; service_role é
-- o papel do servidor (nunca exposto ao navegador).
grant execute on function private.internal_decide_public_quote(text, text) to service_role;
