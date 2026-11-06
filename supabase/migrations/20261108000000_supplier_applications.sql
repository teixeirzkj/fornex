-- =====================================================================
-- "Seja um fornecedor FORNEX": candidaturas de fornecedores
-- O público só consegue ENVIAR (via RPC com validação e limite anti-spam).
-- Ninguém além do admin consegue LER as candidaturas.
-- =====================================================================

create table public.supplier_applications (
  id                    uuid primary key default gen_random_uuid(),
  company_name          text not null check (char_length(company_name) between 2 and 120),
  cnpj                  text not null check (cnpj ~ '^\d{14}$'),
  contact_name          text not null check (char_length(contact_name) between 2 and 120),
  email                 text not null check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(email) <= 160),
  whatsapp              text not null check (whatsapp ~ '^\d{10,13}$'),
  website               text check (website is null or (website ~* '^https?://' and char_length(website) <= 300)),
  city                  text check (char_length(city) <= 80),
  state                 text check (state is null or state ~ '^[A-Z]{2}$'),
  niche                 text not null check (char_length(niche) between 2 and 80),
  catalog_method        text not null check (catalog_method in ('planilha', 'xml', 'api', 'bling', 'tiny', 'outro')),
  product_count         text check (product_count in ('ate_50', '50_200', '200_1000', 'mais_1000')),
  accepts_dropshipping  boolean not null default false,
  message               text check (char_length(message) <= 2000),
  status                text not null default 'new' check (status in ('new', 'contacted', 'approved', 'rejected')),
  admin_notes           text check (char_length(admin_notes) <= 2000),
  supplier_id           uuid references public.suppliers (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index supplier_applications_status_idx on public.supplier_applications (status, created_at desc);
create index supplier_applications_email_idx on public.supplier_applications (lower(email), created_at desc);
create trigger supplier_applications_updated_at before update on public.supplier_applications
  for each row execute function public.set_updated_at();

alter table public.supplier_applications enable row level security;
create policy "applications: admin gerencia" on public.supplier_applications for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Público não lê nem grava direto: só pela função abaixo
revoke insert, update, delete on public.supplier_applications from anon;

-- Envio público com validação e limite (máx. 3 por e-mail ou CNPJ a cada 24h)
create or replace function public.submit_supplier_application(
  p_company_name text, p_cnpj text, p_contact_name text, p_email text, p_whatsapp text,
  p_website text, p_city text, p_state text, p_niche text, p_catalog_method text,
  p_product_count text, p_accepts_dropshipping boolean, p_message text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_phone text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if (select count(*) from public.supplier_applications
       where (lower(email) = v_email or cnpj = v_cnpj) and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'too_many_applications';
  end if;

  insert into public.supplier_applications (
    company_name, cnpj, contact_name, email, whatsapp, website, city, state, niche,
    catalog_method, product_count, accepts_dropshipping, message
  ) values (
    trim(p_company_name), v_cnpj, trim(p_contact_name), v_email, v_phone,
    nullif(trim(coalesce(p_website, '')), ''), nullif(trim(coalesce(p_city, '')), ''),
    nullif(upper(trim(coalesce(p_state, ''))), ''), trim(p_niche), p_catalog_method,
    nullif(p_product_count, ''), coalesce(p_accepts_dropshipping, false), nullif(trim(coalesce(p_message, '')), '')
  ) returning id into v_id;

  -- Avisa os administradores no painel
  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'system', left('Novo fornecedor interessado: ' || trim(p_company_name), 140),
         left(trim(p_niche) || ' · ' || coalesce(nullif(trim(coalesce(p_city, '')), ''), '—') || '/' || coalesce(nullif(upper(trim(coalesce(p_state, ''))), ''), '—'), 400),
         '/admin/candidatos'
    from public.profiles p where p.role = 'admin';

  return v_id;
end $$;

revoke execute on function public.submit_supplier_application(text, text, text, text, text, text, text, text, text, text, text, boolean, text) from public;
grant execute on function public.submit_supplier_application(text, text, text, text, text, text, text, text, text, text, text, boolean, text) to anon, authenticated;
