const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /speed = desired_orig_dur \/ target_dur;\n\s*\}/m;
const replacement = `speed = desired_orig_dur / target_dur;
                    if (speed < 0.5) speed = 0.5;
                    if (speed > 100.0) speed = 100.0;
                }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched speed clamp');
