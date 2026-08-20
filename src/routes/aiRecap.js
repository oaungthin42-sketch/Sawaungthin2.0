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

async function generateNarrationScript(cleanedVideoPath) {
    const apiKey = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing");
    }
    const ai = new GoogleGenAI({ apiKey });

    console.log(`[AI Recap] Uploading ${cleanedVideoPath} to Gemini...`);
    let fileUpload = await ai.files.upload({
        file: cleanedVideoPath,
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

    const prompt = `You are writing a full Burmese movie recap script. Watch the entire video and provide a sequential narration script that covers the whole plot from start to finish.

REQUIREMENTS:
1. Output ONLY a JSON array of segment objects. No markdown formatting or markdown code fences (\`\`\`).
2. Each segment must have: "start" (number, seconds), "end" (number, seconds), and "narration_text" (string, Burmese).
3. The segments must be sequential, cover the video from 0s to the end without overlapping, and be in ascending chronological order.
4. The narration_text MUST be entirely in natural-sounding Burmese.
5. The start and end values are strictly for subtitle timing and narration synchronization. You are narrating the exact video provided. Do NOT write instructions to skip, re-cut, or re-order scenes.
6. Character names and proper nouns: identify any character names or proper nouns and render them as natural Burmese phonetic transliteration (e.g. "John" -> "ဂျွန်", "Maria" -> "မာရီယာ") rather than leaving them in Latin script. Use the SAME transliteration consistently for the same character every time they are mentioned across the entire script.
7. ZERO ENGLISH CHARACTERS: narration_text must be written 100% in Burmese script — no English letters, Latin acronyms, or digits. Numbers must ALWAYS be fully spelled out as Burmese words, NEVER as Arabic numerals (0-9) or Burmese numerals (၀-၉), no matter how large: 500 -> "ငါးရာ", 1000 -> "တစ်ထောင်", 10000 -> "တစ်သောင်း", 1500 -> "တစ်ထောင့်ငါးရာ". This applies to ages, dates, times, counts, and any other number mentioned in the narration.`;

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
                        start: { type: "NUMBER" },
                        end: { type: "NUMBER" },
                        narration_text: { type: "STRING" }
                    },
                    required: ["start", "end", "narration_text"]
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

router.post('/analyze', authMiddleware, upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
    }

    const jobId = 'recap_' + Date.now();
    const tempVideoPath = req.file.path;
    const sourceVideoPath = path.join(sourcesDir, jobId + path.extname(req.file.originalname));
    fs.renameSync(tempVideoPath, sourceVideoPath);

    try {
        const stmt = db.prepare(`INSERT INTO ai_recap_jobs (id, userId, status, createdAt, sourceVideoPath) VALUES (?, ?, ?, ?, ?)`);
        stmt.run(jobId, req.user.id, 'processing', Date.now(), sourceVideoPath);
    } catch (e) {
        console.error("Error creating recap job", e);
        if (fs.existsSync(sourceVideoPath)) fs.unlinkSync(sourceVideoPath);
        return res.status(500).json({ error: 'Failed to create job' });
    }

    res.json({ jobId });

    (async () => {
        try {
            const cleanedVideoPath = path.join(sourcesDir, jobId + '_cleaned.mp4');
            console.log(`[AI Recap] Trimming silence for job ${jobId}...`);
            await trimSilence(sourceVideoPath, cleanedVideoPath, sourcesDir);
            console.log(`[AI Recap] Silence trim complete for job ${jobId}.`);

            console.log(`[AI Recap] Generating narration script for job ${jobId}...`);
            const scenes = await generateNarrationScript(cleanedVideoPath);
            console.log(`[AI Recap] Narration script generated successfully.`);

            const stmt = db.prepare(`UPDATE ai_recap_jobs SET status = 'done', resultJson = ?, cleanedVideoPath = ? WHERE id = ?`);
            stmt.run(JSON.stringify({ scenes }), cleanedVideoPath, jobId);
        } catch (e) {
            console.error("[AI Recap] Job failed", e);
            const stmt = db.prepare(`UPDATE ai_recap_jobs SET status = 'error', error = ? WHERE id = ?`);
            stmt.run(e.message || "Unknown error", jobId);
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

router.post('/generate/:jobId', authMiddleware, async (req, res) => {
    try {
        const jobId = req.params.jobId;
        const voiceId = req.body.voiceId || 'male-young-adult';
        const useVoiceClone = req.body.useVoiceClone === 1 || req.body.useVoiceClone === '1' ? 1 : 0;
        const referenceVoiceId = req.body.referenceVoiceId || null;
        const blurBoxesRaw = req.body.blurBoxes || '[]';
        const burnSubtitles = req.body.burnSubtitles === true || req.body.burnSubtitles === 'true';
        const subtitleColor = req.body.subtitleColor || 'white';
        const subtitlePositionRaw = req.body.subtitlePosition || '{"xPct":10,"yPct":78,"widthPct":80,"heightPct":12}';
        const flipped = req.body.flipped === '1' || req.body.flipped === 1 || req.body.flipped === 'true' || req.body.flipped === true;
        let blurBoxes = [];
        try { blurBoxes = JSON.parse(blurBoxesRaw); } catch(e) {}
        let subtitlePosition = { xPct: 10, yPct: 78, widthPct: 80, heightPct: 12 };
        try { subtitlePosition = JSON.parse(subtitlePositionRaw); } catch(e) {}
        const watermarkText = (req.body.watermarkText || '').trim();

        const row = db.prepare(`SELECT * FROM ai_recap_jobs WHERE id = ? AND userId = ?`).get(jobId, req.user.id);
        
        if (!row || row.status !== 'done' || !row.resultJson || !row.cleanedVideoPath || !fs.existsSync(row.cleanedVideoPath)) {
            return res.status(400).json({ error: 'Job not ready for generation or cleaned video missing' });
        }

        db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'generating' WHERE id = ?`).run(jobId);
        res.json({ started: true });

        (async () => {
            let finalVideoPath = path.join(sourcesDir, jobId + '_final.mp4');
            try {
                const result = JSON.parse(row.resultJson);
                const scenes = result.scenes || [];
                
                if (scenes.length === 0) {
                    throw new Error("No scenes found to generate");
                }

                const sceneNarration = scenes.map(s => ({
                    narration_text: s.narration_text,
                    scene_start: s.start,
                    scene_end: s.end
                }));

                const cachePath = path.join(sourcesDir, jobId + '_narration.wav');
                
                await generateNarrationTTS(sceneNarration, cachePath, voiceId, [], {
                    useVoiceClone: useVoiceClone,
                    referenceVoiceId: referenceVoiceId,
                    sourceMode: 'shared'
                });
                
                const authoritativeTimelinePath = cachePath + '.timeline.json';
                let timeline = [];
                if (fs.existsSync(authoritativeTimelinePath)) {
                    timeline = JSON.parse(fs.readFileSync(authoritativeTimelinePath, 'utf8'));
                }
                
                // Split narration into per-scene wavs
                const narrationClipPaths = [];
                for (let i = 0; i < scenes.length; i++) {
                    const sub = timeline[i] || {};
                    const outPath = path.join(sourcesDir, `${jobId}_narr_${i}.wav`);
                    narrationClipPaths.push(outPath);
                    
                    const start = sub.final_audio_start || 0;
                    const end = sub.final_audio_end || 0;
                    
                    await runFFmpeg([
                        '-y',
                        '-ss', String(start),
                        '-to', String(end),
                        '-i', cachePath,
                        '-c:a', 'copy',
                        outPath
                    ], sourcesDir, () => {});
                }
                
                // Build duck-and-overlay filter_complex
                let filterGraph = '';
                let lastDuck = '0:a';
                
                for (let i = 0; i < scenes.length; i++) {
                    const sub = timeline[i] || {};
                    const sStart = scenes[i].start;
                    const sEnd = sStart + (sub.final_dur || 0);
                    const nextDuck = `duck${i}`;
                    
                    filterGraph += `[${lastDuck}]volume=0.03:enable='between(t,${sStart.toFixed(3)},${sEnd.toFixed(3)})'[${nextDuck}];`;
                    lastDuck = nextDuck;
                }
                
                filterGraph += `[${lastDuck}]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[duckfinal];`;
                
                let mixInputs = `[duckfinal]`;
                for (let i = 0; i < scenes.length; i++) {
                    const delayMs = Math.round(scenes[i].start * 1000);
                    filterGraph += `[${i+1}:a]adelay=delays=${delayMs}:all=1[aud${i}_delayed];`;
                    filterGraph += `[aud${i}_delayed]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aud${i}];`;
                    mixInputs += `[aud${i}]`;
                }
                
                const totalInputs = scenes.length + 1;
                filterGraph += `${mixInputs}amix=inputs=${totalInputs}:duration=first:dropout_transition=0[aout]`;
                
                if (flipped) {
                    filterGraph += `;[0:v]hflip[vout]`;
                }
                
                // Run single ffmpeg command for audio overlay
                const overlayArgs = ['-y', '-i', row.cleanedVideoPath];
                for (const p of narrationClipPaths) {
                    overlayArgs.push('-i', p);
                }
                
                overlayArgs.push(
                    '-filter_complex', filterGraph
                );
                
                if (flipped) {
                    overlayArgs.push(
                        '-map', '[vout]',
                        '-map', '[aout]',
                        '-c:v', 'libx264',
                        '-preset', 'veryfast',
                        '-crf', '23',
                        '-c:a', 'aac',
                        finalVideoPath
                    );
                } else {
                    overlayArgs.push(
                        '-map', '0:v:0',
                        '-map', '[aout]',
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        finalVideoPath
                    );
                }
                
                await runFFmpeg(overlayArgs, sourcesDir, () => {});
                
                // BLUR PASS
                if (Array.isArray(blurBoxes) && blurBoxes.length > 0) {
                    try {
                        const blurTmpPath = path.join(sourcesDir, `${jobId}_blur.mp4`);
                        let filterComplex = '';
                        let lastMap = '[0:v]';
                        let splitInputs = '';
                        
                        const vidWCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=noprint_wrappers=1:nokey=1 "${finalVideoPath}"`;
                        const vidHCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "${finalVideoPath}"`;
                        const vidW = parseInt(execSync(vidWCmd).toString().trim());
                        const vidH = parseInt(execSync(vidHCmd).toString().trim());

                        for (let i = 0; i < blurBoxes.length; i++) {
                            const box = blurBoxes[i];
                            const x = Math.round((box.xPct / 100) * vidW);
                            const y = Math.round((box.yPct / 100) * vidH);
                            const x2 = Math.round(((box.xPct + box.widthPct) / 100) * vidW);
                            const y2 = Math.round(((box.yPct + box.heightPct) / 100) * vidH);
                            const w = Math.max(2, x2 - x);
                            const h = Math.max(2, y2 - y);
                            
                            const strength = Math.min(30, Math.max(1, box.strength || 10));
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
                            const maskW = Math.min(cw, boxInCropX + w + expand) - maskX;
                            const maskH = Math.min(ch, boxInCropY + h + expand) - maskY;
                            
                            const nextMap = `[v${i}]`;
                            const mainSplit = `[main${i}]`;
                            const blurSplit = `[blur${i}]`;
                            
                            splitInputs += `${lastMap}split=2${mainSplit}${blurSplit};`;
                            filterComplex += `${blurSplit}crop=${cw}:${ch}:${cx}:${cy},split=2[crop_content${i}][crop_mask${i}];`;
                            filterComplex += `[crop_mask${i}]drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill,drawbox=x=${maskX}:y=${maskY}:w=${maskW}:h=${maskH}:color=white:t=fill,boxblur=${maskBlur}:1[mask_done${i}];`;
                            filterComplex += `[crop_content${i}]boxblur=${eff}:1,boxblur=${eff}:1[blur_done${i}];`;
                            filterComplex += `[blur_done${i}][mask_done${i}]alphamerge[alpha_blur${i}];`;
                            filterComplex += `${mainSplit}[alpha_blur${i}]overlay=${cx}:${cy}${nextMap};`;
                            
                            lastMap = nextMap;
                        }
                        
                        let combinedBlurFilter = (splitInputs + filterComplex).trim();
                        if (combinedBlurFilter.endsWith(';')) {
                            combinedBlurFilter = combinedBlurFilter.slice(0, -1);
                        }

                        const blurArgs = [
                            '-y',
                            '-i', finalVideoPath,
                            '-filter_complex', combinedBlurFilter,
                            '-map', lastMap,
                            '-map', '0:a?',
                            '-c:a', 'copy',
                            '-c:v', 'libx264',
                            '-preset', 'fast',
                            blurTmpPath
                        ];
                        
                        await runFFmpeg(blurArgs, sourcesDir, () => {});
                        if (fs.existsSync(blurTmpPath) && fs.statSync(blurTmpPath).size > 0) {
                            fs.unlinkSync(finalVideoPath);
                            fs.renameSync(blurTmpPath, finalVideoPath);
                        }
                    } catch (e) {
                        console.error("[AI Recap] Blur pass failed", e);
                    }
                }

                // WATERMARK PASS
                if (watermarkText) {
                    try {
                        const wmTmpPath = path.join(sourcesDir, `${jobId}_watermark.mp4`);
                        let escapedText = watermarkText
                            .replace(/\\/g, "\\\\")
                            .replace(/:/g, "\\:")
                            .replace(/'/g, "\\'")
                            .replace(/%/g, "\\%");
                        const fontfile = '/usr/share/fonts/truetype/padauk/Padauk-Regular.ttf';
                        const xExpr = "abs(mod(t*90\\,2*(W-tw))-(W-tw))";
                        const yExpr = "abs(mod(t*70\\,2*(H-th))-(H-th))";
                        const drawtextFilter = `drawtext=fontfile=${fontfile}:text='${escapedText}':fontsize=40:fontcolor=white@0.35:bordercolor=black@0.2:borderw=1:x=${xExpr}:y=${yExpr}`;
                        const wmArgs = [
                            '-y',
                            '-i', finalVideoPath,
                            '-vf', drawtextFilter,
                            '-c:a', 'copy',
                            '-c:v', 'libx264',
                            '-preset', 'fast',
                            wmTmpPath
                        ];
                        await runFFmpeg(wmArgs, sourcesDir, () => {});
                        if (fs.existsSync(wmTmpPath) && fs.statSync(wmTmpPath).size > 0) {
                            fs.unlinkSync(finalVideoPath);
                            fs.renameSync(wmTmpPath, finalVideoPath);
                        }
                    } catch (e) {
                        console.error("[AI Recap] Watermark pass failed", e);
                    }
                }

                // SUBTITLE PASS
                if (burnSubtitles && timeline.length > 0) {
                    try {
                        const subTmpPath = path.join(sourcesDir, `${jobId}_subburn.mp4`);
                        const pos = subtitlePosition;
                        
                        const vidWCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=noprint_wrappers=1:nokey=1 "${finalVideoPath}"`;
                        const vidHCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "${finalVideoPath}"`;
                        const vidW = parseInt(execSync(vidWCmd).toString().trim());
                        const vidH = parseInt(execSync(vidHCmd).toString().trim());
                        
                        const marginL = Math.round((pos.xPct / 100) * vidW);
                        const marginR = Math.round(vidW - ((pos.xPct + pos.widthPct) / 100) * vidW);
                        const marginV = Math.round((pos.yPct / 100) * vidH);
                        
                        let fontsize = Math.round(((pos.heightPct / 100) * vidH) * 0.6);
                        if (fontsize < 24) fontsize = 24;
                        if (fontsize > 80) fontsize = 80;
                        
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
                        
                        const assHeader = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${vidW}\nPlayResY: ${vidH}\nWrapStyle: 1\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Padauk,${fontsize},${primaryColor},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,8,${marginL},${marginR},${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
                        
                        const assLines = timeline.map((sub, i) => {
                            const sStart = scenes[i]?.start || 0;
                            const sEnd = sStart + (sub.final_dur || 0);
                            const startStr = toAssTime(sStart);
                            const endStr = toAssTime(sEnd);
                            const assText = (sub.text || '').replace(/\n/g, '\\N');
                            return `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${assText}`;
                        });
                        
                        const assPath = path.join(sourcesDir, jobId + ".ass");
                        fs.writeFileSync(assPath, '\uFEFF' + assHeader + assLines.join('\n') + '\n', 'utf8');
                        
                        const filterComplex = `[0:v]ass='${assPath.replace(/:/g, '\\:')}'[v]`;
                        
                        const subArgs = [
                            '-y',
                            '-i', finalVideoPath,
                            '-filter_complex', filterComplex,
                            '-map', '[v]',
                            '-map', '0:a?',
                            '-c:a', 'copy',
                            '-c:v', 'libx264',
                            '-preset', 'fast',
                            subTmpPath
                        ];
                        
                        await runFFmpeg(subArgs, sourcesDir, () => {});
                        if (fs.existsSync(subTmpPath) && fs.statSync(subTmpPath).size > 0) {
                            fs.unlinkSync(finalVideoPath);
                            fs.renameSync(subTmpPath, finalVideoPath);
                        }
                        if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
                    } catch (e) {
                        console.error("[AI Recap] Subtitle pass failed", e);
                    }
                }
                
                // Cleanup temps
                for (const p of narrationClipPaths) {
                    if (fs.existsSync(p)) fs.unlinkSync(p);
                }
                if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
                if (fs.existsSync(authoritativeTimelinePath)) fs.unlinkSync(authoritativeTimelinePath);
                
                db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'video_done', finalVideoPath = ? WHERE id = ?`).run(finalVideoPath, jobId);
                
                if (fs.existsSync(row.sourceVideoPath)) {
                    fs.unlinkSync(row.sourceVideoPath);
                }
            } catch (err) {
                console.error("[AI Recap] Generation failed", err);
                db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'video_error', error = ? WHERE id = ?`).run(err.message || "Generation error", jobId);
            }
        })();
    } catch (e) {
        console.error("Error starting generation", e);
        res.status(500).json({ error: 'Failed to start generation' });
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
