const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /\/\/ Allow some overlap\/out of order if Whisper was weird[\s\S]*?throw new Error\(\`Pipeline Error: Timestamp wildly exceeds audio duration at chunk \$\{i\}\`\);\n\s*\}/m;
content = content.replace(regex, `// Strict validation is now handled in transcribeWav inside src/ai/index.js`);
fs.writeFileSync(file, content);
console.log('Patched processor validation');
