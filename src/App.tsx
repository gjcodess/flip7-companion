import { useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { Analytics } from '@vercel/analytics/react'
import { supabase } from './lib/supabase'
import { currentUser } from './lib/room'
import { roomCodeFromPath } from './lib/app-utils'
import { LandingScreen } from './pages/landing/LandingScreen'
import { RulesScreen } from './pages/rules/RulesScreen'
import { FAQScreen } from './pages/faq/FAQScreen'
import { LegalScreen } from './pages/legal/LegalScreen'
import { ContactScreen } from './pages/contact/ContactScreen'
import { AuthScreen } from './pages/auth/AuthScreen'
import { HomeScreen } from './pages/home/HomeScreen'
import { RoomScreen } from './pages/room/RoomScreen'

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const isRulesPage = window.location.pathname === '/rules'
  const isFAQPage = window.location.pathname === '/faq'
  const isPrivacyPage = window.location.pathname === '/privacy'
  const isTermsPage = window.location.pathname === '/terms'
  const isContactPage = window.location.pathname === '/contact'
  const [showLanding, setShowLanding] = useState(() => window.location.pathname === '/' || window.location.pathname === '/landing')
  const [roomCode, setRoomCode] = useState(() => roomCodeFromPath(window.location.pathname) || new URLSearchParams(window.location.search).get('room'))
  useEffect(() => {
    if (!supabase) { setUser(null); return }
    void currentUser().then(setUser)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (showLanding && window.location.pathname === '/') window.history.replaceState({}, '', '/landing')
    if (!showLanding && window.location.pathname === '/') window.history.replaceState({}, '', roomCode ? `/game/${roomCode}` : '/lobby')
  }, [roomCode, showLanding])
  const openRoom = (code: string) => { const next = code.toUpperCase(); window.history.replaceState({}, '', `/game/${next}`); setRoomCode(next) }
  const leaveRoom = () => { window.history.replaceState({}, '', '/landing'); setRoomCode(null); setShowLanding(true) }
  const enterApp = () => { sessionStorage.setItem('flip7-app-entered', '1'); window.history.replaceState({}, '', '/lobby'); setShowLanding(false) }
  if (isRulesPage) return <><RulesScreen /><Analytics /></>
  if (isFAQPage) return <><FAQScreen /><Analytics /></>
  if (isPrivacyPage) return <><LegalScreen kind="privacy" /><Analytics /></>
  if (isTermsPage) return <><LegalScreen kind="terms" /><Analytics /></>
  if (isContactPage) return <><ContactScreen /><Analytics /></>
  if (!supabase) return <><div className="simple-state"><p>Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values to .env.local.</p></div><Analytics /></>
  if (showLanding) return <><LandingScreen onStart={enterApp} /><Analytics /></>
  if (user === undefined) return <><div className="simple-state"><LoaderCircle className="spin" /><p>Opening the table…</p></div><Analytics /></>
  if (!user) return <><AuthScreen onAuthenticated={setUser} /><Analytics /></>
  return <>{roomCode ? <RoomScreen user={user} code={roomCode} leaveRoom={leaveRoom} /> : <HomeScreen user={user} openRoom={openRoom} />}<Analytics /></>
}
