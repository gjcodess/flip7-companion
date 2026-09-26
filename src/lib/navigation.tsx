import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react'

export type AppLocation = {
  pathname: string
  search: string
  hash: string
}

export type NavigateOptions = {
  replace?: boolean
}

type AppNavigationContextValue = {
  navigate: (to: string, options?: NavigateOptions) => void
}

const navigationContext = createContext<AppNavigationContextValue | null>(null)

const publicPaths = new Set(['/','/landing','/demo','/lobby','/rules','/faq','/privacy','/terms','/contact'])

export function readAppLocation(): AppLocation {
  return { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash }
}

function normalizePath(pathname: string) {
  return pathname === '/' ? '/landing' : pathname
}

function isInternalPath(pathname: string) {
  return publicPaths.has(pathname) || pathname.startsWith('/game/')
}

function locationUrl(location: AppLocation) {
  return `${location.pathname}${location.search}${location.hash}`
}

export function useAppNavigation() {
  const value = useContext(navigationContext)
  if (!value) throw new Error('useAppNavigation must be used inside AppNavigationProvider')
  return value.navigate
}

export function AppNavigationProvider({ navigate, children }: { navigate: AppNavigationContextValue['navigate']; children: ReactNode }) {
  const handleDocumentClick = useCallback((event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null
    if (!target || target.target === '_blank' || target.hasAttribute('download')) return
    const url = new URL(target.href, window.location.href)
    if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol) || !isInternalPath(url.pathname)) return
    if (url.pathname === window.location.pathname && url.search === window.location.search) return
    if (normalizePath(url.pathname) === normalizePath(window.location.pathname) && !url.hash && !window.location.hash) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    navigate(`${url.pathname}${url.search}${url.hash}`)
  }, [navigate])

  useEffect(() => {
    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [handleDocumentClick])

  return <navigationContext.Provider value={{ navigate }}>{children}</navigationContext.Provider>
}

export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  void routeKey
  return <div className="page-transition-stage">{children}</div>
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown
}

export function runAppViewTransition(update: () => void, options?: { skip?: boolean }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const startViewTransition = (document as ViewTransitionDocument).startViewTransition
  if (options?.skip || reducedMotion || !startViewTransition) {
    update()
    return
  }
  startViewTransition.call(document, update)
}

export function toNavigablePath(to: string) {
  const url = new URL(to, window.location.href)
  const pathname = normalizePath(url.pathname)
  return `${pathname}${url.search}${url.hash}`
}

export function currentNavigableUrl() {
  const location = readAppLocation()
  return locationUrl({ ...location, pathname: normalizePath(location.pathname) })
}
