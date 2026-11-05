import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'

/**
 * Outlet com carregamento "local": enquanto o código de uma página é baixado,
 * só a área de conteúdo mostra um esqueleto discreto — o menu e o topo
 * continuam na tela (evita a "piscada" do site inteiro).
 */
export function RouteOutlet() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  )
}

function RouteFallback() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="h-3 w-24 rounded-full bg-surface-2" />
      <div className="h-7 w-56 rounded-fx-sm bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-fx-lg bg-surface-2/70" />)}
      </div>
    </div>
  )
}

/**
 * Baixa em segundo plano o código das páginas mais usadas, logo depois
 * que o site abre — assim a navegação entre páginas fica instantânea.
 */
export function prefetchRoutes() {
  const run = () => {
    const pages = [
      () => import('@/pages/app/Overview'), () => import('@/pages/app/Suppliers'), () => import('@/pages/app/SupplierDetail'),
      () => import('@/pages/app/Categories'), () => import('@/pages/app/Favorites'), () => import('@/pages/app/History'),
      () => import('@/pages/app/Updates'), () => import('@/pages/app/Subscription'), () => import('@/pages/app/Account'),
      () => import('@/pages/app/Support'), () => import('@/pages/app/Stores'), () => import('@/pages/app/Listings'), () => import('@/pages/app/Publish'),
      () => import('@/pages/public/Landing'), () => import('@/pages/public/Pricing'),
      () => import('@/pages/auth/Login'), () => import('@/pages/auth/Signup'),
      () => import('@/components/layout/AppLayout'), () => import('@/components/layout/PublicLayout'), () => import('@/components/layout/AuthLayout'),
    ]
    pages.forEach((load, i) => setTimeout(() => { load().catch(() => {}) }, i * 120))
  }
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
  if (ric) ric(run); else setTimeout(run, 1200)
}
