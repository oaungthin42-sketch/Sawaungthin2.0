const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// replace fontUpload
code = code.replace(/const handleFontUpload = async[\s\S]*?};\s*/m, "");

// find where fetchFonts is.
// I will just use string replacement.
