import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { LandingFooter } from '../landing/LandingFooter'
import './FAQScreen.css'

function FAQItem({ question, children, open = false }: { question: string; children: string; open?: boolean }) {
  return <details className="faq-item" open={open}>
    <summary><span>{question}</span><b aria-hidden="true">+</b></summary>
    <p>{children}</p>
  </details>
}

export function FAQScreen() {
  const [navScrolled, setNavScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return <div className="landing-page faq-page">
    <header className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}>
      <div className="landing-nav-inner">
        <a href="/" className="faq-brand"><img className="landing-logo" src="/assets/flip7-title-logo.png" alt="Flip7 Companion" /></a>
        <nav className="landing-top-links" aria-label="Primary navigation">
          <a href="/">Home</a><a href="/#landing-how">How it Works</a><a href="/rules">Rules</a><a href="/faq">FAQ</a>
        </nav>
        <a href="/lobby" className="landing-signin">PLAY!</a>
        <button className="landing-mobile-toggle" type="button" aria-expanded={mobileMenuOpen} aria-controls="faq-mobile-menu" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
      {mobileMenuOpen && <><button className="landing-mobile-backdrop" type="button" aria-label="Close navigation menu" onClick={closeMobileMenu} /><div id="faq-mobile-menu" className="landing-mobile-menu"><nav aria-label="Mobile navigation"><a href="/" onClick={closeMobileMenu}>Home</a><a href="/#landing-how" onClick={closeMobileMenu}>How it Works</a><a href="/rules" onClick={closeMobileMenu}>Rules</a><a href="/faq" onClick={closeMobileMenu}>FAQ</a></nav><a href="/lobby" className="landing-mobile-signin" onClick={closeMobileMenu}>PLAY!</a></div></>}
    </header>

    <main className="faq-main">
      <section className="faq-hero">
        <div className="faq-hero-inner">
          <span className="eyebrow">FLIP7 COMPANION · QUICK ANSWERS</span>
          <h1>Questions?<br /><em>Keep playing.</em></h1>
          <p>Find the quick answer, then get back to the table. These answers cover rooms, rounds, cards, scoring, and the companion app.</p>
          <div className="faq-hero-badges"><span>Rooms</span><span>Cards</span><span>Scoring</span><span>Players</span></div>
        </div>
      </section>

      <div className="faq-content">
        <section className="faq-intro faq-panel faq-panel-cyan">
          <div><span className="eyebrow">NEED THE SHORT VERSION?</span><h2>Set up the table, then press your luck.</h2><p>The host creates a room and approves players. Everyone records the physical cards they flip, chooses when to bank, and works toward 200 points.</p></div>
          <div className="faq-quick-actions"><a href="/lobby" className="faq-primary">Start a table</a><a href="/rules" className="faq-secondary">Read the rules</a></div>
        </section>

        <div className="faq-grid">
          <section className="faq-panel faq-group faq-group-yellow">
            <div className="faq-panel-heading"><span className="eyebrow">GETTING STARTED</span><b className="faq-number">01</b></div>
            <h2>Before the first flip.</h2>
            <FAQItem question="What is Flip7 Companion?" open>It is a companion for the physical Flip 7 card game. You use the real deck, while the app keeps the shared room, player states, cards, and scores together.</FAQItem>
            <FAQItem question="Do I need the physical Flip 7 deck?">Yes. The app does not draw cards for you. Players flip from the physical deck and record each card in front of them.</FAQItem>
            <FAQItem question="How do I start a game?">Choose Start a table, enter your display name and target score, then share the room code with the other players.</FAQItem>
            <FAQItem question="How do players join?">A player enters the room code, chooses a display name, and waits for the host to approve them before the match begins.</FAQItem>
          </section>

          <section className="faq-panel faq-group faq-group-cream">
            <div className="faq-panel-heading"><span className="eyebrow">PLAYING A ROUND</span><b className="faq-number">02</b></div>
            <h2>Make the call.</h2>
            <FAQItem question="What does Hit do?" open>Hit records another card in front of you so you can keep building your round score. A duplicate Number card makes you bust unless a Second Chance card cancels it.</FAQItem>
            <FAQItem question="What does Stay / Bank do?">Stay ends your turn for the round and banks the points you have collected. You cannot receive more cards after banking.</FAQItem>
            <FAQItem question="What happens when I bust?">Your round score becomes zero and your turn ends automatically. The cards stay visible so the table can see what happened, and the round continues for the other active players.</FAQItem>
            <FAQItem question="When does the round end?">The round ends when everyone is banked, frozen, or busted, or when a player reveals seven unique Number cards and earns the Flip 7 bonus.</FAQItem>
          </section>

          <section className="faq-panel faq-group faq-group-pink">
            <div className="faq-panel-heading"><span className="eyebrow">CARDS &amp; SCORING</span><b className="faq-number">03</b></div>
            <h2>Know what counts.</h2>
            <FAQItem question="How is a round scored?" open>Add the Number cards, apply ×2 if you have it, add any +2 through +10 Modifier points, then add the +15 Flip 7 bonus if you revealed seven unique Number cards.</FAQItem>
            <FAQItem question="Do Modifier cards count toward Flip 7?">No. Modifier cards change the score but do not count as unique Number cards. You cannot bust on a Modifier card.</FAQItem>
            <FAQItem question="What does Second Chance do?">It cancels one duplicate Number card. Discard the Second Chance card with the duplicate and keep the rest of your round.</FAQItem>
            <FAQItem question="What do Freeze and Flip Three do?">Freeze banks an active player. Flip Three makes an active player accept three cards one at a time.</FAQItem>
          </section>

          <section className="faq-panel faq-group faq-group-cyan">
            <div className="faq-panel-heading"><span className="eyebrow">ROOMS &amp; APP</span><b className="faq-number">04</b></div>
            <h2>Keep the table moving.</h2>
            <FAQItem question="Who can start the next round?" open>The host can proceed once every player is banked, frozen, or busted. The next round starts after the current scores are settled.</FAQItem>
            <FAQItem question="Can I fix a recording mistake?">Yes. Use the card controls, edit or remove the incorrect card, or use Undo while the round is still being recorded.</FAQItem>
            <FAQItem question="Can I use the app on my phone?">Yes. Open the shared local or deployed address on your phone while connected to the same network or service as the host.</FAQItem>
            <FAQItem question="What happens when someone reaches 200 points?">The game ends after the round is settled. The player with the most total points wins.</FAQItem>
          </section>
        </div>

        <section className="faq-help faq-panel faq-panel-navy"><span className="eyebrow">STILL STUCK?</span><h2>Open the full rules and keep the game moving.</h2><p>The Rules page has the complete deck, action card, round, and scoring reference.</p><a href="/rules" className="faq-secondary">Open the rules</a></section>
      </div>
    </main>

    <LandingFooter isRulesPage />
  </div>
}
