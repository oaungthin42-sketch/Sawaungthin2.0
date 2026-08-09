import axios from 'axios';
import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { createJob, getJob, updateJob } from '../services/jobManager.js';
import { addJobToQueue } from '../services/queue.js';
import { getSetting, setSetting, deleteSetting, getAllSettingsMasked } from '../services/settings.js';
import { VOICES, getVoiceConfig } from '../ai/voices.js';
import { EdgeTTS } from '@seepine/edge-tts';
import db from '../services/db.js';
import { authMiddleware, adminOnly } from './auth.js';
import { decrypt } from '../services/settings.js';
import { getDuration } from '../ffmpeg/index.js';
import { computeCreditsForDuration } from '../utils/index.js';

import ffmpeg from 'fluent-ffmpeg';

function assessReferenceAudioDuration(seconds) {
    if (!seconds) return { status: 'warn', message: 'Could not read audio duration — quality could not be fully checked.' };
    if (seconds < 3) return { status: 'block', message: 'Reference is too short for stable cloning. Use at least 6-15 seconds of clean speech.' };
    if (seconds < 6) return { status: 'warn', message: 'Reference is usable but short. 6-15 seconds usually gives a better match.' };
    if (seconds <= 30) return { status: 'pass', message: 'Reference length is good.' };
    if (seconds <= 60) return { status: 'warn', message: 'Reference is long. Trim silence, music, or other speakers if present.' };
    return { status: 'block', message: 'Reference is too long. Trim it to roughly 6-30 seconds of clean speech.' };
}

async function denoiseReferenceAudio(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioFilters('afftdn=nr=10:nf=-35:nt=w')
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .save(outputPath);
    });
}


const router = express.Router();

const tmpDir = path.join(process.cwd(), 'src', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

let maxUploadSize = 1500 * 1024 * 1024; // 1500 MB default
if (process.env.MAX_UPLOAD_SIZE_MB) {
    const parsed = parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
        maxUploadSize = parsed * 1024 * 1024;
    }
}


const upload = multer({ 
    dest: tmpDir,
    limits: { fileSize: maxUploadSize }
});

const handleUpload = (req, res, next) => {
    upload.single('video')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                if (req.file && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(413).json({ error: `File too large. Maximum allowed size is ${maxUploadSize / (1024 * 1024)} MB.` });
            }
            return res.status(400).json({ error: err.message });
        } else if (err) {
            return res.status(500).json({ error: "Upload failed." });
        }
        next();
    });
};

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.get('/diagnostic', async (req, res) => {
    const diagData = {
        serverTime: new Date().toISOString(),
        testRequestSuccess: true
    };
    res.json(diagData);
});

// Voices Routes
router.get('/voices', authMiddleware, (req, res) => {
    res.json(VOICES);
});

router.get('/telegram-link', authMiddleware, (req, res) => {
    const link = getSetting('TELEGRAM_LINK');
    res.json({ link: link || 'https://t.me/saw_oliver' });
});

router.get('/bank-info', authMiddleware, (req, res) => {
    res.json({
        bankName: getSetting('BANK_NAME') || null,
        accountName: getSetting('BANK_ACCOUNT_NAME') || null,
        accountNumber: getSetting('BANK_ACCOUNT_NUMBER') || null,
    });
});

router.post('/preview-voice', authMiddleware, async (req, res) => {
    const { voiceId } = req.body;
    if (!voiceId) return res.status(400).json({ error: 'Voice ID is required' });

    if (req.user.role !== 'admin' && req.user.credits <= 0) {
        return res.status(400).json({ error: 'Insufficient Credits' });
    }

    try {
        const config = getVoiceConfig(voiceId);
        if (!config) return res.status(400).json({ error: 'Invalid Voice ID' });

        const previewText = "စူပါကလစ်မှ ကြိုဆိုပါတယ်";

        const ttsClient = new EdgeTTS({
            voice: config.edgeVoice,
            pitch: config.pitch,
            rate: config.rate
        });

        const callPromise = ttsClient.call(previewText);
        let timeoutId;
        let resAudio;
        try {
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("Edge TTS timeout")), 15000);
            });
            resAudio = await Promise.race([callPromise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutId);
        }

        if (!resAudio.data || resAudio.data.length === 0) {
            throw new Error("Received empty audio data");
        }

        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': resAudio.data.length
        });
        res.send(resAudio.data);
    } catch(err) {
        console.error("[API] Preview Voice Error:", err);
        res.status(500).json({ error: 'Failed to generate preview audio' });
    }
});





// Settings Routes
router.get('/settings', authMiddleware, adminOnly, (req, res) => {
    res.json(getAllSettingsMasked());
});

router.post('/settings', authMiddleware, adminOnly, (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });
    if (value === null || value === undefined || value === '') {
        deleteSetting(key);
    } else {
        setSetting(key, value);
    }
    res.json(getAllSettingsMasked());
});


router.post('/process-recap', authMiddleware, handleUpload, async (req, res) => {
    const videoFile = req.file;

    if (!videoFile) {
        return res.status(400).json({ error: 'Video file is required' });
    }

    const user = req.user;
    
    let durationSeconds = 0;
    try {
        durationSeconds = await getDuration(videoFile.path);
    } catch (err) {
        console.error("[API] Failed to get video duration:", err);
        if (videoFile.path && fs.existsSync(videoFile.path)) {
            fs.unlinkSync(videoFile.path);
        }
        return res.status(400).json({ error: 'Failed to read video duration. The uploaded file might be corrupt or an invalid video format.' });
    }

    const requiredCredits = computeCreditsForDuration(durationSeconds);

    if (user.role !== 'admin' && user.credits < requiredCredits) {
        if (videoFile.path && fs.existsSync(videoFile.path)) {
            fs.unlinkSync(videoFile.path);
        }
        return res.status(400).json({
            error: `Insufficient credits. This ${Math.round(durationSeconds)}-second video needs ${requiredCredits} credit(s), you have ${user.credits}.`
        });
    }

    const jobId = uuidv4();
    const blurBoxes = req.body.blurBoxes || '[]';
    const watermarkText = req.body.watermarkText || '';
    console.log(`[WATERMARK-DEBUG] Received watermarkText from client: "${watermarkText}" (length: ${watermarkText.length})`);
    const subtitlePosition = req.body.subtitlePosition || null;
    const selectedFontId = req.body.selectedFontId || null;
    const subtitleColor = req.body.subtitleColor || "white";
    const speed = parseFloat(req.body.speed) || 1.0;
    const flipped = req.body.flipped === 'true' ? 1 : 0;
    const useVoiceCloneRaw = req.body.useVoiceClone === 'true' || req.body.useVoiceClone === true || req.body.useVoiceClone === 1 || req.body.useVoiceClone === '1';
    let useVoiceClone = useVoiceCloneRaw ? 1 : 0;
    let referenceVoiceId = req.body.referenceVoiceId || null;

    if (useVoiceClone && user.role !== 'admin') {
        useVoiceClone = 0;
        referenceVoiceId = null;
    }

    // Transactional-ish update (SQLite is simple)
    if (user.role !== 'admin') {
        db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(requiredCredits, user.id);
    }

    createJob(jobId, {
        videoPath: videoFile.path,
        audioPath: null,
        originalFilename: Buffer.from(videoFile.originalname, 'latin1').toString('utf8'),
        blurBoxes: blurBoxes,
        watermarkText: watermarkText,
        subtitlePosition: subtitlePosition,
        selectedFontId: selectedFontId,
        subtitleColor: subtitleColor,
        speed: speed,
        flipped: flipped,
        userId: user.id
    });

    updateJob(jobId, { 
        creditsCost: user.role === 'admin' ? 0 : requiredCredits,
        useVoiceClone: useVoiceClone,
        referenceVoiceId: referenceVoiceId
    });
    
    res.json({ jobId });

    addJobToQueue(jobId);
});

router.post('/retry/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'error') return res.status(400).json({ error: 'Job is not in error state' });
    
    updateJob(req.params.jobId, { status: 'queued', error: null });
    res.json({ message: 'Retrying job', jobId: req.params.jobId });
    addJobToQueue(req.params.jobId);
});

router.get('/status/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

// Adding compatibility routes based on instructions
router.post('/process', authMiddleware, handleUpload, async (req, res) => {
     // Forward to process-recap logic
     const videoFile = req.file;
     const audioFile = null;
     if (!videoFile) return res.status(400).json({ error: 'Video file required' });
     
     const user = req.user;
     
     let durationSeconds = 0;
     try {
         durationSeconds = await getDuration(videoFile.path);
     } catch (err) {
         console.error("[API] Failed to get video duration:", err);
         if (videoFile.path && fs.existsSync(videoFile.path)) {
             fs.unlinkSync(videoFile.path);
         }
         return res.status(400).json({ error: 'Failed to read video duration. The uploaded file might be corrupt or an invalid video format.' });
     }

     const requiredCredits = computeCreditsForDuration(durationSeconds);

     if (user.role !== 'admin' && user.credits < requiredCredits) {
         if (videoFile.path && fs.existsSync(videoFile.path)) {
             fs.unlinkSync(videoFile.path);
         }
         return res.status(400).json({
             error: `Insufficient credits. This ${Math.round(durationSeconds)}-second video needs ${requiredCredits} credit(s), you have ${user.credits}.`
         });
     }
     
     const jobId = uuidv4();
     const blurBoxes = req.body.blurBoxes || '[]';
     const watermarkText = req.body.watermarkText || '';
     console.log(`[WATERMARK-DEBUG] Received watermarkText from client: "${watermarkText}" (length: ${watermarkText.length})`);
     const subtitlePosition = req.body.subtitlePosition || null;
     const selectedFontId = req.body.selectedFontId || null;
     const subtitleColor = req.body.subtitleColor || "white";
     const speed = parseFloat(req.body.speed) || 1.0;
     const flipped = req.body.flipped === 'true' ? 1 : 0;
     const useVoiceCloneRaw = req.body.useVoiceClone === 'true' || req.body.useVoiceClone === true || req.body.useVoiceClone === 1 || req.body.useVoiceClone === '1';
     let useVoiceClone = useVoiceCloneRaw ? 1 : 0;
     let referenceVoiceId = req.body.referenceVoiceId || null;

     if (useVoiceClone && user.role !== 'admin') {
         useVoiceClone = 0;
         referenceVoiceId = null;
     }

     // Transactional-ish update (SQLite is simple)
     if (user.role !== 'admin') {
         db.prepare('UPDATE users SET credits = credits - ? WHERE id = ?').run(requiredCredits, user.id);
     }

     createJob(jobId, { 
         videoPath: videoFile.path, 
         audioPath: audioFile ? audioFile.path : null, 
         originalFilename: Buffer.from(videoFile.originalname, 'latin1').toString('utf8'), 
         blurBoxes: blurBoxes, 
         watermarkText: watermarkText,
         subtitlePosition: subtitlePosition, 
         selectedFontId: selectedFontId,
         subtitleColor: subtitleColor,
         speed: speed,
         flipped: flipped,
         userId: user.id
     });

     updateJob(jobId, { 
         creditsCost: user.role === 'admin' ? 0 : requiredCredits,
         useVoiceClone: useVoiceClone,
         referenceVoiceId: referenceVoiceId
     });
     
     res.json({ jobId });
     
     addJobToQueue(jobId);
});

router.get('/play/:jobId', (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job || job.status !== 'complete' || !job.result || !job.result.videoUrl) {
        return res.status(404).send('Video not found or not ready');
    }
    res.redirect(job.result.videoUrl);
});


router.get('/completed-jobs', (req, res) => {
    const idsParam = req.query.ids;
    if (!idsParam) return res.json([]);
    const ids = idsParam.split(',').slice(0, 200).filter(id => typeof id === 'string' && id.trim().length > 0);
    if (ids.length === 0) return res.json([]);
    
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT id, originalFilename, completed_at, coverText FROM jobs WHERE status = 'complete' AND completed_at IS NOT NULL AND completed_at > ? AND id IN (${placeholders})`);
    
    const timeLimit = Date.now() - 24 * 60 * 60 * 1000;
    const rows = stmt.all(timeLimit, ...ids);
    
    const validJobs = [];
    for (const row of rows) {
        const outputPath = path.join(process.cwd(), 'data', 'output', `${row.id}.mp4`);
        if (fs.existsSync(outputPath)) {
            const stat = fs.statSync(outputPath);
            validJobs.push({
                jobId: row.id,
                originalFilename: row.originalFilename || 'Untitled video',
                completedAt: row.completed_at,
                sizeBytes: stat.size,
                videoUrl: `/output/${row.id}.mp4`,
                expiresAt: row.completed_at + 24 * 60 * 60 * 1000,
                coverText: row.coverText || null
            });
        }
    }
    
    res.json(validJobs);
});

const handleAudioUpload = (req, res, next) => {
    upload.single('audio')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: err.message });
        } else if (err) {
            return res.status(500).json({ error: "Audio upload failed." });
        }
        next();
    });
};

router.get('/voice-clones/config', (req, res) => {
    res.json({ enabled: process.env.VOICE_CLONE_ENABLED === 'true' });
});

router.post('/voice-clones/reference-voices', authMiddleware, adminOnly, handleAudioUpload, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        return res.status(400).json({ error: "Reference voice name is required." });
    }
    if (!req.file) {
        return res.status(400).json({ error: "Reference audio file is required." });
    }

    const refVoiceId = uuidv4();
    const dataDir = path.join(process.cwd(), 'data', 'reference_voices');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const audioExt = path.extname(req.file.originalname) || '.wav';
    const finalAudioPath = path.join(dataDir, `${refVoiceId}${audioExt}`);
    const embeddingPath = path.join(dataDir, `${refVoiceId}.pt`);

    try {
        // Move the uploaded file from tmp to dataDir
        fs.copyFileSync(req.file.path, finalAudioPath);
        fs.unlinkSync(req.file.path);

        const denoisedPath = finalAudioPath.replace(/(\.[^.]+)$/, '_denoised$1');
        try {
            await denoiseReferenceAudio(finalAudioPath, denoisedPath);
            fs.unlinkSync(finalAudioPath);
            fs.renameSync(denoisedPath, finalAudioPath);
        } catch (denoiseErr) {
            console.warn('[API] Denoise step failed, continuing with original audio:', denoiseErr.message);
            if (fs.existsSync(denoisedPath)) { try { fs.unlinkSync(denoisedPath); } catch (e) {} }
        }

        const durationSeconds = await getDuration(finalAudioPath);
        const quality = assessReferenceAudioDuration(durationSeconds);
        if (quality.status === 'block') {
            fs.unlinkSync(finalAudioPath);
            return res.status(400).json({ error: quality.message });
        }

        // Call python microservice to extract embedding
        const port = process.env.VOICE_CLONE_PORT || '5001';
        const serviceUrl = `http://127.0.0.1:${port}/extract-embedding`;

        console.log(`[API] Extracting embedding for reference voice: ${finalAudioPath}`);
        const response = await axios.post(serviceUrl, {
            audio_path: path.resolve(finalAudioPath),
            cache_path: path.resolve(embeddingPath)
        }, { timeout: 600000 }); // 10 min timeout

        if (response.data && response.data.status === 'success') {
            // Save to DB
            const stmt = db.prepare(`
                INSERT INTO reference_voices (id, userId, name, audioPath, embeddingCachePath)
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(refVoiceId, req.user.id, name.trim(), finalAudioPath, embeddingPath);

            console.log(`[API] Reference voice created successfully: ${refVoiceId}`);
            return res.json({
                id: refVoiceId,
                name: name.trim(),
                audioPath: finalAudioPath,
                embeddingCachePath: embeddingPath,
                ...(quality.status === 'warn' ? { qualityWarning: quality.message } : {})
            });
        } else {
            throw new Error("Python microservice did not return success status.");
        }
    } catch (err) {
        console.error("[API] Failed to create reference voice:", err);
        // Cleanup files if they exist
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
        if (fs.existsSync(finalAudioPath)) {
            try { fs.unlinkSync(finalAudioPath); } catch (e) {}
        }
        if (fs.existsSync(embeddingPath)) {
            try { fs.unlinkSync(embeddingPath); } catch (e) {}
        }
        return res.status(500).json({ error: `Failed to process reference voice: ${err.message}` });
    }
});

router.get('/voice-clones/reference-voices', authMiddleware, adminOnly, (req, res) => {
    try {
        const rows = db.prepare('SELECT id, name, created_at FROM reference_voices ORDER BY created_at DESC').all();
        res.json(rows);
    } catch (e) {
        console.error("[API] Failed to list reference voices:", e);
        res.status(500).json({ error: "Failed to list reference voices." });
    }
});

router.delete('/voice-clones/reference-voices/:id', authMiddleware, adminOnly, (req, res) => {
    const { id } = req.params;
    try {
        const row = db.prepare('SELECT * FROM reference_voices WHERE id = ?').get(id);
        if (!row) {
            return res.status(404).json({ error: "Reference voice not found." });
        }

        // Delete from database
        db.prepare('DELETE FROM reference_voices WHERE id = ?').run(id);

        // Delete audio and embedding files
        if (row.audioPath && fs.existsSync(row.audioPath)) {
            try { fs.unlinkSync(row.audioPath); } catch (e) {}
        }
        if (row.embeddingCachePath && fs.existsSync(row.embeddingCachePath)) {
            try { fs.unlinkSync(row.embeddingCachePath); } catch (e) {}
        }

        res.json({ success: true });
    } catch (e) {
        console.error("[API] Failed to delete reference voice:", e);
        res.status(500).json({ error: "Failed to delete reference voice." });
    }
});

router.use('/ab-test-assets', express.static(path.join(process.cwd(), 'public', 'ab_test')));

router.get('/admin/tau-ab-test', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { referenceVoiceId, text } = req.query;

        if (!referenceVoiceId) {
            return res.status(400).send("Missing referenceVoiceId parameter. Add ?referenceVoiceId=YOUR_ID to the URL.");
        }

        const refVoice = db.prepare('SELECT * FROM reference_voices WHERE id = ?').get(referenceVoiceId);
        if (!refVoice) {
            return res.status(404).send(`Reference voice ID ${referenceVoiceId} not found.`);
        }

        // 1. Find the newest chunk_std_*.wav or generate one
        let chunkPath = null;
        const tmpDir = path.join(process.cwd(), 'src', 'tmp');
        if (fs.existsSync(tmpDir)) {
            const jobs = fs.readdirSync(tmpDir);
            let latestMtime = 0;
            for (const jobDir of jobs) {
                const jobPath = path.join(tmpDir, jobDir);
                if (fs.statSync(jobPath).isDirectory()) {
                    const files = fs.readdirSync(jobPath);
                    for (const file of files) {
                        if (file.startsWith('chunk_std_') && file.endsWith('.wav')) {
                            const fullPath = path.join(jobPath, file);
                            const mtime = fs.statSync(fullPath).mtimeMs;
                            if (mtime > latestMtime) {
                                latestMtime = mtime;
                                chunkPath = fullPath;
                            }
                        }
                    }
                }
            }
        }

        const outputDir = path.join(process.cwd(), 'public', 'ab_test');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        let isSynthetic = false;
        if (!chunkPath) {
            chunkPath = path.join(outputDir, 'synthetic_source.wav');
            const synthText = text || "Hello, this is a synthetic test audio generated on the fly for the A/B test. I hope it works well.";
            const ttsClient = new EdgeTTS({ voice: 'en-US-GuyNeural', pitch: '+0Hz', rate: '+0%' });
            await ttsClient.ttsPromise(synthText, chunkPath);
            isSynthetic = true;
        } else {
            // copy the found chunk into the public folder so we can play it
            fs.copyFileSync(chunkPath, path.join(outputDir, 'source_chunk.wav'));
        }

        // Run the 4 conversions
        const taus = [0.20, 0.22, 0.25, 0.30];
        const port = process.env.VOICE_CLONE_PORT || '5001';
        const convertUrl = `http://127.0.0.1:${port}/convert`;

        const results = [];

        for (const tau of taus) {
            const outFileName = `cloned_tau_${tau.toFixed(2)}.wav`;
            const outPath = path.join(outputDir, outFileName);

            try {
                const response = await axios.post(convertUrl, {
                    source_audio_path: path.resolve(chunkPath),
                    reference_embedding_path: refVoice.embeddingCachePath ? path.resolve(refVoice.embeddingCachePath) : null,
                    reference_audio_path: refVoice.audioPath ? path.resolve(refVoice.audioPath) : null,
                    output_path: path.resolve(outPath),
                    tau: tau
                }, { timeout: 120000 });

                if (response.data && response.data.status === 'success' && fs.existsSync(outPath)) {
                    results.push({ tau, file: `/api/ab-test-assets/${outFileName}` });
                } else {
                    results.push({ tau, error: "Conversion failed or file missing" });
                }
            } catch (err) {
                results.push({ tau, error: err.message });
            }
        }

        // Generate HTML
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Tau A/B Test Results</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; background: #f9fafb; color: #111827; }
                h1 { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                .card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                .card h2 { margin-top: 0; font-size: 18px; margin-bottom: 12px; }
                audio { width: 100%; outline: none; }
                .error { color: #dc2626; }
                .info { margin-bottom: 24px; font-size: 14px; color: #4b5563; }
            </style>
        </head>
        <body>
            <h1>Tau A/B Test Results</h1>
            <div class="info">
                <strong>Source Chunk:</strong> ${isSynthetic ? 'Synthetic generation' : chunkPath}<br>
                <strong>Reference Voice:</strong> ${refVoice.name} (ID: ${refVoice.id})
            </div>
            
            <div class="card">
                <h2>Original Source Chunk</h2>
                <audio controls src="/api/ab-test-assets/${isSynthetic ? 'synthetic_source.wav' : 'source_chunk.wav'}?t=${Date.now()}"></audio>
            </div>
        `;

        for (const res of results) {
            html += `<div class="card"><h2>Tau = ${res.tau.toFixed(2)}</h2>`;
            if (res.file) {
                html += `<audio controls src="${res.file}?t=${Date.now()}"></audio>`;
            } else {
                html += `<div class="error">Error: ${res.error}</div>`;
            }
            html += `</div>`;
        }

        html += `</body></html>`;
        res.send(html);
    } catch (e) {
        console.error(e);
        res.status(500).send(`An error occurred: ${e.message}`);
    }
});

export default router;
