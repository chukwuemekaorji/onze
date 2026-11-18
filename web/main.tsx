import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './components/App.js';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('index.html is missing the #root element');

createRoot(rootEl).render(
  <StrictMode>
    {/* backstop for reduced motion; web/motion.ts handles what this misses */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
