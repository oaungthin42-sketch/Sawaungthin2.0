import fs from 'fs';

let content = fs.readFileSync('src/workers/processor.js', 'utf8');

const searchStr1 = `            const createTimelineSegment = (start, end, scene_start, scene_end, text) => {
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
            };`;

const replaceStr1 = `            const createTimelineSegment = (start, end, scene_start, scene_end, text) => {
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
            };`;

const searchStr2 = `                if (c_start > current_time) {
                    // Gap
                    createTimelineSegment(current_time, c_start, chunk.orig_start, chunk.orig_start, "[Silence]");
                }`;

const replaceStr2 = `                if (c_start > current_time) {
                    // Gap
                    let gap_scene_start = i > 0 ? authTimeline[i-1].orig_end : 0;
                    let gap_scene_end = chunk.orig_start;
                    if (gap_scene_end < gap_scene_start) gap_scene_end = gap_scene_start + 0.1;
                    createTimelineSegment(current_time, c_start, gap_scene_start, gap_scene_end, "[Silence]");
                }`;

const searchStr3 = `            if (current_time < state.audioDuration) {
                const lastChunk = authTimeline[authTimeline.length - 1];
                let sEnd = lastChunk ? lastChunk.orig_end : state.originalVideoDuration;
                createTimelineSegment(current_time, state.audioDuration, sEnd, sEnd, "[Silence]");
            }`;

const replaceStr3 = `            if (current_time < state.audioDuration) {
                const lastChunk = authTimeline[authTimeline.length - 1];
                let sEnd = lastChunk ? lastChunk.orig_end : state.originalVideoDuration;
                createTimelineSegment(current_time, state.audioDuration, sEnd, state.originalVideoDuration, "[Silence]");
            }`;


if (content.includes(searchStr1)) {
    content = content.replace(searchStr1, replaceStr1);
    content = content.replace(searchStr2, replaceStr2);
    content = content.replace(searchStr3, replaceStr3);
    fs.writeFileSync('src/workers/processor.js', content);
    console.log("Timeline validation patched successfully.");
} else {
    console.log("Could not find search strings.");
}

