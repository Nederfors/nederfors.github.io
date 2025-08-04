// Simple PDF export functionality using pdf-lib
// Provides exportPdf.exportCharacterPdf(store, charId)

async function exportCharacterPdf(store, charId) {
  const char = store.characters.find(c => c.id === charId);
  if (!char) return;

  const { PDFDocument } = PDFLib;
  const pdfBytes = await fetch('export/symbaroum_rollformular.pdf').then(res => res.arrayBuffer());
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  try {
    const nameField = form.getTextField('Namn');
    nameField.setText(char.name || '');
  } catch (err) {
    console.error('Kunde inte sätta namn i PDF', err);
  }
  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (char.name || 'character') + '.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

window.exportPdf = { exportCharacterPdf };
