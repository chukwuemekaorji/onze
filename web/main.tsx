import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App.js';
import { Landing } from './components/landing/Landing.js';
import { canonicalisePath, isLandingPath } from './router.js';

// before the first render, so the app never sees a path it doesn't route
canonicalisePath();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('index.html is missing the #root element');

createRoot(rootEl).render(
  <StrictMode>
    {/* backstop for reduced motion; web/motion.ts handles what this misses */}
    <MotionConfig reducedMotion="user">
      {/* "/" is the landing page; every /app path is the coaching app */}
      {isLandingPath(window.location.pathname) ? <Landing /> : <App />}
    </MotionConfig>
  </StrictMode>,
);
