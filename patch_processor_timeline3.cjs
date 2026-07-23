const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/workers/processor.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /const createTimelineSegment = \(start, end, scene_start, scene_end, text\) => \{/;
const replacement = `const createTimelineSegment = (start, end, scene_start, scene_end, text) => {
                if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(scene_start) || !Number.isFinite(scene_end)) {
                    throw new Error(\`Pipeline Error: Non-finite timestamps passed to createTimelineSegment. start=\${start}, end=\${end}, scene_start=\${scene_start}, scene_end=\${scene_end}\`);
                }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched processor timeline debug check');
