(function(window){
  const scheduled = new WeakSet();
  const minHeights = new WeakMap();
  const doc = window.document;

  const inNextFrame = (fn) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(fn));
    } else {
      window.setTimeout(fn, 16);
    }
  };

  const getMinHeight = (el) => {
    if (minHeights.has(el)) return minHeights.get(el);
    let min = parseFloat(window.getComputedStyle(el).minHeight);
    if (!Number.isFinite(min) || min <= 0) {
      const rectH = el.getBoundingClientRect().height;
      if (rectH > 0) min = rectH;
      else {
        const line = parseFloat(window.getComputedStyle(el).lineHeight);
        min = Number.isFinite(line) && line > 0 ? line * 2 : 32;
      }
    }
    minHeights.set(el, min);
    return min;
  };

  function resizeNow(el){
    scheduled.delete(el);
    if (!el) return;
    const style = window.getComputedStyle(el);
    if (style.display === 'none') return;
    const minHeight = getMinHeight(el);
    el.style.height = 'auto';
    const target = Math.max(el.scrollHeight, minHeight || 0);
    el.style.height = `${target}px`;
  }

  function autoResize(el){
    if (!el) return;
    if (scheduled.has(el)) return;
    scheduled.add(el);
    inNextFrame(() => resizeNow(el));
  }

  function bind(el){
    if (!el || el.dataset.autoResizeBound) return;
    el.dataset.autoResizeBound = '1';
    const handler = () => autoResize(el);
    ['input','change','cut','paste'].forEach(evt => el.addEventListener(evt, handler));
    autoResize(el);
  }

  function autoResizeAll(root){
    const scope = root || doc;
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('textarea.auto-resize').forEach(el => {
      bind(el);
      autoResize(el);
    });
  }

  function init(){
    autoResizeAll(doc);
    doc.querySelectorAll('details').forEach(det => {
      det.addEventListener('toggle', () => autoResizeAll(det));
    });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  let resizeTimer = 0;
  let resizeUsesTimeout = false;
  window.addEventListener('resize', () => {
    if (resizeTimer) {
      if (resizeUsesTimeout) window.clearTimeout(resizeTimer);
      else window.cancelAnimationFrame(resizeTimer);
    }
    if (typeof window.requestAnimationFrame === 'function') {
      resizeUsesTimeout = false;
      resizeTimer = window.requestAnimationFrame(() => {
        resizeTimer = 0;
        autoResizeAll(doc);
      });
    } else {
      resizeUsesTimeout = true;
      resizeTimer = window.setTimeout(() => {
        resizeTimer = 0;
        autoResizeAll(doc);
      }, 16);
    }
  });

  window.addEventListener('load', () => autoResizeAll(doc));
  if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
    document.fonts.ready.then(() => autoResizeAll(doc)).catch(()=>{});
  }

  window.autoResize = autoResize;
  window.autoResizeAll = autoResizeAll;
})(window);
