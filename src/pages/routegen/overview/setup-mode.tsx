import { useSetAtom } from 'jotai'
import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { highlight } from 'sugar-high'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import CopyableCode from '@/components/copyable-code'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'
import { pollOverviewSchemaAtom } from './overview.atoms'
import { PLATFORM_ORDER, PLATFORMS, type PlatformId } from './setup-platforms'

const CodeBlock = ({ code }: { code: string }) => {
  const { copied, copy } = useCopyToClipboard()
  // sugar-high returns an HTML string of token spans colored via `--sh-*` CSS vars (themed in
  // index.css under `.sugar-high`). Safe to inject because the input is trusted — our own static
  // snippets plus the project's backend-issued public key, never user input. (sugar-high also
  // entity-escapes the code, but the safety rests on the trusted input, not the highlighter.)
  const html = useMemo(() => highlight(code), [code])
  return (
    <div className="group relative">
      <pre className="sugar-high overflow-x-auto rounded-md border border-border/50 bg-muted/50 p-3 pr-10 font-mono text-xs leading-relaxed">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted sugar-high output, see above */}
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => copy(code)}
        className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
      >
        {copied ? <Check className="h-3 w-3 text-green-600 dark:text-green-400" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  )
}

const SetupMode = ({ project }: { project: Project }) => {
  const poll = useSetAtom(pollOverviewSchemaAtom)
  const [platformId, setPlatformId] = useState<PlatformId>('web')
  const [refreshing, setRefreshing] = useState(false)

  const platform = PLATFORMS[platformId]

  // Poll for the project's first events every 5s. When they land, overviewSchemaAtom gains an
  // event and the page swaps to the dashboard — unmounting this screen and clearing the interval.
  // The request is skipped while the tab is backgrounded (document.hidden).
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) poll()
    }, 5000)
    return () => clearInterval(id)
  }, [poll])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      // An explicit user action deserves feedback the silent background poll skips.
      const ok = await poll()
      if (!ok) toast.error('Could not check for events — please try again')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <SectionHeader title="API Keys" />
        <table className="w-full max-w-xl">
          <tbody>
            <CopyableCode label="Public Key" value={project.publicApiKey} />
            <CopyableCode label="Private Key" value={project.privateApiKey} masked />
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Install the SDK" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border text-xs">
            {PLATFORM_ORDER.map((id, i) => (
              <span key={id} className="inline-flex h-full items-center">
                {i > 0 && <span className="h-full w-px bg-border" />}
                <button
                  type="button"
                  onClick={() => setPlatformId(id)}
                  className={cn(
                    'inline-flex h-full items-center gap-1.5 px-2.5 transition-colors',
                    platformId === id ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <img
                    src={PLATFORMS[id].icon}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="size-4 saturate-[0.5]"
                  />
                  {PLATFORMS[id].label}
                </button>
              </span>
            ))}
          </span>

          <a
            href={platform.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-link underline-offset-4 hover:underline"
          >
            {platform.label} docs
            <ExternalLink className="size-3" />
          </a>
        </div>

        {platform.sections.map(section => (
          <div key={section.label} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{section.label}</p>
            <CodeBlock code={section.code(project.id, project.publicApiKey)} />
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-link opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-link" />
        </span>
        <p className="text-xs text-muted-foreground">
          Waiting for your first events — this page switches to your dashboard automatically.
        </p>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Check now
        </Button>
      </div>
    </div>
  )
}

export default SetupMode
