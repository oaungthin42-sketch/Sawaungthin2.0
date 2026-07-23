const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /const \{ geminiApiKey \} = getJobKeys\(jobId\);\n/m;
const replacement = `const { geminiApiKey } = getJobKeys(jobId);
    if (!geminiApiKey) {
        throw new Error("Job interrupted due to server restart. Credentials lost. Please resubmit the job with your API keys.");
    }\n`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched processor.js credentials check');
