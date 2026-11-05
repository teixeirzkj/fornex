export type Role = 'customer' | 'admin'
export type PlanInterval = 'free' | 'month' | 'year' | 'lifetime'
export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired'
export type Gateway = 'none' | 'manual' | 'mercadopago' | 'stripe'
export type PaymentStatus = 'pending' | 'in_process' | 'approved' | 'rejected' | 'refunded' | 'canceled'
export type IntegrationType = 'rest_api' | 'webhook' | 'csv' | 'manual' | 'dslite'
export type IntegrationStatus = 'draft' | 'active' | 'paused' | 'error'

export interface Profile {
  id: string; email: string | null; full_name: string | null; phone: string | null
  company: string | null; avatar_url: string | null; role: Role; created_at: string
}

export interface Plan {
  id: string; slug: string; name: string; description: string | null; price_cents: number
  interval: PlanInterval; installments: number; access_level: number; features_title: string | null
  features: string[]; limits: Record<string, number>; cta_label: string | null; badge: string | null
  highlight: boolean; is_active: boolean; sort_order: number
}

export interface Subscription {
  id: string; user_id: string; plan_id: string; status: SubscriptionStatus; gateway: Gateway
  gateway_subscription_id: string | null; current_period_start: string | null; current_period_end: string | null
  cancel_at_period_end: boolean; canceled_at: string | null; created_at: string
  plan?: Plan | null
}

export interface Payment {
  id: string; user_id: string; subscription_id: string | null; gateway: Gateway; gateway_payment_id: string | null
  amount_cents: number; currency: string; status: PaymentStatus; description: string | null; paid_at: string | null; created_at: string
}

export interface Category {
  id: string; name: string; slug: string; description: string | null; icon: string; sort_order: number
}

export interface Supplier {
  id: string; name: string; slug: string; logo_url: string | null; category_id: string | null
  description: string | null; city: string | null; state: string | null; phone: string | null
  whatsapp: string | null; email: string | null; website: string | null; instagram: string | null
  facebook: string | null; tiktok: string | null; commercial_terms: string | null; min_order: string | null
  shipping_info: string | null; notes: string | null; tags: string[]; min_access_level: number
  is_verified: boolean; is_demo?: boolean; is_published: boolean; created_at: string; updated_at: string
  category?: Pick<Category, 'id' | 'name' | 'slug' | 'icon'> | null
}

export type SupplierListItem = Pick<Supplier,
  'id' | 'name' | 'slug' | 'logo_url' | 'category_id' | 'description' | 'city' | 'state' | 'tags' | 'is_verified' | 'is_demo' | 'updated_at' | 'min_access_level' | 'category'>

export interface SupplierProduct {
  id: string; supplier_id: string; integration_id: string | null; external_id: string | null; name: string
  sku: string | null; description: string | null; price_cents: number | null; stock: number | null
  image_url: string | null; product_url: string | null; is_active: boolean; updated_at: string
}

export interface IntegrationConfig {
  base_url?: string; method?: 'GET' | 'POST'; items_path?: string
  auth_header?: string; auth_scheme?: string; secret_env?: string
  price_unit?: 'reais' | 'cents'
  // DSlite
  env?: 'production' | 'homologacao'; fornecedorid?: string
  price_field?: 'preco_dropshipping' | 'preco_crossdocking' | 'preco_normal'; sync_cursor?: number | null
  pagination?: { param: string; start: number; max_pages: number } | null
  field_map?: Partial<Record<'external_id' | 'name' | 'sku' | 'description' | 'price' | 'stock' | 'image_url' | 'product_url', string>>
}

export interface Integration {
  id: string; supplier_id: string; name: string; type: IntegrationType; status: IntegrationStatus
  config: IntegrationConfig; sync_interval_minutes: number | null; last_sync_at: string | null
  last_sync_status: 'success' | 'partial' | 'error' | null; last_error: string | null; created_at: string; updated_at: string
  supplier?: Pick<Supplier, 'id' | 'name'> | null
}

export interface IntegrationLog {
  id: string; integration_id: string | null; supplier_id: string | null; level: 'info' | 'warn' | 'error'
  event: 'sync' | 'webhook' | 'import' | 'test' | 'config'; message: string; items_processed: number
  details: unknown; created_at: string
}

export interface Notification {
  id: string; user_id: string | null; kind: 'update' | 'new_supplier' | 'system' | 'billing'
  title: string; body: string | null; link: string | null; published_at: string; created_at: string
}

export interface PublicStats { suppliers: number; categories: number; products: number; states: number }

export interface AdminMetrics {
  customers: number; new_customers_30d: number; active_subscriptions: number; paid_subscriptions: number
  mrr_cents: number; revenue_30d_cents: number; suppliers: number; suppliers_published: number
  products: number; integrations_active: number; integrations_error: number; views_30d: number
}

export interface MlAccount {
  id: string; user_id: string; ml_user_id: number; nickname: string | null; site_id: string
  status: 'active' | 'reconnect' | 'revoked'; expires_at: string | null; last_error: string | null; created_at: string
}

export interface MlListing {
  id: string; ml_account_id: string; supplier_product_id: string | null; ml_item_id: string | null; permalink: string | null
  title: string; price_cents: number; markup_percent: number; listing_type: 'gold_special' | 'gold_pro'
  available_quantity: number; status: 'pending' | 'active' | 'paused' | 'closed' | 'under_review' | 'error'
  last_error: string | null; last_synced_at: string | null; created_at: string
}
