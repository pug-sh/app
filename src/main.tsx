import { Component, type ReactNode, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { TooltipProvider } from './components/ui/tooltip'
import './index.css'

const checkBrowserStorage = () => {
  try {
    const k = '__storage_test__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    sessionStorage.setItem(k, '1')
    sessionStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

if (!checkBrowserStorage()) {
  const root = document.getElementById('root')!
  const container = document.createElement('div')
  container.style.cssText =
    'min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif'
  const inner = document.createElement('div')
  inner.style.cssText = 'text-align:center;max-width:24rem'
  const title = document.createElement('p')
  title.style.cssText = 'font-size:14px;font-weight:500;margin-bottom:4px'
  title.textContent = 'Unsupported browser environment'
  const desc = document.createElement('p')
  desc.style.cssText = 'font-size:12px;color:#888'
  desc.textContent =
    'This app requires localStorage and sessionStorage. Please disable private browsing restrictions or try a different browser.'
  inner.append(title, desc)
  container.append(inner)
  root.append(container)
  throw new Error('Browser storage unavailable')
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Uncaught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-4">Something went wrong.</p>
            <button
              className="text-sm text-primary hover:underline underline-offset-4"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ErrorBoundary>
  </StrictMode>,
)
