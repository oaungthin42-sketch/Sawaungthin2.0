import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `                if (meta.textHash === currentMeta.textHash && meta.length === currentMeta.length && meta.voice === currentMeta.voice && meta.pitch === currentMeta.pitch && meta.rate === currentMeta.rate && fs.statSync(cachePath).size > 0) {`;

const replacement = `                if (meta.textHash === currentMeta.textHash && meta.length === currentMeta.length && meta.voice === currentMeta.voice && meta.pitch === currentMeta.pitch && meta.rate === currentMeta.rate && meta.voiceId === currentMeta.voiceId && fs.statSync(cachePath).size > 0) {`;

if (content.includes("if (meta.textHash === currentMeta.textHash")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched AI cache logic with voiceId successfully.");
} else {
    console.log("Target not found.");
}
