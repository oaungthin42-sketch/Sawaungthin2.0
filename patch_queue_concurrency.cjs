const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/services/queue.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /const queue = new PQueue\(\{ concurrency: 1 \}\);/;
const replacement = "const concurrencyLimit = process.env.QUEUE_CONCURRENCY ? parseInt(process.env.QUEUE_CONCURRENCY, 10) : 1;\nconst queue = new PQueue({ concurrency: concurrencyLimit });";

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched Queue concurrency');
