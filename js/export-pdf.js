window.exportPdf = {
  pdfDoc: null,
  form: null,
  font: null,
  fieldTemplate: null,
  fieldTypes: null,

  async loadAssets() {
    if (this.pdfDoc) return;
    const [pdfBytes, templateJson, typesJson] = await Promise.all([
      fetch('export/symbaroum_rollformular.pdf').then(r => r.arrayBuffer()),
      fetch('export/symbaroum_pdf_fields_template.json').then(r => r.json()),
      fetch('export/symbaroum_pdf_fields_types.json').then(r => r.json())
    ]);
    if (!window.PDFLib) {
      console.error('PDFLib är inte tillgängligt. Kan inte exportera PDF.');
      return;
    }
    const { PDFDocument, StandardFonts } = window.PDFLib;
    this.pdfDoc = await PDFDocument.load(pdfBytes);
    this.font = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
    this.form = this.pdfDoc.getForm();
    this.form.updateFieldAppearances(this.font);
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
        field.updateAppearances(this.font);
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
    if (!this.pdfDoc) return;
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

    let truncated = false;
    const abilityLimit = Object.keys(this.fieldTemplate).filter(k => k.startsWith('Namn, förmåga')).length;
    const abilitiesAll = list.filter(it => (it.taggar?.typ || []).some(t => ['Förmåga', 'Mystisk kraft'].includes(t)));
    if (abilitiesAll.length > abilityLimit) truncated = true;
    abilitiesAll.slice(0, abilityLimit).forEach((ab, idx) => {
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
    const artifactsAll = inventory.filter(it => (it.taggar?.typ || []).some(t => t.includes('Artefakt')));
    const artifactLimit = Object.keys(this.fieldTemplate).filter(k => k.startsWith('Namn, artefakt')).length;
    if (artifactsAll.length > artifactLimit) truncated = true;
    artifactsAll.slice(0, artifactLimit).forEach((art, idx) => {
      const i = idx + 1;
      const powers = art.nivåer
        ? Object.entries(art.nivåer).map(([lvl, desc]) => `${lvl}: ${desc}`).join(' ')
        : (art.beskrivning || '');
      this.setField(`Namn, artefakt ${i}`, art.namn);
      this.setField(`Krafter, artefakt ${i}`, powers);
      this.setField(`Korruption, artefakt ${i}`, art.korruption || art.corruption || '');
    });

    const itemLimit = Object.keys(this.fieldTemplate).filter(k => k.startsWith('Föremål ')).length;
    const itemsAll = inventory.filter(it => !(it.taggar?.typ || []).some(t => t.includes('Artefakt')));
    if (itemsAll.length > itemLimit) truncated = true;
    itemsAll.slice(0, itemLimit).forEach((it, idx) => {
      const i = idx + 1;
      this.setField(`Föremål ${i}`, it.namn || it.name || '');
      this.setField(`Antal, föremål ${i}`, it.qty ?? it.antal ?? '');
    });

    if (truncated) {
      alert('PDF-mallen saknar plats för alla poster.');
    }

    const pdfBytes = await this.pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${char.name || 'karaktar'}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
};
