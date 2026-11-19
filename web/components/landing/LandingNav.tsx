import { HOME_ROUTE, LANDING_PATH } from '../../router.js';
import { GITHUB_URL } from '../../site-links.js';
import { BrandMark } from '../BrandMark.js';
import { Button } from '../ui/Button.js';

export function LandingNav() {
  return (
    <header className="landing-nav">
      <a href={LANDING_PATH} className="landing-nav__brand">
        <BrandMark className="landing-nav__mark" />
        <span className="landing-nav__wordmark">Onze</span>
      </a>
      <nav aria-label="Main">
        <ul className="landing-nav__links">
          <li>
            <a href="#how-it-works" className="landing-nav__link">
              How it works
            </a>
          </li>
          <li>
            <a href={GITHUB_URL} className="landing-nav__link" rel="noreferrer">
              GitHub
            </a>
          </li>
          <li>
            <Button href={HOME_ROUTE.path}>Get started</Button>
          </li>
        </ul>
      </nav>
    </header>
  );
}
