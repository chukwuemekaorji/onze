import { defineConfig } from 'vite';

// no @vitejs/plugin-react: its fast refresh preamble is an inline script, which the
// csp blocks (vercel dev applies it too). without it, edits do a full page reload
export default defineConfig({
  root: 'web',
  // vite treats a public dir as raw static files; the app has none
  publicDir: false,
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // data: urls would fail the csp's img-src and font-src 'self'
    assetsInlineLimit: 0,
    rollupOptions: {
      onwarn(warning, warn) {
        // motion ships "use client" for server components, which a client-only app can ignore
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
});
