-- Dados iniciais de CONFIGURAÇÃO (não são dados de fornecedores).
-- Revise preços e textos dos planos no painel /admin/planos antes de vender.

-- Planos:
--  Básico    → R$ 69,90/mês, assinatura recorrente (access_level 1: fornecedores do plano Básico)
--  Vitalício → 12x de R$ 19,90 no cartão (R$ 238,80, pagamento único), acesso permanente
--              (access_level 2: todos os fornecedores, inclusive os exclusivos)
-- O nível de acesso de cada fornecedor é definido em /admin/fornecedores (campo "Nível de acesso").
insert into public.plans (slug, name, description, price_cents, interval, installments, access_level,
                          features_title, features, limits, cta_label, badge, highlight, sort_order) values
('basico', 'Básico', 'Para quem está começando sua operação.', 6990, 'month', 1, 1,
  'O plano inclui:',
  '["Acesso a 5 fornecedores","Até 4 lojas no Mercado Livre","Mais de 100 produtos","Suporte da plataforma","Plano mensal"]',
  '{}', 'Começar agora', null, false, 1),
('vitalicio', 'Vitalício', 'Acesso permanente sem mensalidades.', 23880, 'lifetime', 12, 2,
  'Tudo do plano Básico, mais:',
  '["Acesso vitalício","Todos os fornecedores","Até 10 lojas no Mercado Livre","Atualizações incluídas","Suporte prioritário"]',
  '{}', 'Garantir acesso vitalício', 'Melhor escolha', true, 2)
on conflict (slug) do nothing;

insert into public.supplier_categories (name, slug, icon, sort_order) values
('Eletrônicos', 'eletronicos', 'cpu', 1),
('Casa e Decoração', 'casa-decoracao', 'sofa', 2),
('Moda e Acessórios', 'moda-acessorios', 'shirt', 3),
('Beleza e Cuidados', 'beleza-cuidados', 'sparkles', 4),
('Esporte e Fitness', 'esporte-fitness', 'dumbbell', 5),
('Infantil e Brinquedos', 'infantil-brinquedos', 'baby', 6),
('Pet Shop', 'pet-shop', 'paw-print', 7),
('Automotivo', 'automotivo', 'car', 8),
('Ferramentas', 'ferramentas', 'wrench', 9),
('Papelaria e Escritório', 'papelaria-escritorio', 'pen-tool', 10)
on conflict (slug) do nothing;
