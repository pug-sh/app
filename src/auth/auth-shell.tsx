import type { ReactNode } from 'react'

export const AuthShell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center p-8">
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-3 mb-8">
        <img src="/logo.svg" alt="" className="w-9 h-9" />
        <span className="text-lg font-medium tracking-tight">Pug</span>
      </div>
      {children}
    </div>
  </div>
)
