import { defineConfig } from 'vite';

// no @vitejs/plugin-react: its fast refresh preamble is an inline script, which the
// csp blocks (vercel dev applies it too). without it, edits do a full page reload
export default defineConfig({
  root: 'web',
  // raw static files served at the site root; only the link preview image, which
  // linkedin and others fetch by absolute url, so it can't be a hashed asset
  publicDir: 'public',
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
