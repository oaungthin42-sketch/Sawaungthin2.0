import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { runFFmpeg } from '../ffmpeg/index.js';
import { getSetting } from '../services/settings.js';

export async function generateStoryContext(videoPath, durationSec, tempArea = null) {
    const startTime = Date.now();
    let proxyPath = null;
    let uploadedFile = null;
    let ai = null;

    try {
        const apiKey = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[STORY-CONTEXT] GEMINI_API_KEY is not configured, skipping story context');
            return null;
        }

        ai = new GoogleGenAI({ apiKey });

        const targetDir = tempArea || path.dirname(videoPath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        proxyPath = path.join(targetDir, `story_proxy_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

        console.log(`[STORY-CONTEXT] Creating low-res video proxy at ${proxyPath}...`);
        const proxyArgs = [
            '-y',
            '-i', videoPath,
            '-vf', 'scale=-2:360,fps=1',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '32',
            '-c:a', 'aac',
            '-ac', '1',
            '-b:a', '32k',
            proxyPath
        ];

        try {
            await runFFmpeg(proxyArgs, targetDir);
        } catch (ffmpegErr) {
            console.warn(`[STORY-CONTEXT] Initial proxy ffmpeg failed: ${ffmpegErr.message}, retrying with -an`);
            const fallbackArgs = [
                '-y',
                '-i', videoPath,
                '-vf', 'scale=-2:360,fps=1',
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '32',
                '-an',
                proxyPath
            ];
            await runFFmpeg(fallbackArgs, targetDir);
        }

        if (!fs.existsSync(proxyPath) || fs.statSync(proxyPath).size === 0) {
            throw new Error('Proxy video file was not created or is empty');
        }

        console.log(`[STORY-CONTEXT] Uploading proxy video (${(fs.statSync(proxyPath).size / 1024 / 1024).toFixed(2)} MB) to Gemini...`);
        uploadedFile = await ai.files.upload({
            file: proxyPath,
            config: { mimeType: 'video/mp4' }
        });

        console.log(`[STORY-CONTEXT] Proxy uploaded: ${uploadedFile.name}, waiting for ACTIVE state...`);
        let state = uploadedFile.state;
        let attempts = 0;
        while (state === 'PROCESSING' && attempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            uploadedFile = await ai.files.get({ name: uploadedFile.name });
            state = uploadedFile.state;
            attempts++;
        }

        if (state !== 'ACTIVE') {
            throw new Error(`Gemini file processing failed or timed out. Final state: ${state}`);
        }

        const rawModel = getSetting('GEMINI_MODEL') || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
        const modelName = rawModel.replace(/^google\//, '');

        const promptText = "Watch this entire video and write a concise story synopsis in English for a translator who only has the dialogue text. Include: (1) genre and overall tone; (2) the main characters: names if they are said or shown on screen, otherwise a short descriptive label, plus gender, age group and their relationships to each other; (3) the setting; (4) the story beat by beat in chronological order with approximate timestamps (mm:ss), only the important events and turning points; (5) how the story ends. Maximum about 600 words. Do not transcribe or quote dialogue. Do not invent anything that is not shown or clearly implied.";

        console.log(`[STORY-CONTEXT] Calling generateContent with model ${modelName}...`);

        let response;
        try {
            response = await ai.models.generateContent({
                model: modelName,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
                            { text: promptText }
                        ]
                    }
                ],
                config: {
                    mediaResolution: 'MEDIA_RESOLUTION_LOW'
                }
            });
        } catch (configErr) {
            console.warn('[STORY-CONTEXT] generateContent with mediaResolution failed, retrying without it:', configErr.message);
            response = await ai.models.generateContent({
                model: modelName,
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
                            { text: promptText }
                        ]
                    }
                ]
            });
        }

        const storySynopsis = response?.text?.trim() || null;
        const seconds = Math.round((Date.now() - startTime) / 1000);
        console.log(`[TIMING] story context took ${seconds}s`);

        return storySynopsis;
    } catch (err) {
        console.error('[STORY-CONTEXT] Error generating story context:', err.message || err);
        return null;
    } finally {
        if (proxyPath) {
            try {
                if (fs.existsSync(proxyPath)) {
                    fs.unlinkSync(proxyPath);
                }
            } catch (_) {}
        }
        if (uploadedFile && uploadedFile.name && ai) {
            try {
                await ai.files.delete({ name: uploadedFile.name });
                console.log(`[STORY-CONTEXT] Deleted file ${uploadedFile.name} from Gemini`);
            } catch (_) {}
        }
    }
}
