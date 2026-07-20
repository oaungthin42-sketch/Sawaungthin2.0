import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const target = `            const metaPath = path.join(cacheDir, 'tts_transcript_meta.json');
            let cacheValid = false;
            if (fs.existsSync(metaPath) && fs.existsSync(audTranscriptCache)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.size === stats.size && meta.duration === duration) {
                        cacheValid = true;
                    }
                } catch(e) {}
            }
            if (!cacheValid && fs.existsSync(audTranscriptCache)) {
                fs.unlinkSync(audTranscriptCache);
            }`;

const replacement = `            const voiceId = getSetting('EDGE_TTS_VOICE') || 'male-young-adult';
            const metaPath = path.join(cacheDir, 'tts_transcript_meta.json');
            let cacheValid = false;
            if (fs.existsSync(metaPath) && fs.existsSync(audTranscriptCache)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.size === stats.size && meta.duration === duration && meta.voiceId === voiceId) {
                        cacheValid = true;
                    }
                } catch(e) {}
            }
            if (!cacheValid && fs.existsSync(audTranscriptCache)) {
                fs.unlinkSync(audTranscriptCache);
            }`;

if (content.includes("const metaPath = path.join(cacheDir, 'tts_transcript_meta.json');")) {
    content = content.replace(target, replacement);
    
    // Also patch the save
    const saveTarget = `            fs.writeFileSync(metaPath, JSON.stringify({ size: stats.size, duration: duration }));`;
    const saveReplacement = `            fs.writeFileSync(metaPath, JSON.stringify({ size: stats.size, duration: duration, voiceId: voiceId }));`;
    content = content.replace(saveTarget, saveReplacement);
    
    fs.writeFileSync('src/workers/processor.js', content);
    console.log("Patched processor Whisper cache successfully.");
} else {
    console.log("Target not found.");
}
