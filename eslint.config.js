const browserGlobals = {
  alert: 'readonly',
  Blob: 'readonly',
  caches: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  cancelAnimationFrame: 'readonly',
  confirm: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  CustomEvent: 'readonly',
  DAUB: 'readonly',
  customElements: 'readonly',
  document: 'readonly',
  DOMParser: 'readonly',
  Event: 'readonly',
  EventTarget: 'readonly',
  fetch: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  history: 'readonly',
  HTMLElement: 'readonly',
  indexedDB: 'readonly',
  IDBKeyRange: 'readonly',
  localStorage: 'readonly',
  location: 'readonly',
  MessageChannel: 'readonly',
  MutationObserver: 'readonly',
  navigator: 'readonly',
  Node: 'readonly',
  performance: 'readonly',
  queueMicrotask: 'readonly',
  requestAnimationFrame: 'readonly',
  ResizeObserver: 'readonly',
  sessionStorage: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  structuredClone: 'readonly',
  store: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  window: 'readonly',
  Worker: 'readonly'
};

const nodeGlobals = {
  Buffer: 'readonly',
  process: 'readonly'
};

const sharedRules = {
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  'no-redeclare': 'error',
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }]
};

export default [
  {
    ignores: [
      '.generated-public/**',
      'dist/**',
      'node_modules/**',
      'swiper-master/**',
      'js/jszip.min.js',
      'js/pdf-library.js',
      'js/vendor/**'
    ]
  },
  {
    files: [
      'playwright.config.js',
      'vite.config.js',
      'vitest.config.js',
      'eslint.config.js',
      'js/app-bootstrap.js',
      'js/webapp-bootstrap.js',
      'js/perf.js',
      'js/persistence.js',
      'js/motion/**/*.js',
      'js/shell/**/*.js',
      'js/views/**/*.js',
      'js/workers/**/*.js',
      'scripts/**/*.mjs',
      'tests/**/*.js'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
        globalThis: 'readonly'
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'warn'
    },
    rules: sharedRules
  }
];
