const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Remove Step 6 My Fonts
code = code.replace(/\s*\{\/\*\s*Step 6: My Fonts\s*\*\/\}[\s\S]*?\{fonts\.length === 0 \? \([\s\S]*?\}\)\s*\}\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*\)\s*\}/, "");

fs.writeFileSync('src/App.tsx', code, 'utf8');
