(function(window){
  function createPopup(){
    if(document.getElementById('bloodPopup')) return;
    const div=document.createElement('div');
    div.id='bloodPopup';
    div.innerHTML=`<div class="popup-inner"><h3 id="bloodTitle">V\u00e4lj ras</h3><div id="bloodOpts"></div><button id="bloodCancel" class="char-btn danger">Avbryt</button></div>`;
    document.body.appendChild(div);
  }

  function openPopup(options, cb){
    createPopup();
    const pop=document.getElementById('bloodPopup');
    const box=pop.querySelector('#bloodOpts');
    const cls=pop.querySelector('#bloodCancel');
    box.innerHTML=options.map((n,i)=>`<button data-i="${i}" class="char-btn">${n}</button>`).join('');
    pop.classList.add('open');
    pop.querySelector('.popup-inner').scrollTop = 0;
    function close(){
      pop.classList.remove('open');
      box.innerHTML='';
      box.removeEventListener('click',onClick);
      cls.removeEventListener('click',onCancel);
      pop.removeEventListener('click',onOutside);
    }
    function onClick(e){
      const b=e.target.closest('button[data-i]'); if(!b) return;
      const idx=Number(b.dataset.i); close(); cb(options[idx]);
    }
    function onCancel(){ close(); cb(null); }
    function onOutside(e){ if(!pop.querySelector('.popup-inner').contains(e.target)){ close(); cb(null); } }
    box.addEventListener('click',onClick);
    cls.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
  }

  function pickRace(used, cb){
    const races=(window.DB||[]).filter(isRas).map(r=>r.namn).filter(n=>!used.includes(n));
    openPopup(races, res=>cb(res));
  }

  window.bloodBond={pickRace};
})(window);
