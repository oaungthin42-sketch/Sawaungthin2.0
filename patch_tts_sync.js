import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `        const processedChunks = [];
        for (let i = 0; i < chunks.length; i++) {
            const rawChunk = chunks[i];
            let chunkDur = parseFloat(await getDuration(rawChunk));
            
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
        }`;

const replacement = `        let isDialogueStyle = false;
        if (originalTranscript && originalTranscript.length > 3) {
            let shortChunks = 0;
            let totalGaps = 0;
            for (let i = 0; i < originalTranscript.length; i++) {
                let chunk = originalTranscript[i];
                if (chunk.timestamp) {
                    let dur = chunk.timestamp[1] - chunk.timestamp[0];
                    if (dur < 4.0) shortChunks++;
                    if (i > 0 && originalTranscript[i-1].timestamp) {
                        let gap = chunk.timestamp[0] - originalTranscript[i-1].timestamp[1];
                        if (gap > 0.1) totalGaps++;
                    }
                }
            }
            if (shortChunks / originalTranscript.length > 0.5 || totalGaps > originalTranscript.length * 0.3) {
                isDialogueStyle = true;
            }
        }
        console.log(\`[TTS] Video Style Detected: \${isDialogueStyle ? 'Dialogue' : 'Narration'}\`);

        const processedChunks = [];
        let accumulated_drift = 0;

        for (let i = 0; i < chunks.length; i++) {
            const rawChunk = chunks[i];
            let chunkDur = parseFloat(await getDuration(rawChunk));
            
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
            
            if (isDialogueStyle) {
                let effective_gap = gap_before - accumulated_drift;
                if (effective_gap < 0) effective_gap = 0;
                accumulated_drift = Math.max(0, accumulated_drift - gap_before);
                gap_before = effective_gap;
            }
            
            if (gap_before > 0.05) {
                const gapPath = path.join(ttsDir, \`gap_\${i}.mp3\`);
                await runFFmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', gap_before.toString(), '-y', gapPath], ttsDir);
                processedChunks.push(gapPath);
            }
            
            if (isDialogueStyle) {
                let finalChunkDur = chunkDur;
                if (orig_dur > 0) {
                    let gap_after = 0;
                    if (originalTranscript && originalTranscript[i+1] && originalTranscript[i+1].timestamp) {
                         gap_after = originalTranscript[i+1].timestamp[0] - orig_end;
                    }
                    if (gap_after < 0) gap_after = 0;
                    
                    let available_time = orig_dur + gap_after - accumulated_drift;
                    if (available_time < orig_dur) available_time = orig_dur;
                    
                    let speed = 1.0;
                    if (chunkDur > available_time + 0.1) {
                         speed = chunkDur / available_time;
                    }
                    if (speed > 1.25) speed = 1.25;
                    
                    if (speed > 1.02) {
                        const adjustedPath = path.join(ttsDir, \`chunk_adj_\${String(i).padStart(4, '0')}.mp3\`);
                        console.log(\`[AI] Dialogue Chunk \${i} tempo adjusted by \${speed.toFixed(2)}x (Target: \${available_time.toFixed(2)}s)\`);
                        await runFFmpeg(['-i', rawChunk, '-filter:a', \`atempo=\${speed}\`, '-y', adjustedPath], ttsDir);
                        processedChunks.push(adjustedPath);
                        finalChunkDur = chunkDur / speed;
                    } else {
                        processedChunks.push(rawChunk);
                    }
                    
                    let delay = finalChunkDur - orig_dur;
                    accumulated_drift += delay;
                } else {
                    processedChunks.push(rawChunk);
                    accumulated_drift += chunkDur;
                }
            } else {
                // Narration style preserves original successful behavior
                if (orig_dur > 0 && chunkDur > orig_dur + 0.1) {
                    let speed = chunkDur / orig_dur;
                    if (speed > 1.8) speed = 1.8;
                    
                    const adjustedPath = path.join(ttsDir, \`chunk_adj_\${String(i).padStart(4, '0')}.mp3\`);
                    console.log(\`[AI] Narration Chunk \${i} sped up by \${speed.toFixed(2)}x\`);
                    
                    await runFFmpeg(['-i', rawChunk, '-filter:a', \`atempo=\${speed}\`, '-y', adjustedPath], ttsDir);
                    processedChunks.push(adjustedPath);
                } else {
                    processedChunks.push(rawChunk);
                }
            }
        }`;

if (content.includes("const processedChunks = [];")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched dialogue TTS synchronization logic successfully.");
} else {
    console.log("Target not found.");
}
