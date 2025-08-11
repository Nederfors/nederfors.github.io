function addCors_(origin, output) {
  output.setHeader('Access-Control-Allow-Origin', origin);
  output.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return output;
}

function doOptions(e) {
  var origin = e && e.parameter && e.parameter.origin ? e.parameter.origin : '*';
  return addCors_(origin, ContentService.createTextOutput(''));
}
