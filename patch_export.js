import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const targetArgs = `            const finalArgs = [
                '-f', 'concat',
                '-safe', '0',
                '-i', path.resolve(state.concatFile).replace(/\\\\/g, '/'),
                '-i', path.resolve(state.ttsAudioPath).replace(/\\\\/g, '/'),
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-threads', '6',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-pix_fmt', 'yuv420p',
                '-shortest',
                '-movflags', '+faststart',
                '-y', finalFileTmp
            ];`;

const replacementArgs = `            const finalArgs = [
                '-f', 'concat',
                '-safe', '0',
                '-i', path.resolve(state.concatFile).replace(/\\\\/g, '/'),
                '-i', path.resolve(state.ttsAudioPath).replace(/\\\\/g, '/'),
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '28',
                '-threads', '6',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-filter:a', 'loudnorm=I=-14:LRA=11:TP=-1.5',
                '-pix_fmt', 'yuv420p',
                '-shortest',
                '-movflags', '+faststart',
                '-y', finalFileTmp
            ];`;

// We use string replacement, handling backslashes is tricky, let's just do a regex replace for the exact args array or part of it.
