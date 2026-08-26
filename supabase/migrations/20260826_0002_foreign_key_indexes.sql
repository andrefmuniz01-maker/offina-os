-- Add a covering index for every single-column foreign key in the OficinaOS domain.
-- The project is currently empty; this migration changes no application data.
do $$
declare
  fk record;
  index_name text;
begin
  for fk in
    select
      c.conrelid::regclass as table_name,
      a.attname as column_name,
      replace(c.conrelid::regclass::text, 'public.', '') as relation_name
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and cardinality(c.conkey) = 1
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and i.indkey[0] = c.conkey[1]
      )
  loop
    index_name := left('ofi_fk_' || fk.relation_name || '_' || fk.column_name || '_idx', 63);
    execute format('create index if not exists %I on %s (%I)', index_name, fk.table_name, fk.column_name);
  end loop;
end $$;
