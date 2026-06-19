import { create } from '@bufbuild/protobuf'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TimeRangeSchema } from '@/api/genproto/common/v1/time_pb'
import type { ActivityEvent } from '@/api/genproto/shared/activity/v1/activity_pb'
import { activityRPCAtom } from '@/api/rpc'
import {
  dedupeVisitors,
  LIVE_PAGE_SIZE,
  LIVE_POLL_MS,
  LIVE_WINDOW_MS,
  liveTimeRange,
} from '@/components/live-map/live-visitors'
import { activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { toProtoTimeRange } from '@/lib/timestamp'

// Polls every event kind in the active window. No `events` filter is sent — the backend
// has no live stream (all RPCs are unary), so we pull the whole window and filter client-side.
// `arrivals` is the count of visitors that appeared since the previous successful poll, used
// for the "+N" liveness cue.
export const useLiveEvents = () => {
  const project = useAtomValue(activeProjectAtom)
  const headers = useAtomValue(projectHeaderAtom)
  const activityRPC = useAtomValue(activityRPCAtom)

  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [windowMs, setWindowMs] = useState(LIVE_WINDOW_MS)
  const [arrivals, setArrivals] = useState(0)

  const windowRef = useRef(windowMs)
  windowRef.current = windowMs
  const seenRef = useRef<Set<string> | null>(null)

  const load = useCallback(async () => {
    if (!headers) return
    setError(null)
    try {
      const range = liveTimeRange(windowRef.current)
      const resp = await activityRPC.getEventExplorer(
        {
          timeRange: create(TimeRangeSchema, toProtoTimeRange(range)),
          pageSize: LIVE_PAGE_SIZE,
          pageToken: '',
          events: [],
        },
        { headers },
      )
      setEvents(resp.events)
      setLastUpdated(new Date())

      const ids = new Set(dedupeVisitors(resp.events).map(v => v.distinctId))
      const prev = seenRef.current
      if (prev) {
        let added = 0
        for (const id of ids) if (!prev.has(id)) added++
        setArrivals(added)
      }
      seenRef.current = ids
    } catch (err) {
      console.error('activity.getEventExplorer failed:', err)
      setError('Failed to load live activity')
    } finally {
      setLoading(false)
    }
  }, [activityRPC, headers])

  // Re-poll on mount and whenever the window changes. Changing the window refetches immediately
  // (a wider window is a different question, not a slow refresh).
  useEffect(() => {
    if (!project) return
    setLoading(true)
    seenRef.current = null
    setArrivals(0)
    load()
    const id = window.setInterval(load, LIVE_POLL_MS)
    return () => window.clearInterval(id)
  }, [load, project, windowMs])

  return { events, loading, error, lastUpdated, windowMs, setWindowMs, arrivals, reload: load }
}
