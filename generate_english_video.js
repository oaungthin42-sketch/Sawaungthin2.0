import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';

const args = [
    '-y',
    '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:d=15',
    '-f', 'lavfi', '-i', 'aevalsrc=sin(440*2*PI*t)*0.2:d=15',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    'data/test_english.mp4'
];

const child = spawn(ffmpegPath, args);
child.on('close', async (code) => {
    if (code !== 0) {
        console.error('Failed to create video');
        process.exit(1);
    }
    
    // Now we need to create a video with speech
    // We can use macOS say if on mac, or espeak if on linux, but we are in a docker container.
    // Let's use node-edge-tts to generate a short english speech audio, then mix it.
    
    try {
        const { EdgeTTS } = await import('node-edge-tts');
        const tts = new EdgeTTS({ voice: 'en-US-AriaNeural' });
        await tts.ttsPromise('Hello world. This is a test video. We are testing the pipeline.', 'data/speech.mp3');
        
        const mixArgs = [
            '-y',
            '-i', 'data/test_english.mp4',
            '-i', 'data/speech.mp3',
            '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=longest[aout]',
            '-map', '0:v',
            '-map', '[aout]',
            '-c:v', 'copy',
            '-c:a', 'aac',
            'data/test_english_final.mp4'
        ];
        
        const mixChild = spawn(ffmpegPath, mixArgs);
        mixChild.on('close', (mixCode) => {
            if (mixCode === 0) {
                console.log('Test video created at data/test_english_final.mp4');
                fs.copyFileSync('data/test_english_final.mp4', 'data/test_10s.mp4');
            }
        });
    } catch(e) {
        console.error(e);
    }
});
