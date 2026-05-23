import { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { register as registerSW } from './utils/serviceWorkerRegistration'
import './index.css'
import './styles/imageOptimizations.css'
import './i18n'

// Lazy load analytics only in production and not in local development
const Analytics = process.env.NODE_ENV === 'production' && !window.location.hostname.includes('localhost')
  ? lazy(() => import('@vercel/analytics/react').then(module => ({ default: module.Analytics })))
  : () => null

const SpeedInsights = process.env.NODE_ENV === 'production' && !window.location.hostname.includes('localhost')
  ? lazy(() => import('@vercel/speed-insights/react').then(module => ({ default: module.SpeedInsights })))
  : () => null

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Failed to find the root element')

ReactDOM.createRoot(rootElement).render(
  <>
    <App />
    {(process.env.NODE_ENV === 'production' && !window.location.hostname.includes('localhost')) && (
      <Suspense fallback={null}>
        <Analytics />
        <SpeedInsights />
      </Suspense>
    )}
  </>
)

// Register service worker for production caching
registerSW({
  onSuccess: (_registration) => {

  },
  onUpdate: (_registration) => {

    // Optionally show update notification to user
  }
})