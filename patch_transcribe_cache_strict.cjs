const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /const cachedData = JSON\.parse[\s\S]*?\} catch\(e\) \{/m;
const replacement = `const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            const duration = await getDuration(wavPath);
            let isValid = true;
            for (let i = 0; i < cachedData.length; i++) {
                const chunk = cachedData[i];
                if (!Array.isArray(chunk.timestamp) || chunk.timestamp.length !== 2) { isValid = false; break; }
                let [start, end] = chunk.timestamp;
                if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) { isValid = false; break; }
                if (start > duration) { isValid = false; break; }
                if (end > duration) {
                    if (end - duration < 0.5) {
                        cachedData[i].timestamp[1] = duration; // clamp
                    } else {
                        isValid = false; break;
                    }
                }
            }
            if (isValid) {
                return cachedData;
            } else {
                console.warn(\`[Transcription] Cache rejected because timestamps exceed audio duration or are invalid (duration: \${duration})\`);
                try { fs.unlinkSync(cachePath); } catch (e) {}
            }
        } catch(e) {`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched cache loading strict validation');
