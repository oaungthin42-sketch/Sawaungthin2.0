const fs = require('fs');
let indexJs = fs.readFileSync('src/ai/index.js', 'utf8');

indexJs = indexJs.replace(/const style = getSetting\('TRANSLATION_STYLE'\) \|\| 'balanced';/g, "const style = getSetting('TRANSLATION_STYLE') || 'literal';");
indexJs = indexJs.replace(/const style = getSetting\('TRANSLATION_STYLE'\) \|\| 'default_recap';/g, "const style = getSetting('TRANSLATION_STYLE') || 'literal';");

fs.writeFileSync('src/ai/index.js', indexJs, 'utf8');
console.log('patched index.js');
