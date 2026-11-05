-- Integração nativa com o DSlite (agregador de fornecedores nacionais).
-- config: { env: 'production'|'homologacao', secret_env: 'SUPPLIER_...', fornecedorid, price_field, sync_cursor? }
alter table public.integrations drop constraint if exists integrations_type_check;
alter table public.integrations add constraint integrations_type_check
  check (type in ('rest_api', 'webhook', 'csv', 'manual', 'dslite'));
