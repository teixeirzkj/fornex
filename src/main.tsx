import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Transição padrão macia para qualquer animação sem transição própria */}
      <MotionConfig reducedMotion="user" transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <AuthProvider>
          <App />
          <Toaster position="top-right" theme="dark" richColors closeButton
            toastOptions={{ style: { background: '#101D33', border: '1px solid #22324A', color: '#F8FAFC' } }} />
        </AuthProvider>
      </MotionConfig>
    </BrowserRouter>
  </StrictMode>,
)
