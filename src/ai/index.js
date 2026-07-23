import axios from 'axios';

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { EdgeTTS } from 'node-edge-tts';
import { getVoiceConfig } from './voices.js';
import { getTranslationSystemInstruction } from './translation.js';
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


export const translateWithGemini = async (originalTranscript, cachePath, apiKey = null) => {
    if (!originalTranscript || originalTranscript.length === 0) return [];
    
    if (cachePath && fs.existsSync(cachePath)) {
        try {
            const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (cachedData.length === originalTranscript.length) {
                return cachedData;
            }
        } catch(e) {}
    }

    if (!apiKey) {
        throw new Error("Gemini API key is required for translation.");
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const style = getSetting('TRANSLATION_STYLE') || 'balanced';
    const naturalness = getSetting('BURMESE_NATURALNESS') || 'balanced';
    const systemInstructionText = getTranslationSystemInstruction(style, naturalness);

    const inputPayload = originalTranscript.map((t, i) => ({
        index: i,
        text: t.text
    }));

    const maxRetries = 3;
    let attempt = 0;
    let delay = 1000;
    
    while (attempt < maxRetries) {
        attempt++;
        try {
            const response = await axios.post(url, {
                system_instruction: {
                    parts: [{ text: systemInstructionText }]
                },
                contents: [{
                    role: "user",
                    parts: [{ text: JSON.stringify(inputPayload) }]
                }],
                generationConfig: {
                    response_mime_type: "application/json",
                    temperature: 0.2
                }
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
            });

            const textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textResponse) throw new Error("Empty response from Gemini.");

            let parsed;
            try {
                parsed = JSON.parse(textResponse);
            } catch (e) {
                throw new Error("Invalid JSON response from Gemini.");
            }

            if (!Array.isArray(parsed)) throw new Error("Gemini response is not an array.");
            if (parsed.length !== originalTranscript.length) {
                throw new Error(`Gemini response length (${parsed.length}) does not match input length (${originalTranscript.length}).`);
            }

            const result = [];
            for (let i = 0; i < originalTranscript.length; i++) {
                const item = parsed.find(p => p.index === i);
                if (!item || typeof item.text !== 'string') {
                    throw new Error(`Missing or invalid translation for chunk ${i}.`);
                }
                result.push({
                    timestamp: originalTranscript[i].timestamp,
                    text: item.text
                });
            }

            if (cachePath) {
                fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
            }
            return result;

        } catch (err) {
            let errorMsg = err.message;
            if (err.response && err.response.status === 404) {
                errorMsg = `Model '${modelName}' not found or unsupported (HTTP 404). Please configure a valid GEMINI_MODEL.`;
            }
            console.error(`[AI] Gemini translation attempt ${attempt} failed: ${errorMsg}`);
            
            const isTransient = !err.response || err.response.status >= 500 || err.response.status === 429 || err.code === 'ECONNABORTED';
            if (attempt === maxRetries || !isTransient || (err.response && err.response.status === 404)) {
                throw new Error(`Gemini translation failed. ${errorMsg}`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
};

export const generateNarrationTTS = async (translatedTranscript, cachePath, voiceId = 'male-young-adult', originalTranscript = null) => {
    const voiceConfig = getVoiceConfig(voiceId);
    const edgeVoice = voiceConfig.edgeVoice;
    const pitch = voiceConfig.pitch;
    const rate = voiceConfig.rate;
    try {
        const cacheDir = path.dirname(cachePath);
        const cacheMetaPath = cachePath + '.meta.json';
        const fingerprint = crypto.createHash('md5').update(translatedTranscript.map(o => o.text).join('|')).digest('hex');
        const currentMeta = { length: translatedTranscript.length, voice: edgeVoice, pitch, rate, voiceId, fingerprint };
        
        if (fs.existsSync(cachePath) && fs.existsSync(cacheMetaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf8'));
                if (meta.length === currentMeta.length && meta.voice === currentMeta.voice && meta.pitch === currentMeta.pitch && meta.rate === currentMeta.rate && meta.fingerprint === currentMeta.fingerprint && fs.statSync(cachePath).size > 0) {
                    console.log(`[AI] Loaded TTS audio from cache: ${cachePath}`);
                    return cachePath;
                }
            } catch(e) {}
        }
        const ttsDir = path.join(cacheDir, 'tts_chunks');
        if (!fs.existsSync(ttsDir)) {
            fs.mkdirSync(ttsDir, { recursive: true });
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
        for (let i = 0; i < translatedTranscript.length; i++) {
            const chunkFileName = `chunk_${String(i).padStart(4, '0')}.wav`;
            chunks.push(path.join(ttsDir, chunkFileName));
        }
        let currentIndex = 0;
        const processNext = async () => {
            while (currentIndex < translatedTranscript.length) {
                const i = currentIndex++;
                const chunkText = translatedTranscript[i].text;
                if (!chunkText || typeof chunkText !== 'string' || chunkText.trim() === '') {
                    throw new Error(`Translated transcript chunk ${i} is empty or invalid.`);
                }
                const chunkPath = chunks[i];
                console.log(`[AI] Generating TTS chunk ${i + 1} / ${translatedTranscript.length}...`);
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
                        console.warn(`[AI] TTS attempt ${attempt} failed for chunk ${i}: ${err.message}`);
                    }
                }
                if (!success) {
                    throw new Error(`Failed to generate TTS for chunk ${i} after 3 attempts. Last error: ${lastError?.message}`);
                }
            }
        };

        const workers = [];
        for (let i = 0; i < Math.min(concurrencyLimit, translatedTranscript.length); i++) {
            workers.push(processNext());
        }
        await Promise.all(workers);

        // Build Authoritative Timeline
        const processedChunks = [];
        const authoritativeTimeline = [];
        let runningAudioTime = 0;
        
        for (let i = 0; i < chunks.length; i++) {
            const rawChunk = chunks[i];
            let orig_start = 0;
            let orig_end = 0;
            if (originalTranscript && originalTranscript[i]) {
                orig_start = originalTranscript[i].timestamp[0];
                orig_end = originalTranscript[i].timestamp[1] || orig_start;
            }
            if (!Number.isFinite(orig_start)) orig_start = 0;
            if (!Number.isFinite(orig_end)) orig_end = orig_start;
            let orig_dur = orig_end - orig_start;
            if (orig_dur < 0) orig_dur = 0;

            let chunkDur = 0;
            try {
                chunkDur = parseFloat(await getDuration(rawChunk));
            } catch(e) {
                throw new Error(`Failed to get duration for ${rawChunk}`);
            }
            
            let actualGapBefore = 0;
            if (runningAudioTime < orig_start) {
                const mathGap = orig_start - runningAudioTime;
                if (mathGap > 0.05) {
                    const gapPath = path.join(ttsDir, `gap_${String(i).padStart(4, '0')}.wav`);
                    await runFFmpeg(['-f', 'lavfi', '-i', `anullsrc=r=24000:cl=mono`, '-t', mathGap.toFixed(3), '-acodec', 'pcm_s16le', '-y', gapPath], ttsDir);
                    processedChunks.push(gapPath);
                    try {
                        actualGapBefore = parseFloat(await getDuration(gapPath));
                    } catch(e) {
                        throw new Error(`Timeline Error: Cannot determine actual gap duration before chunk ${i}`);
                    }
                }
            }
            
            let actualFinalDur = chunkDur;
            
                const standardizedPath = path.join(ttsDir, `chunk_std_${String(i).padStart(4, '0')}.wav`);
                await runFFmpeg(['-i', rawChunk, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', standardizedPath], ttsDir);
                processedChunks.push(standardizedPath);
                actualFinalDur = chunkDur;
            
            let finalChunkPath = processedChunks[processedChunks.length - 1];
            try {
                let actualDur = parseFloat(await getDuration(finalChunkPath));
                if (Number.isFinite(actualDur) && actualDur > 0) {
                    actualFinalDur = actualDur;
                } else {
                    throw new Error(`Invalid FFprobe duration for ${finalChunkPath}`);
                }
            } catch(e) {
                throw new Error(`Timeline Error: Cannot determine actual duration for chunk ${i}`);
            }
            
            let adjusted_orig_end = orig_end;
            let adjusted_orig_dur = orig_dur;
            // If the audio is shorter than the video, the video should play at normal speed.
            // The remaining original video time becomes a gap.
            if (orig_dur > 0 && actualFinalDur < orig_dur) {
                adjusted_orig_dur = actualFinalDur;
                adjusted_orig_end = orig_start + adjusted_orig_dur;
            }

            authoritativeTimeline.push({
                chunk_index: i,
                orig_start: orig_start,
                orig_end: adjusted_orig_end,
                orig_dur: adjusted_orig_dur,
                final_audio_start: runningAudioTime + actualGapBefore,
                final_audio_end: runningAudioTime + actualGapBefore + actualFinalDur,
                final_dur: actualFinalDur,
                text: translatedTranscript[i] ? translatedTranscript[i].text : ""
            });
            runningAudioTime += actualGapBefore + actualFinalDur;
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
        
        let numChunks = processedChunks.filter(p => !path.basename(p).startsWith('gap_')).length;
        let numGaps = processedChunks.filter(p => path.basename(p).startsWith('gap_')).length;

        const absDiff = Math.abs(runningAudioTime - duration);
        let status = absDiff <= 0.05 ? 'PASS' : 'FAIL';
        if (numChunks === 0 && duration <= 0.15) {
             status = 'PASS'; // Empty transcript special case
             runningAudioTime = duration;
        }
        console.log(`[FINAL-TIMELINE-VALIDATION]`);
        console.log(`timeline_duration: ${runningAudioTime.toFixed(3)}`);
        console.log(`final_audio_duration: ${duration.toFixed(3)}`);
        console.log(`absolute_difference: ${absDiff.toFixed(3)}`);
        console.log(`chunk_count: ${numChunks}`);
        console.log(`gap_count: ${numGaps}`);
        console.log(`status: ${status}`);

        if (status === 'FAIL') {
            throw new Error(`Pipeline Error: Final TTS audio duration difference (${absDiff.toFixed(3)}s) exceeds 0.05s tolerance!`);
        }

        console.log(`[AI-DIAGNOSTIC] FINAL ASSEMBLY: Expected duration=${runningAudioTime.toFixed(2)}s | Actual duration=${duration}s | Audio chunks=${numChunks} | Silence gaps=${numGaps}`);
        console.log(`[AI-TIMELINE-SUMMARY] chunks=${numChunks} | gaps=${numGaps} | authoritative_timeline_duration=${runningAudioTime.toFixed(3)}s`);
        
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
        console.error("[AI] Error generating TTS:", err);
        const cacheDir = path.dirname(cachePath);
        const ttsDir = path.join(cacheDir, 'tts_chunks');
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

