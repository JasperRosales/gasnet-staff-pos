import { useEffect, useRef, useState } from 'react'

// Lazy data helpers that keep Supabase calls down:
//  - cachedQuery: reuse a recent answer and share one request between callers asking at once
//  - liveRefresher: many realtime events in a burst -> one reload; none while the tab is hidden
//  - useInView: load a section only once it scrolls into view

const cache = new Map() // key -> { at, value }
const pending = new Map() // key -> Promise

// run() returns { data, error } like a Supabase query; only answers without an error are kept
export async function cachedQuery(key, ttlMs, run) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value
  if (pending.has(key)) return pending.get(key)
  const request = (async () => {
    try {
      const value = await run()
      if (!value?.error) cache.set(key, { at: Date.now(), value })
      return value
    } finally {
      pending.delete(key)
    }
  })()
  pending.set(key, request)
  return request
}

// forget cached answers whose key starts with prefix (all of them when empty)
export function invalidate(prefix = '') {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key)
}

// Wraps a reload for realtime events: waits `delay` ms after the last event, then reloads once.
// While the tab is hidden it only remembers that a reload is due, and does it when the tab is shown.
export function liveRefresher(reload, delay = 600) {
  let timer = null
  let due = false
  const run = () => {
    timer = null
    if (document.hidden) {
      due = true
      return
    }
    due = false
    reload()
  }
  const onVisible = () => {
    if (!document.hidden && due) run()
  }
  document.addEventListener('visibilitychange', onVisible)
  return {
    trigger() {
      clearTimeout(timer)
      timer = setTimeout(run, delay)
    },
    stop() {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}

// [ref, seen]: seen turns true the first time the element comes within `margin` of the screen
export function useInView(margin = '200px') {
  const ref = useRef(null)
  // old browsers without IntersectionObserver: show everything right away
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          observer.disconnect()
        }
      },
      { rootMargin: margin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [margin, seen])
  return [ref, seen]
}
