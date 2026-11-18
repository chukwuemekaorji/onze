import { HOME_ROUTE } from '../../router.js';
import { Button } from '../ui/Button.js';
import { Reveal } from './Reveal.js';

export function FinalCta() {
  return (
    <Reveal className="landing-section final-cta" labelledBy="cta-title">
      <h2 id="cta-title" className="final-cta__title">
        Deadline's coming.
      </h2>
      <p className="final-cta__lede">Your report takes about a minute.</p>
      <Button href={HOME_ROUTE.path}>Get started</Button>
    </Reveal>
  );
}
