const fs = require('fs');
const file = 'src/services/settings.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/IN \('ASSEMBLYAI_API_KEY', 'GEMINI_API_KEY'\)/g, `IN ('GEMINI_API_KEY')`);
content = content.replace(/key === 'GEMINI_API_KEY' \|\| key === 'ASSEMBLYAI_API_KEY'/g, `key === 'GEMINI_API_KEY'`);
content = content.replace(/ASSEMBLYAI_API_KEY: \{ configured: false \},\s*/g, '');

fs.writeFileSync(file, content);
