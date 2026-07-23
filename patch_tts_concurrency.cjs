const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /const concurrencyLimit = 3;/;
const replacement = "const concurrencyLimit = process.env.TTS_CONCURRENCY ? parseInt(process.env.TTS_CONCURRENCY, 10) : 3;";

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched TTS concurrency');
