import { GITHUB_URL } from '../../site-links.js';
import { ImageSlot } from '../ui/ImageSlot.js';
import { Reveal } from './Reveal.js';

const PROMISES = [
  'Stored in your browser only, for the session or on this device if you choose.',
  'Sent straight from your browser to Anthropic. Our server never sees it.',
  'No accounts and no database. There is nothing to sign up for.',
  'No key? You still get the full analysis as a basic report.',
] as const;

export function KeySection() {
  return (
    <Reveal className="landing-section key-section" labelledBy="key-title">
      <ImageSlot
        className="key-section__image"
        src="landing-key.jpg"
        alt="A matchday programme and a pen on a wooden bench"
        aspect="landscape"
      />
      <div className="key-section__copy">
        <p className="eyebrow">Privacy</p>
        <h2 id="key-title" className="landing-section__title">
          Your key stays yours.
        </h2>
        <ul className="promises">
          {PROMISES.map((promise) => (
            <li key={promise} className="promise">
              {promise}
            </li>
          ))}
        </ul>
        <p className="key-section__source">
          Every line of it is open source.{' '}
          <a href={GITHUB_URL} className="inline-link" rel="noreferrer">
            Read the code on GitHub
          </a>
        </p>
      </div>
    </Reveal>
  );
}
