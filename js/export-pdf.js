const exportPdf = {
  pdfDoc: null,
  form: null,
  fieldTemplate: null,
  fieldTypes: null,

  async loadAssets() {
    if (this.pdfDoc) return;
    const [pdfBytes, templateJson, typesJson] = await Promise.all([
      fetch('export/symbaroum_rollformular.pdf').then(r => r.arrayBuffer()),
      fetch('export/symbaroum_pdf_fields_template.json').then(r => r.json()),
      fetch('export/symbaroum_pdf_fields_types.json').then(r => r.json())
    ]);
    const { PDFDocument } = PDFLib;
    this.pdfDoc = await PDFDocument.load(pdfBytes);
    this.form = this.pdfDoc.getForm();
    this.fieldTemplate = templateJson;
    this.fieldTypes = typesJson;
  },

  async exportCharacterPdf(store, charId) {
    await this.loadAssets();
    const char = store.characters.find(c => c.id === charId);
    if (!char) return;
    try {
      const nameField = this.form.getTextField('Namn');
      nameField.setText(char.name || '');
    } catch (err) {
      console.error('Kunde inte sätta namn i PDF', err);
    }
    const bytes = await this.pdfDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (char.name || 'character') + '.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }
};

window.exportPdf = exportPdf;
