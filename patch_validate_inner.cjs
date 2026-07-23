const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /let prevEnd = -1;[\s\S]*?\}\n\s*if \(cachePath\)/m;

const replacement = `try {
                    validateTimestamps(res, duration);
                } catch(e) {
                    if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                    return reject(new Error(\`Pipeline Error: Transcription Stage Failed.\\nInput File: \${wavPath} (WAV audio)\\nUnderlying Error: \${e.message}\`));
                }

                if (cachePath)`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched inner validateTimestamps');
