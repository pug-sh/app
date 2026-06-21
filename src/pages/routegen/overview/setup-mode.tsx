import { useAtomValue, useSetAtom } from 'jotai'
import { Check, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { Project } from '@/api/genproto/dashboard/projects/v1/projects_pb'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { fetchOverviewSchemaAtom, overviewSchemaLoadingAtom } from './overview.atoms'

const CopyableCode = ({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) => {
  const { copied, copy } = useCopyToClipboard()
  const [revealed, setRevealed] = useState(!masked)
  const safe = value ?? ''
  const display = revealed ? safe : `${safe.slice(0, 8)}••••••••••••`

  return (
    <tr className="border-b border-border/50">
      <td className="whitespace-nowrap py-2.5 pr-4 align-middle text-xs text-muted-foreground">{label}</td>
      <td className="py-2.5 pr-2 align-middle">
        <code className="break-all font-mono text-xs">{display}</code>
      </td>
      <td className="whitespace-nowrap py-2.5 align-middle">
        <span className="inline-flex gap-0.5">
          {masked && (
            <Button variant="ghost" size="icon-xs" onClick={() => setRevealed(!revealed)}>
              {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" onClick={() => copy(safe)}>
            {copied ? <Check className="h-3 w-3 text-green-600 dark:text-green-400" /> : <Copy className="h-3 w-3" />}
          </Button>
        </span>
      </td>
    </tr>
  )
}

const SetupMode = ({ project }: { project: Project }) => {
  const refresh = useSetAtom(fetchOverviewSchemaAtom)
  const loading = useAtomValue(overviewSchemaLoadingAtom)

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

      <section>
        <SectionHeader title="Quick Start" />
        <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
          <li>Add your FCM service account JSON in Settings</li>
          <li>Integrate the Pug SDK in your app</li>
          <li>Register devices using the public API key</li>
          <li>Create and schedule your first campaign</li>
        </ol>
      </section>

      <div className="flex items-center gap-3 pt-2">
        <p className="text-xs text-muted-foreground">
          Once events start flowing this page will switch to your dashboard.
        </p>
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </div>
  )
}

export default SetupMode
