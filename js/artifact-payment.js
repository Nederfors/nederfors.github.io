(function(window){
  function createPopup(){
    if(document.getElementById('artifactPaymentPopup')) return;
    const div=document.createElement('div');
    div.id='artifactPaymentPopup';
    div.className='popup picker-popup';
    div.innerHTML=`<div class="popup-inner picker-popup-ui"><header class="picker-popup-header"><h3 class="picker-popup-title">V\u00e4lj betalning</h3><button id="artifactPaymentClose" class="char-btn icon picker-popup-close" type="button" title="St\u00e4ng">\u2715</button></header><p class="picker-popup-subtitle">V\u00e4lj hur artefakten ska bindas.</p><div id="artifactPaymentOpts" class="button-list picker-popup-options"><button data-val="" class="char-btn" type="button">Obunden</button><button data-val="corruption" class="char-btn" type="button">+1 Permanent korruption</button><button data-val="xp" class="char-btn" type="button">\u20131 Erfarenhetspo\u00e4ng</button></div><div class="picker-popup-actions"><button id="artifactPaymentCancel" class="char-btn danger" type="button">Avbryt</button></div></div>`;
    document.body.appendChild(div);
    window.registerOverlayElement?.(div);
  }

  function openPopup(current){
    return new Promise(resolve=>{
      createPopup();
      const pop=document.getElementById('artifactPaymentPopup');
      const inner=pop.querySelector('.popup-inner');
      const box=pop.querySelector('#artifactPaymentOpts');
      const cancelBtn=pop.querySelector('#artifactPaymentCancel');
      const closeBtn=pop.querySelector('#artifactPaymentClose');
      const init=current||'';
      [...box.querySelectorAll('button')].forEach(btn=>{
        btn.dataset.val===init ? btn.classList.add('active') : btn.classList.remove('active');
      });
      pop.classList.add('open');
      if(inner) inner.scrollTop = 0;
      let done=false;
      function finish(result){
        if(done) return;
        done=true;
        pop.classList.remove('open');
        box.removeEventListener('click',onClick);
        cancelBtn.removeEventListener('click',onCancel);
        closeBtn.removeEventListener('click',onCancel);
        pop.removeEventListener('click',onOutside);
        window.registerOverlayCleanup?.(pop, null);
        resolve(result);
      }
      function onClick(e){
        const btn=e.target.closest('button[data-val]');
        if(!btn) return;
        finish(btn.dataset.val);
      }
      function onCancel(){
        finish(null);
      }
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
    });
  }

  window.selectArtifactPayment=openPopup;
})(window);
