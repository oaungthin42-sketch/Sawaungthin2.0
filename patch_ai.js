import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `                        const callPromise = ttsClient.call(chunkText);
                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Edge TTS timeout")), 30000));
                        const res = await Promise.race([callPromise, timeoutPromise]);`;

const replacement = `                        const callPromise = ttsClient.call(chunkText);
                        let timeoutId;
                        const timeoutPromise = new Promise((_, reject) => {
                            timeoutId = setTimeout(() => reject(new Error("Edge TTS timeout")), 30000);
                        });
                        const res = await Promise.race([callPromise, timeoutPromise]);
                        clearTimeout(timeoutId);`;

if (content.includes("const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(\"Edge TTS timeout\")), 30000));")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched Edge TTS timeout successfully.");
} else {
    console.log("Target not found in ai/index.js");
}
