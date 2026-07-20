import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const t0 = "export const generateNarrationTTS = async (translatedTranscript, cachePath, voiceId = 'male-young-adult') => {";
const r0 = "export const generateNarrationTTS = async (translatedTranscript, cachePath, voiceId = 'male-young-adult', originalTranscript = null) => {";

content = content.replace(t0, r0);

const target = `        console.log(\`[TTS] Expected chunks: \${translatedTranscript.length}\`);
        console.log(\`[TTS] Successfully generated: \${validChunks}\`);
        console.log(\`[TTS] Missing chunks: \${missingChunks}\`);

        const concatListPath = path.join(ttsDir, 'concat.txt');
        const concatLines = chunks.map(c => \`file '\${path.basename(c)}'\`).join('\\n');
        fs.writeFileSync(concatListPath, concatLines);

        console.log(\`[AI] Concatenating \${chunks.length} TTS chunks to \${cachePath}...\`);
        
        const args = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-acodec', 'pcm_s16le',
            '-ac', '1',
            '-ar', '16000',
            cachePath
        ];
        
        await runFFmpeg(args, ttsDir);`;

const replacement = `        console.log(\`[TTS] Expected chunks: \${translatedTranscript.length}\`);
        console.log(\`[TTS] Successfully generated: \${validChunks}\`);
        console.log(\`[TTS] Missing chunks: \${missingChunks}\`);

        const processedChunks = [];
        for (let i = 0; i < chunks.length; i++) {
            const rawChunk = chunks[i];
            let chunkDur = await getDuration(rawChunk);
            
            let orig_start = 0;
            let orig_end = 0;
            let orig_dur = 0;
            let gap_before = 0;
            
            if (originalTranscript && originalTranscript[i] && originalTranscript[i].timestamp) {
                orig_start = originalTranscript[i].timestamp[0];
                orig_end = originalTranscript[i].timestamp[1];
                orig_dur = orig_end - orig_start;
                
                if (i === 0) {
                    gap_before = orig_start;
                } else if (originalTranscript[i-1] && originalTranscript[i-1].timestamp) {
                    gap_before = orig_start - originalTranscript[i-1].timestamp[1];
                }
            }
            
            if (gap_before > 0.05) {
                const gapPath = path.join(ttsDir, \`gap_\${i}.mp3\`);
                await runFFmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', gap_before.toString(), '-y', gapPath], ttsDir);
                processedChunks.push(gapPath);
            }
            
            if (orig_dur > 0 && chunkDur > orig_dur + 0.1) {
                let speed = chunkDur / orig_dur;
                if (speed > 1.8) speed = 1.8;
                
                const adjustedPath = path.join(ttsDir, \`chunk_adj_\${String(i).padStart(4, '0')}.mp3\`);
                console.log(\`[AI] Chunk \${i} is longer than original scene (\${chunkDur.toFixed(2)}s > \${orig_dur.toFixed(2)}s). Speeding up by \${speed.toFixed(2)}x\`);
                
                await runFFmpeg(['-i', rawChunk, '-filter:a', \`atempo=\${speed}\`, '-y', adjustedPath], ttsDir);
                processedChunks.push(adjustedPath);
            } else {
                processedChunks.push(rawChunk);
            }
        }

        const concatListPath = path.join(ttsDir, 'concat.txt');
        const concatLines = processedChunks.map(c => \`file '\${path.basename(c)}'\`).join('\\n');
        fs.writeFileSync(concatListPath, concatLines);

        console.log(\`[AI] Concatenating \${processedChunks.length} TTS chunks (including gaps) to \${cachePath}...\`);
        
        const args = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-acodec', 'pcm_s16le',
            '-ac', '1',
            '-ar', '16000',
            cachePath
        ];
        
        await runFFmpeg(args, ttsDir);`;

if (content.includes("console.log(`[TTS] Expected chunks:")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched TTS generation successfully.");
} else {
    console.log("Target not found.");
}
