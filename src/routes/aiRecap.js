import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getSetting } from '../services/settings.js';
import db from '../services/db.js';
import { authMiddleware } from './auth.js';
import { GoogleGenAI } from '@google/genai';
import { generateNarrationTTS } from '../ai/index.js';
import { runFFmpeg } from '../ffmpeg/index.js';

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

function detectSilenceIntervals(videoPath) {
    const cmd = `ffmpeg -i "${videoPath}" -af silencedetect=noise=-30dB:d=1.0 -f null - 2>&1`;
    let output = '';
    try {
        output = execSync(cmd, { maxBuffer: 1024 * 1024 * 50 }).toString();
    } catch (e) {
        output = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
    }
    const intervals = [];
    const startRegex = /silence_start:\s*([\d.]+)/g;
    const endRegex = /silence_end:\s*([\d.]+)/g;
    let starts = [];
    let ends = [];
    let m;
    while ((m = startRegex.exec(output)) !== null) starts.push(parseFloat(m[1]));
    while ((m = endRegex.exec(output)) !== null) ends.push(parseFloat(m[1]));
    for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
        intervals.push({ start: starts[i], end: ends[i] });
    }
    return intervals;
}

async function trimSilence(sourceVideoPath, outputPath, workDir) {
    const SILENCE_THRESHOLD = 3.0;
    const KEEP_BUFFER = 1.2;

    let totalDuration = 0;
    try {
        const durCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourceVideoPath}"`;
        totalDuration = parseFloat(execSync(durCmd).toString().trim());
    } catch (e) {
        console.error("[AI Recap] Failed to get source duration, skipping silence trim", e);
        fs.copyFileSync(sourceVideoPath, outputPath);
        return;
    }

    let rawIntervals = [];
    try {
        rawIntervals = detectSilenceIntervals(sourceVideoPath);
    } catch (e) {
        console.error("[AI Recap] Silence detection failed, skipping trim", e);
    }

    const longSilences = rawIntervals.filter(iv => (iv.end - iv.start) > SILENCE_THRESHOLD);

    let cuts = [];
    for (const iv of longSilences) {
        const cutStart = iv.start + KEEP_BUFFER;
        const cutEnd = iv.end;
        if (cutEnd > cutStart) {
            cuts.push({ cutStart, cutEnd });
        }
    }

    let keepSegments = [];
    let cursor = 0;
    for (const cut of cuts) {
        if (cut.cutStart > cursor) {
            keepSegments.push({ start: cursor, end: cut.cutStart });
        }
        cursor = Math.max(cursor, cut.cutEnd);
    }
    if (cursor < totalDuration) {
        keepSegments.push({ start: cursor, end: totalDuration });
    }
    keepSegments = keepSegments.filter(s => (s.end - s.start) > 0.1);

    if (keepSegments.length === 0) {
        fs.copyFileSync(sourceVideoPath, outputPath);
        return;
    }

    console.log(`[AI Recap] Silence trim: ${longSilences.length} long silences found, ${keepSegments.length} segments kept.`);

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

            const stmt = db.prepare(`UPDATE ai_recap_jobs SET status = 'done', resultJson = ?, cleanedVideoPath = ? WHERE id = ?`);
            stmt.run(JSON.stringify({ trimmed: true }), cleanedVideoPath, jobId);
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
        let blurBoxes = [];
        try { blurBoxes = JSON.parse(blurBoxesRaw); } catch(e) {}
        let subtitlePosition = { xPct: 10, yPct: 78, widthPct: 80, heightPct: 12 };
        try { subtitlePosition = JSON.parse(subtitlePositionRaw); } catch(e) {}
        const watermarkText = (req.body.watermarkText || '').trim();

        const row = db.prepare(`SELECT * FROM ai_recap_jobs WHERE id = ? AND userId = ?`).get(jobId, req.user.id);
        
        if (!row || row.status !== 'done' || !row.resultJson || !row.sourceVideoPath) {
            return res.status(400).json({ error: 'Job not ready for generation' });
        }

        db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'generating' WHERE id = ?`).run(jobId);
        res.json({ started: true });

        (async () => {
            let finalVideoPath = path.join(sourcesDir, jobId + '_final.mp4');
            try {
                const result = JSON.parse(row.resultJson);
                const scenes = result.scenes || [];
                
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
                
                // Cut scenes and concat
                const concatListPath = path.join(sourcesDir, jobId + '_concat.txt');
                let concatContent = '';
                const tempVideoFiles = [];
                
                for (let i = 0; i < scenes.length; i++) {
                    const s = scenes[i];
                    const outPath = path.join(sourcesDir, jobId + '_scene_' + i + '.mp4');
                    tempVideoFiles.push(outPath);
                    
                    let target_dur = s.end - s.start;
                    if (timeline[i] && timeline[i].final_dur) {
                        target_dur = timeline[i].final_dur;
                    }
                    
                    const desired_orig_dur = s.end - s.start;
                    let speed = 1.0;
                    if (desired_orig_dur > 0.1 && target_dur > 0.1) {
                        speed = desired_orig_dur / target_dur;
                        if (speed < 0.35) speed = 0.35;
                        if (speed > 100.0) speed = 100.0;
                    }
                    
                    const filter = `[0:v]setpts=${(1/speed).toFixed(4)}*(PTS-STARTPTS),tpad=stop_mode=clone:stop_duration=${target_dur.toFixed(3)},fps=30,setsar=1,format=yuv420p[v]`;

                    // run ffmpeg to cut
                    await runFFmpeg([
                        '-y',
                        '-ss', String(s.start),
                        '-t', String(desired_orig_dur),
                        '-i', row.sourceVideoPath,
                        '-filter_complex', filter,
                        '-map', '[v]',
                        '-c:v', 'libx264',
                        '-preset', 'veryfast',
                        '-crf', '23',
                        '-an',
                        outPath
                    ], sourcesDir, () => {});
                    
                    concatContent += `file '${outPath}'\n`;
                }
                
                fs.writeFileSync(concatListPath, concatContent);
                
                const concatVideoPath = path.join(sourcesDir, jobId + '_concat.mp4');
                await runFFmpeg([
                    '-y',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', concatListPath,
                    '-c', 'copy',
                    concatVideoPath
                ], sourcesDir, () => {});
                
                // Mux with audio
                await runFFmpeg([
                    '-y',
                    '-i', concatVideoPath,
                    '-i', cachePath,
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-shortest',
                    finalVideoPath
                ], sourcesDir, () => {});
                
                // Get video dimensions for passes
                let vidW = 1080;
                let vidH = 1920;
                try {
                    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${finalVideoPath}"`;
                    const out = execSync(probeCmd).toString().trim();
                    if (out && out.includes('x')) {
                        const parts = out.split('x');
                        vidW = parseInt(parts[0], 10);
                        vidH = parseInt(parts[1], 10);
                    }
                } catch(e) {
                    console.log("[AI Recap] ffprobe failed to get dimensions, using default 1080x1920");
                }

                // BLUR PASS
                if (Array.isArray(blurBoxes) && blurBoxes.length > 0) {
                    try {
                        const blurTmpPath = path.join(sourcesDir, `${jobId}_blur.mp4`);
                        let filterComplex = '';
                        let lastMap = '[0:v]';
                        let splitInputs = '';
                        
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
                        
                        const assLines = timeline.map(sub => {
                            const startStr = toAssTime(sub.final_audio_start || 0);
                            const endStr = toAssTime(sub.final_audio_end || 0);
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
                for (const tempFile of tempVideoFiles) {
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                }
                if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
                if (fs.existsSync(concatVideoPath)) fs.unlinkSync(concatVideoPath);
                
                db.prepare(`UPDATE ai_recap_jobs SET generationStatus = 'video_done', finalVideoPath = ? WHERE id = ?`).run(finalVideoPath, jobId);
                
                // Now delete the source video
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

