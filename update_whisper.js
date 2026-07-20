import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

// Add timeout to transcribeWav
content = content.replace(
    "const child = spawn(pythonExec, args);",
    `const child = spawn(pythonExec, args);

            let timeoutTimer = setTimeout(() => {
                console.error('[AI] faster-whisper timed out after 600000ms.');
                child.kill('SIGKILL');
                reject(new Error('faster-whisper timed out after 600000ms.'));
            }, 600000);`
);

content = content.replace(
    "child.on('close', (code) => {",
    `child.on('close', (code) => {
                if (timeoutTimer) clearTimeout(timeoutTimer);`
);

content = content.replace(
    "child.on('error', (err) => {",
    `child.on('error', (err) => {
                if (timeoutTimer) clearTimeout(timeoutTimer);`
);

// Add timeout to TTS
content = content.replace(
    "const res = await ttsClient.call(chunkText);",
    `const callPromise = ttsClient.call(chunkText);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Edge TTS timeout")), 30000));
                    const res = await Promise.race([callPromise, timeoutPromise]);`
);

fs.writeFileSync('src/ai/index.js', content);
