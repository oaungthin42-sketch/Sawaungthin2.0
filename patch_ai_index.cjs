const fs = require('fs');
let content = fs.readFileSync('src/ai/index.js', 'utf8');

const regex = /const chunks = \[\];\s*const ttsClient = new EdgeTTS\(\{ voice: edgeVoice, pitch, rate \}\);[\s\S]*?runningAudioTime \+= actualFinalDur;\s*\}/;

const replacement = `const mergedBlocks = [];
        let currentBlock = null;

        for (let i = 0; i < sceneNarration.length; i++) {
            const scene = sceneNarration[i];
            
            if (!currentBlock) {
                currentBlock = {
                    scenes: [i],
                    mergedText: scene.narration_text,
                    orig_start: scene.scene_start,
                    orig_end: scene.scene_end
                };
            } else {
                const gap = scene.scene_start - currentBlock.orig_end;
                const proposedDuration = scene.scene_end - currentBlock.orig_start;
                
                if (gap < 0.75 && proposedDuration <= 12) {
                    currentBlock.scenes.push(i);
                    currentBlock.mergedText += " " + scene.narration_text;
                    currentBlock.orig_end = scene.scene_end;
                } else {
                    mergedBlocks.push(currentBlock);
                    currentBlock = {
                        scenes: [i],
                        mergedText: scene.narration_text,
                        orig_start: scene.scene_start,
                        orig_end: scene.scene_end
                    };
                }
            }
        }
        if (currentBlock) {
            mergedBlocks.push(currentBlock);
        }

        const chunks = [];
        const ttsClient = new EdgeTTS({ voice: edgeVoice, pitch, rate });
        
        let concurrencyLimit = 3;
        if (process.env.TTS_CONCURRENCY) {
            const parsed = parseInt(process.env.TTS_CONCURRENCY, 10);
            if (Number.isFinite(parsed) && parsed >= 1) {
                concurrencyLimit = Math.min(parsed, 20);
            }
        }

        for (let i = 0; i < mergedBlocks.length; i++) {
            const chunkFileName = \`chunk_\${String(i).padStart(4, '0')}.wav\`;
            chunks.push(path.join(ttsDir, chunkFileName));
        }

        let currentIndex = 0;
        const processNext = async () => {
            while (currentIndex < mergedBlocks.length) {
                const bIdx = currentIndex++;
                const chunkText = mergedBlocks[bIdx].mergedText;
                if (!chunkText || typeof chunkText !== 'string' || chunkText.trim() === '') {
                    throw new Error(\`Merged block \${bIdx} text is empty or invalid.\`);
                }

                const chunkPath = chunks[bIdx];
                console.log(\`[AI] Generating TTS chunk \${bIdx + 1} / \${mergedBlocks.length}...\`);
                
                let success = false;
                let lastError = null;
                
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        let timeoutId;
                        try {
                            const timeoutPromise = new Promise((_, reject) => {
                                timeoutId = setTimeout(() => reject(new Error("Edge TTS timeout")), 30000);
                            });
                            await Promise.race([ttsClient.ttsPromise(chunkText, chunkPath), timeoutPromise]);
                        } finally {
                            if (timeoutId) clearTimeout(timeoutId);
                        }
                        
                        if (fs.existsSync(chunkPath) && fs.statSync(chunkPath).size > 0) {
                            success = true;
                            break;
                        } else {
                            throw new Error("TTS generated empty file");
                        }
                    } catch (err) {
                        lastError = err;
                        console.warn(\`[AI] TTS attempt \${attempt} failed for block \${bIdx}:\`, err);
                    }
                }

                if (!success) {
                    throw new Error(\`Failed to generate TTS for block \${bIdx} after 3 attempts. Last error: \${lastError?.message}\`);
                }
            }
        };

        const workers = [];
        for (let i = 0; i < Math.min(concurrencyLimit, mergedBlocks.length); i++) {
            workers.push(processNext());
        }
        await Promise.all(workers);

        // Build Authoritative Timeline (Continuous)
        const processedChunks = [];
        const authoritativeTimeline = [];
        let runningAudioTime = 0;
        
        for (let bIdx = 0; bIdx < mergedBlocks.length; bIdx++) {
            const rawChunk = chunks[bIdx];
            const block = mergedBlocks[bIdx];

            let chunkDur = 0;
            try {
                chunkDur = parseFloat(await getDuration(rawChunk));
            } catch(e) {
                throw new Error(\`Failed to get duration for \${rawChunk}\`);
            }

            const standardizedPath = path.join(ttsDir, \`chunk_std_\${String(bIdx).padStart(4, '0')}.wav\`);
            await runFFmpeg(['-i', rawChunk, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', standardizedPath], ttsDir);
            processedChunks.push(standardizedPath);
            
            let actualFinalDur = chunkDur;
            try {
                let actualDur = parseFloat(await getDuration(standardizedPath));
                if (Number.isFinite(actualDur) && actualDur > 0) {
                    actualFinalDur = actualDur;
                } else {
                    throw new Error(\`Invalid FFprobe duration for \${standardizedPath}\`);
                }
            } catch(e) {
                throw new Error(\`Timeline Error: Cannot determine actual duration for chunk \${bIdx}\`);
            }

            // Distribute actualFinalDur among block.scenes proportionally by text length
            const totalTextLength = block.scenes.reduce((sum, sIdx) => sum + sceneNarration[sIdx].narration_text.length, 0);
            
            let blockRunningTime = runningAudioTime;
            
            for (let i = 0; i < block.scenes.length; i++) {
                const sIdx = block.scenes[i];
                const sceneItem = sceneNarration[sIdx];
                const textLen = sceneItem.narration_text.length;
                
                // Proportion of this scene in the block
                let sceneDur = 0;
                if (totalTextLength > 0) {
                    sceneDur = (textLen / totalTextLength) * actualFinalDur;
                } else {
                    sceneDur = actualFinalDur / block.scenes.length;
                }
                
                // If it's the last scene in the block, ensure no rounding gaps
                if (i === block.scenes.length - 1) {
                    sceneDur = (runningAudioTime + actualFinalDur) - blockRunningTime;
                }

                let orig_start = sceneItem.scene_start;
                let orig_end = sceneItem.scene_end;
                let orig_dur = orig_end - orig_start;
                if (orig_dur < 0) orig_dur = 0;

                authoritativeTimeline.push({
                    chunk_index: sIdx,
                    orig_start: orig_start,
                    orig_end: orig_end,
                    orig_dur: orig_dur,
                    final_audio_start: blockRunningTime,
                    final_audio_end: blockRunningTime + sceneDur,
                    final_dur: sceneDur,
                    text: sceneItem.narration_text
                });

                blockRunningTime += sceneDur;
            }

            runningAudioTime += actualFinalDur;
        }`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/ai/index.js', content, 'utf8');
console.log('patched ai index');
