import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { LandingHero } from './LandingHero'
import { HowItWorks } from './HowItWorks'
import { LandingFooter } from './LandingFooter'

export function LandingScreen({ onStart }: { onStart: () => void }) {
  const [navScrolled, setNavScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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
  const closeMobileMenu = () => setMobileMenuOpen(false)
  const scrollToHowItWorks = () => {
    const target = document.getElementById('landing-how')
    if (!target) return
    const headerHeight = document.querySelector<HTMLElement>('.landing-nav')?.offsetHeight ?? 74
    const targetTop = target.getBoundingClientRect().top + window.scrollY - headerHeight - 16
    window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
  }
  const startFromMenu = () => {
    closeMobileMenu()
    onStart()
  }
  return <div id="landing-page" className="landing-page">
    <header className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}><div className="landing-nav-inner"><img className="landing-logo" src="/assets/flip7-title-logo.png" alt="Flip 7" /><nav className="landing-top-links" aria-label="Primary navigation"><a href="#landing-page">Home</a><a href="#landing-how" onClick={(event) => { event.preventDefault(); scrollToHowItWorks() }}>How it Works</a><a href="/rules">Rules</a><a href="/faq">FAQ</a></nav><button className="landing-signin" onClick={onStart}>PLAY!</button><button className="landing-mobile-toggle" type="button" aria-expanded={mobileMenuOpen} aria-controls="landing-mobile-menu" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}</button></div>{mobileMenuOpen && <><button className="landing-mobile-backdrop" type="button" aria-label="Close navigation menu" onClick={closeMobileMenu} /><div id="landing-mobile-menu" className="landing-mobile-menu"><nav aria-label="Mobile navigation"><a href="#landing-page" onClick={closeMobileMenu}>Home</a><a href="#landing-how" onClick={(event) => { event.preventDefault(); closeMobileMenu(); scrollToHowItWorks() }}>How it Works</a><a href="/rules" onClick={closeMobileMenu}>Rules</a><a href="/faq" onClick={closeMobileMenu}>FAQ</a></nav><button className="landing-mobile-signin" type="button" onClick={startFromMenu}>PLAY!</button></div></>}</header>
    <main>
      <LandingHero onStart={onStart} onHowItWorks={scrollToHowItWorks} />
      <HowItWorks />
    </main>
    <LandingFooter />
  </div>
}
