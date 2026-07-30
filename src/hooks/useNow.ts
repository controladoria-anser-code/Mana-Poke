import { useEffect, useState } from 'react'

export function useNow(refreshIntervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), refreshIntervalMs)
    return () => window.clearInterval(intervalId)
  }, [refreshIntervalMs])

  return now
}
