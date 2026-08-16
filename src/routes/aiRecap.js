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

router.post('/analyze', authMiddleware, upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
    }

    const jobId = 'recap_' + Date.now();
    const tempVideoPath = req.file.path;
    const sourceVideoPath = path.join(sourcesDir, jobId + path.extname(req.file.originalname));
    fs.renameSync(tempVideoPath, sourceVideoPath);
    const videoPath = sourceVideoPath;
    
    // Create job row
    try {
        const stmt = db.prepare(`INSERT INTO ai_recap_jobs (id, userId, status, createdAt, sourceVideoPath) VALUES (?, ?, ?, ?, ?)`);
        stmt.run(jobId, req.user.id, 'processing', Date.now(), sourceVideoPath);
    } catch (e) {
        console.error("Error creating recap job", e);
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        return res.status(500).json({ error: 'Failed to create job' });
    }

    res.json({ jobId });

    // Background processing
    (async () => {
        try {
            const apiKey = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error("GEMINI_API_KEY is missing");
            }
            
            const ai = new GoogleGenAI({ apiKey });

            console.log(`[AI Recap] Uploading ${videoPath} to Gemini...`);
            let fileUpload = await ai.files.upload({
                file: videoPath,
                config: { mimeType: req.file.mimetype },
            });

            console.log(`[AI Recap] File uploaded. URI: ${fileUpload.uri}, Name: ${fileUpload.name}`);

            // Poll until active
            let state = fileUpload.state;
            while (state === 'PROCESSING') {
                await new Promise(resolve => setTimeout(resolve, 5000));
                fileUpload = await ai.files.get({ name: fileUpload.name });
                state = fileUpload.state;
                console.log(`[AI Recap] File state: ${state}`);
            }

            if (state === 'FAILED') {
                throw new Error("Gemini file processing failed");
            }

            const prompt = "You are analyzing a C-Drama / movie video to prepare a Burmese movie recap short. Watch the entire video and: (1) Identify only the scenes that matter for the story — plot-relevant dialogue, key reactions, turning points. (2) Exclude filler: long silent walking, repeated shots, redundant establishing shots, scenes that don't move the story forward. (3) Order the selected scenes for a fast-paced, engaging recap — you may reorder non-chronologically for a strong opening hook if that serves the story better. (4) For EACH selected scene, write a short natural Burmese narration line (1-2 sentences) to be read aloud while that specific scene plays — written 100% in Burmese, no markdown, no labels. The narration lines should flow naturally into each other when read in the order the scenes will play, forming a cohesive recap story overall, but each line must specifically correspond to and make sense timed against its own scene.";
            console.log(`[AI Recap] Calling generateContent...`);
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
                        type: "OBJECT",
                        properties: {
                            scenes: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        start: { type: "NUMBER" },
                                        end: { type: "NUMBER" },
                                        reason: { type: "STRING" },
                                        narration_text: { type: "STRING" }
                                    },
                                    required: ["start", "end", "reason", "narration_text"]
                                }
                            }
                        },
                        required: ["scenes"]
                    }
                }
            });

            const responseText = response.text;
            
            // Delete from Gemini
            try {
                await ai.files.delete({ name: fileUpload.name });
                console.log(`[AI Recap] Deleted file ${fileUpload.name} from Gemini`);
            } catch (e) {
                console.error("[AI Recap] Failed to delete file from Gemini:", e);
            }

            // Save result
            const stmt = db.prepare(`UPDATE ai_recap_jobs SET status = 'done', resultJson = ? WHERE id = ?`);
            stmt.run(responseText, jobId);

        } catch (e) {
            console.error("[AI Recap] Job failed", e);
            const stmt = db.prepare(`UPDATE ai_recap_jobs SET status = 'error', error = ? WHERE id = ?`);
            stmt.run(e.message || "Unknown error", jobId);
        } finally {
            // Video is kept for generation phase
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
                        
                        const blurArgs = [
                            '-y',
                            '-i', finalVideoPath,
                            '-filter_complex', splitInputs + filterComplex,
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

