import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `                        const callPromise = ttsClient.call(chunkText);
                        let timeoutId;
                        const timeoutPromise = new Promise((_, reject) => {
                            timeoutId = setTimeout(() => reject(new Error("Edge TTS timeout")), 30000);
                        });
                        const res = await Promise.race([callPromise, timeoutPromise]);
                        clearTimeout(timeoutId);`;

const replacement = `                        const callPromise = ttsClient.call(chunkText);
                        let timeoutId;
                        let res;
                        try {
                            const timeoutPromise = new Promise((_, reject) => {
                                timeoutId = setTimeout(() => reject(new Error("Edge TTS timeout")), 30000);
                            });
                            res = await Promise.race([callPromise, timeoutPromise]);
                        } finally {
                            clearTimeout(timeoutId);
                        }`;

if (content.includes("let timeoutId;")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched Edge TTS timeout finally successfully.");
} else {
    console.log("Target not found in ai/index.js");
}
