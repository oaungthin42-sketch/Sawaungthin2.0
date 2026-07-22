const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

// Increase clamp tolerance from 0.5 to 1.5 seconds, as Whisper sometimes rounds up end timestamps
const regex = /if \(end - duration < 0\.5\) \{ \/\/ tiny overshoot, clamp it/m;
const replacement = `if (end - duration < 1.5) { // tiny overshoot, clamp it`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched transcribeWav validation to clamp up to 1.5s overshoots');
