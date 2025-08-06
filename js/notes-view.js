(function(window){
  const fields = ['shadow','age','appearance','manner','quote','faction','goal','drives','loyalties','likes','hates','background'];
  let form, editBtn, clearBtn, notesDisplay;

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

  function showView(){
    const notes = storeHelper.getNotes(store);
    notesDisplay.innerHTML = renderView(notes);
    form.classList.add('hidden');
    notesDisplay.classList.remove('hidden');
    editBtn.classList.remove('hidden');
  }

  function showEdit(){
    const notes = storeHelper.getNotes(store);
    fields.forEach(id=>{
      const el=form.querySelector('#'+id);
      if(el) el.value=notes[id]||'';
    });
    form.classList.remove('hidden');
    notesDisplay.classList.add('hidden');
    editBtn.classList.add('hidden');
  }

  function initNotes() {
    form = document.getElementById('characterForm');
    if(!form) return;
    editBtn = document.getElementById('editBtn');
    clearBtn = document.getElementById('clearBtn');
    notesDisplay = document.getElementById('notesDisplay');

    showView();

    form.addEventListener('submit',e=>{
      e.preventDefault();
      const obj={};
      fields.forEach(id=>{
        const el=form.querySelector('#'+id);
        obj[id]=el?el.value:'';
      });
      storeHelper.setNotes(store,obj);
      showView();
    });

    if(clearBtn) clearBtn.onclick = ()=>{
      fields.forEach(id=>{
        const el=form.querySelector('#'+id);
        if(el) el.value='';
      });
    };

    if(editBtn) editBtn.onclick = showEdit;
  }

  window.initNotes=initNotes;
})(window);

