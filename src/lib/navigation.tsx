import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ConfirmationModal } from '../components/ConfirmationModal'

export type AppLocation = {
  pathname: string
  search: string
  hash: string
}

export type NavigateOptions = {
  replace?: boolean
  skipGuard?: boolean
}

export type NavigationGuard = {
  shouldBlock: (to: string) => boolean
  eyebrow?: string
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: (to: string) => void | Promise<void>
}

type AppNavigationContextValue = {
  navigate: (to: string, options?: NavigateOptions) => void
  registerNavigationGuard: (guard: NavigationGuard | null) => () => void
}

const navigationContext = createContext<AppNavigationContextValue | null>(null)

const publicPaths = new Set(['/','/landing','/demo','/banker','/lobby','/rules','/faq','/privacy','/terms','/contact'])

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

export function useNavigationGuard(guard: NavigationGuard | null) {
  const registerNavigationGuard = useContext(navigationContext)?.registerNavigationGuard
  if (!registerNavigationGuard) throw new Error('useNavigationGuard must be used inside AppNavigationProvider')
  useEffect(() => registerNavigationGuard(guard), [guard, registerNavigationGuard])
}

type PendingNavigation = {
  to: string
  options?: NavigateOptions
  guard: NavigationGuard
}

export function AppNavigationProvider({ navigate, onPopState, children }: { navigate: AppNavigationContextValue['navigate']; onPopState: (fromPath?: string) => void; children: ReactNode }) {
  const guardRef = useRef<NavigationGuard | null>(null)
  const currentUrlRef = useRef(currentNavigableUrl())
  const restoringHistoryRef = useRef(false)
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)
  const [confirming, setConfirming] = useState(false)

  const registerNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    if (guard) currentUrlRef.current = currentNavigableUrl()
    guardRef.current = guard
    return () => {
      if (guardRef.current === guard) guardRef.current = null
    }
  }, [])

  const commitNavigation = useCallback((to: string, options?: NavigateOptions) => {
    navigate(to, options)
    currentUrlRef.current = toNavigablePath(to)
  }, [navigate])

  const requestNavigation = useCallback((to: string, options?: NavigateOptions) => {
    if (!pendingNavigation) currentUrlRef.current = currentNavigableUrl()
    const next = toNavigablePath(to)
    if (next === currentUrlRef.current) return
    if (options?.skipGuard) {
      commitNavigation(next, options)
      return
    }
    const guard = guardRef.current
    if (guard?.shouldBlock(next)) {
      setPendingNavigation({ to: next, options, guard })
      return
    }
    commitNavigation(next, options)
  }, [commitNavigation, pendingNavigation])

  useEffect(() => {
    const handlePopState = () => {
      const target = readAppLocation()
      if (target.pathname === '/') {
        const normalized = toNavigablePath(`${target.pathname}${target.search}${target.hash}`)
        window.history.replaceState({}, '', normalized)
      }
      const targetUrl = currentNavigableUrl()
      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false
        currentUrlRef.current = targetUrl
        return
      }
      const guard = guardRef.current
      if (targetUrl !== currentUrlRef.current && guard?.shouldBlock(targetUrl)) {
        setPendingNavigation({ to: targetUrl, options: { replace: true }, guard })
        restoringHistoryRef.current = true
        window.history.forward()
        return
      }
      const previousPath = new URL(currentUrlRef.current, window.location.origin).pathname
      currentUrlRef.current = targetUrl
      onPopState(previousPath)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [onPopState])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!guardRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const confirmNavigation = async () => {
    if (!pendingNavigation || confirming) return
    const pending = pendingNavigation
    setConfirming(true)
    try {
      await pending.guard.onConfirm?.(pending.to)
      setPendingNavigation(null)
      commitNavigation(pending.to, pending.options)
    } catch {
      // The guarded screen owns the error presentation. Keep the user on the page.
      setPendingNavigation(null)
    } finally {
      setConfirming(false)
    }
  }

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
    requestNavigation(`${url.pathname}${url.search}${url.hash}`)
  }, [requestNavigation])

  useEffect(() => {
    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [handleDocumentClick])

  return <navigationContext.Provider value={{ navigate: requestNavigation, registerNavigationGuard }}>
    {children}
    {pendingNavigation && <ConfirmationModal
      eyebrow={pendingNavigation.guard.eyebrow}
      title={pendingNavigation.guard.title}
      message={pendingNavigation.guard.message}
      confirmLabel={pendingNavigation.guard.confirmLabel}
      cancelLabel={pendingNavigation.guard.cancelLabel}
      confirming={confirming}
      onCancel={() => { if (!confirming) setPendingNavigation(null) }}
      onConfirm={() => void confirmNavigation()}
    />}
  </navigationContext.Provider>
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
