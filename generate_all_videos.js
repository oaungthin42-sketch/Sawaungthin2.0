import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';

async function main() {
    const { EdgeTTS } = await import('node-edge-tts');
    const tts = new EdgeTTS({ voice: 'en-US-AriaNeural' });
    
    // Generate long speech
    const speechText = "Hello world. This is a test video. We are testing the pipeline. ".repeat(40); 
    // ^ about 40 sentences, should be maybe 2 minutes of speech
    await tts.ttsPromise(speechText, 'data/speech_long.mp3');

    const durations = [30, 60, 300];
    for (const d of durations) {
        console.log(`Generating ${d}s video...`);
        const vidArgs = [
            '-y',
            '-f', 'lavfi', '-i', `color=c=blue:s=1280x720:d=${d}`,
            '-i', 'data/speech_long.mp3',
            '-filter_complex', '[0:v]format=yuv420p[v];[1:a]aloop=loop=-1:size=2e+09[a]',
            '-map', '[v]',
            '-map', '[a]',
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-t', String(d),
            `data/test_${d}s.mp4`
        ];
        await new Promise((resolve) => {
            const child = spawn(ffmpegPath, vidArgs);
            child.on('close', (code) => {
                console.log(`${d}s video done with code ${code}`);
                resolve();
            });
        });
    }
}
main();
