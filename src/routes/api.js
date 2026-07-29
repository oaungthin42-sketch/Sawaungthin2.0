import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { createJob, getJob, updateJob, setJobKeys } from '../services/jobManager.js';
import { addJobToQueue } from '../services/queue.js';
import { getSetting, setSetting, deleteSetting, getAllSettingsMasked } from '../services/settings.js';
import { VOICES, getVoiceConfig } from '../ai/voices.js';
import { EdgeTTS } from '@seepine/edge-tts';
import db from '../services/db.js';
import { authMiddleware, adminOnly } from './auth.js';
import { decrypt } from '../services/settings.js';


const router = express.Router();

const tmpDir = path.join(process.cwd(), 'src', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

let maxUploadSize = 500 * 1024 * 1024; // 500 MB default
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
    const key = (getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY) || '';
    const maskedKey = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : (key ? 'too-short' : 'missing');
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    
    const diagData = {
        model,
        hasKey: !!key,
        maskedKey,
        serverTime: new Date().toISOString(),
        testRequestSuccess: false
    };

    if (key) {
        try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            const payload = {
                contents: [{ role: 'user', parts: [{ text: 'Hello, this is a test.' }] }]
            };
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            diagData.actualHttpStatus = response.status;
            
            if (!response.ok) {
                const errorText = await response.text();
                diagData.actualErrorMessage = errorText;
                
                try {
                    const errObj = JSON.parse(errorText);
                    if (errObj.error) {
                        diagData.actualErrorCode = errObj.error.code;
                        diagData.actualErrorStatus = errObj.error.status;
                        
                        if (errObj.error.details) {
                            const quotaFail = errObj.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.QuotaFailure');
                            if (quotaFail && quotaFail.violations && quotaFail.violations.length > 0) {
                                diagData.quotaId = quotaFail.violations[0].quotaMetric || 'unknown';
                            }
                            
                            const retryInfo = errObj.error.details.find(d => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
                            if (retryInfo) {
                                diagData.retryDelay = retryInfo.retryDelay;
                            }
                        }
                    }
                } catch(e) {}
            } else {
                diagData.testRequestSuccess = true;
            }
        } catch(e) {
            diagData.actualErrorMessage = e.message;
        }
    }
    
    res.json(diagData);
});

// Voices Routes
router.get('/voices', authMiddleware, (req, res) => {
    res.json(VOICES);
});

router.post('/preview-voice', authMiddleware, async (req, res) => {
    const { voiceId, provider = 'edge' } = req.body;
    if (!voiceId) return res.status(400).json({ error: 'Voice ID is required' });
    
    if (req.user.role !== 'admin' && req.user.credits <= 0) {
        return res.status(400).json({ error: 'Insufficient Credits' });
    }

    try {
        const previewText = "စူပါကလစ်မှ ကြိုဆိုပါတယ်";

        if (provider === 'gemini') {
            const geminiApiKey = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
            if (!geminiApiKey) {
                return res.status(400).json({ error: 'Gemini API Key is not configured' });
            }
            
            const { GoogleGenAI } = await import('@google/genai');
            const ai = new GoogleGenAI({ apiKey: geminiApiKey });
            
            const genAiCall = ai.models.generateContent({
                model: 'gemini-2.5-flash-tts',
                contents: previewText,
                config: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: voiceId
                            }
                        }
                    }
                }
            });
            
            const response = await genAiCall;
            const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (audioData) {
                const pcmBuffer = Buffer.from(audioData, 'base64');
                const header = Buffer.alloc(44);
                header.write('RIFF', 0);
                header.writeUInt32LE(36 + pcmBuffer.length, 4);
                header.write('WAVE', 8);
                header.write('fmt ', 12);
                header.writeUInt32LE(16, 16);
                header.writeUInt16LE(1, 20);
                header.writeUInt16LE(1, 22);
                header.writeUInt32LE(24000, 24);
                header.writeUInt32LE(24000 * 2, 28);
                header.writeUInt16LE(2, 32);
                header.writeUInt16LE(16, 34);
                header.write('data', 36);
                header.writeUInt32LE(pcmBuffer.length, 40);
                
                const wavBuffer = Buffer.concat([header, pcmBuffer]);
                res.set({
                    'Content-Type': 'audio/wav',
                    'Content-Length': wavBuffer.length
                });
                return res.send(wavBuffer);
            } else {
                throw new Error("No audio data returned from Gemini API");
            }
        } else {
            const config = getVoiceConfig(voiceId);
            if (!config) return res.status(400).json({ error: 'Invalid Voice ID' });
            
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
        }
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


router.post('/process-recap', authMiddleware, handleUpload, (req, res) => {
    const videoFile = req.file;

    if (!videoFile) {
        return res.status(400).json({ error: 'Video file is required' });
    }

    const user = req.user;
    const geminiApiKey = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
        return res.status(400).json({ error: 'System configuration error: Gemini API Key is missing. Please contact admin.' });
    }

    // Credits check
    if (user.role !== 'admin' && user.credits <= 0) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ error: 'Insufficient Credits' });
    }

    const jobId = uuidv4();
    const blurBoxes = req.body.blurBoxes || '[]';
     const subtitlePosition = req.body.subtitlePosition || null;
    const selectedFontId = req.body.selectedFontId || null;
    const subtitleColor = req.body.subtitleColor || "white";
    const speed = parseFloat(req.body.speed) || 1.0;
    const flipped = req.body.flipped === 'true' ? 1 : 0;
    const voiceProvider = req.body.voiceProvider || 'edge';
    const geminiVoiceName = req.body.geminiVoiceName || 'Puck';

    // Transactional-ish update (SQLite is simple)
    if (user.role !== 'admin') {
        db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?').run(user.id);
    }

    createJob(jobId, {
        videoPath: videoFile.path,
        audioPath: null,
        originalFilename: Buffer.from(videoFile.originalname, 'latin1').toString('utf8'),
        blurBoxes: blurBoxes,
        subtitlePosition: subtitlePosition,
        selectedFontId: selectedFontId,
        subtitleColor: subtitleColor,
        speed: speed,
        flipped: flipped,
        userId: user.id,
        voiceProvider: voiceProvider,
        geminiVoiceName: geminiVoiceName
    });
    setJobKeys(jobId, { geminiApiKey });
    
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
router.post('/process', authMiddleware, handleUpload, (req, res) => {
     // Forward to process-recap logic
     const videoFile = req.file;
     const audioFile = null;
     if (!videoFile) return res.status(400).json({ error: 'Video file required' });
     
     const user = req.user;
     const geminiApiKey = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
     
     if (!geminiApiKey) {
         return res.status(400).json({ error: 'System configuration error: Gemini API Key is missing. Please contact admin.' });
     }

     // Credits check
     if (user.role !== 'admin' && user.credits <= 0) {
         if (req.file && fs.existsSync(req.file.path)) {
             fs.unlinkSync(req.file.path);
         }
         return res.status(400).json({ error: 'Insufficient Credits' });
     }
     
     const jobId = uuidv4();
     const blurBoxes = req.body.blurBoxes || '[]';
     const subtitlePosition = req.body.subtitlePosition || null;
     const selectedFontId = req.body.selectedFontId || null;
     const subtitleColor = req.body.subtitleColor || "white";
     const speed = parseFloat(req.body.speed) || 1.0;
     const flipped = req.body.flipped === 'true' ? 1 : 0;
     const voiceProvider = req.body.voiceProvider || 'edge';
     const geminiVoiceName = req.body.geminiVoiceName || 'Puck';

     // Transactional-ish update (SQLite is simple)
     if (user.role !== 'admin') {
         db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ?').run(user.id);
     }

     createJob(jobId, { 
         videoPath: videoFile.path, 
         audioPath: audioFile ? audioFile.path : null, 
         originalFilename: Buffer.from(videoFile.originalname, 'latin1').toString('utf8'), 
         blurBoxes: blurBoxes, 
         subtitlePosition: subtitlePosition, 
         selectedFontId: selectedFontId,
         subtitleColor: subtitleColor,
         speed: speed,
         flipped: flipped,
         userId: user.id,
         voiceProvider: voiceProvider,
         geminiVoiceName: geminiVoiceName
     });
     setJobKeys(jobId, { geminiApiKey });
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
    const stmt = db.prepare(`SELECT id, originalFilename, completed_at FROM jobs WHERE status = 'complete' AND completed_at IS NOT NULL AND completed_at > ? AND id IN (${placeholders})`);
    
    const timeLimit = Date.now() - 24 * 60 * 60 * 1000;
    const rows = stmt.all(timeLimit, ...ids);
    
    const validJobs = [];
    for (const row of rows) {
        const outputPath = path.join(process.cwd(), 'public', 'output', `${row.id}.mp4`);
        if (fs.existsSync(outputPath)) {
            const stat = fs.statSync(outputPath);
            validJobs.push({
                jobId: row.id,
                originalFilename: row.originalFilename || 'Untitled video',
                completedAt: row.completed_at,
                sizeBytes: stat.size,
                videoUrl: `/output/${row.id}.mp4`,
                expiresAt: row.completed_at + 24 * 60 * 60 * 1000
            });
        }
    }
    
    res.json(validJobs);
});

export default router;
