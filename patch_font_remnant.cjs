const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/    if \(selectedFontId\) formData\.append\('selectedFontId', selectedFontId\);\n/g, "");
code = code.replace(/\s*fontFamily: selectedFontId \? `font_\$\{selectedFontId\}` : 'inherit'/g, "");

fs.writeFileSync('src/App.tsx', code, 'utf8');
