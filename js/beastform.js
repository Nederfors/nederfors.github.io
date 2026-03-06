(function(window){
  function createPopup(){
    if(document.getElementById('beastPopup')) return;
    const div=document.createElement('div');
    div.id='beastPopup';
    div.className='popup picker-popup';
    div.innerHTML=`<div class="popup-inner picker-popup-ui"><header class="picker-popup-header"><h3 class="picker-popup-title">V\u00e4lj form</h3><button id="beastClose" class="char-btn icon picker-popup-close" type="button" title="St\u00e4ng">\u2715</button></header><p class="picker-popup-subtitle">V\u00e4lj vilken form som ska anv\u00e4ndas f\u00f6r Hamnskifte.</p><div id="beastOpts" class="picker-popup-options"></div><div class="picker-popup-actions"><button id="beastCancel" class="char-btn danger" type="button">Avbryt</button></div></div>`;
    document.body.appendChild(div);
    window.registerOverlayElement?.(div);
  }

  function openPopup(cb){
    createPopup();
    const pop=document.getElementById('beastPopup');
    const inner=pop.querySelector('.popup-inner');
    const box=pop.querySelector('#beastOpts');
    const cancelBtn=pop.querySelector('#beastCancel');
    const closeBtn=pop.querySelector('#beastClose');
    box.innerHTML=`<button data-form="normal" class="char-btn" type="button">Humanoid form (vanlig kostnad)</button><button data-form="beast" class="char-btn" type="button">F\u00f6r hamnskifte (gratis upp till novisniv\u00e5)</button>`;
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
      const b=e.target.closest('button[data-form]');
      if(!b) return;
      const val=b.dataset.form;
      finish(val);
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

  window.beastForm={pickForm:openPopup};
})(window);
