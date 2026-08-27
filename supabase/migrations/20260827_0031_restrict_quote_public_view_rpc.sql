-- A consulta de proposta por token é exposta pela API do servidor, não diretamente
-- pelo PostgREST anônimo. O Service Role continua exclusivamente no backend.
revoke all on function public.public_quote_view(text) from anon, authenticated, public;
grant execute on function public.public_quote_view(text) to service_role;
