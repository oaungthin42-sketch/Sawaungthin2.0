const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /child\.on\('close', code => \{[\s\S]*?\}\);/m;
const replacement = `child.on('close', async (code) => {
            if (code !== 0) return reject(new Error(\`Transcribe failed: \${errStr}\`));
            try {
                const res = JSON.parse(out);
                const duration = await getDuration(wavPath);
                
                let prevEnd = -1;
                for (let i = 0; i < res.length; i++) {
                    const chunk = res[i];
                    if (!Array.isArray(chunk.timestamp) || chunk.timestamp.length !== 2) {
                        if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                        return reject(new Error(\`Pipeline Error: Invalid timestamp structure at chunk \${i}\`));
                    }
                    let [start, end] = chunk.timestamp;
                    if (!Number.isFinite(start) || !Number.isFinite(end)) {
                        if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                        return reject(new Error(\`Pipeline Error: Non-finite timestamp at chunk \${i}\`));
                    }
                    if (start < 0) {
                        if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                        return reject(new Error(\`Pipeline Error: Negative start timestamp at chunk \${i}\`));
                    }
                    if (end <= start) {
                        if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                        return reject(new Error(\`Pipeline Error: end <= start at chunk \${i}\`));
                    }
                    
                    if (start > duration) {
                        if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                        return reject(new Error(\`Pipeline Error: start timestamp (\${start}) exceeds WAV duration (\${duration}) at chunk \${i} (overshoot: \${start - duration})\`));
                    }
                    
                    if (end > duration) {
                        if (end - duration < 0.5) { // tiny overshoot, clamp it
                            end = duration;
                            chunk.timestamp[1] = end;
                        } else {
                            if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                            return reject(new Error(\`Pipeline Error: end timestamp (\${end}) wildly exceeds WAV duration (\${duration}) at chunk \${i} (overshoot: \${end - duration})\`));
                        }
                    }
                }

                if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(res));
                resolve(res);
            } catch(e) {
                if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                reject(new Error(e.message || 'Parse error from python'));
            }
        });`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched transcribeWav validation');
