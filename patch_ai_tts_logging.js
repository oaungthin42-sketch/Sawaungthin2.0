import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `        // Validate chunks before concat
        for (let i = 0; i < chunks.length; i++) {
            const chunkPath = chunks[i];
            if (!fs.existsSync(chunkPath)) {
                throw new Error(\`TTS concat failed: missing chunk \${chunkPath}\`);
            }
            if (fs.statSync(chunkPath).size === 0) {
                throw new Error(\`TTS concat failed: 0-byte chunk \${chunkPath}\`);
            }
        }`;

const replacement = `        // Validate chunks before concat
        let validChunks = 0;
        let missingChunks = 0;
        for (let i = 0; i < chunks.length; i++) {
            const chunkPath = chunks[i];
            if (!fs.existsSync(chunkPath)) {
                missingChunks++;
                throw new Error(\`TTS concat failed: missing chunk \${chunkPath}\`);
            } else if (fs.statSync(chunkPath).size === 0) {
                missingChunks++;
                throw new Error(\`TTS concat failed: 0-byte chunk \${chunkPath}\`);
            } else {
                validChunks++;
            }
        }
        
        console.log(\`[TTS] Expected chunks: \${translatedTranscript.length}\`);
        console.log(\`[TTS] Successfully generated: \${validChunks}\`);
        console.log(\`[TTS] Missing chunks: \${missingChunks}\`);`;

if (content.includes("for (let i = 0; i < chunks.length; i++) {")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched AI TTS chunk logging successfully.");
} else {
    console.log("Target not found.");
}
