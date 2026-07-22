const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/ai/index.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /const concatLines = processedChunks\.map\(c => \`file '\$\{path\.basename\(c\)\}'\`\)\.join\('\\n'\);\n\s*fs\.writeFileSync\(concatListPath, concatLines\);/m;

const replacement = `let concatLines = processedChunks.map(c => \`file '\$\{path.basename(c)}'\`).join('\\n');
        if (processedChunks.length === 0) {
            console.warn("[WARNING] No audio chunks to concatenate. Generating 100ms silent audio...");
            const gapPath = path.join(ttsDir, 'gap_empty.wav');
            await runFFmpeg(['-f', 'lavfi', '-i', \`anullsrc=r=24000:cl=mono\`, '-t', '0.1', '-acodec', 'pcm_s16le', '-y', gapPath], ttsDir);
            concatLines = \`file 'gap_empty.wav'\`;
            processedChunks.push(gapPath);
        }
        fs.writeFileSync(concatListPath, concatLines);`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
console.log('Patched timeline generator to handle 0 chunks safely');
