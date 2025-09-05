(function(window){
  function createPopup(){
    if(document.getElementById('artifactPaymentPopup')) return;
    const div=document.createElement('div');
    div.id='artifactPaymentPopup';
    div.innerHTML=`<div class="popup-inner"><h3>V\u00e4lj betalning</h3><div id="artifactPaymentOpts" class="radio-list"><label class="radio-row"><input type="radio" name="artifactPay" value="xp">\u20131 erf</label><label class="radio-row"><input type="radio" name="artifactPay" value="corruption">+1 permanent korruption</label><label class="radio-row"><input type="radio" name="artifactPay" value="">Obunden</label></div><button id="artifactPaymentCancel" class="char-btn danger">Avbryt</button></div>`;
    document.body.appendChild(div);
  }

  function openPopup(current){
    return new Promise(resolve=>{
      createPopup();
      const pop=document.getElementById('artifactPaymentPopup');
      const box=pop.querySelector('#artifactPaymentOpts');
      const cancel=pop.querySelector('#artifactPaymentCancel');
      const radios=[...box.querySelectorAll('input[name="artifactPay"]')];
      const init=current||'';
      radios.forEach(r=>{ r.checked=r.value===init; });
      pop.classList.add('open');
      pop.querySelector('.popup-inner').scrollTop = 0;
      function close(){
        pop.classList.remove('open');
        box.removeEventListener('change',onChange);
        cancel.removeEventListener('click',onCancel);
        pop.removeEventListener('click',onOutside);
      }
      function onChange(e){
        const inp=e.target.closest('input[name="artifactPay"]');
        if(!inp) return;
        close();
        resolve(inp.value);
      }
      function onCancel(){ close(); resolve(null); }
      function onOutside(e){ if(!pop.querySelector('.popup-inner').contains(e.target)){ close(); resolve(null); } }
      box.addEventListener('change',onChange);
      cancel.addEventListener('click',onCancel);
      pop.addEventListener('click',onOutside);
    });
  }

  window.selectArtifactPayment=openPopup;
})(window);
