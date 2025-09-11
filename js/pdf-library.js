// PDF Library popup

// The PDF button lives inside the shared-toolbar shadow DOM which makes
// `querySelectorAll` ineffective. `document.getElementById` is patched by
// the toolbar to also search its shadow root, so use it instead.
const pdfBtn = document.getElementById('pdfLibraryBtn');
pdfBtn?.addEventListener('click', async () => {
  const pdfs = await fetch('data/pdf-list.json').then(r => r.json());
  const html = pdfs
    .map(p => `<div><a href="${encodeURI(p.file)}" target="_blank" rel="noopener">${p.title}</a></div>`)
    .join('');
  tabellPopup.open(html, 'PDF-bank');
});
