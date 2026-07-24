const fs = require('fs');

let content = fs.readFileSync('src/ai/index.js', 'utf8');

// Replace generateNarrationTTS logic
content = content.replace(
/export const generateNarrationTTS = async [\s\S]*?return cachePath;[\s\S]*?catch \(err\) \{[\s\S]*?throw err;\n    \}\n\};/,
`export const generateNarrationTTS = async (sceneNarration, cachePath, voiceId, _ignoredOriginalTranscript) => {
    try {
        console.log("[AI] Starting TTS Generation (Scene-based Continuous Audio)");
        const cacheMetaPath = cachePath + '.meta.json';
        const edgeVoice = voiceId || 'male-young-adult';
        let pitch = '-10Hz';
        let rate = '+0%';

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

        const chunks = [];
        const ttsClient = new EdgeTTS({ voice: edgeVoice, pitch, rate });
        
        let concurrencyLimit = 3;
        if (process.env.TTS_CONCURRENCY) {
            const parsed = parseInt(process.env.TTS_CONCURRENCY, 10);
            if (Number.isFinite(parsed) && parsed >= 1) {
                concurrencyLimit = Math.min(parsed, 20);
            }
        }

        for (let i = 0; i < sceneNarration.length; i++) {
            const chunkFileName = \`chunk_\${String(i).padStart(4, '0')}.wav\`;
            chunks.push(path.join(ttsDir, chunkFileName));
        }

        let currentIndex = 0;
        const processNext = async () => {
            while (currentIndex < sceneNarration.length) {
                const i = currentIndex++;
                const chunkText = sceneNarration[i].narration_text;
                if (!chunkText || typeof chunkText !== 'string' || chunkText.trim() === '') {
                    throw new Error(\`Scene narration chunk \${i} is empty or invalid.\`);
                }

                const chunkPath = chunks[i];
                console.log(\`[AI] Generating TTS chunk \${i + 1} / \${sceneNarration.length}...\`);
                
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
                        console.warn(\`[AI] TTS attempt \${attempt} failed for chunk \${i}: \${err.message}\`);
                    }
                }

                if (!success) {
                    throw new Error(\`Failed to generate TTS for chunk \${i} after 3 attempts. Last error: \${lastError?.message}\`);
                }
            }
        };

        const workers = [];
        for (let i = 0; i < Math.min(concurrencyLimit, sceneNarration.length); i++) {
            workers.push(processNext());
        }
        await Promise.all(workers);

        // Build Authoritative Timeline (Continuous)
        const processedChunks = [];
        const authoritativeTimeline = [];
        let runningAudioTime = 0;
        
        for (let i = 0; i < chunks.length; i++) {
            const rawChunk = chunks[i];
            let orig_start = sceneNarration[i].scene_start;
            let orig_end = sceneNarration[i].scene_end;
            let orig_dur = orig_end - orig_start;
            if (orig_dur < 0) orig_dur = 0;

            let chunkDur = 0;
            try {
                chunkDur = parseFloat(await getDuration(rawChunk));
            } catch(e) {
                throw new Error(\`Failed to get duration for \${rawChunk}\`);
            }

            const standardizedPath = path.join(ttsDir, \`chunk_std_\${String(i).padStart(4, '0')}.wav\`);
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
                throw new Error(\`Timeline Error: Cannot determine actual duration for chunk \${i}\`);
            }

            authoritativeTimeline.push({
                chunk_index: i,
                orig_start: orig_start,
                orig_end: orig_end,
                orig_dur: orig_dur,
                final_audio_start: runningAudioTime,
                final_audio_end: runningAudioTime + actualFinalDur,
                final_dur: actualFinalDur,
                text: sceneNarration[i].narration_text
            });

            runningAudioTime += actualFinalDur;
        }

        const concatListPath = path.join(ttsDir, 'concat.txt');
        let concatLines = processedChunks.map(c => \`file '\${path.basename(c)}'\`).join('\\n');

        if (processedChunks.length === 0) {
            console.warn("[WARNING] No audio chunks to concatenate. Generating 100ms silent audio...");
            const gapPath = path.join(ttsDir, 'gap_empty.wav');
            await runFFmpeg(['-f', 'lavfi', '-i', \`anullsrc=r=24000:cl=mono\`, '-t', '0.1', '-acodec', 'pcm_s16le', '-y', gapPath], ttsDir);
            concatLines = \`file 'gap_empty.wav'\`;
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
            throw new Error(\`Final TTS audio has invalid duration: \${duration}\`);
        }
        
        let numChunks = processedChunks.length;
        const absDiff = Math.abs(runningAudioTime - duration);
        let status = absDiff <= 0.05 ? 'PASS' : 'FAIL';
        
        if (numChunks === 0 && duration <= 0.15) { 
             status = 'PASS';
             runningAudioTime = duration;
        }

        console.log(\`[FINAL-TIMELINE-VALIDATION]\`);
        console.log(\`timeline_duration: \${runningAudioTime.toFixed(3)}\`);
        console.log(\`final_audio_duration: \${duration.toFixed(3)}\`);
        console.log(\`absolute_difference: \${absDiff.toFixed(3)}\`);
        console.log(\`chunk_count: \${numChunks}\`);
        console.log(\`gap_count: 0\`);
        console.log(\`status: \${status}\`);

        if (status === 'FAIL') {
            throw new Error(\`Pipeline Error: Final TTS audio duration difference (\${absDiff.toFixed(3)}s) exceeds 0.05s tolerance!\`);
        }

        console.log(\`[AI-DIAGNOSTIC] FINAL ASSEMBLY: Expected duration=\${runningAudioTime.toFixed(2)}s | Actual duration=\${duration}s | Audio chunks=\${numChunks} | Silence gaps=0\`);
        console.log(\`[AI-TIMELINE-SUMMARY] chunks=\${numChunks} | gaps=0 | authoritative_timeline_duration=\${runningAudioTime.toFixed(3)}s\`);
        
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
        const ttsDir = path.join(cacheDir, 'tts_chunks_scene');
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
};`
);

// Add generateSceneNarration
const newFunc = `
import { getStreamsDuration } from '../ffmpeg/index.js';

export const generateSceneNarration = async (scenes, videoPath, apiKey) => {
    console.log("[AI] Generating Scene Narration...");
    if (apiKey === 'bypass') {
        const fallback = [];
        const videoDur = (await getStreamsDuration(videoPath)).effectiveVideoDuration || 10;
        for (let i = 0; i < scenes.length; i++) {
            const start = scenes[i];
            const end = i < scenes.length - 1 ? scenes[i+1] : videoDur;
            fallback.push({
                scene_index: i,
                scene_start: start,
                scene_end: end,
                narration_text: \`This is fallback narration for scene \${i+1}.\`
            });
        }
        return fallback;
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = \`https://generativelanguage.googleapis.com/v1beta/models/\${modelName}:generateContent?key=\${apiKey}\`;

    const style = getSetting('TRANSLATION_STYLE') || 'default_recap';
    const naturalness = getSetting('BURMESE_NATURALNESS') || 'balanced';
    const systemInstructionText = getSceneNarrationSystemInstruction(style, naturalness);

    // Get video duration
    const streamsDur = await getStreamsDuration(videoPath);
    const videoDuration = streamsDur.effectiveVideoDuration || 0;

    const frameDataList = [];
    const sceneData = [];
    
    const tempDir = path.join(path.dirname(videoPath), 'temp_frames_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    console.log("[AI] Extracting frames for visual context...");
    for (let i = 0; i < scenes.length; i++) {
        const start = scenes[i];
        const end = i < scenes.length - 1 ? scenes[i+1] : videoDuration;
        const mid = start + (end - start) / 2;
        
        const framePath = path.join(tempDir, \`frame_\${i}.jpg\`);
        await runFFmpeg(['-ss', mid.toString(), '-i', videoPath, '-vframes', '1', '-q:v', '2', '-y', framePath], tempDir);
        
        const base64Data = fs.readFileSync(framePath).toString('base64');
        sceneData.push({
            scene_index: i,
            scene_start: start,
            scene_end: end
        });
        
        frameDataList.push({
            inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
            }
        });
    }

    try {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}

    const maxRetries = 3;
    let attempt = 0;
    let delay = 1000;
    
    const parts = [
        { text: \`Here is the scene boundary data:\\n\${JSON.stringify(sceneData, null, 2)}\\n\\nAnd here are the corresponding video frames (one per scene in order):\` },
        ...frameDataList
    ];

    while (attempt < maxRetries) {
        attempt++;
        try {
            console.log(\`[AI] Requesting Gemini narration (attempt \${attempt})...\`);
            const response = await axios.post(url, {
                system_instruction: {
                    parts: [{ text: systemInstructionText }]
                },
                contents: [{
                    role: "user",
                    parts: parts
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
            if (parsed.length !== scenes.length) {
                throw new Error(\`Gemini response length (\${parsed.length}) does not match input length (\${scenes.length}).\`);
            }

            const result = [];
            for (let i = 0; i < scenes.length; i++) {
                const item = parsed.find(p => p.scene === i || p.scene === i + 1 || p.scene_index === i); 
                // Flexible matching for scene index
                let narText = item?.narration || item?.narration_text;
                if (!narText && parsed[i] && (parsed[i].narration || parsed[i].narration_text)) {
                    narText = parsed[i].narration || parsed[i].narration_text;
                }

                if (!narText || typeof narText !== 'string') {
                    throw new Error(\`Missing or invalid narration for scene \${i}.\`);
                }
                
                result.push({
                    scene_index: i,
                    scene_start: sceneData[i].scene_start,
                    scene_end: sceneData[i].scene_end,
                    narration_text: narText
                });
            }

            console.log("[AI] Successfully generated scene narration.");
            return result;

        } catch (err) {
            let errorMsg = err.message;
            if (err.response && err.response.status === 404) {
                errorMsg = \`Model '\${modelName}' not found or unsupported (HTTP 404).\`;
            }
            console.error(\`[AI] Gemini narration attempt \${attempt} failed: \${errorMsg}\`);
            
            const isTransient = !err.response || err.response.status >= 500 || err.response.status === 429 || err.code === 'ECONNABORTED';
            if (attempt === maxRetries || !isTransient || (err.response && err.response.status === 404)) {
                throw new Error(\`Gemini scene narration failed. \${errorMsg}\`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
};
`;

// Remove duplicate getStreamsDuration import 
content = content.replace("import { getStreamsDuration } from '../ffmpeg/index.js';", "");

content = content + "\n" + newFunc;
fs.writeFileSync('src/ai/index.js', content, 'utf8');
console.log('patched ai/index.js');
