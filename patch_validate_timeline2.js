import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const searchStr1 = `            const createTimelineSegment = (start, end, scene_start, scene_end, text) => {
                let target_dur = end - start;
                if (target_dur <= 0.001) return;
                
                if (!Number.isFinite(scene_start)) scene_start = 0;
                if (!Number.isFinite(scene_end)) scene_end = scene_start + 0.1;
                
                if (scene_end <= scene_start) {
                    const old_scene_end = scene_end;
                    scene_end = scene_start + 0.1;
                    console.log(\`[AI] Adjusted invalid scene boundary for "\${text}": start=\${scene_start}, end=\${old_scene_end} -> \${scene_end}\`);
                }
                
                if (scene_end > state.originalVideoDuration) {
                    scene_end = state.originalVideoDuration;
                    if (scene_start >= scene_end) {
                        scene_start = Math.max(0, scene_end - 0.1);
                    }
                }
                
                let desired_orig_dur = scene_end - scene_start;`;

const replaceStr1 = `            const createTimelineSegment = (start, end, scene_start, scene_end, text) => {
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
                    throw new Error(\`Pipeline Error: Invalid scene boundaries passed to createTimelineSegment (\${scene_start} -> \${scene_end}) for text: "\${text}"\`);
                }
                
                let desired_orig_dur = scene_end - scene_start;`;

const searchStr2 = `            for (let i = 0; i < authTimeline.length; i++) {
                const chunk = authTimeline[i];
                let c_start = chunk.final_audio_start;
                let c_end = chunk.final_audio_end;
                
                if (c_start > current_time) {
                    // Gap
                    let gap_scene_start = i > 0 ? authTimeline[i-1].orig_end : 0;
                    let gap_scene_end = chunk.orig_start;
                    if (gap_scene_end < gap_scene_start) gap_scene_end = gap_scene_start + 0.1;
                    createTimelineSegment(current_time, c_start, gap_scene_start, gap_scene_end, "[Silence]");
                }
                
                createTimelineSegment(c_start, c_end, chunk.orig_start, chunk.orig_end, chunk.text);
                
                current_time = c_end;
                
                state.mapping.push({`;

const replaceStr2 = `            for (let i = 0; i < authTimeline.length; i++) {
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
                        console.log(\`[AI] Skipped zero-duration gap video before chunk \${i}, merged audio silence into chunk video.\`);
                    }
                }
                
                let chunk_orig_start = chunk.orig_start;
                let chunk_orig_end = chunk.orig_end;
                
                if (!Number.isFinite(chunk_orig_start)) chunk_orig_start = 0;
                if (!Number.isFinite(chunk_orig_end)) chunk_orig_end = chunk_orig_start;
                
                if (chunk_orig_end <= chunk_orig_start) {
                    let recovered_end = -1;
                    for (let j = i + 1; j < authTimeline.length; j++) {
                        if (Number.isFinite(authTimeline[j].orig_start) && authTimeline[j].orig_start > chunk_orig_start) {
                            recovered_end = authTimeline[j].orig_start;
                            break;
                        }
                    }
                    if (recovered_end !== -1) {
                        chunk_orig_end = recovered_end;
                        console.log(\`[AI] Recovered invalid scene boundary for chunk \${i}: start=\${chunk_orig_start}, new_end=\${chunk_orig_end}\`);
                    } else {
                        chunk_orig_end = state.originalVideoDuration;
                        console.log(\`[AI] Recovered invalid scene boundary for chunk \${i}: start=\${chunk_orig_start}, new_end=video_end(\${chunk_orig_end})\`);
                    }
                }
                
                if (chunk_orig_end - chunk_orig_start < 0.05) {
                    if (timeline.length > 0) {
                        const prev = timeline[timeline.length - 1];
                        prev.end_time = c_end;
                        prev.target_dur = prev.end_time - prev.start_time;
                        current_time = c_end;
                        console.log(\`[AI] Skipped extremely small invalid segment for chunk \${i}, merged into previous segment.\`);
                    } else {
                        chunk_orig_end = state.originalVideoDuration;
                        createTimelineSegment(chunk_start_time, c_end, chunk_orig_start, chunk_orig_end, chunk.text);
                        current_time = c_end;
                    }
                } else {
                    createTimelineSegment(chunk_start_time, c_end, chunk_orig_start, chunk_orig_end, chunk.text);
                    current_time = c_end;
                }
                
                state.mapping.push({`;

const searchStr3 = `            if (current_time < state.audioDuration) {
                const lastChunk = authTimeline[authTimeline.length - 1];
                let sEnd = lastChunk ? lastChunk.orig_end : state.originalVideoDuration;
                createTimelineSegment(current_time, state.audioDuration, sEnd, state.originalVideoDuration, "[Silence]");
            }`;

const replaceStr3 = `            if (current_time < state.audioDuration) {
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
            }`;

if (content.includes(searchStr1)) {
    content = content.replace(searchStr1, replaceStr1);
    content = content.replace(searchStr2, replaceStr2);
    content = content.replace(searchStr3, replaceStr3);
    fs.writeFileSync('src/workers/processor.js', content);
    console.log("Timeline root cause validation patched successfully.");
} else {
    console.log("Could not find search strings.");
}

