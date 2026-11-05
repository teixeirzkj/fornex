import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { PageLoader } from '@/components/ui/Feedback'
import { RequireAdmin, RequireAuth, RedirectIfAuthed } from '@/components/layout/Guards'
import { prefetchRoutes } from '@/components/layout/RouteOutlet'

// Layouts
const PublicLayout = lazy(() => import('@/components/layout/PublicLayout'))
const AuthLayout = lazy(() => import('@/components/layout/AuthLayout'))
const AppLayout = lazy(() => import('@/components/layout/AppLayout'))
const AdminLayout = lazy(() => import('@/components/layout/AdminLayout'))

// Site público
const Landing = lazy(() => import('@/pages/public/Landing'))
const Pricing = lazy(() => import('@/pages/public/Pricing'))
const Legal = lazy(() => import('@/pages/public/Legal'))
const NotFound = lazy(() => import('@/pages/public/NotFound'))

// Autenticação
const Login = lazy(() => import('@/pages/auth/Login'))
const Signup = lazy(() => import('@/pages/auth/Signup'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'))
const Confirm = lazy(() => import('@/pages/auth/Confirm'))

// Painel do cliente
const Overview = lazy(() => import('@/pages/app/Overview'))
const Suppliers = lazy(() => import('@/pages/app/Suppliers'))
const SupplierDetail = lazy(() => import('@/pages/app/SupplierDetail'))
const Categories = lazy(() => import('@/pages/app/Categories'))
const Favorites = lazy(() => import('@/pages/app/Favorites'))
const History = lazy(() => import('@/pages/app/History'))
const Updates = lazy(() => import('@/pages/app/Updates'))
const SubscriptionPage = lazy(() => import('@/pages/app/Subscription'))
const Checkout = lazy(() => import('@/pages/app/Checkout'))
const Stores = lazy(() => import('@/pages/app/Stores'))
const StoresCallback = lazy(() => import('@/pages/app/StoresCallback'))
const Listings = lazy(() => import('@/pages/app/Listings'))
const Publish = lazy(() => import('@/pages/app/Publish'))
const Account = lazy(() => import('@/pages/app/Account'))
const Support = lazy(() => import('@/pages/app/Support'))

// Administração
const AdminOverview = lazy(() => import('@/pages/admin/Overview'))
const AdminSuppliers = lazy(() => import('@/pages/admin/Suppliers'))
const AdminSupplierForm = lazy(() => import('@/pages/admin/SupplierForm'))
const AdminCategories = lazy(() => import('@/pages/admin/Categories'))
const AdminCustomers = lazy(() => import('@/pages/admin/Customers'))
const AdminSubscriptions = lazy(() => import('@/pages/admin/Subscriptions'))
const AdminPlans = lazy(() => import('@/pages/admin/Plans'))
const AdminPayments = lazy(() => import('@/pages/admin/Payments'))
const AdminIntegrations = lazy(() => import('@/pages/admin/Integrations'))
const AdminIntegrationDetail = lazy(() => import('@/pages/admin/IntegrationDetail'))
const AdminImport = lazy(() => import('@/pages/admin/Import'))
const AdminUpdates = lazy(() => import('@/pages/admin/Updates'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  useEffect(() => { prefetchRoutes() }, [])
  return (
    <Suspense fallback={<PageLoader />}>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="planos" element={<Pricing />} />
          <Route path="legal/:doc" element={<Legal />} />
        </Route>

        <Route element={<AuthLayout />}>
          <Route path="entrar" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
          <Route path="cadastro" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
          <Route path="recuperar-senha" element={<ForgotPassword />} />
          <Route path="redefinir-senha" element={<ResetPassword />} />
          <Route path="auth/confirmar" element={<Confirm />} />
        </Route>

        <Route path="app" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Overview />} />
          <Route path="fornecedores" element={<Suppliers />} />
          <Route path="fornecedores/:slug" element={<SupplierDetail />} />
          <Route path="categorias" element={<Categories />} />
          <Route path="favoritos" element={<Favorites />} />
          <Route path="historico" element={<History />} />
          <Route path="atualizacoes" element={<Updates />} />
          <Route path="assinatura" element={<SubscriptionPage />} />
          <Route path="checkout/:slug" element={<Checkout />} />
          <Route path="lojas" element={<Stores />} />
          <Route path="lojas/callback" element={<StoresCallback />} />
          <Route path="anuncios" element={<Listings />} />
          <Route path="publicar" element={<Publish />} />
          <Route path="conta" element={<Account />} />
          <Route path="suporte" element={<Support />} />
        </Route>

        <Route path="admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<AdminOverview />} />
          <Route path="fornecedores" element={<AdminSuppliers />} />
          <Route path="fornecedores/novo" element={<AdminSupplierForm />} />
          <Route path="fornecedores/:id" element={<AdminSupplierForm />} />
          <Route path="categorias" element={<AdminCategories />} />
          <Route path="clientes" element={<AdminCustomers />} />
          <Route path="assinaturas" element={<AdminSubscriptions />} />
          <Route path="planos" element={<AdminPlans />} />
          <Route path="pagamentos" element={<AdminPayments />} />
          <Route path="integracoes" element={<AdminIntegrations />} />
          <Route path="integracoes/:id" element={<AdminIntegrationDetail />} />
          <Route path="importar" element={<AdminImport />} />
          <Route path="atualizacoes" element={<AdminUpdates />} />
        </Route>

        <Route path="painel" element={<Navigate to="/app" replace />} />
        <Route element={<PublicLayout />}>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
