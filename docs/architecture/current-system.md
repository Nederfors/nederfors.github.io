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
