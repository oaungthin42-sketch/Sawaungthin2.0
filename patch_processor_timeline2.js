import fs from 'fs';
import path from 'path';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const searchPointStart = `        // 6. SEMANTIC MATCHING & 7. TIMELINE BUILDER
        if (!hasCompletedStep(job.currentStep, STEPS.TIMELINE_BUILDER)) {
            advanceStep(STEPS.SEMANTIC_MATCHING, 55, 'Semantic & Chronological Matching');`;

const searchPointEnd = `            advanceStep(STEPS.TIMELINE_BUILDER, 70, 'Timeline Built');
        }`;

// Find indices
const startIdx = content.indexOf(searchPointStart);
const endIdx = content.indexOf(searchPointEnd) + searchPointEnd.length;

if (startIdx !== -1 && endIdx !== -1) {
    const replacement = `        // 6. SEMANTIC MATCHING & 7. TIMELINE BUILDER
        if (!hasCompletedStep(job.currentStep, STEPS.TIMELINE_BUILDER)) {
            advanceStep(STEPS.SEMANTIC_MATCHING, 55, 'Semantic & Chronological Matching');
            
            const timelinePath = ttsAudioPath + '.timeline.json';
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
                let desired_orig_dur = scene_end - scene_start;
                if (target_dur <= 0.001) return;
                
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
                
                if (c_start > current_time) {
                    // Gap
                    createTimelineSegment(current_time, c_start, chunk.orig_start, chunk.orig_start, "[Silence]");
                }
                
                createTimelineSegment(c_start, c_end, chunk.orig_start, chunk.orig_end, chunk.text);
                
                current_time = c_end;
                
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
                let sEnd = lastChunk ? lastChunk.orig_end : state.originalVideoDuration;
                createTimelineSegment(current_time, state.audioDuration, sEnd, sEnd, "[Silence]");
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
                        throw new Error(\`Validation failed: Unrepairable gap/overlap between segment \${i-1} and \${i} (\${t.start_time - prev.end_time}).\`);
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
        }`;
    
    content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
    fs.writeFileSync('src/workers/processor.js', content);
    console.log("Processor timeline logic updated.");
} else {
    console.log("Search points not found.");
}
