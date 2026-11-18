import { EXAMPLE_PATH, HOME_ROUTE } from '../../router.js';
import { Button } from '../ui/Button.js';
import { Highlight } from '../ui/Highlight.js';
import { MarkerUnderline } from '../ui/MarkerUnderline.js';
import { HandArrow } from './HandArrow.js';
import { HeroPitch } from './HeroPitch.js';

// the marks land just after the page settles, scribble first
const UNDERLINE_DELAY_S = 0.4;
const HIGHLIGHT_DELAY_S = 0.8;
const ARROW_DELAY_S = 1.1;

export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        <p className="eyebrow">An FPL coach in your browser</p>
        <h1 id="hero-title" className="hero__title">
          Stop <MarkerUnderline delayS={UNDERLINE_DELAY_S}>guessing</MarkerUnderline>.{' '}
          Start <Highlight delayS={HIGHLIGHT_DELAY_S}>coaching</Highlight>.
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
        <p className="hero__note">
          <HandArrow className="hero__arrow" delayS={ARROW_DELAY_S} />
          no sign-up. just your team ID.
        </p>
      </div>
      <HeroPitch />
    </section>
  );
}
