import fs from 'fs';

let content = fs.readFileSync('src/ai/index.js', 'utf8');

const searchPoint1 = `        const processedChunks = [];
        
        // Pre-calculate all raw TTS durations`;

const replacePoint1 = `        const processedChunks = [];
        const authoritativeTimeline = [];
        let runningAudioTime = 0;
        
        // Pre-calculate all raw TTS durations`;

const searchPoint2 = `                    processedChunks.push(finalChunkPath);
                    prevEnd += finalDur;
                    
                    // Calculate next target time based on scaled natural gaps`;

const replacePoint2 = `                    processedChunks.push(finalChunkPath);
                    
                    authoritativeTimeline.push({
                        chunk_index: i,
                        orig_start: origStart,
                        orig_end: origEnd,
                        orig_dur: origDur,
                        final_audio_start: runningAudioTime + gapBefore,
                        final_audio_end: runningAudioTime + gapBefore + finalDur,
                        final_dur: finalDur,
                        text: translatedTranscript[i] ? translatedTranscript[i].text : ""
                    });
                    
                    runningAudioTime += gapBefore + finalDur;
                    
                    prevEnd += finalDur;
                    
                    // Calculate next target time based on scaled natural gaps`;

const searchPoint3 = `            // Narration style preserves original successful behavior
            for (let i = 0; i < chunks.length; i++) {
                const rawChunk = chunks[i];`;

const replacePoint3 = `            // Narration style preserves original successful behavior
            for (let i = 0; i < chunks.length; i++) {
                const rawChunk = chunks[i];
                let actualGapBefore = 0;
                let actualFinalDur = chunkDurs[i];`;

const searchPoint4 = `                if (gap_before > 0.05) {
                    const gapPath = path.join(ttsDir, \`gap_\${i}.mp3\`);
                    await runFFmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', gap_before.toString(), '-y', gapPath], ttsDir);
                    processedChunks.push(gapPath);
                }`;

const replacePoint4 = `                if (gap_before > 0.05) {
                    actualGapBefore = gap_before;
                    const gapPath = path.join(ttsDir, \`gap_\${i}.mp3\`);
                    await runFFmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', gap_before.toString(), '-y', gapPath], ttsDir);
                    processedChunks.push(gapPath);
                }`;

const searchPoint5 = `                if (orig_dur > 0 && chunkDur > orig_dur + 0.1) {
                    let speed = chunkDur / orig_dur;
                    if (speed > 1.8) speed = 1.8;
                    
                    const adjustedPath = path.join(ttsDir, \`chunk_adj_\${String(i).padStart(4, '0')}.mp3\`);
                    console.log(\`[AI] Narration Chunk \${i} sped up by \${speed.toFixed(2)}x\`);
                    
                    await runFFmpeg(['-i', rawChunk, '-filter:a', \`atempo=\${speed}\`, '-y', adjustedPath], ttsDir);
                    processedChunks.push(adjustedPath);
                } else {
                    processedChunks.push(rawChunk);
                }`;

const replacePoint5 = `                if (orig_dur > 0 && chunkDur > orig_dur + 0.1) {
                    let speed = chunkDur / orig_dur;
                    if (speed > 1.8) speed = 1.8;
                    
                    const adjustedPath = path.join(ttsDir, \`chunk_adj_\${String(i).padStart(4, '0')}.mp3\`);
                    console.log(\`[AI] Narration Chunk \${i} sped up by \${speed.toFixed(2)}x\`);
                    
                    await runFFmpeg(['-i', rawChunk, '-filter:a', \`atempo=\${speed}\`, '-y', adjustedPath], ttsDir);
                    processedChunks.push(adjustedPath);
                    actualFinalDur = chunkDur / speed;
                } else {
                    processedChunks.push(rawChunk);
                }
                
                authoritativeTimeline.push({
                    chunk_index: i,
                    orig_start: orig_start,
                    orig_end: orig_end,
                    orig_dur: orig_dur,
                    final_audio_start: runningAudioTime + actualGapBefore,
                    final_audio_end: runningAudioTime + actualGapBefore + actualFinalDur,
                    final_dur: actualFinalDur,
                    text: translatedTranscript[i] ? translatedTranscript[i].text : ""
                });
                
                runningAudioTime += actualGapBefore + actualFinalDur;`;

const searchPoint6 = `        // Write metadata cache
        fs.writeFileSync(cacheMetaPath, JSON.stringify(currentMeta));`;

const replacePoint6 = `        // Write metadata cache
        fs.writeFileSync(cacheMetaPath, JSON.stringify(currentMeta));
        
        // Write authoritative timeline
        const authoritativeTimelinePath = cachePath + '.timeline.json';
        fs.writeFileSync(authoritativeTimelinePath, JSON.stringify(authoritativeTimeline, null, 2));`;


if (content.includes(searchPoint1)) {
    content = content.replace(searchPoint1, replacePoint1);
    content = content.replace(searchPoint2, replacePoint2);
    content = content.replace(searchPoint3, replacePoint3);
    content = content.replace(searchPoint4, replacePoint4);
    content = content.replace(searchPoint5, replacePoint5);
    content = content.replace(searchPoint6, replacePoint6);
    fs.writeFileSync('src/ai/index.js', content);
    console.log("Timeline export patched successfully.");
} else {
    console.log("Could not find search points in src/ai/index.js");
}

