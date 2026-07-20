import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `        if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error(\`Final TTS audio has invalid duration: \${duration}\`);
        }
        
        // Write metadata cache`;

const replacement = `        if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error(\`Final TTS audio has invalid duration: \${duration}\`);
        }
        
        console.log(\`[TTS] Final audio duration: \${duration} seconds\`);
        
        // Write metadata cache`;

if (content.includes("throw new Error(\`Final TTS audio has invalid duration:")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched AI TTS duration logging successfully.");
} else {
    console.log("Target not found.");
}
