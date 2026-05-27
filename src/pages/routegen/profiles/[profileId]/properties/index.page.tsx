import type { JsonValue } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { Copy, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'wouter'
import { Input } from '@/components/ui/input'
import { profileFamilyAtom } from '../_data'
import ProfileShell from '../_shell'

type Entry = { key: string; value: JsonValue; type: string; display: string }

const inferType = (v: JsonValue): string => {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

const displayValue = (v: JsonValue): string => {
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const toEntries = (obj: Record<string, JsonValue> | undefined): Entry[] => {
  if (!obj) return []
  return Object.entries(obj).map(([key, value]) => ({
    key,
    value,
    type: inferType(value),
    display: displayValue(value),
  }))
}

const ProfileProperties = () => {
  const { profileId } = useParams<{ profileId: string }>()
  if (!profileId) return null
  return (
    <ProfileShell profileId={profileId}>
      <PropertiesBody profileId={profileId} />
    </ProfileShell>
  )
}

const PropertiesBody = ({ profileId }: { profileId: string }) => {
  const profile = useAtomValue(profileFamilyAtom(profileId))
  const [q, setQ] = useState('')

  const { custom, system, total } = useMemo(() => {
    const all = toEntries(profile?.properties as Record<string, JsonValue> | undefined)
    const filtered = q ? all.filter(e => e.key.toLowerCase().includes(q.toLowerCase())) : all
    return {
      custom: filtered.filter(e => !e.key.startsWith('$')).sort((a, b) => a.key.localeCompare(b.key)),
      system: filtered.filter(e => e.key.startsWith('$')).sort((a, b) => a.key.localeCompare(b.key)),
      total: all.length,
    }
  }, [profile?.properties, q])

  if (total === 0) {
    return <p className="text-xs text-muted-foreground">No properties identified for this profile yet.</p>
  }

  return (
    <div className="space-y-6">
      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filter properties…"
          className="pl-7 h-8 text-xs"
        />
      </div>
      {custom.length > 0 && <PropertiesSection title="Custom traits" entries={custom} />}
      {system.length > 0 && <PropertiesSection title="System traits" entries={system} />}
      {custom.length === 0 && system.length === 0 && q && (
        <p className="text-xs text-muted-foreground">
          No properties match "<span className="font-mono">{q}</span>".
        </p>
      )}
    </div>
  )
}

const PropertiesSection = ({ title, entries }: { title: string; entries: Entry[] }) => (
  <section>
    <div className="flex items-center gap-2 mb-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-muted-foreground">{entries.length}</span>
    </div>
    <table className="w-full">
      <tbody>
        {entries.map(e => (
          <tr key={e.key} className="group border-b border-border/50 transition-colors hover:bg-muted/40">
            <td className="py-2 pr-4 align-top w-1/3">
              <span className="font-mono text-xs">{e.key}</span>
            </td>
            <td className="py-2 pr-4 align-top w-20">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{e.type}</span>
            </td>
            <td className="py-2 pr-4 align-top">
              <div className="flex items-center gap-2">
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
