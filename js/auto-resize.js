(function(window){
  function autoResize(el){
    if(!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
  window.addEventListener('input', e=>{
    if(e.target.classList && e.target.classList.contains('auto-resize')){
      autoResize(e.target);
    }
  });
  window.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('.auto-resize').forEach(autoResize);
  });
  window.autoResize = autoResize;
})(window);
