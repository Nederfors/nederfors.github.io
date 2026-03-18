(function(window){
  const fields = ['shadow','age','appearance','manner','quote','faction','goal','drives','loyalties','likes','hates','background'];
  const uiPrefs = window.symbaroumUiPrefs || window.localStorage;
  const getUiPref = (key) => {
    try {
      return uiPrefs?.getItem?.(key) ?? null;
    } catch {
      return null;
    }
  };
  const setUiPref = (key, value) => {
    try {
      uiPrefs?.setItem?.(key, value);
    } catch {}
  };
  let form, editBtn, clearBtn, charLink, isEditing=false;
  let catsMinimized = false;

  // State for collapsed/expanded note fields, keyed by character id
  let STATE_KEY = 'notesViewState:default';
  let catState = {};
  const loadState = () => {
    try { return JSON.parse(getUiPref(STATE_KEY)) || {}; }
    catch { return {}; }
  };
  const saveState = () => {
    try { setUiPref(STATE_KEY, JSON.stringify({ cats: catState })); }
    catch {}
  };

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
      editBtn.innerHTML = window.iconHtml ? window.iconHtml('pen') : '✏️';
      editBtn.title='Redigera';
      editBtn.onclick = showEdit;
    }
  }

  function showEdit(){
    const notes = storeHelper.getNotes(store);
    const textareas = [];
    fields.forEach(id=>{
      const el=form.querySelector('#'+id);
      if(!el) return;
      el.value=notes[id]||'';
      el.disabled=false;
      const box=el.parentElement.querySelector('.note-box');
      if(box) box.remove();
      textareas.push(el);
    });
    form.classList.remove('view-mode');
    const runResize = () => {
      textareas.forEach(el=>{
        if(typeof autoResize === 'function') autoResize(el);
      });
      if(typeof autoResizeAll === 'function') autoResizeAll(form);
    };
    if(typeof requestAnimationFrame === 'function'){
      requestAnimationFrame(()=>{
        requestAnimationFrame(runResize);
      });
    } else {
      setTimeout(runResize, 0);
    }
    isEditing=true;
    if(editBtn){
      editBtn.innerHTML = window.iconHtml ? window.iconHtml('cross') : '❌';
      editBtn.title='Stäng utan att spara';
      editBtn.onclick = cancelEdit;
    }
  }

  async function cancelEdit(){
    if(await confirmPopup('Nu stängs redigering utan att spara, är du säker?')){
      showView();
    }
  }

  function initNotes() {
    form = document.getElementById('characterForm');
    if(!form) return;
    editBtn = document.getElementById('editBtn');
    clearBtn = document.getElementById('clearBtn');
    charLink = document.getElementById('charLink');

    const charId = (window.store && window.store.current) ? window.store.current : 'default';
    STATE_KEY = `notesViewState:${charId}`;
    const saved = loadState();
    catState = saved.cats || {};

    if (dom.cName) {
      dom.cName.textContent = store.characters.find(c => c.id === store.current)?.name || '';
    }

    showView();

    const updateCatToggle = () => {
      const details = document.querySelectorAll('.note-field');
      catsMinimized = [...details].every(d => !d.open);
      if (dom.catToggle) {
        { const ci = dom.catToggle.querySelector('.chevron-icon'); if (ci) ci.classList.toggle('collapsed', catsMinimized); }
        dom.catToggle.title = catsMinimized
          ? 'Öppna alla fält'
          : 'Minimera alla fält';
      }
    };

    const detailEls = document.querySelectorAll('.note-field');
    detailEls.forEach(d => {
      const key = d.querySelector('textarea')?.id || '';
      if (key && catState[key] === false) d.open = false;
      d.addEventListener('toggle', () => {
        if (key) catState[key] = d.open;
        saveState();
        updateCatToggle();
      });
    });
    updateCatToggle();

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

    if(clearBtn) clearBtn.onclick = async ()=>{
      if(!isEditing || await confirmPopup('Du håller på att sudda ut alla dina anteckningar, är du säker?')){
        fields.forEach(id=>{
          const el=form.querySelector('#'+id);
          if(el) el.value='';
        });
      }
    };

    if(charLink) charLink.addEventListener('click',async e=>{
      if(isEditing && !(await confirmPopup('Nu stängs redigering utan att spara, är du säker?'))){
        e.preventDefault();
      }
    });

    if(editBtn) editBtn.onclick = showEdit;
  }

  window.initNotes=initNotes;
  const refreshNotesName = () => {
    if (!dom || !dom.cName) return;
    dom.cName.textContent = (store.characters || []).find(c => c.id === store.current)?.name || '';
  };
  const refreshNotesPanel = () => {
    if (!form) return;
    if (isEditing) {
      const notes = storeHelper.getNotes(store);
      fields.forEach(id=>{
        const el=form.querySelector('#'+id);
        if (!el) return;
        el.value = notes[id] || '';
        if (typeof autoResize === 'function') autoResize(el);
      });
      return;
    }
    showView();
  };
  window.symbaroumViewBridge?.registerViewHooks('notes', {
    refresh: () => {
      try {
        refreshNotesName();
        refreshNotesPanel();
      } catch {}
    },
    refreshName: refreshNotesName,
    refreshNotes: refreshNotesPanel
  });
})(window);
