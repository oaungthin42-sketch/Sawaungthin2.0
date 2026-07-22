const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /import \{ EdgeTTS \} from 'node-edge-tts';/m;
const regex2 = /const tts = new EdgeTTS\(\{ voice \}\);[\s\S]*?await tts\.ttsPromise\(text, chunkPath\);/m;

const replacement = `const { spawn } = await import('child_process');
                    const ffmpegPath = (await import('ffmpeg-static')).default;
                    await new Promise((resolve) => {
                        const child = spawn(ffmpegPath, ['-f', 'lavfi', '-i', 'aevalsrc=sin(440*2*PI*t)*0.2:d=2', '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', chunkPath]);
                        child.on('close', resolve);
                    });`;

content = content.replace(regex2, replacement);
fs.writeFileSync(file, content);
console.log('Patched TTS generation to use synthetic audio for testing');
