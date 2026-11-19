import { useEffect, useState } from 'react';
import type { AnalysisSummary } from '../../../lib/analysis-summary.js';
import { loadSampleSummary } from '../../sample-summary.js';
import { Pitch } from '../Pitch.js';

/** the real pitch, drawn from the bundled example team */
export function HeroPitch() {
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSampleSummary().then((loaded) => {
      if (!cancelled) setSummary(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <figure className="hero-pitch">
      {summary ? (
        <Pitch summary={summary} entranceKey="landing-pitch" />
      ) : (
        // holds the pitch's shape while the example loads, so nothing jumps
        <div className="hero-pitch__placeholder" aria-hidden="true" />
      )}
      <figcaption className="hero-pitch__caption">
        An example lineup, worked out by Onze from real FPL data.
      </figcaption>
    </figure>
  );
}
