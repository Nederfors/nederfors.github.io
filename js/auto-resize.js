(function(window){
  function autoResize(el){
    if(!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
  window.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('.auto-resize').forEach(el => {
      el.addEventListener('input', () => autoResize(el));
      autoResize(el);
    });
  });
  window.autoResize = autoResize;
})(window);
