import { useEffect, useState } from 'react'
import { Check, Copy, Menu, X } from 'lucide-react'
import { LandingFooter } from '../landing/LandingFooter'
import './ContactScreen.css'

export function ContactScreen() {
  const [navScrolled, setNavScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const email = 'glennjoshuacorpus@gmail.com'

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closeMobileMenu = () => setMobileMenuOpen(false)
  const copyEmail = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(email)
      else {
        const input = document.createElement('textarea')
        input.value = email
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.append(input)
        input.select()
        document.execCommand('copy')
        input.remove()
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

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
        <div className="contact-hero-inner"><span className="eyebrow">FLIP7 COMPANION · CONTACT</span><h1>Need a hand?<br /><em>Get in touch.</em></h1><p>Questions, feedback, or something at the table that needs a closer look? Send an email.</p></div>
        <div className="contact-hero-cards" aria-hidden="true"><img src="/cards/SECOND CHANCE.png" alt="" /><img src="/cards/3.png" alt="" /><img src="/cards/+4.png" alt="" /></div>
      </section>
      <section className="contact-status"><span className="eyebrow">CONTACT PAGE</span><h2>Coming soon.</h2><p>Our built-in contact form is on its way. For now, email us directly at:</p><div className="contact-email"><a href={`mailto:${email}`}>{email}</a><button type="button" onClick={() => void copyEmail()} aria-label="Copy email address">{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Copied!' : 'Copy email'}</button></div><span className="contact-copy-status" role="status" aria-live="polite">{copied ? 'Email address copied to your clipboard.' : ''}</span><div className="contact-actions"><a href="/faq">Browse FAQs</a><a href="/rules">Read the rules</a></div></section>
    </main>
    <LandingFooter isRulesPage />
  </div>
}
