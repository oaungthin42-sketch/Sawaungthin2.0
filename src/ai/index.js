import axios from 'axios';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import { EdgeTTS } from 'node-edge-tts';
import ffprobePath from 'ffprobe-static';
import { getVoiceConfig } from './voices.js';
import { runFFmpeg, getDuration, getAudioDetails } from '../ffmpeg/index.js';
import { getSetting } from '../services/settings.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const computeSimilarity = async (text1, text2) => {
    return null;
};

export const initModels = async () => {};

export const validateTimestamps = (transcript, audioDuration, tolerance = 0.05, allowClamp = 1.5) => {
    if (!Array.isArray(transcript)) throw new Error("Transcript is not an array");
    let prevEnd = -1;
    for (let i = 0; i < transcript.length; i++) {
        const chunk = transcript[i];
        if (!Array.isArray(chunk.timestamp) || chunk.timestamp.length !== 2) {
            throw new Error(`Invalid timestamp structure at chunk ${i}`);
        }
        let [start, end] = chunk.timestamp;
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            throw new Error(`Non-finite timestamp at chunk ${i}`);
        }
        if (start < 0) {
            throw new Error(`Negative start timestamp at chunk ${i}`);
        }
        if (end <= start) {
            throw new Error(`end <= start at chunk ${i}`);
        }
        if (start > audioDuration) {
            throw new Error(`start timestamp (${start}) exceeds WAV duration (${audioDuration}) at chunk ${i} (overshoot: ${start - audioDuration})`);
        }
        if (i > 0 && start < prevEnd - tolerance) {
            throw new Error(`Overlapping transcript timestamps at chunk ${i}: start ${start} < prevEnd ${prevEnd} - ${tolerance}`);
        }
        if (end > audioDuration) {
            if (end - audioDuration <= allowClamp) {
                end = audioDuration;
                chunk.timestamp[1] = end;
            } else {
                throw new Error(`end timestamp (${end}) exceeds WAV duration (${audioDuration}) at chunk ${i} by more than allowClamp (${allowClamp})`);
            }
        }
        prevEnd = end;
    }
    return transcript;
};

export const transcribeWav = async (wavPath, cachePath) => {
    if (cachePath && fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
        try {
            const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            const duration = await getDuration(wavPath);
            const validated = validateTimestamps(cachedData, duration);
            return validated;
        } catch(e) {
            console.warn(`[Transcription] Cache rejected because timestamps exceed audio duration or are invalid: ${e.message}`);

            try { fs.unlinkSync(cachePath); } catch (err) {}
        }
    }
    
    return new Promise((resolve, reject) => {
        const pyScript = path.join(__dirname, 'transcribe.py');
        const pythonProcess = spawn('python3', [pyScript, wavPath]);

        let out = '';
        let errStr = '';
        
        pythonProcess.stdout.on('data', (data) => out += data.toString());
        pythonProcess.stderr.on('data', (data) => errStr += data.toString());
        
        pythonProcess.on('close', async (code) => {
            if (code !== 0) return reject(new Error(`Transcribe failed: ${errStr}`));
            try {
                const res = JSON.parse(out);
                const duration = await getDuration(wavPath);
                try {
                    validateTimestamps(res, duration);
                } catch(e) {
                    if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                    return reject(new Error(`Pipeline Error: Transcription Stage Failed.\nInput File: ${wavPath} (WAV audio)\nUnderlying Error: ${e.message}`));
                }
                if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(res));
                resolve(res);
            } catch(e) {
                if (cachePath && fs.existsSync(cachePath)) { fs.unlinkSync(cachePath); }
                reject(new Error(e.message || 'Parse error from python'));
            }
        });
    });
};


export const generateNarrationTTS = async (sceneNarration, cachePath, voiceId, originalTranscript, options = {}) => {
    try {
        console.log("[AI] Starting TTS Generation (Scene-based Continuous Audio)");
        const cacheMetaPath = cachePath + '.meta.json';
        const voiceConfig = getVoiceConfig(voiceId);
        const edgeVoice = voiceConfig.edgeVoice;
        const pitch = voiceConfig.pitch;
        const rate = voiceConfig.rate;

        const currentMeta = { voice: edgeVoice, pitch, rate, len: sceneNarration.length };
        if (fs.existsSync(cachePath) && fs.existsSync(cacheMetaPath)) {
            try {
                const existingMeta = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf8'));
                if (existingMeta.voice === currentMeta.voice && 
                    existingMeta.pitch === currentMeta.pitch && 
                    existingMeta.rate === currentMeta.rate && 
                    existingMeta.len === currentMeta.len) {
                    console.log("[AI] Reusing cached continuous TTS audio.");
                    return cachePath;
                }
            } catch (e) { }
        }

        const cacheDir = path.dirname(cachePath);
        const ttsDir = path.join(cacheDir, 'tts_chunks_scene');
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
        const ttsClient = new EdgeTTS({ voice: edgeVoice, pitch, rate, saveSubtitles: true });
        
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
                console.log(`[AI] Generating TTS chunk ${bIdx + 1} / ${mergedBlocks.length}...`);
                
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
                        console.warn(`[AI] TTS attempt ${attempt} failed for block ${bIdx}:`, err);
                    }
                }

                if (!success) {
                    throw new Error(`Failed to generate TTS for block ${bIdx} after 3 attempts. Last error: ${lastError?.message}`);
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
                throw new Error(`Failed to get duration for ${rawChunk}`);
            }

            const standardizedPath = path.join(ttsDir, `chunk_std_${String(bIdx).padStart(4, '0')}.wav`);
            
            // Log ffprobe -show_streams output (codec_name, sample_fmt) for the raw chunk BEFORE standardization
            try {
                const ffprobeCmd = `"${ffprobePath.path}" -v error -show_entries stream=codec_name,sample_fmt -of default=noprint_wrappers=1 "${rawChunk}"`;
                const ffprobeOut = execSync(ffprobeCmd).toString().trim();
                console.log(`[DEBUG-TTS] Raw chunk ${bIdx} ffprobe show_streams output:\n${ffprobeOut}`);
            } catch (probeErr) {
                console.error(`[DEBUG-TTS] Failed to run ffprobe on raw chunk ${bIdx}:`, probeErr);
            }

            const trimTailSec = 0.040; // 40ms tail safety trim
            const trimmedDur = Math.max(0.1, chunkDur - trimTailSec);
            const fadeInSec = 0.015; // 15ms fade-in
            const fadeOutSec = 0.030; // 30ms fade-out
            const fadeOutStart = Math.max(0, trimmedDur - fadeOutSec);

            // Audio filter chain: tail trim, reset pts, fade in, and fade out
            const filterStr = `atrim=end=${trimmedDur.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeInSec.toFixed(3)},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutSec.toFixed(3)}`;

            await runFFmpeg([
                '-f', 'mp3',
                '-i', rawChunk,
                '-af', filterStr,
                '-acodec', 'pcm_s16le',
                '-ar', '24000',
                '-ac', '1',
                '-y',
                standardizedPath
            ], ttsDir);
            processedChunks.push(standardizedPath);
            
            let actualFinalDur = chunkDur;
            try {
                let actualDur = parseFloat(await getDuration(standardizedPath));
                if (Number.isFinite(actualDur) && actualDur > 0) {
                    actualFinalDur = actualDur;
                } else {
                    throw new Error(`Invalid FFprobe duration for ${standardizedPath}`);
                }
            } catch(e) {
                throw new Error(`Timeline Error: Cannot determine actual duration for chunk ${bIdx}`);
            }

            // Precise boundary mapping via EdgeTTS subtitle timing (if available)
            const subFilePath = rawChunk + '.json';
            let charToTime = null;

            if (fs.existsSync(subFilePath)) {
                try {
                    const subData = JSON.parse(fs.readFileSync(subFilePath, 'utf8'));
                    charToTime = new Array(block.mergedText.length).fill(0);
                    let charCounter = 0;
                    for (const sub of subData) {
                        const partLen = sub.part.length;
                        const startSec = sub.start / 1000;
                        const endSec = sub.end / 1000;
                        for (let k = 0; k < partLen; k++) {
                            if (charCounter < charToTime.length) {
                                charToTime[charCounter] = startSec + (k / partLen) * (endSec - startSec);
                                charCounter++;
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[AI] Failed to parse subtitle timing for chunk ${bIdx}`);
                    charToTime = null;
                }
            }

            // Calculate start character indices for each scene in the block
            let sceneStartCharIndices = [];
            let currentCharIndex = 0;
            for (let i = 0; i < block.scenes.length; i++) {
                sceneStartCharIndices.push(currentCharIndex);
                currentCharIndex += sceneNarration[block.scenes[i]].narration_text.length;
                if (i < block.scenes.length - 1) {
                    currentCharIndex += 1; // space separator
                }
            }

            let blockRunningTime = runningAudioTime;
            const totalTextLength = block.scenes.reduce((sum, sIdx) => sum + sceneNarration[sIdx].narration_text.length, 0);

            for (let i = 0; i < block.scenes.length; i++) {
                const sIdx = block.scenes[i];
                const sceneItem = sceneNarration[sIdx];
                const textLen = sceneItem.narration_text.length;
                
                let sceneDur = 0;
                
                if (charToTime) {
                    const startIdx = sceneStartCharIndices[i];
                    const nextStartIdx = (i < block.scenes.length - 1) ? sceneStartCharIndices[i + 1] : block.mergedText.length;
                    
                    let startSec = charToTime[startIdx] || 0;
                    let nextStartSec = (i < block.scenes.length - 1) ? (charToTime[nextStartIdx] || 0) : actualFinalDur;
                    
                    // Force first scene to absorb leading silence, and last scene to absorb trailing silence
                    if (i === 0) startSec = 0;
                    
                    sceneDur = (i === block.scenes.length - 1) 
                        ? (actualFinalDur - (blockRunningTime - runningAudioTime)) 
                        : (nextStartSec - startSec);
                } else {
                    // Fallback to proportional
                    if (totalTextLength > 0) {
                        sceneDur = (textLen / totalTextLength) * actualFinalDur;
                    } else {
                        sceneDur = actualFinalDur / block.scenes.length;
                    }
                    if (i === block.scenes.length - 1) {
                        sceneDur = (actualFinalDur - (blockRunningTime - runningAudioTime));
                    }
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

        if (options && options.useVoiceClone === 1 && options.referenceVoiceId) {
            try {
                console.log(`[AI] Voice clone is active. Cloning ${processedChunks.length} chunks...`);
                const { applyVoiceClone } = await import('./voiceClone.js');
                const oldProcessedChunks = [...processedChunks];
                const clonedChunks = await applyVoiceClone(processedChunks, options.referenceVoiceId, { sourceMode: options.sourceMode ?? 'shared' });
                for (let i = 0; i < processedChunks.length; i++) {
                    if (clonedChunks[i] && clonedChunks[i] !== processedChunks[i]) {
                        processedChunks[i] = clonedChunks[i];
                    }
                }

                // POST-CLONE CORRECTION PASS
                console.log("[AI] Running post-clone timeline correction pass...");
                let currentStartTime = 0;
                for (let i = 0; i < processedChunks.length; i++) {
                    const blockSceneIndices = mergedBlocks[i].scenes;
                    const blockTimelineEntries = authoritativeTimeline.filter(entry => blockSceneIndices.includes(entry.chunk_index));
                    
                    let oldDur = 0;
                    for (const entry of blockTimelineEntries) {
                        oldDur += entry.final_dur;
                    }
                    
                    let newDur = oldDur;
                    if (processedChunks[i] !== oldProcessedChunks[i]) {
                        try {
                            const actualDur = parseFloat(await getDuration(processedChunks[i]));
                            if (Number.isFinite(actualDur) && actualDur > 0) {
                                newDur = actualDur;
                            }
                        } catch (e) {
                            console.warn(`[AI] Failed to get cloned duration for chunk ${i}:`, e);
                        }
                    }
                    
                    const ratio = oldDur > 0 ? newDur / oldDur : 1;
                    
                    for (const entry of blockTimelineEntries) {
                        const newSceneDur = entry.final_dur * ratio;
                        entry.final_audio_start = currentStartTime;
                        entry.final_audio_end = currentStartTime + newSceneDur;
                        entry.final_dur = newSceneDur;
                        currentStartTime += newSceneDur;
                    }
                }
                runningAudioTime = currentStartTime;
            } catch (cloneErr) {
                console.error("[AI] Error during voice cloning. Falling back to original TTS audio:", cloneErr);
            }
        }

        if (processedChunks.length === 0) {
            console.warn("[WARNING] No audio chunks to concatenate. Generating 100ms silent audio...");
            const gapPath = path.join(ttsDir, 'gap_empty.wav');
            await runFFmpeg(['-f', 'lavfi', '-i', `anullsrc=r=24000:cl=mono`, '-t', '0.1', '-acodec', 'pcm_s16le', '-y', gapPath], ttsDir);
            processedChunks.push(gapPath);
        }

        console.log(`[AI] Stripping WAV headers for seamless raw PCM concatenation of ${processedChunks.length} chunks...`);
        const rawPaths = [];
        for (let i = 0; i < processedChunks.length; i++) {
            const wavPath = processedChunks[i];
            const rawPath = wavPath + '.raw';
            await runFFmpeg([
                '-y',
                '-i', wavPath,
                '-f', 's16le',
                '-acodec', 'pcm_s16le',
                '-ar', '24000',
                '-ac', '1',
                rawPath
            ], ttsDir);
            rawPaths.push(rawPath);
        }

        console.log("[AI] Concatenating raw PCM files in Node.js...");
        const concatBuffer = [];
        for (const rawPath of rawPaths) {
            concatBuffer.push(fs.readFileSync(rawPath));
        }
        const mergedRawPath = path.join(ttsDir, 'merged.raw');
        fs.writeFileSync(mergedRawPath, Buffer.concat(concatBuffer));

        console.log("[AI] Re-encoding merged raw PCM into final standard WAV...");
        const args = [
            '-y',
            '-f', 's16le',
            '-ar', '24000',
            '-ac', '1',
            '-i', 'merged.raw',
            '-acodec', 'pcm_s16le',
            '-ar', '24000',
            '-ac', '1',
            cachePath
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
        let status = absDiff <= 0.15 ? 'PASS' : 'FAIL';
        
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
            throw new Error(`Pipeline Error: Final TTS audio duration difference (${absDiff.toFixed(3)}s) exceeds 0.15s tolerance!`);
        }

        console.log(`[AI-DIAGNOSTIC] FINAL ASSEMBLY: Expected duration=${runningAudioTime.toFixed(2)}s | Actual duration=${duration}s | Audio chunks=${numChunks} | Silence gaps=0`);
        console.log(`[AI-TIMELINE-SUMMARY] chunks=${numChunks} | gaps=0 | authoritative_timeline_duration=${runningAudioTime.toFixed(3)}s`);
        
        fs.writeFileSync(cacheMetaPath, JSON.stringify(currentMeta));
        const authoritativeTimelinePath = cachePath + '.timeline.json';
        fs.writeFileSync(authoritativeTimelinePath, JSON.stringify(authoritativeTimeline, null, 2));
        
        try {
            if (process.env.DEBUG_TTS === 'true') {
                console.log(`[DEBUG-TTS] Preserving ttsDir because DEBUG_TTS is true: ${ttsDir}`);
            } else if (fs.existsSync(ttsDir)) {
                fs.rmSync(ttsDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) { }
        
        return cachePath;

    } catch (err) {
        console.error("[AI] Error generating TTS:", err);
        const cacheDir = path.dirname(cachePath);
        const ttsDir = path.join(cacheDir, 'tts_chunks_scene');
        try {
            if (process.env.DEBUG_TTS === 'true') {
                console.log(`[DEBUG-TTS] Preserving ttsDir on error because DEBUG_TTS is true: ${ttsDir}`);
            } else if (fs.existsSync(ttsDir)) {
                fs.rmSync(ttsDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) { }
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
        }
        throw err;
    }
};

