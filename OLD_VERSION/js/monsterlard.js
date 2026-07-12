(function(window){
  const SPECS = ['Bestar','Kulturvarelser','Odöda','Styggelser'];

  function createPopup(){
    if(document.getElementById('monsterPopup')) return;
    const div=document.createElement('div');
    div.id='monsterPopup';
    div.innerHTML=`<div class="popup-inner"><h3>Välj specialisering</h3><div id="monsterOpts"></div><button id="monsterCancel" class="char-btn danger">Avbryt</button></div>`;
    document.body.appendChild(div);
  }

  function openPopup(used, cb){
    const usedSet = new Set((used || []).map(x => String(x || '').trim()));
    createPopup();
    const pop=document.getElementById('monsterPopup');
    const box=pop.querySelector('#monsterOpts');
    const cls=pop.querySelector('#monsterCancel');
    box.innerHTML=SPECS.map((n,i)=>{
      const taken = usedSet.has(n);
      const disabled = taken ? ' disabled aria-disabled="true"' : '';
      const cls = taken ? 'char-btn disabled' : 'char-btn';
      return `<button data-i="${i}" class="${cls}"${disabled}>${n}</button>`;
    }).join('');
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
      const b=e.target.closest('button[data-i]');
      if(!b || b.disabled) return;
      const idx=Number(b.dataset.i);
      close();
      cb(SPECS[idx]);
    }
    function onCancel(){ close(); cb(null); }
    function onOutside(e){
      if(!pop.querySelector('.popup-inner').contains(e.target)){
        close();
        cb(null);
      }
    }
    box.addEventListener('click',onClick);
    cls.addEventListener('click',onCancel);
    pop.addEventListener('click',onOutside);
  }

  function pickSpec(used, cb){
    const hasUsed = Array.isArray(used);
    const finalCb = hasUsed ? cb : used;
    const usedList = hasUsed ? used : [];
    openPopup(usedList, res=>finalCb(res));
  }

  window.monsterLore={pickSpec, SPECS: [...SPECS]};
})(window);
