// PDF Library popup

document.querySelectorAll('#pdfLibraryBtn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const pdfs = await fetch('data/pdf-list.json').then(r => r.json());
    const html = pdfs
      .map(p => `<div><a href="${encodeURI(p.file)}" target="_blank" rel="noopener">${p.title}</a></div>`)
      .join('');
    tabellPopup.open(html, 'PDF-bank');
  });
});
