import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getSetting } from '../services/settings.js';
import db from '../services/db.js';
import { authMiddleware } from './auth.js';
import { GoogleGenAI } from '@google/genai';

const router = express.Router();

const uploadDir = path.join(process.cwd(), 'data', 'temp_recap');
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
    const videoPath = req.file.path;

    // Create job row
    try {
        const stmt = db.prepare(`INSERT INTO ai_recap_jobs (id, userId, status, createdAt) VALUES (?, ?, ?, ?)`);
        stmt.run(jobId, req.user.id, 'processing', Date.now());
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

            const prompt = "You are analyzing a C-Drama / movie video to prepare a Burmese movie recap short. Watch the entire video and: (1) Identify only the scenes that matter for the story — plot-relevant dialogue, key reactions, turning points. (2) Exclude filler: long silent walking, repeated shots, redundant establishing shots, scenes that don't move the story forward. (3) Order the selected scenes for a fast-paced, engaging recap — you may reorder non-chronologically for a strong opening hook if that serves the story better. (4) Write a natural, high-energy Burmese narration script to be read over the selected scenes, written 100% in Burmese, no markdown, no labels. Return the exact start/end timestamps (in seconds, matching the source video) for every scene you selected, in the order they should play.";

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
                                        reason: { type: "STRING" }
                                    },
                                    required: ["start", "end", "reason"]
                                }
                            },
                            narration: { type: "STRING" }
                        },
                        required: ["scenes", "narration"]
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
            if (fs.existsSync(videoPath)) {
                fs.unlinkSync(videoPath);
            }
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

export default router;
