import { generateNarrationTTS } from './src/ai/index.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function run() {
    const originalTranscript = [];
    const translatedTranscript = [];
    
    // 6 minutes = 360 seconds. Let's do 70 sentences, each 5 seconds.
    for (let i = 0; i < 70; i++) {
        const start = i * 5;
        const end = start + 4;
        originalTranscript.push({
            index: i,
            text: `This is test sentence number ${i}. The quick brown fox jumps over the lazy dog.`,
            timestamp: [start, end],
            is_dialogue: false
        });
        
        translatedTranscript.push({
            index: i,
            text: `This is test sentence number ${i}. The quick brown fox jumps over the lazy dog.`,
        });
    }

    const cachePath = path.join(process.cwd(), 'data', 'test_input', 'tts.wav');
    const cacheDir = path.dirname(cachePath);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    
    console.log("Running TTS Generation...");
    try {
        await generateNarrationTTS(translatedTranscript, cachePath, 'male-young-adult', originalTranscript);
        console.log("TTS Done. Generating video...");
        
        // Now create a 350-second video with this audio
        const videoPath = path.join(process.cwd(), 'data', 'test_input', 'input_video.mp4');
        const cmd = \`ffmpeg -y -f lavfi -i color=c=blue:s=1280x720:r=30 -i \${cachePath} -c:v libx264 -preset ultrafast -tune stillimage -c:a aac -b:a 128k -shortest \${videoPath}\`;
        console.log("Running ffmpeg:", cmd);
        execSync(cmd, { stdio: 'inherit' });
        
        console.log("Video generated successfully at", videoPath);
    } catch(e) {
        console.error(e);
    }
}
run();
