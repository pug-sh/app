import { lazy, type ComponentType } from 'react'

const STORAGE_KEY = 'chunk-retry'
const MAX_RETRIES = 2

export const lazyWithRetry = (loader: () => Promise<{ default: ComponentType }>) =>
  lazy(async () => {
    try {
      const module = await loader()
      sessionStorage.removeItem(STORAGE_KEY)
      return module
    } catch (error) {
      const retryCount = Number(sessionStorage.getItem(STORAGE_KEY) || '0')
      console.error(`[lazyWithRetry] Chunk load failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error)

      if (retryCount < MAX_RETRIES) {
        sessionStorage.setItem(STORAGE_KEY, String(retryCount + 1))
        window.location.reload()
        return new Promise<{ default: ComponentType }>(() => {})
      }

      sessionStorage.removeItem(STORAGE_KEY)
      return {
        default: () => (
          <div className='min-h-screen flex items-center justify-center'>
            <div className='text-center'>
              <p className='text-sm font-medium mb-1'>Failed to load page. Please refresh.</p>
              <button
                onClick={() => window.location.reload()}
                className='mt-3 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors'
              >
                Refresh
              </button>
            </div>
          </div>
        ),
      }
    }
  })
