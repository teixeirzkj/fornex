-- =====================================================================
-- FORNEX — DADOS DE DEMONSTRAÇÃO (FICTÍCIOS)
--
-- Servem só para visualizar a plataforma preenchida durante o desenvolvimento.
-- Todos os registros são marcados (is_demo = true / UUIDs d0000000-…) e aparecem
-- com o selo "Demonstração" no painel. Não entram nas estatísticas públicas do site.
--
-- Contatos são propositalmente inválidos: DDD 00 (inexistente) e domínio .example
-- (reservado), para nenhum botão de WhatsApp/e-mail atingir pessoas ou empresas reais.
--
-- Rodar DEPOIS da migration e do seed.sql.  Para remover: supabase/demo/demo_remove.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fornecedores (5 no plano Básico = nível 1; 7 exclusivos do Vitalício = nível 2)
-- ---------------------------------------------------------------------
insert into public.suppliers
  (id, name, slug, category_id, description, city, state, phone, whatsapp, email, website,
   commercial_terms, min_order, shipping_info, notes, tags, min_access_level, is_verified, is_demo, is_published)
select v.id::uuid, v.name, v.slug, c.id, v.description, v.city, v.state, v.phone, v.phone,
       'contato@' || v.slug || '.example', 'https://' || v.slug || '.example',
       v.terms, v.min_order, v.shipping, 'Fornecedor fictício para demonstração da plataforma.',
       v.tags, v.level, false, true, true
from (values
  ('d0000000-0000-4000-8000-000000000001', 'TechNova Distribuidora (Demo)', 'demo-technova', 'eletronicos',
   'Distribuidora de acessórios eletrônicos: fones, carregadores, cabos e smartwatches. Atende revendedores de marketplaces com envio a partir de 1 unidade.',
   'São Paulo', 'SP', '(00) 0000-0001', 'Pagamento via Pix ou boleto. Desconto progressivo acima de 50 peças.', 'Sem pedido mínimo', 'Envio em até 24h úteis para todo o Brasil.', array['dropshipping','pronta entrega'], 1),
  ('d0000000-0000-4000-8000-000000000002', 'Casa Bela Utilidades (Demo)', 'demo-casa-bela', 'casa-decoracao',
   'Utilidades domésticas, organização e decoração com fotos próprias para anúncios.',
   'Curitiba', 'PR', '(00) 0000-0002', 'Pix com 5% de desconto. Cartão em até 3x.', 'R$ 300,00', 'Coleta diária pelas principais transportadoras.', array['decoração','organização'], 1),
  ('d0000000-0000-4000-8000-000000000003', 'Moda Fit Atacado (Demo)', 'demo-moda-fit', 'moda-acessorios',
   'Roupas fitness e moda casual feminina. Grade completa do P ao GG.',
   'Goiânia', 'GO', '(00) 0000-0003', 'Pagamento antecipado via Pix.', '10 peças sortidas', 'Despacho em até 48h.', array['moda feminina','atacado'], 1),
  ('d0000000-0000-4000-8000-000000000004', 'PetMais Suprimentos (Demo)', 'demo-petmais', 'pet-shop',
   'Acessórios pet: coleiras, comedouros, brinquedos e caminhas.',
   'Belo Horizonte', 'MG', '(00) 0000-0004', 'Pix ou boleto 28 dias para CNPJ.', 'R$ 200,00', 'Frete grátis acima de R$ 1.000,00 (Sudeste).', array['pet','dropshipping'], 1),
  ('d0000000-0000-4000-8000-000000000005', 'Fitness Pro Equipamentos (Demo)', 'demo-fitness-pro', 'esporte-fitness',
   'Acessórios de treino: faixas elásticas, halteres, tapetes e garrafas.',
   'Campinas', 'SP', '(00) 0000-0005', 'Cartão em até 6x sem juros.', 'Sem pedido mínimo', 'Envio no mesmo dia para pedidos até 14h.', array['esporte','pronta entrega'], 1),
  ('d0000000-0000-4000-8000-000000000006', 'Beleza Pura Cosméticos (Demo)', 'demo-beleza-pura', 'beleza-cuidados',
   'Skincare, maquiagem e acessórios de beleza com nota fiscal e registro.',
   'Rio de Janeiro', 'RJ', '(00) 0000-0006', 'Pix ou cartão. Tabela especial para revendedores cadastrados.', 'R$ 500,00', 'Envio em até 2 dias úteis.', array['cosméticos','revenda'], 2),
  ('d0000000-0000-4000-8000-000000000007', 'Kids World Brinquedos (Demo)', 'demo-kids-world', 'infantil-brinquedos',
   'Brinquedos educativos e acessórios infantis com certificação Inmetro.',
   'Joinville', 'SC', '(00) 0000-0007', 'Boleto 30/60 dias para CNPJ aprovado.', 'R$ 800,00', 'Transportadora própria no Sul.', array['infantil','inmetro'], 2),
  ('d0000000-0000-4000-8000-000000000008', 'AutoParts Express (Demo)', 'demo-autoparts', 'automotivo',
   'Acessórios automotivos: capas, organizadores, suportes de celular e iluminação LED.',
   'Recife', 'PE', '(00) 0000-0008', 'Pix com 3% de desconto.', 'Sem pedido mínimo', 'Envio em até 24h úteis.', array['automotivo','dropshipping'], 2),
  ('d0000000-0000-4000-8000-000000000009', 'Ferramentas Forte (Demo)', 'demo-ferramentas-forte', 'ferramentas',
   'Ferramentas manuais e elétricas para revenda, com garantia de fábrica.',
   'Caxias do Sul', 'RS', '(00) 0000-0009', 'Boleto 28 dias ou Pix.', 'R$ 1.000,00', 'Frete CIF para todo o Sul.', array['ferramentas','garantia'], 2),
  ('d0000000-0000-4000-8000-000000000010', 'Papel & Cia Escritório (Demo)', 'demo-papel-cia', 'papelaria-escritorio',
   'Papelaria, material escolar e organização de escritório.',
   'Fortaleza', 'CE', '(00) 0000-0010', 'Pix ou cartão em até 4x.', 'R$ 150,00', 'Envio em até 48h.', array['papelaria','volta às aulas'], 2),
  ('d0000000-0000-4000-8000-000000000011', 'SmartHome Brasil (Demo)', 'demo-smarthome', 'eletronicos',
   'Casa inteligente: lâmpadas Wi-Fi, tomadas inteligentes, câmeras e sensores.',
   'Manaus', 'AM', '(00) 0000-0011', 'Pix. Preço de atacado acima de 20 unidades.', '5 unidades por SKU', 'Envio via Correios e transportadora.', array['casa inteligente','importados'], 2),
  ('d0000000-0000-4000-8000-000000000012', 'Cozinha Gourmet Utensílios (Demo)', 'demo-cozinha-gourmet', 'casa-decoracao',
   'Utensílios de cozinha, potes herméticos e acessórios gourmet.',
   'Salvador', 'BA', '(00) 0000-0012', 'Pix ou boleto à vista.', 'R$ 250,00', 'Envio em até 3 dias úteis.', array['cozinha','utilidades'], 2)
) as v(id, name, slug, cat_slug, description, city, state, phone, terms, min_order, shipping, tags, level)
left join public.supplier_categories c on c.slug = v.cat_slug
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Produtos (10 a 12 por fornecedor, gerados)
-- ---------------------------------------------------------------------
insert into public.supplier_products (supplier_id, external_id, name, sku, price_cents, stock, is_active)
select s.id,
       'demo-' || right(s.id::text, 2) || '-' || lpad(g::text, 3, '0'),
       (array['Kit','Conjunto','Modelo','Linha'])[1 + (g % 4)] || ' ' || p.base || ' ' || g,
       upper(left(replace(s.slug, 'demo-', ''), 4)) || '-' || lpad(g::text, 4, '0'),
       p.price + (g * 137) % 4000,
       (g * 29) % 180,
       true
from public.suppliers s
join (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'Fone Bluetooth', 3990),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'Organizador Multiuso', 2490),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'Legging Fitness', 3490),
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'Comedouro Pet', 1990),
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'Faixa Elástica', 1590),
  ('d0000000-0000-4000-8000-000000000006'::uuid, 'Sérum Facial', 2990),
  ('d0000000-0000-4000-8000-000000000007'::uuid, 'Brinquedo Educativo', 4490),
  ('d0000000-0000-4000-8000-000000000008'::uuid, 'Suporte Veicular', 1890),
  ('d0000000-0000-4000-8000-000000000009'::uuid, 'Jogo de Chaves', 5990),
  ('d0000000-0000-4000-8000-000000000010'::uuid, 'Caderno Executivo', 1290),
  ('d0000000-0000-4000-8000-000000000011'::uuid, 'Lâmpada Inteligente', 4990),
  ('d0000000-0000-4000-8000-000000000012'::uuid, 'Pote Hermético', 2190)
) as p(supplier_id, base, price) on p.supplier_id = s.id
cross join generate_series(1, 11) as g
on conflict (supplier_id, external_id) do nothing;

-- ---------------------------------------------------------------------
-- Integrações de exemplo (mostram cada tipo; nenhuma aponta para API real)
-- ---------------------------------------------------------------------
insert into public.integrations (id, supplier_id, name, type, status, config, last_sync_at, last_sync_status) values
('d0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-000000000001', 'Planilha de produtos (Demo)', 'csv', 'active', '{}',
  now() - interval '2 days', 'success'),
('d0000000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-000000000011', 'API de catálogo (Demo — rascunho)', 'rest_api', 'draft',
  '{"base_url":"https://api.demo-smarthome.example/v1/produtos","method":"GET","items_path":"data","auth_header":"Authorization","auth_scheme":"Bearer","secret_env":"SUPPLIER_DEMO_TOKEN","price_unit":"reais","field_map":{"external_id":"id","name":"title","sku":"sku","price":"price","stock":"stock","image_url":"thumbnail","product_url":"permalink"}}',
  null, null),
('d0000000-0000-4000-8000-0000000000a3', 'd0000000-0000-4000-8000-000000000006', 'Webhook de estoque (Demo — rascunho)', 'webhook', 'draft',
  '{"secret_env":"SUPPLIER_DEMO_WEBHOOK","items_path":"products","price_unit":"reais","field_map":{"external_id":"id","name":"name","price":"price","stock":"stock"}}',
  null, null)
on conflict (id) do nothing;

insert into public.integration_logs (integration_id, supplier_id, level, event, message, items_processed, details, created_at) values
('d0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-000000000001', 'info', 'import',
  'Importação de demonstração concluída.', 11, '{"demo":true,"inserted":11,"skipped":0}', now() - interval '2 days'),
('d0000000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-000000000011', 'warn', 'config',
  'Integração de demonstração em rascunho: aguardando URL real e token SUPPLIER_*.', 0, '{"demo":true}', now() - interval '1 day');

-- ---------------------------------------------------------------------
-- Atualizações (comunicados)
-- ---------------------------------------------------------------------
insert into public.notifications (id, user_id, kind, title, body, link, published_at) values
('d0000000-0000-4000-8000-0000000000b1', null, 'update', 'Bem-vindo à FORNEX (demonstração)',
  'Este ambiente está com dados fictícios para você conhecer o painel. Os fornecedores reais serão publicados em breve.', '/app/fornecedores', now() - interval '3 days'),
('d0000000-0000-4000-8000-0000000000b2', null, 'new_supplier', 'Novo fornecedor: SmartHome Brasil (Demo)',
  'Casa inteligente com preço de atacado. Exclusivo do plano Vitalício.', '/app/fornecedores/demo-smarthome', now() - interval '1 day'),
('d0000000-0000-4000-8000-0000000000b3', null, 'system', 'Novidade: histórico de buscas',
  'Agora suas pesquisas ficam salvas em Histórico para repetir com um clique.', '/app/historico', now() - interval '6 hours')
on conflict (id) do nothing;
