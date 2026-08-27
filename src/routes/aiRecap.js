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
import { getTranslationSystemInstruction } from '../ai/translation.js';
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

    const styleGuide = getTranslationSystemInstruction();
    const prompt = `${styleGuide}

---

IMPORTANT — READ CAREFULLY, THIS OVERRIDES THE TASK AND OUTPUT FORMAT DESCRIBED ABOVE:

All the style and translation rules above still apply to this task. But ignore the "Input format" / "Output format" JSON example described above — this task uses a different format, specified below.

YOUR TASK: Watch this movie clip in full, from start to end — it has
NOT been cut or trimmed, so it includes both dialogue and
non-dialogue (action, transition, establishing, reaction) scenes.
Understand the complete story: the sequence of events, the
characters and their relationships, their motivations, the
cause-and-effect between scenes, and how the story resolves.

Then write a Burmese-language movie recap narration script — the way
a narrator explains a movie's plot to someone who hasn't seen it
(third-person, explanatory, summarizing). Do NOT translate or
transcribe literal dialogue lines, and do NOT quote spoken lines
directly — paraphrase and summarize what happens in your own words.

Cover the story from beginning to end: setup, rising events, climax,
and resolution. Mention key characters (by name if known, otherwise
by description), their relationships, and important turning points.
Do not invent events that are not shown or clearly implied in the
video.

Break the narration into short segments, roughly 1-3 sentences each,
in the order they should be spoken. For EACH segment, also provide a
\`source_start\` and \`source_end\` timestamp in seconds, referencing a
span in the ORIGINAL video (the one you were given) whose visuals
best match what that narration segment describes — this footage will
later be shown on screen while that narration segment plays, so pick
a span that makes visual sense for it. The source span does not need
to be a dialogue scene — pick whichever portion (action, reaction,
establishing shot, dialogue, etc.) best illustrates the point.
source_start/source_end should generally follow the movie's
chronological order across segments, except when a segment is
intentionally referencing an earlier moment (e.g. a flashback-style
narration line).

REQUIRED OUTPUT FORMAT:
1. Output ONLY a JSON array of segment objects. No markdown formatting or markdown code fences (\`\`\`).
2. Each segment must have: "source_start" (number, seconds), "source_end" (number, seconds), and "narration_text" (string, Burmese).
3. Narration segments must be in the order they should be spoken. Each segment should correspond to a short group of sentences — do not merge the entire script into one giant segment.
4. Ensure source_start and source_end values are valid (within the video's duration, and source_end > source_start).`;

    console.log(`[AI Recap] Calling generateContent for narration script...`);
    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
            {
                role: "user",
                parts: [
                    { fileData: { fileUri: fileUpload.uri, mimeType: fileUpload.mimeType } },
                    { text: prompt }
                ]
            }
        ],
        config: {
            responseMimeType: "application/json",
            responseSchema: {
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
        }
    });

    try {
        await ai.files.delete({ name: fileUpload.name });
        console.log(`[AI Recap] Deleted file ${fileUpload.name} from Gemini`);
    } catch (e) {
        console.error("[AI Recap] Failed to delete file from Gemini:", e);
    }

    if (!response.text) {
        throw new Error("Empty response from Gemini.");
    }
    
    let parsed;
    try {
        parsed = JSON.parse(response.text);
    } catch (e) {
        throw new Error(`Failed to parse Gemini response as JSON. Response was: ${response.text}`);
    }
    
    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Gemini returned an empty or invalid array.");
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
            const narrationClipPaths = [];
            for (let i = 0; i < scenes.length; i++) {
                updateProgress(40 + (30 * (i / scenes.length)), `Generating audio for scene ${i + 1}/${scenes.length}`);
                const sub = timeline[i] || {};
                const ttsText = sub.text || scenes[i].narration_text || '';
                
                if (!ttsText.trim()) {
                    narrationClipPaths.push(null);
                    timeline[i].final_dur = 0.1;
                    continue;
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
                    narrationClipPaths.push(outPath);
                } else {
                    narrationClipPaths.push(null);
                    timeline[i].final_dur = 0.1;
                }
            }

            fs.writeFileSync(authoritativeTimelinePath, JSON.stringify(timeline, null, 2));


            // TEMPORARY (Phase 1): outputs narration audio only for review.
            // Phase 3 will replace this with real video assembly — matching each
            // segment's source_start/source_end footage, speed-adjusting it to
            // the segment's TTS duration, concatenating segments, muting original
            // audio, then re-applying blur/watermark/subtitle passes.

            const previewAudioPath = path.join(sourcesDir, jobId + '_narration_preview.wav');
            const validAudioPaths = narrationClipPaths.filter(p => p && fs.existsSync(p));
            if (validAudioPaths.length > 0) {
                const concatListPath = path.join(sourcesDir, `concat_${jobId}.txt`);
                fs.writeFileSync(concatListPath, validAudioPaths.map(f => `file '${f}'`).join('\n'));
                await runFFmpeg([
                    '-y',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', concatListPath,
                    '-c', 'copy',
                    previewAudioPath
                ], sourcesDir, () => {});
                if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
            }

            // Cleanup temps
            for (const p of narrationClipPaths) {
                if (p && fs.existsSync(p)) fs.unlinkSync(p);
            }
            if (fs.existsSync(authoritativeTimelinePath)) fs.unlinkSync(authoritativeTimelinePath);

            updateProgress(100, 'Done');
            db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'video_done', finalVideoPath = ?, videoCompletedAt = ? WHERE id = ?`).run(previewAudioPath, Date.now(), jobId);

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
