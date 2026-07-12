(function(window){
  function createPopup(){
    if(document.getElementById('beastPopup')) return;
    const div=document.createElement('div');
    div.id='beastPopup';
    div.innerHTML=`<div class="popup-inner"><h3>V\u00e4lj form</h3><div id="beastOpts"></div><button id="beastCancel" class="char-btn danger">Avbryt</button></div>`;
    document.body.appendChild(div);
  }

  function openPopup(cb){
    createPopup();
    const pop=document.getElementById('beastPopup');
    const box=pop.querySelector('#beastOpts');
    const cls=pop.querySelector('#beastCancel');
    box.innerHTML=`<button data-form="normal" class="char-btn">Humanoid form (vanlig kostnad)</button><button data-form="beast" class="char-btn">F\u00f6r hamnskifte (gratis upp till novisniv\u00e5)</button>`;
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
      const b=e.target.closest('button[data-form]');
      if(!b) return;
      const val=b.dataset.form;
      close();
      cb(val);
    }
    function onCancel(){ close(); cb(null); }
    function onOutside(e){ if(!pop.querySelector('.popup-inner').contains(e.target)){ close(); cb(null); } }
    box.addEventListener('click',onClick);
    cls.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
  }

  window.beastForm={pickForm:openPopup};
})(window);

