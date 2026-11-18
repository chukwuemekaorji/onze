import { AUTHOR_NAME, AUTHOR_URL, LICENSE_URL } from '../../site-links.js';

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <p>
        <a href={LICENSE_URL} className="inline-link" rel="noreferrer">
          MIT licensed
        </a>
      </p>
      <p>Not affiliated with the Premier League or FPL.</p>
      <p>
        Built by{' '}
        <a href={AUTHOR_URL} className="inline-link" rel="noreferrer">
          {AUTHOR_NAME}
        </a>
      </p>
    </footer>
  );
}
