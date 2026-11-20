import { useCallback, useEffect, useRef, useState } from 'react'

const REFRESH_INTERVAL_MS = 250

interface FocusTimerState {
  startedAt: number | null
  elapsedMs: number
  completedDurationMs: number | null
}

const initialState: FocusTimerState = {
  startedAt: null,
  elapsedMs: 0,
  completedDurationMs: null,
}

export function useFocusTimer() {
  const [state, setState] = useState(initialState)
  const startedAtRef = useRef<number | null>(null)

  const start = useCallback(() => {
    if (startedAtRef.current !== null) return

    const startedAt = Date.now()
    startedAtRef.current = startedAt
    setState({ startedAt, elapsedMs: 0, completedDurationMs: null })
  }, [])

  const stop = useCallback(() => {
    const startedAt = startedAtRef.current
    if (startedAt === null) return

    const completedDurationMs = Math.max(0, Date.now() - startedAt)
    startedAtRef.current = null
    setState({
      startedAt: null,
      elapsedMs: completedDurationMs,
      completedDurationMs,
    })
  }, [])

  useEffect(() => {
    const startedAt = state.startedAt
    if (startedAt === null) return

    const refreshElapsed = () => {
      setState((current) => {
        if (current.startedAt === null) return current
        return { ...current, elapsedMs: Math.max(0, Date.now() - startedAt) }
      })
    }

    const intervalId = window.setInterval(refreshElapsed, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshElapsed)
    refreshElapsed()

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', refreshElapsed)
    }
  }, [state.startedAt])

  const status = state.startedAt !== null ? 'Focusing' : state.completedDurationMs !== null ? 'Stopped' : 'Ready'

  return {
    status,
    elapsedMs: state.elapsedMs,
    completedDurationMs: state.completedDurationMs,
    start,
    stop,
  } as const
}
