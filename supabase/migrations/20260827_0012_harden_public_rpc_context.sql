-- As duas RPCs abaixo são endpoints públicos intencionais: uma retorna catálogo comercial
-- limitado e a outra recebe uma solicitação. Elas precisam de SECURITY DEFINER porque o
-- visitante não possui uma sessão/tenant, mas não devem herdar um search_path controlável.
alter function public.public_get_workshop_catalog(text)
  set search_path = '';

alter function public.public_submit_quote_request(
  text, text, text, text, text, text, integer, text, integer, bigint, text, text, jsonb
)
  set search_path = '';

-- O Postgres concede EXECUTE a PUBLIC por padrão; revogar explicitamente torna a exceção
-- auditável. Reaplica-se somente o acesso anon inevitável dos dois endpoints públicos.
revoke all on function public.public_get_workshop_catalog(text)
  from public, authenticated;
grant execute on function public.public_get_workshop_catalog(text) to anon;

revoke all on function public.public_submit_quote_request(
  text, text, text, text, text, text, integer, text, integer, bigint, text, text, jsonb
)
  from public, authenticated;
grant execute on function public.public_submit_quote_request(
  text, text, text, text, text, text, integer, text, integer, bigint, text, text, jsonb
) to anon;

comment on function public.public_get_workshop_catalog(text) is
  'Endpoint público intencional: retorna apenas catálogo comercial do tenant ativo por slug; SECURITY DEFINER com search_path vazio.';

comment on function public.public_submit_quote_request(
  text, text, text, text, text, text, integer, text, integer, bigint, text, text, jsonb
) is
  'Endpoint público intencional: registra somente quote_request com validação de entrada; SECURITY DEFINER com search_path vazio.';
