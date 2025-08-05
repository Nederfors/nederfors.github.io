(function(window){
  function initNotes() {
    const form = document.getElementById('characterForm');
    if(!form) return;
    const fields = ['shadow','age','appearance','manner','quote','goal','drives','loyalties','likes','hates','background'];
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
  }
  window.initNotes=initNotes;
})(window);
