(function(window){
  const fields = ['shadow','age','appearance','manner','quote','faction','goal','drives','loyalties','likes','hates','background'];
  let form, editBtn, clearBtn, btnRow;

  function showView(){
    const notes = storeHelper.getNotes(store);
    fields.forEach(id=>{
      const el=form.querySelector('#'+id);
      if(el){
        el.value=notes[id]||'';
        el.disabled=true;
      }
    });
    form.classList.remove('hidden');
    editBtn.classList.remove('hidden');
    btnRow.classList.add('hidden');
  }

  function showEdit(){
    const notes = storeHelper.getNotes(store);
    fields.forEach(id=>{
      const el=form.querySelector('#'+id);
      if(el){
        el.value=notes[id]||'';
        el.disabled=false;
      }
    });
    editBtn.classList.add('hidden');
    btnRow.classList.remove('hidden');
  }

  function initNotes() {
    form = document.getElementById('characterForm');
    if(!form) return;
    editBtn = document.getElementById('editBtn');
    clearBtn = document.getElementById('clearBtn');
    btnRow = form.querySelector('.char-btn-row');

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

