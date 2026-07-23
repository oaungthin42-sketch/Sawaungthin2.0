const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const \{ geminiApiKey, assemblyApiKey \} = getJobKeys\(jobId\);/, 'const { geminiApiKey } = getJobKeys(jobId);');

fs.writeFileSync(file, content);
console.log('Patched processor.js');
