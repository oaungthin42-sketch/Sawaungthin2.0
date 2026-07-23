const fs = require('fs');
const file = 'src/ai/index.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /if \(orig_dur > 0 && chunkDur > orig_dur \+ 0\.1\) \{[\s\S]*?let speed = chunkDur \/ orig_dur;[\s\S]*?if \(speed > 1\.8\) speed = 1\.8;[\s\S]*?const adjustedPath = path\.join\(ttsDir, \`chunk_adj_\$\{String\(i\)\.padStart\(4, '0'\)\}\.wav\`\);[\s\S]*?await runFFmpeg\(\['-i', rawChunk, '-filter:a', \`atempo=\$\{speed\}\`, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', adjustedPath\], ttsDir\);[\s\S]*?processedChunks\.push\(adjustedPath\);[\s\S]*?actualFinalDur = chunkDur \/ speed;[\s\S]*?\} else \{([\s\S]*?const standardizedPath = path\.join\(ttsDir, \`chunk_std_\$\{String\(i\)\.padStart\(4, '0'\)\}\.wav\`\);[\s\S]*?await runFFmpeg\(\['-i', rawChunk, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', standardizedPath\], ttsDir\);[\s\S]*?processedChunks\.push\(standardizedPath\);[\s\S]*?actualFinalDur = chunkDur;)[\s\S]*?\}/;

if (regex.test(content)) {
    console.log("Match found!");
    // Replace the entire if/else block with just the contents of the else block.
    content = content.replace(regex, `$1`);
    fs.writeFileSync(file, content);
} else {
    console.log("Match not found!");
}
