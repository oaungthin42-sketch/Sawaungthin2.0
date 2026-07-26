const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(/\\/\\/ Diagnostic: test Chromium launch[\\s\\S]*?\\(async \\(\\) => \\{[\\s\\S]*?\\}\\)\\(\\);/m, '');
fs.writeFileSync('server.js', code, 'utf8');
