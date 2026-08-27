-- Remove as fachadas públicas experimentais da primeira implementação Demo.
-- O runtime usa public_quote_view/public_decide_quote via Service Role no servidor.

drop function if exists public.public_view_quote(text);
drop function if exists public.public_decide_quote(text, text);
