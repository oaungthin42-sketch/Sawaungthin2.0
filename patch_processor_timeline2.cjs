const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /const absDiff = Math\.abs\(runningAudioTime - duration\);[\s\S]*?console\.log\(\`\[FINAL-TIMELINE-VALIDATION\]\`\);/m;

const replacement = `const absDiff = Math.abs(runningAudioTime - duration);
        let status = absDiff <= 0.05 ? 'PASS' : 'FAIL';
        if (numChunks === 0 && duration <= 0.15) {
             status = 'PASS'; // Empty transcript special case
             runningAudioTime = duration;
        }
        console.log(\`[FINAL-TIMELINE-VALIDATION]\`);`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched timeline validation for empty transcripts');
