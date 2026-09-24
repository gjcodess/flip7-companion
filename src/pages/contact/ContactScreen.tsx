import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { LandingFooter } from '../landing/LandingFooter'
import './ContactScreen.css'

export function ContactScreen() {
  const [navScrolled, setNavScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return <div className="landing-page contact-page">
    <header className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}>
      <div className="landing-nav-inner">
        <a href="/" className="contact-brand"><img className="landing-logo" src="/assets/flip7-title-logo.png" alt="Flip7 Companion" /></a>
        <nav className="landing-top-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/#landing-how">How it Works</a><a href="/rules">Rules</a><a href="/faq">FAQ</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a></nav>
        <a href="/lobby" className="landing-signin">PLAY!</a>
        <button className="landing-mobile-toggle" type="button" aria-expanded={mobileMenuOpen} aria-controls="contact-mobile-menu" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
      {mobileMenuOpen && <><button className="landing-mobile-backdrop" type="button" aria-label="Close navigation menu" onClick={closeMobileMenu} /><div id="contact-mobile-menu" className="landing-mobile-menu"><nav aria-label="Mobile navigation"><a href="/" onClick={closeMobileMenu}>Home</a><a href="/#landing-how" onClick={closeMobileMenu}>How it Works</a><a href="/rules" onClick={closeMobileMenu}>Game Rules</a><a href="/faq" onClick={closeMobileMenu}>Frequently Asked Questions</a><a href="/privacy" onClick={closeMobileMenu}>Data Privacy Policy</a><a href="/terms" onClick={closeMobileMenu}>Terms &amp; Conditions</a><a href="/contact" onClick={closeMobileMenu}>Contact Us</a></nav><a href="/lobby" className="landing-mobile-signin" onClick={closeMobileMenu}>PLAY!</a></div></>}
    </header>

    <main className="contact-main">
      <section className="contact-hero">
        <div className="contact-hero-inner"><span className="eyebrow">FLIP7 COMPANION · CONTACT</span><h1>We’re getting<br /><em>in touch.</em></h1><p>We’re preparing a simple way for you to reach the Flip7 Companion team.</p></div>
        <div className="contact-hero-cards" aria-hidden="true"><img src="/cards/SECOND CHANCE.png" alt="" /><img src="/cards/3.png" alt="" /><img src="/cards/+4.png" alt="" /></div>
      </section>
      <section className="contact-status"><span className="eyebrow">CONTACT PAGE</span><h2>Coming soon.</h2><p>Support and contact options are on their way. Until then, the FAQs and Rules have answers for the most common table questions.</p><div className="contact-actions"><a href="/faq">Browse FAQs</a><a href="/rules">Read the rules</a></div></section>
    </main>
    <LandingFooter isRulesPage />
  </div>
}
