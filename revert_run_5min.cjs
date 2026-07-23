const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'run_5min.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /import axios from 'axios';[\s\S]*?setJobKeys\(id, \{ geminiApiKey: 'fake-key' \}\);/m;
content = content.replace(regex, "setJobKeys(id, { geminiApiKey: process.env.GEMINI_API_KEY });");
fs.writeFileSync(file, content);
console.log('Reverted mock API');
