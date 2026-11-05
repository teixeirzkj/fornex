-- Endurece permissões de execução das funções (Security Advisor do Supabase).
-- Por padrão o Postgres concede EXECUTE a PUBLIC; aqui cada função recebe só o mínimo.

revoke execute on all functions in schema public from public, anon, authenticated;

-- Usadas dentro das políticas RLS (inclusive na leitura pública de planos) e nas estatísticas do site
grant execute on function public.is_admin()                  to anon, authenticated;
grant execute on function public.current_access_level()      to anon, authenticated;
grant execute on function public.can_view_supplier(uuid)     to anon, authenticated;
grant execute on function public.public_platform_stats()     to anon, authenticated;
grant execute on function public.public_category_counts()    to anon, authenticated;

-- Somente usuários logados (as funções admin_* ainda verificam is_admin() internamente)
grant execute on function public.activate_free_plan()                         to authenticated;
grant execute on function public.cancel_my_free_subscription()                to authenticated;
grant execute on function public.track_supplier_view(uuid)                    to authenticated;
grant execute on function public.admin_set_role(uuid, text)                   to authenticated;
grant execute on function public.admin_grant_subscription(uuid, uuid, integer) to authenticated;
grant execute on function public.admin_metrics()                              to authenticated;
grant execute on function public.admin_top_suppliers(integer)                 to authenticated;

-- handle_new_user, handle_user_email_change e set_updated_at são funções de gatilho:
-- não precisam (e não devem) ser chamáveis via API.
