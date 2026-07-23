const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/routes/api.js');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const assemblyApiKey = [^\n]+\n/g, '');
content = content.replace(/if \(\!geminiApiKey \|\| \!assemblyApiKey\)/g, 'if (!geminiApiKey)');
content = content.replace(/if \(\!assemblyApiKey\) missing\.push\('ASSEMBLYAI_API_KEY'\);\n/g, '');
content = content.replace(/\{ geminiApiKey, assemblyApiKey \}/g, '{ geminiApiKey }');

fs.writeFileSync(file, content);
console.log('Patched api.js');
