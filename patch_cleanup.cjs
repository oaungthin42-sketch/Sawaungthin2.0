const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /if \(job && job\.audioPath\) filesToRemove\.push\(job\.audioPath\);/m;
const replacement = `if (job && job.audioPath) filesToRemove.push(job.audioPath);
            if (job && job.videoPath) filesToRemove.push(job.videoPath);`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched processor cleanup');
