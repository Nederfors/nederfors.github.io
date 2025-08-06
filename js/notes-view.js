(function(window){
  const fields = ['shadow','age','appearance','manner','quote','faction','goal','drives','loyalties','likes','hates','background'];
  let form, previewBtn, editBtn, notesDisplay;

  const esc = str => (str||'').replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[c]));

  const simple = (label,val)=> val ? `<p><strong>${label}:</strong> ${esc(val)}</p>` : '';

  function renderView(n){
    return `
      <h3>Kortfattat</h3>
      ${simple('Skugga', n.shadow)}
      ${simple('Ålder', n.age)}
      ${simple('Utseende', n.appearance)}
      ${simple('Manér', n.manner)}
      ${simple('Citat', n.quote)}
      ${simple('Fraktion/ätt/klan/stam', n.faction)}
      <h3>Mellanlångt</h3>
      ${simple('Personligt mål', n.goal)}
      ${simple('Drivkrafter', n.drives)}
      ${simple('Lojaliteter', n.loyalties)}
      ${simple('Älskar', n.likes)}
      ${simple('Hatar', n.hates)}
      <h3>Bakgrund</h3>
      <p>${esc(n.background)}</p>
    `;
  }

  function showPreview(){
    const obj={};
    fields.forEach(id=>{
      const el=form.querySelector('#'+id);
      obj[id]=el?el.value:'';
    });
    storeHelper.setNotes(store,obj);
    notesDisplay.innerHTML = renderView(obj);
    notesDisplay.appendChild(editBtn);
    form.classList.add('hidden');
    notesDisplay.classList.remove('hidden');
  }

  function showEdit(){
    const notes = storeHelper.getNotes(store);
    fields.forEach(id=>{
      const el=form.querySelector('#'+id);
      if(el) el.value=notes[id]||'';
    });
    form.classList.remove('hidden');
    notesDisplay.classList.add('hidden');
  }

  function initNotes() {
    form = document.getElementById('characterForm');
    if(!form) return;
    previewBtn = document.getElementById('previewBtn');
    editBtn = document.getElementById('editBtn');
    notesDisplay = document.getElementById('notesDisplay');

    const notes = storeHelper.getNotes(store);
    fields.forEach(id=>{
      const el=form.querySelector('#'+id);
      if(el) el.value=notes[id]||'';
    });

    form.addEventListener('submit',e=>{
      e.preventDefault();
      const obj={};
      fields.forEach(id=>{
        const el=form.querySelector('#'+id);
        obj[id]=el?el.value:'';
      });
      storeHelper.setNotes(store,obj);
      alert('Anteckningar sparade!');
    });

    if(previewBtn) previewBtn.onclick = showPreview;
    if(editBtn) editBtn.onclick = showEdit;
  }

  window.initNotes=initNotes;
})(window);

