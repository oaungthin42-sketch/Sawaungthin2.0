import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const target = `        const processedChunks = [];
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

const replacement = `        const processedChunks = [];
        
        // Pre-calculate all raw TTS durations
        const chunkDurs = [];
        for (let i = 0; i < chunks.length; i++) {
            chunkDurs.push(parseFloat(await getDuration(chunks[i])));
        }

        if (isDialogueStyle) {
            // Group dialogue chunks that are close together (LOCAL CONVERSATION GROUP)
            const groups = [];
            let currentGroup = [0];
            for (let i = 1; i < chunks.length; i++) {
                let gap = 0;
                if (originalTranscript[i] && originalTranscript[i-1] && originalTranscript[i].timestamp && originalTranscript[i-1].timestamp) {
                    gap = originalTranscript[i].timestamp[0] - originalTranscript[i-1].timestamp[1];
                }
                if (gap > 2.0) { // Gap > 2s breaks the group
                    groups.push(currentGroup);
                    currentGroup = [i];
                } else {
                    currentGroup.push(i);
                }
            }
            if (currentGroup.length > 0) groups.push(currentGroup);

            let prevEnd = 0;

            for (const group of groups) {
                const firstIdx = group[0];
                const lastIdx = group[group.length - 1];
                
                let groupOrigStart = originalTranscript[firstIdx] && originalTranscript[firstIdx].timestamp ? originalTranscript[firstIdx].timestamp[0] : 0;
                
                let nextGroupStart = groupOrigStart + 10; // Fallback
                if (lastIdx + 1 < originalTranscript.length && originalTranscript[lastIdx + 1] && originalTranscript[lastIdx + 1].timestamp) {
                    nextGroupStart = originalTranscript[lastIdx + 1].timestamp[0];
                } else if (originalTranscript[lastIdx] && originalTranscript[lastIdx].timestamp) {
                    nextGroupStart = originalTranscript[lastIdx].timestamp[1] + 2.0; // Assume 2 seconds margin after last chunk
                }
                let hardBoundaryEnd = nextGroupStart;
                
                let totalTTSDur = 0;
                let totalOrigGaps = 0;
                for (let k = 0; k < group.length; k++) {
                    totalTTSDur += chunkDurs[group[k]];
                    if (k < group.length - 1) {
                        let origGap = 0;
                        if (originalTranscript[group[k+1]] && originalTranscript[group[k]] && originalTranscript[group[k+1]].timestamp && originalTranscript[group[k]].timestamp) {
                            origGap = originalTranscript[group[k+1]].timestamp[0] - originalTranscript[group[k]].timestamp[1];
                        }
                        if (origGap > 0) totalOrigGaps += origGap;
                    }
                }
                
                let availableTime = hardBoundaryEnd - groupOrigStart;
                let speed = 1.0;
                let gapsScale = 1.0;
                
                if (totalTTSDur + totalOrigGaps > availableTime) {
                    let timeWithoutGaps = totalTTSDur;
                    if (timeWithoutGaps + totalOrigGaps * 0.3 <= availableTime) {
                        gapsScale = (availableTime - timeWithoutGaps) / totalOrigGaps;
                    } else {
                        gapsScale = 0.2; // Keep at least small pauses
                        let remainingForTTS = availableTime - (totalOrigGaps * gapsScale);
                        if (remainingForTTS < totalTTSDur && remainingForTTS > 0) {
                            speed = totalTTSDur / remainingForTTS;
                        }
                    }
                }
                
                if (speed > 1.35) speed = 1.35; // Controlled maximum tempo
                
                let currentTimelineTime = groupOrigStart;
                
                for (let k = 0; k < group.length; k++) {
                    const i = group[k];
                    let origStart = originalTranscript[i] && originalTranscript[i].timestamp ? originalTranscript[i].timestamp[0] : currentTimelineTime;
                    let origEnd = originalTranscript[i] && originalTranscript[i].timestamp ? originalTranscript[i].timestamp[1] : currentTimelineTime + chunkDurs[i];
                    let origDur = origEnd - origStart;
                    
                    // If we have extra room before the chunk, align to its original start
                    if (currentTimelineTime < origStart) {
                        currentTimelineTime = origStart;
                    }
                    
                    // But currentTimelineTime cannot be earlier than prevEnd (prevent voice overlap)
                    if (currentTimelineTime < prevEnd) {
                        currentTimelineTime = prevEnd;
                    }
                    
                    let gapBefore = currentTimelineTime - prevEnd;
                    if (gapBefore > 0.02) {
                        const gapPath = path.join(ttsDir, \`gap_\${i}.mp3\`);
                        await runFFmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', gapBefore.toFixed(3), '-y', gapPath], ttsDir);
                        processedChunks.push(gapPath);
                        prevEnd += gapBefore;
                    }
                    
                    let finalDur = chunkDurs[i];
                    let finalChunkPath = chunks[i];
                    
                    if (speed > 1.02) {
                        finalChunkPath = path.join(ttsDir, \`chunk_adj_\${String(i).padStart(4, '0')}.mp3\`);
                        await runFFmpeg(['-i', chunks[i], '-filter:a', \`atempo=\${speed.toFixed(3)}\`, '-y', finalChunkPath], ttsDir);
                        finalDur = chunkDurs[i] / speed;
                        console.log(\`[AI] Dialogue Group Chunk \${i} tempo adjusted by \${speed.toFixed(2)}x (Group Stable Speed)\`);
                    } else {
                        // Moderate per-chunk adjustment if only this chunk is long but the group is fine
                        if (finalDur > origDur + 0.1) {
                             let localSpeed = finalDur / origDur;
                             if (localSpeed > 1.25) localSpeed = 1.25;
                             if (localSpeed > 1.02) {
                                 finalChunkPath = path.join(ttsDir, \`chunk_adj_\${String(i).padStart(4, '0')}.mp3\`);
                                 await runFFmpeg(['-i', chunks[i], '-filter:a', \`atempo=\${localSpeed.toFixed(3)}\`, '-y', finalChunkPath], ttsDir);
                                 finalDur = chunkDurs[i] / localSpeed;
                                 console.log(\`[AI] Dialogue Local Chunk \${i} tempo adjusted by \${localSpeed.toFixed(2)}x\`);
                             }
                        }
                    }
                    
                    processedChunks.push(finalChunkPath);
                    prevEnd += finalDur;
                    
                    // Calculate next target time based on scaled natural gaps
                    if (k < group.length - 1) {
                        let nextOrigStart = originalTranscript[group[k+1]] && originalTranscript[group[k+1]].timestamp ? originalTranscript[group[k+1]].timestamp[0] : 0;
                        let origGap = nextOrigStart - origEnd;
                        if (origGap < 0) origGap = 0;
                        currentTimelineTime = prevEnd + (origGap * gapsScale);
                    }
                }
            }
        } else {
            // Narration style preserves original successful behavior
            for (let i = 0; i < chunks.length; i++) {
                const rawChunk = chunks[i];
                let chunkDur = chunkDurs[i];
                
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
                    console.log(\`[AI] Narration Chunk \${i} sped up by \${speed.toFixed(2)}x\`);
                    
                    await runFFmpeg(['-i', rawChunk, '-filter:a', \`atempo=\${speed}\`, '-y', adjustedPath], ttsDir);
                    processedChunks.push(adjustedPath);
                } else {
                    processedChunks.push(rawChunk);
                }
            }
        }`;

if (content.includes("accumulated_drift += delay;")) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Patched dialogue TTS synchronization logic successfully.");
} else {
    console.log("Target not found.");
}
