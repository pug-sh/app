import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'

export const McpGuideLink = ({ children }: { children: ReactNode }) => (
  <a
    href="https://docs.pug.sh/mcp/"
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-link underline-offset-4 hover:underline"
  >
    {children}
    <ExternalLink className="size-3" />
  </a>
)
