-- Remove TODOS os dados de demonstração (supabase/demo/demo_seed.sql).
-- Produtos, integrações, logs, favoritos e histórico ligados aos fornecedores demo
-- são removidos em cascata.

delete from public.notifications where id in (
  'd0000000-0000-4000-8000-0000000000b1',
  'd0000000-0000-4000-8000-0000000000b2',
  'd0000000-0000-4000-8000-0000000000b3'
);

delete from public.suppliers where is_demo = true;
