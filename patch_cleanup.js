import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const targetSuccess = `        // Cleanup temporary files
        for (const chunkPath of chunks) {
            fs.unlinkSync(chunkPath);
        }
        fs.unlinkSync(concatListPath);
        fs.rmdirSync(ttsDir);`;

const replacementSuccess = `        // Cleanup temporary files safely
        try {
            if (fs.existsSync(ttsDir)) {
                fs.rmSync(ttsDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) {
            console.warn(\`[AI] Warning: Failed to clean up TTS directory \${ttsDir}:\`, cleanupErr);
        }`;

const targetError = `        if (fs.existsSync(ttsDir)) {
            const files = fs.readdirSync(ttsDir);
            for (const f of files) {
                fs.unlinkSync(path.join(ttsDir, f));
            }
            fs.rmdirSync(ttsDir);
        }`;

const replacementError = `        try {
            if (fs.existsSync(ttsDir)) {
                fs.rmSync(ttsDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) {
            console.warn(\`[AI] Warning: Failed to clean up TTS directory on error \${ttsDir}:\`, cleanupErr);
        }`;

if (content.includes(targetSuccess) && content.includes(targetError)) {
    content = content.replace(targetSuccess, replacementSuccess);
    content = content.replace(targetError, replacementError);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched TTS cleanup successfully.");
} else {
    console.log("Targets not found.");
    if (!content.includes(targetSuccess)) console.log("Missing targetSuccess");
    if (!content.includes(targetError)) console.log("Missing targetError");
}
