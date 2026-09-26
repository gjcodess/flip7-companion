import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { Analytics } from '@vercel/analytics/react'
import { supabase } from './lib/supabase'
import { currentUser } from './lib/room'
import { roomCodeFromPath } from './lib/app-utils'
import { AppNavigationProvider, PageTransition, currentNavigableUrl, readAppLocation, runAppViewTransition, toNavigablePath, type AppLocation } from './lib/navigation'
import { LandingScreen } from './pages/landing/LandingScreen'
import { RulesScreen } from './pages/rules/RulesScreen'
import { FAQScreen } from './pages/faq/FAQScreen'
import { LegalScreen } from './pages/legal/LegalScreen'
import { ContactScreen } from './pages/contact/ContactScreen'
import { AuthScreen } from './pages/auth/AuthScreen'
import { HomeScreen } from './pages/home/HomeScreen'
import { RoomScreen } from './pages/room/RoomScreen'
import { DemoScreen } from './pages/game/DemoScreen'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [location, setLocation] = useState<AppLocation>(() => {
    const current = readAppLocation()
    return { ...current, pathname: current.pathname === '/' ? '/landing' : current.pathname }
  })
  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const next = toNavigablePath(to)
    if (next === currentNavigableUrl()) return
    const currentPath = window.location.pathname
    const nextPath = new URL(next, window.location.origin).pathname
    runAppViewTransition(() => {
      if (options?.replace) window.history.replaceState({}, '', next)
      else window.history.pushState({}, '', next)
      const current = readAppLocation()
      setLocation({ ...current, pathname: current.pathname === '/' ? '/landing' : current.pathname })
    }, { skip: currentPath === '/demo' || nextPath === '/demo' })
  }, [])
  useEffect(() => {
    const onPopState = () => {
      const current = readAppLocation()
      if (current.pathname === '/') {
        const next = toNavigablePath(`${current.pathname}${current.search}${current.hash}`)
        window.history.replaceState({}, '', next)
      }
      runAppViewTransition(() => {
        const next = readAppLocation()
        setLocation({ ...next, pathname: next.pathname === '/' ? '/landing' : next.pathname })
      })
    }
    window.addEventListener('popstate', onPopState)
    if (window.location.pathname === '/') {
      const next = toNavigablePath(`${window.location.pathname}${window.location.search}${window.location.hash}`)
      window.history.replaceState({}, '', next)
    }
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const isRulesPage = location.pathname === '/rules'
  const isFAQPage = location.pathname === '/faq'
  const isPrivacyPage = location.pathname === '/privacy'
  const isTermsPage = location.pathname === '/terms'
  const isContactPage = location.pathname === '/contact'
  const isDemoPage = location.pathname === '/demo'
  const showLanding = location.pathname === '/landing'
  const roomCode = roomCodeFromPath(location.pathname) || new URLSearchParams(location.search).get('room')
  useEffect(() => {
    if (isDemoPage) { setUser(null); return }
    if (!supabase) { setUser(null); return }
    void currentUser().then(setUser)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [isDemoPage])
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (location.hash) {
        document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname, location.search, location.hash])

  const openRoom = (code: string) => { const next = code.toUpperCase(); navigate(`/game/${next}`, { replace: true }) }
  const leaveRoom = () => navigate('/landing', { replace: true })
  const enterApp = () => { sessionStorage.setItem('flip7-app-entered', '1'); navigate('/lobby', { replace: true }) }

  let content: ReactNode
  if (isRulesPage) content = <RulesScreen />
  else if (isFAQPage) content = <FAQScreen />
  else if (isPrivacyPage) content = <LegalScreen kind="privacy" />
  else if (isTermsPage) content = <LegalScreen kind="terms" />
  else if (isContactPage) content = <ContactScreen />
  else if (isDemoPage) content = <DemoScreen />
  else if (!supabase) content = <div className="simple-state"><p>Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values to .env.local.</p></div>
  else if (showLanding) content = <LandingScreen onStart={enterApp} />
  else if (user === undefined) content = <div className="simple-state"><LoaderCircle className="spin" /><p>Opening the table…</p></div>
  else if (!user) content = <AuthScreen onAuthenticated={setUser} />
  else content = roomCode ? <RoomScreen user={user} code={roomCode} leaveRoom={leaveRoom} /> : <HomeScreen user={user} openRoom={openRoom} />

  const isLiveRoom = Boolean(roomCode)
  return <AppNavigationProvider navigate={navigate}>
    {isLiveRoom ? content : <PageTransition routeKey={`${location.pathname}${location.search}`}>{content}</PageTransition>}
  </AppNavigationProvider>
}
