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

    const styleGuide = getTranslationSystemInstruction();
    const prompt = `${styleGuide}

---

IMPORTANT — READ CAREFULLY, THIS OVERRIDES THE TASK AND OUTPUT FORMAT DESCRIBED ABOVE:

All the style and translation rules above still apply to this task. But ignore the "Input format" / "Output format" JSON example described above — this task uses a different format, specified below.

YOUR TASK: Watch and listen to the attached video carefully. It has already been edited to contain ONLY the scenes where characters are speaking — non-speaking portions have already been removed. Transcribe and translate ONLY the actual dialogue/lines that characters literally speak in the audio, translated into natural spoken Burmese following every style rule above.

Do NOT act as a narrator. Do NOT write a third-person plot summary, exposition, or explanation of what is happening on screen (e.g. do not write things like "In this scene, the character decides to..." or "Meanwhile, at the village..."). Only translate the literal words the characters say — the same way you would for dubbing a movie, not summarizing it.

REQUIRED OUTPUT FORMAT:
1. Output ONLY a JSON array of segment objects. No markdown formatting or markdown code fences (\`\`\`).
2. Each segment must have: "start" (number, seconds), "end" (number, seconds), and "narration_text" (string, Burmese) — narration_text is the Burmese translation of the dialogue spoken during that time range.
3. Segments must be sequential, cover the video from 0s to the end without overlapping, and be in ascending chronological order. Each segment should correspond to a natural spoken line or short group of consecutive lines — do not merge the entire video into one giant segment, and do not invent a segment for a time range where nobody is actually speaking.
4. The start and end values are strictly for subtitle timing and narration synchronization. You are translating the exact video provided, in its exact chronological order. Do NOT write instructions to skip, re-cut, or re-order scenes.`;

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

            const cleanedVideoPath = path.join(sourcesDir, jobId + '_cleaned.mp4');
            console.log(`[AI Recap] Trimming silence for job ${jobId}...`);
            updateProgress(5, 'Trimming silence...');
            await trimSilence(sourceVideoPath, cleanedVideoPath, sourcesDir);
            console.log(`[AI Recap] Silence trim complete for job ${jobId}.`);

            console.log(`[AI Recap] Generating narration script for job ${jobId}...`);
            updateProgress(20, 'Analyzing video and generating narration...');
            const scenes = await generateNarrationScript(cleanedVideoPath);
            console.log(`[AI Recap] Narration script generated successfully.`);
            
            db.prepare(`UPDATE ai_recap_jobs SET status = 'done', resultJson = ?, cleanedVideoPath = ? WHERE id = ?`).run(JSON.stringify({ scenes }), cleanedVideoPath, jobId);

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

            const finalVideoPath = path.join(sourcesDir, jobId + '_final.mp4');

            // Build duck-and-overlay filter_complex
            const actualStart = new Array(scenes.length);
            if (scenes.length > 0) {
                actualStart[0] = scenes[0].start;
                for (let i = 1; i < scenes.length; i++) {
                    actualStart[i] = Math.max(scenes[i].start, actualStart[i-1] + (timeline[i-1].final_dur || 0));
                }
            }
            // Update scenes/timeline start so subtitles align correctly with delayed audio
            for (let i = 0; i < scenes.length; i++) {
                scenes[i].start = actualStart[i];
            }

            let filterGraph = '';
            let lastDuck = '0:a';
            
            for (let i = 0; i < scenes.length; i++) {
                const sub = timeline[i] || {};
                const sStart = actualStart[i];
                let sEnd = Math.max(scenes[i].end, sStart + (sub.final_dur || 0));
                
                if (i < scenes.length - 1) {
                    sEnd = Math.max(sEnd, actualStart[i+1]);
                }
                
                const nextDuck = `duck${i}`;
                
                filterGraph += `[${lastDuck}]volume=0.0:enable='between(t,${sStart.toFixed(3)},${sEnd.toFixed(3)})'[${nextDuck}];`;
                lastDuck = nextDuck;
            }
            
            filterGraph += `[${lastDuck}]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[duckfinal];`;
            
            let mixInputs = `[duckfinal]`;
            let currentInputIndex = 1;
            let validScenesCount = 0;
            const ffmpegInputArgs = [];
            
            for (let i = 0; i < scenes.length; i++) {
                const p = narrationClipPaths[i];
                if (p) {
                    ffmpegInputArgs.push('-i', p);
                    const delayMs = Math.round(actualStart[i] * 1000);
                    filterGraph += `[${currentInputIndex}:a]adelay=delays=${delayMs}:all=1[aud${i}_delayed];`;
                    filterGraph += `[aud${i}_delayed]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aud${i}];`;
                    mixInputs += `[aud${i}]`;
                    currentInputIndex++;
                    validScenesCount++;
                }
            }
            
            const totalInputs = validScenesCount + 1;
            filterGraph += `${mixInputs}amix=inputs=${totalInputs}:duration=first:dropout_transition=0:normalize=0[aout]`;
            
            if (flipped) {
                filterGraph += `;[0:v]hflip[vout]`;
            }
            
            // Run single ffmpeg command for audio overlay
            const overlayArgs = ['-y', '-i', cleanedVideoPath];
            for (const arg of ffmpegInputArgs) {
                overlayArgs.push(arg);
            }
            overlayArgs.push('-filter_complex', filterGraph);
            
            if (flipped) {
                overlayArgs.push('-map', '[vout]');
            } else {
                overlayArgs.push('-map', '0:v');
            }
            
            overlayArgs.push('-map', '[aout]', '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', finalVideoPath);

            updateProgress(70, 'Mixing audio and generating final video...');
            await runFFmpeg(overlayArgs, sourcesDir, () => {});

            // BLUR PASS
            if (blurBoxes && blurBoxes.length > 0) {
                updateProgress(80, 'Applying blur effects...');
                try {
                    const blurTmpPath = path.join(sourcesDir, `${jobId}_blur.mp4`);
                    const vidWCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=noprint_wrappers=1:nokey=1 "${finalVideoPath}"`;
                    const vidHCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "${finalVideoPath}"`;
                    const vidW = parseInt(execSync(vidWCmd).toString().trim());
                    const vidH = parseInt(execSync(vidHCmd).toString().trim());
                    
                    let filterComplex = '';
                    let lastMap = '[0:v]';
                    
                    blurBoxes.forEach((box, index) => {
                        const x = Math.round((box.xPct / 100) * vidW);
                        const y = Math.round((box.yPct / 100) * vidH);
                        const x2 = Math.round(((box.xPct + box.widthPct) / 100) * vidW);
                        const y2 = Math.round(((box.yPct + box.heightPct) / 100) * vidH);
                        const w = Math.max(2, x2 - x);
                        const h = Math.max(2, y2 - y);

                        const strength = Math.min(30, Math.max(1, box.strength || 15));
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

                        const nextMap = `[v${index}]`;
                        const mainSplit = `[main${index}]`;
                        const blurSplit = `[blur${index}]`;
                        const maskBase = `[mask_base${index}]`;
                        const mask = `[mask${index}]`;
                        const blurCrop = `[blur_crop${index}]`;
                        const blurDone = `[blur_done${index}]`;
                        const alphaBlur = `[alpha_blur${index}]`;

                        filterComplex += `${lastMap}split=2${mainSplit}${blurSplit};`;
                        filterComplex += `${blurSplit}crop=${cw}:${ch}:${cx}:${cy},split=2${blurCrop}${maskBase};`;
                        filterComplex += `${maskBase}drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill,drawbox=x=${maskX}:y=${maskY}:w=${maskW}:h=${maskH}:color=white:t=fill,boxblur=${maskBlur}:1${mask};`;
                        filterComplex += `${blurCrop}boxblur=${eff}:1,boxblur=${eff}:1${blurDone};`;
                        filterComplex += `${blurDone}${mask}alphamerge${alphaBlur};`;
                        filterComplex += `${mainSplit}${alphaBlur}overlay=${cx}:${cy}${nextMap};`;
                        
                        lastMap = nextMap;
                    });
                    
                    const blurArgs = [
                        '-y',
                        '-i', finalVideoPath,
                        '-filter_complex', filterComplex.replace(/;$/, ''),
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
                updateProgress(85, 'Adding watermark...');
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
                updateProgress(90, 'Burning subtitles...');
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
                    
                    const assLines = [];
                    for (let i = 0; i < timeline.length; i++) {
                        const sub = timeline[i] || {};
                        const sStart = scenes[i]?.start || 0;
                        const duration = (sub.final_dur || 0);
                        const sEnd = sStart + duration;
                        const text = (sub.text || scenes[i].narration_text || '').trim();
                        if (!text) continue;

                        const words = text.split(/\s+/);
                        const pieces = [];
                        let currentPiece = '';

                        for (const word of words) {
                            if (!word) continue;
                            if (!currentPiece) {
                                currentPiece = word;
                            } else {
                                if (currentPiece.length + 1 + word.length > 40) {
                                    pieces.push(currentPiece);
                                    currentPiece = word;
                                } else {
                                    currentPiece += ' ' + word;
                                }
                            }
                        }
                        if (currentPiece) pieces.push(currentPiece);

                        if (pieces.length === 0) continue;

                        const totalChars = pieces.reduce((sum, p) => sum + p.length, 0);
                        let currentStart = sStart;
                        
                        pieces.forEach((piece, pIdx) => {
                            let pieceDuration = 0;
                            if (totalChars > 0) {
                                pieceDuration = (piece.length / totalChars) * duration;
                            } else {
                                pieceDuration = duration / pieces.length;
                            }

                            let pieceEnd = currentStart + pieceDuration;
                            if (pIdx === pieces.length - 1) {
                                pieceEnd = sEnd;
                            }

                            const startStr = toAssTime(currentStart);
                            const endStr = toAssTime(pieceEnd);
                            const assText = piece.trim().replace(/\n/g, '\\N');
                            
                            assLines.push(`Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${assText}`);
                            
                            currentStart = pieceEnd;
                        });
                    }
                    
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
                if (p && fs.existsSync(p)) fs.unlinkSync(p);
            }
            if (fs.existsSync(authoritativeTimelinePath)) fs.unlinkSync(authoritativeTimelinePath);
            
            updateProgress(100, 'Done');
            db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'video_done', finalVideoPath = ?, videoCompletedAt = ? WHERE id = ?`).run(finalVideoPath, Date.now(), jobId);
            
            if (fs.existsSync(sourceVideoPath)) {
                fs.unlinkSync(sourceVideoPath);
            }

        } catch (err) {
            console.error("[AI Recap] Generation failed", err);
            db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'video_error', error = ?, videoCompletedAt = ? WHERE id = ?`).run(err.message || "Generation error", Date.now(), jobId);
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
