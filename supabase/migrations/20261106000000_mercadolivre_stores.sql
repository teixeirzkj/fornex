-- =====================================================================
-- Lojas do Mercado Livre dos clientes + anúncios publicados pela FORNEX
-- Tokens OAuth ficam no Supabase Vault (criptografados), nunca em colunas
-- legíveis. O navegador só lê dados não sensíveis da própria loja.
-- =====================================================================

-- Limite de lojas por plano (Básico 4, Vitalício 10)
update public.plans set limits = limits || '{"max_stores": 4}'::jsonb  where slug = 'basico';
update public.plans set limits = limits || '{"max_stores": 10}'::jsonb where slug = 'vitalicio';

create table public.ml_accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  ml_user_id         bigint not null,
  nickname           text,
  site_id            text not null default 'MLB',
  status             text not null default 'active' check (status in ('active', 'reconnect', 'revoked')),
  access_secret_id   uuid,          -- referência no vault.secrets
  refresh_secret_id  uuid,          -- referência no vault.secrets
  expires_at         timestamptz,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, ml_user_id)
);
create index ml_accounts_ml_user_idx on public.ml_accounts (ml_user_id);
create trigger ml_accounts_updated_at before update on public.ml_accounts
  for each row execute function public.set_updated_at();

-- Estado temporário do fluxo OAuth (PKCE). Só o servidor acessa.
create table public.ml_oauth_states (
  state          text primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  code_verifier  text not null,
  created_at     timestamptz not null default now()
);

create table public.ml_listings (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  ml_account_id        uuid not null references public.ml_accounts (id) on delete cascade,
  supplier_product_id  uuid references public.supplier_products (id) on delete set null,
  ml_item_id           text,
  permalink            text,
  title                text not null,
  price_cents          integer not null check (price_cents > 0),
  markup_percent       numeric(6,2) not null default 0 check (markup_percent between 0 and 1000),
  listing_type         text not null default 'gold_special' check (listing_type in ('gold_special', 'gold_pro')),
  available_quantity   integer not null default 0,
  status               text not null default 'pending' check (status in ('pending', 'active', 'paused', 'closed', 'under_review', 'error')),
  last_error           text,
  last_synced_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (ml_account_id, supplier_product_id)
);
create index ml_listings_user_idx on public.ml_listings (user_id, created_at desc);
create index ml_listings_item_idx on public.ml_listings (ml_item_id);
create trigger ml_listings_updated_at before update on public.ml_listings
  for each row execute function public.set_updated_at();

alter table public.ml_accounts     enable row level security;
alter table public.ml_oauth_states enable row level security;   -- sem políticas: só service_role
alter table public.ml_listings     enable row level security;

-- Cliente lê só as próprias lojas e anúncios. Escrita apenas via Edge Functions.
create policy "ml_accounts: dono lê" on public.ml_accounts for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "ml_listings: dono lê" on public.ml_listings for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

-- Colunas de referência ao cofre não são expostas ao navegador
revoke select on public.ml_accounts from anon, authenticated;
grant select (id, user_id, ml_user_id, nickname, site_id, status, expires_at, last_error, created_at, updated_at)
  on public.ml_accounts to authenticated;
revoke insert, update, delete on public.ml_accounts, public.ml_listings, public.ml_oauth_states from anon, authenticated;

-- ---------------------------------------------------------------------
-- Cofre de tokens (somente service_role / Edge Functions)
-- ---------------------------------------------------------------------
create or replace function public.ml_store_tokens(p_account_id uuid, p_access text, p_refresh text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_access uuid; v_refresh uuid;
begin
  select access_secret_id, refresh_secret_id into v_access, v_refresh
    from public.ml_accounts where id = p_account_id;

  if v_access is null then
    v_access := vault.create_secret(p_access, 'ml_access_' || p_account_id::text, 'Token de acesso Mercado Livre');
  else
    perform vault.update_secret(v_access, p_access);
  end if;

  if p_refresh is not null then
    if v_refresh is null then
      v_refresh := vault.create_secret(p_refresh, 'ml_refresh_' || p_account_id::text, 'Refresh token Mercado Livre');
    else
      perform vault.update_secret(v_refresh, p_refresh);
    end if;
  end if;

  update public.ml_accounts
     set access_secret_id = v_access, refresh_secret_id = v_refresh,
         expires_at = p_expires_at, status = 'active', last_error = null
   where id = p_account_id;
end $$;

create or replace function public.ml_get_tokens(p_account_id uuid)
returns table (access_token text, refresh_token text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where id = a.access_secret_id),
    (select decrypted_secret from vault.decrypted_secrets where id = a.refresh_secret_id),
    a.expires_at
  from public.ml_accounts a where a.id = p_account_id;
$$;

-- Ao remover a loja, apaga os tokens do cofre
create or replace function public.ml_accounts_cleanup_vault()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id in (old.access_secret_id, old.refresh_secret_id);
  return old;
end $$;
create trigger ml_accounts_cleanup after delete on public.ml_accounts
  for each row execute function public.ml_accounts_cleanup_vault();

revoke execute on function public.ml_store_tokens(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.ml_get_tokens(uuid) from public, anon, authenticated;
revoke execute on function public.ml_accounts_cleanup_vault() from public, anon, authenticated;
grant execute on function public.ml_store_tokens(uuid, text, text, timestamptz) to service_role;
grant execute on function public.ml_get_tokens(uuid) to service_role;
