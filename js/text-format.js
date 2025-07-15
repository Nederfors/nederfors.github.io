(function(window){
  function formatText(str){
    if(!str) return '';
    return str
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }
  window.formatText = formatText;
})(window);
