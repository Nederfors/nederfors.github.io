(function(window){
  const SPECS = ['Bestar','Kulturvarelser','Odöda','Styggelser'];

  function createPopup(){
    if(document.getElementById('monsterPopup')) return;
    const div=document.createElement('div');
    div.id='monsterPopup';
    div.className='popup picker-popup';
    div.innerHTML=`<div class="popup-inner picker-popup-ui"><header class="picker-popup-header"><h3 class="picker-popup-title">V\u00e4lj specialisering</h3><button id="monsterClose" class="char-btn icon picker-popup-close" type="button" title="St\u00e4ng">\u2715</button></header><p class="picker-popup-subtitle">V\u00e4lj en specialisering f\u00f6r Monsterl\u00e4rd.</p><div id="monsterOpts" class="picker-popup-options"></div><div class="picker-popup-actions"><button id="monsterCancel" class="char-btn danger" type="button">Avbryt</button></div></div>`;
    document.body.appendChild(div);
    window.registerOverlayElement?.(div);
  }

  function openPopup(used, cb){
    const usedSet = new Set((used || []).map(x => String(x || '').trim()));
    createPopup();
    const pop=document.getElementById('monsterPopup');
    const inner=pop.querySelector('.popup-inner');
    const box=pop.querySelector('#monsterOpts');
    const cancelBtn=pop.querySelector('#monsterCancel');
    const closeBtn=pop.querySelector('#monsterClose');
    box.innerHTML=SPECS.map((n,i)=>{
      const taken = usedSet.has(n);
      const disabled = taken ? ' disabled aria-disabled="true"' : '';
      const cls = taken ? 'char-btn disabled' : 'char-btn';
      return `<button data-i="${i}" class="${cls}" type="button"${disabled}>${n}</button>`;
    }).join('');
    pop.classList.add('open');
    if(inner) inner.scrollTop = 0;
    let done=false;
    function finish(result){
      if(done) return;
      done=true;
      pop.classList.remove('open');
      box.innerHTML='';
      box.removeEventListener('click',onClick);
      cancelBtn.removeEventListener('click',onCancel);
      closeBtn.removeEventListener('click',onCancel);
      pop.removeEventListener('click',onOutside);
      window.registerOverlayCleanup?.(pop, null);
      cb(result);
    }
    function onClick(e){
      const b=e.target.closest('button[data-i]');
      if(!b || b.disabled) return;
      const idx=Number(b.dataset.i);
      finish(SPECS[idx]);
    }
    function onCancel(){ finish(null); }
    function onOutside(e){
      if(e.target===pop){
        finish(null);
      }
    }
    function onOverlayClose(){ finish(null); }
    box.addEventListener('click',onClick);
    cancelBtn.addEventListener('click',onCancel);
    closeBtn.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
    window.registerOverlayCleanup?.(pop, onOverlayClose);
  }

  function pickSpec(used, cb){
    const hasUsed = Array.isArray(used);
    const finalCb = hasUsed ? cb : used;
    const usedList = hasUsed ? used : [];
    openPopup(usedList, res=>finalCb(res));
  }

  window.monsterLore={pickSpec, SPECS: [...SPECS]};
})(window);
