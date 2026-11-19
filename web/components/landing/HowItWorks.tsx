import { ImageSlot } from '../ui/ImageSlot.js';
import { MarkerUnderline } from '../ui/MarkerUnderline.js';
import { Reveal } from './Reveal.js';

const STEPS = [
  {
    title: 'Drop in your FPL ID',
    body: 'The number in your FPL points page address. No password, no account.',
  },
  {
    title: 'Sensei does the maths',
    body: "Transfers, captaincy, your best eleven and chip timing, worked out in plain code from FPL's own data.",
  },
  {
    title: 'Ask the coach',
    body: 'Add your own Anthropic key for a written report and chat. It goes from your browser to Anthropic, never to our server.',
  },
] as const;

export function HowItWorks() {
  return (
    <Reveal
      id="how-it-works"
      className="landing-section how-it-works"
      labelledBy="how-title"
    >
      <div className="landing-section__intro">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title" className="landing-section__title">
          Three steps, <MarkerUnderline>no account</MarkerUnderline>.
        </h2>
      </div>
      <div className="how-it-works__body">
        <ol className="steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="step">
              {/* chalked up like a coach numbering the drill */}
              <span className="step__number" aria-hidden="true">
                {index + 1}
              </span>
              <h3 className="step__title">{step.title}</h3>
              <p className="step__body">{step.body}</p>
            </li>
          ))}
        </ol>
        <ImageSlot
          className="how-it-works__image"
          src="landing-touchline.jpg"
          alt="A tactics whiteboard with two formations drawn in marker, magnets for players and arrows for their runs"
          aspect="portrait"
        />
      </div>
    </Reveal>
  );
}
