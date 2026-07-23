const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'run_5min.js');
let content = fs.readFileSync(file, 'utf8');

const replacement = `import axios from 'axios';
axios.post = async (url, data, config) => {
    const text = data.contents[0].parts[0].text;
    const input = JSON.parse(text);
    return { data: { candidates: [{ content: { parts: [{ text: JSON.stringify(input.map(i => ({ index: i.index, text: "Translated " + i.text }))) }] } }] } };
};

setJobKeys(id, { geminiApiKey: 'fake-key' });`;

content = content.replace(/setJobKeys\(id, \{ geminiApiKey: process\.env\.GEMINI_API_KEY \}\);/, replacement);
fs.writeFileSync(file, content);
console.log('Patched run_5min.js');
