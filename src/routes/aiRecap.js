import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
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
                // The generateNarrationTTS uses voiceId string which is looked up.
                const voiceId = 'male-young-adult'; 
                
                await generateNarrationTTS(sceneNarration, cachePath, voiceId, []);
                
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

