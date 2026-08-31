-- O intake público (server/routers/supabasePublicIntake.ts) chama as RPCs de
-- submissão/anexos usando o cliente Supabase Service Role, não o token do
-- usuário. As fachadas invoker em public.internal_submit_public_quote_request
-- e public.internal_finalize_public_quote_attachments delegam para as
-- implementações reais em private.*, mas o papel service_role nunca recebeu
-- USAGE no schema private nem EXECUTE nessas duas funções (só authenticated e
-- anon tinham). Resultado: toda solicitação pública falhava com
-- "permission denied for schema private" (42501), mostrado ao cliente como
-- "Não foi possível concluir sua solicitação agora." Esta migration concede
-- apenas o acesso mínimo que faltava, sem alterar nenhuma regra de negócio.

grant usage on schema private to service_role;

grant execute on function private.internal_submit_public_quote_request(
  text, text, text, text, text, text, integer, text, integer, bigint, text, text, jsonb, integer, text
) to service_role;

grant execute on function private.internal_finalize_public_quote_attachments(
  text, jsonb
) to service_role;
