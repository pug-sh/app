import { useState } from 'react'

export const useEventKinds = () => {
  const [eventKinds, setEventKinds] = useState<string[]>([])
  const updateEvent = (idx: number, val: string) => {
    if (!val) {
      setEventKinds(prev => prev.filter((_, i) => i !== idx))
    } else {
      setEventKinds(prev => prev.map((e, i) => (i === idx ? val : e)))
    }
  }
  return { eventKinds, setEventKinds, updateEvent }
}
