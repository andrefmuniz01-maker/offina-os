-- A migração 20260827_0041 pretendia remover fachadas experimentais de uma
-- versão anterior (public_view_quote), mas por engano derrubou também
-- public_decide_quote(text, text) -- a mesma fachada ainda em uso pela rota
-- pública de aprovar/recusar orçamento. Desde então, todo clique em
-- "Aprovar"/"Recusar" na página pública falhava com 404 (a RPC não existia
-- mais), embora a lógica interna (private.internal_decide_public_quote) nunca
-- tenha sido removida. Restaura apenas a fachada fina, idêntica à original.
create or replace function public.public_decide_quote(token_input text, decision_input text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.internal_decide_public_quote(token_input, decision_input)
$$;

revoke all on function public.public_decide_quote(text, text) from public, anon, authenticated;
grant execute on function public.public_decide_quote(text, text) to service_role;
