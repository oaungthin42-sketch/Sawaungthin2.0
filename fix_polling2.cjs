const fs = require('fs');
const path = require('path');
const appTsxPath = path.join(__dirname, 'src/App.tsx');
let content = fs.readFileSync(appTsxPath, 'utf8');

content = content.replace('const startPolling = (id: string) => {\n    let pollErrors = 0;', 'const startPolling = (id: string) => {\n    let pollErrors = 0;');

content = content.replace('if (pollErrors > 10) {', 'if (pollErrors > 20) {');
content = content.replace('}, 2000);', '}, 5000);');

fs.writeFileSync(appTsxPath, content);
console.log('Fixed polling 2');
