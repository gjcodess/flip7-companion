import { Fragment, useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { LandingFooter } from '../landing/LandingFooter'

function RulesCardStrip({ cards, className = '' }: { cards: string[]; className?: string }) {
  return <div className={`rules-card-strip ${className}`}>{cards.map((card) => <img key={card} src={`/cards/${card}.png`} alt={`${card} card`} />)}</div>
}

function RulesScoreExample({ label, cards, modifier, result, bonus }: { label: string; cards: string[]; modifier?: string; result: string; bonus?: boolean }) {
  return <div className="rules-score-example">
    <span className="rules-score-example-label">{label}</span>
    <div className="rules-score-card-row">
      {cards.map((card, index) => <Fragment key={card}>{index > 0 && <b className="rules-score-plus">+</b>}<img src={`/cards/${card}.png`} alt={`${card} card`} /></Fragment>)}
      {modifier && <><b className="rules-score-plus">+</b><img className="rules-score-modifier" src={`/cards/${modifier}.png`} alt={`${modifier} card`} /></>}
      {bonus && <><b className="rules-score-plus">+</b><span className="rules-score-inline-bonus"><strong>15</strong><small>POINT<br />BONUS!</small></span></>}
      <span className="rules-score-equals">=</span><b className="rules-score-value">{result}</b>
    </div>
  </div>
}

export function RulesScreen() {
  const [navScrolled, setNavScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return <div className="landing-page rules-page">
    <header className={`landing-nav ${navScrolled ? 'scrolled' : ''}`}>
      <div className="landing-nav-inner">
        <a href="/" className="rules-brand"><img className="landing-logo" src="/assets/flip7-title-logo.png" alt="Flip7 Companion" /></a>
        <nav className="landing-top-links" aria-label="Primary navigation">
          <a href="/">Home</a><a href="/#landing-how">How it Works</a><a href="/rules">Rules</a><a href="/#landing-how">FAQ</a>
        </nav>
        <a href="/lobby" className="landing-signin">Sign in</a>
        <button className="landing-mobile-toggle" type="button" aria-expanded={mobileMenuOpen} aria-controls="rules-mobile-menu" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}</button>
      </div>
      {mobileMenuOpen && <><button className="landing-mobile-backdrop" type="button" aria-label="Close navigation menu" onClick={closeMobileMenu} /><div id="rules-mobile-menu" className="landing-mobile-menu"><nav aria-label="Mobile navigation"><a href="/" onClick={closeMobileMenu}>Home</a><a href="/#landing-how" onClick={closeMobileMenu}>How it Works</a><a href="/rules" onClick={closeMobileMenu}>Rules</a><a href="/#landing-how" onClick={closeMobileMenu}>FAQ</a></nav><a href="/lobby" className="landing-mobile-signin" onClick={closeMobileMenu}>Sign in</a></div></>}
    </header>

    <main className="rules-main">
      <section className="rules-hero">
        <div className="rules-hero-inner">
          <span className="eyebrow">FLIP7 COMPANION · OFFICIAL RULES</span>
          <h1>Press your luck.<br /><em>Know the play.</em></h1>
          <p>Track the cards in front of you, score every round, and be the first player to reach the target.</p>
          <div className="rules-hero-badges"><span>200 point target</span><span>7-card bonus</span><span>Duplicate = bust</span></div>
        </div>
      </section>

      <div className="rules-content">
        <section className="rules-card rules-card-wide rules-card-objective">
          <div className="rules-card-heading"><span className="eyebrow">THE OBJECTIVE</span><b className="rules-number">01</b></div>
          <h2>Race to 200 points.</h2>
          <p>Be the first player to score 200 points. Your round score is based on the total value of the number cards in front of you. Keep collecting unique numbers, but if you reveal a duplicate, you bust and score nothing for the round. If you reveal seven unique Number cards, the round ends immediately and you earn an additional 15 points.</p>
          <RulesCardStrip cards={['12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0']} className="rules-number-strip" />
        </section>

        <section className="rules-card rules-card-how">
          <div className="rules-card-heading"><span className="eyebrow">HOW TO PLAY</span><b className="rules-number">02</b></div>
          <h2>Flip, choose, repeat.</h2>
          <ol className="rules-step-list">
            <li><div className="rules-step-copy"><b>Join the table.</b><span>Create a room or enter a room code. The host approves players before the match begins.</span></div></li>
            <li><div className="rules-step-copy"><b>Deal the round.</b><span>The dealer deals cards one at a time, moving around the table so every player gets a turn.</span></div></li>
            <li><div className="rules-step-copy"><b>Flip and record.</b><span>On your turn, record the physical card you reveal in your table.</span></div></li>
            <li><div className="rules-step-copy"><b>Choose your risk.</b><span>Hit to keep going, or choose <strong>STAY / BANK</strong> to lock in your score.</span></div></li>
            <li><div className="rules-step-copy"><b>Move together.</b><span>The round ends when everyone is banked, frozen, or busted.</span></div></li>
          </ol>
          <div className="rules-callout rules-callout-cyan"><b>Before the first deal</b><span>Have a pen and paper ready to track scores. Shuffle the deck thoroughly and choose a dealer for the round.</span></div>
        </section>

        <section className="rules-card rules-card-deck">
          <div className="rules-card-heading"><span className="eyebrow">THE DECK</span><b className="rules-number">03</b></div>
          <h2>Know what is in play.</h2>
          <p>The special deck has 94 cards: twelve 12s, eleven 11s, and so on down to one 1 and one 0. Action and modifier cards are mixed into the deck, so keep the card count in mind as you press your luck.</p>
          <div className="rules-deck-details"><div><b>Number cards</b><span>Numbers score their face value. The 0 card scores no points and still counts as a unique Number card.</span></div><div><b>Special cards</b><span>There are three each of Second Chance, Freeze, and Flip Three, plus Add and ×2 Modifier cards.</span></div></div>
          <div className="rules-callout"><b>Important</b><span>Number cards score. Action cards and modifiers change the round but do not count toward the seven-card bonus.</span></div>
        </section>

        <section className="rules-card rules-card-wide rules-card-modifiers">
          <div className="rules-card-heading"><span className="eyebrow">MODIFIER CARDS</span><b className="rules-number">04</b></div>
          <h2>Add more points.</h2>
          <p>Modifier cards are not Number cards and do not count toward Flip 7. You cannot bust on a Modifier card. Add cards score their printed value, while <strong>×2</strong> doubles your Number card total for the round.</p>
          <RulesCardStrip cards={['+2', '+4', '+6', '+8', '+10', 'x2']} className="rules-modifier-strip" />
          <div className="rules-callout"><b>Modifier order</b><span>First add your Number cards. If you have ×2, double that total. Then add any +2 through +10 bonus points. If you only have a Modifier card, you still score its points unless it is ×2.</span></div>
        </section>

        <section className="rules-card rules-card-actions">
          <div className="rules-card-heading"><span className="eyebrow">ACTION CARDS</span><b className="rules-number">05</b></div>
          <h2>Change the table.</h2>
          <div className="rules-action-list">
            <div><img src="/cards/SECOND CHANCE.png" alt="Second Chance card" /><p><b>Second Chance</b> cancels one duplicate. Discard it with the duplicate card and keep the rest of your round.</p></div>
            <div><img src="/cards/FREEZE.png" alt="Freeze card" /><p><b>Freeze</b> banks a player and locks in all points collected that round.</p></div>
            <div><img src="/cards/FLIP THREE.png" alt="Flip Three card" /><p><b>Flip Three</b> makes the chosen active player accept three cards one at a time.</p></div>
          </div>
          <div className="rules-callout rules-callout-pale"><b>Active player rule</b><span>Action cards can target any active player, including the person who played the card. If only one player is active, that player must be chosen.</span></div>
        </section>

        <section className="rules-card rules-card-active">
          <div className="rules-card-heading"><span className="eyebrow">ACTIVE PLAYERS</span><b className="rules-number">06</b></div>
          <h2>Who can receive an action?</h2>
          <p>An active player has not busted and has not chosen to stay. Action cards can be played on any active player, including yourself. If you are the only active player, you must play the action on yourself.</p>
          <div className="rules-callout rules-callout-pink"><b>Remember</b><span>After a player busts or stays, they are no longer active for the round.</span></div>
        </section>

        <section className="rules-card rules-card-wide rules-card-scoring">
          <div className="rules-card-heading"><span className="eyebrow">CALCULATE SCORES</span><b className="rules-number">07</b></div>
          <h2>Build your round score in order.</h2>
          <p className="rules-score-intro">Use the number cards in front of you, then apply modifiers and the Flip 7 bonus in this order.</p>
          <div className="rules-score-steps">
            <div><b>1</b><span>Add the value of your number cards.</span><strong>3 + 11 + 5 + 7 + 10 = 36</strong></div>
            <div><b>2</b><span>If you have ×2, double your Number card total.</span><strong>36 × 2 = 72</strong></div>
            <div><b>3</b><span>Add any additional bonus points.</span><strong>36 + 10 = 46</strong></div>
            <div><b>4</b><span>Seven unique Number cards earn the Flip 7 bonus.</span><strong>+15 bonus</strong></div>
          </div>
          <div className="rules-score-examples">
            <RulesScoreExample label="Number cards" cards={['3', '11', '5', '7', '10']} result="36" />
            <RulesScoreExample label="With ×2" cards={['3', '11', '5', '7', '10']} modifier="x2" result="72" />
            <RulesScoreExample label="With +10" cards={['3', '11', '5', '7', '10']} modifier="+10" result="46" />
            <RulesScoreExample label="Flip 7" cards={['3', '11', '5', '7', '10', '9', '4']} result="64" bonus />
          </div>
        </section>

        <section className="rules-card rules-card-wide rules-card-end">
          <div className="rules-card-heading"><span className="eyebrow">END OF A ROUND</span><b className="rules-number">08</b></div>
          <h2>Settle the table, then deal again.</h2>
          <div className="rules-end-grid"><div><b>End the round</b><p>The round ends when there are no active players because everyone has banked, frozen, or busted, or when a player flips seven unique number cards and earns the bonus.</p></div><div><b>Start the next round</b><p>Set every card from the round aside; do not shuffle those cards back in. Pass the remaining deck to the left so the next player becomes the dealer. If the deck runs out, shuffle the discarded cards to form a new deck.</p></div><div><b>End the game</b><p>When a round ends with at least one player at 200 points or more, the player with the most points wins.</p></div></div>
        </section>
      </div>
    </main>
    <LandingFooter isRulesPage />
  </div>
}
