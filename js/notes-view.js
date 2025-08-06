(function(window){
  const fields = ['shadow','age','appearance','manner','quote','faction','goal','drives','loyalties','likes','hates','background'];
  let form, editBtn, clearBtn;

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
    form.classList.remove('hidden');
    form.classList.add('view-mode');
    editBtn.classList.remove('hidden');
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
    editBtn.classList.add('hidden');
    form.classList.remove('view-mode');
  }

  function initNotes() {
    form = document.getElementById('characterForm');
    if(!form) return;
    editBtn = document.getElementById('editBtn');
    clearBtn = document.getElementById('clearBtn');

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

