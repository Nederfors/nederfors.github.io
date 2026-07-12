# App Source

Phase 2 keeps root `css/`, `js/`, `data/`, `icons/`, `pdf/`, `manifest.json`, and `sw.js` as the authored source of truth.

Builds regenerate `.generated-public/` from those root assets before Vite copies them into `dist/`.
