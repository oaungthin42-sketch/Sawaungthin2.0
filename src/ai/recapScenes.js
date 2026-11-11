import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { runFFmpeg, getDuration } from '../ffmpeg/index.js';
import { getSetting } from '../services/settings.js';
import { GEMINI_MODEL } from '../services/geminiConfig.js';

function parseJsonArrayLenient(text) {
    let clean = (text || '').trim();
    if (clean.startsWith('```json')) clean = clean.replace(/^```json\s*/i, '');
    if (clean.startsWith('```')) clean = clean.replace(/^```\s*/, '');
    if (clean.endsWith('```')) clean = clean.replace(/\s*```$/, '');
    clean = clean.trim();

    try {
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.lines)) return parsed.lines;
        if (parsed && Array.isArray(parsed.beats)) return parsed.beats;
        if (parsed && Array.isArray(parsed.recap)) return parsed.recap;
    } catch (_) {}

    const firstBracket = clean.indexOf('[');
    if (firstBracket !== -1) {
        const candidate = clean.slice(firstBracket);
        let lastBrace = candidate.lastIndexOf('}');
        while (lastBrace > 0) {
            const attempt = candidate.slice(0, lastBrace + 1) + ']';
            try {
                const parsed = JSON.parse(attempt);
                if (Array.isArray(parsed)) return parsed;
            } catch (_) {}
            lastBrace = candidate.lastIndexOf('}', lastBrace - 1);
        }
    }
    return null;
}

function getChunkWhisperFallback(chunkWhisperLines, chunk) {
    if (chunkWhisperLines && chunkWhisperLines.length > 0) {
        return chunkWhisperLines.map(w => {
            const s = (w.start !== undefined ? w.start : (w.timestamp ? w.timestamp[0] : chunk.start));
            const e = (w.end !== undefined ? w.end : (w.timestamp ? w.timestamp[1] : s + 2.5));
            return {
                start: Math.max(chunk.start, s),
                end: Math.min(chunk.end, e),
                text: (w.text || '').trim()
            };
        }).filter(l => l.text.length > 0 && l.end > l.start);
    }
    return [{
        start: chunk.start,
        end: chunk.end,
        text: 'The story continues as events unfold.'
    }];
}

function mergeAndNormalizeRecapLines(allLines, totalDurationSec) {
    if (!allLines || allLines.length === 0) return [];

    // 1. Filter valid items and sort by start time
    const lines = allLines
        .filter(l => l && typeof l.text === 'string' && l.text.trim().length > 0)
        .map(l => ({
            start: Math.max(0, Math.min(totalDurationSec, l.start)),
            end: Math.max(0, Math.min(totalDurationSec, l.end)),
            text: l.text.trim()
        }))
        .sort((a, b) => a.start - b.start);

    if (lines.length === 0) return [];

    // 2. Drop any line completely inside previous coverage / overlap
    const deduplicated = [];
    let lastCovered = 0;

    for (const item of lines) {
        if (deduplicated.length > 0 && item.end <= lastCovered + 0.3) {
            continue;
        }
        if (deduplicated.length > 0 && item.start < lastCovered) {
            item.start = lastCovered + 0.1;
        }
        if (item.end - item.start >= 0.5) {
            deduplicated.push(item);
            lastCovered = item.end;
        }
    }

    // 3. Remove overlaps between adjacent lines (end = Math.min(end, nextStart - 0.2))
    for (let i = 0; i < deduplicated.length; i++) {
        const curr = deduplicated[i];
        const next = deduplicated[i + 1];
        if (next) {
            const maxAllowedEnd = next.start - 0.2;
            if (curr.end > maxAllowedEnd) {
                curr.end = Math.max(curr.start + 0.5, maxAllowedEnd);
            }
        }
    }

    // 4. Enforce minimum duration (1.5s), merging with next if too cramped
    const finalLines = [];
    for (let i = 0; i < deduplicated.length; i++) {
        const curr = deduplicated[i];
        const next = deduplicated[i + 1];
        const maxLimit = next ? (next.start - 0.2) : totalDurationSec;

        const dur = curr.end - curr.start;
        if (dur < 1.5) {
            if (curr.start + 1.5 <= maxLimit) {
                curr.end = curr.start + 1.5;
                finalLines.push(curr);
            } else if (maxLimit - curr.start >= 1.0) {
                curr.end = maxLimit;
                finalLines.push(curr);
            } else if (next) {
                next.text = `${curr.text} ${next.text}`.trim();
                next.start = curr.start;
            } else {
                curr.end = Math.min(totalDurationSec, curr.start + 1.5);
                if (curr.end > curr.start) {
                    finalLines.push(curr);
                }
            }
        } else {
            finalLines.push(curr);
        }
    }

    // Final pass to guarantee strict non-overlap and conform to pipeline format
    let prevEnd = 0;
    const result = [];
    for (let i = 0; i < finalLines.length; i++) {
        const item = finalLines[i];
        let start = Math.max(0, item.start);
        if (start < prevEnd) {
            start = prevEnd + 0.05;
        }
        let end = Math.max(start + 1.5, item.end);
        if (end > totalDurationSec && totalDurationSec > 0) {
            end = totalDurationSec;
            if (end <= start) {
                start = Math.max(0, end - 1.5);
            }
        }
        const sFloat = parseFloat(start.toFixed(2));
        const eFloat = parseFloat(end.toFixed(2));
        if (eFloat > sFloat) {
            result.push({
                timestamp: [sFloat, eFloat],
                start: sFloat,
                end: eFloat,
                text: item.text
            });
            prevEnd = eFloat;
        }
    }

    return result;
}

export async function generateRecapLines(
    videoPath,
    durationSec,
    cacheDir,
    storySynopsis = null,
    targetLanguage = 'my',
    whisperTranscript = [],
    onProgress = null
) {
    const startTime = Date.now();
    let totalDur = durationSec;
    if (!totalDur || !Number.isFinite(totalDur) || totalDur <= 0) {
        try {
            totalDur = await getDuration(videoPath);
        } catch (e) {
            console.warn('[RECAP] Could not get duration via ffprobe:', e.message);
            totalDur = 300;
        }
    }

    const apiKey = getSetting('GEMINI_API_KEY') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn('[RECAP] GEMINI_API_KEY is not configured, falling back to whisper transcript');
        return whisperTranscript;
    }

    const ai = new GoogleGenAI({ apiKey });
    const rawModel = GEMINI_MODEL;
    const modelName = rawModel.replace(/^google\//, '');

    // Divide video into 600s chunks with 10s overlap
    const CHUNK_SEC = 600;
    const OVERLAP_SEC = 10;
    const chunks = [];
    let currentStart = 0;
    let chunkIndex = 0;

    while (currentStart < totalDur) {
        const remaining = totalDur - currentStart;
        if (remaining < 5 && chunks.length > 0) {
            break;
        }
        const chunkDur = Math.min(CHUNK_SEC, remaining);
        chunks.push({
            index: chunkIndex++,
            start: currentStart,
            duration: chunkDur,
            end: currentStart + chunkDur
        });
        if (currentStart + chunkDur >= totalDur) {
            break;
        }
        currentStart = currentStart + chunkDur - OVERLAP_SEC;
    }

    console.log(`[RECAP] Divided ${totalDur.toFixed(1)}s video into ${chunks.length} chunks (chunkSize=${CHUNK_SEC}s, overlap=${OVERLAP_SEC}s)`);

    const allChunkLines = [];
    const RETRY_DELAYS = [10000, 30000, 60000];

    for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        const chunkCacheFile = path.join(cacheDir, `recap_chunk_${chunk.index}.json`);

        // Check if chunk is already cached
        if (fs.existsSync(chunkCacheFile)) {
            try {
                const cachedLines = JSON.parse(fs.readFileSync(chunkCacheFile, 'utf8'));
                if (Array.isArray(cachedLines) && cachedLines.length > 0) {
                    console.log(`[RECAP] Loaded chunk ${chunk.index + 1}/${chunks.length} from cache (${cachedLines.length} lines)`);
                    allChunkLines.push(...cachedLines);
                    if (onProgress) {
                        onProgress(`Recap chunk ${chunk.index + 1}/${chunks.length} loaded from cache`);
                    }
                    continue;
                }
            } catch (e) {
                console.warn(`[RECAP] Failed to read chunk cache ${chunkCacheFile}:`, e.message);
            }
        }

        if (onProgress) {
            onProgress(`Analyzing recap scene ${chunk.index + 1}/${chunks.length} (${Math.round(chunk.start)}s - ${Math.round(chunk.end)}s)`);
        }

        // Identify Whisper dialogue lines inside this chunk
        const chunkWhisperLines = (whisperTranscript || []).filter(w => {
            const s = (w.start !== undefined ? w.start : (w.timestamp ? w.timestamp[0] : 0));
            const e = (w.end !== undefined ? w.end : (w.timestamp ? w.timestamp[1] : s + 2));
            return e >= chunk.start && s <= chunk.end;
        });

        // Continuity: last 8 lines already generated
        const previousLines = allChunkLines.slice(-8);

        let chunkSuccess = false;
        let generatedChunkLines = [];

        for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
            if (attempt > 0) {
                const delayMs = RETRY_DELAYS[attempt - 1];
                console.warn(`[RECAP] Chunk ${chunk.index} waiting ${delayMs / 1000}s before retry ${attempt}...`);
                if (onProgress) {
                    onProgress(`Recap chunk ${chunk.index + 1}/${chunks.length} retrying in ${delayMs / 1000}s...`);
                }
                await new Promise(r => setTimeout(r, delayMs));
            }

            let proxyPath = null;
            let uploadedFile = null;

            try {
                proxyPath = path.join(cacheDir, `recap_proxy_${chunk.index}_${Date.now()}.mp4`);
                const proxyArgs = [
                    '-y',
                    '-ss', chunk.start.toFixed(2),
                    '-t', chunk.duration.toFixed(2),
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
                    await runFFmpeg(proxyArgs, cacheDir);
                } catch (ffmpegErr) {
                    console.warn(`[RECAP] Initial chunk proxy failed: ${ffmpegErr.message}, retrying with -an`);
                    const fallbackArgs = [
                        '-y',
                        '-ss', chunk.start.toFixed(2),
                        '-t', chunk.duration.toFixed(2),
                        '-i', videoPath,
                        '-vf', 'scale=-2:360,fps=1',
                        '-c:v', 'libx264',
                        '-preset', 'veryfast',
                        '-crf', '32',
                        '-an',
                        proxyPath
                    ];
                    await runFFmpeg(fallbackArgs, cacheDir);
                }

                if (!fs.existsSync(proxyPath) || fs.statSync(proxyPath).size === 0) {
                    throw new Error(`Proxy file for chunk ${chunk.index} was not created or empty`);
                }

                console.log(`[RECAP] Uploading chunk ${chunk.index + 1}/${chunks.length} proxy (${(fs.statSync(proxyPath).size / 1024 / 1024).toFixed(2)} MB) to Gemini...`);
                uploadedFile = await ai.files.upload({
                    file: proxyPath,
                    config: { mimeType: 'video/mp4' }
                });

                let fileState = uploadedFile.state;
                let pollAttempts = 0;
                while (fileState === 'PROCESSING' && pollAttempts < 60) {
                    await new Promise(r => setTimeout(r, 5000));
                    uploadedFile = await ai.files.get({ name: uploadedFile.name });
                    fileState = uploadedFile.state;
                    pollAttempts++;
                }

                if (fileState !== 'ACTIVE') {
                    throw new Error(`Gemini file processing failed or timed out: ${fileState}`);
                }

                // Construct prompt
                let promptText = `You are a movie-recap narrator scriptwriter. You are watching a ${Math.round(chunk.duration)}-second video clip (from ${Math.round(chunk.start)}s to ${Math.round(chunk.end)}s of the movie).\n`;

                if (storySynopsis) {
                    promptText += `\n[OVERALL MOVIE SYNOPSIS & CHARACTERS]:\n${storySynopsis}\n`;
                }

                if (previousLines && previousLines.length > 0) {
                    const prevSnippet = previousLines.map(l => `[${l.start.toFixed(1)}s - ${l.end.toFixed(1)}s]: ${l.text}`).join('\n');
                    promptText += `\n[PREVIOUS RECAP LINES (CONTINUITY - do not repeat these scenes, pick up where they left off)]:\n${prevSnippet}\n`;
                }

                if (chunkWhisperLines && chunkWhisperLines.length > 0) {
                    const whisperSnippet = chunkWhisperLines.map(w => {
                        const s = (w.start !== undefined ? w.start : (w.timestamp ? w.timestamp[0] : 0));
                        const e = (w.end !== undefined ? w.end : (w.timestamp ? w.timestamp[1] : s + 2));
                        return `[${s.toFixed(1)}s - ${e.toFixed(1)}s]: "${w.text}"`;
                    }).join('\n');
                    promptText += `\n[SPOKEN DIALOGUE IN THIS CLIP (for reference so dialogue meaning is preserved)]:\n${whisperSnippet}\n`;
                }

                promptText += `
YOUR TASK:
Write narrative recap lines covering this ENTIRE clip from start to end like a movie-recap video narrator (explaining dialogue, key actions, character expressions, tensions, and transitions). Silent or action scenes MUST have narration too.
Do NOT leave long silent gaps. Keep each line concise (1-2 sentences in plain English).

REQUIREMENTS:
1. Provide the start and end timestamp in seconds relative to this clip (start between 0.0 and ${chunk.duration.toFixed(1)}).
2. The lines must be sequential and chronologically ordered.
3. Every beat must have an English line describing the scene/dialogue clearly.
4. Output MUST be a valid JSON array of objects with the exact schema:
[
  {
    "start": 0.0,
    "end": 4.5,
    "text": "English line describing the scene or dialogue"
  }
]
Do not wrap in markdown or backticks. Return JSON array only.`;

                console.log(`[RECAP] Calling Gemini generateContent for chunk ${chunk.index + 1}/${chunks.length}...`);

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
                            responseMimeType: 'application/json',
                            mediaResolution: 'MEDIA_RESOLUTION_LOW'
                        }
                    });
                } catch (mediaErr) {
                    const errStr = (mediaErr.message || String(mediaErr)).toLowerCase();
                    const status = mediaErr.status || mediaErr.statusCode || (mediaErr.response && mediaErr.response.status);
                    const isMediaResError = errStr.includes('mediaresolution') || errStr.includes('media_resolution') || status === 400;

                    if (isMediaResError) {
                        console.warn(`[RECAP] generateContent with mediaResolution failed, retrying without: ${mediaErr.message}`);
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
                                responseMimeType: 'application/json'
                            }
                        });
                    } else {
                        throw mediaErr;
                    }
                }

                const rawItems = parseJsonArrayLenient(response && response.text);
                if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
                    throw new Error('Gemini response could not be parsed as a non-empty JSON array');
                }

                const mappedLines = [];
                for (const item of rawItems) {
                    let s = parseFloat(item.start);
                    let e = parseFloat(item.end);
                    const txt = (item.text || item.narration || item.dialogue || '').trim();
                    if (!Number.isFinite(s) || !Number.isFinite(e) || !txt) continue;

                    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
                    const absStart = chunk.start + clamp(s, 0, chunk.duration);
                    let absEnd = chunk.start + clamp(e, 0, chunk.duration + 5);

                    if (absEnd <= absStart) {
                        absEnd = absStart + 2.0;
                    }

                    mappedLines.push({
                        start: absStart,
                        end: absEnd,
                        text: txt
                    });
                }

                if (mappedLines.length === 0) {
                    throw new Error('No valid recap lines found in parsed array');
                }

                generatedChunkLines = mappedLines;
                chunkSuccess = true;
                break;
            } catch (err) {
                const errStr = (err.message || String(err)).toLowerCase();
                const status = err.status || err.statusCode || (err.response && err.response.status);
                const is429or5xx = status === 429 || (status >= 500 && status < 600) ||
                                   errStr.includes('429') || errStr.includes('resource_exhausted') ||
                                   errStr.includes('500') || errStr.includes('503') || errStr.includes('502') || errStr.includes('504');

                console.warn(`[RECAP] Chunk ${chunk.index} attempt ${attempt + 1} error: ${err.message}`);
                if (!is429or5xx && attempt >= 1) {
                    break;
                }
            } finally {
                if (proxyPath && fs.existsSync(proxyPath)) {
                    try { fs.unlinkSync(proxyPath); } catch (_) {}
                }
                if (uploadedFile && uploadedFile.name) {
                    try {
                        await ai.files.delete({ name: uploadedFile.name });
                        console.log(`[RECAP] Deleted chunk proxy ${uploadedFile.name} from Gemini`);
                    } catch (_) {}
                }
            }
        }

        if (!chunkSuccess) {
            console.warn(`[RECAP] Chunk ${chunk.index} failed all attempts, gracefully falling back to Whisper dialogue lines`);
            generatedChunkLines = getChunkWhisperFallback(chunkWhisperLines, chunk);
        }

        try {
            fs.writeFileSync(chunkCacheFile, JSON.stringify(generatedChunkLines, null, 2));
        } catch (e) {
            console.warn(`[RECAP] Failed to write chunk cache ${chunkCacheFile}:`, e.message);
        }

        allChunkLines.push(...generatedChunkLines);
    }

    const merged = mergeAndNormalizeRecapLines(allChunkLines, totalDur);
    const durationTotal = Math.round((Date.now() - startTime) / 1000);
    console.log(`[RECAP] Finished generating recap lines (${merged.length} lines) in ${durationTotal}s`);

    return merged;
}
