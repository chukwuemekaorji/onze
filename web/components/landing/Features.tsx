import type { ReactNode } from 'react';
import { Reveal } from './Reveal.js';

interface Feature {
  title: string;
  body: string;
  icon: ReactNode;
}

// small line icons, drawn on a 24 unit grid
const FEATURES: Feature[] = [
  {
    title: 'Transfers',
    body: 'Free transfers first. One -4 hit at most, and only when it clearly pays.',
    icon: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  },
  {
    title: 'Captaincy',
    body: 'Your top five armband options, ranked by fixture, form and expected points.',
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M14.5 9.2a3.6 3.6 0 1 0 0 5.6" />
      </>
    ),
  },
  {
    title: 'Best XI',
    body: 'Every legal formation tried, so your strongest eleven starts.',
    icon: (
      <>
        <circle cx="12" cy="19" r="1.4" />
        <circle cx="6" cy="14" r="1.4" />
        <circle cx="12" cy="14" r="1.4" />
        <circle cx="18" cy="14" r="1.4" />
        <circle cx="8" cy="9" r="1.4" />
        <circle cx="16" cy="9" r="1.4" />
        <circle cx="12" cy="4.5" r="1.4" />
      </>
    ),
  },
  {
    title: 'Chip timing',
    body: 'Doubles and blanks mapped five weeks ahead, so chips land when they count.',
    icon: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M9 3v4M15 3v4" />
      </>
    ),
  },
  {
    title: 'Price alerts',
    body: 'Likely rises and falls in your squad, flagged before they cost you.',
    icon: <path d="M4 17l5-5 4 3 7-8M15 7h5v5" />,
  },
];

export function Features() {
  return (
    <Reveal className="landing-section features" labelledBy="features-title">
      <div className="landing-section__intro">
        <p className="eyebrow">What it covers</p>
        <h2 id="features-title" className="landing-section__title">
          The decisions that move your rank.
        </h2>
      </div>
      <ul className="feature-grid">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="feature">
            <svg
              className="feature__icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              {feature.icon}
            </svg>
            <h3 className="feature__title">{feature.title}</h3>
            <p className="feature__body">{feature.body}</p>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}
