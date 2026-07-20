import fs from 'fs';

let content = fs.readFileSync('src/routes/api.js', 'utf8');

const target = `        const callPromise = ttsClient.call(previewText);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Edge TTS timeout")), 15000));
        const resAudio = await Promise.race([callPromise, timeoutPromise]);`;

const replacement = `        const callPromise = ttsClient.call(previewText);
        let timeoutId;
        let resAudio;
        try {
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("Edge TTS timeout")), 15000);
            });
            resAudio = await Promise.race([callPromise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutId);
        }`;

if (content.includes("new Promise((_, reject) => setTimeout(() => reject(new Error(\"Edge TTS timeout\")), 15000));")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/routes/api.js', content);
    console.log("Patched api.js timeout successfully.");
} else {
    console.log("Target not found in api.js");
}
