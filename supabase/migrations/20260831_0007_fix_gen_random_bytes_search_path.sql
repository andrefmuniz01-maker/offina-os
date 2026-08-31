-- Bug latente descoberto ao testar a criação de orçamento do zero pela API
-- (nunca tinha sido exercitado antes: os orçamentos existentes vieram de
-- script de seed, não deste caminho). As três funções abaixo chamam
-- gen_random_bytes() sem qualificar o schema, mas a extensão pgcrypto vive
-- em "extensions", não em "public" nem "private" — e o search_path restrito
-- dessas funções não incluía "extensions". Resultado: "function
-- gen_random_bytes(integer) does not exist" ao tentar criar um rascunho ou
-- preparar o compartilhamento de uma proposta. Correção mínima: adicionar
-- extensions ao search_path já configurado, sem alterar o corpo das funções.
alter function private.create_public_quote_upload_capability(bigint, bigint, integer)
  set search_path to 'public', 'private', 'extensions', 'pg_temp';

alter function private.internal_create_quote_draft_from_request(bigint, bigint, text, text, timestamptz)
  set search_path to 'public', 'private', 'extensions', 'pg_temp';

alter function private.internal_prepare_quote_manual_share(bigint, bigint, timestamptz)
  set search_path to 'public', 'private', 'extensions', 'pg_temp';
