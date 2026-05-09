import { type ComponentType, lazy } from 'react'

const MAX_RETRIES = 2

const isChunkLoadError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  return /dynamically imported module|Loading chunk|Failed to fetch|load failed/i.test(error.message)
}

// Storage availability is guaranteed by the check in main.tsx — no defensive try-catch needed here.
export const lazyWithRetry = (loader: () => Promise<{ default: ComponentType }>, name?: string) => {
  const storageKey = name ? `chunk-retry:${name}` : 'chunk-retry'
  return lazy(async () => {
    try {
      const module = await loader()
      sessionStorage.removeItem(storageKey)
      return module
    } catch (error) {
      if (!isChunkLoadError(error)) throw error

      const retryCount = Number(sessionStorage.getItem(storageKey) || '0')
      console.error(`[lazyWithRetry] Chunk load failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error)

      if (retryCount < MAX_RETRIES) {
        sessionStorage.setItem(storageKey, String(retryCount + 1))
        window.location.reload()
        return new Promise<{ default: ComponentType }>(() => {})
      }

      sessionStorage.removeItem(storageKey)
      return {
        default: () => (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-medium mb-1">Failed to load page. Please refresh.</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        ),
      }
    }
  })
}
