import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { runFFmpeg } from '../ffmpeg/index.js';
import { getSetting } from '../services/settings.js';
import { GEMINI_MODEL } from '../services/geminiConfig.js';

export async function generateStoryContext(videoPath, durationSec, tempArea = null, targetLanguage = 'my') {
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

        const rawModel = GEMINI_MODEL;
        const modelName = rawModel.replace(/^google\//, '');

        const langCaption = targetLanguage === 'th' ? 'written in Thai' : 'written in Burmese';
        const promptText = `Watch this entire video and write a concise story synopsis in English for a translator who only has the dialogue text. Include: (1) genre and overall tone; (2) the main characters: names if they are said or shown on screen, otherwise a short descriptive label, plus gender, age group and their relationships to each other; (3) the setting; (4) the story beat by beat in chronological order with approximate timestamps (mm:ss), only the important events and turning points; (5) how the story ends. Maximum about 600 words. Do not transcribe or quote dialogue. Do not invent anything that is not shown or clearly implied.\n\nAfter the synopsis, add one final line starting exactly with "CAPTION:" followed by a catchy, high-engagement headline suitable for a social media short video, under 15 words, no hashtags, ${langCaption}.`;

        console.log(`[STORY-CONTEXT] Calling generateContent with model ${modelName}...`);

        let response;
        try {
            console.log(`[LLM] Gemini request model=${modelName} attempt=1`);
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
            const errStr = (configErr.message || String(configErr)).toLowerCase();
            const status = configErr.status || configErr.statusCode || (configErr.response && configErr.response.status);

            const is429or5xx = status === 429 || (status >= 500 && status < 600) ||
                               errStr.includes('429') || errStr.includes('resource_exhausted') ||
                               errStr.includes('500') || errStr.includes('503') || errStr.includes('502') || errStr.includes('504');
            if (is429or5xx) {
                console.warn('[STORY-CONTEXT] generateContent failed with quota/server error, returning null without retrying:', configErr.message);
                return null;
            }

            const isMediaResError = errStr.includes('mediaresolution') || errStr.includes('media_resolution');
            const is400 = status === 400 || errStr.includes('400') || errStr.includes('invalid argument') || errStr.includes('invalid_argument');

            if (isMediaResError || is400) {
                console.warn('[STORY-CONTEXT] generateContent with mediaResolution failed (mediaResolution/400), retrying without it:', configErr.message);
                console.log(`[LLM] Gemini request model=${modelName} attempt=2`);
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
            } else {
                console.warn('[STORY-CONTEXT] generateContent failed with unrecoverable error:', configErr.message);
                return null;
            }
        }

        let storySynopsis = null;
        let storyCaption = null;

        if (response && response.text) {
            const rawText = response.text.trim();
            const lines = rawText.split('\n');
            let foundIndex = -1;
            for (let i = lines.length - 1; i >= 0; i--) {
                if (/^CAPTION:\s*/i.test(lines[i].trim())) {
                    foundIndex = i;
                    break;
                }
            }

            if (foundIndex !== -1) {
                const capLine = lines[foundIndex].trim();
                storyCaption = capLine.replace(/^CAPTION:\s*/i, '').trim() || null;
                const synopsisLines = lines.slice(0, foundIndex).concat(lines.slice(foundIndex + 1));
                storySynopsis = synopsisLines.join('\n').trim() || null;
            } else {
                storySynopsis = rawText;
                storyCaption = null;
            }
        }

        const seconds = Math.round((Date.now() - startTime) / 1000);
        console.log(`[TIMING] story context took ${seconds}s (synopsis: ${storySynopsis ? 'yes' : 'no'}, caption: ${storyCaption ? 'yes' : 'no'})`);

        return { synopsis: storySynopsis, caption: storyCaption };
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
