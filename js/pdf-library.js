// PDF Library popup

let pdfCacheRequested = false;

function requestPdfCache() {
  if (pdfCacheRequested || !('serviceWorker' in navigator)) {
    return;
  }

  pdfCacheRequested = true;

  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_PDFS' });
  } else {
    navigator.serviceWorker.ready
      .then(reg => {
        if (reg.active) {
          reg.active.postMessage({ type: 'CACHE_PDFS' });
        } else {
          pdfCacheRequested = false;
        }
      })
      .catch(() => {
        pdfCacheRequested = false;
      });
  }
}

// The PDF button lives inside the shared-toolbar shadow DOM which makes
// `querySelectorAll` ineffective. `document.getElementById` is patched by
// the toolbar to also search its shadow root, so use it instead.
const pdfBtn = document.getElementById('pdfLibraryBtn');
pdfBtn?.addEventListener('click', async () => {
  requestPdfCache();
  const pdfs = await fetch('data/pdf-list.json').then(r => r.json());
  const pop = document.getElementById('pdfPopup');
  const box = document.getElementById('pdfOptions');
  const cls = document.getElementById('pdfCancel');
  box.innerHTML = pdfs
    .map(cat => `
      <div class="pdf-category">
        <h3>${cat.category}</h3>
        ${cat.items
          .map(p => `<button data-href="${encodeURI(p.file)}" class="char-btn">${p.title}</button>`)
          .join('')}
      </div>
    `)
    .join('');
  pop.classList.add('open');
  pop.querySelector('.popup-inner').scrollTop = 0;
  function close() {
    pop.classList.remove('open');
    box.removeEventListener('click', onBtn);
    cls.removeEventListener('click', onCancel);
    pop.removeEventListener('click', onOutside);
  }
  function onBtn(e) {
    const b = e.target.closest('button[data-href]');
    if (!b) return;
    window.open(b.dataset.href, '_blank', 'noopener');
    close();
  }
  function onCancel() { close(); }
  function onOutside(e) {
    if (!pop.querySelector('.popup-inner').contains(e.target)) {
      close();
    }
  }
  box.addEventListener('click', onBtn);
  cls.addEventListener('click', onCancel);
  pop.addEventListener('click', onOutside);
});
