export function LandingFooter({ isRulesPage = false }: { isRulesPage?: boolean }) {
  const homeHref = isRulesPage ? '/' : '#landing-page'
  const howHref = isRulesPage ? '/#landing-how' : '#landing-how'

  return <footer className="landing-footer"><div className="landing-footer-inner"><div className="landing-footer-top"><div className="landing-footer-brand"><img src="/assets/flip7-title-logo.png" alt="Flip7 Companion" /><p>Flip7 Companion is a physical card companion for groups who want to press their luck, track every flip, and keep the table moving.</p></div><div className="landing-footer-links"><div><h3>EXPLORE</h3><a href={homeHref}>Home</a><a href={howHref}>How it Works</a><a href="/rules">Rules</a></div><div><h3>SUPPORT</h3><a href="/contact">Contact us</a><a href="/faq">FAQ</a></div><div><h3>LEGAL</h3><a href="/privacy">Data Privacy Policy</a><a href="/terms">Terms &amp; Conditions</a></div></div></div><div className="landing-footer-bottom"><span>© 2026 Flip7 Companion. All rights reserved.</span></div></div></footer>
}
