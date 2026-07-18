import type { JsonValue } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { Copy, User } from 'lucide-react'
import { useMemo } from 'react'
import NoProject from '@/components/no-project'
import { activeProjectAtom } from '@/data/workspace.atoms'
import { useRouteParams } from '@/lib/route-params'
import { profileFamilyAtom } from '../_data'

type Entry = { key: string; value: JsonValue; type: string; display: string }

const inferType = (v: JsonValue) => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

const displayValue = (v: JsonValue) => {
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const toEntries = (obj: Record<string, JsonValue> | undefined) => {
  if (!obj) return []
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value,
    type: inferType(value),
    display: displayValue(value),
  }))
}

const ProfileProperties = () => {
  const { profileId } = useRouteParams<{ profileId: string }>()
  const project = useAtomValue(activeProjectAtom)
  if (!project) return <NoProject title="Profile" icon={User} />
  if (!profileId) return null
  return <PropertiesBody profileId={profileId} />
}

const PropertiesBody = ({ profileId }: { profileId: string }) => {
  const profile = useAtomValue(profileFamilyAtom(profileId))

  const { custom, system, total } = useMemo(() => {
    const all = toEntries(profile?.properties as Record<string, JsonValue> | undefined)
    return {
      custom: all.filter(e => !e.key.startsWith('$')).sort((a, b) => a.key.localeCompare(b.key)),
      system: all.filter(e => e.key.startsWith('$')).sort((a, b) => a.key.localeCompare(b.key)),
      total: all.length,
    }
  }, [profile?.properties])

  if (total === 0) {
    return <p className="text-xs text-muted-foreground">No properties identified for this profile yet.</p>
  }

  return (
    <div className="space-y-6">
      {custom.length > 0 && <PropertiesSection title="Custom traits" entries={custom} />}
      {system.length > 0 && <PropertiesSection title="System traits" entries={system} />}
    </div>
  )
}

const PropertiesSection = ({ title, entries }: { title: string; entries: Entry[] }) => (
  <section>
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-muted-foreground">{entries.length}</span>
    </div>
    <table className="w-full">
      <tbody>
        {entries.map(e => (
          <tr key={e.key} className="group border-b border-border/50 transition-colors hover:bg-muted/40">
            <td className="py-2 pr-6 align-baseline whitespace-nowrap leading-5">
              <span className="font-mono text-xs">{e.key}</span>
            </td>
            <td className="py-2 pr-6 align-baseline whitespace-nowrap leading-5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{e.type}</span>
            </td>
            <td className="py-2 pr-4 align-baseline w-full leading-5">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-xs" title={e.display}>
                  {e.display}
                </span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(e.display)}
                  className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0"
                  aria-label="Copy"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
)

export default ProfileProperties
