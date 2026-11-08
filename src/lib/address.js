import { useEffect, useState } from 'react'
import { BRANCHES } from './branches'

// Every page has its own address (for example /inventory), so the browser's Back and Forward
// (and the mouse's back button) move between the portal's pages instead of leaving the site.

const EVENT = 'portal-address'

// the address without a slash at the end, for example "/inventory"
export const currentPath = () => window.location.pathname.replace(/\/+$/, '') || '/'

// open an address (replace: change this history step instead of adding one)
export function go(path, replace = false) {
  if (path === currentPath()) return
  window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
  window.dispatchEvent(new Event(EVENT))
}

// the address shown now; the page updates when it changes (a click, Back or Forward)
export function useAddress() {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const update = () => setPath(currentPath())
    window.addEventListener('popstate', update)
    window.addEventListener(EVENT, update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener(EVENT, update)
    }
  }, [])
  return path
}

// a branch in an address: "Sta. Teresita" -> "sta-teresita"
export const branchSlug = (id) =>
  BRANCHES.find((b) => b.id === Number(id))?.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ?? ''
export const branchOfSlug = (slug) => BRANCHES.find((b) => branchSlug(b.id) === slug)?.id ?? null
