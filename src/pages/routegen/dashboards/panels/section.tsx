import type { ReactNode } from 'react'

// Labelled section wrapper shared by the tile editor panels (Data / Display / Format).
export const Section = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <div className="font-medium text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
    {children}
  </div>
)
