const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /export const validateTimestamps = \([\s\S]*?export const translateWithGemini/m;

const replacement = `export const validateTimestamps = (transcript, audioDuration, tolerance = 0.05, allowClamp = 1.5) => {
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

export const transcribeWav = async (wavPath, cachePath) => {
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
    return new Promise((resolve, reject) => {
        const pyExec = fs.existsSync('/opt/venv/bin/python3') ? '/opt/venv/bin/python3' : 'python3';
        const child = spawn(pyExec, [pyPath, wavPath, cachePath || '']);
        let out = '';
        let errStr = '';
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => errStr += d);
        child.on('close', async (code) => {
            if (code !== 0) return reject(new Error(\`Transcribe failed: \${errStr}\`));
            try {
                const res = JSON.parse(out);
                const duration = await getDuration(wavPath);
                try {
                    validateTimestamps(res, duration);
                } catch(e) {
                    if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                    return reject(new Error(\`Pipeline Error: Transcription Stage Failed.\\nInput File: \${wavPath} (WAV audio)\\nUnderlying Error: \${e.message}\`));
                }
                if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(res));
                resolve(res);
            } catch(e) {
                if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                reject(new Error(e.message || 'Parse error from python'));
            }
        });
    });
};

export const translateWithGemini`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Fixed ai/index.js');
