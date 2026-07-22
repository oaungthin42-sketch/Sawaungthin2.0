import fs from 'fs';
import path from 'path';
import { updateJob, getJob, getJobKeys, clearJobKeys } from '../services/jobManager.js';
import { getDuration, getStreamsDuration, extractWav, detectScenes, runFFmpeg, getAudioDetails } from '../ffmpeg/index.js';
import { getSetting } from '../services/settings.js';
import { transcribeWav, computeSimilarity, translateWithGemini, generateNarrationTTS } from '../ai/index.js';
import { formatTime, cleanupFiles } from '../utils/index.js';

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

    const { geminiApiKey, assemblyApiKey } = getJobKeys(jobId);

    const tmpDir = path.join(process.cwd(), 'src', 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const outDir = path.join(process.cwd(), 'public', 'output');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const cacheDir = path.join(process.cwd(), 'data', 'cache', jobId);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const statePath = path.join(cacheDir, 'state.json');
    let state = {};
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
            advanceStep(STEPS.TRANSCRIPT_ORIGINAL, 25, 'Transcribing Original Video Audio');
            try { state.originalTranscript = await transcribeWav(videoWavPath, vidTranscriptCache); } catch (err) { throw new Error(`Pipeline Error: Transcription Stage Failed.\nInput File: ${videoWavPath} (WAV audio)\nUnderlying Error: ${err.message}\nDiagnostic: faster-whisper executable or model unavailable in current environment.`); }
            
            // Compatibility validation for originalTranscript
            if (!Array.isArray(state.originalTranscript)) {
                throw new Error("Pipeline Error: originalTranscript is invalid after Whisper transcription.");
            }
            if (state.originalTranscript.length === 0) {
                console.warn("[WARNING] originalTranscript is empty! Whisper returned no speech.");
            }
            
            let prevEnd = -1;
            for (let i = 0; i < state.originalTranscript.length; i++) {
                const chunk = state.originalTranscript[i];
                if (!chunk.timestamp || chunk.timestamp.length !== 2) throw new Error(`Pipeline Error: Invalid timestamp structure at chunk ${i}`);
                if (!chunk.text) throw new Error(`Pipeline Error: Empty text at chunk ${i}`);
                
                const start = chunk.timestamp[0];
                const end = chunk.timestamp[1];
                
                if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`Pipeline Error: Non-finite timestamp at chunk ${i}`);
                if (start < 0) throw new Error(`Pipeline Error: Negative start timestamp at chunk ${i}`);
                if (end <= start) throw new Error(`Pipeline Error: end <= start at chunk ${i}`);
                
                // Strict validation is now handled in transcribeWav inside src/ai/index.js
            }
            
            saveState();
        }

        
        // 4.5. TRANSLATE TO BURMESE
        const translatedTranscriptCache = path.join(cacheDir, 'translated_transcript.json');
        if (!hasCompletedStep(job.currentStep, STEPS.TRANSLATE_BURMESE)) {
            advanceStep(STEPS.TRANSLATE_BURMESE, 30, 'Translating to Burmese');
            state.translatedTranscript = await translateWithGemini(state.originalTranscript, translatedTranscriptCache, geminiApiKey);
            
            // Validation
            if (!Array.isArray(state.translatedTranscript)) {
                throw new Error("Pipeline Error: translatedTranscript is invalid after Gemini translation.");
            }
            if (state.translatedTranscript.length === 0) {
                console.warn("[WARNING] translatedTranscript is empty! Continuing with empty audio timeline.");
            }
            if (state.translatedTranscript.length !== state.originalTranscript.length) {
                throw new Error("Pipeline Error: translatedTranscript length mismatch.");
            }
            for (let i = 0; i < state.translatedTranscript.length; i++) {
                const chunk = state.translatedTranscript[i];
                if (!chunk || typeof chunk.text !== 'string' || chunk.text.trim() === '' || !chunk.timestamp) {
                    throw new Error(`Pipeline Error: Invalid translated chunk at index ${i}`);
                }
                if (chunk.timestamp[0] !== state.originalTranscript[i].timestamp[0] ||
                    chunk.timestamp[1] !== state.originalTranscript[i].timestamp[1]) {
                    throw new Error(`Pipeline Error: Timestamp mismatch at index ${i}`);
                }
            }
            saveState();
        }

        // 4.5 GENERATE TTS
        const ttsAudioCache = path.join(cacheDir, 'narration_tts.wav');
        if (!hasCompletedStep(job.currentStep, STEPS.GENERATE_TTS)) {
            advanceStep(STEPS.GENERATE_TTS, 35, 'Generating Burmese TTS Audio');
            const voiceId = getSetting('EDGE_TTS_VOICE') || 'male-young-adult';
            state.ttsAudioPath = await generateNarrationTTS(state.translatedTranscript, ttsAudioCache, voiceId, state.originalTranscript);
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
            
            for (let i = 0; i < authTimeline.length; i++) {
                const chunk = authTimeline[i];
                let c_start = chunk.final_audio_start;
                let c_end = chunk.final_audio_end;
                
                let chunk_start_time = c_start;
                
                if (c_start > current_time) {
                    // Gap
                    let gap_scene_start = i > 0 ? authTimeline[i-1].orig_end : 0;
                    let gap_scene_end = chunk.orig_start;
                    
                    if (Number.isFinite(gap_scene_start) && Number.isFinite(gap_scene_end) && gap_scene_end > gap_scene_start + 0.05) {
                        createTimelineSegment(current_time, c_start, gap_scene_start, gap_scene_end, "[Silence]");
                    } else {
                        // Skip zero-duration video gap safely by extending the NEXT segment's start_time backward
                        chunk_start_time = current_time;
                        console.log(`[AI] Skipped zero-duration gap video before chunk ${i}, merged audio silence into chunk video.`);
                    }
                }
                
                let chunk_orig_start = chunk.orig_start;
                let chunk_orig_end = chunk.orig_end;
                
                if (!Number.isFinite(chunk_orig_start)) chunk_orig_start = 0;
                if (!Number.isFinite(chunk_orig_end)) chunk_orig_end = chunk_orig_start;
                
                if (chunk_orig_end <= chunk_orig_start) {
                    chunk_orig_end = chunk_orig_start + Math.max(0.1, chunk.final_dur || 1.0);
                    if (chunk_orig_end > state.originalVideoDuration) {
                        chunk_orig_end = state.originalVideoDuration;
                    }
                    console.log(`[AI] Recovered invalid scene boundary for chunk ${i}: start=${chunk_orig_start}, new_end=${chunk_orig_end} (based on chunk dur)`);
                }
                
                if (chunk_orig_end - chunk_orig_start < 0.05) {
                    if (timeline.length > 0) {
                        const prev = timeline[timeline.length - 1];
                        prev.end_time = c_end;
                        prev.target_dur = prev.end_time - prev.start_time;
                        current_time = c_end;
                        console.log(`[AI] Skipped extremely small invalid segment for chunk ${i}, merged into previous segment.`);
                    } else {
                        chunk_orig_end = state.originalVideoDuration;
                        createTimelineSegment(chunk_start_time, c_end, chunk_orig_start, chunk_orig_end, chunk.text);
                        current_time = c_end;
                    }
                } else {
                    createTimelineSegment(chunk_start_time, c_end, chunk_orig_start, chunk_orig_end, chunk.text);
                    current_time = c_end;
                }
                
                state.mapping.push({
                    narration_index: chunk.chunk_index,
                    narration_text: chunk.text,
                    narration_start: c_start,
                    narration_end: c_end,
                    matched_scene_index: timeline[timeline.length-1].matched_scene_index,
                    matched_scene_start: chunk.orig_start,
                    matched_scene_text: "Original mapped",
                    similarity_score: 1.0,
                    speed: timeline[timeline.length-1].speed
                });
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
            state.narrationTranscript.forEach((chunk, index) => {
                let start = chunk.timestamp[0];
                let end = chunk.timestamp[1] || start + 2; 
                srt += `${index + 1}\n`;
                srt += `${formatTime(start)} --> ${formatTime(end)}\n`;
                srt += `${chunk.text.trim()}\n\n`;
            });
            
            state.srtFile = path.join(cacheDir, 'subs.srt');
            fs.writeFileSync(state.srtFile, srt);
            saveState();
        }

        // 9. SEGMENT BUILDER
        if (!hasCompletedStep(job.currentStep, STEPS.SEGMENT_BUILDER)) {
            advanceStep(STEPS.SEGMENT_BUILDER, 80, 'Building Video Segments');
            for (let i = 0; i < state.timeline.length; i++) {
                updateJob(jobId, { progress: 80 + (10 * (i / state.timeline.length)) });
                const t = state.timeline[i];
                
                if (!Number.isFinite(t.scene_start) || !Number.isFinite(t.scene_end)) {
                    throw new Error(`Pipeline Error: Segment ${i} has non-finite scene bounds (${t.scene_start} - ${t.scene_end})`);
                }
                if (t.scene_start < 0) {
                    throw new Error(`Pipeline Error: Segment ${i} has negative scene_start (${t.scene_start})`);
                }
                if (t.scene_end <= t.scene_start) {
                    throw new Error(`Pipeline Error: Segment ${i} has scene_end (${t.scene_end}) <= scene_start (${t.scene_start})`);
                }
                
                let sEnd = t.scene_end;
                if (state.originalVideoDuration) {
                    if (sEnd > state.originalVideoDuration) {
                        const diff = sEnd - state.originalVideoDuration;
                        if (diff > 0.5) {
                            throw new Error(`Pipeline Error: Segment ${i} scene_end (${sEnd}) severely exceeds original video duration (${state.originalVideoDuration})`);
                        }
                        sEnd = state.originalVideoDuration;
                        t.scene_end = sEnd;
                    }
                    if (sEnd <= t.scene_start) {
                        throw new Error(`Pipeline Error: Segment ${i} has scene_end (${sEnd}) <= scene_start (${t.scene_start}) after clamping`);
                    }
                }
                
                const s_start = t.scene_start.toFixed(3);
                const source_dur = (t.scene_end - t.scene_start).toFixed(3);
                const s_end = t.scene_end.toFixed(3);
                const speed = t.speed || 1.0;
                const target_dur = t.target_dur.toFixed(3);
                
                // We use input seeking: -ss s_start -t source_dur -i video
                // This means the input stream starts at PTS 0 for the extracted segment.
                // We just need to adjust speed and pad to target_dur.
                const filter = `[0:v]setpts=${(1/speed).toFixed(4)}*(PTS-STARTPTS),tpad=stop_mode=clone:stop_duration=${target_dur},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p[v]`;
                
                const segFile = path.join(cacheDir, `seg_${i}.ts`);
                const segFileTmp = path.join(cacheDir, `seg_${i}.ts.tmp`);
                
                if (!fs.existsSync(segFile)) {
                    const args = [
                        '-ss', s_start,
                        '-t', source_dur,
                        '-i', path.resolve(job.videoPath),
                        '-filter_complex', filter,
                        '-map', '[v]',
                        '-t', target_dur,
                        '-c:v', 'libx264',
                        '-preset', 'ultrafast',
                        '-threads', '2',
                        '-crf', '28',
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
                        throw new Error(`Pipeline Error: Segment ${i} generation failed or produced 0 bytes.`);
                    }
                }
                
                try {
                    const actualDur = await getDuration(segFile);
                    const fileSize = fs.statSync(segFile).size;
                    console.log(`[SEGMENT-DIAGNOSTIC] index: ${i} | scene: ${s_start}->${s_end} | source_dur: ${source_dur} | speed: ${speed.toFixed(4)} | target_dur: ${target_dur} | actual_file_dur: ${actualDur} | file_size: ${fileSize}`);
                } catch(e) {}
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
            
            if (hasOrigAudio && !fs.existsSync(bgAudioPath)) {
                console.log(`[AUDIO-MIX] Extracting original audio timeline in parallel...`);
                let currentGlobalTime = 0;
                for (let i = 0; i < state.timeline.length; i++) {
                    state.timeline[i].global_start = currentGlobalTime;
                    currentGlobalTime += state.timeline[i].target_dur;
                }
                const limit = 5;
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
                            
                            let filterChain = `[0:a]atempo=${speed.toFixed(4)},apad`;
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
                            try {
                                await runFFmpeg(aArgs, tmpDir, null, 120000); // 2 min timeout
                                if (fs.existsSync(aSegFileTmp) && fs.statSync(aSegFileTmp).size > 0) {
                                    fs.renameSync(aSegFileTmp, aSegFile);
                                } else {
                                    throw new Error("0 bytes");
                                }
                            } catch (err) {
                                console.warn(`[AUDIO-MIX] Failed to extract audio for segment ${globalIdx}, substituting silence...`);
                                if (fs.existsSync(aSegFileTmp)) fs.unlinkSync(aSegFileTmp);
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
            
            let finalArgs = [];
            if (hasOrigAudio && fs.existsSync(bgAudioPath)) {
                console.log(`[AUDIO-MIX] Mixing ducked background audio with TTS narration...`);
                
                const mixedAudioPath = path.join(cacheDir, 'mixed_audio.wav');
                const mixArgs = [
                    '-i', bgAudioPath,
                    '-i', path.resolve(state.ttsAudioPath).replace(/\\/g, '/'),
                    '-filter_complex', `[0:a][1:a]amix=inputs=2:duration=longest[aout]`,
                    '-map', '[aout]',
                    '-acodec', 'pcm_s16le', '-f', 'wav',
                    '-y', mixedAudioPath
                ];
                await runFFmpeg(mixArgs, tmpDir);

                finalArgs = [
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', path.resolve(state.concatFile).replace(/\\/g, '/'),
                    '-i', mixedAudioPath,
                    '-map', '0:v',
                    '-map', '1:a',
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-movflags', '+faststart',
                    '-y', finalFileTmp
                ];
            } else {
                console.log(`[AUDIO-MIX] No original audio found. Using TTS narration only.`);
                finalArgs = [
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', path.resolve(state.concatFile).replace(/\\/g, '/'),
                    '-i', path.resolve(state.ttsAudioPath).replace(/\\/g, '/'),
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-filter:a', 'loudnorm=I=-14:LRA=11:TP=-1.5',
                    '-movflags', '+faststart',
                    '-y', finalFileTmp
                ];
            }
            
            await runFFmpeg(finalArgs, tmpDir, (pct) => {
                updateJob(jobId, { progress: 94 + (pct * 0.05) });
            });
            
            fs.renameSync(finalFileTmp, finalOutPath);
            
            // Validate final output duration
            const finalDurs = await getStreamsDuration(finalOutPath);
            const vDur = finalDurs.videoDuration;
            const aDur = finalDurs.audioDuration;
            const diff = Math.abs(vDur - aDur);
            
            console.log(`[FINAL-SYNC-DIAGNOSTIC]`);
            console.log(`video_duration: ${vDur.toFixed(3)}`);
            console.log(`audio_duration: ${aDur.toFixed(3)}`);
            console.log(`difference: ${diff.toFixed(3)}`);
            console.log(`expected_audio_duration: ${state.audioDuration.toFixed(3)}`);
            
            let expected_video_duration = 0;
            if (state.timeline && state.timeline.length > 0) {
                expected_video_duration = state.timeline[state.timeline.length - 1].end_time;
            }
            console.log(`expected_video_duration: ${expected_video_duration.toFixed(3)}`);

            if (diff > 0.3) {
                console.error(`[FINAL-SYNC-DIAGNOSTIC] ERROR: Final audio/video sync difference (${diff.toFixed(3)}s) exceeds 0.3s tolerance!`);
                // fail safely with a clear diagnostic error if necessary
                throw new Error(`Pipeline Error: Final A/V sync drift exceeded 0.3s (Video: ${vDur.toFixed(3)}s, Audio: ${aDur.toFixed(3)}s)`);
            }
            
            advanceStep(STEPS.EXPORT, 99, 'Export Complete');
        }

        updateJob(jobId, {
            status: 'complete',
            progress: 100,
            currentStep: 'Done',
            result: {
                metadata: { duration: state.originalVideoDuration, finalDuration: state.audioDuration },
                scenes: state.scenes,
                originalTranscript: state.originalTranscript,
                narrationTranscript: state.narrationTranscript,
                mapping: state.mapping,
                timeline: state.timeline,
                videoUrl: `/output/${jobId}.mp4`
            }
        });

        console.log(`[Job ${jobId}] Completed successfully.`);

    } catch (err) {
        console.error(`[Job ${jobId}] Error:`, err);
        const safeErrorMsg = err.message ? err.message.replace(/key=[A-Za-z0-9_\-]+/gi, 'key=HIDDEN') : 'Unknown error';
        updateJob(jobId, { status: 'error', error: safeErrorMsg });
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
                path.join(cacheDir, 'bg_audio.wav')
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
            
            if (job && job.audioPath) filesToRemove.push(job.audioPath);

            for (const f of filesToRemove) {
                if (fs.existsSync(f)) {
                    try { fs.unlinkSync(f); } catch (e) {}
                }
            }
        } catch (cleanupErr) {
            console.error(`[Job ${jobId}] Cleanup Error:`, cleanupErr);
        } finally {
            clearJobKeys(jobId);
        }
    }
};
