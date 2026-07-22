const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const oldCacheLogic = `export const transcribeWav = async (wavPath, cachePath) => {
    if (cachePath && fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
        return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    }`;

const newCacheLogic = `export const transcribeWav = async (wavPath, cachePath) => {
    if (cachePath && fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
        try {
            const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            const duration = await getDuration(wavPath);
            let isValid = true;
            for (const chunk of cachedData) {
                if (chunk.timestamp[0] > duration + 60) {
                    isValid = false;
                    break;
                }
            }
            if (isValid) {
                return cachedData;
            } else {
                console.warn(\`[Transcription] Cache rejected because timestamps exceed audio duration (duration: \${duration})\`);
                try { fs.unlinkSync(cachePath); } catch (e) {}
            }
        } catch(e) {
            console.error("Failed to parse or validate transcription cache:", e);
        }
    }`;

content = content.replace(oldCacheLogic, newCacheLogic);
fs.writeFileSync(file, content);
console.log('Patched cache logic');
