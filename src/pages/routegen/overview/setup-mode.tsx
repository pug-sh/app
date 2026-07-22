import { useSetAtom } from 'jotai'
import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { highlight } from 'sugar-high'
import { ApiKeyKind, type Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import CopyableCode from '@/components/copyable-code'
import LoadingSpinner from '@/components/loading-spinner'
import ProjectLink from '@/components/project-link'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { useApiKeys } from '@/hooks/use-api-keys'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'
import { pollOverviewSchemaAtom } from './overview.atoms'
import { PLATFORM_ORDER, PLATFORMS, type PlatformId } from './setup-platforms'

// Stands in for the project's public key in the snippets when there is none to show. Once the key
// state resolves, that is a fact — every public key was revoked — and the placeholder is honest,
// where an empty string would silently ship a broken init. While the key is still unresolved it is
// not a fact, so those snippets withhold Copy instead (see publicKeyPending).
const PUBLIC_KEY_PLACEHOLDER = 'YOUR_PUBLIC_KEY'

// `copyable` is opt-out so a caller can suppress Copy for code it knows is provisional — the
// placeholder below reads exactly like the docs' own "fill this in" convention, so a copy taken
// mid-load is indistinguishable from a finished snippet and fails only once it is running in the
// user's app.
const CodeBlock = ({ code, copyable = true, context }: { code: string; copyable?: boolean; context?: string }) => {
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
      {copyable && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => copy(code, context)}
          className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        >
          {copied ? <Check className="h-3 w-3 text-positive" /> : <Copy className="h-3 w-3" />}
        </Button>
      )}
    </div>
  )
}

const SetupMode = ({ project }: { project: Project }) => {
  const poll = useSetAtom(pollOverviewSchemaAtom)
  const { keys, loading: keysLoading, refreshing: keysRefreshing, error: keysError, reload: reloadKeys } = useApiKeys()
  const [platformId, setPlatformId] = useState<PlatformId>('web')
  const [refreshing, setRefreshing] = useState(false)

  const platform = PLATFORMS[platformId]

  // Any public key authenticates the project, so take the first one — the backend resolves a
  // project by the key's own token, with no notion of a primary. It can be absent: every public
  // key is revocable, including the starter one created with the project.
  const publicKey = keys.find(k => k.kind === ApiKeyKind.PUBLIC)?.key ?? ''

  // Loading, or the fetch failed: the key is unknown rather than absent, so the placeholder the
  // snippets fall back to isn't true yet, and snippets carrying it withhold Copy.
  const publicKeyPending = keysLoading || !!keysError

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
        {keysLoading ? (
          <LoadingSpinner />
        ) : keysError ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">{keysError}</p>
            <Button variant="outline" size="sm" onClick={reloadKeys} disabled={keysRefreshing}>
              Retry
            </Button>
          </div>
        ) : publicKey ? (
          <div className="max-w-xl">
            <CopyableCode label="Public Key" value={publicKey} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This project has no public key.{' '}
            <ProjectLink href="/settings/api-keys" className="text-link underline-offset-4 hover:underline">
              Create one
            </ProjectLink>{' '}
            to start sending events.
          </p>
        )}
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

        {platform.needsPrivateKey && (
          <p className="text-xs text-muted-foreground">
            The server SDK authenticates with a private key.{' '}
            <ProjectLink href="/settings/api-keys" className="text-link underline-offset-4 hover:underline">
              Create one in settings
            </ProjectLink>{' '}
            — it is shown once, when created.
          </p>
        )}

        {platform.sections.map(section => (
          <div key={section.label} className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{section.label}</p>
            <CodeBlock
              code={section.code(project.id, publicKey || PUBLIC_KEY_PLACEHOLDER)}
              copyable={!(publicKeyPending && section.credential === 'public')}
              // Which platform's which snippet got copied — the strongest activation signal on this
              // screen. platformId is stable ('web'/'node'/…); section.label is our own fixed
              // section name, never customer text.
              context={`sdk_snippet:${platformId}:${section.label}`}
            />
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
