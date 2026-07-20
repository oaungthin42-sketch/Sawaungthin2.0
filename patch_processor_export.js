import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const target = `            // Escape path for FFmpeg subtitles filter: replace backslashes, escape colons
            const escapedSrtPath = path.resolve(state.srtFile).replace(/\\\\/g, '/').replace(/:/g, '\\\\:');
            
            const finalArgs = [
                '-f', 'concat',
                '-safe', '0',
                '-i', path.resolve(state.concatFile).replace(/\\\\/g, '/'),
                '-i', path.resolve(state.ttsAudioPath).replace(/\\\\/g, '/'),
                '-vf', \`subtitles=\${escapedSrtPath}:force_style='FontSize=16,Alignment=2,MarginV=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=1'\`,
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

const replacement = `            const finalArgs = [
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

if (content.includes("-vf', `subtitles=")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/workers/processor.js', content);
    console.log("Patched FFmpeg export to remove subtitles filter successfully.");
} else {
    console.log("Target not found.");
}
