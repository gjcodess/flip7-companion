import { useEffect, useState } from 'react'
import { LandingHero } from './LandingHero'
import { HowItWorks } from './HowItWorks'
import { LandingFooter } from './LandingFooter'

export function LandingScreen({ onStart }: { onStart: () => void }) {
  const [navScrolled, setNavScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    document.documentElement.classList.add('landing-active')
    return () => document.documentElement.classList.remove('landing-active')
  }, [])
  return <div id="landing-page" className="landing-page">
    <header className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}><div className="landing-nav-inner"><img className="landing-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /><nav className="landing-top-links" aria-label="Primary navigation"><a href="#landing-page">Home</a><a href="#landing-how">How it Works</a><a href="/rules">Rules</a><a href="#landing-how">FAQ</a></nav><button className="landing-signin" onClick={onStart}>Sign in</button></div></header>
    <main>
      <LandingHero onStart={onStart} />
      <HowItWorks />
    </main>
    <LandingFooter />
  </div>
}
