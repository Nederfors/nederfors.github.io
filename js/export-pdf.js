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

  setField(name, value) {
    const type = this.fieldTypes?.[name];
    if (!type) return;
    try {
      if (type === '/Tx') {
        const field = this.form.getTextField(name);
        field.setText(String(value ?? ''));
      } else if (type === '/Btn') {
        const field = this.form.getCheckBox(name);
        value ? field.check() : field.uncheck();
      }
    } catch (err) {
      console.error(`Kunde inte sätta fältet ${name} i PDF`, err);
    }
  },

  async exportCharacterPdf(store, charId) {
    await this.loadAssets();
    const char = store.characters.find(c => c.id === charId);
    if (!char) return;

    // Reset fields
    Object.entries(this.fieldTemplate).forEach(([k, v]) => this.setField(k, v));

    const list = storeHelper.getCurrentList(store);
    const traits = storeHelper.getTraits(store);
    const baseXp = storeHelper.getBaseXP(store);
    const effects = storeHelper.getArtifactEffects(store);
    const totalXp = storeHelper.calcTotalXP(baseXp, list);
    const usedXp = storeHelper.calcUsedXP(list, effects);
    const unusedXp = totalXp - usedXp;

    this.setField('Namn', char.name || '');
    this.setField('Släkte', list.find(isRas)?.namn || '');
    this.setField('Yrke', list.find(isYrke)?.namn || '');
    this.setField('Total erfarenhet', totalXp);
    this.setField('Oanvänd erfarenhet', unusedXp);

    Object.entries(traits).forEach(([k, v]) => this.setField(k, v));

    const abilities = list.filter(it => (it.taggar?.typ || []).some(t => ['Förmåga', 'Mystisk kraft'].includes(t)));
    abilities.forEach((ab, idx) => {
      const i = idx + 1;
      this.setField(`Namn, förmåga ${i}`, ab.namn);
      this.setField(`Typ, förmåga ${i}`, (ab.taggar?.typ || []).join(', '));
      this.setField(`Effekt, förmåga ${i}`, ab.beskrivning || '');
      ['Novis', 'Gesäll', 'Mästare'].forEach(level => {
        this.setField(`${level}, förmåga ${i}`, ab.nivå === level);
      });
    });

    const money = storeHelper.getMoney(store);
    const bonus = storeHelper.getBonusMoney(store);
    const priv = storeHelper.getPrivMoney(store);
    const poss = storeHelper.getPossessionMoney(store);
    const fmt = m => `${m.daler}D ${m.skilling}S ${m['örtegar']}Ö`;
    this.setField('Daler', money.daler || 0);
    this.setField('Skilling', money.skilling || 0);
    this.setField('Örtegar', money['örtegar'] || 0);
    this.setField('Skulder', '');
    this.setField('I förvar', fmt(bonus));
    this.setField('Övriga tillgångar', `Priv ${fmt(priv)} | Bes ${fmt(poss)}`);

    const inventory = storeHelper.getInventory(store);
    const artifacts = inventory.filter(it => (it.taggar?.typ || []).some(t => t.includes('Artefakt')));
    artifacts.slice(0, 6).forEach((art, idx) => {
      const i = idx + 1;
      const powers = art.nivåer
        ? Object.entries(art.nivåer).map(([lvl, desc]) => `${lvl}: ${desc}`).join(' ')
        : (art.beskrivning || '');
      this.setField(`Namn, artefakt ${i}`, art.namn);
      this.setField(`Krafter, artefakt ${i}`, powers);
      this.setField(`Korruption, artefakt ${i}`, art.korruption || art.corruption || '');
    });

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
