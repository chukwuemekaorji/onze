import { EXAMPLE_PATH, HOME_ROUTE } from '../../router.js';
import { Button } from '../ui/Button.js';
import { HeroPitch } from './HeroPitch.js';

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        <p className="eyebrow">An FPL coach in your browser</p>
        <h1 id="hero-title" className="hero__title">
          Stop guessing. Start coaching.
        </h1>
        <p className="hero__lede">
          Enter your FPL ID. Sensei reads your squad, fixtures, form and free transfers,
          works out the moves in plain code, then explains them like a coach.
        </p>
        <div className="hero__actions">
          <Button href={HOME_ROUTE.path}>Get started</Button>
          <Button href={EXAMPLE_PATH} variant="outline">
            See an example
          </Button>
        </div>
        <p className="hero__note">no sign-up. just your team ID.</p>
      </div>
      <HeroPitch />
    </section>
  );
}
