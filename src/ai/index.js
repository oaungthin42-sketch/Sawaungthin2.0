import crypto from 'crypto';
import { EdgeTTS } from '@seepine/edge-tts';
import fs from 'fs';
import { spawn, execSync } from 'child_process';
import path from 'path';
import { getSetting } from '../services/settings.js';
import { getVoiceConfig } from './voices.js';


import { runFFmpeg, getDuration, getAudioDetails } from '../ffmpeg/index.js';

// Clean words for similarity
const tokenize = (text) => {
    if (!text) return [];
    return text.toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .split(/\s+/)
        .filter(w => w.length > 0);
};

// Compute high-quality offline text similarity using a hybrid Cosine-Jaccard algorithm
export const computeSimilarity = async (text1, text2) => {
    try {
        const tokens1 = tokenize(text1);
        const tokens2 = tokenize(text2);
        
        if (tokens1.length === 0 || tokens2.length === 0) return 0;
        
        // Term frequency maps
        const freq1 = {};
        const freq2 = {};
        const allWords = new Set();
        
        for (const token of tokens1) {
            freq1[token] = (freq1[token] || 0) + 1;
            allWords.add(token);
        }
        
        for (const token of tokens2) {
            freq2[token] = (freq2[token] || 0) + 1;
            allWords.add(token);
        }
        
        // Calculate Cosine Similarity
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (const token of allWords) {
            const v1 = freq1[token] || 0;
            const v2 = freq2[token] || 0;
            dotProduct += v1 * v2;
            norm1 += v1 * v1;
            norm2 += v2 * v2;
        }
        
        if (norm1 === 0 || norm2 === 0) return 0;
        
        const cosineSim = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
        
        // Calculate Jaccard Similarity
        const set1 = new Set(tokens1);
        const set2 = new Set(tokens2);
        let intersection = 0;
        for (const token of set1) {
            if (set2.has(token)) intersection++;
        }
        const union = set1.size + set2.size - intersection;
        const jaccardSim = union > 0 ? intersection / union : 0;
        
        // Hybrid similarity: 70% Cosine (Term Frequency) + 30% Jaccard (Word Overlap)
        const finalScore = (0.7 * cosineSim) + (0.3 * jaccardSim);
        return finalScore;
    } catch (error) {
        console.error('[AI] Error computing similarity:', error);
        return 0;
    }
};

const isValidPython = (execPath) => {
    try {
        if (!fs.existsSync(execPath)) return false;
        // Test if the python binary actually runs successfully without Exec format error
        execSync(`"${execPath}" -c "import sys"`, { stdio: 'ignore', timeout: 1000 });
        return true;
    } catch (e) {
        return false;
    }
};

let cachedPythonExec = null;

const getPythonExec = () => {
    if (cachedPythonExec) {
        return cachedPythonExec;
    }

    // In production Railway environment, /opt/venv/bin/python3 is guaranteed to be present and valid
    if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
        if (fs.existsSync('/opt/venv/bin/python3')) {
            console.log('[AI] Using production virtualenv executable: /opt/venv/bin/python3');
            cachedPythonExec = '/opt/venv/bin/python3';
            return cachedPythonExec;
        }
    }

    // Check if we are in AI Studio Workspace / local environment with our newly created venv
    if (fs.existsSync('/venv/bin/python')) {
        console.log('[AI] Using workspace virtualenv executable: /venv/bin/python');
        cachedPythonExec = '/venv/bin/python';
        return cachedPythonExec;
    }

    const candidates = [
        '/opt/venv/bin/python3',
        '/opt/venv/bin/python',
        path.join(process.cwd(), 'venv', 'bin', 'python3'),
        path.join(process.cwd(), 'venv', 'bin', 'python'),
        path.join(process.cwd(), 'venv', 'Scripts', 'python.exe'),
        'python3',
        'python'
    ];

    for (const candidate of candidates) {
        // For 'python3' and 'python', they are global system commands, so we check if they are in PATH and work
        if (candidate === 'python3' || candidate === 'python') {
            try {
                execSync(`"${candidate}" -c "import sys"`, { stdio: 'ignore', timeout: 1000 });
                console.log(`[AI] Found valid global executable: ${candidate}`);
                cachedPythonExec = candidate;
                return cachedPythonExec;
            } catch (e) {
                continue;
            }
        }
        
        if (isValidPython(candidate)) {
            console.log(`[AI] Found valid virtualenv executable: ${candidate}`);
            cachedPythonExec = candidate;
            return cachedPythonExec;
        }
    }

    console.warn('[AI] No validated python executable found in venv paths. Falling back to "python3".');
    cachedPythonExec = 'python3';
    return cachedPythonExec;
};

export const transcribeOriginalVideoWithAssemblyAI = async (audioPath, cachePath, apiKey = null) => {
    // Just wrap transcribeWav, as the actual AssemblyAI logic is missing
    console.log('[AI] Running AssemblyAI transcription stage (using Whisper backend)...');
    return await transcribeWav(audioPath, cachePath);
};


const safeWriteCache = (cachePath, data) => {
    if (!cachePath) return;
    const tmpPath = cachePath + '.tmp';
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
        fs.renameSync(tmpPath, cachePath);
    } catch(e) {
        console.warn('[AI] Failed to write cache safely:', e.message);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
};

export const initModels = async () => {
    return new Promise((resolve) => {
        const scriptPath = path.join(process.cwd(), 'src', 'ai', 'download_model.py');
        const pythonExec = getPythonExec();
        
        console.log(`[AI] Initializing and verifying models with ${pythonExec}...`);
        const child = spawn(pythonExec, [scriptPath]);
        
        child.on('close', (code) => {
                if (timeoutTimer) clearTimeout(timeoutTimer);
            if (code === 0) {
                console.log('[AI] Model pre-verification successful. Offline models are ready.');
                resolve();
            } else {
                console.error(`[AI] Model verification exited with code ${code}`);
                resolve();
            }
        });
        
        child.on('error', (err) => {
                if (timeoutTimer) clearTimeout(timeoutTimer);
            console.error('[AI] Failed to verify models on startup:', err);
            resolve();
        });
    });
};

export const translateWithGemini = async (originalTranscript, cachePath, apiKey = null) => {
    try {
        if (cachePath && fs.existsSync(cachePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                if (Array.isArray(data) && data.length === originalTranscript.length) {
                    let valid = true;
                    for (let i = 0; i < data.length; i++) {
                        if (!data[i] || !data[i].text || typeof data[i].text !== 'string' || data[i].text.trim() === '' || !Array.isArray(data[i].timestamp) || data[i].timestamp.length !== 2) {
                            valid = false;
                            break;
                        }
                        if (data[i].timestamp[0] !== originalTranscript[i].timestamp[0] || data[i].timestamp[1] !== originalTranscript[i].timestamp[1]) {
                            valid = false;
                            break;
                        }
                    }
                    if (valid) {
                        console.log(`[AI] Loaded translated transcript from cache: ${cachePath}`);
                        return data;
                    }
                }
                console.warn("[AI] Translated transcript cache invalid, incomplete, or corrupted, translating again...");
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
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeApiKey}`;
        
        const { getTranslationSystemInstruction } = await import('./translation.js');
        const systemInstruction = getTranslationSystemInstruction();

        const batchSize = 30;
        const translatedTranscript = [];
        
        for (let i = 0; i < originalTranscript.length; i += batchSize) {
            const batch = originalTranscript.slice(i, i + batchSize);
            const batchInput = batch.map((chunk, idx) => ({
                index: i + idx,
                text: chunk.text
            }));
            
            console.log(`[AI] Translating batch ${Math.floor(i / batchSize) + 1} / ${Math.ceil(originalTranscript.length / batchSize)}...`);
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
                                throw new Error(`Gemini API permanent error (${status}): Gemini API daily quota has been exceeded. Please try again after the quota resets or use a billing-enabled Gemini API project.`);
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
                        // Verify duplicate indexes by checking if we already populated it in the main array
                        if (translatedTranscript[expectedIndex]) {
                            throw new Error(`Duplicate processing detected for index ${expectedIndex}.`);
                        }
                        tempBatch[j] = {
                            timestamp: originalTranscript[expectedIndex].timestamp,
                            text: translatedItem.text.trim()
                        };
                    }
                    
                    // Assign successfully parsed batch to main array
                    for (let j = 0; j < batch.length; j++) {
                        translatedTranscript[i + j] = tempBatch[j];
                    }
                    
                    success = true;
                    break; // Break retry loop
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
        
        // Final validations
        if (translatedTranscript.length !== originalTranscript.length) {
            throw new Error(`Translated transcript length (${translatedTranscript.length}) does not match original (${originalTranscript.length}).`);
        }
        
        if (cachePath) {
            fs.writeFileSync(cachePath, JSON.stringify(translatedTranscript));
            console.log(`[AI] Saved translated transcript to cache: ${cachePath}`);
        }
        
        return translatedTranscript;
    } catch (err) {
        console.error("[AI] Error translating with Gemini:", err);
        throw err;
    }
};

export const transcribeWav = async (wavPath, cachePath) => {
    if (cachePath && fs.existsSync(cachePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (Array.isArray(data) && data.length > 0) {
                console.log(`[AI] Loaded transcript from cache: ${cachePath}`);
                return data;
            }
        } catch(e) {}
    }
    
    console.log(`[AI] Starting Whisper transcription for: ${wavPath}`);
    
    return new Promise((resolve, reject) => {
        const pythonExec = getPythonExec();
        if (!pythonExec) {
            return reject(new Error("Python 3 is not available. Please install python3."));
        }
        
        const scriptPath = path.join(process.cwd(), 'src/ai/transcribe.py');
        const child = spawn(pythonExec, [scriptPath, path.resolve(wavPath)], {
            cwd: process.cwd(),
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });
        
        let stdoutData = '';
        let stderrData = '';
        
        child.stdout.on('data', (data) => stdoutData += data.toString());
        child.stderr.on('data', (data) => stderrData += data.toString());
        
        child.on('close', (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(stdoutData);
                    if (result.error) {
                        return reject(new Error(`Transcription error: ${result.error}`));
                    }
                    if (cachePath) {
                        fs.writeFileSync(cachePath, JSON.stringify(result.segments || result));
                    }
                    resolve(result.segments || result);
                } catch(e) {
                    reject(new Error(`Failed to parse transcribe output: ${e.message}\nOutput: ${stdoutData}\nStderr: ${stderrData}`));
                }
            } else {
                reject(new Error(`Transcription failed with code ${code}.\nStderr: ${stderrData}`));
            }
        });
        child.on('error', reject);
    });
};

export const generateNarrationTTS = async (translatedTranscript, cachePath, voiceId = 'male-young-adult', originalTranscript = null) => {
    const voiceConfig = getVoiceConfig(voiceId);
    const edgeVoice = voiceConfig.edgeVoice;
    const pitch = voiceConfig.pitch;
    const rate = voiceConfig.rate;
    try {
        const cacheDir = path.dirname(cachePath);
        const cacheMetaPath = cachePath + '.meta.json';
        const currentMeta = { length: translatedTranscript.length, voice: edgeVoice, pitch, rate, voiceId };
        
        if (fs.existsSync(cachePath) && fs.existsSync(cacheMetaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf8'));
                if (meta.length === currentMeta.length && meta.voice === currentMeta.voice && meta.pitch === currentMeta.pitch && meta.rate === currentMeta.rate && fs.statSync(cachePath).size > 0) {
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
                        const callPromise = ttsClient.call(chunkText);
                        let timeoutId;
                        let res;
                        try {
                            const timeoutPromise = new Promise((_, reject) => {
                                timeoutId = setTimeout(() => reject(new Error("Edge TTS timeout")), 30000);
                            });
                            res = await Promise.race([callPromise, timeoutPromise]);
                        } finally {
                            clearTimeout(timeoutId);
                        }
                        const buffer = res.data;
                        if (!buffer || buffer.length === 0) {
                            throw new Error(`Edge TTS returned 0 bytes for chunk ${i}.`);
                        }
                        
                        const tempMp3 = chunkPath.replace('.wav', '_source.mp3');
                        fs.writeFileSync(tempMp3, buffer);
                        await runFFmpeg(['-i', tempMp3, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', chunkPath], ttsDir);
                        fs.unlinkSync(tempMp3);
                        
                        success = true;
                        break;
                    } catch (err) {
                        console.warn(`[AI] TTS generation attempt ${attempt} failed for chunk ${i}: ${err.message}`);
                        lastError = err;
                        if (attempt < 3) {
                            const backoff = Math.pow(2, attempt) * 1000;
                            await new Promise(r => setTimeout(r, backoff));
                        }
                    }
                }
                if (!success) {
                    throw new Error(`TTS generation failed after retries for chunk ${i}. Last error: ${lastError?.message}`);
                }
            }
        };

        const workers = Array(concurrencyLimit).fill(null).map(() => processNext());
        await Promise.all(workers);


        // Validate chunks before concat
        let validChunks = 0;
        let missingChunks = 0;
        for (let i = 0; i < chunks.length; i++) {
            const chunkPath = chunks[i];
            if (!fs.existsSync(chunkPath)) {
                missingChunks++;
                throw new Error(`TTS concat failed: missing chunk ${chunkPath}`);
            } else if (fs.statSync(chunkPath).size === 0) {
                missingChunks++;
                throw new Error(`TTS concat failed: 0-byte chunk ${chunkPath}`);
            } else {
                validChunks++;
            }
        }
        
        console.log(`[TTS] Expected chunks: ${translatedTranscript.length}`);
        console.log(`[TTS] Successfully generated: ${validChunks}`);
        console.log(`[TTS] Missing chunks: ${missingChunks}`);

        let isDialogueStyle = false;
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
        console.log(`[TTS] Video Style Detected: ${isDialogueStyle ? 'Dialogue' : 'Narration'}`);

        const processedChunks = [];
        const authoritativeTimeline = [];
        let runningAudioTime = 0;
        
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
                        const gapPath = path.join(ttsDir, `gap_${i}.wav`);
                        await runFFmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', gapBefore.toFixed(3), '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', gapPath], ttsDir);
                        processedChunks.push(gapPath);
                        try {
                            let gapDur = parseFloat(await getDuration(gapPath));
                            console.log(`[AI-DIAGNOSTIC] Gap Before Chunk ${i} | Intended Dur: ${gapBefore.toFixed(3)} | Actual Dur: ${gapDur.toFixed(3)} | Timeline: ${(runningAudioTime).toFixed(2)}->${(runningAudioTime + gapBefore).toFixed(2)}`);
                        } catch(e) {}
                        prevEnd += gapBefore;
                    }
                    
                    let finalDur = chunkDurs[i];
                    let finalChunkPath = chunks[i];
                    
                    if (speed > 1.02) {
                        finalChunkPath = path.join(ttsDir, `chunk_adj_${String(i).padStart(4, '0')}.wav`);
                        await runFFmpeg(['-i', chunks[i], '-filter:a', `atempo=${speed.toFixed(3)}`, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', finalChunkPath], ttsDir);
                        finalDur = chunkDurs[i] / speed;
                        console.log(`[AI] Dialogue Group Chunk ${i} tempo adjusted by ${speed.toFixed(2)}x (Group Stable Speed)`);
                    } else {
                        // Moderate per-chunk adjustment if only this chunk is long but the group is fine
                        if (finalDur > origDur + 0.1) {
                             let localSpeed = finalDur / origDur;
                             if (localSpeed > 1.25) localSpeed = 1.25;
                             if (localSpeed > 1.02) {
                                 finalChunkPath = path.join(ttsDir, `chunk_adj_${String(i).padStart(4, '0')}.wav`);
                                 await runFFmpeg(['-i', chunks[i], '-filter:a', `atempo=${localSpeed.toFixed(3)}`, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', finalChunkPath], ttsDir);
                                 finalDur = chunkDurs[i] / localSpeed;
                                 console.log(`[AI] Dialogue Local Chunk ${i} tempo adjusted by ${localSpeed.toFixed(2)}x`);
                             }
                        }
                    }
                    
                    processedChunks.push(finalChunkPath);
                    
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
                    
                    let statDur = 0, statSize = 0, codec = 'none', sampleRate = 0, channels = 0;
                    try {
                        statDur = parseFloat(await getDuration(finalChunkPath));
                        statSize = fs.statSync(finalChunkPath).size;
                        const details = await getAudioDetails(finalChunkPath);
                        codec = details.codec;
                        sampleRate = details.sampleRate;
                        channels = details.channels;
                    } catch(e) {}
                    console.log(`[AI-DIAGNOSTIC] Chunk ${i} | Orig: ${origStart.toFixed(2)}->${origEnd.toFixed(2)} (dur: ${origDur.toFixed(2)}) | TTS: ${path.basename(finalChunkPath)} (size: ${statSize}, dur: ${statDur.toFixed(2)}, format: ${codec}, ${sampleRate}Hz, ${channels}ch) | Final Timeline: ${(runningAudioTime + gapBefore).toFixed(2)}->${(runningAudioTime + gapBefore + finalDur).toFixed(2)}`);
                    
                    runningAudioTime += gapBefore + finalDur;
                    
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
                let actualGapBefore = 0;
                let actualFinalDur = chunkDurs[i];
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
                    actualGapBefore = gap_before;
                    const gapPath = path.join(ttsDir, `gap_${i}.wav`);
                    await runFFmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', gap_before.toFixed(3), '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', gapPath], ttsDir);
                    processedChunks.push(gapPath);
                    try {
                        let gapDur = parseFloat(await getDuration(gapPath));
                        console.log(`[AI-DIAGNOSTIC] Gap Before Chunk ${i} | Intended Dur: ${gap_before.toFixed(3)} | Actual Dur: ${gapDur.toFixed(3)} | Timeline: ${(runningAudioTime).toFixed(2)}->${(runningAudioTime + gap_before).toFixed(2)}`);
                    } catch(e) {}
                }
                
                if (orig_dur > 0 && chunkDur > orig_dur + 0.1) {
                    let speed = chunkDur / orig_dur;
                    if (speed > 1.8) speed = 1.8;
                    
                    const adjustedPath = path.join(ttsDir, `chunk_adj_${String(i).padStart(4, '0')}.wav`);
                    console.log(`[AI] Narration Chunk ${i} sped up by ${speed.toFixed(2)}x`);
                    
                    await runFFmpeg(['-i', rawChunk, '-filter:a', `atempo=${speed}`, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', '-y', adjustedPath], ttsDir);
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
                
                let statDur = 0, statSize = 0, codec = 'none', sampleRate = 0, channels = 0;
                try {
                    let finalPath = (orig_dur > 0 && chunkDur > orig_dur + 0.1) ? path.join(ttsDir, `chunk_adj_${String(i).padStart(4, '0')}.wav`) : rawChunk;
                    statDur = parseFloat(await getDuration(finalPath));
                    statSize = fs.statSync(finalPath).size;
                    const details = await getAudioDetails(finalPath);
                    codec = details.codec;
                    sampleRate = details.sampleRate;
                    channels = details.channels;
                } catch(e) {}
                console.log(`[AI-DIAGNOSTIC] Narration Chunk ${i} | Orig: ${orig_start.toFixed(2)}->${orig_end.toFixed(2)} (dur: ${orig_dur.toFixed(2)}) | TTS Size: ${statSize}, Dur: ${statDur.toFixed(2)}, format: ${codec}, ${sampleRate}Hz, ${channels}ch | Final Timeline: ${(runningAudioTime + actualGapBefore).toFixed(2)}->${(runningAudioTime + actualGapBefore + actualFinalDur).toFixed(2)}`);
                
                runningAudioTime += actualGapBefore + actualFinalDur;
            }
        }

        const concatListPath = path.join(ttsDir, 'concat.txt');
        const concatLines = processedChunks.map(c => `file '${path.basename(c)}'`).join('\n');
        fs.writeFileSync(concatListPath, concatLines);

        console.log(`[AI] Concatenating ${processedChunks.length} TTS chunks (including gaps) to ${cachePath}...`);
        
        const args = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', 'concat.txt',
            '-acodec', 'pcm_s16le',
            '-ac', '1',
            '-ar', '24000',
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
        
        let numChunks = processedChunks.filter(p => !path.basename(p).startsWith('gap_')).length;
        let numGaps = processedChunks.filter(p => path.basename(p).startsWith('gap_')).length;
        console.log(`[AI-DIAGNOSTIC] FINAL ASSEMBLY: Expected duration=${runningAudioTime.toFixed(2)}s | Actual duration=${duration}s | Audio chunks=${numChunks} | Silence gaps=${numGaps}`);
        
        console.log(`[TTS] Final audio duration: ${duration} seconds`);
        
        // Write metadata cache
        fs.writeFileSync(cacheMetaPath, JSON.stringify(currentMeta));
        
        // Write authoritative timeline
        const authoritativeTimelinePath = cachePath + '.timeline.json';
        fs.writeFileSync(authoritativeTimelinePath, JSON.stringify(authoritativeTimeline, null, 2));

        // Cleanup temporary files safely
        try {
            if (fs.existsSync(ttsDir)) {
                fs.rmSync(ttsDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) {
            console.warn(`[AI] Warning: Failed to clean up TTS directory ${ttsDir}:`, cleanupErr);
        }

        console.log(`[AI] TTS generation successful: ${cachePath} (Duration: ${duration}s)`);
        return cachePath;
    } catch (err) {
        console.error("[AI] Error generating TTS:", err);
        // Cleanup temporary tts_chunks directory on failure
        const cacheDir = path.dirname(cachePath);
        const ttsDir = path.join(cacheDir, 'tts_chunks');
        try {
            if (fs.existsSync(ttsDir)) {
                fs.rmSync(ttsDir, { recursive: true, force: true });
            }
        } catch (cleanupErr) {
            console.warn(`[AI] Warning: Failed to clean up TTS directory on error ${ttsDir}:`, cleanupErr);
        }
        if (fs.existsSync(cachePath)) {
            fs.unlinkSync(cachePath);
        }
        throw err;
    }
};
