import { useEffect, useState, type ReactNode } from 'react'
import { Menu, X } from 'lucide-react'
import { LandingFooter } from '../landing/LandingFooter'
import './LegalScreen.css'

type LegalKind = 'privacy' | 'terms'

function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="legal-section">
    <h2>{title}</h2>
    {children}
  </section>
}

function PrivacyPolicy() {
  return <>
    <LegalSection id="overview" title="Overview">
      <p>This Data Privacy Policy explains how Flip7 Companion handles information when you use the companion app. Flip7 Companion helps groups record physical card flips, share a room, and keep round scores together.</p>
      <p>By using the app, you acknowledge the practices described here. This policy applies to the app, its landing page, Rules page, FAQ page, rooms, and related services.</p>
    </LegalSection>
    <LegalSection id="information" title="Information we collect">
      <p>Depending on how you use the app, we may handle:</p>
      <ul><li><strong>Account information:</strong> your email address and authentication details when you sign in.</li><li><strong>Player and room information:</strong> your display name, room code, player status, round activity, recorded cards, and scores.</li><li><strong>Technical information:</strong> basic browser, device, and diagnostic information needed to keep the service secure and working.</li></ul>
      <p>The app is designed to record game information that you and your group choose to enter. Please avoid putting sensitive personal information into player names or room notes.</p>
    </LegalSection>
    <LegalSection id="use" title="How we use information">
      <p>We use information to provide and improve the companion experience, including to:</p>
      <ul><li>authenticate players and protect rooms;</li><li>sync player states, cards, and scores during a game;</li><li>provide support, troubleshoot errors, and improve reliability; and</li><li>detect misuse, protect the service, and comply with applicable requirements.</li></ul>
    </LegalSection>
    <LegalSection id="sharing" title="When information is shared">
      <p>We do not sell your personal information. Information may be processed by service providers that help operate authentication, databases, hosting, security, and diagnostics. These providers may process information only to provide services to Flip7 Companion and under their own privacy terms.</p>
      <p>Information may also be disclosed when required by law, to protect the service and its users, or as part of a business transfer.</p>
    </LegalSection>
    <LegalSection id="retention" title="Storage and retention">
      <p>Room and game records may remain available while they are needed to operate a room, show results, resolve support issues, or meet legal obligations. Retention can vary by the type of information and how the service is configured.</p>
      <p>We use reasonable safeguards for the information we handle, but no internet service can guarantee absolute security.</p>
    </LegalSection>
    <LegalSection id="choices" title="Your choices">
      <p>You can choose what player name and game information to enter. You may stop using the service at any time. If you need an account or data request handled, use the support channel provided by the project owner and include enough context to identify the relevant account or room.</p>
    </LegalSection>
    <LegalSection id="children" title="Children's privacy">
      <p>Flip7 Companion is intended for general audiences and is not directed to children under the age where parental consent is required by local law. If you believe a child provided personal information, please contact the project owner so it can be reviewed.</p>
    </LegalSection>
    <LegalSection id="changes" title="Changes to this policy">
      <p>We may update this policy as the app changes. The revised version will be posted on this page with an updated date. Your continued use of the service after an update means the revised policy applies to future use.</p>
    </LegalSection>
  </>
}

function TermsConditions() {
  return <>
    <LegalSection id="acceptance" title="Acceptance of these terms">
      <p>These Terms &amp; Conditions govern your use of Flip7 Companion. By opening the app, joining a room, or using its features, you agree to follow these terms and the game Rules.</p>
      <p>If you do not agree, do not use the service.</p>
    </LegalSection>
    <LegalSection id="service" title="The companion service">
      <p>Flip7 Companion is a digital companion for the physical Flip 7 card game. It provides rooms, player presence, card recording, round states, and score tracking. It does not replace the physical deck or decide how players physically draw cards.</p>
      <p>Game hosts are responsible for creating a room, approving players, and moving the table between rounds when the round conditions are met.</p>
    </LegalSection>
    <LegalSection id="independent" title="Independent companion notice">
      <p>Flip7 Companion is an independent, unofficial companion app created for people who want to play the physical card game with friends. It is not affiliated with, endorsed by, sponsored by, or associated with the creator, publisher, or other rights holders of Flip 7.</p>
      <p>Flip 7 and related game materials belong to their respective owners. This app records the cards that players physically reveal; it does not provide or replace the physical game.</p>
    </LegalSection>
    <LegalSection id="accounts" title="Accounts and room access">
      <p>You are responsible for the sign-in details and display name you use, and for activity performed through your account. Keep access details private and tell the project owner if you believe an account or room has been used without permission.</p>
      <p>Room codes are intended for the invited group. Do not share a room code more widely than necessary or attempt to access a room you were not invited to join.</p>
    </LegalSection>
    <LegalSection id="fair-play" title="Fair play and acceptable use">
      <p>Use the app to support a friendly, honest game. You must not:</p>
      <ul><li>interfere with another player's account, room, or game data;</li><li>attempt to bypass access controls, abuse realtime connections, or probe the service for vulnerabilities;</li><li>submit unlawful, harmful, abusive, or deceptive content; or</li><li>use automation or other methods to disrupt the service or manipulate results.</li></ul>
    </LegalSection>
    <LegalSection id="content" title="Your game data">
      <p>You keep responsibility for the player names and game information you enter. You give Flip7 Companion permission to store and display that information as needed to provide the room and game features to your group.</p>
      <p>Do not enter information you do not have the right to share. We may remove content or restrict access when it is necessary to protect users, the service, or the integrity of a room.</p>
    </LegalSection>
    <LegalSection id="availability" title="Availability and changes">
      <p>The app may be updated, paused, or unavailable from time to time for maintenance, improvements, or circumstances outside our control. Features and integrations may change as the service develops.</p>
      <p>We may suspend or end access when these terms are violated, when a room is abused, or when continued access could harm the service or another user.</p>
    </LegalSection>
    <LegalSection id="responsibility" title="Your responsibility for gameplay">
      <p>The app records what players and hosts submit. The group is responsible for resolving physical card disputes, checking recorded cards, and agreeing on the final result. Use the Rules page as the reference for how Flip 7 is played and scored.</p>
    </LegalSection>
    <LegalSection id="updates" title="Updates to these terms">
      <p>We may revise these terms when the app, rules presentation, or legal requirements change. The current version will be posted on this page with an updated date. Continuing to use the service after an update means you accept the revised terms.</p>
    </LegalSection>
  </>
}

export function LegalScreen({ kind }: { kind: LegalKind }) {
  const [navScrolled, setNavScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isPrivacy = kind === 'privacy'
  const title = isPrivacy ? 'Data Privacy Policy' : 'Terms & Conditions'
  const eyebrow = isPrivacy ? 'FLIP7 COMPANION · YOUR DATA' : 'FLIP7 COMPANION · PLAY FAIR'
  const intro = isPrivacy ? 'A clear look at the information the companion uses to keep your table connected.' : 'The simple ground rules for using Flip7 Companion and keeping every table moving.'
  const heroCards = isPrivacy ? ['0', 'SECOND CHANCE', '+2'] : ['12', 'FREEZE', '+6']

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return <div className="landing-page legal-page">
    <header className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}>
      <div className="landing-nav-inner">
        <a href="/" className="legal-brand"><img className="landing-logo" src="/assets/flip7-title-logo.png" alt="Flip7 Companion" /></a>
        <nav className="landing-top-links" aria-label="Primary navigation"><a href="/">Home</a><a href="/#landing-how">How it Works</a><a href="/rules">Rules</a><a href="/faq">FAQ</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a></nav>
        <a href="/lobby" className="landing-signin">PLAY!</a>
        <button className="landing-mobile-toggle" type="button" aria-expanded={mobileMenuOpen} aria-controls="legal-mobile-menu" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
      {mobileMenuOpen && <><button className="landing-mobile-backdrop" type="button" aria-label="Close navigation menu" onClick={closeMobileMenu} /><div id="legal-mobile-menu" className="landing-mobile-menu"><nav aria-label="Mobile navigation"><a href="/" onClick={closeMobileMenu}>Home</a><a href="/#landing-how" onClick={closeMobileMenu}>How it Works</a><a href="/rules" onClick={closeMobileMenu}>Game Rules</a><a href="/faq" onClick={closeMobileMenu}>Frequently Asked Questions</a><a href="/privacy" onClick={closeMobileMenu}>Data Privacy Policy</a><a href="/terms" onClick={closeMobileMenu}>Terms &amp; Conditions</a><a href="/contact" onClick={closeMobileMenu}>Contact Us</a></nav><a href="/lobby" className="landing-mobile-signin" onClick={closeMobileMenu}>PLAY!</a></div></>}
    </header>

    <main className="legal-main">
      <section className="legal-hero"><div className="legal-hero-inner"><span className="eyebrow">{eyebrow}</span><h1>{isPrivacy ? <>Your data,<br /><em>kept clear.</em></> : <>Play fair.<br /><em>Keep it moving.</em></>}</h1><p>{intro}</p><div className="legal-meta"><span>Updated September 2026</span><span>{isPrivacy ? 'Privacy' : 'Terms'}</span></div></div><div className="legal-hero-cards" aria-hidden="true">{heroCards.map((card) => <img key={card} src={`/cards/${card}.png`} alt="" />)}</div></section>
      <div className="legal-content">
        <aside className="legal-index" aria-label={`${title} sections`}><span className="eyebrow">ON THIS PAGE</span><strong>{title}</strong><nav>{isPrivacy ? <><a href="#overview">Overview</a><a href="#information">Information we collect</a><a href="#use">How we use information</a><a href="#sharing">When information is shared</a><a href="#retention">Storage and retention</a><a href="#choices">Your choices</a><a href="#children">Children's privacy</a><a href="#changes">Changes</a></> : <><a href="#acceptance">Acceptance</a><a href="#service">The companion service</a><a href="#independent">Independent companion</a><a href="#accounts">Accounts and rooms</a><a href="#fair-play">Fair play</a><a href="#content">Your game data</a><a href="#availability">Availability</a><a href="#responsibility">Gameplay responsibility</a><a href="#updates">Updates</a></>}</nav></aside>
        <article className="legal-document">{isPrivacy ? <PrivacyPolicy /> : <TermsConditions />}<div className="legal-back-links"><a href="/faq">Have a question? Visit the FAQs</a><a href="/rules">Read the game rules</a></div></article>
      </div>
    </main>
    <LandingFooter isRulesPage />
  </div>
}
