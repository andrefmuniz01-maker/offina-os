-- As antigas RPCs públicas não fazem parte da cadeia Supabase atual. A leitura
-- e a decisão por token passam exclusivamente pelo tRPC de servidor.
revoke all on function public.public_view_quote(text) from public, anon, authenticated;
revoke all on function public.public_decide_quote(text, text) from public, anon, authenticated;
