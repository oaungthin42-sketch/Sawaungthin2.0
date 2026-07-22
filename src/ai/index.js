
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
    return 1.0;
};

export const initModels = async () => {};

export const transcribeOriginalVideoWithAssemblyAI = async (audioPath, cachePath, apiKey = null) => {
    throw new Error("AssemblyAI transcription is disabled. Use local whisper.");
};

export const transcribeWav = async (wavPath, cachePath) => {
    if (cachePath && fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
        return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    }
    const pyPath = path.join(__dirname, 'transcribe.py');
    return new Promise((resolve, reject) => {
        const child = spawn(fs.existsSync('/opt/venv/bin/python3') ? '/opt/venv/bin/python3' : 'python3', [pyPath, wavPath]);
        let out = '';
        let errStr = '';
        child.stdout.on('data', d => out += d);
        child.stderr.on('data', d => errStr += d);
        child.on('close', code => {
            if (code !== 0) return reject(new Error(`Transcribe failed: ${errStr}`));
            try {
                const res = JSON.parse(out);
                if (cachePath) fs.writeFileSync(cachePath, JSON.stringify(res));
                resolve(res);
            } catch(e) {
                reject(new Error('Parse error from python'));
            }
        });
    });
};

export const translateWithGemini = async (originalTranscript, cachePath, apiKey = null) => {
    try {
        const style = getSetting('TRANSLATION_STYLE') || 'default_recap';
        const naturalness = getSetting('BURMESE_NATURALNESS') || 'balanced';
        const fingerprint = crypto.createHash('md5').update(originalTranscript.map(o => o.text).join('|')).digest('hex');
        const metaPath = cachePath ? cachePath + '.meta.json' : null;
        const currentMeta = { length: originalTranscript.length, style, naturalness, fingerprint };
        if (cachePath && fs.existsSync(cachePath) && metaPath && fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                if (meta.length === currentMeta.length && meta.style === currentMeta.style && meta.naturalness === currentMeta.naturalness && meta.fingerprint === currentMeta.fingerprint) {
                    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                    if (Array.isArray(data) && data.length === originalTranscript.length) {
                        let valid = true;
                        for (let i = 0; i < data.length; i++) {
                            if (!data[i] || !data[i].text || typeof data[i].text !== 'string' || data[i].text.trim() === '' || !Array.isArray(data[i].timestamp) || data[i].timestamp.length !== 2) {
                                valid = false;
                                break;
                            }
                        }
                        if (valid) {
                            console.log(`[AI] Loaded translated transcript from cache: ${cachePath}`);
                            return data;
                        }
                    }
                }
                console.warn("[AI] Translated transcript cache invalid (settings changed or corrupted), translating again...");
            } catch(e) {
                console.warn("[AI] Translated transcript cache parse error, translating again...");
            }
        }
        
        console.log(`[AI] Starting Gemini translation for ${originalTranscript.length} chunks...`);
        const activeApiKey = apiKey || (getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY);
        if (!activeApiKey) {
            throw new Error("GEMINI_API_KEY environment variable is missing.");
        }
        const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
        const endpoint = apiKey === "bypass" ? `http://localhost:3001` : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeApiKey}`;
        
        const translatedTranscript = new Array(originalTranscript.length);
        const batchSize = 30; // Translate in batches
        const systemInstruction = getTranslationSystemInstruction(style, naturalness);
        
        for (let i = 0; i < originalTranscript.length; i += batchSize) {
            const batch = originalTranscript.slice(i, i + batchSize);
            const batchInput = batch.map((item, idx) => ({
                index: i + idx,
                original_text: item.text,
                duration: item.timestamp[1] - item.timestamp[0]
            }));
            
            const payload = {
                contents: [{
                    role: "user",
                    parts: [{ text: JSON.stringify(batchInput) }]
                }],
                systemInstruction: {
                    role: "system",
                    parts: [{ text: systemInstruction }]
                },
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.1
                }
            };
            let lastError = null;
            let success = false;
            
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: AbortSignal.timeout(60000)
                    });
                    if (!response.ok) {
                        const errorText = await response.text();
                        const status = response.status;
                        if (status === 429) {
                            let isDailyQuota = errorText.includes('GenerateRequestsPerDayPerProject');
                            const retryMatch = errorText.match(/retry in ([0-9.]+)s/);
                            if (retryMatch && parseFloat(retryMatch[1]) > 3600) {
                                isDailyQuota = true;
                            }
                            if (errorText.includes('Quota exceeded') && (errorText.includes('limit: 1500') || errorText.includes('limit: 50') || errorText.includes('limit: 0'))) {
                                isDailyQuota = true;
                            }
                            if (isDailyQuota) {
                                throw new Error(`Gemini API permanent error (${status}): Gemini API daily quota has been exceeded.`);
                            } else {
                                throw new Error(`Gemini API temporary error (${status}): ${errorText}`);
                            }
                        } else if (status >= 500 || status === 408) {
                            throw new Error(`Gemini API temporary error (${status}): ${errorText}`);
                        }
                        throw new Error(`Gemini API permanent error (${status}): ${errorText}`);
                    }
                    const data = await response.json();
                    
                    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0].text) {
                        throw new Error("Gemini API returned an empty or malformed response structure.");
                    }
                    const responseText = data.candidates[0].content.parts[0].text;
                    let parsedData;
                    try {
                        let cleanText = responseText.trim();
                        if (cleanText.startsWith('```json')) {
                            cleanText = cleanText.substring(7);
                        } else if (cleanText.startsWith('```')) {
                            cleanText = cleanText.substring(3);
                        }
                        if (cleanText.endsWith('```')) {
                            cleanText = cleanText.substring(0, cleanText.length - 3);
                        }
                        parsedData = JSON.parse(cleanText.trim());
                    } catch (err) {
                        throw new Error("Failed to parse Gemini JSON output: " + err.message);
                    }
                    if (!Array.isArray(parsedData)) {
                        throw new Error("Gemini API did not return a JSON array.");
                    }
                    if (parsedData.length !== batch.length) {
                        throw new Error(`Gemini API returned ${parsedData.length} chunks, expected ${batch.length}.`);
                    }
                    // Map translations back
                    const tempBatch = [];
                    for (let j = 0; j < batch.length; j++) {
                        const expectedIndex = i + j;
                        const translatedItem = parsedData.find(item => item.index === expectedIndex);
                        
                        if (!translatedItem) {
                            throw new Error(`Gemini API response is missing index ${expectedIndex}.`);
                        }
                        
                        if (typeof translatedItem.text !== 'string' || translatedItem.text.trim() === '') {
                            throw new Error(`Gemini API returned empty or invalid text for index ${expectedIndex}.`);
                        }
                        if (translatedTranscript[expectedIndex]) {
                            throw new Error(`Duplicate processing detected for index ${expectedIndex}.`);
                        }
                        tempBatch[j] = {
                            timestamp: originalTranscript[expectedIndex].timestamp,
                            text: translatedItem.text.trim()
                        };
                    }
                    
                    for (let j = 0; j < batch.length; j++) {
                        translatedTranscript[i + j] = tempBatch[j];
                    }
                    
                    success = true;
                    break;
                } catch (err) {
                    console.warn(`[AI] Gemini translation attempt ${attempt} failed: ${err.message.replace(/key=[A-Za-z0-9_\-]+/gi, 'key=HIDDEN')}`);
                    lastError = err;
                    
                    if (err.message.includes("permanent error")) {
                        break;
                    }
                    
                    if (attempt < 3) {
                        let backoff = Math.pow(2, attempt) * 1000;
                        if (lastError && lastError.message.includes('retry in')) {
                            const match = lastError.message.match(/retry in ([0-9.]+)s/);
                            if (match) {
                                const recommended = parseFloat(match[1]) * 1000;
                                if (recommended > backoff && recommended < 120000) {
                                    backoff = recommended + 1500;
                                }
                            }
                        }
                        console.log(`[AI] Retrying Gemini in ${Math.round(backoff)}ms...`);
                        await new Promise(r => setTimeout(r, backoff));
                    }
                }
            }
            
            if (!success) {
                if (lastError && lastError.message.includes('Gemini API daily quota has been exceeded')) {
                    throw new Error('Gemini API daily quota has been exceeded. Please try again after the quota resets or use a billing-enabled Gemini API project.');
                }
                throw new Error(`Gemini translation failed after retries for batch ${Math.floor(i / batchSize) + 1}. Last error: ${lastError?.message}`);
            }
        }
        
        if (translatedTranscript.length !== originalTranscript.length) {
            throw new Error(`Translated transcript length (${translatedTranscript.length}) does not match original (${originalTranscript.length}).`);
        }
        
        if (cachePath) {
            fs.writeFileSync(cachePath, JSON.stringify(translatedTranscript));
            fs.writeFileSync(metaPath, JSON.stringify(currentMeta));
            console.log(`[AI] Saved translated transcript to cache: ${cachePath}`);
        }
        
        return translatedTranscript;
    } catch (err) {
        console.error("[AI] Error translating with Gemini:", err);
        throw err;
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
        
        const concurrencyLimit = 3;
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
            if (orig_dur > 0 && chunkDur > orig_dur + 0.1) {
                let speed = chunkDur / orig_dur;
                if (speed > 1.8) speed = 1.8;
                const adjustedPath = path.join(ttsDir, `chunk_adj_${String(i).padStart(4, '0')}.wav`);
                await runFFmpeg(['-i', rawChunk, '-filter:a', `atempo=${speed}`, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', adjustedPath], ttsDir);
                processedChunks.push(adjustedPath);
                actualFinalDur = chunkDur / speed;
            } else {
                processedChunks.push(rawChunk);
            }
            
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
            runningAudioTime += actualGapBefore + actualFinalDur;
        }

        const concatListPath = path.join(ttsDir, 'concat.txt');
        const concatLines = processedChunks.map(c => `file '${path.basename(c)}'`).join('\n');
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
        const status = absDiff <= 0.05 ? 'PASS' : 'FAIL';
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

