import { InkFilters } from '../ui/InkFilters.js';
import { Features } from './Features.js';
import { FinalCta } from './FinalCta.js';
import { Hero } from './Hero.js';
import { HowItWorks } from './HowItWorks.js';
import { KeySection } from './KeySection.js';
import { LandingFooter } from './LandingFooter.js';
import { LandingNav } from './LandingNav.js';

/** the page at "/": what sensei is, and the way into /app */
export function Landing() {
  return (
    <div className="landing">
      <InkFilters />
      <LandingNav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <KeySection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
