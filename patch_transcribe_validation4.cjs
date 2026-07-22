const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

// The clamped value needs to be passed down. There's a bug where we mutated chunk.timestamp[1] but not 'end'. Let's fix that.
const regex = /if \(end - duration < 1\.5\) \{ \/\/ tiny overshoot, clamp it\n\s*end = duration;\n\s*chunk\.timestamp\[1\] = end;/m;
const replacement = `if (end - duration < 1.5) { // tiny overshoot, clamp it
                            end = duration;
                            chunk.timestamp[1] = end;
                            res[i].timestamp[1] = end;`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched transcribeWav validation to properly mutate the result array');
