import type { JsonValue } from '@bufbuild/protobuf'
import { fromJson, toJson } from '@bufbuild/protobuf'
import { atomFamily, atomWithStorage } from 'jotai/utils'
import { type Dashboard, DashboardSchema } from '@/api/genproto/dashboard/dashboards/v1/dashboards_pb'

export type StoredDraft = {
  draft: Dashboard
  viewSnapshot: Dashboard
  startedAt: number
}

type SerializedDraft = {
  draft: JsonValue
  viewSnapshot: JsonValue
  startedAt: number
}

// Proto messages serialize via toJson/fromJson so bigint timestamp fields survive
// a localStorage round-trip (JSON.stringify would throw on bigint).
const serialize = (value: StoredDraft): string => {
  const payload: SerializedDraft = {
    draft: toJson(DashboardSchema, value.draft),
    viewSnapshot: toJson(DashboardSchema, value.viewSnapshot),
    startedAt: value.startedAt,
  }
  return JSON.stringify(payload)
}

const deserialize = (raw: string): StoredDraft => {
  const parsed = JSON.parse(raw) as SerializedDraft
  return {
    draft: fromJson(DashboardSchema, parsed.draft),
    viewSnapshot: fromJson(DashboardSchema, parsed.viewSnapshot),
    startedAt: parsed.startedAt,
  }
}

const protoStorage = {
  getItem: (key: string, initialValue: StoredDraft | null): StoredDraft | null => {
    const raw = localStorage.getItem(key)
    if (raw === null || raw === 'null') return initialValue
    try {
      return deserialize(raw)
    } catch (err) {
      // Schema-incompatible drafts (after a proto change) can't be recovered.
      // Drop the corrupt entry so it stops retriggering on every mount.
      console.error('Failed to deserialize dashboard draft, discarding:', key, err)
      localStorage.removeItem(key)
      return initialValue
    }
  },
  setItem: (key: string, value: StoredDraft | null) => {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, serialize(value))
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
  },
  subscribe: (key: string, callback: (value: StoredDraft | null) => void, initialValue: StoredDraft | null) => {
    const handler = (event: StorageEvent) => {
      if (event.key !== key) return
      const raw = event.newValue
      if (raw === null || raw === 'null') {
        callback(initialValue)
        return
      }
      try {
        callback(deserialize(raw))
      } catch (err) {
        console.error('Failed to deserialize dashboard draft event:', key, err)
      }
    }
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('storage', handler)
    }
  },
}

const draftKey = (dashboardId: string) => `pug:dashboard-draft:${dashboardId}`

// One atom per dashboard id, persisted to localStorage.
export const draftAtomFamily = atomFamily((dashboardId: string) =>
  atomWithStorage<StoredDraft | null>(draftKey(dashboardId), null, protoStorage),
)

// Imperative helper for callers that want to clear a specific dashboard's draft
// entry without going through the atom (used after a successful Save and on
// dashboard delete).
export const clearDraftKey = (dashboardId: string) => {
  localStorage.removeItem(draftKey(dashboardId))
}
