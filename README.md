# FORNEX — Plataforma SaaS de fornecedores

> Seu acesso a novos fornecedores.

Base de um SaaS real de acesso e gestão de fornecedores: site público, cadastro/login, assinaturas,
painel do cliente, central de fornecedores, painel administrativo e integrações com sistemas de fornecedores.

**Stack:** React 18 + TypeScript + Vite · Tailwind CSS · Framer Motion · Lucide · Supabase (Auth, Postgres + RLS, Storage, Edge Functions) · Mercado Pago (assinaturas).

Identidade visual oficial em [`brand/`](brand/) (cores, tipografia e logos do Brand Kit FORNEX). Os tokens estão em
[`src/styles/fornex-design-tokens.css`](src/styles/fornex-design-tokens.css) e mapeados no [`tailwind.config.js`](tailwind.config.js).

---

## 1. Rodando localmente

```bash
npm install
cp .env.example .env      # preencha as variáveis (ver seção 2)
npm run dev               # http://localhost:5173
```

Sem o `.env` configurado, o site público abre normalmente. A área logada mostra uma tela de "Conecte o banco de dados".

## 2. Configurando o Supabase (obrigatório)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor** → rode, nesta ordem:
   - `supabase/migrations/20261104000000_init.sql` (tabelas, RLS, funções, bucket de logos)
   - `supabase/seed.sql` (planos **Básico R$ 69,90/mês** e **Vitalício 12x R$ 19,90**, e categorias)
   - *(opcional)* `supabase/demo/demo_seed.sql`: dados **fictícios** de demonstração (12 fornecedores, 132 produtos, 3 integrações, 3 atualizações). Aparecem com o selo "Demonstração" e não entram nas estatísticas do site. Para apagar tudo: `supabase/demo/demo_remove.sql`.
   - ou, com a CLI: `supabase link --project-ref SEU_REF && supabase db push && psql ... -f supabase/seed.sql`
3. **Project Settings → API**: copie a `Project URL` e a chave **publishable/anon** para o `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```
   ⚠️ Nunca coloque a `service_role`/`sb_secret_` em variáveis `VITE_*`.
4. **Authentication → URL Configuration**: `Site URL` = URL do site; adicione em *Redirect URLs*:
   `http://localhost:5173/**` e `https://SEU-DOMINIO/**`.
5. **Crie o primeiro administrador**: cadastre-se pelo site e rode no SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'seu@email.com';
   ```
   Depois disso, novos admins podem ser promovidos em `/admin/clientes`.

## 3. Pagamentos (Mercado Pago)

| Plano | Cobrança | Como funciona no Mercado Pago |
|---|---|---|
| **Básico**: R$ 69,90/mês | Assinatura recorrente | `preapproval`, renova todo mês; cancelável em "Minha assinatura" |
| **Vitalício**: 12x de R$ 19,90 (R$ 238,80) | Pagamento único parcelado no cartão | Checkout Pro (`preference`, até 12 parcelas). O acesso é criado **só quando o pagamento é aprovado**. Quem está no Básico pode fazer upgrade: a mensalidade é cancelada automaticamente. Estorno/chargeback revoga o acesso. |

> **Juros do parcelamento:** para o cliente pagar exatamente 12x de R$ 19,90, ative **"parcelamento sem juros"** (você absorve a taxa) na sua conta Mercado Pago. Sem isso, o MP acrescenta juros nas parcelas.

**Nível de acesso:** Básico = nível 1, Vitalício = nível 2. Em cada fornecedor, "Nível de acesso" = 1 libera para os dois planos; 2 deixa exclusivo do Vitalício. Assim você controla o "Acesso a 5 fornecedores" do Básico.

O preço é **sempre lido do banco no servidor** (Edge Function `create-checkout`). O navegador envia só o slug do plano.
O status da assinatura só muda via **webhook assinado** do Mercado Pago, nunca pela resposta do navegador.

1. Crie uma aplicação em [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers) e pegue o **Access Token** (use o de teste primeiro).
2. Publique as funções e configure os segredos:
   ```bash
   supabase functions deploy create-checkout manage-subscription mercadopago-webhook integration-sync integration-webhook
   supabase secrets set APP_URL=https://SEU-DOMINIO MP_ACCESS_TOKEN=APP_USR-... MP_WEBHOOK_SECRET=...
   # desenvolvimento local (CORS para http://localhost:5173):
   supabase secrets set ALLOW_LOCALHOST=true
   ```
3. No painel do Mercado Pago → **Webhooks**: URL `https://SEU_REF.supabase.co/functions/v1/mercadopago-webhook`,
   eventos de **Planos e assinaturas** e **Pagamentos** (o evento Pagamentos é o que libera o Vitalício). Copie a *assinatura secreta* para `MP_WEBHOOK_SECRET`.

Enquanto `MP_ACCESS_TOKEN` não estiver configurado, o botão de assinar mostra
"O pagamento online ainda não foi ativado". Nenhuma cobrança é simulada. O admin pode liberar acesso manualmente
em `/admin/clientes` (ex.: pagamento por Pix fora da plataforma).

A arquitetura (`subscriptions.gateway`, `payments.gateway`) já prevê `stripe` para uma integração futura.

## 4. Integrações com fornecedores

Cada fornecedor pode ter integrações em `/admin/integracoes`:

| Tipo | Como funciona | O que precisa para ativar |
|---|---|---|
| `rest_api` | A FORNEX **busca** os produtos na API do fornecedor (`integration-sync`) | URL da API (https), mapeamento de campos e, se exigir autenticação, um token salvo como segredo `SUPPLIER_*` |
| `webhook` | O fornecedor **envia** produtos para `functions/v1/integration-webhook?integration_id=…` | Segredo `SUPPLIER_*` compartilhado com o fornecedor (header `x-webhook-secret`) |
| `csv` | Importação de planilha CSV/XLSX em `/admin/importar` | Nada além da planilha |
| `manual` | Cadastro direto pelo admin | — |

- **Tokens de fornecedores nunca ficam no banco.** A integração guarda só o *nome* da variável (ex.: `SUPPLIER_ACME_TOKEN`):
  `supabase secrets set SUPPLIER_ACME_TOKEN=valor`. A função só lê variáveis com prefixo `SUPPLIER_`.
- "Testar conexão" faz um *dry run* (lê a 1ª página e mostra o mapeamento sem gravar).
- Cada sincronização registra status, última execução, erros e histórico em `integration_logs`.
- Sincronização automática: veja [`supabase/cron.sql`](supabase/cron.sql) (pg_cron + pg_net, requer `CRON_SECRET`).
- Não há scraping: só APIs autorizadas, webhooks ou planilhas.

## 5. Segurança (resumo)

- RLS em **todas** as tabelas. Cliente só lê os próprios dados (favoritos, histórico, assinatura, pagamentos).
- Fornecedores só são visíveis para assinantes com `access_level` do plano ≥ `min_access_level` do fornecedor (`current_access_level()` no banco).
- `profiles.role` não é editável pelo usuário (`GRANT UPDATE` só em `full_name, phone, company, avatar_url`). Admin é verificado no banco (`is_admin()`).
- Assinaturas e pagamentos só são escritos pelo servidor (Edge Functions com service role) ou por admin.
- Landing page mostra **apenas contagens reais** (`public_platform_stats`), e só quando > 0.
- Security headers/CSP em [`vercel.json`](vercel.json). Source maps desligados no build.

## 6. Estrutura

```
src/
  components/ui/        kit de UI (Button, Field, Modal, Feedback, Logo, motion)
  components/layout/    Public/Auth/App/Admin layouts + Guards
  components/app/       peças do painel do cliente
  components/admin/     peças do painel admin
  pages/public|auth|app|admin
  contexts/AuthContext  sessão, perfil, assinatura, nível de acesso
  hooks/                usePlans, useFavorites
  lib/                  supabase, api, checkout, utils, config
supabase/
  migrations/           schema + RLS
  functions/            create-checkout, manage-subscription, mercadopago-webhook, integration-sync, integration-webhook
brand/                  guia de marca FORNEX
```

## 7. Status: o que está funcional vs. o que depende de configuração

| Funcionalidade | Status |
|---|---|
| Landing, planos, termos/privacidade (modelos) | ✅ Funciona (planos/categorias vêm do banco) |
| Cadastro, login, recuperar/redefinir senha | ✅ Funciona com Supabase configurado |
| Painel do cliente, catálogo, detalhes, favoritos, histórico, atualizações, conta | ✅ Funciona com Supabase configurado |
| Plano gratuito | ✅ Ativação real via RPC |
| Painel admin (CRUDs, clientes, assinaturas, planos, pagamentos, atualizações, importação) | ✅ Funciona com Supabase configurado |
| Assinatura paga (checkout, renovação, cancelamento, histórico de pagamentos) | ⚙️ Requer `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, funções publicadas e webhook cadastrado |
| Integrações REST/Webhook | ⚙️ Requer funções publicadas + API/credenciais reais do fornecedor |
| Sincronização agendada | ⚙️ Requer `cron.sql` + `CRON_SECRET` |
| Termos de uso / Privacidade | ⚠️ São modelos: revisar com assessoria jurídica |
| Marca FORNEX | ⚠️ Verificar disponibilidade no INPI/domínio antes do uso comercial |

## 8. Pendente fora do código

- **Supabase**: rodar migration + seed; Redirect URLs; ligar **CAPTCHA** do Auth (Turnstile/hCaptcha) e revisar rate limits de Auth; confirmação de e-mail ligada; SMTP próprio para e-mails; rodar o **Security Advisor**; ajustar *Max rows* da API.
- **Mercado Pago**: credenciais de produção, webhook com assinatura secreta.
- **Hospedagem** (ex.: Vercel): variáveis `VITE_*` por ambiente; Deployment Protection em previews; domínio com HTTPS.
- **Segredos**: `APP_URL`, `MP_*`, `CRON_SECRET`, `SUPPLIER_*` via `supabase secrets set`. Nunca no código.
- **Conteúdo**: cadastrar fornecedores reais (o projeto não inclui fornecedores fictícios), revisar preços dos planos e textos legais.
- **Rate limit** no `integration-webhook` (ex.: regra no Cloudflare/API Gateway) se o endpoint for exposto a muitos fornecedores.
