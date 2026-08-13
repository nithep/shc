import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import PremiumErrorBoundary from './components/PremiumErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PremiumErrorBoundary>
      <App />
    </PremiumErrorBoundary>
  </StrictMode>,
)
