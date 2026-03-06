(function(window){
  function createPopup(){
    if(document.getElementById('bloodPopup')) return;
    const div=document.createElement('div');
    div.id='bloodPopup';
    div.className='popup picker-popup';
    div.innerHTML=`<div class="popup-inner picker-popup-ui"><header class="picker-popup-header"><h3 id="bloodTitle" class="picker-popup-title">V\u00e4lj ras</h3><button id="bloodClose" class="char-btn icon picker-popup-close" type="button" title="St\u00e4ng">\u2715</button></header><p class="picker-popup-subtitle">V\u00e4lj en ras f\u00f6r Blodsband.</p><div id="bloodOpts" class="picker-popup-options"></div><div class="picker-popup-actions"><button id="bloodCancel" class="char-btn danger" type="button">Avbryt</button></div></div>`;
    document.body.appendChild(div);
    window.registerOverlayElement?.(div);
  }

  function openPopup(options, cb){
    createPopup();
    const pop=document.getElementById('bloodPopup');
    const inner=pop.querySelector('.popup-inner');
    const box=pop.querySelector('#bloodOpts');
    const cancelBtn=pop.querySelector('#bloodCancel');
    const closeBtn=pop.querySelector('#bloodClose');
    box.innerHTML=options.length
      ? options.map((n,i)=>`<button data-i="${i}" class="char-btn" type="button">${n}</button>`).join('')
      : '<button class="char-btn" type="button" disabled>Inga val kvar</button>';
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
      const b=e.target.closest('button[data-i]'); if(!b) return;
      const idx=Number(b.dataset.i);
      finish(options[idx]);
    }
    function onCancel(){
      finish(null);
    }
    function onOutside(e){
      if(e.target===pop){
        finish(null);
      }
    }
    function onOverlayClose(){
      finish(null);
    }
    box.addEventListener('click',onClick);
    cancelBtn.addEventListener('click',onCancel);
    closeBtn.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
    window.registerOverlayCleanup?.(pop, onOverlayClose);
  }

  function pickRace(used, cb){
    const races=(window.DB||[]).filter(isRas).map(r=>r.namn).filter(n=>!used.includes(n));
    openPopup(races, res=>cb(res));
  }

  window.bloodBond={pickRace};
})(window);
