(function(window){
  function createPopup(){
    if(document.getElementById('artifactPaymentPopup')) return;
    const div=document.createElement('div');
    div.id='artifactPaymentPopup';
    div.className='popup';
    div.innerHTML=`<div class="popup-inner"><p>V\u00e4lj betalning</p><div id="artifactPaymentOpts" class="button-list"><button data-val="" class="char-btn">Obunden</button><button data-val="corruption" class="char-btn">+1 Permanent korruption</button><button data-val="xp" class="char-btn">\u20131 Erfarenhetspo\u00e4ng</button><button data-val="cancel" class="char-btn danger">Avbryt</button></div></div>`;
    document.body.appendChild(div);
  }

  function openPopup(current){
    return new Promise(resolve=>{
      createPopup();
      const pop=document.getElementById('artifactPaymentPopup');
      const box=pop.querySelector('#artifactPaymentOpts');
      const init=current||'';
      [...box.querySelectorAll('button')].forEach(btn=>{
        btn.dataset.val===init ? btn.classList.add('active') : btn.classList.remove('active');
      });
      pop.classList.add('open');
      pop.querySelector('.popup-inner').scrollTop = 0;
      function close(){
        pop.classList.remove('open');
        box.removeEventListener('click',onClick);
        pop.removeEventListener('click',onOutside);
      }
      function onClick(e){
        const btn=e.target.closest('button[data-val]');
        if(!btn) return;
        close();
        resolve(btn.dataset.val==='cancel'?null:btn.dataset.val);
      }
      function onOutside(e){
        if(!pop.querySelector('.popup-inner').contains(e.target)){
          close();
          resolve(null);
        }
      }
      box.addEventListener('click',onClick);
      pop.addEventListener('click',onOutside);
    });
  }

  window.selectArtifactPayment=openPopup;
})(window);
