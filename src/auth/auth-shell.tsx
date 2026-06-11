import { Bell } from 'lucide-react'
import type { ReactNode } from 'react'

export const AuthShell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen flex items-center justify-center p-8">
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
          <Bell className="w-4.5 h-4.5 text-primary-foreground" />
        </div>
        <span className="text-lg font-medium tracking-tight">Pug</span>
      </div>
      {children}
    </div>
  </div>
)
