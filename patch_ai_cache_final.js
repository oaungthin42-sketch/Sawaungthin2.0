import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `        const cacheDir = path.dirname(cachePath);
        const cacheMetaPath = cachePath + '.meta.json';
        const currentMeta = { length: translatedTranscript.length, voice: edgeVoice, pitch, rate, voiceId };

        if (fs.existsSync(cachePath) && fs.existsSync(cacheMetaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf8'));
                if (meta.length === currentMeta.length && meta.voice === currentMeta.voice && meta.pitch === currentMeta.pitch && meta.rate === currentMeta.rate && fs.statSync(cachePath).size > 0) {
                    console.log(\`[AI] Loaded TTS audio from cache: \${cachePath}\`);
                    return cachePath;
                }
            } catch(e) {}
        }`;

const replacement = `        const cacheDir = path.dirname(cachePath);
        const cacheMetaPath = cachePath + '.meta.json';
        
        // Include text contents in a hash to catch script edits
        const textHash = crypto.createHash('md5').update(JSON.stringify(translatedTranscript.map(t => t.text))).digest('hex');
        const currentMeta = { textHash, length: translatedTranscript.length, voice: edgeVoice, pitch, rate, voiceId };

        if (fs.existsSync(cachePath) && fs.existsSync(cacheMetaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf8'));
                if (meta.textHash === currentMeta.textHash && meta.length === currentMeta.length && meta.voice === currentMeta.voice && meta.pitch === currentMeta.pitch && meta.rate === currentMeta.rate && meta.voiceId === currentMeta.voiceId && fs.statSync(cachePath).size > 0) {
                    console.log(\`[AI] Loaded TTS audio from cache: \${cachePath}\`);
                    return cachePath;
                }
            } catch(e) {}
        }`;

if (content.includes("if (meta.length === currentMeta.length && meta.voice === currentMeta.voice")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched AI index.js with FULL cache validation successfully.");
} else {
    console.log("Target not found.");
}
