import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

// In generateNarrationTTS
const ttsConcatString = `
        console.log(\`[AI] Concatenating \${chunks.length} TTS chunks to \${cachePath}...\`);
        
        const args = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c', 'copy',
            cachePath
        ];
        
        await new Promise((resolve, reject) => {
            const child = spawn(ffmpegPath, args);
            let stderr = '';
            child.stderr.on('data', d => stderr += d.toString());
            child.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(\`TTS concat failed: \${stderr}\`));
            });
        });
`;

const ttsConcatClean = ttsConcatString + `
        // Clean up chunks right after successful concat to save disk space
        try {
            if (fs.existsSync(ttsDir)) {
                fs.rmSync(ttsDir, { recursive: true, force: true });
            }
        } catch(e) {
            console.warn("[AI] Failed to clean up tts_chunks:", e.message);
        }
`;

content = content.replace(ttsConcatString, ttsConcatClean);
fs.writeFileSync('src/ai/index.js', content);
