const fs = require('fs');
let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const regexTimeline = /for \(let i = 0; i < state\.sceneNarration\.length; i\+\+\) \{\s*const sceneItem = state\.sceneNarration\[i\];\s*const chunk = authTimeline\[i\];/;
const newTimeline = `for (let i = 0; i < authTimeline.length; i++) {
                const chunk = authTimeline[i];
                const sceneItem = { scene_start: chunk.orig_start, scene_end: chunk.orig_end, narration_text: chunk.text };`;

content = content.replace(regexTimeline, newTimeline);

fs.writeFileSync('src/workers/processor.js', content, 'utf8');
console.log('patched timeline loop');
