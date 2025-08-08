(function(window){
  const fields = ['shadow','age','appearance','manner','quote','faction','goal','drives','loyalties','likes','hates','background'];
  let form, editBtn, clearBtn, charLink, isEditing=false;
  let catsMinimized = false;

  function showView(){
    const notes = storeHelper.getNotes(store);
    fields.forEach(id=>{
      const el=form.querySelector('#'+id);
      if(!el) return;
      el.value=notes[id]||'';
      el.disabled=true;
      let box=el.parentElement.querySelector('.note-box');
      if(!box){
        box=document.createElement('div');
        box.className='note-box';
        el.parentElement.appendChild(box);
      }
      box.textContent=el.value;
    });
    form.classList.add('view-mode');
    isEditing=false;
    if(editBtn){
      editBtn.textContent='✏️';
      editBtn.title='Redigera';
      editBtn.onclick = showEdit;
    }
  }

  function showEdit(){
    const notes = storeHelper.getNotes(store);
    fields.forEach(id=>{
      const el=form.querySelector('#'+id);
      if(!el) return;
      el.value=notes[id]||'';
      el.disabled=false;
      const box=el.parentElement.querySelector('.note-box');
      if(box) box.remove();
      if(typeof autoResize === 'function') autoResize(el);
    });
    form.classList.remove('view-mode');
    isEditing=true;
    if(editBtn){
      editBtn.textContent='❌';
      editBtn.title='Stäng utan att spara';
      editBtn.onclick = cancelEdit;
    }
  }

  function cancelEdit(){
    if(confirm('Nu stängs redigering utan att spara, är du säker?')){
      showView();
    }
  }

  function initNotes() {
    form = document.getElementById('characterForm');
    if(!form) return;
    editBtn = document.getElementById('editBtn');
    clearBtn = document.getElementById('clearBtn');
    charLink = document.getElementById('charLink');

    if (dom.cName) {
      dom.cName.textContent = store.characters.find(c => c.id === store.current)?.name || '';
    }

    showView();

    const updateCatToggle = () => {
      const details = document.querySelectorAll('.note-field');
      catsMinimized = [...details].every(d => !d.open);
      if (dom.catToggle) {
        dom.catToggle.textContent = catsMinimized ? '▶' : '▼';
        dom.catToggle.title = catsMinimized
          ? 'Öppna alla fält'
          : 'Minimera alla fält';
      }
    };

    updateCatToggle();
    document.querySelectorAll('.note-field').forEach(d => {
      d.addEventListener('toggle', updateCatToggle);
    });

    if (dom.catToggle) dom.catToggle.addEventListener('click', () => {
      const details = document.querySelectorAll('.note-field');
      if (catsMinimized) {
        details.forEach(d => { d.open = true; });
      } else {
        details.forEach(d => { d.open = false; });
      }
      updateCatToggle();
    });

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
      if(!isEditing || confirm('Du håller på att sudda ut alla dina anteckningar, är du säker?')){
        fields.forEach(id=>{
          const el=form.querySelector('#'+id);
          if(el) el.value='';
        });
      }
    };

    if(charLink) charLink.addEventListener('click',e=>{
      if(isEditing && !confirm('Nu stängs redigering utan att spara, är du säker?')){
        e.preventDefault();
      }
    });

    if(editBtn) editBtn.onclick = showEdit;
  }

  window.initNotes=initNotes;
})(window);

