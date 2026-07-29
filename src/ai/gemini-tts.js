import fs from 'fs';
import path from 'path';
import { runFFmpeg, getDuration } from '../ffmpeg/index.js';
import { getSetting } from '../services/settings.js';

export const generateNarrationTTS_Gemini = async (sceneNarration, cachePath, geminiVoiceName, geminiApiKey) => {
    try {
        console.log(`[AI] Starting Gemini TTS Generation (Voice: ${geminiVoiceName})`);
        const cacheMetaPath = cachePath + '.meta.json';
        
        const currentMeta = { voice: geminiVoiceName, provider: 'gemini', len: sceneNarration.length };
        if (fs.existsSync(cachePath) && fs.existsSync(cacheMetaPath)) {
            try {
                const existingMeta = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf8'));
                if (existingMeta.voice === currentMeta.voice && 
                    existingMeta.provider === currentMeta.provider && 
                    existingMeta.len === currentMeta.len) {
                    console.log("[AI] Reusing cached Gemini TTS audio.");
                    return cachePath;
                }
            } catch (e) { }
        }

        const cacheDir = path.dirname(cachePath);
        const ttsDir = path.join(cacheDir, 'tts_chunks_scene_gemini');
        if (!fs.existsSync(ttsDir)) {
            fs.mkdirSync(ttsDir, { recursive: true });
        }

        const mergedBlocks = [];
        let currentBlock = null;

        const dialogueVal = getSetting('DIALOGUE_MODE');
        const isDialogue = dialogueVal === 'true' || dialogueVal === '1' || dialogueVal === true;
        const maxGap = isDialogue ? 3.0 : 0.75;
        const maxDur = isDialogue ? 60 : 12;

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
                
                if (gap < maxGap && proposedDuration <= maxDur) {
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
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        
        let concurrencyLimit = 3;
        if (process.env.TTS_CONCURRENCY) {
            const parsed = parseInt(process.env.TTS_CONCURRENCY, 10);
            if (Number.isFinite(parsed) && parsed >= 1) {
                concurrencyLimit = Math.min(parsed, 20);
            }
        }

        for (let i = 0; i < mergedBlocks.length; i++) {
            const chunkFileName = `chunk_${String(i).padStart(4, '0')}.wav`;
            chunks.push(path.join(ttsDir, chunkFileName));
        }

        let currentIndex = 0;
        const processNext = async () => {
            while (currentIndex < mergedBlocks.length) {
                const bIdx = currentIndex++;
                const chunkText = mergedBlocks[bIdx].mergedText;
                if (!chunkText || typeof chunkText !== 'string' || chunkText.trim() === '') {
                    throw new Error(`Merged block ${bIdx} text is empty or invalid.`);
                }

                const chunkPath = chunks[bIdx];
                console.log(`[AI] Generating Gemini TTS chunk ${bIdx + 1} / ${mergedBlocks.length}...`);
                
                let success = false;
                let lastError = null;
                
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        let timeoutId;
                        try {
                            const timeoutPromise = new Promise((_, reject) => {
                                timeoutId = setTimeout(() => reject(new Error("Gemini TTS timeout")), 30000);
                            });
                            
                            const genAiCall = ai.models.generateContent({
                                model: 'gemini-2.5-flash-preview-tts',
                                contents: chunkText,
                                config: {
                                    responseModalities: ["AUDIO"],
                                    speechConfig: {
                                        voiceConfig: {
                                            prebuiltVoiceConfig: {
                                                voiceName: geminiVoiceName
                                            }
                                        }
                                    }
                                }
                            });
                            
                            const response = await Promise.race([genAiCall, timeoutPromise]);
                            const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                            if (audioData) {
                                const pcmBuffer = Buffer.from(audioData, 'base64');
                                const header = Buffer.alloc(44);
                                header.write('RIFF', 0);
                                header.writeUInt32LE(36 + pcmBuffer.length, 4);
                                header.write('WAVE', 8);
                                header.write('fmt ', 12);
                                header.writeUInt32LE(16, 16);
                                header.writeUInt16LE(1, 20);
                                header.writeUInt16LE(1, 22);
                                header.writeUInt32LE(24000, 24);
                                header.writeUInt32LE(24000 * 2, 28);
                                header.writeUInt16LE(2, 32);
                                header.writeUInt16LE(16, 34);
                                header.write('data', 36);
                                header.writeUInt32LE(pcmBuffer.length, 40);
                                
                                const wavBuffer = Buffer.concat([header, pcmBuffer]);
                                fs.writeFileSync(chunkPath, wavBuffer);
                            } else {
                                throw new Error("No audio data returned from Gemini API");
                            }

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
                        console.warn(`[AI] Gemini TTS attempt ${attempt} failed for block ${bIdx}:`, err);
                    }
                }

                if (!success) {
                    throw new Error(`Failed to generate Gemini TTS for block ${bIdx} after 3 attempts. Last error: ${lastError?.message}`);
                }
            }
        };

        const workers = [];
        for (let i = 0; i < Math.min(concurrencyLimit, mergedBlocks.length); i++) {
            workers.push(processNext());
        }
        await Promise.all(workers);

        const processedChunks = [];
        const authoritativeTimeline = [];
        let runningAudioTime = 0;
        
        for (let bIdx = 0; bIdx < mergedBlocks.length; bIdx++) {
            const rawChunk = chunks[bIdx];
            const block = mergedBlocks[bIdx];

            const standardizedPath = rawChunk + '_std.wav';
            await runFFmpeg(['-i', rawChunk, '-ar', '24000', '-ac', '1', '-acodec', 'pcm_s16le', '-y', standardizedPath], ttsDir);
            processedChunks.push(standardizedPath);

            let actualFinalDur = parseFloat(await getDuration(standardizedPath));
            if (!Number.isFinite(actualFinalDur) || actualFinalDur <= 0) {
                throw new Error(`Invalid FFprobe duration for ${standardizedPath}`);
            }

            const totalTextLength = block.scenes.reduce((sum, sIdx) => sum + sceneNarration[sIdx].narration_text.length, 0);
            let blockRunningTime = runningAudioTime;

            for (let i = 0; i < block.scenes.length; i++) {
                const sIdx = block.scenes[i];
                const sceneItem = sceneNarration[sIdx];
                const textLen = sceneItem.narration_text.length;
                
                let sceneDur = 0;
                
                if (totalTextLength > 0) {
                    sceneDur = (textLen / totalTextLength) * actualFinalDur;
                } else {
                    sceneDur = actualFinalDur / block.scenes.length;
                }
                
                if (i === block.scenes.length - 1) {
                    sceneDur = (actualFinalDur - (blockRunningTime - runningAudioTime));
                }

                if (sceneDur < 0) sceneDur = 0;

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
        }

        const concatListPath = path.join(ttsDir, 'concat.txt');
        let concatLines = processedChunks.map(c => `file '${path.basename(c)}'`).join('\n');

        if (processedChunks.length === 0) {
            console.warn("[WARNING] No audio chunks to concatenate. Generating 100ms silent audio...");
            const gapPath = path.join(ttsDir, 'gap_empty.wav');
            await runFFmpeg(['-f', 'lavfi', '-i', `anullsrc=r=24000:cl=mono`, '-t', '0.1', '-acodec', 'pcm_s16le', '-y', gapPath], ttsDir);
            concatLines = `file 'gap_empty.wav'`;
            processedChunks.push(gapPath);
        }

        fs.writeFileSync(concatListPath, concatLines);
        
        const args = [
            '-y', '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
            '-acodec', 'pcm_s16le', '-ac', '1', '-ar', '24000', cachePath
        ];
        
        await runFFmpeg(args, ttsDir);
        
        if (!fs.existsSync(cachePath) || fs.statSync(cachePath).size === 0) {
            throw new Error("Final TTS audio generation failed or is 0 bytes.");
        }
        
        const duration = await getDuration(cachePath);
        if (!Number.isFinite(duration) || duration <= 0) {
            throw new Error(`Final TTS audio has invalid duration: ${duration}`);
        }
        
        let numChunks = processedChunks.length;
        const absDiff = Math.abs(runningAudioTime - duration);
        let status = absDiff <= 0.05 ? 'PASS' : 'FAIL';
        
        if (numChunks === 0 && duration <= 0.15) {  
             status = 'PASS'; 
             runningAudioTime = duration;
        }

        console.log(`[FINAL-TIMELINE-VALIDATION]`);
        console.log(`timeline_duration: ${runningAudioTime.toFixed(3)}`);
        console.log(`final_audio_duration: ${duration.toFixed(3)}`);
        console.log(`absolute_difference: ${absDiff.toFixed(3)}`);
        console.log(`chunk_count: ${numChunks}`);
        console.log(`gap_count: 0`);
        console.log(`status: ${status}`);

        if (status === 'FAIL') {
            throw new Error(`Pipeline Error: Final TTS audio duration difference (${absDiff.toFixed(3)}s) exceeds 0.05s tolerance!`);
        }

        console.log(`[AI-DIAGNOSTIC] FINAL ASSEMBLY: Expected duration=${runningAudioTime.toFixed(2)}s | Actual duration=${duration}s | Audio chunks=${numChunks} | Silence gaps=0`);
        console.log(`[AI-TIMELINE-SUMMARY] chunks=${numChunks} | gaps=0 | authoritative_timeline_duration=${runningAudioTime.toFixed(3)}s`);
        
        fs.writeFileSync(cacheMetaPath, JSON.stringify(currentMeta));
        const authoritativeTimelinePath = cachePath + '.timeline.json';
        fs.writeFileSync(authoritativeTimelinePath, JSON.stringify(authoritativeTimeline, null, 2));
        
        try {
            if (fs.existsSync(ttsDir)) {
                fs.rmSync(ttsDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) { }
        
        return cachePath;
    } catch (err) {
        console.error("[AI] Error generating Gemini TTS:", err);
        const cacheDir = path.dirname(cachePath);
        const ttsDir = path.join(cacheDir, 'tts_chunks_scene_gemini');
        try {
            if (fs.existsSync(ttsDir)) {
                fs.rmSync(ttsDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) { }
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
        }
        throw err;
    }
};
