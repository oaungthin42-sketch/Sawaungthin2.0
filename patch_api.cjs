const fs = require('fs');
let code = fs.readFileSync('src/routes/api.js', 'utf8');

// 1. Remove fontStorage and fontUpload
code = code.replace(/const fontStorage = multer\.diskStorage\(\{[\s\S]*?\}\);\nconst fontUpload = multer\(\{[\s\S]*?\}\);\n/, "");

// 2. Remove /fonts/upload and /fonts
code = code.replace(/router\.post\('\/fonts\/upload', \([\s\S]*?\}\);\n\}\);\n/m, "");
code = code.replace(/router\.get\('\/fonts', \([\s\S]*?\}\);\n/m, "");

fs.writeFileSync('src/routes/api.js', code, 'utf8');
