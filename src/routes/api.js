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


const router = express.Router();

const tmpDir = path.join(process.cwd(), 'src', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({ dest: tmpDir });

router.get('/health', (req, res) => res.json({ status: 'ok' }));

router.get('/diagnostic', async (req, res) => {
    const key = (getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY) || '';
    const maskedKey = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : (key ? 'too-short' : 'missing');
    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    
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
router.get('/voices', (req, res) => {
    res.json(VOICES);
});

router.post('/preview-voice', async (req, res) => {
    const { voiceId } = req.body;
    if (!voiceId) return res.status(400).json({ error: 'Voice ID is required' });
    
    const config = getVoiceConfig(voiceId);
    if (!config) return res.status(400).json({ error: 'Invalid Voice ID' });
    
    try {
        const previewText = "ကြိုဆိုပါတယ်။ ဒီနေ့မှာတော့ စိတ်ဝင်စားဖို့ကောင်းတဲ့ ဇာတ်လမ်းတစ်ပုဒ်ကို အတူတူကြည့်ရှုသွားကြမှာဖြစ်ပါတယ်။";
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
router.get('/settings', (req, res) => {
    res.json(getAllSettingsMasked());
});

router.post('/settings', (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });
    if (value === null || value === undefined || value === '') {
        deleteSetting(key);
    } else {
        setSetting(key, value);
    }
    res.json(getAllSettingsMasked());
});


router.post('/process-recap', upload.single('video'), (req, res) => {
    const videoFile = req.file;

    if (!videoFile) {
        return res.status(400).json({ error: 'Video file is required' });
    }

    const geminiApiKey = req.body.geminiApiKey || req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;
    const assemblyApiKey = req.body.assemblyApiKey || req.headers['x-assemblyai-api-key'] || process.env.ASSEMBLYAI_API_KEY;

    if (!geminiApiKey || !assemblyApiKey) {
        const missing = [];
        if (!assemblyApiKey) missing.push('ASSEMBLYAI_API_KEY');
        if (!geminiApiKey) missing.push('GEMINI_API_KEY');
        return res.status(400).json({ error: 'Please configure your API Keys before starting processing. Missing: ' + missing.join(', ') });
    }

    const jobId = uuidv4();
    createJob(jobId, {
        videoPath: videoFile.path,
        audioPath: null,
    });
    setJobKeys(jobId, { geminiApiKey, assemblyApiKey });
    
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
router.post('/process', upload.single('video'), (req, res) => {
     // Forward to process-recap logic
     const videoFile = req.file;
     const audioFile = null;
     if (!videoFile) return res.status(400).json({ error: 'Video file required' });
     
     const geminiApiKey = req.body.geminiApiKey || req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;
     const assemblyApiKey = req.body.assemblyApiKey || req.headers['x-assemblyai-api-key'] || process.env.ASSEMBLYAI_API_KEY;

     if (!geminiApiKey || !assemblyApiKey) {
         const missing = [];
         if (!assemblyApiKey) missing.push('ASSEMBLYAI_API_KEY');
         if (!geminiApiKey) missing.push('GEMINI_API_KEY');
         return res.status(400).json({ error: 'Please configure your API Keys before starting processing. Missing: ' + missing.join(', ') });
     }
     
     const jobId = uuidv4();
     createJob(jobId, { videoPath: videoFile.path, audioPath: audioFile ? audioFile.path : null });
     setJobKeys(jobId, { geminiApiKey, assemblyApiKey });
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

export default router;
