const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const validationFunction = `
export const validateTimestamps = (transcript, audioDuration, tolerance = 0.05, allowClamp = 1.5) => {
    if (!Array.isArray(transcript)) throw new Error("Transcript is not an array");
    let prevEnd = -1;
    for (let i = 0; i < transcript.length; i++) {
        const chunk = transcript[i];
        if (!Array.isArray(chunk.timestamp) || chunk.timestamp.length !== 2) {
            throw new Error(\`Invalid timestamp structure at chunk \${i}\`);
        }
        let [start, end] = chunk.timestamp;
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            throw new Error(\`Non-finite timestamp at chunk \${i}\`);
        }
        if (start < 0) {
            throw new Error(\`Negative start timestamp at chunk \${i}\`);
        }
        if (end <= start) {
            throw new Error(\`end <= start at chunk \${i}\`);
        }
        if (start > audioDuration) {
            throw new Error(\`start timestamp (\${start}) exceeds WAV duration (\${audioDuration}) at chunk \${i} (overshoot: \${start - audioDuration})\`);
        }
        if (i > 0 && start < prevEnd - tolerance) {
            throw new Error(\`Overlapping transcript timestamps at chunk \${i}: start \${start} < prevEnd \${prevEnd} - \${tolerance}\`);
        }
        if (end > audioDuration) {
            if (end - audioDuration <= allowClamp) {
                end = audioDuration;
                chunk.timestamp[1] = end;
            } else {
                throw new Error(\`end timestamp (\${end}) exceeds WAV duration (\${audioDuration}) at chunk \${i} by more than allowClamp (\${allowClamp})\`);
            }
        }
        prevEnd = end;
    }
    return transcript;
};
`;

if (!content.includes('export const validateTimestamps')) {
    // insert right after initModels
    content = content.replace(/export const initModels = async \(\) => \{\};/, "export const initModels = async () => {};\n" + validationFunction);
}

// Now replace transcribeWav body to use it.
const transcribeWavRegex = /export const transcribeWav = async \(wavPath, cachePath\) => \{[\s\S]*?return new Promise\(\(resolve, reject\) => \{/m;

const newTranscribeWavPrefix = `export const transcribeWav = async (wavPath, cachePath) => {
    if (cachePath && fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
        try {
            const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            const duration = await getDuration(wavPath);
            const validated = validateTimestamps(cachedData, duration);
            return validated;
        } catch(e) {
            console.warn(\`[Transcription] Cache rejected because timestamps exceed audio duration or are invalid: \${e.message}\`);
            try { fs.unlinkSync(cachePath); } catch (err) {}
        }
    }
    const pyPath = path.join(__dirname, 'transcribe.py');
    return new Promise((resolve, reject) => {`;

content = content.replace(transcribeWavRegex, newTranscribeWavPrefix);

const chunkValidationRegex = /let prevEnd = -1;\n\s*for \(let i = 0; i < res\.length; i\+\+\) \{[\s\S]*?res\[i\]\.timestamp\[1\] = end;\n\s*\}\n\s*\}\n\s*\}/m;

const newChunkValidation = `try {
                    validateTimestamps(res, duration);
                } catch(e) {
                    if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                    return reject(new Error(\`Pipeline Error: Transcription Stage Failed.\\nInput File: \${wavPath} (WAV audio)\\nUnderlying Error: \${e.message}\`));
                }`;

content = content.replace(chunkValidationRegex, newChunkValidation);

fs.writeFileSync(file, content);
console.log('Patched transcribeWav validation');
