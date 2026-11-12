import { useAtom } from 'jotai'
import { ExternalLink, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { aiSetupHiddenAtom } from './dashboard.atoms'

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

export const AiSetupLink = () => {
  const [hidden, setHidden] = useAtom(aiSetupHiddenAtom)
  if (hidden) return null
  return (
    <span className="inline-flex items-center gap-0.5">
      <McpGuideLink>AI setup</McpGuideLink>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Hide AI setup"
        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </span>
  )
}
