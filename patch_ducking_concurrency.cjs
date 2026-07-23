const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /const limit = 5;/;
const replacement = "const limit = process.env.SEGMENT_CONCURRENCY ? parseInt(process.env.SEGMENT_CONCURRENCY, 10) : 5;";

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched Ducking Builder concurrency');
