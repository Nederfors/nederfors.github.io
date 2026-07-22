# Current system architecture

## Overlay and view lifecycle

`js/popup-manager.js` is the single overlay lifecycle owner. All drawers,
dialogs, sheets, and legacy popups enter and leave through `popupManager`; it
coordinates the stack, delegates the DAUB component state change where DAUB
provides one, and owns the cross-component invariants: backdrop dismissal,
focus trapping and restoration, background/underlay inertness, Escape and Back
dismissal, touch dismissal, z-order, and document scroll locking.

`js/shell/view-runtime.js` owns route-transition timing. It calls
`popupManager.closeAll('route-change')` before either a full view swap or a
same-view tab transition, and again when the runtime is destroyed. That
teardown is synchronous: removed view markup cannot leave an opening, open, or
closing overlay registered in the stack, nor retain body scroll or inert state.

The independent lifecycle implementations formerly in `js/main.js`, the
shared toolbar, and the profession panel have been retired. Their retained
compatibility functions are thin calls into `popupManager`; they do not keep a
second stack or independently mutate focus, inertness, history, gestures, or
scroll state.

Two bounded fallbacks remain. Legacy overlay markup keeps the `.open` class and
ARIA synchronization required by its existing CSS, while DAUB modal/drawer
classes and APIs remain the component-state primitive. A document observer
adopts overlays opened directly by older DAUB/custom callers and normalizes
their eventual close; this is a migration bridge, not a separate lifecycle
owner. Programmatic and route closes neutralize the current overlay history
marker synchronously instead of calling `history.back()`, avoiding a second
asynchronous route/close race while preserving browser-Back dismissal for an
open overlay.

## Persistence and deployment baseline

`js/store.js` sends local mutations through the persistence API. In Dexie mode,
field-scoped changes retain this path:

```text
saveCharacterFields()
  -> queued writes
  -> flushPendingWrites()
  -> commitPendingWrites()
  -> one IndexedDB transaction
```

The queue coalesces character fields, resolves lazy field values at commit
time, and keeps the in-memory snapshot current while the IndexedDB write is
debounced. Explicit route, page, PWA-update, and test boundaries can await a
flush. Local-storage persistence is a compatibility fallback. These contracts,
and the mutation planning and exact-removal behavior above them, remain client
concerns.

The service worker owns the static application shell, versioned/offline rule
JSON, images, and opt-in PDF caching. It currently treats any same-scope GET
whose `Accept` header contains `application/json` as cacheable rule JSON. A
future API therefore requires an explicit `/api/` bypass before any JSON or
runtime-cache branch.

`.github/workflows/build.yaml` currently creates one static `dist/` artifact.
That same artifact is deployed to GitHub Pages and uploaded to STRATO webspace
over SFTP. The workflow contains no application-process deployment, process
supervision, reverse proxy, PostgreSQL migration, or health probe. Node 22 in
the build job is a CI runtime, not evidence of a production Node runtime.

The accepted online-first boundary and hosting gate are recorded in
[online-character-contract.md](./online-character-contract.md). The
`nederfors.github.io` to `symbapedia.se` popup/postMessage flow remains a
static, origin-checked legacy transfer bridge; it is not a hosted persistence
or synchronization channel.
