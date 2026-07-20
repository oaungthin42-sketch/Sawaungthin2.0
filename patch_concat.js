import fs from 'fs';
const path = './src/workers/processor.js';
let content = fs.readFileSync(path, 'utf8');

const target = `                const safePath = segFile.replace(/\\\\/g, '/').replace(/'/g, "'\\\\''");
                validSegments.push(\`file '\${safePath}'\`);
            }`;

const replacement = `                const safePath = segFile.replace(/\\\\/g, '/').replace(/'/g, "'\\\\''");
                validSegments.push(\`file '\${safePath}'\`);
                validSegments.push(\`duration \${state.timeline[i].target_dur.toFixed(6)}\`);
            }`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Concat duration patched successfully.");
} else {
    console.log("Target string not found in processor.js");
}
