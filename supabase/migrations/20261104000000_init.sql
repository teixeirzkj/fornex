-- =====================================================================
-- Fornexa — schema inicial
-- Plataforma SaaS de acesso e gestão de fornecedores.
-- Toda tabela pública tem RLS habilitado. Papel (role) e assinatura
-- nunca são editáveis pelo próprio usuário.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Utilitário: updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =====================================================================
-- PROFILES (1:1 com auth.users)
-- =====================================================================
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 30),
  company     text check (char_length(company) <= 120),
  avatar_url  text check (char_length(avatar_url) <= 500),
  role        text not null default 'customer' check (role in ('customer', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Cria o profile automaticamente no cadastro
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do profile sincronizado
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Papel do usuário logado (security definer evita recursão de RLS)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- =====================================================================
-- PLANS
-- =====================================================================
create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name          text not null,
  description   text,
  price_cents   integer not null default 0 check (price_cents >= 0),
  interval      text not null check (interval in ('free', 'month', 'year', 'lifetime')),  -- lifetime = pagamento único
  installments  integer not null default 1 check (installments between 1 and 12),       -- parcelas no cartão (vitalício)
  features_title text,                                -- ex.: 'Tudo do plano Básico, mais:'
  cta_label     text,                                 -- texto do botão
  badge         text,                                 -- selo, ex.: 'Melhor escolha'
  access_level  integer not null default 0 check (access_level between 0 and 100),
  features      jsonb not null default '[]'::jsonb,  -- lista de textos exibidos
  limits        jsonb not null default '{}'::jsonb,  -- ex.: {"max_favorites": 10}
  highlight     boolean not null default false,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- =====================================================================
-- SUBSCRIPTIONS
-- =====================================================================
create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  plan_id                  uuid not null references public.plans (id),
  status                   text not null default 'pending'
                           check (status in ('pending', 'active', 'past_due', 'paused', 'canceled', 'expired')),
  gateway                  text not null default 'none' check (gateway in ('none', 'manual', 'mercadopago', 'stripe')),
  gateway_subscription_id  text,
  current_period_start     timestamptz,
  current_period_end       timestamptz,       -- null = sem expiração (ex.: plano gratuito)
  cancel_at_period_end     boolean not null default false,
  canceled_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);
create unique index subscriptions_gateway_id_uidx on public.subscriptions (gateway, gateway_subscription_id)
  where gateway_subscription_id is not null;
-- Apenas uma assinatura "viva" por usuário
create unique index subscriptions_one_live_per_user on public.subscriptions (user_id)
  where status in ('pending', 'active', 'past_due', 'paused');
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Nível de acesso atual do usuário logado (-1 = sem assinatura ativa)
create or replace function public.current_access_level()
returns integer language sql stable security definer set search_path = '' as $$
  select case
    when public.is_admin() then 1000
    else coalesce((
      select max(p.access_level)
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.user_id = auth.uid()
        and s.status in ('active', 'past_due')
        and (s.current_period_end is null or s.current_period_end > now())
    ), -1)
  end;
$$;

-- =====================================================================
-- PAYMENTS
-- =====================================================================
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  subscription_id     uuid references public.subscriptions (id) on delete set null,
  gateway             text not null check (gateway in ('manual', 'mercadopago', 'stripe')),
  gateway_payment_id  text,
  amount_cents        integer not null check (amount_cents >= 0),
  currency            text not null default 'BRL',
  status              text not null check (status in ('pending', 'in_process', 'approved', 'rejected', 'refunded', 'canceled')),
  description         text,
  paid_at             timestamptz,
  created_at          timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id);
create unique index payments_gateway_uidx on public.payments (gateway, gateway_payment_id)
  where gateway_payment_id is not null;

-- =====================================================================
-- SUPPLIER CATEGORIES
-- =====================================================================
create table public.supplier_categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 60),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  description  text check (char_length(description) <= 300),
  icon         text not null default 'package',  -- nome do ícone Lucide
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- SUPPLIERS
-- =====================================================================
create table public.suppliers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 2 and 120),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{2,120}$'),
  logo_url          text,
  category_id       uuid references public.supplier_categories (id) on delete set null,
  description       text check (char_length(description) <= 4000),
  city              text,
  state             text check (state is null or state ~ '^[A-Z]{2}$'),
  phone             text,
  whatsapp          text,
  email             text,
  website           text check (website is null or website ~* '^https?://'),
  instagram         text,
  facebook          text,
  tiktok            text,
  commercial_terms  text check (char_length(commercial_terms) <= 4000),
  min_order         text,
  shipping_info     text,
  notes             text check (char_length(notes) <= 4000),
  tags              text[] not null default '{}',
  min_access_level  integer not null default 1 check (min_access_level between 0 and 100),
  is_verified       boolean not null default false,
  is_demo           boolean not null default false,  -- dados de demonstração (supabase/demo)
  is_published      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index suppliers_category_idx on public.suppliers (category_id);
create index suppliers_state_idx on public.suppliers (state);
create index suppliers_name_trgm_idx on public.suppliers (lower(name));
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

create or replace function public.can_view_supplier(p_supplier_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.suppliers s
    where s.id = p_supplier_id
      and s.is_published
      and s.min_access_level <= public.current_access_level()
  );
$$;

-- =====================================================================
-- INTEGRATIONS (+ logs)
-- Segredos NUNCA ficam no banco: config.secret_env guarda o NOME de uma
-- variável de ambiente das Edge Functions (prefixo obrigatório SUPPLIER_).
-- =====================================================================
create table public.integrations (
  id                uuid primary key default gen_random_uuid(),
  supplier_id       uuid not null references public.suppliers (id) on delete cascade,
  name              text not null,
  type              text not null check (type in ('rest_api', 'webhook', 'csv', 'manual')),
  status            text not null default 'draft' check (status in ('draft', 'active', 'paused', 'error')),
  config            jsonb not null default '{}'::jsonb,
  sync_interval_minutes integer check (sync_interval_minutes is null or sync_interval_minutes >= 15),
  last_sync_at      timestamptz,
  last_sync_status  text check (last_sync_status in ('success', 'partial', 'error')),
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index integrations_supplier_idx on public.integrations (supplier_id);
create trigger integrations_updated_at before update on public.integrations
  for each row execute function public.set_updated_at();

create table public.integration_logs (
  id               uuid primary key default gen_random_uuid(),
  integration_id   uuid references public.integrations (id) on delete cascade,
  supplier_id      uuid references public.suppliers (id) on delete cascade,
  level            text not null default 'info' check (level in ('info', 'warn', 'error')),
  event            text not null check (event in ('sync', 'webhook', 'import', 'test', 'config')),
  message          text not null,
  items_processed  integer not null default 0,
  details          jsonb,
  created_at       timestamptz not null default now()
);
create index integration_logs_integration_idx on public.integration_logs (integration_id, created_at desc);

-- =====================================================================
-- SUPPLIER PRODUCTS
-- =====================================================================
create table public.supplier_products (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers (id) on delete cascade,
  integration_id  uuid references public.integrations (id) on delete set null,
  external_id     text,
  name            text not null check (char_length(name) between 1 and 300),
  sku             text,
  description     text,
  price_cents     integer check (price_cents is null or price_cents >= 0),
  stock           integer,
  image_url       text,
  product_url     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (supplier_id, external_id)
);
create index supplier_products_supplier_idx on public.supplier_products (supplier_id);
create trigger supplier_products_updated_at before update on public.supplier_products
  for each row execute function public.set_updated_at();

-- =====================================================================
-- FAVORITES / VIEWS (histórico) / SEARCH HISTORY
-- =====================================================================
create table public.favorites (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  supplier_id  uuid not null references public.suppliers (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, supplier_id)
);

create table public.supplier_views (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  supplier_id  uuid not null references public.suppliers (id) on delete cascade,
  view_count   integer not null default 1,
  viewed_at    timestamptz not null default now(),
  primary key (user_id, supplier_id)
);
create index supplier_views_recent_idx on public.supplier_views (user_id, viewed_at desc);

create table public.search_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  query       text not null check (char_length(query) between 1 and 120),
  filters     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index search_history_user_idx on public.search_history (user_id, created_at desc);

-- Registra visualização (upsert + contador) de forma atômica
create or replace function public.track_supplier_view(p_supplier_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_view_supplier(p_supplier_id) then
    return;
  end if;
  insert into public.supplier_views (user_id, supplier_id)
  values (auth.uid(), p_supplier_id)
  on conflict (user_id, supplier_id)
  do update set view_count = public.supplier_views.view_count + 1, viewed_at = now();
end $$;

-- =====================================================================
-- NOTIFICATIONS (atualizações da plataforma)
-- user_id null = comunicado para todos os assinantes
-- =====================================================================
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles (id) on delete cascade,
  kind          text not null default 'update' check (kind in ('update', 'new_supplier', 'system', 'billing')),
  title         text not null check (char_length(title) between 2 and 140),
  body          text check (char_length(body) <= 4000),
  link          text check (link is null or link ~ '^(/|https://)'),
  published_at  timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index notifications_published_idx on public.notifications (published_at desc);

create table public.notification_reads (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  notification_id  uuid not null references public.notifications (id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (user_id, notification_id)
);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.profiles            enable row level security;
alter table public.plans               enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.payments            enable row level security;
alter table public.supplier_categories enable row level security;
alter table public.suppliers           enable row level security;
alter table public.supplier_products   enable row level security;
alter table public.integrations        enable row level security;
alter table public.integration_logs    enable row level security;
alter table public.favorites           enable row level security;
alter table public.supplier_views      enable row level security;
alter table public.search_history      enable row level security;
alter table public.notifications       enable row level security;
alter table public.notification_reads  enable row level security;

-- PROFILES
create policy "profiles: dono lê" on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));
create policy "profiles: dono edita" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Só estas colunas podem ser editadas pelo usuário (role/email ficam protegidos)
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, company, avatar_url) on public.profiles to authenticated;

-- PLANS (catálogo público de planos ativos)
create policy "plans: leitura pública dos ativos" on public.plans for select to anon, authenticated
  using (is_active or (select public.is_admin()));
create policy "plans: admin gerencia" on public.plans for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- SUBSCRIPTIONS (usuário só lê as próprias; escrita só admin/servidor)
create policy "subscriptions: dono lê" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "subscriptions: admin gerencia" on public.subscriptions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- PAYMENTS
create policy "payments: dono lê" on public.payments for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "payments: admin gerencia" on public.payments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- CATEGORIES (nomes de categorias são públicos, intencionalmente)
create policy "categories: leitura pública" on public.supplier_categories for select to anon, authenticated
  using (true);
create policy "categories: admin gerencia" on public.supplier_categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- SUPPLIERS (somente assinantes com nível suficiente)
create policy "suppliers: assinantes leem" on public.suppliers for select to authenticated
  using ((select public.is_admin()) or (is_published and min_access_level <= (select public.current_access_level())));
create policy "suppliers: admin gerencia" on public.suppliers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- SUPPLIER PRODUCTS
create policy "products: assinantes leem" on public.supplier_products for select to authenticated
  using (public.can_view_supplier(supplier_id));
create policy "products: admin gerencia" on public.supplier_products for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- INTEGRATIONS / LOGS (somente admin)
create policy "integrations: admin" on public.integrations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "integration_logs: admin" on public.integration_logs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- FAVORITES
create policy "favorites: dono lê" on public.favorites for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "favorites: dono cria" on public.favorites for insert to authenticated
  with check ((select auth.uid()) = user_id and public.can_view_supplier(supplier_id));
create policy "favorites: dono remove" on public.favorites for delete to authenticated
  using ((select auth.uid()) = user_id);

-- SUPPLIER VIEWS (escrita via track_supplier_view)
create policy "views: dono lê" on public.supplier_views for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "views: dono limpa" on public.supplier_views for delete to authenticated
  using ((select auth.uid()) = user_id);

-- SEARCH HISTORY
create policy "search: dono lê" on public.search_history for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "search: dono cria" on public.search_history for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "search: dono remove" on public.search_history for delete to authenticated
  using ((select auth.uid()) = user_id);

-- NOTIFICATIONS
create policy "notifications: destinatário lê" on public.notifications for select to authenticated
  using ((user_id is null and published_at <= now()) or (select auth.uid()) = user_id or (select public.is_admin()));
create policy "notifications: admin gerencia" on public.notifications for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "reads: dono lê" on public.notification_reads for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "reads: dono marca" on public.notification_reads for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- =====================================================================
-- RPCs
-- =====================================================================

-- Estatísticas públicas reais (somente contagens) para a landing page
create or replace function public.public_platform_stats()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'suppliers',  (select count(*) from public.suppliers where is_published and not is_demo),
    'categories', (select count(*) from public.supplier_categories),
    'products',   (select count(*) from public.supplier_products p
                     join public.suppliers s on s.id = p.supplier_id
                    where s.is_published and not s.is_demo and p.is_active),
    'states',     (select count(distinct state) from public.suppliers where is_published and not is_demo and state is not null)
  );
$$;
grant execute on function public.public_platform_stats() to anon, authenticated;

-- Contagem de fornecedores por categoria (pública, só números)
create or replace function public.public_category_counts()
returns table (category_id uuid, total bigint) language sql stable security definer set search_path = '' as $$
  select category_id, count(*) from public.suppliers
  where is_published and not is_demo and category_id is not null
  group by category_id;
$$;
grant execute on function public.public_category_counts() to anon, authenticated;

-- Ativa o plano gratuito (se existir e o usuário não tiver assinatura viva)
create or replace function public.activate_free_plan()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_plan uuid;
  v_sub  uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select id into v_plan from public.plans
   where interval = 'free' and is_active order by sort_order limit 1;
  if v_plan is null then raise exception 'free_plan_unavailable'; end if;

  if exists (select 1 from public.subscriptions
              where user_id = auth.uid() and status in ('active', 'past_due', 'paused')) then
    raise exception 'already_subscribed';
  end if;

  -- descarta checkouts pendentes abandonados
  update public.subscriptions set status = 'canceled', canceled_at = now()
   where user_id = auth.uid() and status = 'pending';

  insert into public.subscriptions (user_id, plan_id, status, gateway, current_period_start)
  values (auth.uid(), v_plan, 'active', 'none', now())
  returning id into v_sub;
  return v_sub;
end $$;
revoke execute on function public.activate_free_plan() from anon;

-- Cancela plano gratuito/manual do próprio usuário (gateway pago: via Edge Function)
create or replace function public.cancel_my_free_subscription()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.subscriptions
     set status = 'canceled', canceled_at = now()
   where user_id = auth.uid() and gateway = 'none' and status = 'active';
end $$;
revoke execute on function public.cancel_my_free_subscription() from anon;

-- Admin: alterar papel de um usuário
create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_role not in ('customer', 'admin') then raise exception 'invalid_role'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then raise exception 'cannot_demote_self'; end if;
  update public.profiles set role = p_role where id = p_user_id;
end $$;

-- Admin: conceder acesso manual (cortesia, pagamento por fora, etc.)
create or replace function public.admin_grant_subscription(p_user_id uuid, p_plan_id uuid, p_days integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_sub uuid;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then raise exception 'invalid_days'; end if;

  update public.subscriptions set status = 'canceled', canceled_at = now()
   where user_id = p_user_id and status in ('pending', 'active', 'past_due', 'paused');

  insert into public.subscriptions (user_id, plan_id, status, gateway, current_period_start, current_period_end)
  values (p_user_id, p_plan_id, 'active', 'manual', now(),
          case when p_days is null then null else now() + make_interval(days => p_days) end)
  returning id into v_sub;
  return v_sub;
end $$;

-- Admin: indicadores
create or replace function public.admin_metrics()
returns json language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return json_build_object(
    'customers',            (select count(*) from public.profiles where role = 'customer'),
    'new_customers_30d',    (select count(*) from public.profiles where role = 'customer' and created_at > now() - interval '30 days'),
    'active_subscriptions', (select count(*) from public.subscriptions where status in ('active', 'past_due')
                               and (current_period_end is null or current_period_end > now())),
    'paid_subscriptions',   (select count(*) from public.subscriptions s join public.plans p on p.id = s.plan_id
                              where s.status in ('active', 'past_due') and p.price_cents > 0
                                and (s.current_period_end is null or s.current_period_end > now())),
    'mrr_cents',            (select coalesce(sum(case when p.interval = 'year' then p.price_cents / 12 else p.price_cents end), 0)
                               from public.subscriptions s join public.plans p on p.id = s.plan_id
                              where s.status in ('active', 'past_due') and p.price_cents > 0 and p.interval in ('month', 'year')
                                and (s.current_period_end is null or s.current_period_end > now())),
    'revenue_30d_cents',    (select coalesce(sum(amount_cents), 0) from public.payments
                              where status = 'approved' and paid_at > now() - interval '30 days'),
    'suppliers',            (select count(*) from public.suppliers),
    'suppliers_published',  (select count(*) from public.suppliers where is_published),
    'products',             (select count(*) from public.supplier_products),
    'integrations_active',  (select count(*) from public.integrations where status = 'active'),
    'integrations_error',   (select count(*) from public.integrations where status = 'error'),
    'views_30d',            (select coalesce(sum(view_count), 0) from public.supplier_views where viewed_at > now() - interval '30 days')
  );
end $$;

-- Mais visualizados (admin)
create or replace function public.admin_top_suppliers(p_limit integer default 5)
returns table (supplier_id uuid, name text, views bigint) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
    select s.id, s.name, coalesce(sum(v.view_count), 0)::bigint
      from public.suppliers s
      left join public.supplier_views v on v.supplier_id = s.id
     group by s.id, s.name
     order by 3 desc
     limit least(greatest(p_limit, 1), 50);
end $$;

-- Funções internas não devem ser chamadas pelo anon
revoke execute on function public.admin_set_role(uuid, text) from anon;
revoke execute on function public.admin_grant_subscription(uuid, uuid, integer) from anon;
revoke execute on function public.admin_metrics() from anon;
revoke execute on function public.admin_top_suppliers(integer) from anon;
revoke execute on function public.track_supplier_view(uuid) from anon;

-- =====================================================================
-- STORAGE: logos de fornecedores (leitura pública, escrita só admin)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-logos', 'supplier-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "logos: admin envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'supplier-logos' and (select public.is_admin()));
create policy "logos: admin atualiza" on storage.objects for update to authenticated
  using (bucket_id = 'supplier-logos' and (select public.is_admin()))
  with check (bucket_id = 'supplier-logos' and (select public.is_admin()));
create policy "logos: admin remove" on storage.objects for delete to authenticated
  using (bucket_id = 'supplier-logos' and (select public.is_admin()));
