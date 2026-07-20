import fs from 'fs';
import crypto from 'crypto';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

if (!content.includes("import crypto from 'crypto';")) {
    content = "import crypto from 'crypto';\n" + content;
}

const targetCache = `        const cacheDir = path.dirname(cachePath);
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

const replacementCache = `        const cacheDir = path.dirname(cachePath);
        const cacheMetaPath = cachePath + '.meta.json';
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

if (content.includes("const currentMeta = { length: translatedTranscript.length, voice: edgeVoice, pitch, rate, voiceId };")) {
    content = content.replace(targetCache, replacementCache);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched AI cache logic successfully.");
} else {
    console.log("Target not found.");
}
