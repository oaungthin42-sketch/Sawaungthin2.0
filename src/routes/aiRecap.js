import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getSetting } from '../services/settings.js';
import db from '../services/db.js';
import { authMiddleware } from './auth.js';
import { GoogleGenAI } from '@google/genai';
import { generateNarrationTTS, transcribeWav } from '../ai/index.js';
import { runFFmpeg, extractWav } from '../ffmpeg/index.js';
import { getTranslationSystemInstruction, getRecapNarrationSystemInstruction } from '../ai/translation.js';
import { EdgeTTS } from 'node-edge-tts';
import { getVoiceConfig } from '../ai/voices.js';
import { applyVoiceClone } from '../ai/voiceClone.js';

const router = express.Router();

const uploadDir = path.join(process.cwd(), 'data', 'temp_recap');
const sourcesDir = path.join(process.cwd(), 'data', 'ai_recap_sources');
if (!fs.existsSync(sourcesDir)) { fs.mkdirSync(sourcesDir, { recursive: true }); }
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

const limitConcurrency = async (tasks, limit) => {
    const results = new Array(tasks.length);
    let i = 0;
    const workers = new Array(limit).fill(0).map(async () => {
        while (i < tasks.length) {
            const index = i++;
            results[index] = await tasks[index]();
        }
    });
    await Promise.all(workers);
    return results;
};


async function trimSilence(sourceVideoPath, outputPath, workDir) {
    let totalDuration = 0;
    try {
        const durCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourceVideoPath}"`;
        totalDuration = parseFloat(execSync(durCmd).toString().trim());
    } catch (e) {
        console.error("[AI Recap] Failed to get source duration, skipping trim", e);
        fs.copyFileSync(sourceVideoPath, outputPath);
        return;
    }

    let speechSegments = [];
    let tempWavPath = path.join(workDir, `temp_audio_${Date.now()}.wav`);
    try {
        await extractWav(sourceVideoPath, tempWavPath);
        const segments = await transcribeWav(tempWavPath, null);
        if (segments && Array.isArray(segments)) {
            speechSegments = segments;
        }
    } catch (e) {
        console.error("[AI Recap] Speech detection failed, skipping trim", e);
    } finally {
        if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
    }

    if (speechSegments.length === 0) {
        fs.copyFileSync(sourceVideoPath, outputPath);
        return;
    }

    // 1. Sort segments by start time
    speechSegments.sort((a, b) => a.timestamp[0] - b.timestamp[0]);

    // 2. Merge consecutive segments if the gap is less than 1.5 seconds
    let merged = [];
    for (const seg of speechSegments) {
        const s = seg.timestamp[0];
        const e = seg.timestamp[1];
        if (merged.length === 0) {
            merged.push({ start: s, end: e });
        } else {
            const last = merged[merged.length - 1];
            if (s - last.end < 1.5) {
                last.end = Math.max(last.end, e);
            } else {
                merged.push({ start: s, end: e });
            }
        }
    }

    // 3. Expand each kept range by 0.4s buffer and clamp
    for (const m of merged) {
        m.start = Math.max(0, m.start - 0.4);
        m.end = Math.min(totalDuration, m.end + 0.4);
    }

    // 4. Merge any overlapping ranges after padding
    let finalMerged = [];
    for (const m of merged) {
        if (finalMerged.length === 0) {
            finalMerged.push(m);
        } else {
            const last = finalMerged[finalMerged.length - 1];
            if (m.start <= last.end) {
                last.end = Math.max(last.end, m.end);
            } else {
                finalMerged.push(m);
            }
        }
    }

    // 5. Drop ranges shorter than 0.1s
    let keepSegments = finalMerged.filter(s => (s.end - s.start) > 0.1);

    if (keepSegments.length === 0) {
        fs.copyFileSync(sourceVideoPath, outputPath);
        return;
    }

    console.log(`[AI Recap] Speech-based trim: ${speechSegments.length} speech segments found -> ${keepSegments.length} merged/padded segments kept.`);

    const segmentFiles = [];
    for (let i = 0; i < keepSegments.length; i++) {
        const seg = keepSegments[i];
        const segPath = path.join(workDir, `trimseg_${Date.now()}_${i}.mp4`);
        segmentFiles.push(segPath);
        await runFFmpeg([
            '-y',
            '-ss', String(seg.start),
            '-to', String(seg.end),
            '-i', sourceVideoPath,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '23',
            '-c:a', 'aac',
            segPath
        ], workDir, () => {});
    }

    const concatListPath = path.join(workDir, `trimconcat_${Date.now()}.txt`);
    fs.writeFileSync(concatListPath, segmentFiles.map(f => `file '${f}'`).join('\n'));

    await runFFmpeg([
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        outputPath
    ], workDir, () => {});

    for (const f of segmentFiles) { if (fs.existsSync(f)) fs.unlinkSync(f); }
    if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
}

async function generateNarrationScript(sourceVideoPath) {
    const apiKey = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing");
    }
    const ai = new GoogleGenAI({ apiKey });

    console.log(`[AI Recap] Uploading ${sourceVideoPath} to Gemini...`);
    let fileUpload = await ai.files.upload({
        file: sourceVideoPath,
        config: { mimeType: 'video/mp4' },
    });
    console.log(`[AI Recap] File uploaded. URI: ${fileUpload.uri}, Name: ${fileUpload.name}`);

    let state = fileUpload.state;
    let attempts = 0;
    while (state === 'PROCESSING' && attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        fileUpload = await ai.files.get({ name: fileUpload.name });
        state = fileUpload.state;
        console.log(`[AI Recap] File state: ${state}`);
        attempts++;
    }

    if (state !== 'ACTIVE') {
        throw new Error(`Gemini file processing failed or timed out. Final state: ${state}`);
    }

    let sourceDuration = 0;
    try {
        const durStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourceVideoPath}"`).toString().trim();
        sourceDuration = parseFloat(durStr);
    } catch(e) {
        console.error("[AI Recap] Failed to probe source duration in generateNarrationScript", e);
    }

    const durationMinutes = (sourceDuration / 60).toFixed(2);
    const targetMin = (sourceDuration * 0.4 / 60).toFixed(2);
    const targetMax = (sourceDuration * 0.55 / 60).toFixed(2);

    const styleGuide = getRecapNarrationSystemInstruction();
    
    const buildPrompt = (retryMessage = "") => {
        let p = `${styleGuide}

YOUR TASK HAS TWO STEPS. Complete them in order.

STEP 1 — BUILD A VISUAL TIMELINE:
Watch the entire video from start to end. Produce a literal, chronological, shot-by-shot timeline of what is actually visible on screen — not the plot, just what you can directly observe: who/what is on screen, what action is happening, and where each shot starts and ends in seconds. Cover the ENTIRE video with no large unexplained gaps. Each timeline entry's "description" should be a short, literal, factual description of what is visible (e.g. "A man in a black jacket argues with a woman at a doorway", "Wide shot of a car driving down a street at night") — do not interpret or narrate meaning yet, just describe what is shown.

STEP 2 — WRITE THE RECAP NARRATION USING ONLY THE TIMELINE FROM STEP 1:
Now write the Burmese-language movie recap narration (third-person, explanatory storytelling — see style rules above). For EVERY narration segment, its "source_start" and "source_end" MUST exactly match (or be a sub-range within) one of the spans you already wrote in your own STEP 1 timeline. Do not invent a new timestamp that wasn't grounded in a timeline entry you already produced. Pick whichever timeline entry/entries actually show what that narration segment describes — if no timeline entry matches well, choose the closest one that still shows the same character(s) or setting, rather than an unrelated one.

Cover the story from beginning to end: setup, rising events, climax, and resolution. Mention key characters (by name if known, otherwise by description), their relationships, and important turning points. Do not invent events that are not shown or clearly implied in the video. Do NOT translate or transcribe literal dialogue lines, and do NOT quote spoken lines directly — paraphrase and summarize in your own words.

SOURCE VIDEO LENGTH: The source video is exactly ${durationMinutes} minutes long.
TARGET NARRATION LENGTH: Your combined narration, when spoken aloud at a natural pace, should total roughly 40-55% of the source video's runtime (about ${targetMin} to ${targetMax} minutes of speaking).
To achieve this, write roughly one segment per 8-15 seconds of source content, but do not sacrifice narrative coherence for segment count.

Break the narration into short segments (1-2 natural spoken sentences each). Narration segments must be in the order they should be spoken, and their source_start/source_end should generally follow the movie's chronological order, except when a segment intentionally references an earlier moment (flashback-style narration).

REQUIRED OUTPUT FORMAT:
Output a single JSON object with exactly two fields:
1. "timeline": the array of shot-by-shot entries from STEP 1, each with "start" (number, seconds), "end" (number, seconds), and "description" (string).
2. "segments": the array of narration segments from STEP 2, each with "source_start" (number, seconds), "source_end" (number, seconds), and "narration_text" (string, Burmese).
Every source_start/source_end in "segments" must fall within the bounds of at least one entry in "timeline". Every timestamp must satisfy: end > start, with a minimum span of 2 seconds, and must be within the video's actual duration.`;

        if (retryMessage) {
            p += `\n\nIMPORTANT RETRY INSTRUCTION: ${retryMessage}`;
        }
        return p;
    };

    let parsed = null;
    let retryAttempt = 0;
    
    while (retryAttempt < 2) {
        const currentPrompt = buildPrompt(retryAttempt === 1 ? "Your previous output was too short. This time, ensure you generate at least 35-40% of the source runtime in spoken narration length by adding more detailed storytelling and events." : "");
        console.log(`[AI Recap] Calling generateContent for narration script (Attempt ${retryAttempt + 1})...`);
        const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        { fileData: { fileUri: fileUpload.uri, mimeType: fileUpload.mimeType } },
                        { text: currentPrompt }
                    ]
                }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        timeline: {
                            type: "ARRAY",
                            description: "A literal, chronological shot-by-shot log of what is visually happening in the video.",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    start: { type: "NUMBER" },
                                    end: { type: "NUMBER" },
                                    description: { type: "STRING" }
                                },
                                required: ["start", "end", "description"]
                            }
                        },
                        segments: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    source_start: { type: "NUMBER" },
                                    source_end: { type: "NUMBER" },
                                    narration_text: { type: "STRING" }
                                },
                                required: ["source_start", "source_end", "narration_text"]
                            }
                        }
                    },
                    required: ["timeline", "segments"]
                }
            }
        });

        try {
            const responseObj = JSON.parse(response.text);
            if (!responseObj || !Array.isArray(responseObj.segments) || responseObj.segments.length === 0) {
                throw new Error("Gemini returned an empty or invalid segments array.");
            }
            const timeline = Array.isArray(responseObj.timeline) ? responseObj.timeline : [];
            parsed = responseObj.segments;

            // Validation/logging only — does not block or drop anything, just helps us monitor accuracy.
            if (timeline.length > 0) {
                let ungroundedCount = 0;
                for (const seg of parsed) {
                    const grounded = timeline.some(t => seg.source_start >= t.start - 0.5 && seg.source_end <= t.end + 0.5);
                    if (!grounded) ungroundedCount++;
                }
                if (ungroundedCount > 0) {
                    console.warn(`[AI Recap] ${ungroundedCount}/${parsed.length} segments used a timestamp not grounded in the generated timeline.`);
                }
            }

            // Estimate duration: assume ~2.5 words per second in Burmese for TTS
            const totalWords = parsed.reduce((sum, scene) => sum + (scene.narration_text.split(/\s+/).length), 0);
            const estDuration = totalWords / 2.5; 
            
            if (retryAttempt === 0 && sourceDuration > 0 && estDuration < sourceDuration * 0.35) {
                console.log(`[AI Recap] Generated script estimated at ${estDuration}s, less than 35% of source (${sourceDuration}s). Retrying...`);
                retryAttempt++;
                continue;
            } else {
                break;
            }
        } catch (e) {
            console.error(`[AI Recap] Failed to parse Gemini response on attempt ${retryAttempt + 1}:`, e);
            if (retryAttempt === 0) {
                retryAttempt++;
                continue;
            } else {
                throw new Error(`Failed to parse Gemini response or invalid array.`);
            }
        }
    }

    try {
        await ai.files.delete({ name: fileUpload.name });
        console.log(`[AI Recap] Deleted file ${fileUpload.name} from Gemini`);
    } catch (e) {
        console.error("[AI Recap] Failed to delete file from Gemini:", e);
    }
    
    return parsed;
}


router.post('/process', authMiddleware, upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
    }

    const jobId = 'recap_' + Date.now();
    const tempVideoPath = req.file.path;
    const sourceVideoPath = path.join(sourcesDir, jobId + path.extname(req.file.originalname));
    fs.renameSync(tempVideoPath, sourceVideoPath);

    try {
        const stmt = db.prepare(`INSERT INTO ai_recap_jobs (id, userId, status, generationStatus, createdAt, sourceVideoPath) VALUES (?, ?, ?, ?, ?, ?)`);
        stmt.run(jobId, req.user.id, 'processing', 'processing', Date.now(), sourceVideoPath);
    } catch (e) {
        console.error("Error creating recap job", e);
        if (fs.existsSync(sourceVideoPath)) fs.unlinkSync(sourceVideoPath);
        return res.status(500).json({ error: 'Failed to create job' });
    }

    res.json({ jobId });

    (async () => {
        const updateProgress = (prog, step) => {
            try {
                db.prepare('UPDATE ai_recap_jobs SET progress = ?, currentStep = ? WHERE id = ?').run(prog, step, jobId);
            } catch(e) {}
        };

        try {
            updateProgress(0, 'Initializing job...');
            const voiceId = req.body.voiceId || 'male-young-adult';
            const useVoiceClone = req.body.useVoiceClone === '1';
            const referenceVoiceId = req.body.referenceVoiceId || null;
            const blurBoxesRaw = req.body.blurBoxes || '[]';
            const burnSubtitles = req.body.burnSubtitles === 'true' || req.body.burnSubtitles === '1';
            const subtitleColor = req.body.subtitleColor || 'white';
            const subtitlePositionRaw = req.body.subtitlePosition || '{"xPct":10,"yPct":78,"widthPct":80,"heightPct":12}';
            const flipped = req.body.flipped === '1' || req.body.flipped === 'true';

            let blurBoxes = [];
            try { blurBoxes = JSON.parse(blurBoxesRaw); } catch(e) {}
            
            let subtitlePosition = { xPct: 10, yPct: 78, widthPct: 80, heightPct: 12 };
            try { subtitlePosition = JSON.parse(subtitlePositionRaw); } catch(e) {}
            
            const watermarkText = (req.body.watermarkText || '').trim();

            console.log(`[AI Recap] Generating narration script for job ${jobId}...`);
            updateProgress(20, 'Analyzing video and generating narration...');
            const scenes = await generateNarrationScript(sourceVideoPath);
            console.log(`[AI Recap] Narration script generated successfully.`);
            
            db.prepare(`UPDATE ai_recap_jobs SET status = 'done', resultJson = ?, cleanedVideoPath = ? WHERE id = ?`).run(JSON.stringify({ scenes }), sourceVideoPath, jobId);

            // Now do the video generation part
            const timeline = scenes;
            const authoritativeTimelinePath = path.join(sourcesDir, jobId + '_timeline.json');
            fs.writeFileSync(authoritativeTimelinePath, JSON.stringify(timeline, null, 2));

            // Generate TTS clips
            const narrationClipPaths = new Array(scenes.length).fill(null);
            
            const ttsTasks = scenes.map((scene, i) => async () => {
                updateProgress(40 + (30 * (i / scenes.length)), `Generating audio for scene ${i + 1}/${scenes.length}`);
                const sub = timeline[i] || {};
                const ttsText = sub.text || scene.narration_text || '';
                
                if (!ttsText.trim()) {
                    timeline[i].final_dur = 0.1;
                    return;
                }

                const outPath = path.join(sourcesDir, `${jobId}_tts_${i}.wav`);
                
                let success = false;
                try {
                    console.log(`[AI Recap] Generating Edge TTS for scene ${i}`);
                    const { edgeVoice, pitch, rate } = getVoiceConfig(voiceId);
                    const ttsClient = new EdgeTTS({ voice: edgeVoice, pitch, rate });
                    await ttsClient.ttsPromise(ttsText, outPath);
                    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
                        success = true;
                    }
                } catch(e) {
                    console.error("[AI Recap] Edge TTS failed", e);
                }

                if (success && useVoiceClone && referenceVoiceId) {
                    try {
                        const row = db.prepare(`SELECT audioPath, embeddingCachePath FROM reference_voices WHERE id = ?`).get(referenceVoiceId);
                        if (row && (fs.existsSync(row.audioPath) || (row.embeddingCachePath && fs.existsSync(row.embeddingCachePath)))) {
                            console.log(`[AI Recap] Applying voice clone for scene ${i}`);
                            const { chunks } = await applyVoiceClone([outPath], referenceVoiceId, { sourceMode: 'shared' });
                            if (chunks && chunks[0] && fs.existsSync(chunks[0])) {
                                fs.copyFileSync(chunks[0], outPath);
                            }
                        }
                    } catch (e) {
                        console.error("[AI Recap] Clone failed", e);
                    }
                }

                if (success && fs.existsSync(outPath)) {
                    let durStr;
                    try {
                        durStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outPath}"`).toString().trim();
                    } catch(e) {}
                    const dur = durStr ? parseFloat(durStr) : 2.0;
                    timeline[i].final_dur = dur;
                    narrationClipPaths[i] = outPath;
                } else {
                    timeline[i].final_dur = 0.1;
                }
            });

            await limitConcurrency(ttsTasks, 5);

            fs.writeFileSync(authoritativeTimelinePath, JSON.stringify(timeline, null, 2));


                        // Phase 3: Real Video Assembly
            let originalVideoDur = 0;
            try {
                const durStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourceVideoPath}"`).toString().trim();
                originalVideoDur = parseFloat(durStr) || 0;
            } catch (e) {
                console.error("[AI Recap] Failed to probe sourceVideoPath duration", e);
            }

            const videoSegmentPaths = new Array(scenes.length).fill(null);
            const videoTasks = scenes.map((scene, i) => async () => {
                if (!narrationClipPaths[i]) {
                    return;
                }

                if (originalVideoDur > 0 && scene.source_end > originalVideoDur) {
                    scene.source_end = originalVideoDur;
                }
                
                let source_dur = scene.source_end - scene.source_start;
                if (source_dur <= 0) {
                    console.warn(`[AI Recap] Scene ${i} had invalid timestamps (start=${scene.source_start}, end=${scene.source_end}). Repairing.`);
                    const MIN_SPAN = 2.0; // seconds
                    scene.source_end = Math.min(originalVideoDur > 0 ? originalVideoDur : scene.source_start + MIN_SPAN, scene.source_start + MIN_SPAN);
                    scene.source_start = Math.max(0, scene.source_end - MIN_SPAN);
                    source_dur = scene.source_end - scene.source_start;
                    if (source_dur <= 0) {
                        // Still invalid (e.g. source_start was already at/near video end) — only now actually drop it.
                        narrationClipPaths[i] = null;
                        return;
                    }
                }

                const target_dur = timeline[i].final_dur;
                let segArgs;
                const segPath = path.join(sourcesDir, `${jobId}_seg_${i}.ts`);

                if (source_dur >= target_dur) {
                    // Footage is long enough: play it at NORMAL speed, just take the
                    // first target_dur seconds — never speed up footage.
                    segArgs = [
                        '-y',
                        '-ss', scene.source_start.toString(),
                        '-t', target_dur.toString(),
                        '-i', sourceVideoPath,
                        '-an',
                        '-c:v', 'libx264',
                        '-preset', 'superfast',
                        '-f', 'mpegts',
                        segPath
                    ];
                } else {
                    // Footage is shorter than needed: mild slow-down only (never
                    // slower than 0.5x speed, i.e. never more than 2x
                    // slow-motion), then freeze-pad any remaining shortfall.
                    const speed = Math.max(0.5, source_dur / target_dur);
                    segArgs = [
                        '-y',
                        '-ss', scene.source_start.toString(),
                        '-t', source_dur.toString(),
                        '-i', sourceVideoPath,
                        '-an',
                        '-filter_complex', `[0:v]setpts=${(1/speed).toFixed(4)}*PTS,tpad=stop_mode=clone:stop_duration=${target_dur}[v]`,
                        '-map', '[v]',
                        '-t', target_dur.toString(),
                        '-c:v', 'libx264',
                        '-preset', 'superfast',
                        '-f', 'mpegts',
                        segPath
                    ];
                }

                try {
                    await runFFmpeg(segArgs, sourcesDir, () => {});
                    if (fs.existsSync(segPath) && fs.statSync(segPath).size > 0) {
                        videoSegmentPaths[i] = segPath;
                    } else {
                        console.warn(`[AI Recap] Segment ${i} failed or 0 bytes.`);
                        narrationClipPaths[i] = null;
                    }
                } catch (e) {
                    console.warn(`[AI Recap] ffmpeg error on segment ${i}`, e);
                    narrationClipPaths[i] = null;
                }
            });

            await limitConcurrency(videoTasks, 3);

            const validVideoPaths = videoSegmentPaths.filter(p => p && fs.existsSync(p));
            const silentVideoPath = path.join(sourcesDir, jobId + '_video_silent.mp4');
            const videoConcatListPath = path.join(sourcesDir, `concat_v_${jobId}.txt`);
            
            if (validVideoPaths.length > 0) {
                fs.writeFileSync(videoConcatListPath, validVideoPaths.map(f => `file '${f}'`).join("\n"));
                await runFFmpeg([
                    '-y',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', videoConcatListPath,
                    '-c', 'copy',
                    silentVideoPath
                ], sourcesDir, () => {});
            }

            const validAudioPaths = narrationClipPaths.filter(p => p && fs.existsSync(p));
            const previewAudioPath = path.join(sourcesDir, jobId + '_narration_preview.wav');
            const audioConcatListPath = path.join(sourcesDir, `concat_a_${jobId}.txt`);

            if (validAudioPaths.length > 0) {
                fs.writeFileSync(audioConcatListPath, validAudioPaths.map(f => `file '${f}'`).join("\n"));
                await runFFmpeg([
                    '-y',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', audioConcatListPath,
                    '-c', 'copy',
                    previewAudioPath
                ], sourcesDir, () => {});
            }

            const finalVideoPath = path.join(sourcesDir, jobId + '_final.mp4');
            if (fs.existsSync(silentVideoPath) && fs.existsSync(previewAudioPath)) {
                let filterComplex = '';
                let lastMap = '[0:v]';
                let vidW = 1080;
                let vidH = 1920;
                try {
                    const probeSize = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${silentVideoPath}"`).toString().trim();
                    const parts = probeSize.split('x');
                    if (parts.length === 2) {
                        vidW = parseInt(parts[0], 10);
                        vidH = parseInt(parts[1], 10);
                    }
                } catch(e) {}

                // 1. Blur Pass
                if (blurBoxes && blurBoxes.length > 0) {
                    let mainSplit = '';
                    for (let i = 0; i < blurBoxes.length; i++) {
                        const box = blurBoxes[i];
                        const nextMap = `[out_blur_${i}]`;
                        mainSplit = `[main${i}]`;
                        const blurSplit = `[blur${i}]`;

                        const x = Math.round((box.xPct / 100) * vidW);
                        const y = Math.round((box.yPct / 100) * vidH);
                        const x2 = Math.round(((box.xPct + box.widthPct) / 100) * vidW);
                        const y2 = Math.round(((box.yPct + box.heightPct) / 100) * vidH);
                        const w = Math.max(2, x2 - x);
                        const h = Math.max(2, y2 - y);

                        const strength = Math.min(20, Math.max(1, box.strength || 10));
                        const eff = Math.min(50, Math.round(strength * 1.5) + 5);
                        const maskBlur = Math.min(50, Math.round(eff * 1.2) + 10);
                        const expand = maskBlur + 2;
                        const pad = expand + maskBlur + 2;

                        const cx = Math.max(0, x - pad);
                        const cy = Math.max(0, y - pad);
                        const cw = Math.min(vidW - cx, w + pad * 2);
                        const ch = Math.min(vidH - cy, h + pad * 2);

                        const boxInCropX = x - cx;
                        const boxInCropY = y - cy;
                        const maskX = Math.max(0, boxInCropX - expand);
                        const maskY = Math.max(0, boxInCropY - expand);
                        const maskW = w + expand * 2;
                        const maskH = h + expand * 2;

                        const maskBase = `[mask_base${i}]`;
                        const mask = `[mask${i}]`;
                        const blurCrop = `[blur_crop${i}]`;
                        const blurDone = `[blur_done${i}]`;
                        const alphaBlur = `[alpha_blur${i}]`;

                        filterComplex += `${lastMap}split=2${mainSplit}${blurSplit};`;
                        filterComplex += `${blurSplit}crop=${cw}:${ch}:${cx}:${cy},split=2${blurCrop}${maskBase};`;
                        filterComplex += `${maskBase}drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill,drawbox=x=${maskX}:y=${maskY}:w=${maskW}:h=${maskH}:color=white:t=fill,boxblur=${maskBlur}:1${mask};`;
                        filterComplex += `${blurCrop}boxblur=${eff}:1${blurDone};`;
                        filterComplex += `${blurDone}${mask}alphamerge${alphaBlur};`;
                        filterComplex += `${mainSplit}${alphaBlur}overlay=${cx}:${cy}${nextMap};`;

                        lastMap = nextMap;
                    }
                }

                // 2. Watermark Pass
                if (watermarkText) {
                    const escapedText = watermarkText
                        .replace(/\\/g, "\\\\")
                        .replace(/:/g, "\\:")
                        .replace(/'/g, "\\'")
                        .replace(/%/g, "\\%");
                    
                    const fontfile = '/usr/share/fonts/truetype/padauk/Padauk-Regular.ttf';
                    const xExpr = "abs(mod(t*90\\,2*(W-tw))-(W-tw))";
                    const yExpr = "abs(mod(t*70\\,2*(H-th))-(H-th))";
                    const drawtextFilter = `drawtext=fontfile=${fontfile}:text='${escapedText}':fontsize=40:fontcolor=white@0.35:bordercolor=black@0.2:borderw=1:x=${xExpr}:y=${yExpr}`;

                    const nextMap = `[wm_out]`;
                    filterComplex = filterComplex.replace(/;+\s*$/, '');
                    if (filterComplex) filterComplex += ';';
                    filterComplex += `${lastMap}${drawtextFilter}${nextMap}`;
                    lastMap = nextMap;
                }

                // 3. Subtitle Pass
                let assPath = null;
                if (burnSubtitles) {
                    let cumulativeTime = 0;
                    const subtitleCues = [];
                    for (let i = 0; i < scenes.length; i++) {
                        if (!narrationClipPaths[i]) continue;
                        const dur = timeline[i].final_dur;
                        subtitleCues.push({
                            start: cumulativeTime,
                            end: cumulativeTime + dur,
                            text: scenes[i].narration_text
                        });
                        cumulativeTime += dur;
                    }

                    if (subtitleCues.length > 0) {
                        let pos = subtitlePosition || { xPct: 10, yPct: 78, widthPct: 80, heightPct: 12 };
                        const marginL = Math.round((pos.xPct / 100) * vidW);
                        const marginR = Math.round(vidW - ((pos.xPct + pos.widthPct) / 100) * vidW);
                        const marginV = Math.round((pos.yPct / 100) * vidH);
                        
                        let fontsize = Math.round(((pos.heightPct / 100) * vidH) * 0.6);
                        if (fontsize < 24) fontsize = 24;
                        if (fontsize > 80) fontsize = 80;

                        let fontName = "Padauk";
                        let primaryColor = "&H00FFFFFF";
                        if (subtitleColor === "yellow") primaryColor = "&H0000FFFF";
                        if (subtitleColor === "cyan") primaryColor = "&H00FFFF00";
                        if (subtitleColor === "lime") primaryColor = "&H0000FF00";
                        if (subtitleColor === "magenta") primaryColor = "&H00FF00FF";

                        const toAssTime = (sec) => {
                            const h = Math.floor(sec / 3600);
                            const m = Math.floor((sec % 3600) / 60);
                            const s = Math.floor(sec % 60);
                            const cs = Math.floor((sec % 1) * 100);
                            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
                        };

                        const assHeader = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${vidW}\nPlayResY: ${vidH}\nWrapStyle: 1\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${fontName},${fontsize},${primaryColor},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,8,${marginL},${marginR},${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
                        
                        const assLines = [];
                        subtitleCues.forEach(sub => {
                            const text = (sub.text || '').replace(/\n/g, ' ').trim();
                            if (!text) return;
                            const words = text.split(/\s+/);
                            const pieces = [];
                            let currentPiece = "";
                            for (const word of words) {
                                if (!currentPiece) {
                                    currentPiece = word;
                                } else if (currentPiece.length + 1 + word.length <= 40) {
                                    currentPiece += " " + word;
                                } else {
                                    pieces.push(currentPiece);
                                    currentPiece = word;
                                }
                            }
                            if (currentPiece) pieces.push(currentPiece);

                            const totalCharLength = pieces.reduce((sum, p) => sum + p.length, 0);
                            const totalDur = sub.end - sub.start;
                            
                            let pieceStart = sub.start;
                            for (let i = 0; i < pieces.length; i++) {
                                let pieceEnd;
                                if (i === pieces.length - 1) {
                                    pieceEnd = sub.end;
                                } else {
                                    const pieceDur = (pieces[i].length / totalCharLength) * totalDur;
                                    pieceEnd = pieceStart + pieceDur;
                                }
                                
                                const startStr = toAssTime(pieceStart);
                                const endStr = toAssTime(pieceEnd);
                                const assText = pieces[i];
                                assLines.push(`Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${assText}`);
                                
                                pieceStart = pieceEnd;
                            }
                        });

                        assPath = path.join(sourcesDir, `${jobId}.ass`);
                        fs.writeFileSync(assPath, '\uFEFF' + assHeader + assLines.join('\n') + '\n', 'utf8');

                        const nextMap = `[sub_out]`;
                        filterComplex = filterComplex.replace(/;+\s*$/, '');
                        if (filterComplex) filterComplex += ';';
                        filterComplex += `${lastMap}ass='${assPath.replace(/:/g, '\\:')}'${nextMap}`;
                        lastMap = nextMap;
                    }
                }

                const ffmpegArgs = [
                    '-y',
                    '-i', silentVideoPath,
                    '-i', previewAudioPath
                ];
                
                if (filterComplex) {
                    ffmpegArgs.push('-filter_complex', filterComplex.replace(/;\s*$/, ""));
                    ffmpegArgs.push('-map', lastMap);
                    ffmpegArgs.push('-map', '1:a');
                    ffmpegArgs.push('-c:v', 'libx264');
                    ffmpegArgs.push('-preset', 'fast');
                } else {
                    ffmpegArgs.push('-map', '0:v');
                    ffmpegArgs.push('-map', '1:a');
                    ffmpegArgs.push('-c:v', 'copy');
                }
                
                ffmpegArgs.push('-c:a', 'aac');
                ffmpegArgs.push('-b:a', '192k');
                ffmpegArgs.push('-shortest');
                ffmpegArgs.push(finalVideoPath);
                
                await runFFmpeg(ffmpegArgs, sourcesDir, () => {});
                
                if (assPath && fs.existsSync(assPath)) fs.unlinkSync(assPath);
            }

            // Cleanup temps
            if (fs.existsSync(videoConcatListPath)) fs.unlinkSync(videoConcatListPath);
            if (fs.existsSync(audioConcatListPath)) fs.unlinkSync(audioConcatListPath);
            if (fs.existsSync(silentVideoPath)) fs.unlinkSync(silentVideoPath);
            if (fs.existsSync(previewAudioPath)) fs.unlinkSync(previewAudioPath);
            
            for (const p of videoSegmentPaths) {
                if (p && fs.existsSync(p)) fs.unlinkSync(p);
            }
            for (const p of narrationClipPaths) {
                if (p && fs.existsSync(p)) fs.unlinkSync(p);
            }
            if (fs.existsSync(authoritativeTimelinePath)) fs.unlinkSync(authoritativeTimelinePath);

            if (!fs.existsSync(finalVideoPath) || fs.statSync(finalVideoPath).size === 0) {
                throw new Error("Video assembly failed: no valid segments produced");
            }
            updateProgress(100, 'Done');
            db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'video_done', finalVideoPath = ?, videoCompletedAt = ? WHERE id = ?`).run(finalVideoPath, Date.now(), jobId);

            if (fs.existsSync(sourceVideoPath)) {
                fs.unlinkSync(sourceVideoPath);
            }
        } catch (err) {
            console.error("[AI Recap] Generation failed", err);
            db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'video_error', error = ?, videoCompletedAt = ? WHERE id = ?`).run(err.message || "Generation error", Date.now(), jobId);
            try {
                const files = fs.readdirSync(sourcesDir);
                for (const file of files) {
                    if (file.startsWith(jobId)) {
                        const fp = path.join(sourcesDir, file);
                        if (fs.existsSync(fp)) fs.unlinkSync(fp);
                    }
                }
            } catch(e) {}
        }
    })();
});


router.get('/status/:jobId', authMiddleware, (req, res) => {
    try {
        const row = db.prepare(`SELECT * FROM ai_recap_jobs WHERE id = ? AND userId = ?`).get(req.params.jobId, req.user.id);
        if (!row) {
            return res.status(404).json({ error: 'Job not found' });
        }
        res.json(row);
    } catch (e) {
        console.error("Error fetching job status", e);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});



router.get('/download/:jobId', authMiddleware, (req, res) => {
    try {
        const row = db.prepare(`SELECT * FROM ai_recap_jobs WHERE id = ? AND userId = ?`).get(req.params.jobId, req.user.id);
        if (!row || row.generationStatus !== 'video_done' || !row.finalVideoPath || !fs.existsSync(row.finalVideoPath)) {
            return res.status(404).json({ error: 'Video not found or not ready' });
        }
        res.download(row.finalVideoPath, `recap_${req.params.jobId}.mp4`);
    } catch (e) {
        res.status(500).json({ error: 'Failed to download video' });
    }
});

export default router;
