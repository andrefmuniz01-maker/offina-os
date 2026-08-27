-- A criação pública passa exclusivamente pelo tRPC do servidor, que aplica
-- validação e throttle antes de usar a credencial de serviço. Esta revogação
-- reforça o estado esperado se uma ACL antiga tiver permanecido no banco.
revoke all on function public.public_submit_quote_request(
  text, text, text, text, text, text, integer, text, integer, bigint, text, text, jsonb
) from public, anon, authenticated;
