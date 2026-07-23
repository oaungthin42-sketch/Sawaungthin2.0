const fs = require('fs');
const file = 'src/workers/processor.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /let finalArgs = \[\];\s*if \(hasOrigAudio && fs\.existsSync\(bgAudioPath\)\) \{[\s\S]*?\} else \{[\s\S]*?console\.log\(\`\[AUDIO-MIX\] No original audio found\. Using TTS narration only\.\`\);[\s\S]*?finalArgs = \[[\s\S]*?\];\s*\}/;

const replacement = `let finalArgs = [];
            console.log(\`[AUDIO-MIX] Using TTS narration only (background audio skipped).\`);
            finalArgs = [
                '-f', 'concat',
                '-safe', '0',
                '-i', path.resolve(state.concatFile).replace(/\\\\/g, '/'),
                '-i', path.resolve(state.ttsAudioPath).replace(/\\\\/g, '/'),
                '-map', '0:v',
                '-map', '1:a',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-filter:a', 'loudnorm=I=-14:LRA=11:TP=-1.5',
                '-movflags', '+faststart',
                '-y', finalFileTmp
            ];`;

if (regex.test(content)) {
    console.log("Match found!");
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content);
} else {
    console.log("Match not found!");
}
