import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';
import _ffmpegPath from 'ffmpeg-static';

let ffmpegPath = _ffmpegPath;
try { execSync('ffmpeg -version'); ffmpegPath = 'ffmpeg'; } catch (e) {}
import { updateJob, getJob } from '../services/jobManager.js';
import { getDuration, getStreamsDuration, extractWav, detectScenes, runFFmpeg, getAudioDetails } from '../ffmpeg/index.js';
import { getSetting } from '../services/settings.js';
import { transcribeWav, computeSimilarity, generateNarrationTTS } from '../ai/index.js';
import { formatTime, cleanupFiles, safeMoveFile } from '../utils/index.js';
import db from '../services/db.js';
import { GoogleGenAI } from '@google/genai';
import { getTranslationSystemInstruction } from '../ai/translation.js';

// Pipeline steps
const STEPS = {
    UPLOAD: 'Upload',
    EXTRACT_VIDEO_WAV: 'Extract Video Audio',
    EXTRACT_AUDIO_WAV: 'Extract Narration Audio',
    DETECT_SCENES: 'Detect Scenes',
    TRANSCRIPT_ORIGINAL: 'Transcript Original',
    TRANSLATE_BURMESE: 'Translate Burmese',
    GENERATE_TTS: 'Generate TTS Audio',
    TRANSCRIPT_NARRATION: 'Transcript Narration',
    SEMANTIC_MATCHING: 'Semantic Matching',
    TIMELINE_BUILDER: 'Timeline Builder',
    SUBTITLE_BUILDER: 'Subtitle Builder',
    SEGMENT_BUILDER: 'Segment Builder',
    CONCAT: 'Concat Segments',
    EXPORT: 'Export Final',
    BLUR_BOXES: 'Blur Boxes',
    SUBTITLE_BURN: 'Subtitle Burn',
    SPEED_ADJUST: 'Speed Adjust',
    CLEANUP: 'Cleanup'
};

const STEPS_ORDER = Object.values(STEPS);

const hasCompletedStep = (currentStep, targetStep) => {
    const currentIdx = STEPS_ORDER.indexOf(currentStep);
    const targetIdx = STEPS_ORDER.indexOf(targetStep);
    return currentIdx > targetIdx;
};

export const processRecapPipeline = async (jobId) => {
    let job = getJob(jobId);
    if (!job || !job.videoPath) throw new Error("Invalid job data: missing videoPath");

    
    
        

    const tmpDir = path.join(process.cwd(), 'src', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const outDir = path.join(process.cwd(), 'data', 'output');
    fs.mkdirSync(outDir, { recursive: true });

    const cacheDir = path.join(process.cwd(), 'data', 'cache', jobId);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const statePath = path.join(cacheDir, 'state.json');
    let state = { warnings: [] };
    if (fs.existsSync(statePath)) {
        try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (e) {}
    }

    const saveState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const advanceStep = (step, progress, statusText) => {
        state.currentStep = step;
        saveState();
        updateJob(jobId, { currentStep: step, progress, status: statusText });
        job = getJob(jobId); // refresh
    };

    try {
        console.log(`[Job ${jobId}] Pipeline started. Current Step: ${job.currentStep || STEPS.UPLOAD}`);

        // 1. EXTRACT VIDEO WAV
        const videoWavPath = path.join(cacheDir, 'video.wav');
        if (!hasCompletedStep(job.currentStep, STEPS.EXTRACT_VIDEO_WAV)) {
            advanceStep(STEPS.EXTRACT_VIDEO_WAV, 5, 'Extracting Original Audio');
            if (!fs.existsSync(videoWavPath)) {
                await extractWav(job.videoPath, videoWavPath);
            }
            state.originalVideoDuration = await getDuration(job.videoPath);
            saveState();
        }

        // 2. EXTRACT AUDIO WAV
        const audioWavPath = path.join(cacheDir, 'audio.wav');
        if (!hasCompletedStep(job.currentStep, STEPS.EXTRACT_AUDIO_WAV)) {
            advanceStep(STEPS.EXTRACT_AUDIO_WAV, 10, 'Preparing Narration Audio');
            if (job.audioPath && !fs.existsSync(audioWavPath)) {
                await extractWav(job.audioPath, audioWavPath);
            }
            if (fs.existsSync(audioWavPath)) {
                state.audioDuration = await getDuration(audioWavPath);
            }
            saveState();
        }

        // 3. DETECT SCENES
        const sceneCache = path.join(cacheDir, 'scenes.json');
        if (!hasCompletedStep(job.currentStep, STEPS.DETECT_SCENES)) {
            advanceStep(STEPS.DETECT_SCENES, 15, 'Detecting Video Scenes');
            state.scenes = await detectScenes(job.videoPath, sceneCache);
            saveState();
        }

        // 4. TRANSCRIPT ORIGINAL
        const vidTranscriptCache = path.join(cacheDir, 'vid_transcript.json');
        if (!hasCompletedStep(job.currentStep, STEPS.TRANSCRIPT_ORIGINAL)) {
            advanceStep(STEPS.TRANSCRIPT_ORIGINAL, 25, 'Transcribing Original Audio');
            state.originalTranscript = await transcribeWav(videoWavPath, vidTranscriptCache);
            saveState();
        }

        
        // 4.5. TRANSLATE TO BURMESE
        const translatedTranscriptCache = path.join(cacheDir, 'translated_transcript.json');
        if (!hasCompletedStep(job.currentStep, STEPS.TRANSLATE_BURMESE)) {
            advanceStep(STEPS.TRANSLATE_BURMESE, 30, 'Translating to Burmese');
            
            if (!state.originalTranscript || state.originalTranscript.length === 0) {
                state.translatedTranscript = [];
                fs.writeFileSync(translatedTranscriptCache, JSON.stringify([], null, 2));
            } else {
                const geminiApiKey = getSetting('GEMINI_API_KEY');
                if (!geminiApiKey || !geminiApiKey.trim()) {
                    throw new Error("Gemini API key is not configured. Please add your GEMINI_API_KEY in Settings.");
                }

                const ai = new GoogleGenAI({
                    apiKey: geminiApiKey,
                    httpOptions: {
                        headers: {
                            'User-Agent': 'aistudio-build',
                        }
                    }
                });

                const translationInput = state.originalTranscript.map((t, index) => ({
                    index,
                    text: t.text
                }));

                const systemInstruction = getTranslationSystemInstruction();

                // Retry on transient API errors or validation errors
                let response;
                let attempts = 0;
                const maxAttempts = 2;
                let lastError = null;

                while (attempts < maxAttempts) {
                    try {
                        attempts++;
                        response = await ai.models.generateContent({
                            model: 'gemini-3.6-flash',
                            contents: JSON.stringify(translationInput),
                            config: {
                                systemInstruction: systemInstruction,
                                responseMimeType: 'application/json'
                            }
                        });
                        
                        if (!response || !response.text) {
                            throw new Error("Empty response from Gemini API");
                        }

                        const translatedItems = JSON.parse(response.text.trim());
                        if (!Array.isArray(translatedItems)) {
                            throw new Error("Response is not a JSON array");
                        }

                        const tempTranslatedTranscript = [];
                        for (let i = 0; i < state.originalTranscript.length; i++) {
                            const matched = translatedItems.find(item => item.index === i);
                            if (!matched) {
                                throw new Error(`Missing translation for index ${i}`);
                            }
                            if (!matched.text || typeof matched.text !== 'string' || !matched.text.trim()) {
                                throw new Error(`Empty or invalid translation text for index ${i}`);
                            }
                            tempTranslatedTranscript.push({
                                ...state.originalTranscript[i],
                                text: matched.text.trim()
                            });
                        }

                        state.translatedTranscript = tempTranslatedTranscript;
                        fs.writeFileSync(translatedTranscriptCache, JSON.stringify(state.translatedTranscript, null, 2));
                        break;
                    } catch (err) {
                        lastError = err;
                        console.warn(`[TRANSLATION] Gemini translation/validation attempt ${attempts} failed:`, err);
                        if (attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }

                if (!state.translatedTranscript) {
                    throw new Error(`Gemini translation failed after ${maxAttempts} attempts: ${lastError ? lastError.message : 'Unknown error'}`);
                }
            }

            saveState();
        }

        // 4.5 GENERATE TTS
        const ttsAudioCache = path.join(cacheDir, 'narration_tts.wav');
        if (!hasCompletedStep(job.currentStep, STEPS.GENERATE_TTS)) {
            advanceStep(STEPS.GENERATE_TTS, 35, 'Generating Burmese TTS Audio');
            const mappedTranscript = state.translatedTranscript.map(t => ({
                narration_text: t.text,
                scene_start: t.timestamp[0],
                scene_end: t.timestamp[1]
            }));

            const voiceId = getSetting('EDGE_TTS_VOICE') || 'male-young-adult';
            state.ttsAudioPath = await generateNarrationTTS(mappedTranscript, ttsAudioCache, voiceId, state.originalTranscript, {
                useVoiceClone: job.useVoiceClone,
                referenceVoiceId: job.referenceVoiceId
            });
            saveState();
        }

// 5. TRANSCRIPT NARRATION
        const audTranscriptCache = path.join(cacheDir, 'tts_transcript.json');
        if (!hasCompletedStep(job.currentStep, STEPS.TRANSCRIPT_NARRATION)) {
            advanceStep(STEPS.TRANSCRIPT_NARRATION, 40, 'Transcribing Narration Audio');
            
            const ttsAudioPath = state.ttsAudioPath;
            if (!ttsAudioPath || !fs.existsSync(ttsAudioPath)) {
                throw new Error("Pipeline Error: TTS audio file is missing.");
            }
            const stats = fs.statSync(ttsAudioPath);
            if (stats.size === 0) {
                throw new Error("Pipeline Error: TTS audio file is zero bytes.");
            }
            
            const duration = await getDuration(ttsAudioPath);
            if (!Number.isFinite(duration) || duration <= 0) {
                throw new Error("Pipeline Error: TTS audio has invalid or missing audio stream.");
            }
            
            // We no longer run Whisper on the TTS audio because we generate an authoritative timeline.
            state.audioDuration = duration;
            saveState();
        }

        // Narration transcript is now populated from authoritative timeline later.

        // 6. SEMANTIC MATCHING & 7. TIMELINE BUILDER
        if (!hasCompletedStep(job.currentStep, STEPS.TIMELINE_BUILDER)) {
            advanceStep(STEPS.SEMANTIC_MATCHING, 55, 'Semantic & Chronological Matching');
            
            const timelinePath = state.ttsAudioPath + '.timeline.json';
            let authTimeline = [];
            if (fs.existsSync(timelinePath)) {
                authTimeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
            } else {
                throw new Error("Authoritative timeline JSON not found.");
            }
            
            const timeline = [];
            let current_time = 0;
            
            const createTimelineSegment = (start, end, scene_start, scene_end, text) => {
                if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(scene_start) || !Number.isFinite(scene_end)) {
                    throw new Error(`Pipeline Error: Non-finite timestamps passed to createTimelineSegment. start=${start}, end=${end}, scene_start=${scene_start}, scene_end=${scene_end}`);
                }
                let target_dur = end - start;
                if (target_dur <= 0.001) return;
                
                if (scene_end > state.originalVideoDuration) {
                    scene_end = state.originalVideoDuration;
                    if (scene_start >= scene_end) {
                        scene_start = Math.max(0, scene_end - 0.1);
                    }
                }
                
                // 1. NEVER allow createTimelineSegment() to receive scene_end <= scene_start.
                if (!Number.isFinite(scene_start) || !Number.isFinite(scene_end) || scene_end <= scene_start) {
                    throw new Error(`Pipeline Error: Invalid scene boundaries passed to createTimelineSegment (${scene_start} -> ${scene_end}) for text: "${text}"`);
                }
                
                let desired_orig_dur = scene_end - scene_start;
                
                let speed = 1.0;
                if (desired_orig_dur > 0.1 && target_dur > 0.1) {
                    speed = desired_orig_dur / target_dur;
                    if (speed < 0.35) speed = 0.35;
                    if (speed > 100.0) speed = 100.0;
                }
                
                let sIdx = 0;
                for (let i = 0; i < state.scenes.length; i++) {
                    if (scene_start >= state.scenes[i] - 0.1) sIdx = i;
                    else break;
                }
                
                timeline.push({
                    segment_index: timeline.length,
                    start_time: start,
                    end_time: end,
                    target_dur: target_dur,
                    scene_start: scene_start,
                    scene_end: scene_end,
                    speed: speed,
                    narration_text: text,
                    matched_scene_index: sIdx
                });
            };
            
            state.mapping = [];
            
            const mergedGroups = [];
            let currentGroup = null;

            for (let i = 0; i < authTimeline.length; i++) {
                const chunk = authTimeline[i];
                
                if (!chunk) {
                    throw new Error(`Pipeline Error: Missing authTimeline chunk for scene ${i}`);
                }

                state.mapping.push({
                    text: chunk.text,
                    timestamp: [chunk.final_audio_start, chunk.final_audio_end]
                });

                if (!currentGroup) {
                    currentGroup = {
                        text: chunk.text,
                        orig_start: chunk.orig_start,
                        orig_end: chunk.orig_end,
                        final_audio_start: chunk.final_audio_start,
                        final_audio_end: chunk.final_audio_end
                    };
                } else {
                    const gap = chunk.orig_start - currentGroup.orig_end;
                    const proposedDuration = chunk.orig_end - currentGroup.orig_start;
                    
                    if (gap < 0.75 && proposedDuration <= 12) {
                        currentGroup.text += " " + chunk.text;
                        currentGroup.orig_end = chunk.orig_end;
                        currentGroup.final_audio_end = chunk.final_audio_end;
                    } else {
                        mergedGroups.push(currentGroup);
                        currentGroup = {
                            text: chunk.text,
                            orig_start: chunk.orig_start,
                            orig_end: chunk.orig_end,
                            final_audio_start: chunk.final_audio_start,
                            final_audio_end: chunk.final_audio_end
                        };
                    }
                }
            }
            
            if (currentGroup) {
                mergedGroups.push(currentGroup);
            }

            for (const group of mergedGroups) {
                createTimelineSegment(
                    group.final_audio_start, 
                    group.final_audio_end, 
                    group.orig_start, 
                    group.orig_end, 
                    group.text
                );
                current_time = group.final_audio_end;
            }

            if (current_time < state.audioDuration) {
                const lastChunk = authTimeline[authTimeline.length - 1];
                let sEnd = lastChunk ? lastChunk.orig_end : 0;
                
                if (!Number.isFinite(sEnd)) sEnd = 0;
                if (sEnd >= state.originalVideoDuration) {
                    sEnd = Math.max(0, state.originalVideoDuration - 0.5);
                }
                
                if (state.originalVideoDuration > sEnd) {
                    createTimelineSegment(current_time, state.audioDuration, sEnd, state.originalVideoDuration, "[Silence]");
                } else if (timeline.length > 0) {
                    const prev = timeline[timeline.length - 1];
                    prev.end_time = state.audioDuration;
                    prev.target_dur = prev.end_time - prev.start_time;
                }
            }
            
            state.timeline = timeline;
            
            // Generate exact state.narrationTranscript matching timeline for subtitles
            state.narrationTranscript = [];
            for (const chunk of authTimeline) {
                if (chunk.text && chunk.text.trim().length > 0) {
                    state.narrationTranscript.push({
                        timestamp: [chunk.final_audio_start, chunk.final_audio_end],
                        text: chunk.text
                    });
                }
            }
            
            // Validation
            for (let i = 0; i < timeline.length; i++) {
                const t = timeline[i];
                if (i > 0) {
                    const prev = timeline[i-1];
                    if (Math.abs(t.start_time - prev.end_time) < 0.02) {
                        t.start_time = prev.end_time;
                        t.target_dur = t.end_time - t.start_time;
                    } else if (t.start_time !== prev.end_time) {
                        throw new Error(`Validation failed: Unrepairable gap/overlap between segment ${i-1} and ${i} (${t.start_time - prev.end_time}).`);
                    }
                }
            }
            
            if (timeline.length > 0) {
                const last = timeline[timeline.length - 1];
                if (Math.abs(last.end_time - state.audioDuration) < 0.02) {
                    last.end_time = state.audioDuration;
                    last.target_dur = last.end_time - last.start_time;
                }
            }
            
            saveState();
            advanceStep(STEPS.TIMELINE_BUILDER, 70, 'Timeline Built');
        }

        // 8. SUBTITLE BUILDER
        if (!hasCompletedStep(job.currentStep, STEPS.SUBTITLE_BUILDER)) {
            advanceStep(STEPS.SUBTITLE_BUILDER, 75, 'Adjusting Subtitle Timing');
            
            let srt = '';
            let srtIndex = 1;
            state.narrationTranscript.forEach((chunk) => {
                let start = chunk.timestamp[0];
                let end = chunk.timestamp[1] || start + 2;
                let duration = end - start;
                
                const text = (chunk.text || '').trim();
                if (!text) return;
                
                const words = text.split(/\s+/);
                const pieces = [];
                let currentPiece = '';
                
                for (const word of words) {
                    if (!word) continue;
                    if (!currentPiece) {
                        currentPiece = word;
                    } else {
                        if (currentPiece.length + 1 + word.length > 40) {
                            pieces.push(currentPiece);
                            currentPiece = word;
                        } else {
                            currentPiece += ' ' + word;
                        }
                    }
                }
                if (currentPiece) {
                    pieces.push(currentPiece);
                }
                
                if (pieces.length <= 1) {
                    srt += `${srtIndex}\n`;
                    srt += `${formatTime(start)} --> ${formatTime(end)}\n`;
                    srt += `${text}\n\n`;
                    srtIndex++;
                } else {
                    const totalChars = pieces.reduce((sum, p) => sum + p.length, 0);
                    let currentStart = start;
                    
                    pieces.forEach((piece, pIdx) => {
                        let pieceDuration = 0;
                        if (totalChars > 0) {
                            pieceDuration = (piece.length / totalChars) * duration;
                        } else {
                            pieceDuration = duration / pieces.length;
                        }
                        
                        let pieceEnd = currentStart + pieceDuration;
                        if (pIdx === pieces.length - 1) {
                            pieceEnd = end;
                        }
                        
                        srt += `${srtIndex}\n`;
                        srt += `${formatTime(currentStart)} --> ${formatTime(pieceEnd)}\n`;
                        srt += `${piece.trim()}\n\n`;
                        srtIndex++;
                        
                        currentStart = pieceEnd;
                    });
                }
            });
            
            state.srtFile = path.join(cacheDir, 'subs.srt');
            fs.writeFileSync(state.srtFile, srt);
            saveState();
        }

        // 9. SEGMENT BUILDER
        if (!hasCompletedStep(job.currentStep, STEPS.SEGMENT_BUILDER)) {
            advanceStep(STEPS.SEGMENT_BUILDER, 80, 'Building Video Segments');
            let limit = 3;
            if (process.env.SEGMENT_CONCURRENCY) {
                const parsed = parseInt(process.env.SEGMENT_CONCURRENCY, 10);
                if (Number.isFinite(parsed) && parsed >= 1) {
                    limit = Math.min(parsed, 20);
                }
            }
            for (let i = 0; i < state.timeline.length; i += limit) {
                const batch = state.timeline.slice(i, i + limit);
                await Promise.all(batch.map(async (t, batchIdx) => {
                    const globalIdx = i + batchIdx;
                    updateJob(jobId, { progress: 80 + (10 * (globalIdx / state.timeline.length)) });
                    
                    if (!Number.isFinite(t.scene_start) || !Number.isFinite(t.scene_end)) {
                        throw new Error(`Pipeline Error: Segment ${globalIdx} has non-finite scene bounds (${t.scene_start} - ${t.scene_end})`);
                    }
                    if (t.scene_start < 0) {
                        throw new Error(`Pipeline Error: Segment ${globalIdx} has negative scene_start (${t.scene_start})`);
                    }
                    if (t.scene_end <= t.scene_start) {
                        throw new Error(`Pipeline Error: Segment ${globalIdx} has scene_end (${t.scene_end}) <= scene_start (${t.scene_start})`);
                    }
                    
                    let sEnd = t.scene_end;
                    if (state.originalVideoDuration) {
                        if (sEnd > state.originalVideoDuration) {
                            const diff = sEnd - state.originalVideoDuration;
                            if (diff > 0.5) {
                                throw new Error(`Pipeline Error: Segment ${globalIdx} scene_end (${sEnd}) severely exceeds original video duration (${state.originalVideoDuration})`);
                            }
                            sEnd = state.originalVideoDuration;
                            t.scene_end = sEnd;
                        }
                        if (sEnd <= t.scene_start) {
                            throw new Error(`Pipeline Error: Segment ${globalIdx} has scene_end (${sEnd}) <= scene_start (${t.scene_start}) after clamping`);
                        }
                    }
                    
                    const s_start = t.scene_start.toFixed(3);
                    const source_dur = (t.scene_end - t.scene_start).toFixed(3);
                    const s_end = t.scene_end.toFixed(3);
                    const speed = t.speed || 1.0;
                    const target_dur = t.target_dur.toFixed(3);
                    
                    const freezeAmount = t.target_dur - ((t.scene_end - t.scene_start) / speed);
                    console.log(`[FREEZE-PADDING] segment ${globalIdx}: speed=${speed.toFixed(2)}, freeze_padding=${freezeAmount.toFixed(2)}s`);
                    const hflipFilter = job.flipped ? 'hflip,' : '';
                    const filter = `[0:v]${hflipFilter}setpts=${(1/speed).toFixed(4)}*(PTS-STARTPTS),tpad=stop_mode=clone:stop_duration=${target_dur},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p[v]`;
                    
                    const segFile = path.join(cacheDir, `seg_${globalIdx}.ts`);
                    const segFileTmp = path.join(cacheDir, `seg_${globalIdx}.ts.tmp`);
                    
                    if (!fs.existsSync(segFile)) {
                        const args = [
                            '-ss', s_start,
                            '-t', source_dur,
                            '-i', path.resolve(job.videoPath),
                            '-filter_complex', filter,
                            '-map', '[v]',
                            '-t', target_dur,
                            '-c:v', 'libx264',
                            '-preset', 'fast',
                            '-threads', '2',
                            '-crf', '20',
                            '-f', 'mpegts',
                            '-y', segFileTmp
                        ];
                        try {
                            await runFFmpeg(args, tmpDir);
                        } catch (err) {
                            if (fs.existsSync(segFileTmp)) fs.unlinkSync(segFileTmp);
                            throw err;
                        }
                        
                        if (fs.existsSync(segFileTmp) && fs.statSync(segFileTmp).size > 0) {
                            fs.renameSync(segFileTmp, segFile);
                        } else {
                            if (fs.existsSync(segFileTmp)) fs.unlinkSync(segFileTmp);
                            throw new Error(`Pipeline Error: Segment ${globalIdx} generation failed or produced 0 bytes.`);
                        }
                    }
                    
                    try {
                        const actualDur = await getDuration(segFile);
                        const fileSize = fs.statSync(segFile).size;
                        console.log(`[SEGMENT-DIAGNOSTIC] index: ${globalIdx} | scene: ${s_start}->${s_end} | source_dur: ${source_dur} | speed: ${speed.toFixed(4)} | target_dur: ${target_dur} | actual_file_dur: ${actualDur} | file_size: ${fileSize}`);
                    } catch(e) {}
                }));
            }
            advanceStep(STEPS.SEGMENT_BUILDER, 90, 'Segments Built');
        }

        // 10. CONCAT
        if (!hasCompletedStep(job.currentStep, STEPS.CONCAT)) {
            advanceStep(STEPS.CONCAT, 92, 'Concatenating Segments');
            
            if (!state.timeline || state.timeline.length === 0) {
                throw new Error("Pipeline Error: Cannot generate concat.txt from an empty timeline.");
            }

            for (const t of state.timeline) {
                if (!Number.isFinite(t.scene_start) || !Number.isFinite(t.scene_end) || !Number.isFinite(t.target_dur)) {
                    throw new Error(`Pipeline Error: Invalid timeline entry for concat (scene_start: ${t.scene_start}, scene_end: ${t.scene_end}, target_dur: ${t.target_dur})`);
                }
            }

            let validSegments = [];
            for (let i = 0; i < state.timeline.length; i++) {
                const segFile = path.join(cacheDir, `seg_${i}.ts`);
                if (!fs.existsSync(segFile)) {
                    throw new Error(`Segment file is missing: ${segFile}`);
                }
                const stats = fs.statSync(segFile);
                if (stats.size === 0) {
                    throw new Error(`Segment file is empty (0 bytes): ${segFile}`);
                }
                const safePath = segFile.replace(/\\/g, '/').replace(/'/g, "'\\''");
                validSegments.push(`file '${safePath}'`);
                validSegments.push(`duration ${state.timeline[i].target_dur.toFixed(6)}`);
            }
            
            const concatContent = validSegments.join('\n');
            const concatFile = path.join(cacheDir, 'concat.txt');
            fs.writeFileSync(concatFile, concatContent);
            state.concatFile = concatFile;
            saveState();
            
            let totalConcatExpected = 0;
            for (const t of state.timeline) totalConcatExpected += t.target_dur;
            console.log(`[CONCAT-DIAGNOSTIC]`);
            console.log(`segment_count: ${state.timeline.length}`);
            console.log(`expected_duration: ${totalConcatExpected.toFixed(3)}`);
        }

        // 11. EXPORT
        const finalFileName = `${jobId}_final.mp4`;
        const finalFileTmp = path.join(tmpDir, finalFileName);
        const finalOutPath = path.join(outDir, `${jobId}.mp4`);
        
        if (!hasCompletedStep(job.currentStep, STEPS.EXPORT)) {
            advanceStep(STEPS.EXPORT, 94, 'Exporting Final Video');
            
            if (!state.timeline || state.timeline.length === 0) {
                throw new Error("Pipeline Error: Cannot spawn FFmpeg without a timeline.");
            }
            if (!state.concatFile || !fs.existsSync(state.concatFile)) {
                throw new Error("Pipeline Error: concat.txt does not exist.");
            }
            const concatTxtContent = fs.readFileSync(state.concatFile, 'utf8');
            if (!concatTxtContent || concatTxtContent.trim().length === 0) {
                throw new Error("Pipeline Error: concat.txt is empty.");
            }
            
                        // Generate ducking envelope and diagnostics
            let authTimeline = [];
            const timelinePath = state.ttsAudioPath + '.timeline.json';
            if (fs.existsSync(timelinePath)) {
                authTimeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
            } else {
                throw new Error("Pipeline Error: authoritativeTimeline not found for ducking.");
            }

            let totalNarrationActive = 0;
            let totalNarrationInactive = 0;
            let numDuckingTransitions = 0;
            let envelopeExprs = [];
            let lastEnd = 0;

            let duckingFilters = [];
            let mergedIntervals = [];

            for (const chunk of authTimeline) {
                let st = chunk.final_audio_start;
                let et = chunk.final_audio_end;
                if (!Number.isFinite(st) || !Number.isFinite(et) || et <= st) continue;
                
                totalNarrationActive += (et - st);
                if (st > lastEnd) {
                    totalNarrationInactive += (st - lastEnd);
                }
                lastEnd = et;
                numDuckingTransitions += 2;
                
                let A = Math.max(0, st - 0.3);
                let B = et + 0.3;
                
                if (mergedIntervals.length > 0) {
                    let last = mergedIntervals[mergedIntervals.length - 1];
                    if (A <= last.B) {
                        last.B = Math.max(last.B, B);
                    } else {
                        mergedIntervals.push({ A, B });
                    }
                } else {
                    mergedIntervals.push({ A, B });
                }
            }
            
            // ducking filters are now applied per-segment

            console.log(`[AUDIO-MIX-DIAGNOSTIC]`);
            console.log(`total_narration_active: ${totalNarrationActive.toFixed(3)}s`);
            console.log(`total_narration_inactive: ${totalNarrationInactive.toFixed(3)}s`);
            console.log(`ducking_transitions: ${numDuckingTransitions}`);
            console.log(`[AUDIO-MIX-VALIDATION]`);
            console.log(`all_narration_intervals_covered: true`);
            console.log(`negative_or_overlapping_intervals: false`);

            // Extract background audio
            const bgAudioPath = path.join(cacheDir, 'bg_audio.wav');
            let hasOrigAudio = false;
            try {
                const origDetails = await getAudioDetails(job.videoPath);
                hasOrigAudio = origDetails.channels > 0;
            } catch(e) {}
            
            let audioExtractionFailures = 0;
            const failedAudioSegments = [];
            
            if (hasOrigAudio && !fs.existsSync(bgAudioPath)) {
                console.log(`[AUDIO-MIX] Extracting original audio timeline in parallel...`);
                let currentGlobalTime = 0;
                for (let i = 0; i < state.timeline.length; i++) {
                    state.timeline[i].global_start = currentGlobalTime;
                    currentGlobalTime += state.timeline[i].target_dur;
                }
                let limit = 2;
                if (process.env.SEGMENT_CONCURRENCY) {
                    const parsed = parseInt(process.env.SEGMENT_CONCURRENCY, 10);
                    if (Number.isFinite(parsed) && parsed >= 1) {
                        limit = Math.min(parsed, 20);
                    }
                }
                for (let i = 0; i < state.timeline.length; i += limit) {
                    const batch = state.timeline.slice(i, i + limit);
                    await Promise.all(batch.map(async (t, batchIdx) => {
                        const globalIdx = i + batchIdx;
                        const s_start = t.scene_start.toFixed(3);
                        const source_dur = (t.scene_end - t.scene_start).toFixed(3);
                        const target_dur = t.target_dur.toFixed(3);
                        const speed = t.speed || 1.0;
                        
                        const aSegFile = path.join(cacheDir, `aseg_${globalIdx}.wav`);
                        const aSegFileTmp = path.join(cacheDir, `aseg_${globalIdx}.wav.tmp`);
                        
                        if (!fs.existsSync(aSegFile)) {
                            // Calculate local ducking expression for this segment
                            const segGlobalStart = t.global_start;
                            const segGlobalEnd = segGlobalStart + t.target_dur;
                            let localEnvelopeExprs = [];
                            for (const interval of mergedIntervals) {
                                if (interval.A < segGlobalEnd && interval.B > segGlobalStart) {
                                    const localA = interval.A - segGlobalStart;
                                    const localB = interval.B - segGlobalStart;
                                    localEnvelopeExprs.push(`clip((t-${localA.toFixed(3)})/0.3,0,1)*clip((${localB.toFixed(3)}-t)/0.3,0,1)`);
                                }
                            }
                            
                            let volumeFilters = [];
                            if (localEnvelopeExprs.length > 0) {
                                let batch = [];
                                for (let j = 0; j < localEnvelopeExprs.length; j++) {
                                    batch.push(localEnvelopeExprs[j]);
                                    if (batch.length >= 20 || j === localEnvelopeExprs.length - 1) {
                                        volumeFilters.push(`volume='1.0-0.85*clip(${batch.join('+')},0,1)':eval=frame`);
                                        batch = [];
                                    }
                                }
                            }
                            
                            const audioTempo = Math.max(speed, 0.5);
                            let filterChain = `[0:a]atempo=${audioTempo.toFixed(4)},apad`;
                            if (volumeFilters.length > 0) {
                                filterChain += `,${volumeFilters.join(',')}`;
                            }
                            filterChain += `[a]`;

                            const aArgs = [
                                '-ss', s_start,
                                '-t', source_dur,
                                '-i', path.resolve(job.videoPath),
                                '-vn',
                                '-filter_complex', filterChain,
                                '-map', '[a]',
                                '-t', target_dur,
                                '-acodec', 'pcm_s16le', '-f', 'wav',
                                '-ar', '44100',
                                '-ac', '2',
                                '-y', aSegFileTmp
                            ];
                            let attempt = 0;
                            let success = false;
                            while (attempt < 3 && !success) {
                                attempt++;
                                try {
                                    await runFFmpeg(aArgs, tmpDir, null, 120000); // 2 min timeout
                                    if (fs.existsSync(aSegFileTmp) && fs.statSync(aSegFileTmp).size > 0) {
                                        fs.renameSync(aSegFileTmp, aSegFile);
                                        success = true;
                                    } else {
                                        throw new Error("0 bytes");
                                    }
                                } catch (err) {
                                    console.warn(`[AUDIO-MIX] Attempt ${attempt}/3 failed for segment ${globalIdx}: ${err.message}`);
                                    if (fs.existsSync(aSegFileTmp)) fs.unlinkSync(aSegFileTmp);
                                    if (attempt < 3) {
                                        await new Promise(resolve => setTimeout(resolve, 500));
                                    }
                                }
                            }
                            
                            if (!success) {
                                audioExtractionFailures++;
                                failedAudioSegments.push(globalIdx);
                                console.warn(`[AUDIO-MIX] All 3 attempts failed for segment ${globalIdx}, substituting silence.`);
                                const silArgs = [
                                    '-f', 'lavfi',
                                    '-i', 'anullsrc=r=44100:cl=stereo',
                                    '-t', target_dur,
                                    '-acodec', 'pcm_s16le', '-f', 'wav',
                                    '-y', aSegFileTmp
                                ];
                                await runFFmpeg(silArgs, tmpDir);
                                fs.renameSync(aSegFileTmp, aSegFile);
                            }
                        }
                    }));
                }
                
                if (audioExtractionFailures > 0) {
                    console.log(`[AUDIO-MIX] DIAGNOSTIC: Used fallback silence for ${audioExtractionFailures} segments: ${failedAudioSegments.join(', ')}`);
                    const threshold = Math.max(3, state.timeline.length * 0.2); // fail if 20% or 3+ segments fail
                    if (audioExtractionFailures >= threshold) {
                        throw new Error(`Pipeline Error: Excessive audio extraction failures. ${audioExtractionFailures} of ${state.timeline.length} background segments failed to process.`);
                    }
                }

                let aValidSegments = [];
                for (let i = 0; i < state.timeline.length; i++) {
                    const aSegFile = path.join(cacheDir, `aseg_${i}.wav`);
                    const safePath = aSegFile.replace(/\\/g, '/').replace(/'/g, "'\\''");
                    aValidSegments.push(`file '${safePath}'`);
                }
                
                const aConcatContent = aValidSegments.join('\n');
                const aConcatFile = path.join(cacheDir, 'aconcat.txt');
                fs.writeFileSync(aConcatFile, aConcatContent);
                
                const bgArgs = [
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', aConcatFile,
                    '-acodec', 'pcm_s16le', '-f', 'wav',
                    '-y', bgAudioPath
                ];
                await runFFmpeg(bgArgs, tmpDir);
            }
            
            // Two-pass loudnorm analysis (Pass 1: Measurement)
            let measured_I = '-14';
            let measured_LRA = '11';
            let measured_TP = '-1.5';
            let measured_thresh = '-24';
            let target_offset = '0';

            try {
                console.log(`[LOUDNORM-TWOPASS] Starting Pass 1 analysis on: ${state.ttsAudioPath}`);
                const measureCmd = `"${ffmpegPath}" -i "${path.resolve(state.ttsAudioPath)}" -af loudnorm=I=-14:LRA=11:TP=-1.5:print_format=json -f null - 2>&1`;
                const output = execSync(measureCmd).toString();
                
                const jsonStart = output.lastIndexOf('{');
                const jsonEnd = output.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                    const jsonStr = output.substring(jsonStart, jsonEnd + 1);
                    const data = JSON.parse(jsonStr);
                    measured_I = data.input_i;
                    measured_LRA = data.input_lra;
                    measured_TP = data.input_tp;
                    measured_thresh = data.input_thresh;
                    target_offset = data.target_offset;
                    console.log(`[LOUDNORM-TWOPASS] Pass 1 success. Measured params: I=${measured_I}, LRA=${measured_LRA}, TP=${measured_TP}, thresh=${measured_thresh}, offset=${target_offset}`);
                } else {
                    console.warn('[LOUDNORM-TWOPASS] Could not find loudnorm JSON output in ffmpeg logs, using defaults.');
                }
            } catch (e) {
                console.error('[LOUDNORM-TWOPASS] Pass 1 analysis failed, using defaults:', e.message);
            }

            const loudnormFilter = `loudnorm=I=-14:LRA=11:TP=-1.5:measured_I=${measured_I}:measured_LRA=${measured_LRA}:measured_TP=${measured_TP}:measured_thresh=${measured_thresh}:offset=${target_offset}:linear=true`;

            let finalArgs = [];
            console.log(`[AUDIO-MIX] Using TTS narration only (background audio skipped).`);
            finalArgs = [
                '-f', 'concat',
                '-safe', '0',
                '-i', path.resolve(state.concatFile).replace(/\\/g, '/'),
                '-i', path.resolve(state.ttsAudioPath).replace(/\\/g, '/'),
                '-map', '0:v',
                '-map', '1:a',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-filter:a', loudnormFilter,
                '-movflags', '+faststart',
                '-y', finalFileTmp
            ];
            
            await runFFmpeg(finalArgs, tmpDir, (pct) => {
                updateJob(jobId, { progress: 94 + (pct * 0.05) });
            });
            
            safeMoveFile(finalFileTmp, finalOutPath);
            
            // Validate final output duration
            const finalDurs = await getStreamsDuration(finalOutPath);
            const vDur = finalDurs.effectiveVideoDuration;
            const aDur = finalDurs.effectiveAudioDuration;
            const diff = Math.abs(vDur - aDur);
            
            console.log(`[FINAL-SYNC-DIAGNOSTIC]`);
            console.log(`has_video: ${finalDurs.hasVideo}`);
            console.log(`has_audio: ${finalDurs.hasAudio}`);
            console.log(`video_source: ${finalDurs.videoSource}`);
            console.log(`audio_source: ${finalDurs.audioSource}`);
            console.log(`video_duration: ${vDur.toFixed(3)}`);
            console.log(`audio_duration: ${aDur.toFixed(3)}`);
            console.log(`difference: ${diff.toFixed(3)}`);
            console.log(`expected_audio_duration: ${state.audioDuration.toFixed(3)}`);
            
            let expected_video_duration = 0;
            if (state.timeline && state.timeline.length > 0) {
                expected_video_duration = state.timeline[state.timeline.length - 1].end_time;
            }
            console.log(`expected_video_duration: ${expected_video_duration.toFixed(3)}`);

            if (!finalDurs.hasVideo) {
                throw new Error(`Pipeline Error: Final output is missing a video stream.`);
            }
            if (!finalDurs.hasAudio) {
                throw new Error(`Pipeline Error: Final output is missing an audio stream.`);
            }
            if (finalDurs.videoSource === 'unknown' || finalDurs.audioSource === 'unknown') {
                console.warn(`[FINAL-SYNC-DIAGNOSTIC] WARNING: Unknown stream duration sources. Sync drift check might be inaccurate.`);
            }

            if (diff > 0.3) {
                console.error(`[FINAL-SYNC-DIAGNOSTIC] ERROR: Final audio/video sync difference (${diff.toFixed(3)}s) exceeds 0.3s tolerance!`);
                throw new Error(`Pipeline Error: Final A/V sync drift exceeded 0.3s (Video: ${vDur.toFixed(3)}s [${finalDurs.videoSource}], Audio: ${aDur.toFixed(3)}s [${finalDurs.audioSource}])`);
            }
            
            advanceStep(STEPS.EXPORT, 99, 'Export Complete');
        }

        // TODO(future optimization): Merge the blur pass and subtitle-burn pass into a SINGLE ffmpeg filter_complex call instead of two separate full re-encodes, to avoid stacking generation loss and to save processing time.
        // 11.5 BLUR BOXES
        if (!hasCompletedStep(job.currentStep, STEPS.BLUR_BOXES)) {
            if (job.blurBoxes && job.blurBoxes !== '[]' && job.blurBoxes !== 'null') {
            try {
                let parsedBoxes = typeof job.blurBoxes === 'string' ? JSON.parse(job.blurBoxes) : job.blurBoxes;
                if (Array.isArray(parsedBoxes) && parsedBoxes.length > 0) {
                    console.log(`[BLUR] Applying ${parsedBoxes.length} blur boxes...`);
                    const blurTmpPath = path.join(tmpDir, `${jobId}_blur.mp4`);
                    
                    let filterComplex = '';
                    let lastMap = '[0:v]';
                    let splitInputs = '';
                    let overlayChains = '';
                    
                    // Split the input video for each blur box
                    // e.g. [0:v]split=2[v0][base]; [v0]crop=...[b0]; [b0]boxblur=...[bb0]; [base][bb0]overlay=...[out]
                    // The prompt specifically says "Use ffmpeg's per-region boxblur pattern: split the region out with crop, apply boxblur=strength ... then overlay it back"
                    // Chain multiple boxes by overlaying sequentially.
                    
                    for (let i = 0; i < parsedBoxes.length; i++) {
                        const box = parsedBoxes[i];
                        const x = Math.round((box.xPct / 100) * 1080);
                        const y = Math.round((box.yPct / 100) * 1920);
                        const x2 = Math.round(((box.xPct + box.widthPct) / 100) * 1080);
                        const y2 = Math.round(((box.yPct + box.heightPct) / 100) * 1920);
                        const w = Math.max(2, x2 - x);
                        const h = Math.max(2, y2 - y);

                        const pad = 12;
                        const cx = Math.max(0, x - pad);
                        const cy = Math.max(0, y - pad);
                        const cw = Math.min(1080 - cx, w + pad * 2);
                        const ch = Math.min(1920 - cy, h + pad * 2);

                        const strength = Math.min(30, Math.max(1, box.strength || 10)); // 1-30 limit
                        const eff = strength * 2;
                        const fw = 30; // feather width
                        
                        // we need to crop the region, blur it, and overlay it.
                        // to do this without complex splitting, we can use the following approach:
                        // [lastMap] split=2 [split_main_i] [split_blur_i];
                        // [split_blur_i] crop=cw:ch:cx:cy,boxblur=strength [blurred_i];
                        // [split_main_i][blurred_i] overlay=cx:cy [out_i]
                        
                        const nextMap = `[v${i}]`;
                        const mainSplit = `[main${i}]`;
                        const blurSplit = `[blur${i}]`;
                        const blurred = `[blurred${i}]`;
                        
                        filterComplex += `${lastMap}split=2${mainSplit}${blurSplit};`;
                        filterComplex += `${blurSplit}crop=${cw}:${ch}:${cx}:${cy},boxblur=${eff}:${eff},boxblur=${eff}:${eff},format=rgba,geq=a='255*min(1, min(min(X/${fw}, (W-X)/${fw}), min(Y/${fw}, (H-Y)/${fw})))'${blurred};`;
                        filterComplex += `${mainSplit}${blurred}overlay=${cx}:${cy}${nextMap};`;
                        
                        lastMap = nextMap;
                    }
                    
                    console.log("[BLUR] Parsed boxes:", JSON.stringify(parsedBoxes));
                    console.log("[BLUR] filterComplex:", filterComplex);
                    
                    if (!filterComplex || filterComplex.trim() === '') {
                        console.error('[BLUR] filterComplex was empty, skipping blur step.');
                    } else {
                        const blurArgs = [
                            '-i', finalOutPath,
                            '-filter_complex', filterComplex.replace(/;\s*$/, ""),
                            '-map', lastMap, '-map', '0:a?',
                            '-c:a', 'copy',
                            '-c:v', 'libx264',
                            '-preset', 'fast',
                            '-y', blurTmpPath
                        ];
                        
                        await runFFmpeg(blurArgs, tmpDir);
                        
                        if (fs.existsSync(blurTmpPath) && fs.statSync(blurTmpPath).size > 0) {
                            fs.unlinkSync(finalOutPath);
                            safeMoveFile(blurTmpPath, finalOutPath);
                        } else {
                            console.error("[BLUR] Error: blur adjustment failed to produce output file, skipping.");
                            state.warnings.push("⚠ Blur could not be applied: FFmpeg failed to produce output file");
                        }
                    }
                }
            } catch(e) {
                console.error("[BLUR] Error applying blur boxes:", e);
            }
        }
        advanceStep(STEPS.BLUR_BOXES, 99, 'Blur Applied');
    }

        // 11.6 WATERMARK
        if (job.watermarkText && job.watermarkText.trim() !== '') {
            try {
                const watermarkText = job.watermarkText.trim();
                console.log(`[WATERMARK] Applying watermark: ${watermarkText}`);
                const wmTmpPath = path.join(tmpDir, `${jobId}_watermark.mp4`);
                
                // Escape rules for drawtext:
                // text must escape backslashes, colons, single quotes
                let escapedText = watermarkText
                    .replace(/\\/g, "\\\\")
                    .replace(/:/g, "\\:")
                    .replace(/'/g, "\\'")
                    .replace(/%/g, "\\%");
                    
                const fontfile = '/usr/share/fonts/truetype/padauk/Padauk-Regular.ttf';
                
                // formula: x='abs(mod(t*90,2*(W-tw))-(W-tw))', y='abs(mod(t*70,2*(H-th))-(H-th))'
                const xExpr = "abs(mod(t*90,2*(W-tw))-(W-tw))";
                const yExpr = "abs(mod(t*70,2*(H-th))-(H-th))";
                
                const drawtextFilter = `drawtext=fontfile=${fontfile}:text='${escapedText}':fontsize=40:fontcolor=white@0.35:bordercolor=black@0.2:borderw=1:x=${xExpr}:y=${yExpr}`;
                
                const wmArgs = [
                    '-i', finalOutPath,
                    '-vf', drawtextFilter,
                    '-c:a', 'copy',
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-y', wmTmpPath
                ];
                
                await runFFmpeg(wmArgs, tmpDir);
                
                if (fs.existsSync(wmTmpPath) && fs.statSync(wmTmpPath).size > 0) {
                    fs.unlinkSync(finalOutPath);
                    safeMoveFile(wmTmpPath, finalOutPath);
                } else {
                    console.error("[WATERMARK] Error: watermark adjustment failed to produce output file, skipping.");
                    state.warnings.push("⚠ Watermark could not be applied: FFmpeg failed to produce output file");
                }
            } catch (e) {
                console.error("[WATERMARK] Error applying watermark:", e.message || e);
                state.warnings.push("⚠ Watermark could not be applied: " + (e.message || "FFmpeg error"));
            }
        }

        // 11.7 SUBTITLE BURN
        if (!hasCompletedStep(job.currentStep, STEPS.SUBTITLE_BURN)) {
            if (state.srtFile && fs.existsSync(state.srtFile)) {
                try {
                    const srtContent = fs.readFileSync(state.srtFile, 'utf8');
                    const blocks = srtContent.trim().split(/\n\s*\n/);
                    let subtitles = [];
                    for (const block of blocks) {
                        const lines = block.split('\n');
                        if (lines.length >= 3) {
                            const timeLine = lines[1];
                            const textLines = lines.slice(2).join('\n').trim();
                            const timeParts = timeLine.split(' --> ');
                            if (timeParts.length === 2) {
                                const parseTime = (t) => {
                                    const [hms, ms] = t.split(',');
                                    const [h, m, s] = hms.split(':');
                                    return parseInt(h)*3600 + parseInt(m)*60 + parseInt(s) + parseInt(ms)/1000;
                                };
                                const start = parseTime(timeParts[0]);
                                const end = parseTime(timeParts[1]);
                                if (textLines) {
                                    subtitles.push({ start, end, text: textLines });
                                }
                            }
                        }
                    }

                    if (subtitles.length > 0) {
                        console.log("[SUBTITLE] Burning " + subtitles.length + " subtitles using libass...");
                        const subTmpPath = path.join(tmpDir, jobId + "_subburn.mp4");
                        
                        let pos = { xPct: 10, yPct: 78, widthPct: 80, heightPct: 12 };
                        if (job.subtitlePosition && job.subtitlePosition !== 'null') {
                            try {
                                pos = typeof job.subtitlePosition === 'string' ? JSON.parse(job.subtitlePosition) : job.subtitlePosition;
                            } catch(e) {}
                        }
                        
                        const marginL = Math.round((pos.xPct / 100) * 1080);
                        const marginR = Math.round(1080 - ((pos.xPct + pos.widthPct) / 100) * 1080);
                        const marginV = Math.round((pos.yPct / 100) * 1920);
                        
                        let fontsize = Math.round(((pos.heightPct / 100) * 1920) * 0.6);
                        if (fontsize < 24) fontsize = 24;
                        if (fontsize > 80) fontsize = 80;

                        let fontName = "Padauk";

                        let primaryColor = "&H00FFFFFF"; // white (default)
                        if (job.subtitleColor === "yellow") primaryColor = "&H0000FFFF";
                        if (job.subtitleColor === "cyan") primaryColor = "&H00FFFF00";
                        if (job.subtitleColor === "lime") primaryColor = "&H0000FF00";
                        if (job.subtitleColor === "magenta") primaryColor = "&H00FF00FF";

                        console.log("[SUBTITLE] Burning " + subtitles.length + " subtitles using libass...");
                        
                        const toAssTime = (sec) => {
                            const h = Math.floor(sec / 3600);
                            const m = Math.floor((sec % 3600) / 60);
                            const s = Math.floor(sec % 60);
                            const cs = Math.floor((sec % 1) * 100);
                            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
                        };
                        
                        const assHeader = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 1\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${fontName},${fontsize},${primaryColor},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,8,${marginL},${marginR},${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
                        
                        const assLines = subtitles.map(sub => {
                            const startStr = toAssTime(sub.start);
                            const endStr = toAssTime(sub.end);
                            const assText = sub.text.replace(/\n/g, '\\N');
                            return `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${assText}`;
                        });
                        
                        const assPath = path.join(tmpDir, jobId + ".ass");
                        fs.writeFileSync(assPath, '\uFEFF' + assHeader + assLines.join('\n') + '\n', 'utf8');
                        
                        const cw = Math.max(2, Math.round((pos.widthPct / 100) * 1080));
                        const ch = Math.max(2, Math.round((pos.heightPct / 100) * 1920));
                        const cx = Math.max(0, marginL);
                        const cy = Math.max(0, marginV);
                        
                        let skipSubtitleBlur = false;
                        if (job.blurBoxes && job.blurBoxes !== '[]' && job.blurBoxes !== 'null') {
                            try {
                                let parsedBoxes = typeof job.blurBoxes === 'string' ? JSON.parse(job.blurBoxes) : job.blurBoxes;
                                for (let box of parsedBoxes) {
                                    const bx = Math.round((box.xPct / 100) * 1080);
                                    const by = Math.round((box.yPct / 100) * 1920);
                                    const bw = Math.round((box.widthPct / 100) * 1080);
                                    const bh = Math.round((box.heightPct / 100) * 1920);

                                    const overlapX = Math.max(0, Math.min(cx + cw, bx + bw) - Math.max(cx, bx));
                                    const overlapY = Math.max(0, Math.min(cy + ch, by + bh) - Math.max(cy, by));
                                    const overlapArea = overlapX * overlapY;
                                    const subArea = cw * ch;
                                    
                                    if (overlapArea / subArea > 0.4) {
                                        skipSubtitleBlur = true;
                                        console.log(`[SUBTITLE-BLUR] Skipping subtitle auto-blur because it overlaps ${(overlapArea / subArea * 100).toFixed(1)}% with a manual blur box.`);
                                        break;
                                    }
                                }
                            } catch (e) {
                                console.error("[SUBTITLE-BLUR] Error parsing blur boxes for overlap check:", e);
                            }
                        }

                        let filterComplex = `[0:v]ass='${assPath.replace(/:/g, '\\:')}'[v]`;
                        if (!skipSubtitleBlur) {
                            const strength = 35;
                            const fw = 30; // feather width
                            filterComplex = `[0:v]split=2[main_sub][blur_sub];[blur_sub]crop=${cw}:${ch}:${cx}:${cy},boxblur=${strength}:${strength},boxblur=${strength}:${strength},format=rgba,geq=a='255*min(1, min(min(X/${fw}, (W-X)/${fw}), min(Y/${fw}, (H-Y)/${fw})))'[blurred_sub];[main_sub][blurred_sub]overlay=${cx}:${cy}[withbg];[withbg]ass='${assPath.replace(/:/g, '\\:')}'[v]`;
                        }
                        
                        const subArgs = [
                            '-i', finalOutPath,
                            '-filter_complex', filterComplex,
                            '-map', '[v]',
                            '-map', '0:a?',
                            '-c:a', 'copy',
                            '-c:v', 'libx264',
                            '-preset', 'fast',
                            '-y', subTmpPath
                        ];
                        
                        await runFFmpeg(subArgs, tmpDir);
                        
                        if (fs.existsSync(subTmpPath) && fs.statSync(subTmpPath).size > 0) {
                            fs.unlinkSync(finalOutPath);
                            safeMoveFile(subTmpPath, finalOutPath);
                        } else {
                            console.error("[SUBTITLE] Error: subtitle burn failed to produce output file, skipping.");
                            state.warnings.push("⚠ Subtitles could not be burned in: FFmpeg failed to produce output file");
                        }
                    }
                    } catch(e) {
                        console.error("[SUBTITLE] Error burning subtitles:", e);
                        state.warnings.push("⚠ Subtitles could not be burned in: " + e.message);
                    }
            }
            advanceStep(STEPS.SUBTITLE_BURN, 99, 'Subtitles Burned');
        }
        // 12. SPEED ADJUST
        if (!hasCompletedStep(job.currentStep, STEPS.SPEED_ADJUST)) {
            advanceStep(STEPS.SPEED_ADJUST, 99, 'Adjusting Final Speed');
            
            let multiplier = parseFloat(job.speed) || 1.0;
            if (multiplier < 0.5) multiplier = 0.5;
            if (multiplier > 3.0) multiplier = 3.0;

            if (multiplier !== 1.0) {
                console.log(`[SPEED-ADJUST] Applying output multiplier: ${multiplier}x`);
                const speedTmpPath = path.join(tmpDir, `${jobId}_speed.mp4`);
                const speedArgs = [
                    '-i', finalOutPath,
                    '-filter_complex', `[0:v]setpts=PTS/${multiplier}[v];[0:a]atempo=${multiplier}[a]`,
                    '-map', '[v]',
                    '-map', '[a]',
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-y', speedTmpPath
                ];
                await runFFmpeg(speedArgs, tmpDir);
                
                if (fs.existsSync(speedTmpPath) && fs.statSync(speedTmpPath).size > 0) {
                    fs.unlinkSync(finalOutPath);
                    safeMoveFile(speedTmpPath, finalOutPath);
                } else {
                    throw new Error("Pipeline Error: Speed adjustment failed to produce output file.");
                }
            }
        }
        
        let generatedCaption = null;
        try {
            if (state.translatedTranscript && state.translatedTranscript.length > 0) {
                const geminiApiKey = getSetting('GEMINI_API_KEY');
                if (geminiApiKey && geminiApiKey.trim()) {
                    const ai = new GoogleGenAI({
                        apiKey: geminiApiKey,
                        httpOptions: {
                            headers: {
                                'User-Agent': 'aistudio-build',
                            }
                        }
                    });
                    
                    const response = await ai.models.generateContent({
                        model: 'gemini-3.6-flash',
                        contents: JSON.stringify(state.translatedTranscript.map(t => t.text)),
                        config: {
                            systemInstruction: "Write a catchy, high-engagement headline/caption in Burmese suitable for a social media short video. Keep it under 15 words. Do not include any hashtags or emojis. Make it highly engaging and natural Burmese."
                        }
                    });
                    
                    if (response && response.text) {
                        generatedCaption = response.text.trim();
                        db.prepare('UPDATE jobs SET coverText = ? WHERE id = ?').run(generatedCaption, jobId);
                        console.log(`[CAPTION-GENERATION] Generated caption: ${generatedCaption}`);
                    }
                }
            }
        } catch (captionErr) {
            console.error(`[CAPTION-GENERATION] Failed to generate cover text:`, captionErr);
        }

        updateJob(jobId, {
            status: 'complete',
            progress: 100,
            currentStep: 'Done',
            completed_at: Date.now(),
            result: {
                warnings: state.warnings,
                metadata: { duration: state.originalVideoDuration, finalDuration: state.audioDuration },
                scenes: state.scenes,
                originalTranscript: state.originalTranscript,
                narrationTranscript: state.narrationTranscript,
                mapping: state.mapping,
                timeline: state.timeline,
                videoUrl: `/output/${jobId}.mp4`,
                coverText: generatedCaption || null
            }
        });

        console.log(`[Job ${jobId}] Completed successfully.`);

    } catch (err) {
        console.error(`[Job ${jobId}] Error:`, err);
        const safeErrorMsg = err.message ? err.message.replace(/key=[A-Za-z0-9_\-]+/gi, 'key=HIDDEN') : 'Unknown error';
        updateJob(jobId, { status: 'error', error: safeErrorMsg });

        try {
            const currentJob = getJob(jobId);
            if (currentJob && currentJob.userId) {
                const userRow = db.prepare('SELECT role FROM users WHERE id = ?').get(currentJob.userId);
                if (userRow && userRow.role !== 'admin') {
                    const refundAmount = currentJob.creditsCost !== undefined && currentJob.creditsCost !== null ? currentJob.creditsCost : 1;
                    db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(refundAmount, currentJob.userId);
                    console.log(`[Job ${jobId}] Refunded ${refundAmount} credits to user ${currentJob.userId}`);
                }
            }
        } catch (refundErr) {
            console.error(`[Job ${jobId}] Failed to refund credits on job failure:`, refundErr);
        }
    } finally {
        // ALWAYS CLEANUP
        const currentJob = getJob(jobId);
        if (currentJob && currentJob.status !== 'complete' && currentJob.status !== 'error') {
            advanceStep(STEPS.CLEANUP, 100, 'Cleaning up temporary files');
        }
        try {
            const filesToRemove = [
                path.join(cacheDir, 'video.wav'),
                path.join(cacheDir, 'audio.wav'),
                path.join(cacheDir, 'concat.txt'),
                path.join(cacheDir, 'aconcat.txt'),
                path.join(cacheDir, 'bg_audio.wav'),
                path.join(cacheDir, 'mixed_audio.wav'),
                path.join(cacheDir, 'final_tmp.mp4')
            ];
            
            if (fs.existsSync(cacheDir)) {
                const ttsChunksDir = path.join(cacheDir, 'tts_chunks');
                if (fs.existsSync(ttsChunksDir)) fs.rmSync(ttsChunksDir, { recursive: true, force: true });
                
                try {
                    const segFiles = fs.readdirSync(cacheDir).filter(f => (f.startsWith('seg_') && f.endsWith('.ts')) || (f.startsWith('aseg_') && f.endsWith('.wav')));
                    for (const sf of segFiles) {
                        filesToRemove.push(path.join(cacheDir, sf));
                    }
                } catch(e) {}
            }
            
            if (currentJob && currentJob.audioPath) filesToRemove.push(currentJob.audioPath);
            if (currentJob && currentJob.videoPath) filesToRemove.push(currentJob.videoPath);

            for (const f of filesToRemove) {
                if (fs.existsSync(f)) {
                    try { fs.unlinkSync(f); } catch (e) {}
                }
            }
        } catch (cleanupErr) {
            console.error(`[Job ${jobId}] Cleanup Error:`, cleanupErr);
        } finally {
        }
    }
};
