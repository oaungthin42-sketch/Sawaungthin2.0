import fs from 'fs';

let content = fs.readFileSync('src/ffmpeg/index.js', 'utf8');
content = content.replace(
    "export const runFFmpeg = (args, cwd, onProgress) => {",
    "export const runFFmpeg = (args, cwd, onProgress, timeoutMs = 600000) => {"
);

content = content.replace(
    "const child = spawn(ffmpegPath, args, { cwd });",
    `const child = spawn(ffmpegPath, args, { cwd });
        
        let timeoutTimer = null;
        if (timeoutMs) {
            timeoutTimer = setTimeout(() => {
                console.error(\`[FFmpeg] Timeout reached (\${timeoutMs}ms), killing process...\`);
                child.kill('SIGKILL');
                reject(new Error(\`FFmpeg timed out after \${timeoutMs}ms.\`));
            }, timeoutMs);
        }`
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

fs.writeFileSync('src/ffmpeg/index.js', content);
